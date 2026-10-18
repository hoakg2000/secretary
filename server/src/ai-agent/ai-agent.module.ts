import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AiAgentController } from './ai-agent.controller';
import { AgentService } from './services/agent/agent.service';
import { PendingActionStore } from './services/agent/pending-action.store';
import { ChatSessionService } from './services/chat/chat-session.service';
import { MemoryService } from './services/memory/memory.service';
import { RagChunkService } from './services/rag-chunk/rag-chunk.service';
import { TtsService } from './services/tts/tts.service';
import { MemoryTools } from './tools/memory.tools';

@Module({
  imports: [DiscoveryModule],
  controllers: [AiAgentController],
  providers: [
    MemoryService,
    MemoryTools,
    RagChunkService,
    PendingActionStore,
    ChatSessionService,
    AgentService,
    TtsService,
  ],
})
export class AiAgentModule {}
