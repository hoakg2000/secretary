import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  RequestMethod,
  Res,
  Sse,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { Observable } from 'rxjs';
import { ChatStreamDto } from './dto/chat-stream.dto';
import { ListChatDto } from './dto/list-chat.dto';
import { ListMemoryDto } from './dto/list-memory.dto';
import { SaveMemoryDto } from './dto/save-memory.dto';
import { SearchMemoryDto } from './dto/search-memory.dto';
import { TtsRequestDto } from './dto/tts-request.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { AgentService } from './services/agent/agent.service';
import { ChatSessionService } from './services/chat/chat-session.service';
import { MemoryService } from './services/memory/memory.service';
import { TtsService } from './services/tts/tts.service';

@ApiTags('AI Agent & Memory')
@ApiBearerAuth('JWT-auth')
@Controller('ai-agent')
export class AiAgentController {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly agentService: AgentService,
    private readonly ttsService: TtsService,
    private readonly chatSessionService: ChatSessionService,
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

  @ApiOperation({ summary: 'Danh sách ký ức AI (mới nhất trước, phân trang)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Get('memories')
  @HttpCode(HttpStatus.OK)
  async listMemories(@Query() dto: ListMemoryDto) {
    const data = await this.memoryService.listMemories(dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách ký ức thành công',
      data,
    };
  }

  @ApiOperation({
    summary: 'Sửa ký ức AI (đổi nội dung sẽ tạo lại embedding)',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật ký ức thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ký ức' })
  @Patch('memories/:id')
  @HttpCode(HttpStatus.OK)
  async updateMemory(@Param('id') id: string, @Body() dto: UpdateMemoryDto) {
    const data = await this.memoryService.updateMemory(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật ký ức thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Xóa một ký ức AI' })
  @ApiResponse({ status: 200, description: 'Xóa ký ức thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ký ức' })
  @Delete('memories/:id')
  @HttpCode(HttpStatus.OK)
  async deleteMemory(@Param('id') id: string) {
    const data = await this.memoryService.deleteMemory(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa ký ức thành công',
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
    summary: 'Chat tương tác thời gian thực với AI Agent (SSE Stream qua POST)',
    description:
      'Các frame `data:` là JSON có `type`: session | text | tool_call | tool_result | confirmation_required | error | done. Frame đầu tiên luôn là `session` (chứa `sessionId`).',
  })
  @ApiResponse({
    status: 200,
    description: 'Bắt đầu luồng Server-Sent Events thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Thiếu characterId khi bắt đầu phiên chat mới',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy phiên chat hoặc Character',
  })
  // POST để gửi được body (EventSource/GET không có body)
  @Sse('chat/stream', { method: RequestMethod.POST })
  async chatStream(
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: ChatStreamDto,
  ): Promise<Observable<{ data: string }>> {
    return this.agentService.chatStream(req.user.userId, dto);
  }

  @ApiOperation({
    summary: 'Danh sách phiên chat (tin nhắn mới nhất trước, phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  async listSessions(
    @Req() req: Request & { user: { userId: string } },
    @Query() dto: ListChatDto,
  ) {
    const data = await this.chatSessionService.listSessions(
      req.user.userId,
      dto.page,
      dto.pageSize,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách phiên chat thành công',
      data,
    };
  }

  @ApiOperation({
    summary: 'Tin nhắn của một phiên chat (cũ trước, phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phiên chat' })
  @Get('sessions/:id/messages')
  @HttpCode(HttpStatus.OK)
  async listMessages(
    @Req() req: Request & { user: { userId: string } },
    @Param('id') id: string,
    @Query() dto: ListChatDto,
  ) {
    const data = await this.chatSessionService.listMessages(
      req.user.userId,
      id,
      dto.page,
      dto.pageSize,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách tin nhắn thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Xóa một phiên chat cùng các tin nhắn của nó' })
  @ApiResponse({ status: 200, description: 'Xóa phiên chat thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phiên chat' })
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async deleteSession(
    @Req() req: Request & { user: { userId: string } },
    @Param('id') id: string,
  ) {
    const data = await this.chatSessionService.deleteSession(
      req.user.userId,
      id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa phiên chat thành công',
      data,
    };
  }

  @ApiOperation({
    summary:
      'Xác nhận và thực thi một hành động ghi dữ liệu do AI đề xuất (frame confirmation_required)',
  })
  @ApiResponse({ status: 200, description: 'Đã thực thi hành động' })
  @ApiResponse({
    status: 404,
    description: 'Hành động không tồn tại, đã dùng hoặc đã hết hạn (5 phút)',
  })
  @Post('actions/:actionId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmAction(@Param('actionId') actionId: string) {
    const data = await this.agentService.confirmAction(actionId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Đã thực thi hành động',
      data,
    };
  }

  @ApiOperation({ summary: 'Từ chối một hành động do AI đề xuất' })
  @ApiResponse({ status: 200, description: 'Đã hủy hành động' })
  @ApiResponse({ status: 404, description: 'Hành động không tồn tại' })
  @Delete('actions/:actionId')
  @HttpCode(HttpStatus.OK)
  discardAction(@Param('actionId') actionId: string) {
    const data = this.agentService.discardAction(actionId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Đã hủy hành động',
      data,
    };
  }

  @ApiOperation({
    summary:
      'Chuyển câu thoại văn bản thành file âm thanh MP3 Stream (Fish.audio)',
  })
  @ApiResponse({ status: 200, description: 'Chuyển đổi TTS thành công' })
  @ApiResponse({
    status: 400,
    description: 'Character của phiên chat chưa có voiceId',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tin nhắn' })
  @ApiResponse({ status: 503, description: 'Dịch vụ TTS chưa được cấu hình' })
  @Post('tts')
  @HttpCode(HttpStatus.OK)
  async textToSpeech(
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: TtsRequestDto,
    @Res() res: Response,
  ) {
    const audioStream = await this.ttsService.textToSpeech(
      req.user.userId,
      dto,
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline; filename="speech.mp3"',
    });

    Readable.fromWeb(audioStream as any)
      .on('error', () => res.destroy())
      .pipe(res);
  }
}
