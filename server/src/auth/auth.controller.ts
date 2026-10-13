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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    const result = await this.authService.login(loginDto, userAgent, ipAddress);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Đăng nhập thành công',
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    };
  }

  @ApiBearerAuth('JWT-auth') // Đánh dấu endpoint cần Bearer Access Token
  @ApiOperation({ summary: 'Lấy thông tin phiên làm việc hiện tại' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshAccessToken(@Req() req: Request, @Body() body: RefreshTokenDto) {
    // Ưu tiên lấy Refresh Token từ HTTP-Only Cookie, nếu không có mới lấy từ Body
    const refreshToken = req.cookies?.['refreshToken'] || body.refreshToken;

    const result = await this.authService.refreshAccessToken(refreshToken);

    return {
      statusCode: HttpStatus.OK,
      message: 'Làm mới Access Token thành công',
      data: result,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request & { user: { userId: string; sessionId: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refreshToken'];
    const { userId, sessionId } = req.user;

    await this.authService.logout(userId, sessionId, refreshToken);

    // Xóa HTTP-Only Cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      path: '/api/v1/auth',
    });

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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @Get('google/connect')
  @HttpCode(HttpStatus.OK)
  async getGoogleConnectUrl() {
    const url = this.authService.getGoogleConnectUrl();

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
  @ApiResponse({
    status: 200,
    description: 'Kết nối và lưu Token Google thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Mã code không hợp lệ hoặc lấy token thất bại',
  })
  @Get('google/callback')
  @HttpCode(HttpStatus.OK)
  async handleGoogleCallback(@Query('code') code: string) {
    const result = await this.authService.handleGoogleCallback(code);

    return {
      statusCode: HttpStatus.OK,
      message: 'Kết nối và lưu Token Google thành công',
      data: result,
    };
  }
}
