import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TelegramSendStatus = 'SENT' | 'FAILED' | 'NOT_CONFIGURED';

/**
 * Gửi tin nhắn văn bản qua Telegram Bot API (D4: chỉ text, chưa có inline button).
 */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMessage(text: string): Promise<TelegramSendStatus> {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      return 'NOT_CONFIGURED';
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.ok) {
        return 'SENT';
      }
      // Nội dung lỗi của Telegram chỉ ghi log, không trả về cho client
      this.logger.error(
        `Telegram trả về ${response.status}: ${await response.text()}`,
      );
    } catch (error: any) {
      // Không log error gốc: URL request chứa bot token
      this.logger.error(`Không gọi được Telegram: ${error?.name}`);
    }
    return 'FAILED';
  }
}
