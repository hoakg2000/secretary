import { TelegramClient } from './telegram.client';

function build(env: Record<string, string>) {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const client = new TelegramClient({ get: (key: string) => env[key] } as any);
  return { client, fetchMock };
}

const configured = { TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' };

describe('TelegramClient.sendMessage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns SENT on HTTP 200 and posts chat_id + text', async () => {
    const { client, fetchMock } = build(configured);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await expect(client.sendMessage('hi')).resolves.toBe('SENT');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottok/sendMessage');
    expect(JSON.parse(init.body)).toEqual({ chat_id: '42', text: 'hi' });
  });

  it('returns FAILED on HTTP 500', async () => {
    const { client, fetchMock } = build(configured);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream body',
    });
    await expect(client.sendMessage('hi')).resolves.toBe('FAILED');
  });

  it('returns FAILED when the request throws', async () => {
    const { client, fetchMock } = build(configured);
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(client.sendMessage('hi')).resolves.toBe('FAILED');
  });

  it('returns NOT_CONFIGURED without a token and sends no request', async () => {
    const { client, fetchMock } = build({ TELEGRAM_CHAT_ID: '42' });
    await expect(client.sendMessage('hi')).resolves.toBe('NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
