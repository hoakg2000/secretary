import { Transform, plainToInstance } from 'class-transformer';
import {
  IsBase64,
  IsInt,
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  // ---- Required ----
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsInt()
  REDIS_PORT: number;

  // ---- Optional with defaults ----
  @IsInt()
  PORT: number = 3000;

  @IsString()
  NODE_ENV: string = 'development';

  @IsString()
  JWT_EXPIRES_IN: string = '15m';

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  // Bỏ dấu / cuối: origin CORS không có nó và redirect nối thêm '/settings'
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\/+$/, '') : value,
  )
  @IsUrl({ require_tld: false })
  CLIENT_URL: string = 'http://localhost:3001';

  // ---- Optional, feature-gated ----
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_REDIRECT_URI?: string;

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_EMBEDDING_MODEL?: string;

  @IsOptional()
  @IsString()
  MOT_API_KEY?: string;

  @IsOptional()
  @IsString()
  FISH_AUDIO_API_KEY?: string;

  // 32 bytes, base64 (44 ký tự). Bắt buộc khi bật Google OAuth vì token Google được mã hóa trước khi lưu
  @ValidateIf((env: EnvironmentVariables) => !!env.GOOGLE_CLIENT_ID)
  @IsBase64()
  @Length(44, 44)
  TOKEN_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsInt()
  BULLMQ_CONCURRENCY?: number;

  // Tiền tố khóa Redis của BullMQ (mặc định 'bull'); đặt khác để tách worker giữa các môi trường
  @IsOptional()
  @IsString()
  BULLMQ_PREFIX?: string;

  @IsOptional()
  @IsString()
  CALENDAR_SYNC_CRON?: string;

  @IsOptional()
  @IsString()
  APP_TIMEZONE: string = 'Asia/Ho_Chi_Minh';

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_CHAT_ID?: string;

  // Chỉ đặt khi chạy sau reverse proxy: số hop hoặc danh sách IP/subnet (Express 'trust proxy')
  @IsOptional()
  @IsString()
  @IsNotIn(['true', 'false'], {
    message: 'TRUST_PROXY must be a proxy count or a list of addresses',
  })
  TRUST_PROXY?: string;

  // Gmail Pub/Sub push: thiếu một trong ba thì POST /email/pubsub trả 503
  @IsOptional()
  @IsString()
  GMAIL_PUBSUB_TOPIC?: string;

  @IsOptional()
  @IsString()
  PUBSUB_PUSH_AUDIENCE?: string;

  @IsOptional()
  @IsString()
  PUBSUB_PUSH_SERVICE_ACCOUNT?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated);

  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration — ${details}`);
  }

  return validated;
}
