import { BadRequestException, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleClientFactory } from '../../src/auth/google-client.factory';
import { CalendarSyncService } from '../../src/calendar/calendar-sync.service';
import { CalendarService } from '../../src/calendar/calendar.service';
import { createTestModule, httpError, resetDb, seedUser, TestContext } from './harness';

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 15, hour, minute));
const event = (overrides: any = {}) => ({
  title: 'Meeting',
  startTime: at(9),
  endTime: at(10),
  ...overrides,
});

let ctx: TestContext;
let calendar: CalendarService;

beforeAll(async () => {
  ctx = await createTestModule();
  calendar = ctx.moduleRef.get(CalendarService);
});
beforeEach(() => resetDb(ctx.prisma));
afterAll(() => ctx.moduleRef.close());

const stateOf = (localEventId: string) =>
  ctx.prisma.calendarSyncState.findUnique({ where: { localEventId } });

describe('CalendarService (integration)', () => {
  it('createEvent creates a DIRTY sync state and rejects an invalid range', async () => {
    const created = await calendar.createEvent(event());
    expect(await stateOf(created.id)).toMatchObject({ syncStatus: 'DIRTY', googleEventId: null });

    await expect(calendar.createEvent(event({ endTime: at(9) }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await ctx.prisma.localCalendar.count()).toBe(1);
    expect(await ctx.prisma.calendarSyncState.count()).toBe(1);
  });

  it('getEvents returns overlapping events ordered by start, without soft-deleted ones', async () => {
    const late = await calendar.createEvent(event({ startTime: at(11), endTime: at(12) }));
    const early = await calendar.createEvent(event());
    const deleted = await calendar.createEvent(event());
    await ctx.prisma.localCalendar.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    const ids = async (query: any) => (await calendar.getEvents(query)).map((e) => e.id);

    expect(await ids({})).toEqual([early.id, late.id]);
    // Both bounds are inclusive
    expect(await ids({ fromDate: at(10), toDate: at(11) })).toEqual([early.id, late.id]);
    expect(await ids({ fromDate: at(10, 1), toDate: at(10, 59) })).toEqual([]);
    expect(await ids({ fromDate: at(10, 1) })).toEqual([late.id]);
    expect(await ids({ toDate: at(10, 59) })).toEqual([early.id]);
  });

  it('updateEvent marks the sync state DIRTY and clears remindedAt only when the start changes', async () => {
    const created = await calendar.createEvent(event());
    const syncedAt = new Date(Date.now() - 60_000);
    await ctx.prisma.localCalendar.update({
      where: { id: created.id },
      data: {
        remindedAt: new Date(),
        syncState: { update: { syncStatus: 'SYNCED', updatedAt: syncedAt } },
      },
    });

    await calendar.updateEvent(created.id, { title: 'Renamed' });

    const state = await stateOf(created.id);
    expect(state?.syncStatus).toBe('DIRTY');
    expect(state?.updatedAt.getTime()).toBeGreaterThan(syncedAt.getTime());
    expect(
      (await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: created.id } })).remindedAt,
    ).not.toBeNull();

    // Partial update: the new end is checked against the stored start
    await expect(calendar.updateEvent(created.id, { endTime: at(8) })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await calendar.updateEvent(created.id, { startTime: at(9, 30) });
    expect(await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      title: 'Renamed',
      startTime: at(9, 30),
      endTime: at(10),
      remindedAt: null,
    });
  });

  it('deleteEvent hard-deletes a never-pushed event and soft-deletes a pushed one', async () => {
    const local = await calendar.createEvent(event());
    const pushed = await calendar.createEvent(event());
    await ctx.prisma.calendarSyncState.update({
      where: { localEventId: pushed.id },
      data: { googleEventId: 'g1', syncStatus: 'SYNCED' },
    });

    await calendar.deleteEvent(local.id);
    await calendar.deleteEvent(pushed.id);

    expect(await ctx.prisma.localCalendar.findUnique({ where: { id: local.id } })).toBeNull();
    expect(await stateOf(local.id)).toBeNull();
    expect(
      (await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: pushed.id } })).deletedAt,
    ).not.toBeNull();
    expect(await stateOf(pushed.id)).toMatchObject({ syncStatus: 'DIRTY', googleEventId: 'g1' });
    await expect(calendar.getEventById(pushed.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CalendarSyncService (integration)', () => {
  let sync: CalendarSyncService;
  let events: { insert: any; patch: any; delete: any };
  let googleCalendar: any;

  beforeAll(() => {
    sync = ctx.moduleRef.get(CalendarSyncService);
  });
  beforeEach(() => {
    events = {
      insert: vi.fn(async (_params: any) => ({ data: { etag: 'e1' } })),
      patch: vi.fn(async (_params: any) => ({ data: { etag: 'e2' } })),
      delete: vi.fn(async (_params: any) => ({})),
    };
    googleCalendar = vi.spyOn(google, 'calendar');
    googleCalendar.mockClear();
    googleCalendar.mockReturnValue({ events });
  });

  const connectGoogle = async () => {
    const user = await seedUser(ctx.prisma);
    await ctx.moduleRef.get(GoogleClientFactory).saveTokens(user.id, {
      access_token: 'access',
      refresh_token: 'refresh',
      expiry_date: Date.now() + 3600 * 1000,
    });
  };

  const seedPushed = async (googleEventId: string) => {
    const created = await calendar.createEvent(event());
    await ctx.prisma.calendarSyncState.update({
      where: { localEventId: created.id },
      data: { googleEventId },
    });
    return created;
  };

  it('does nothing when no user is connected to Google', async () => {
    await seedUser(ctx.prisma);
    const created = await calendar.createEvent(event());

    await expect(sync.syncLocalToGoogle()).resolves.toBeNull();

    expect(googleCalendar).not.toHaveBeenCalled();
    expect(await stateOf(created.id)).toMatchObject({ syncStatus: 'DIRTY' });
  });

  it('inserts a new event with the local ID without dashes and marks it SYNCED', async () => {
    await connectGoogle();
    const created = await calendar.createEvent(event());
    const googleEventId = created.id.replace(/-/g, '');

    await expect(sync.syncLocalToGoogle()).resolves.toMatchObject({ pushed: 1, failed: 0 });

    expect(events.insert.mock.calls[0][0].requestBody).toMatchObject({
      id: googleEventId,
      summary: 'Meeting',
      start: { dateTime: at(9).toISOString() },
    });
    const state = await stateOf(created.id);
    expect(state).toMatchObject({ syncStatus: 'SYNCED', googleEventId, eTag: 'e1' });
    expect(state?.lastSyncedAt).not.toBeNull();
  });

  it('patches a known event, and an event whose insert answers 409', async () => {
    await connectGoogle();
    const known = await seedPushed('g-known');

    await sync.syncLocalToGoogle();

    expect(events.insert).not.toHaveBeenCalled();
    expect(events.patch.mock.calls[0][0]).toMatchObject({ eventId: 'g-known' });
    expect(await stateOf(known.id)).toMatchObject({
      syncStatus: 'SYNCED',
      googleEventId: 'g-known',
      eTag: 'e2',
    });

    const retried = await calendar.createEvent(event());
    events.insert.mockRejectedValueOnce(httpError(409));

    await expect(sync.syncLocalToGoogle()).resolves.toMatchObject({ pushed: 1, failed: 0 });

    expect(await stateOf(retried.id)).toMatchObject({
      syncStatus: 'SYNCED',
      googleEventId: retried.id.replace(/-/g, ''),
      eTag: 'e2',
    });
  });

  it('removes a soft-deleted event on Google then locally, also when Google answers 404', async () => {
    await connectGoogle();
    const first = await seedPushed('g-first');
    const second = await seedPushed('g-second');
    await calendar.deleteEvent(first.id);
    await calendar.deleteEvent(second.id);
    events.delete.mockRejectedValueOnce(httpError(404));

    await expect(sync.syncLocalToGoogle()).resolves.toMatchObject({ deleted: 2, failed: 0 });

    expect(events.delete.mock.calls.map((call: any[]) => call[0].eventId).sort()).toEqual([
      'g-first',
      'g-second',
    ]);
    expect(await ctx.prisma.localCalendar.count()).toBe(0);
    expect(await ctx.prisma.calendarSyncState.count()).toBe(0);
  });

  it('stops syncing an event that was removed on Google', async () => {
    await connectGoogle();
    const created = await seedPushed('g-gone');
    events.patch.mockRejectedValueOnce(httpError(404));

    await expect(sync.syncLocalToGoogle()).resolves.toMatchObject({ removedRemotely: 1, pushed: 0 });

    expect(await stateOf(created.id)).toMatchObject({ syncStatus: 'SYNCED', googleEventId: null });
    expect(await ctx.prisma.localCalendar.count()).toBe(1);
  });

  it('keeps an event DIRTY when it is edited while the Google call is pending', async () => {
    await connectGoogle();
    const created = await calendar.createEvent(event());
    events.insert.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await calendar.updateEvent(created.id, { title: 'Edited during sync' });
      return { data: { etag: 'e1' } };
    });

    await sync.syncLocalToGoogle();

    expect(await stateOf(created.id)).toMatchObject({
      syncStatus: 'DIRTY',
      googleEventId: created.id.replace(/-/g, ''),
      lastSyncedAt: null,
    });
  });

  it('one failing event does not stop the next one', async () => {
    await connectGoogle();
    await calendar.createEvent(event());
    await calendar.createEvent(event());
    events.insert.mockRejectedValueOnce(httpError(500));

    await expect(sync.syncLocalToGoogle()).resolves.toMatchObject({ pushed: 1, failed: 1 });

    const states = await ctx.prisma.calendarSyncState.findMany();
    expect(states.map((s) => s.syncStatus).sort()).toEqual(['DIRTY', 'SYNCED']);
    expect(states.find((s) => s.syncStatus === 'DIRTY')?.googleEventId).toBeNull();
  });
});
