import { Content, Part } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { GenAiProvider } from '../ai-agent/genai.provider';
import { LlmBody, LlmEvent, LlmMessage, LlmToolCall } from './llm.types';

@Injectable()
export class GeminiClient {
  constructor(private readonly genAi: GenAiProvider) {}

  async *stream(model: string, body: LlmBody): AsyncGenerator<LlmEvent> {
    const stream = await this.genAi.get().models.generateContentStream({
      model,
      contents: this.toContents(body.messages),
      config: {
        systemInstruction: body.system,
        tools: body.tools?.length
          ? [
              {
                functionDeclarations: body.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.parameters,
                })),
              },
            ]
          : undefined,
        responseMimeType: body.jsonSchema ? 'application/json' : undefined,
        responseJsonSchema: body.jsonSchema,
      },
    });

    const calls: LlmToolCall[] = [];
    const parts: Part[] = []; // nguyên parts của model, gồm thought signature
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const chunk of stream) {
      for (const fc of chunk.functionCalls ?? []) {
        calls.push({
          id: fc.id ?? `call_${calls.length}`,
          name: fc.name ?? '',
          args: fc.args ?? {},
        });
      }
      const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
      parts.push(...chunkParts);
      // Lấy text từ parts (getter chunk.text cảnh báo khi chunk có functionCall)
      const text = chunkParts
        .map((p) => (p.thought ? '' : (p.text ?? '')))
        .join('');
      if (text) yield { type: 'text', text };
      if (chunk.usageMetadata) {
        usage = {
          inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
    }

    if (calls.length > 0) {
      yield { type: 'tool_calls', calls, raw: { role: 'model', parts } };
    }
    if (usage) yield { type: 'usage', ...usage };
  }

  private toContents(messages: LlmMessage[]): Content[] {
    const contents: Content[] = [];
    for (const m of messages) {
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      } else if (m.role === 'assistant') {
        contents.push(
          (m.raw as Content | undefined) ?? {
            role: 'model',
            parts: [
              ...(m.content ? [{ text: m.content }] : []),
              ...(m.toolCalls ?? []).map((c) => ({
                functionCall: { id: c.id, name: c.name, args: c.args },
              })),
            ],
          },
        );
      } else {
        const part: Part = {
          functionResponse: {
            id: m.toolCallId,
            name: m.name,
            response: m.content as Record<string, unknown>,
          },
        };
        // Mọi functionResponse của một lượt phải nằm trong MỘT content
        const last = contents[contents.length - 1];
        if (
          last?.role === 'user' &&
          last.parts?.every((p) => p.functionResponse)
        ) {
          last.parts.push(part);
        } else {
          contents.push({ role: 'user', parts: [part] });
        }
      }
    }
    return contents;
  }
}
