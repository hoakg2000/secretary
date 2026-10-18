export type LlmType = 'gemini' | 'motapi';

/** parameters: JSON Schema chữ thường, dùng chung cho mọi provider */
export interface LlmTool {
  name: string;
  description: string;
  parameters: object;
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Có khi model gửi tham số không phải JSON object hợp lệ: args = {} và tool bị từ chối */
  argsError?: string;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  // raw: nguyên phần model trả về của provider (Gemini cần gửi lại để giữ thought signature)
  | {
      role: 'assistant';
      content: string;
      toolCalls?: LlmToolCall[];
      raw?: unknown;
    }
  | { role: 'tool'; toolCallId: string; name: string; content: object };

export interface LlmBody {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  /** Ép câu trả lời là JSON theo schema này */
  jsonSchema?: object;
}

export type LlmEvent =
  | { type: 'text'; text: string }
  // Phát đúng một lần, cuối vòng
  | { type: 'tool_calls'; calls: LlmToolCall[]; raw?: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number };
