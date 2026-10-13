import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TtsRequestDto } from '../../dto/tts-request.dto';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gọi API Fish.audio để chuyển văn bản thành âm thanh (Audio Buffer)
   */
  async textToSpeech(dto: TtsRequestDto): Promise<Buffer> {
    try {
      const apiKey = process.env.FISH_AUDIO_API_KEY;

      // Nếu chưa chọn voiceId, tìm voiceId từ Active Character
      let voiceId = dto.voiceId;
      if (!voiceId) {
        const activeCharacter = await this.prisma.character.findFirst({
          where: { isActive: true },
          select: { voiceId: true },
        });
        voiceId =
          activeCharacter?.voiceId ||
          process.env.FISH_AUDIO_DEFAULT_VOICE_ID ||
          '';
      }

      const response = await fetch('https://api.fish.audio/v1/tts', {
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

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Fish.audio API Error: ${response.status} - ${errorText}`,
        );
        throw new InternalServerErrorException(
          'Lỗi khi gọi dịch vụ chuyển văn bản thành giọng nói (Fish.audio)',
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      this.logger.error('Lỗi thực thi TtsService:', error);
      throw new InternalServerErrorException(
        error.message || 'Lỗi khi phát sinh giọng nói',
      );
    }
  }
}
