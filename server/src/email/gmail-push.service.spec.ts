import { Prisma } from '@prisma/client';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { extractBody, GmailPushService } from './gmail-push.service';

const ENV: Record<string, string> = {
  GMAIL_PUBSUB_TOPIC: 'projects/p/topics/gmail',
  PUBSUB_PUSH_AUDIENCE: 'https://host/api/v1/email/pubsub',
  PUBSUB_PUSH_SERVICE_ACCOUNT: 'push@p.iam.gserviceaccount.com',
};
const AUTH = 'Bearer good-token';
const BODY: any = { message: { data: 'e30=', messageId: '1' } };

const b64 = (text: string) => Buffer.from(text).toString('base64url');
const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

const gmailMessage = (id: string) => ({
  data: {
    id,
    payload: {
      headers: [
        { name: 'Message-Id', value: `<${id}@mail>` },
        { name: 'From', value: 'Bank <no-reply@bank.vn>' },
        { name: 'Subject', value: 'Biến động số dư' },
      ],
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64(`body of ${id}`) } },
        { mimeType: 'text/html', body: { data: b64('<p>html</p>') } },
      ],
    },
  },
});

function build(env = ENV, storedHistoryId: string | null = '100') {
  const user = { id: 'u1', gmailHistoryId: storedHistoryId };
  const seen = new Set<string>();
  const prisma: any = {
    user: {
      findFirst: vi.fn(async () => ({ ...user })),
      update: vi.fn(async ({ data }: any) => Object.assign(user, data)),
    },
    emailLog: {
      // unique message_id the way the DB enforces it
      create: vi.fn(async ({ data }: any) => {
        if (seen.has(data.messageId)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        seen.add(data.messageId);
        return { id: `log-${data.messageId}`, ...data };
      }),
      update: vi.fn(),
    },
  };
  const queue: any = { add: vi.fn().mockResolvedValue({ id: 'job' }) };
  const rules: any = { classify: vi.fn().mockResolvedValue(null) };
  const emailService = new EmailService(prisma, rules, queue);

  const users = {
    watch: vi.fn().mockResolvedValue({ data: { historyId: '90' } }),
    getProfile: vi.fn().mockResolvedValue({ data: { historyId: '300' } }),
    history: {
      list: vi.fn().mockResolvedValue({
        data: {
          historyId: '200',
          history: [
            { messagesAdded: [{ message: { id: 'a' } }] },
            { messagesAdded: [{ message: { id: 'b' } }, { message: { id: 'a' } }] },
          ],
        },
      }),
    },
    messages: {
      list: vi.fn().mockResolvedValue({ data: { messages: [{ id: 'c' }] } }),
      get: vi.fn(async ({ id }: any) => gmailMessage(id)),
    },
  };

  const service = new GmailPushService(
    prisma,
    { get: (key: string) => env[key] } as any,
    {} as any,
    {} as any,
    emailService,
  );
  const getClient = vi
    .spyOn(service as any, 'getGmailClient')
    .mockResolvedValue({ users });
  const verifyIdToken = vi.fn(async ({ idToken }: any) => {
    if (idToken !== 'good-token') throw new Error('bad signature');
    return {
      getPayload: () => ({
        email: ENV.PUBSUB_PUSH_SERVICE_ACCOUNT,
        email_verified: true,
      }),
    };
  });
  (service as any).verifier = { verifyIdToken };

  const controller = new EmailController(emailService, rules, service);
  return { controller, getClient, prisma, queue, service, user, users, verifyIdToken };
}

describe('POST /email/pubsub', () => {
  it.each([[undefined], ['Bearer forged'], ['Basic abc']])(
    'rejects authorization %s with 401 and makes no Gmail call',
    async (authorization) => {
      const { controller, getClient } = build();
      await expect(
        controller.gmailPush(authorization, BODY),
      ).rejects.toMatchObject({ status: 401 });
      expect(getClient).not.toHaveBeenCalled();
    },
  );

  it('rejects a Google-signed token of another service account', async () => {
    const { controller, getClient, verifyIdToken } = build();
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'other@x.com', email_verified: true }),
    });
    await expect(controller.gmailPush(AUTH, BODY)).rejects.toMatchObject({
      status: 401,
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('verifies against PUBSUB_PUSH_AUDIENCE', async () => {
    const { controller, verifyIdToken } = build();
    await controller.gmailPush(AUTH, BODY);
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'good-token',
      audience: ENV.PUBSUB_PUSH_AUDIENCE,
    });
  });

  it('answers 503 when Pub/Sub is not configured', async () => {
    const { controller } = build({});
    await expect(controller.gmailPush(AUTH, BODY)).rejects.toMatchObject({
      status: 503,
    });
  });

  it('two notifications over the same history create one log per message', async () => {
    const { controller, queue, users, user } = build();

    await controller.gmailPush(AUTH, BODY);
    await controller.gmailPush(AUTH, BODY);

    expect(users.history.list.mock.calls[0][0]).toMatchObject({
      startHistoryId: '100',
      historyTypes: ['messageAdded'],
    });
    expect(queue.add).toHaveBeenCalledTimes(2); // a and b, once each
    expect(queue.add.mock.calls[0][1]).toMatchObject({
      messageId: '<a@mail>',
      sender: 'Bank <no-reply@bank.vn>',
      subject: 'Biến động số dư',
      rawBody: 'body of a',
    });
    expect(user.gmailHistoryId).toBe('200');
  });

  it('follows nextPageToken', async () => {
    const { controller, users } = build();
    users.history.list
      .mockResolvedValueOnce({
        data: {
          nextPageToken: 'p2',
          history: [{ messagesAdded: [{ message: { id: 'a' } }] }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          historyId: '200',
          history: [{ messagesAdded: [{ message: { id: 'b' } }] }],
        },
      });

    const res = await controller.gmailPush(AUTH, BODY);

    expect(users.history.list.mock.calls[1][0].pageToken).toBe('p2');
    expect(res.data.fetched).toBe(2);
  });

  it('falls back to listing the last day when history.list answers 404', async () => {
    const { controller, queue, users, user } = build();
    users.history.list.mockRejectedValue(httpError(404));

    await controller.gmailPush(AUTH, BODY);

    expect(users.messages.list.mock.calls[0][0].q).toBe('newer_than:1d');
    expect(queue.add.mock.calls[0][1].messageId).toBe('<c@mail>');
    expect(user.gmailHistoryId).toBe('300');
  });

  it('lists the last day when no history ID is stored', async () => {
    const { controller, users, user } = build(ENV, null);
    await controller.gmailPush(AUTH, BODY);
    expect(users.history.list).not.toHaveBeenCalled();
    expect(user.gmailHistoryId).toBe('300');
  });

  it('a failure mid-pass keeps the stored history ID and is not a 2xx', async () => {
    const { controller, prisma, user, users } = build();
    users.messages.get.mockImplementation(async ({ id }: any) => {
      if (id === 'b') throw httpError(500);
      return gmailMessage(id);
    });

    await expect(controller.gmailPush(AUTH, BODY)).rejects.toThrow('HTTP 500');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(user.gmailHistoryId).toBe('100');

    // the guard is released: the redelivered notification runs
    users.messages.get.mockImplementation(async ({ id }: any) => gmailMessage(id));
    await expect(controller.gmailPush(AUTH, BODY)).resolves.toMatchObject({
      statusCode: 200,
    });
  });

  it('answers 503 to a notification that arrives during a pass', async () => {
    const { controller, users } = build();
    let release!: () => void;
    users.history.list.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ data: { historyId: '200' } });
      }),
    );

    const first = controller.gmailPush(AUTH, BODY);
    await vi.waitFor(() => expect(users.history.list).toHaveBeenCalled());
    await expect(controller.gmailPush(AUTH, BODY)).rejects.toMatchObject({
      status: 503,
    });
    release();
    await first;
  });
});

describe('GmailPushService.renewWatch', () => {
  it('watches INBOX on the topic and stores the first history ID only', async () => {
    const fresh = build(ENV, null);
    await fresh.service.renewWatch();
    expect(fresh.users.watch.mock.calls[0][0].requestBody).toEqual({
      topicName: ENV.GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
    });
    expect(fresh.user.gmailHistoryId).toBe('90');

    const existing = build();
    await existing.service.renewWatch();
    expect(existing.user.gmailHistoryId).toBe('100');
  });

  it('does nothing without GMAIL_PUBSUB_TOPIC', async () => {
    const { service, users } = build({});
    await service.renewWatch();
    expect(users.watch).not.toHaveBeenCalled();
  });
});

describe('extractBody', () => {
  it('falls back to stripped text/html, walking nested parts', () => {
    expect(
      extractBody({
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/html',
                body: {
                  data: b64('<style>p{}</style><p>Số dư <b>+500</b></p>'),
                },
              },
            ],
          },
        ],
      }),
    ).toBe('Số dư +500');
  });
});
