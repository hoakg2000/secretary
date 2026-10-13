import { GoogleGenAI } from '@google/genai';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Một Gemini client dùng chung cho chat và embedding.
 * Tạo lười: server vẫn khởi động được khi chưa có GEMINI_API_KEY, chỉ các tính năng AI báo lỗi.
 */
@Injectable()
export class GenAiProvider {
  private client?: GoogleGenAI;

  constructor(private readonly configService: ConfigService) {}

  get(): GoogleGenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (!apiKey) {
        throw new ServiceUnavailableException(
          'GEMINI_API_KEY chưa được cấu hình',
        );
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }
}
