import { ServiceUnavailableException } from '@nestjs/common';
import { GeminiClient } from '../../src/llm/gemini.client';
import { LLM_MODELS, LlmService } from '../../src/llm/llm.service';
import type { LlmBody, LlmEvent } from '../../src/llm/llm.types';
import { MotApiClient } from '../../src/llm/motapi.client';
import {
  createTestModule,
  jsonResponse,
  overrideConfig,
  rejection,
  resetState,
  sseResponse,
  type TestContext,
} from './harness';

const URL = 'https://motapis.com/v1/chat/completions';
const KEY = 'test-mot-key';

const delta = (d: Record<string, unknown>) => ({ choices: [{ delta: d }] });
const toolDelta = (...tool_calls: Record<string, unknown>[]) => delta({ tool_calls });

describe('llm integration (MotAPI client + LlmService, only fetch faked)', () => {
  let ctx: TestContext;
  // ctx.moduleRef.get(LlmService) is the scripted fake; the real one is built on the real, Nest-wired clients
  let llm: LlmService;
  let motapi: MotApiClient;

  beforeAll(async () => {
    ctx = await createTestModule();
    motapi = ctx.moduleRef.get(MotApiClient);
    llm = new LlmService(ctx.moduleRef.get(GeminiClient), motapi);
  });

  afterAll(() => ctx.close());

  beforeEach(() => resetState(ctx));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const collect = async (body: LlmBody) => {
    const events: LlmEvent[] = [];
    for await (const ev of llm.sendMessageLLM('motapi', body)) events.push(ev);
    return events;
  };
  const user = (content = 'hi'): LlmBody => ({ messages: [{ role: 'user', content }] });
  const sent = () => ctx.http.callsTo('motapis.com')[0];

  describe('MotApiClient request', () => {
    beforeEach(() => ctx.http.respond('motapis.com', () => sseResponse([])));

    it('posts a streaming request to the MotAPI chat completions URL with the bearer key and the model', async () => {
      await collect(user());

      expect(ctx.http.callsTo('motapis.com')).toHaveLength(1);
      expect(sent()).toMatchObject({ url: URL, method: 'POST' });
      expect(sent().headers.authorization).toBe(`Bearer ${KEY}`);
      expect(sent().json).toMatchObject({
        model: LLM_MODELS.motapi,
        stream: true,
        stream_options: { include_usage: true },
      });
    });

    it('puts the system message first', async () => {
      await collect({ system: 'be nice', messages: [{ role: 'user', content: 'hi' }] });

      expect(sent().json.messages).toEqual([
        { role: 'system', content: 'be nice' },
        { role: 'user', content: 'hi' },
      ]);
    });

    it('sends no system message when there is no system text', async () => {
      await collect(user());

      expect(sent().json.messages).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('maps assistant tool calls to JSON-string arguments and tool results to role tool with tool_call_id', async () => {
      await collect({
        messages: [
          { role: 'user', content: 'q' },
          {
            role: 'assistant',
            content: 'checking',
            toolCalls: [
              { id: 'a', name: 'get_financial_summary', args: {} },
              { id: 'b', name: 'search_emails', args: { query: 'bank' } },
            ],
            raw: { provider: 'private' },
          },
          { role: 'tool', toolCallId: 'a', name: 'get_financial_summary', content: { accounts: [] } },
          { role: 'tool', toolCallId: 'b', name: 'search_emails', content: { error: 'x' } },
          { role: 'assistant', content: 'done' },
        ],
      });

      expect(sent().json.messages).toEqual([
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: 'checking',
          tool_calls: [
            { id: 'a', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } },
            { id: 'b', type: 'function', function: { name: 'search_emails', arguments: '{"query":"bank"}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'a', content: '{"accounts":[]}' },
        { role: 'tool', tool_call_id: 'b', content: '{"error":"x"}' },
        { role: 'assistant', content: 'done' },
      ]);
    });

    it('sends a null content for an assistant turn that only called tools', async () => {
      await collect({
        messages: [
          { role: 'user', content: 'q' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 't', args: {} }] },
        ],
      });

      expect(sent().json.messages[1].content).toBeNull();
    });

    it('maps tools to function definitions', async () => {
      const parameters = { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] };

      await collect({ ...user(), tools: [{ name: 'search_emails', description: 'find mail', parameters }] });

      expect(sent().json.tools).toEqual([
        { type: 'function', function: { name: 'search_emails', description: 'find mail', parameters } },
      ]);
    });

    it('omits tools when none are given or the list is empty', async () => {
      await collect(user());
      await collect({ ...user(), tools: [] });

      for (const call of ctx.http.callsTo('motapis.com')) expect(call.json).not.toHaveProperty('tools');
    });

    it('asks for a json_schema response when jsonSchema is given', async () => {
      const schema = { type: 'object', properties: { a: { type: 'string' } } };

      await collect({ ...user(), jsonSchema: schema });

      expect(sent().json.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'reply', schema } });
    });

    it('sends no response_format without jsonSchema', async () => {
      await collect(user());

      expect(sent().json).not.toHaveProperty('response_format');
    });
  });

  describe('MotApiClient stream parsing', () => {
    it('emits the text deltas as text events in order and ignores empty deltas', async () => {
      ctx.http.respond('motapis.com', () =>
        sseResponse([delta({ role: 'assistant', content: '' }), delta({ content: 'Xin ' }), delta({ content: 'chào' }), delta({})]),
      );

      expect(await collect(user())).toEqual([
        { type: 'text', text: 'Xin ' },
        { type: 'text', text: 'chào' },
      ]);
    });

    it('parses the stream when the bytes arrive in tiny pieces that cut lines and characters', async () => {
      ctx.http.respond('motapis.com', () => sseResponse([delta({ content: 'Xin chào 😀' }), delta({ content: ' bạn' })], 3));

      const events = await collect(user());

      expect(events.map((e) => (e.type === 'text' ? e.text : '')).join('')).toBe('Xin chào 😀 bạn');
    });

    it('joins tool calls split over several deltas into one tool_calls event with parsed args', async () => {
      ctx.http.respond('motapis.com', () =>
        sseResponse([
          toolDelta({ index: 0, id: 'call_a', type: 'function', function: { name: 'search_emails', arguments: '' } }),
          toolDelta({ index: 1, id: 'call_b', type: 'function', function: { name: 'get_financial_summary', arguments: '' } }),
          toolDelta({ index: 0, function: { arguments: '{"que' } }),
          toolDelta({ index: 1, function: { arguments: '{}' } }),
          toolDelta({ index: 0, function: { arguments: 'ry":"bank"}' } }),
        ]),
      );

      const events = await collect(user());

      expect(events).toEqual([
        {
          type: 'tool_calls',
          calls: [
            { id: 'call_a', name: 'search_emails', args: { query: 'bank' } },
            { id: 'call_b', name: 'get_financial_summary', args: {} },
          ],
        },
      ]);
    });

    it('emits the tool_calls event once, after the text of the same round', async () => {
      ctx.http.respond('motapis.com', () =>
        sseResponse([
          delta({ content: 'checking' }),
          toolDelta({ index: 0, id: 'c', function: { name: 't', arguments: '{"a":1}' } }),
          delta({ content: ' now' }),
        ]),
      );

      expect((await collect(user())).map((e) => e.type)).toEqual(['text', 'text', 'tool_calls']);
    });

    it('gives a tool call without an id a generated one and empty args when no arguments arrive', async () => {
      ctx.http.respond('motapis.com', () => sseResponse([toolDelta({ index: 0, function: { name: 't' } })]));

      expect(await collect(user())).toEqual([{ type: 'tool_calls', calls: [{ id: 'call_0', name: 't', args: {} }] }]);
    });

    it('emits a usage event with the token counts', async () => {
      ctx.http.respond('motapis.com', () =>
        sseResponse([delta({ content: 'a' }), { choices: [], usage: { prompt_tokens: 12, completion_tokens: 34 } }]),
      );

      expect(await collect(user())).toEqual([
        { type: 'text', text: 'a' },
        { type: 'usage', inputTokens: 12, outputTokens: 34 },
      ]);
    });

    it('finishes on the [DONE] marker without parsing it as JSON', async () => {
      const body = `data: ${JSON.stringify(delta({ content: 'one' }))}\n\ndata: [DONE]\n\n`;
      ctx.http.respond('motapis.com', () => new Response(body, { status: 200 }));

      expect(await collect(user())).toEqual([{ type: 'text', text: 'one' }]);
    });

    it('stops reading at [DONE] and ignores anything sent after it', async () => {
      const body =
        `data: ${JSON.stringify(delta({ content: 'one' }))}\n\ndata: [DONE]\n\n` +
        `data: ${JSON.stringify(delta({ content: 'late' }))}\n\n`;
      ctx.http.respond('motapis.com', () => new Response(body, { status: 200 }));

      expect(await collect(user())).toEqual([{ type: 'text', text: 'one' }]);
    });
  });

  describe('MotApiClient errors', () => {
    it('throws an error with the status and a body excerpt on a non-2xx answer', async () => {
      ctx.http.respond('motapis.com', () => jsonResponse({ error: { message: 'model overloaded' } }, 503));

      const error = await rejection(collect(user()));

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('503');
      expect((error as Error).message).toContain('model overloaded');
    });

    it('cuts the body excerpt to 300 characters', async () => {
      ctx.http.respond('motapis.com', () => new Response('x'.repeat(1000), { status: 500 }));

      const error = (await rejection(collect(user()))) as Error;

      expect(error.message.length).toBeLessThan(400);
    });

    it('never puts the API key in the error message', async () => {
      ctx.http.respond('motapis.com', () => new Response('unauthorized', { status: 401 }));

      const error = (await rejection(collect(user()))) as Error;

      expect(error.message).toContain('401');
      expect(error.message).not.toContain(KEY);
    });

    it('throws 503 without calling MotAPI when MOT_API_KEY is missing', async () => {
      overrideConfig(ctx, { MOT_API_KEY: undefined });

      await expect(collect(user())).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(ctx.http.callsTo('motapis.com')).toHaveLength(0);
    });

    it('passes a network failure through', async () => {
      ctx.http.fail('motapis.com', new Error('network down'));

      await expect(collect(user())).rejects.toThrow('network down');
    });
  });

  describe('LlmService', () => {
    it('completeLLM joins the text of the whole answer and ignores other events', async () => {
      ctx.http.respond('motapis.com', () =>
        sseResponse([
          delta({ content: '{"a":' }),
          delta({ content: '1}' }),
          { choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } },
        ]),
      );

      expect(await llm.completeLLM('motapi', user())).toBe('{"a":1}');
    });

    it('sendMessageLLM routes motapi to the MotAPI client with the motapi model', async () => {
      const body = user();
      const stream = vi.spyOn(motapi, 'stream').mockImplementation(async function* () {
        yield { type: 'text', text: 'routed' };
      });

      const events = await collect(body);

      expect(stream).toHaveBeenCalledWith(LLM_MODELS.motapi, body);
      expect(events).toEqual([{ type: 'text', text: 'routed' }]);
    });
  });
});
