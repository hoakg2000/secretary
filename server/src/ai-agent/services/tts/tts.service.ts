import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { TtsRequestDto } from '../../dto/tts-request.dto';

// Thông báo cố định trả về client: không lộ chi tiết lỗi nội bộ / upstream
const TTS_FAILED = 'Lỗi khi gọi dịch vụ chuyển văn bản thành giọng nói';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Gọi API Fish.audio và trả về luồng MP3 (không buffer toàn bộ)
   */
  async textToSpeech(dto: TtsRequestDto): Promise<ReadableStream<Uint8Array>> {
    const apiKey = this.configService.get<string>('FISH_AUDIO_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Dịch vụ TTS chưa được cấu hình');
    }

    // Nếu chưa chọn voiceId, tìm voiceId từ Active Character rồi tới giá trị mặc định
    let voiceId = dto.voiceId;
    if (!voiceId) {
      const activeCharacter = await this.prisma.character.findFirst({
        where: { isActive: true },
        select: { voiceId: true },
      });
      voiceId =
        activeCharacter?.voiceId ||
        this.configService.get<string>('FISH_AUDIO_DEFAULT_VOICE_ID');
    }
    if (!voiceId) {
      throw new BadRequestException(
        'Chưa có voiceId: truyền voiceId, đặt voice cho Active Character hoặc cấu hình FISH_AUDIO_DEFAULT_VOICE_ID',
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
          text: dto.text,
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
