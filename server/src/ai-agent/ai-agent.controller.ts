import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatStreamDto } from './dto/chat-stream.dto';
import { SaveMemoryDto } from './dto/save-memory.dto';
import { SearchMemoryDto } from './dto/search-memory.dto';
import { TtsRequestDto } from './dto/tts-request.dto';
import { AgentService } from './services/agent/agent.service';
import { MemoryService } from './services/memory/memory.service';
import { TtsService } from './services/tts/tts.service';

@ApiTags('AI Agent & Memory')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/ai-agent')
export class AiAgentController {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly agentService: AgentService,
    private readonly ttsService: TtsService,
  ) {}

  @ApiOperation({ summary: 'Lưu ký ức AI mới thủ công (Semantic Memory)' })
  @ApiResponse({ status: 201, description: 'Lưu ký ức thành công' })
  @Post('memories')
  @HttpCode(HttpStatus.CREATED)
  async saveMemory(@Body() dto: SaveMemoryDto) {
    const data = await this.memoryService.saveMemory(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Lưu ký ức AI thành công',
      data,
    };
  }

  @ApiOperation({
    summary: 'Tìm kiếm ký ức ngữ nghĩa (pgvector + tsvector + decay)',
  })
  @ApiResponse({ status: 200, description: 'Tìm kiếm thành công' })
  @Post('memories/search')
  @HttpCode(HttpStatus.OK)
  async searchMemory(@Body() dto: SearchMemoryDto) {
    const data = await this.memoryService.searchMemory(dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Tìm kiếm ký ức ngữ nghĩa thành công',
      data,
    };
  }

  @ApiOperation({
    summary: 'Chat tương tác thời gian thực với AI Agent (SSE Stream)',
  })
  @ApiResponse({
    status: 200,
    description: 'Bắt đầu luồng Server-Sent Events thành công',
  })
  @Sse('chat/stream')
  chatStream(@Body() dto: ChatStreamDto): Observable<{ data: string }> {
    return this.agentService.chatStream(dto);
  }

  @ApiOperation({
    summary:
      'Chuyển câu thoại văn bản thành file âm thanh MP3 Stream (Fish.audio)',
  })
  @ApiResponse({ status: 200, description: 'Chuyển đổi TTS thành công' })
  @Post('tts')
  @HttpCode(HttpStatus.OK)
  async textToSpeech(@Body() dto: TtsRequestDto, @Res() res: Response) {
    const audioBuffer = await this.ttsService.textToSpeech(dto);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Content-Disposition': 'inline; filename="speech.mp3"',
    });

    res.send(audioBuffer);
  }
}
