import { Injectable } from '@nestjs/common';
import { GeminiClient } from './gemini.client';
import { LlmBody, LlmEvent, LlmType } from './llm.types';
import { MotApiClient } from './motapi.client';

// Đổi hai dòng này để chuyển provider/model
export const LLM_TYPE: LlmType = 'motapi';
export const LLM_MODELS: Record<LlmType, string> = {
  gemini: 'gemini-3.6-flash',
  motapi: 'claude-sonnet-5-5',
};

// Một số model bọc JSON trong ```json ... ```: bỏ một hàng rào đầu và một hàng rào cuối trước JSON.parse
export const stripJsonFence = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

@Injectable()
export class LlmService {
  constructor(
    private readonly gemini: GeminiClient,
    private readonly motapi: MotApiClient,
  ) {}

  sendMessageLLM(type: LlmType, body: LlmBody): AsyncGenerator<LlmEvent> {
    const model = LLM_MODELS[type];
    switch (type) {
      case 'gemini':
        return this.gemini.stream(model, body);
      case 'motapi':
        return this.motapi.stream(model, body);
    }
  }

  /** Gom text của cả lượt, cho nơi không cần stream */
  async completeLLM(type: LlmType, body: LlmBody): Promise<string> {
    let text = '';
    for await (const ev of this.sendMessageLLM(type, body)) {
      if (ev.type === 'text') text += ev.text;
    }
    return text;
  }
}
