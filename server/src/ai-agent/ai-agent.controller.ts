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
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { Observable } from 'rxjs';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
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
  @ResponseMessage('Lưu ký ức AI thành công')
  saveMemory(@Body() dto: SaveMemoryDto) {
    return this.memoryService.saveMemory(dto);
  }

  @ApiOperation({ summary: 'Danh sách ký ức AI (mới nhất trước, phân trang)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Get('memories')
  @ResponseMessage('Lấy danh sách ký ức thành công')
  listMemories(@Query() dto: ListMemoryDto) {
    return this.memoryService.listMemories(dto);
  }

  @ApiOperation({
    summary: 'Sửa ký ức AI (đổi nội dung sẽ tạo lại embedding)',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật ký ức thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ký ức' })
  @Patch('memories/:id')
  @ResponseMessage('Cập nhật ký ức thành công')
  updateMemory(@Param('id') id: string, @Body() dto: UpdateMemoryDto) {
    return this.memoryService.updateMemory(id, dto);
  }

  @ApiOperation({ summary: 'Xóa một ký ức AI' })
  @ApiResponse({ status: 200, description: 'Xóa ký ức thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ký ức' })
  @Delete('memories/:id')
  @ResponseMessage('Xóa ký ức thành công')
  async deleteMemory(@Param('id') id: string) {
    await this.memoryService.deleteMemory(id);
  }

  @ApiOperation({
    summary: 'Tìm kiếm ký ức ngữ nghĩa (pgvector + tsvector + decay)',
  })
  @ApiResponse({ status: 200, description: 'Tìm kiếm thành công' })
  @Post('memories/search')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Tìm kiếm ký ức ngữ nghĩa thành công')
  searchMemory(@Body() dto: SearchMemoryDto) {
    return this.memoryService.searchMemory(dto);
  }

  @ApiOperation({
    summary: 'Chat tương tác thời gian thực với AI Agent (SSE Stream qua POST)',
    description:
      'Các frame `data:` là JSON có `type`: session | text | tool_call | tool_result | confirmation_required | reply | error | done. Frame đầu tiên luôn là `session` (chứa `sessionId`). Frame `text` chứa dần phần tiếng Việt (`content`). Frame `reply` (`messageId`, `contentJp`) được gửi sau khi lưu tin nhắn, ngay trước `done`; `contentJp` là bản tiếng Nhật dùng cho TTS (có thể null).',
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
  @HttpCode(HttpStatus.OK) // POST mặc định 201; luồng SSE trả 200 như tài liệu
  async chatStream(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChatStreamDto,
  ): Promise<Observable<{ data: string }>> {
    return this.agentService.chatStream(user.userId, dto);
  }

  @ApiOperation({
    summary: 'Danh sách phiên chat (tin nhắn mới nhất trước, phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Get('sessions')
  @ResponseMessage('Lấy danh sách phiên chat thành công')
  listSessions(@CurrentUser() user: AuthUser, @Query() dto: ListChatDto) {
    return this.chatSessionService.listSessions(
      user.userId,
      dto.page,
      dto.pageSize,
    );
  }

  @ApiOperation({
    summary: 'Tin nhắn của một phiên chat (cũ trước, phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phiên chat' })
  @Get('sessions/:id/messages')
  @ResponseMessage('Lấy danh sách tin nhắn thành công')
  listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() dto: ListChatDto,
  ) {
    return this.chatSessionService.listMessages(
      user.userId,
      id,
      dto.page,
      dto.pageSize,
    );
  }

  @ApiOperation({ summary: 'Xóa một phiên chat cùng các tin nhắn của nó' })
  @ApiResponse({ status: 200, description: 'Xóa phiên chat thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phiên chat' })
  @Delete('sessions/:id')
  @ResponseMessage('Xóa phiên chat thành công')
  async deleteSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.chatSessionService.deleteSession(user.userId, id);
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
  @ResponseMessage('Đã thực thi hành động')
  confirmAction(@Param('actionId') actionId: string) {
    return this.agentService.confirmAction(actionId);
  }

  @ApiOperation({ summary: 'Từ chối một hành động do AI đề xuất' })
  @ApiResponse({ status: 200, description: 'Đã hủy hành động' })
  @ApiResponse({ status: 404, description: 'Hành động không tồn tại' })
  @Delete('actions/:actionId')
  @ResponseMessage('Đã hủy hành động')
  discardAction(@Param('actionId') actionId: string) {
    this.agentService.discardAction(actionId);
  }

  // Không gắn @ResponseMessage: trả luồng audio qua @Res nên không bọc envelope
  @ApiOperation({
    summary:
      'Chuyển câu thoại văn bản thành file âm thanh MP3 Stream (Fish.audio)',
  })
  @ApiResponse({ status: 200, description: 'Chuyển đổi TTS thành công' })
  @ApiResponse({
    status: 400,
    description:
      'Character của phiên chat chưa có voiceId, hoặc tin nhắn không có nội dung tiếng Nhật để đọc',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tin nhắn' })
  @ApiResponse({ status: 503, description: 'Dịch vụ TTS chưa được cấu hình' })
  @Post('tts')
  @HttpCode(HttpStatus.OK)
  async textToSpeech(
    @CurrentUser() user: AuthUser,
    @Body() dto: TtsRequestDto,
    @Res() res: Response,
  ) {
    const audioStream = await this.ttsService.textToSpeech(user.userId, dto);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline; filename="speech.mp3"',
    });

    Readable.fromWeb(audioStream as any)
      .on('error', () => res.destroy())
      .pipe(res);
  }
}
