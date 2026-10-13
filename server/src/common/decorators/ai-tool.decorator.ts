import { SetMetadata, Type } from '@nestjs/common';

export const AI_TOOL_METADATA_KEY = 'AI_TOOL_METADATA_KEY';

export interface AiToolParameterOption {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface AiToolOptions {
  name?: string;
  description: string;
  parameters?: Record<string, AiToolParameterOption>;
  /** Tham số của model được chuyển thành class này và validate (class-validator) trước khi gọi tool */
  dto?: Type<object>;
  /** Tool ghi dữ liệu: không chạy trong vòng lặp chat, chờ người dùng xác nhận */
  requiresConfirmation?: boolean;
}

/**
 * Hợp đồng: method gắn @AiTool nhận đúng MỘT tham số object (các tham số model gửi lên).
 */
export function AiTool(options: AiToolOptions): MethodDecorator {
  return (
    target: Object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const toolName = options.name || String(propertyKey);
    const metadata: AiToolOptions = {
      ...options,
      name: toolName,
    };

    SetMetadata(AI_TOOL_METADATA_KEY, metadata)(
      target,
      propertyKey,
      descriptor,
    );
  };
}
