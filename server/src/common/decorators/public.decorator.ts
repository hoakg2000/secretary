import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Đánh dấu route không cần JWT (JwtAuthGuard là guard toàn cục)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
