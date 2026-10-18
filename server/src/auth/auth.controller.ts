import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
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
  @ResponseMessage('Đăng nhập thành công')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];

    // req.ip: không tin header x-forwarded-for do client tự gửi (chỉ đúng sau proxy khi bật 'trust proxy')
    const result = await this.authService.login(loginDto, userAgent, req.ip);

    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

    return { accessToken: result.accessToken, user: result.user };
  }

  @ApiOperation({
    summary:
      'Làm mới Access Token bằng Refresh Token (cookie hoặc body). Refresh Token được xoay vòng sau mỗi lần gọi',
  })
  @ApiResponse({
    status: 200,
    description: 'Làm mới thành công, Set-Cookie Refresh Token mới',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh Token không hợp lệ, hết hạn hoặc đã được sử dụng',
  })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Làm mới Access Token thành công')
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
      accessToken: result.accessToken,
      // Client không dùng cookie (mobile) nhận token kế nhiệm qua body
      ...(!fromCookie && { refreshToken: result.refreshToken }),
    };
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Đăng xuất phiên hiện tại (hoặc một phiên khác của chính user)',
  })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đăng xuất thành công')
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() body: LogoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, sessionId } = user;
    const targetSessionId = body?.sessionId ?? sessionId;

    await this.authService.logout(userId, targetSessionId);

    // Chỉ xóa cookie khi đăng xuất chính phiên đang dùng
    if (targetSessionId === sessionId) {
      res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        path: REFRESH_COOKIE_PATH,
      });
    }
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
  @ResponseMessage('Lấy thông tin phiên đăng nhập thành công')
  getActiveSession(@CurrentUser() { userId, sessionId }: AuthUser) {
    return this.authService.getActiveSession(userId, sessionId);
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
  @ResponseMessage('Lấy URL kết nối tài khoản Google thành công')
  getGoogleConnectUrl(@CurrentUser() user: AuthUser) {
    return { url: this.authService.getGoogleConnectUrl(user.userId) };
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
  @ApiQuery({
    name: 'error',
    type: String,
    required: false,
    description: 'Mã lỗi Google (vd. access_denied khi từ chối ở màn hình đồng ý)',
  })
  @ApiResponse({
    status: 302,
    description:
      'Chuyển hướng về `${CLIENT_URL}/settings?google=connected`, hoặc `?google=error&reason=<missing_code|invalid_state|no_token|exchange_failed|access_denied>` khi lỗi',
  })
  // Google redirect trình duyệt về đây, không có Bearer token: xác thực bằng state đã ký
  @Public()
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string | undefined,
    @Res() res: Response,
  ) {
    const settingsUrl = `${this.configService.getOrThrow<string>('CLIENT_URL')}/settings`;
    // Người dùng từ chối ở màn hình đồng ý: Google gửi ?error=access_denied, không có code
    if (oauthError) {
      return res.redirect(302, `${settingsUrl}?google=error&reason=access_denied`);
    }
    try {
      await this.authService.handleGoogleCallback(code, state);
      return res.redirect(302, `${settingsUrl}?google=connected`);
    } catch (error: any) {
      const reason =
        error instanceof BadRequestException
          ? (error.getResponse() as { reason?: string }).reason
          : undefined;
      this.logger.warn(`Google callback thất bại: ${error?.message}`);
      return res.redirect(
        302,
        `${settingsUrl}?google=error&reason=${reason ?? 'exchange_failed'}`,
      );
    }
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Trạng thái kết nối tài khoản Google' })
  @ApiResponse({
    status: 200,
    description: 'Trả về `{ connected }`: true khi đã có Access Token',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @Get('google/status')
  @ResponseMessage('Lấy trạng thái kết nối Google thành công')
  getGoogleStatus(@CurrentUser() user: AuthUser) {
    return this.authService.getGoogleStatus(user.userId);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Ngắt kết nối Google: thu hồi token tại Google và xóa token đã lưu',
  })
  @ApiResponse({ status: 200, description: 'Đã ngắt kết nối Google' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @Delete('google')
  @ResponseMessage('Đã ngắt kết nối tài khoản Google')
  async disconnectGoogle(@CurrentUser() user: AuthUser) {
    await this.authService.disconnectGoogle(user.userId);
  }
}
