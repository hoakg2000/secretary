import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { EmailRuleType } from '@prisma/client';
import { GoogleClientFactory } from '../../src/auth/google-client.factory';
import { GmailPushService } from '../../src/email/gmail-push.service';
import {
  googleError,
  overrideConfig,
  totalJobs,
  createTestModule,
  resetState,
  seedEmailRule,
  seedGoogleUser,
  seedUser,
  type TestContext,
} from './harness';

const AUDIENCE = 'https://test.local/email/gmail/push';
const SERVICE_ACCOUNT = 'pubsub-push@test.iam.gserviceaccount.com';
const TOPIC = 'projects/test/topics/gmail';

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url');

interface MessageSpec {
  from?: string | null;
  subject?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown>;
  body?: string;
}

/** a users.messages.get answer */
const message = (id: string, spec: MessageSpec = {}) => {
  const headers: { name: string; value: string }[] = [];
  if (spec.from !== null) headers.push({ name: 'From', value: spec.from ?? `Sender ${id} <${id}@x.com>` });
  if (spec.subject !== null) headers.push({ name: 'Subject', value: spec.subject ?? `Subject ${id}` });
  if (spec.messageId !== null) headers.push({ name: 'Message-ID', value: spec.messageId ?? `<${id}@mail>` });
  return {
    data: {
      id,
      payload: spec.payload ?? {
        mimeType: 'text/plain',
        headers,
        body: { data: b64(spec.body ?? `Body of ${id}`) },
      },
    },
  };
};
const messageWith = (id: string, payload: Record<string, unknown>, headers: { name: string; value: string }[]) => ({
  data: { id, payload: { headers, ...payload } },
});
const idsOf = (...ids: string[]) => ids.map((id) => ({ id }));

describe('gmail push integration', () => {
  let ctx: TestContext;
  let service: GmailPushService;

  const gmail = () => ctx.google.gmail.users;

  beforeAll(async () => {
    ctx = await createTestModule();
    service = ctx.moduleRef.get(GmailPushService);
  });

  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetState(ctx);
    // ingested emails stay queued so the tests can inspect them; obliterate clears the pause
    await ctx.queue.pause();
  });

  const connectedUser = (historyId: string | null = '100') =>
    seedGoogleUser(ctx.prisma, ctx.moduleRef.get(GoogleClientFactory), {}, { gmailHistoryId: historyId });
  const storedHistoryId = async (userId: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } })).gmailHistoryId;
  const logs = () => ctx.prisma.emailLog.findMany({ orderBy: { messageId: 'asc' } });
  /** history.list answers: one page of added message ids */
  const history = (ids: string[], historyId = '200', nextPageToken?: string) => ({
    data: { history: ids.map((id) => ({ messagesAdded: [{ message: { id } }] })), historyId, nextPageToken },
  });

  // ---------------------------------------------------------------- verifyPushToken

  describe('verifyPushToken', () => {
    const validTicket = () =>
      ctx.google.ticket({ email: SERVICE_ACCOUNT, email_verified: true });

    it('accepts a token signed for the configured audience and service account', async () => {
      ctx.google.verifyIdToken.mockResolvedValue(validTicket());

      await expect(service.verifyPushToken('Bearer good-token')).resolves.toBeUndefined();

      expect(ctx.google.verifyIdToken).toHaveBeenCalledWith({ idToken: 'good-token', audience: AUDIENCE });
    });

    it.each([
      ['no header', undefined],
      ['an empty header', ''],
      ['garbage', 'garbage'],
      ['another scheme', 'Basic abc'],
      ['a bearer with no token', 'Bearer '],
    ])('rejects %s with 401 without calling Google', async (_name, header) => {
      await expect(service.verifyPushToken(header)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(ctx.google.verifyIdToken).not.toHaveBeenCalled();
    });

    it('rejects with 401 when Google refuses the token', async () => {
      ctx.google.verifyIdToken.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));

      await expect(service.verifyPushToken('Bearer bad')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects with 401 when the token belongs to another email', async () => {
      ctx.google.verifyIdToken.mockResolvedValue(
        ctx.google.ticket({ email: 'attacker@evil.com', email_verified: true }),
      );

      await expect(service.verifyPushToken('Bearer t')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects with 401 when the email is not verified', async () => {
      ctx.google.verifyIdToken.mockResolvedValue(
        ctx.google.ticket({ email: SERVICE_ACCOUNT, email_verified: false }),
      );

      await expect(service.verifyPushToken('Bearer t')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects with 401 when the token has no payload', async () => {
      ctx.google.verifyIdToken.mockResolvedValue(ctx.google.ticket(undefined as never));

      await expect(service.verifyPushToken('Bearer t')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it.each(['PUBSUB_PUSH_AUDIENCE', 'PUBSUB_PUSH_SERVICE_ACCOUNT', 'GMAIL_PUBSUB_TOPIC'])(
      'answers 503 before looking at the token when %s is missing',
      async (key) => {
        overrideConfig(ctx, { [key]: undefined });
        ctx.google.verifyIdToken.mockResolvedValue(validTicket());

        await expect(service.verifyPushToken('Bearer good')).rejects.toBeInstanceOf(ServiceUnavailableException);

        expect(ctx.google.verifyIdToken).not.toHaveBeenCalled();
      },
    );
  });

  // ---------------------------------------------------------------- renewWatch

  describe('renewWatch', () => {
    it('does nothing when no topic is configured', async () => {
      await connectedUser();
      overrideConfig(ctx, { GMAIL_PUBSUB_TOPIC: undefined });

      await service.renewWatch();

      expect(gmail().watch).not.toHaveBeenCalled();
    });

    it('does nothing when no Google account is connected', async () => {
      await seedUser(ctx.prisma);

      await service.renewWatch();

      expect(gmail().watch).not.toHaveBeenCalled();
    });

    it('registers a watch on the INBOX for the topic and stores the first history id', async () => {
      const user = await connectedUser(null);
      gmail().watch.mockResolvedValue({ data: { historyId: '777' } });

      await service.renewWatch();

      expect(gmail().watch).toHaveBeenCalledTimes(1);
      expect(gmail().watch).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: { topicName: TOPIC, labelIds: ['INBOX'] },
      });
      expect(await storedHistoryId(user.id)).toBe('777');
    });

    it('keeps the stored history id on renewal', async () => {
      const user = await connectedUser('100');
      gmail().watch.mockResolvedValue({ data: { historyId: '777' } });

      await service.renewWatch();

      expect(await storedHistoryId(user.id)).toBe('100');
    });

    it('stores nothing when Google returns no history id', async () => {
      const user = await connectedUser(null);
      gmail().watch.mockResolvedValue({ data: {} });

      await service.renewWatch();

      expect(await storedHistoryId(user.id)).toBeNull();
    });

    it('swallows a Google failure', async () => {
      const user = await connectedUser(null);
      gmail().watch.mockRejectedValue(googleError(500));

      await expect(service.renewWatch()).resolves.toBeUndefined();

      expect(await storedHistoryId(user.id)).toBeNull();
    });
  });

  // ---------------------------------------------------------------- runPass

  describe('runPass without a stored history id', () => {
    it('returns 0 and calls Google not at all when no account is connected', async () => {
      await seedUser(ctx.prisma);

      expect(await service.runPass()).toBe(0);

      expect(gmail().getProfile).not.toHaveBeenCalled();
      expect(gmail().history.list).not.toHaveBeenCalled();
    });

    it('takes the baseline history id from the profile and ingests nothing when the inbox is empty', async () => {
      const user = await connectedUser(null);
      gmail().getProfile.mockResolvedValue({ data: { historyId: '500' } });
      gmail().messages.list.mockResolvedValue({ data: {} });

      expect(await service.runPass()).toBe(0);

      expect(await storedHistoryId(user.id)).toBe('500');
      expect(gmail().history.list).not.toHaveBeenCalled();
      expect(await logs()).toHaveLength(0);
      expect(await totalJobs(ctx)).toBe(0);
    });

    it('reads the profile before listing and ingests the last day of INBOX mail across pages', async () => {
      const user = await connectedUser(null);
      gmail().getProfile.mockResolvedValue({ data: { historyId: '500' } });
      gmail()
        .messages.list.mockResolvedValueOnce({ data: { messages: idsOf('a'), nextPageToken: 'p2' } })
        .mockResolvedValueOnce({ data: { messages: idsOf('b') } });
      gmail().messages.get.mockImplementation(async ({ id }: { id: string }) => message(id));

      expect(await service.runPass()).toBe(2);

      expect(gmail().messages.list).toHaveBeenNthCalledWith(1, {
        userId: 'me',
        q: 'newer_than:1d',
        labelIds: ['INBOX'],
        pageToken: undefined,
      });
      expect(gmail().messages.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: 'p2' }));
      expect(gmail().getProfile.mock.invocationCallOrder[0]).toBeLessThan(
        gmail().messages.list.mock.invocationCallOrder[0],
      );
      expect((await logs()).map((l) => l.messageId)).toEqual(['<a@mail>', '<b@mail>']);
      expect(await storedHistoryId(user.id)).toBe('500');
    });
  });

  describe('runPass with a stored history id', () => {
    it('follows history pages, reads each new message once and queues one job per email', async () => {
      const user = await connectedUser('100');
      gmail()
        .history.list.mockResolvedValueOnce(history(['a'], '110', 'next'))
        // 'a' appears again on the second page
        .mockResolvedValueOnce(history(['b', 'a'], '120'));
      gmail().messages.get.mockImplementation(async ({ id }: { id: string }) => message(id));

      expect(await service.runPass()).toBe(2);

      expect(gmail().history.list).toHaveBeenNthCalledWith(1, {
        userId: 'me',
        startHistoryId: '100',
        historyTypes: ['messageAdded'],
        labelId: 'INBOX',
        pageToken: undefined,
      });
      expect(gmail().history.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ startHistoryId: '100', pageToken: 'next' }));
      expect(gmail().messages.get).toHaveBeenCalledTimes(2);
      expect(gmail().messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'a', format: 'full' });
      const saved = await logs();
      expect(saved.map((l) => l.status)).toEqual(['PENDING', 'PENDING']);
      for (const log of saved) expect(await ctx.queue.getJob(log.id)).toBeTruthy();
      expect(await totalJobs(ctx)).toBe(2);
      expect(await storedHistoryId(user.id)).toBe('120');
    });

    it('returns 0 and still advances the history id when nothing is new', async () => {
      const user = await connectedUser('100');
      gmail().history.list.mockResolvedValue({ data: { historyId: '150' } });

      expect(await service.runPass()).toBe(0);

      expect(await storedHistoryId(user.id)).toBe('150');
      expect(gmail().messages.get).not.toHaveBeenCalled();
    });

    it('parses From, Subject and Message-ID headers (any case) and the base64url body', async () => {
      await connectedUser('100');
      const text = 'Số dư tăng ~~~ ??? >>> 500,000đ';
      expect(b64(text)).toMatch(/[-_]/);
      gmail().history.list.mockResolvedValue(history(['m1']));
      gmail().messages.get.mockResolvedValue(
        messageWith('m1', { mimeType: 'text/plain', body: { data: b64(text) } }, [
          { name: 'FROM', value: 'Bank <alerts@bank.example>' },
          { name: 'subject', value: 'Thông báo' },
          { name: 'message-id', value: '<abc@bank>' },
        ]),
      );

      await service.runPass();

      const [log] = await logs();
      expect(log).toMatchObject({
        messageId: '<abc@bank>',
        sender: 'Bank <alerts@bank.example>',
        subject: 'Thông báo',
        rawBody: text,
        status: 'PENDING',
      });
    });

    it('falls back to the Gmail id and "unknown" when headers are missing', async () => {
      await connectedUser('100');
      gmail().history.list.mockResolvedValue(history(['gid-1']));
      gmail().messages.get.mockResolvedValue(message('gid-1', { from: null, subject: null, messageId: null }));

      await service.runPass();

      const [log] = await logs();
      expect(log).toMatchObject({ messageId: 'gid-1', sender: 'unknown', subject: null });
    });

    it('prefers text/plain inside a multipart message and skips attachments', async () => {
      await connectedUser('100');
      gmail().history.list.mockResolvedValue(history(['m1']));
      gmail().messages.get.mockResolvedValue(
        messageWith(
          'm1',
          {
            mimeType: 'multipart/mixed',
            parts: [
              { mimeType: 'text/plain', filename: 'a.txt', body: { attachmentId: 'att-1' } },
              {
                mimeType: 'multipart/alternative',
                parts: [
                  { mimeType: 'text/html', body: { data: b64('<p>html version</p>') } },
                  { mimeType: 'text/plain', body: { data: b64('plain version') } },
                ],
              },
            ],
          },
          [{ name: 'Message-ID', value: '<m1>' }],
        ),
      );

      await service.runPass();

      expect((await logs())[0].rawBody).toBe('plain version');
    });

    it('strips tags, styles and scripts when only text/html exists', async () => {
      await connectedUser('100');
      gmail().history.list.mockResolvedValue(history(['m1']));
      gmail().messages.get.mockResolvedValue(
        messageWith(
          'm1',
          {
            mimeType: 'text/html',
            body: { data: b64('<style>p{color:red}</style><script>alert(1)</script><p>Hello   <b>world</b></p>') },
          },
          [{ name: 'Message-ID', value: '<m1>' }],
        ),
      );

      await service.runPass();

      expect((await logs())[0].rawBody).toBe('Hello world');
    });

    it('stores a null body for a message with no readable part', async () => {
      await connectedUser('100');
      gmail().history.list.mockResolvedValue(history(['m1']));
      gmail().messages.get.mockResolvedValue(
        messageWith('m1', { mimeType: 'application/pdf', body: { attachmentId: 'x' } }, [
          { name: 'Message-ID', value: '<m1>' },
        ]),
      );

      await service.runPass();

      expect((await logs())[0].rawBody).toBeNull();
    });

    it('skips a message that Google no longer has and ingests the others', async () => {
      const user = await connectedUser('100');
      gmail().history.list.mockResolvedValue(history(['gone', 'ok'], '300'));
      gmail().messages.get.mockImplementation(async ({ id }: { id: string }) => {
        if (id === 'gone') throw googleError(404);
        return message(id);
      });

      await service.runPass();

      expect((await logs()).map((l) => l.messageId)).toEqual(['<ok@mail>']);
      expect(await storedHistoryId(user.id)).toBe('300');
    });

    it('applies the rules: a blacklisted message is SKIPPED with no job', async () => {
      await connectedUser('100');
      await seedEmailRule(ctx.prisma, { type: EmailRuleType.blacklist, matchValue: 'ads.com' });
      gmail().history.list.mockResolvedValue(history(['m1']));
      gmail().messages.get.mockResolvedValue(message('m1', { from: 'Promo <deals@ads.com>' }));

      await service.runPass();

      expect((await logs())[0].status).toBe('SKIPPED');
      expect(await totalJobs(ctx)).toBe(0);
    });

    it('does not requeue a message that was already processed', async () => {
      await connectedUser('100');
      await ctx.prisma.emailLog.create({ data: { messageId: '<m1@mail>', sender: 's', status: 'PROCESSED' } });
      gmail().history.list.mockResolvedValue(history(['m1']));
      gmail().messages.get.mockResolvedValue(message('m1'));

      await service.runPass();

      expect(await logs()).toHaveLength(1);
      expect((await logs())[0].status).toBe('PROCESSED');
      expect(await totalJobs(ctx)).toBe(0);
    });

    it('writes the history id only after the whole pass, so a retried pass reads the same range and ignores duplicates', async () => {
      const user = await connectedUser('100');
      gmail().history.list.mockResolvedValue(history(['a', 'b'], '400'));
      gmail().messages.get.mockImplementation(async ({ id }: { id: string }) => {
        if (id === 'b') throw googleError(500);
        return message(id);
      });

      await expect(service.runPass()).rejects.toThrow('google 500');

      expect(await storedHistoryId(user.id)).toBe('100');
      expect((await logs()).map((l) => l.messageId)).toEqual(['<a@mail>']);

      gmail().messages.get.mockImplementation(async ({ id }: { id: string }) => message(id));
      await service.runPass();

      expect(gmail().history.list).toHaveBeenLastCalledWith(expect.objectContaining({ startHistoryId: '100' }));
      expect((await logs()).map((l) => l.messageId)).toEqual(['<a@mail>', '<b@mail>']);
      expect(await totalJobs(ctx)).toBe(2);
      expect(await storedHistoryId(user.id)).toBe('400');
    });

    it('rethrows a history failure other than 404 and keeps the history id', async () => {
      const user = await connectedUser('100');
      gmail().history.list.mockRejectedValue(googleError(500));

      await expect(service.runPass()).rejects.toThrow('google 500');

      expect(await storedHistoryId(user.id)).toBe('100');
      expect(gmail().getProfile).not.toHaveBeenCalled();
    });

    it.each([404, 410])('re-baselines from the last day of mail when Google answers %s (history too old)', async (status) => {
      const user = await connectedUser('100');
      gmail().history.list.mockRejectedValue(googleError(status));
      gmail().getProfile.mockResolvedValue({ data: { historyId: '900' } });
      gmail().messages.list.mockResolvedValue({ data: { messages: idsOf('recent') } });
      gmail().messages.get.mockImplementation(async ({ id }: { id: string }) => message(id));

      expect(await service.runPass()).toBe(1);

      expect((await logs()).map((l) => l.messageId)).toEqual(['<recent@mail>']);
      expect(await storedHistoryId(user.id)).toBe('900');
    });
  });

  describe('runPass concurrency guard', () => {
    it('answers 503 to a second pass while one is running, then accepts a new pass', async () => {
      const user = await connectedUser('100');
      gmail().history.list.mockResolvedValue(history(['a'], '600'));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      gmail().messages.get.mockImplementation(async ({ id }: { id: string }) => {
        await gate;
        return message(id);
      });

      const first = service.runPass();
      await vi.waitFor(() => expect(gmail().messages.get).toHaveBeenCalled());

      await expect(service.runPass()).rejects.toBeInstanceOf(ServiceUnavailableException);
      release();
      expect(await first).toBe(1);

      gmail().history.list.mockResolvedValue({ data: { historyId: '700' } });
      expect(await service.runPass()).toBe(0);
      expect(await storedHistoryId(user.id)).toBe('700');
      expect(await logs()).toHaveLength(1);
    });

    it('releases the guard after a failed pass', async () => {
      await connectedUser('100');
      gmail().history.list.mockRejectedValueOnce(googleError(500));

      await expect(service.runPass()).rejects.toThrow('google 500');

      gmail().history.list.mockResolvedValue({ data: { historyId: '800' } });
      await expect(service.runPass()).resolves.toBe(0);
    });
  });
});
