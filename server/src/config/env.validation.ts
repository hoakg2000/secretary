import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
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

  @IsString()
  CLIENT_URL: string = 'http://localhost:3000';

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
  FISH_AUDIO_API_KEY?: string;

  @IsOptional()
  @IsString()
  FISH_AUDIO_DEFAULT_VOICE_ID?: string;

  @IsOptional()
  @IsString()
  TOKEN_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsInt()
  BULLMQ_CONCURRENCY?: number;

  @IsOptional()
  @IsString()
  CALENDAR_SYNC_CRON?: string;

  @IsOptional()
  @IsString()
  APP_TIMEZONE?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_CHAT_ID?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated);

  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${details}`);
  }

  return validated;
}
