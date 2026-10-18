import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GoogleClientFactory } from '../../src/auth/google-client.factory';
import { CalendarSyncService } from '../../src/calendar/calendar-sync.service';
import { CalendarService } from '../../src/calendar/calendar.service';
import { CalendarTools } from '../../src/calendar/calendar.tools';
import { AiUpdateEventDto } from '../../src/calendar/dto/ai-update-event.dto';
import { QueryCalendarDto } from '../../src/calendar/dto/query-calendar.dto';
import { UpdateEventDto } from '../../src/calendar/dto/update-event.dto';
import { googleError, MISSING, overrideConfig, createTestModule, resetState, seedEvent, seedGoogleUser, type TestContext } from './harness';

const at = (iso: string) => new Date(iso);

describe('calendar integration', () => {
  let ctx: TestContext;
  let service: CalendarService;
  let sync: CalendarSyncService;
  let tools: CalendarTools;

  beforeAll(async () => {
    ctx = await createTestModule();
    service = ctx.moduleRef.get(CalendarService);
    sync = ctx.moduleRef.get(CalendarSyncService);
    tools = ctx.moduleRef.get(CalendarTools);
  });

  afterAll(() => ctx.close());

  beforeEach(() => resetState(ctx));

  const dto = (data: Record<string, unknown> = {}) => ({
    title: 'Standup',
    startTime: at('2030-01-01T09:00:00Z'),
    endTime: at('2030-01-01T10:00:00Z'),
    ...data,
  });
  const row = (id: string) =>
    ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id }, include: { syncState: true } });
  const rowOrNull = (id: string) => ctx.prisma.localCalendar.findUnique({ where: { id } });
  const googleUser = () => seedGoogleUser(ctx.prisma, ctx.moduleRef.get(GoogleClientFactory));
  /** event with a sync state; googleEventId set means it already exists on Google */
  const seedSynced = (
    event: Record<string, unknown> = {},
    state: Record<string, unknown> = { syncStatus: 'DIRTY' },
  ) => seedEvent(ctx.prisma, { ...event, syncState: { create: state } });

  // ---------------------------------------------------------------- CalendarService

  describe('createEvent', () => {
    it('persists the event with a DIRTY sync state and no Google id', async () => {
      const result = await service.createEvent(
        dto({ description: 'd', location: 'Room', intent: 'WORK', priorityStatus: 'HIGH', attendees: ['a@x.com'] }) as any,
      );

      expect(result.syncState).toMatchObject({ syncStatus: 'DIRTY', googleEventId: null });
      const saved = await row(result.id);
      expect(saved).toMatchObject({
        title: 'Standup',
        description: 'd',
        location: 'Room',
        intent: 'WORK',
        priorityStatus: 'HIGH',
        attendees: ['a@x.com'],
        deletedAt: null,
        remindedAt: null,
      });
      expect(saved.startTime).toEqual(at('2030-01-01T09:00:00Z'));
      expect(saved.syncState).toMatchObject({ syncStatus: 'DIRTY', googleEventId: null, lastSyncedAt: null });
    });

    it('rejects an end time before the start time with 400 and stores nothing', async () => {
      await expect(
        service.createEvent(dto({ endTime: at('2030-01-01T08:00:00Z') }) as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(await ctx.prisma.localCalendar.count()).toBe(0);
    });

    it('rejects an end time equal to the start time with 400', async () => {
      await expect(
        service.createEvent(dto({ endTime: at('2030-01-01T09:00:00Z') }) as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(await ctx.prisma.localCalendar.count()).toBe(0);
    });
  });

  describe('getEvents', () => {
    const seedAt = (title: string, start: string, end: string) =>
      seedEvent(ctx.prisma, { title, startTime: at(start), endTime: at(end) });
    const titles = (events: { title: string }[]) => events.map((e) => e.title);

    it('returns the whole month ordered by start time, excluding other months and years', async () => {
      await seedAt('late', '2030-03-20T10:00:00Z', '2030-03-20T11:00:00Z');
      await seedAt('early', '2030-03-02T10:00:00Z', '2030-03-02T11:00:00Z');
      await seedAt('april', '2030-04-10T10:00:00Z', '2030-04-10T11:00:00Z');
      await seedAt('other year', '2031-03-10T10:00:00Z', '2031-03-10T11:00:00Z');

      expect(titles(await service.getEvents({ month: 3, year: 2030 }))).toEqual(['early', 'late']);
    });

    it('draws month boundaries in APP_TIMEZONE (Asia/Ho_Chi_Minh, UTC+7)', async () => {
      // 16:59Z on Jan 31 = 23:59 Jan 31 local; 17:00Z = 00:00 Feb 1 local
      await seedAt('last of jan', '2030-01-31T16:59:00Z', '2030-01-31T16:59:30Z');
      await seedAt('first of feb', '2030-01-31T17:00:00Z', '2030-01-31T17:30:00Z');

      expect(titles(await service.getEvents({ month: 1, year: 2030 }))).toEqual(['last of jan']);
      expect(titles(await service.getEvents({ month: 2, year: 2030 }))).toEqual(['first of feb']);
    });

    it('uses the configured APP_TIMEZONE for the boundaries', async () => {
      overrideConfig(ctx, { APP_TIMEZONE: 'America/New_York' });
      // New York is UTC-5 in winter: Feb 1 00:00 local = 05:00Z
      await seedAt('last of jan', '2030-02-01T04:59:00Z', '2030-02-01T04:59:30Z');
      await seedAt('first of feb', '2030-02-01T05:00:00Z', '2030-02-01T05:30:00Z');

      expect(titles(await service.getEvents({ month: 2, year: 2030 }))).toEqual(['first of feb']);
    });

    it('handles December (the next-month boundary rolls into the next year)', async () => {
      await seedAt('dec', '2030-12-31T16:00:00Z', '2030-12-31T16:30:00Z');
      await seedAt('jan', '2030-12-31T17:00:00Z', '2030-12-31T17:30:00Z');

      expect(titles(await service.getEvents({ month: 12, year: 2030 }))).toEqual(['dec']);
    });

    it('includes an event spanning two months in both of them', async () => {
      await seedAt('span', '2030-01-30T00:00:00Z', '2030-02-03T00:00:00Z');

      expect(titles(await service.getEvents({ month: 1, year: 2030 }))).toEqual(['span']);
      expect(titles(await service.getEvents({ month: 2, year: 2030 }))).toEqual(['span']);
      expect(await service.getEvents({ month: 3, year: 2030 })).toEqual([]);
    });

    it('defaults to the current month and year in APP_TIMEZONE', async () => {
      await seedAt('now month', '2030-03-10T10:00:00Z', '2030-03-10T11:00:00Z');
      await seedAt('next month', '2030-04-10T10:00:00Z', '2030-04-10T11:00:00Z');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(at('2030-03-15T12:00:00Z'));
      expect(titles(await service.getEvents({}))).toEqual(['now month']);

      // 18:00Z on Mar 31 is already April 1 in Ho Chi Minh
      vi.setSystemTime(at('2030-03-31T18:00:00Z'));
      expect(titles(await service.getEvents({}))).toEqual(['next month']);
      vi.useRealTimers();
    });

    it('fills the missing half from the current date', async () => {
      await seedAt('in march', '2030-03-10T10:00:00Z', '2030-03-10T11:00:00Z');
      await seedAt('in may', '2030-05-10T10:00:00Z', '2030-05-10T11:00:00Z');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(at('2030-03-15T12:00:00Z'));

      expect(titles(await service.getEvents({ month: 5 }))).toEqual(['in may']);
      expect(titles(await service.getEvents({ year: 2030 }))).toEqual(['in march']);
      vi.useRealTimers();
    });

    it('hides soft-deleted events', async () => {
      await seedEvent(ctx.prisma, { title: 'gone', deletedAt: new Date() });
      await seedEvent(ctx.prisma, { title: 'kept' });

      expect(titles(await service.getEvents({ month: 1, year: 2030 }))).toEqual(['kept']);
    });

    it('returns an empty list when nothing matches', async () => {
      expect(await service.getEvents({ month: 1, year: 2030 })).toEqual([]);
    });

    it('validates month and year in the DTO', async () => {
      const bad = [{ month: 0 }, { month: 13 }, { month: 1.5 }, { year: 1999 }, { year: 2101 }, { month: 'x' }];
      for (const query of bad) {
        const errors = await validate(plainToInstance(QueryCalendarDto, query));
        expect(errors.length, JSON.stringify(query)).toBeGreaterThan(0);
      }
      expect(await validate(plainToInstance(QueryCalendarDto, { month: '12', year: '2030' }))).toEqual([]);
    });
  });

  describe('getEventById', () => {
    it('returns the event with its sync state', async () => {
      const event = await seedSynced({ title: 'Find me' });

      const result = await service.getEventById(event.id);

      expect(result).toMatchObject({ id: event.id, title: 'Find me', syncState: { syncStatus: 'DIRTY' } });
    });

    it('throws 404 for an unknown id', async () => {
      await expect(service.getEventById(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 for a soft-deleted event', async () => {
      const event = await seedEvent(ctx.prisma, { deletedAt: new Date() });

      await expect(service.getEventById(event.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateEvent', () => {
    it('updates the fields and marks a SYNCED state DIRTY while keeping the Google id', async () => {
      const event = await seedSynced(
        { title: 'Old' },
        { syncStatus: 'SYNCED', googleEventId: 'g-1', lastSyncedAt: at('2030-01-01T00:00:00Z') },
      );

      const result = await service.updateEvent(event.id, { title: 'New', location: 'Hall' });

      expect(result).toMatchObject({ title: 'New', location: 'Hall' });
      const saved = await row(event.id);
      expect(saved).toMatchObject({ title: 'New', location: 'Hall' });
      expect(saved.syncState).toMatchObject({ syncStatus: 'DIRTY', googleEventId: 'g-1' });
    });

    it('bumps updatedAt', async () => {
      const event = await seedSynced();

      await service.updateEvent(event.id, { title: 'Changed' });

      expect((await row(event.id)).updatedAt.getTime()).toBeGreaterThan(event.updatedAt.getTime());
    });

    it('creates a DIRTY sync state when the event has none', async () => {
      const event = await seedEvent(ctx.prisma);

      await service.updateEvent(event.id, { title: 'With state' });

      expect((await row(event.id)).syncState).toMatchObject({ syncStatus: 'DIRTY', googleEventId: null });
    });

    it('resets remindedAt when the start time changes', async () => {
      const event = await seedEvent(ctx.prisma, { remindedAt: new Date() });

      await service.updateEvent(event.id, {
        startTime: at('2030-01-01T09:30:00Z'),
      });

      expect((await row(event.id)).remindedAt).toBeNull();
    });

    it('keeps remindedAt when the start time is not changed', async () => {
      const remindedAt = at('2030-01-01T08:00:00Z');
      const event = await seedEvent(ctx.prisma, { remindedAt });

      await service.updateEvent(event.id, { title: 'Renamed' });

      expect((await row(event.id)).remindedAt).toEqual(remindedAt);
    });

    it('rejects a new end time before the stored start time with 400 and leaves the row alone', async () => {
      const event = await seedSynced({ title: 'Stable' }, { syncStatus: 'SYNCED', googleEventId: 'g-1' });

      await expect(
        service.updateEvent(event.id, { endTime: at('2030-01-01T08:00:00Z') }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const saved = await row(event.id);
      expect(saved.endTime).toEqual(event.endTime);
      expect(saved.syncState?.syncStatus).toBe('SYNCED');
    });

    it('rejects a new start time after the stored end time with 400', async () => {
      const event = await seedEvent(ctx.prisma);

      await expect(
        service.updateEvent(event.id, { startTime: at('2030-01-01T11:00:00Z') }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects null on required fields in the PATCH and AI update DTOs; the row stays unchanged', async () => {
      const event = await seedSynced({ title: 'Stable' });

      for (const field of ['title', 'startTime', 'endTime']) {
        for (const Dto of [UpdateEventDto, AiUpdateEventDto]) {
          const errors = await validate(plainToInstance(Dto, { id: event.id, [field]: null }));
          expect(errors.map((e) => e.property), `${Dto.name}.${field}`).toContain(field);
        }
      }
      // nullable columns still accept null (clears the value); an empty body stays valid
      expect(await validate(plainToInstance(UpdateEventDto, { description: null, location: null }))).toEqual([]);
      expect(await validate(plainToInstance(UpdateEventDto, {}))).toEqual([]);
      expect((await row(event.id)).title).toBe('Stable');
    });

    it('throws 404 for an unknown id', async () => {
      await expect(service.updateEvent(MISSING, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 for a soft-deleted event', async () => {
      const event = await seedEvent(ctx.prisma, { deletedAt: new Date() });

      await expect(service.updateEvent(event.id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteEvent', () => {
    it('hard-deletes a never-synced event together with its sync state', async () => {
      const event = await seedSynced();

      const result = await service.deleteEvent(event.id);

      expect(result).toEqual({ success: true });
      expect(await rowOrNull(event.id)).toBeNull();
      expect(await ctx.prisma.calendarSyncState.count()).toBe(0);
    });

    it('hard-deletes an event that has no sync state', async () => {
      const event = await seedEvent(ctx.prisma);

      await service.deleteEvent(event.id);

      expect(await rowOrNull(event.id)).toBeNull();
    });

    it('soft-deletes an event already on Google, marks it DIRTY and hides it at once', async () => {
      const event = await seedSynced({}, { syncStatus: 'SYNCED', googleEventId: 'g-1' });

      const result = await service.deleteEvent(event.id);

      expect(result).toEqual({ success: true });
      const saved = await row(event.id);
      expect(saved.deletedAt).toBeInstanceOf(Date);
      expect(saved.syncState).toMatchObject({ syncStatus: 'DIRTY', googleEventId: 'g-1' });
      expect(await service.getEvents({ month: 1, year: 2030 })).toEqual([]);
      await expect(service.getEventById(event.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 for an unknown id', async () => {
      await expect(service.deleteEvent(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the event is already soft-deleted', async () => {
      const event = await seedSynced({ deletedAt: new Date() }, { syncStatus: 'DIRTY', googleEventId: 'g-1' });

      await expect(service.deleteEvent(event.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- CalendarSyncService

  describe('syncLocalToGoogle', () => {
    it('returns null and calls Google never when no user is connected to Google', async () => {
      await seedSynced();

      const result = await sync.syncLocalToGoogle();

      expect(result).toBeNull();
      expect(ctx.google.calendar.events.insert).not.toHaveBeenCalled();
      expect((await ctx.prisma.calendarSyncState.findFirstOrThrow()).syncStatus).toBe('DIRTY');
    });

    it('returns zero counts when there is nothing to sync', async () => {
      await googleUser();

      expect(await sync.syncLocalToGoogle()).toEqual({ pushed: 0, deleted: 0, removedRemotely: 0, failed: 0 });
    });

    it('inserts a new DIRTY event with a client-generated id, then stores id, etag and SYNCED', async () => {
      await googleUser();
      const event = await seedSynced({
        title: 'Lunch',
        description: 'with Ann',
        location: 'Cafe',
        startTime: at('2030-02-01T12:00:00Z'),
        endTime: at('2030-02-01T13:30:00Z'),
      });
      ctx.google.calendar.events.insert.mockResolvedValue({ data: { etag: '"etag-1"' } });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 1, deleted: 0, removedRemotely: 0, failed: 0 });
      const googleId = event.id.replace(/-/g, '');
      expect(ctx.google.calendar.events.insert).toHaveBeenCalledTimes(1);
      expect(ctx.google.calendar.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: {
          id: googleId,
          summary: 'Lunch',
          description: 'with Ann',
          location: 'Cafe',
          start: { dateTime: '2030-02-01T12:00:00.000Z' },
          end: { dateTime: '2030-02-01T13:30:00.000Z' },
        },
      });
      expect(ctx.google.calendar.events.patch).not.toHaveBeenCalled();
      const state = (await row(event.id)).syncState;
      expect(state).toMatchObject({ googleEventId: googleId, syncStatus: 'SYNCED', eTag: '"etag-1"' });
      expect(state?.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('sends null description and location for an event that has none', async () => {
      await googleUser();
      await seedSynced();
      ctx.google.calendar.events.insert.mockResolvedValue({ data: { etag: 'e' } });

      await sync.syncLocalToGoogle();

      const body = ctx.google.calendar.events.insert.mock.calls[0][0].requestBody;
      expect(body).toMatchObject({ summary: 'Meeting', description: null, location: null });
    });

    it('treats a 409 on insert as already created and patches instead', async () => {
      await googleUser();
      const event = await seedSynced();
      ctx.google.calendar.events.insert.mockRejectedValue(googleError(409));
      ctx.google.calendar.events.patch.mockResolvedValue({ data: { etag: '"etag-2"' } });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 1, deleted: 0, removedRemotely: 0, failed: 0 });
      const googleId = event.id.replace(/-/g, '');
      expect(ctx.google.calendar.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'primary', eventId: googleId }),
      );
      expect((await row(event.id)).syncState).toMatchObject({
        googleEventId: googleId,
        syncStatus: 'SYNCED',
        eTag: '"etag-2"',
      });
    });

    it('patches a DIRTY event that already has a Google id, without a body id', async () => {
      await googleUser();
      const event = await seedSynced(
        { title: 'Renamed', startTime: at('2030-03-01T08:00:00Z'), endTime: at('2030-03-01T09:00:00Z') },
        { syncStatus: 'DIRTY', googleEventId: 'g-9', eTag: 'old' },
      );
      ctx.google.calendar.events.patch.mockResolvedValue({ data: { etag: 'new' } });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 1, deleted: 0, removedRemotely: 0, failed: 0 });
      expect(ctx.google.calendar.events.insert).not.toHaveBeenCalled();
      expect(ctx.google.calendar.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'g-9',
        requestBody: {
          summary: 'Renamed',
          description: null,
          location: null,
          start: { dateTime: '2030-03-01T08:00:00.000Z' },
          end: { dateTime: '2030-03-01T09:00:00.000Z' },
        },
      });
      expect((await row(event.id)).syncState).toMatchObject({
        googleEventId: 'g-9',
        syncStatus: 'SYNCED',
        eTag: 'new',
      });
    });

    it('skips events whose state is already SYNCED', async () => {
      await googleUser();
      await seedSynced({}, { syncStatus: 'SYNCED', googleEventId: 'g-1' });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 0, deleted: 0, removedRemotely: 0, failed: 0 });
      expect(ctx.google.calendar.events.patch).not.toHaveBeenCalled();
    });

    it('deletes a soft-deleted event on Google and then removes the row', async () => {
      await googleUser();
      const event = await seedSynced({ deletedAt: new Date() }, { syncStatus: 'DIRTY', googleEventId: 'g-5' });
      ctx.google.calendar.events.delete.mockResolvedValue({});

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 0, deleted: 1, removedRemotely: 0, failed: 0 });
      expect(ctx.google.calendar.events.delete).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'g-5' });
      expect(await rowOrNull(event.id)).toBeNull();
      expect(await ctx.prisma.calendarSyncState.count()).toBe(0);
    });

    it.each([404, 410])('removes the row when Google answers %i on delete', async (status) => {
      await googleUser();
      const event = await seedSynced({ deletedAt: new Date() }, { syncStatus: 'DIRTY', googleEventId: 'g-5' });
      ctx.google.calendar.events.delete.mockRejectedValue(googleError(status));

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 0, deleted: 1, removedRemotely: 0, failed: 0 });
      expect(await rowOrNull(event.id)).toBeNull();
    });

    it('keeps the soft-deleted row and counts a failure when delete fails with 500', async () => {
      await googleUser();
      const event = await seedSynced({ deletedAt: new Date() }, { syncStatus: 'DIRTY', googleEventId: 'g-5' });
      ctx.google.calendar.events.delete.mockRejectedValue(googleError(500));

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 0, deleted: 0, removedRemotely: 0, failed: 1 });
      expect(await rowOrNull(event.id)).not.toBeNull();
      expect((await row(event.id)).syncState?.syncStatus).toBe('DIRTY');
    });

    it('removes a soft-deleted event that never reached Google without calling Google', async () => {
      await googleUser();
      const event = await seedSynced({ deletedAt: new Date() });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 0, deleted: 1, removedRemotely: 0, failed: 0 });
      expect(ctx.google.calendar.events.delete).not.toHaveBeenCalled();
      expect(await rowOrNull(event.id)).toBeNull();
    });

    it.each([404, 410])(
      'detaches the event and stops syncing it when patch answers %i (removed on Google)',
      async (status) => {
        await googleUser();
        const event = await seedSynced({}, { syncStatus: 'DIRTY', googleEventId: 'g-7', eTag: 'x' });
        ctx.google.calendar.events.patch.mockRejectedValue(googleError(status));

        const result = await sync.syncLocalToGoogle();

        expect(result).toEqual({ pushed: 0, deleted: 0, removedRemotely: 1, failed: 0 });
        const saved = await row(event.id);
        expect(saved.deletedAt).toBeNull();
        expect(saved.syncState).toMatchObject({ googleEventId: null, syncStatus: 'SYNCED' });
      },
    );

    it('reads the status from error.response.status and error.code too', async () => {
      await googleUser();
      await seedSynced({}, { syncStatus: 'DIRTY', googleEventId: 'g-1' });
      await seedSynced({ title: 'Second' }, { syncStatus: 'DIRTY', googleEventId: 'g-2' });
      ctx.google.calendar.events.patch
        .mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 404 } }))
        .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 410 }));

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 0, deleted: 0, removedRemotely: 2, failed: 0 });
    });

    it('counts one failing event and still syncs the others', async () => {
      await googleUser();
      const bad = await seedSynced({ title: 'bad' }, { syncStatus: 'DIRTY', googleEventId: 'g-bad' });
      const good = await seedSynced({ title: 'good' }, { syncStatus: 'DIRTY', googleEventId: 'g-good' });
      ctx.google.calendar.events.patch.mockImplementation(async ({ eventId }: { eventId: string }) => {
        if (eventId === 'g-bad') throw googleError(500);
        return { data: { etag: 'ok' } };
      });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 1, deleted: 0, removedRemotely: 0, failed: 1 });
      expect((await row(bad.id)).syncState?.syncStatus).toBe('DIRTY');
      expect((await row(good.id)).syncState).toMatchObject({ syncStatus: 'SYNCED', eTag: 'ok' });
    });

    it('retries a failed event on the next run', async () => {
      await googleUser();
      const event = await seedSynced({}, { syncStatus: 'DIRTY', googleEventId: 'g-1' });
      ctx.google.calendar.events.patch
        .mockRejectedValueOnce(googleError(503))
        .mockResolvedValueOnce({ data: { etag: 'e2' } });

      expect(await sync.syncLocalToGoogle()).toMatchObject({ pushed: 0, failed: 1 });
      expect(await sync.syncLocalToGoogle()).toMatchObject({ pushed: 1, failed: 0 });
      expect((await row(event.id)).syncState).toMatchObject({ syncStatus: 'SYNCED', eTag: 'e2' });
    });

    it('keeps the event DIRTY when it was edited during the Google call, but stores the Google id', async () => {
      await googleUser();
      const event = await seedSynced();
      ctx.google.calendar.events.insert.mockImplementation(async () => {
        // the user edits the event while the push is in flight
        await service.updateEvent(event.id, { title: 'Edited meanwhile' });
        return { data: { etag: 'e1' } };
      });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 1, deleted: 0, removedRemotely: 0, failed: 0 });
      const saved = await row(event.id);
      expect(saved.title).toBe('Edited meanwhile');
      expect(saved.syncState?.syncStatus).toBe('DIRTY');
      expect(saved.syncState?.googleEventId).toBe(event.id.replace(/-/g, ''));
    });

    it('patches (not inserts) on the run after an edit during sync', async () => {
      await googleUser();
      const event = await seedSynced();
      ctx.google.calendar.events.insert.mockImplementationOnce(async () => {
        await service.updateEvent(event.id, { title: 'Edited meanwhile' });
        return { data: { etag: 'e1' } };
      });
      ctx.google.calendar.events.patch.mockResolvedValue({ data: { etag: 'e2' } });

      await sync.syncLocalToGoogle();
      await sync.syncLocalToGoogle();

      expect(ctx.google.calendar.events.insert).toHaveBeenCalledTimes(1);
      expect(ctx.google.calendar.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ summary: 'Edited meanwhile' }),
        }),
      );
      expect((await row(event.id)).syncState).toMatchObject({ syncStatus: 'SYNCED', eTag: 'e2' });
    });

    it('returns null for a second call while a run is in progress, then runs again after it ends', async () => {
      await googleUser();
      await seedSynced();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let entered!: () => void;
      const insertStarted = new Promise<void>((resolve) => (entered = resolve));
      ctx.google.calendar.events.insert.mockImplementation(async () => {
        entered();
        await gate;
        return { data: { etag: 'e' } };
      });

      const first = sync.syncLocalToGoogle();
      await insertStarted;
      const second = await sync.syncLocalToGoogle();
      release();
      const firstResult = await first;

      expect(second).toBeNull();
      expect(firstResult).toEqual({ pushed: 1, deleted: 0, removedRemotely: 0, failed: 0 });
      expect(ctx.google.calendar.events.insert).toHaveBeenCalledTimes(1);
      expect(await sync.syncLocalToGoogle()).toEqual({ pushed: 0, deleted: 0, removedRemotely: 0, failed: 0 });
    });

    it('releases the run guard when the run throws', async () => {
      await googleUser();
      const spy = vi.spyOn(ctx.prisma.calendarSyncState, 'findMany').mockRejectedValueOnce(new Error('db down'));

      try {
        await expect(sync.syncLocalToGoogle()).rejects.toThrow('db down');
      } finally {
        spy.mockRestore();
      }

      expect(await sync.syncLocalToGoogle()).toEqual({ pushed: 0, deleted: 0, removedRemotely: 0, failed: 0 });
    });

    it('sums pushed, deleted, removedRemotely and failed in one run', async () => {
      await googleUser();
      await seedSynced({ title: 'new' });
      await seedSynced({ title: 'patch' }, { syncStatus: 'DIRTY', googleEventId: 'g-patch' });
      await seedSynced({ title: 'gone-remote' }, { syncStatus: 'DIRTY', googleEventId: 'g-gone' });
      await seedSynced({ title: 'deleted', deletedAt: new Date() }, { syncStatus: 'DIRTY', googleEventId: 'g-del' });
      await seedSynced({ title: 'fails' }, { syncStatus: 'DIRTY', googleEventId: 'g-fail' });
      ctx.google.calendar.events.insert.mockResolvedValue({ data: { etag: 'e' } });
      ctx.google.calendar.events.delete.mockResolvedValue({});
      ctx.google.calendar.events.patch.mockImplementation(async ({ eventId }: { eventId: string }) => {
        if (eventId === 'g-gone') throw googleError(404);
        if (eventId === 'g-fail') throw googleError(500);
        return { data: { etag: 'e' } };
      });

      const result = await sync.syncLocalToGoogle();

      expect(result).toEqual({ pushed: 2, deleted: 1, removedRemotely: 1, failed: 1 });
    });
  });

  describe('handleCalendarCronSync', () => {
    it('pushes dirty events when called directly', async () => {
      await googleUser();
      const event = await seedSynced();
      ctx.google.calendar.events.insert.mockResolvedValue({ data: { etag: 'e' } });

      await sync.handleCalendarCronSync();

      expect((await row(event.id)).syncState?.syncStatus).toBe('SYNCED');
    });

    it('does nothing and does not throw when no user is connected to Google', async () => {
      await seedSynced();

      await expect(sync.handleCalendarCronSync()).resolves.toBeUndefined();

      expect(ctx.google.calendar.events.insert).not.toHaveBeenCalled();
    });

    it('swallows an unexpected error from the sync run', async () => {
      const spy = vi.spyOn(sync, 'syncLocalToGoogle').mockRejectedValueOnce(new Error('boom'));

      try {
        await expect(sync.handleCalendarCronSync()).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------- CalendarTools

  describe('CalendarTools', () => {
    it('createCalendarEvent creates the event with a DIRTY sync state', async () => {
      const result = await tools.createCalendarEvent(dto({ title: 'From AI' }) as any);

      const saved = await row(result.id);
      expect(saved.title).toBe('From AI');
      expect(saved.syncState?.syncStatus).toBe('DIRTY');
    });

    it('createCalendarEvent surfaces the 400 for an invalid range', async () => {
      await expect(
        tools.createCalendarEvent(dto({ endTime: at('2030-01-01T08:00:00Z') }) as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('getCalendarEvents returns events of the requested month', async () => {
      await seedEvent(ctx.prisma, { title: 'in', startTime: at('2030-05-01T10:00:00Z'), endTime: at('2030-05-01T11:00:00Z') });
      await seedEvent(ctx.prisma, { title: 'out', startTime: at('2030-06-01T10:00:00Z'), endTime: at('2030-06-01T11:00:00Z') });

      const result = await tools.getCalendarEvents({ month: 5, year: 2030 });

      expect(result.map((e) => e.title)).toEqual(['in']);
    });

    it('updateCalendarEvent splits the id from the changes and marks the event DIRTY', async () => {
      const event = await seedSynced({ title: 'Old' }, { syncStatus: 'SYNCED', googleEventId: 'g-1' });

      await tools.updateCalendarEvent({ id: event.id, title: 'Updated by AI' });

      const saved = await row(event.id);
      expect(saved.title).toBe('Updated by AI');
      expect(saved.syncState?.syncStatus).toBe('DIRTY');
    });

    it('updateCalendarEvent surfaces 404 for an unknown id', async () => {
      await expect(tools.updateCalendarEvent({ id: MISSING, title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deleteCalendarEvent hard-deletes a never-synced event', async () => {
      const event = await seedSynced();

      const result = await tools.deleteCalendarEvent({ id: event.id });

      expect(result).toEqual({ success: true });
      expect(await rowOrNull(event.id)).toBeNull();
    });

    it('deleteCalendarEvent soft-deletes a synced event', async () => {
      const event = await seedSynced({}, { syncStatus: 'SYNCED', googleEventId: 'g-1' });

      await tools.deleteCalendarEvent({ id: event.id });

      expect((await row(event.id)).deletedAt).toBeInstanceOf(Date);
    });

    it('deleteCalendarEvent surfaces 404 for an unknown id', async () => {
      await expect(tools.deleteCalendarEvent({ id: MISSING })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
