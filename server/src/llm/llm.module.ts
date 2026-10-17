import { Global, Module } from '@nestjs/common';
import { GenAiProvider } from '../ai-agent/genai.provider';
import { GeminiClient } from './gemini.client';
import { LlmService } from './llm.service';
import { MotApiClient } from './motapi.client';

@Global()
@Module({
  providers: [LlmService, GeminiClient, MotApiClient, GenAiProvider],
  exports: [LlmService, GenAiProvider],
})
export class LlmModule {}
