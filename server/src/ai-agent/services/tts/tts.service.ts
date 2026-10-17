import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsRequestDto } from '../../dto/tts-request.dto';
import { ChatSessionService } from '../chat/chat-session.service';

// Thông báo cố định trả về client: không lộ chi tiết lỗi nội bộ / upstream
const TTS_FAILED = 'Lỗi khi gọi dịch vụ chuyển văn bản thành giọng nói';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(
    private readonly chatSessions: ChatSessionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Gọi API Fish.audio và trả về luồng MP3 (không buffer toàn bộ)
   */
  async textToSpeech(
    userId: string,
    dto: TtsRequestDto,
  ): Promise<ReadableStream<Uint8Array>> {
    const apiKey = this.configService.get<string>('FISH_AUDIO_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Dịch vụ TTS chưa được cấu hình');
    }

    const message = await this.chatSessions.findOwnMessage(
      userId,
      dto.messageId,
    );
    const voiceId = message.session.character?.voiceId;
    if (!voiceId) {
      throw new BadRequestException(
        'Chưa có giọng nói: Character của phiên chat chưa được đặt voiceId',
      );
    }

    if (!message.contentJp?.trim()) {
      throw new BadRequestException(
        'Tin nhắn không có nội dung tiếng Nhật để đọc',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: message.contentJp,
          reference_id: voiceId,
          format: 'mp3',
        }),
      });
    } catch (error) {
      this.logger.error('Không gọi được Fish.audio:', error);
      throw new InternalServerErrorException(TTS_FAILED);
    }

    if (!response.ok || !response.body) {
      this.logger.error(
        `Fish.audio API Error: ${response.status} - ${await response.text()}`,
      );
      throw new InternalServerErrorException(TTS_FAILED);
    }

    return response.body;
  }
}
