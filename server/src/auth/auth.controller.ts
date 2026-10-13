import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: expiresAt.getTime() - Date.now(),
    });
  }

  @ApiOperation({ summary: 'Đăng nhập Master User bằng Email/Password' })
  @ApiResponse({
    status: 200,
    description:
      'Đăng nhập thành công, trả về Access Token và Set-Cookie Refresh Token',
  })
  @ApiResponse({
    status: 401,
    description: 'Email hoặc mật khẩu không chính xác',
  })
  @ApiResponse({ status: 429, description: 'Quá 5 lần đăng nhập mỗi phút' })
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];

    // req.ip: không tin header x-forwarded-for do client tự gửi (chỉ đúng sau proxy khi bật 'trust proxy')
    const result = await this.authService.login(loginDto, userAgent, req.ip);

    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

    return {
      statusCode: HttpStatus.OK,
      message: 'Đăng nhập thành công',
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    };
  }

  @ApiOperation({
    summary:
      'Làm mới Access Token bằng Refresh Token (cookie hoặc body). Refresh Token được xoay vòng sau mỗi lần gọi',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh Token không hợp lệ, hết hạn hoặc đã được sử dụng',
  })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshAccessToken(
    @Req() req: Request,
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Ưu tiên lấy Refresh Token từ HTTP-Only Cookie, nếu không có mới lấy từ Body
    const fromCookie: string | undefined = req.cookies?.[REFRESH_COOKIE];
    const result = await this.authService.refreshAccessToken(
      fromCookie || body?.refreshToken,
    );

    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

    return {
      statusCode: HttpStatus.OK,
      message: 'Làm mới Access Token thành công',
      data: {
        accessToken: result.accessToken,
        // Client không dùng cookie (mobile) nhận token kế nhiệm qua body
        ...(!fromCookie && { refreshToken: result.refreshToken }),
      },
    };
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Đăng xuất phiên hiện tại (hoặc một phiên khác của chính user)',
  })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request & { user: { userId: string; sessionId: string } },
    @Body() body: LogoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, sessionId } = req.user;
    const targetSessionId = body?.sessionId ?? sessionId;

    await this.authService.logout(userId, targetSessionId);

    // Chỉ xóa cookie khi đăng xuất chính phiên đang dùng
    if (targetSessionId === sessionId) {
      res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        path: REFRESH_COOKIE_PATH,
      });
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Đăng xuất thành công',
    };
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lấy thông tin phiên đăng nhập hiện tại' })
  @ApiResponse({
    status: 200,
    description: 'Lấy thông tin phiên đăng nhập thành công',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa xác thực hoặc Token không hợp lệ',
  })
  @Get('session')
  @HttpCode(HttpStatus.OK)
  async getActiveSession(
    @Req() req: Request & { user: { userId: string; sessionId: string } },
  ) {
    const { userId, sessionId } = req.user;
    const sessionData = await this.authService.getActiveSession(
      userId,
      sessionId,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin phiên đăng nhập thành công',
      data: sessionData,
    };
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy URL kết nối tài khoản Google (OAuth2 Consent)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy URL kết nối Google thành công',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @Get('google/connect')
  @HttpCode(HttpStatus.OK)
  async getGoogleConnectUrl(@Req() req: Request & { user: { userId: string } }) {
    const url = this.authService.getGoogleConnectUrl(req.user.userId);

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy URL kết nối tài khoản Google thành công',
      data: { url },
    };
  }

  @ApiOperation({
    summary: 'Xử lý Google OAuth2 Callback và lưu Access/Refresh Token',
  })
  @ApiQuery({
    name: 'code',
    type: String,
    required: true,
    description: 'Authorization Code trả về từ Google',
  })
  @ApiQuery({
    name: 'state',
    type: String,
    required: true,
    description: 'State do server ký khi tạo URL kết nối',
  })
  @ApiResponse({
    status: 200,
    description: 'Kết nối và lưu Token Google thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'code/state không hợp lệ hoặc lấy token thất bại',
  })
  // Google redirect trình duyệt về đây, không có Bearer token: xác thực bằng state đã ký
  @Public()
  @Get('google/callback')
  @HttpCode(HttpStatus.OK)
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const result = await this.authService.handleGoogleCallback(code, state);

    return {
      statusCode: HttpStatus.OK,
      message: 'Kết nối và lưu Token Google thành công',
      data: result,
    };
  }
}
