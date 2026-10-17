import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmBody, LlmEvent, LlmMessage, LlmToolCall } from './llm.types';

const MOTAPI_URL = 'https://motapis.com/v1/chat/completions';
const TIMEOUT_MS = 120_000;

/** Client MộtAPI (tương thích OpenAI chat completions), stream SSE bằng fetch */
@Injectable()
export class MotApiClient {
  constructor(private readonly configService: ConfigService) {}

  async *stream(model: string, body: LlmBody): AsyncGenerator<LlmEvent> {
    const apiKey = this.configService.get<string>('MOT_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('MOT_API_KEY chưa được cấu hình');
    }

    const response = await fetch(MOTAPI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(this.buildRequest(model, body)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`MotAPI lỗi ${response.status}: ${detail}`);
    }

    // tool_calls đến theo từng mảnh, ghép theo index
    const pending = new Map<
      number,
      { id: string; name: string; args: string }
    >();
    const decoder = new TextDecoder();
    let buffer = '';

    const parse = function* (line: string): Generator<LlmEvent> {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      const chunk = JSON.parse(data);
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) yield { type: 'text', text: delta.content };
      for (const tc of delta?.tool_calls ?? []) {
        const index: number = tc.index ?? 0;
        const cur = pending.get(index) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        pending.set(index, cur);
      }
      if (chunk.usage) {
        yield {
          type: 'usage',
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    };

    const isDone = (line: string) => line.replace(/^data:\s*/, '') === '[DONE]';
    let done = false;
    // [DONE] kết thúc luồng: không đọc tiếp dữ liệu nào sau đó
    read: for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(part, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (isDone(line)) {
          done = true;
          break read;
        }
        yield* parse(line);
      }
    }
    if (!done) yield* parse(buffer.trim());

    if (pending.size > 0) {
      const calls: LlmToolCall[] = [...pending.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, c]) => ({
          id: c.id || `call_${index}`,
          name: c.name,
          args: c.args ? JSON.parse(c.args) : {},
        }));
      yield { type: 'tool_calls', calls };
    }
  }

  private buildRequest(model: string, body: LlmBody) {
    const messages: Record<string, unknown>[] = [];
    if (body.system) messages.push({ role: 'system', content: body.system });
    for (const m of body.messages) messages.push(this.toMessage(m));

    return {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      tools: body.tools?.length
        ? body.tools.map((t) => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined,
      response_format: body.jsonSchema
        ? {
            type: 'json_schema',
            json_schema: { name: 'reply', schema: body.jsonSchema },
          }
        : undefined,
    };
  }

  private toMessage(m: LlmMessage): Record<string, unknown> {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: JSON.stringify(m.content),
      };
    }
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls?.length
        ? m.toolCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          }))
        : undefined,
    };
  }
}
