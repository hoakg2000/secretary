export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  /** parsed body when it is JSON, otherwise undefined */
  json: any;
}

type Reply = Response | ((call: RecordedCall) => Response | Promise<Response>);

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Global fetch stub routed by URL substring. Unknown URLs throw, so nothing reaches a real host.
 * Defaults after reset(): Telegram answers 200 {ok:true}, Fish.audio answers 200 with 3 audio bytes.
 */
export function createFetchStub() {
  const routes = new Map<string, Reply>();
  const calls: RecordedCall[] = [];

  const defaults = () => {
    routes.set('api.telegram.org', () => jsonResponse({ ok: true }));
    routes.set('api.fish.audio', () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  };
  defaults();

  const fetchStub = async (input: any, init: RequestInit = {}) => {
    const url = String(input?.url ?? input);
    const body = typeof init.body === 'string' ? init.body : undefined;
    let json: any;
    try {
      json = body ? JSON.parse(body) : undefined;
    } catch {
      json = undefined;
    }
    const call: RecordedCall = {
      url,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body,
      json,
    };
    const key = [...routes.keys()].find((part) => url.includes(part));
    if (!key) throw new Error(`unmocked fetch: ${url}`);
    calls.push(call);
    const reply = routes.get(key)!;
    return typeof reply === 'function' ? reply(call) : reply.clone();
  };

  return {
    fetchStub,
    /** every request that matched a route, in order */
    calls,
    /** answer requests whose URL contains `urlPart`; a function is called per request */
    respond(urlPart: string, reply: Reply) {
      routes.set(urlPart, reply);
    },
    /** make requests whose URL contains `urlPart` fail like a network error */
    fail(urlPart: string, error: Error = new Error('network down')) {
      routes.set(urlPart, () => {
        throw error;
      });
    },
    callsTo: (urlPart: string) => calls.filter((c) => c.url.includes(urlPart)),
    reset() {
      calls.length = 0;
      routes.clear();
      defaults();
    },
  };
}

export type FetchStub = ReturnType<typeof createFetchStub>;
