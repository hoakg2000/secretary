import { CalendarSyncService } from './calendar-sync.service';

const EVENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GOOGLE_ID = EVENT_ID.replace(/-/g, '');
const READ_AT = new Date('2026-10-13T00:00:00Z');

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

function dirtyState(overrides: any = {}) {
  const { localEvent, ...state } = overrides;
  return {
    id: 'state1',
    localEventId: EVENT_ID,
    googleEventId: null,
    updatedAt: READ_AT,
    localEvent: {
      id: EVENT_ID,
      title: 'Họp',
      description: null,
      location: null,
      startTime: new Date('2026-10-15T09:00:00Z'),
      endTime: new Date('2026-10-15T10:00:00Z'),
      deletedAt: null,
      ...localEvent,
    },
    ...state,
  };
}

function build(states: any[]) {
  const events = {
    insert: vi.fn().mockResolvedValue({ data: { etag: 'e1' } }),
    patch: vi.fn().mockResolvedValue({ data: { etag: 'e2' } }),
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma: any = {
    calendarSyncState: {
      findMany: vi.fn().mockResolvedValue(states),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    localCalendar: { delete: vi.fn() },
  };
  const service = new CalendarSyncService(prisma, {} as any, {} as any, {} as any);
  vi.spyOn(service as any, 'getGoogleCalendarClient').mockResolvedValue({ events });
  return { events, prisma, service };
}

describe('CalendarSyncService.syncLocalToGoogle', () => {
  it('inserts with a client-supplied id and stores it', async () => {
    const { events, prisma, service } = build([dirtyState()]);

    await expect(service.syncLocalToGoogle()).resolves.toMatchObject({ pushed: 1, failed: 0 });

    expect(events.insert.mock.calls[0][0].requestBody.id).toBe(GOOGLE_ID);
    expect(events.patch).not.toHaveBeenCalled();
    expect(prisma.calendarSyncState.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'state1', updatedAt: READ_AT },
      data: { googleEventId: GOOGLE_ID, eTag: 'e1', syncStatus: 'SYNCED' },
    });
  });

  it('retry after a lost DB write: 409 on insert continues as an update, no duplicate', async () => {
    const { events, service } = build([dirtyState()]);
    events.insert.mockRejectedValue(httpError(409));

    await expect(service.syncLocalToGoogle()).resolves.toMatchObject({ pushed: 1 });

    expect(events.insert).toHaveBeenCalledTimes(1);
    expect(events.patch.mock.calls[0][0].eventId).toBe(GOOGLE_ID);
  });

  it('patches only locally owned fields (no attendees) on update', async () => {
    const { events, service } = build([dirtyState({ googleEventId: 'g1' })]);
    await service.syncLocalToGoogle();

    expect(events.insert).not.toHaveBeenCalled();
    expect(Object.keys(events.patch.mock.calls[0][0].requestBody).sort()).toEqual(
      ['description', 'end', 'location', 'start', 'summary'],
    );
  });

  it('410 on update clears the Google id and stops retrying', async () => {
    const { events, prisma, service } = build([dirtyState({ googleEventId: 'g1' })]);
    events.patch.mockRejectedValue(httpError(410));

    await expect(service.syncLocalToGoogle()).resolves.toMatchObject({
      removedRemotely: 1,
      failed: 0,
    });
    expect(prisma.calendarSyncState.updateMany.mock.calls[0][0].data).toMatchObject({
      googleEventId: null,
      syncStatus: 'SYNCED',
    });
  });

  it('an edit during the sync leaves the row DIRTY but keeps the Google id', async () => {
    const { prisma, service } = build([dirtyState()]);
    prisma.calendarSyncState.updateMany.mockResolvedValueOnce({ count: 0 });

    await service.syncLocalToGoogle();

    const fallback = prisma.calendarSyncState.updateMany.mock.calls[1][0];
    expect(fallback.where).toEqual({ id: 'state1' });
    expect(fallback.data).toEqual({ googleEventId: GOOGLE_ID, eTag: 'e1' });
  });

  it('soft-deleted row is deleted on Google (404 tolerated) and then removed locally', async () => {
    const { events, prisma, service } = build([
      dirtyState({ googleEventId: 'g1', localEvent: { deletedAt: new Date() } }),
    ]);
    events.delete.mockRejectedValue(httpError(404));

    await expect(service.syncLocalToGoogle()).resolves.toMatchObject({ deleted: 1 });

    expect(events.delete.mock.calls[0][0].eventId).toBe('g1');
    expect(prisma.localCalendar.delete).toHaveBeenCalledWith({ where: { id: EVENT_ID } });
  });

  it('counts other errors as failed and keeps going; skips when already running', async () => {
    const { events, service } = build([dirtyState(), dirtyState({ id: 'state2' })]);
    events.insert.mockRejectedValueOnce(httpError(500));

    await expect(service.syncLocalToGoogle()).resolves.toMatchObject({ pushed: 1, failed: 1 });

    (service as any).running = true;
    await expect(service.syncLocalToGoogle()).resolves.toBeNull();
  });
});
