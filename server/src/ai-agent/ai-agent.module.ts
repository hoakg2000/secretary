import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AiAgentController } from './ai-agent.controller';
import { GenAiProvider } from './genai.provider';
import { AgentService } from './services/agent/agent.service';
import { PendingActionStore } from './services/agent/pending-action.store';
import { MemoryService } from './services/memory/memory.service';
import { RagChunkService } from './services/rag-chunk/rag-chunk.service';
import { TtsService } from './services/tts/tts.service';
import { MemoryTools } from './tools/memory.tools';

@Module({
  imports: [DiscoveryModule],
  controllers: [AiAgentController],
  providers: [
    GenAiProvider,
    MemoryService,
    MemoryTools,
    RagChunkService,
    PendingActionStore,
    AgentService,
    TtsService,
  ],
  exports: [
    GenAiProvider,
    MemoryService,
    MemoryTools,
    RagChunkService,
    AgentService,
    TtsService,
  ],
})
export class AiAgentModule {}
