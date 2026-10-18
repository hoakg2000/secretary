import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'responseMessage';

export type ResponseMessageValue = string | ((data: any) => string);

// Thông điệp trong envelope { statusCode, message, data }; hàm nhận data khi message phụ thuộc kết quả.
// Handler không gắn decorator này (SSE, @Res()) không bị bọc
export const ResponseMessage = (message: ResponseMessageValue) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
