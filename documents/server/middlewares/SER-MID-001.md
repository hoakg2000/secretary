# Documentation: JwtAuthGuard (Kiểm tra xác thực & quyền truy cập API)

## 1. Tổng quan (Overview)

- **ID**: `SER-MID-001`
- **Tên class / file:** `JwtAuthGuard / jwt-auth.guard.ts` (đặt tại `src/common/guards/`)
- **Loại component (Type):** `Guard`
- **Mục đích:** Kiểm tra request đến có mang access token (JWT) hợp lệ hay không, và người dùng tương ứng có quyền truy cập API hiện tại hay không. Request hợp lệ được đi tiếp tới Controller, ngược lại bị chặn và trả lỗi chuẩn.
- **Phạm vi áp dụng (Scope):** `Global` (đăng ký qua `APP_GUARD`). Các route công khai (ví dụ: đăng nhập Google, `/health`) opt-out bằng decorator `@Public()`.

> Ghi chú: Hệ thống chỉ phục vụ một người dùng (single user), nên guard này tập trung vào **xác thực (authentication)**. Tầng phân quyền theo vai trò (`@Roles()`) chưa cần thiết; lỗi `403` chỉ dùng cho trường hợp tài khoản đã xác thực nhưng không được phép truy cập.

---

## 2. Luồng xử lý (Execution Flow)

```text
Request
  → JwtAuthGuard.canActivate()
      → Có @Public()?  ── Có ──→ cho đi tiếp
      │
      └─ Không → Passport JWT Strategy
            → Lấy Bearer Token → Verify → Validate user
            → Thành công: gán request.user → Controller
            → Thất bại: throw AppException → Global Exception Filter → error envelope
```

1. **Kiểm tra route công khai:** Dùng `Reflector` đọc metadata `@Public()` trên handler và class. Nếu có, `return true` ngay, không kiểm tra token.
2. **Trích xuất dữ liệu:** Lấy Bearer Token từ header `Authorization` (`Authorization: Bearer <JWT_ACCESS_TOKEN>`).
3. **Kiểm tra / Validate:**
   - Verify chữ ký và thời hạn token bằng `JWT_SECRET` (qua `passport-jwt` + `@nestjs/jwt`).
   - Kiểm tra payload có đủ trường bắt buộc (`sub`, `email`).
   - Kiểm tra người dùng (`sub`) còn tồn tại và được phép truy cập hệ thống.
4. **Gán Context:** Gán thông tin người dùng đã xác thực vào `request.user` để Controller lấy qua decorator `@CurrentUser()`.
5. **Quyết định:**
   - **Thành công:** Cho phép Request đi tiếp (`return true`).
   - **Thất bại:** Ném `AppException` với mã lỗi tương ứng (mục 4). Guard **không** tự try/catch hay tự build response; Global Exception Filter chịu trách nhiệm trả về error envelope.

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs)

| Nguồn (Location) | Tên biến (Key)  | Kiểu dữ liệu | Bắt buộc | Mô tả                                                            |
| :--------------- | :-------------- | :----------- | :------- | :--------------------------------------------------------------- |
| Header           | `Authorization` | String       | Có\*     | Token dạng `Bearer <JWT_ACCESS_TOKEN>`                           |
| Metadata         | `IS_PUBLIC_KEY` | Boolean      | Không    | Được set bởi `@Public()`; nếu `true` thì bỏ qua toàn bộ kiểm tra |

\* Bắt buộc với mọi route không gắn `@Public()`.

**Payload JWT mong đợi:**

| Trường  | Kiểu dữ liệu | Mô tả               |
| :------ | :----------- | :------------------ |
| `sub`   | String       | ID người dùng       |
| `email` | String       | Email người dùng    |
| `iat`   | Number       | Thời điểm phát hành |
| `exp`   | Number       | Thời điểm hết hạn   |

### Dữ liệu gắn thêm vào Request (Request Context / Modifications)

| Tên biến gắn vào Request | Kiểu dữ liệu | Mô tả                                                 |
| :----------------------- | :----------- | :---------------------------------------------------- |
| `request.user`           | `AuthUser`   | Thông tin người dùng sau khi xác thực (`id`, `email`) |

> `request.requestId` do middleware đầu chuỗi gán (không thuộc trách nhiệm của guard này); guard chỉ đọc để ghi log khi từ chối request.

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

Guard ném `AppException`; Global Exception Filter chuyển thành response theo error envelope chung của dự án.

| HTTP Code          | Error Code (Nội bộ) | Lý do phát sinh                                                                     | Response Example                                                                                                                               |
| :----------------- | :------------------ | :---------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `401 Unauthorized` | `AUTH_002`          | Thiếu header `Authorization`, sai định dạng Bearer, token không hợp lệ hoặc hết hạn | `{"success": false, "error": {"code": "AUTH_002", "message": "Access token is missing, invalid, or expired", "details": null}, "meta": {...}}` |
| `403 Forbidden`    | `AUTH_004`          | Đã xác thực nhưng người dùng không được phép truy cập tài nguyên này                | `{"success": false, "error": {"code": "AUTH_004", "message": "Access denied", "details": null}, "meta": {...}}`                                |

Quy ước:

- Thông báo lỗi luôn chung chung, **không** tiết lộ nguyên nhân chi tiết (token sai chữ ký hay hết hạn) cho client; chi tiết chỉ ghi vào log nội bộ.
- Không bao giờ log nội dung token.
- `429 Too Many Requests` (`COMMON_004`) thuộc về rate limiting (`@nestjs/throttler`), **không** nằm trong phạm vi guard này.

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- `JWT_SECRET`: Khóa bí mật dùng để verify access token.
- `JWT_ACCESS_EXPIRES_IN`: Thời gian sống của access token (nên ngắn, ví dụ `15m`).

Các biến này được validate bằng Zod schema khi khởi động app (fail fast) và phải có trong `.env.example`.

### Dependencies & Services liên quan

- `Reflector` (NestJS): Đọc metadata `@Public()`.
- `JwtStrategy` (`@nestjs/passport` + `passport-jwt`, xem `SER-MID-003`): Trích xuất và verify token, validate người dùng, trả về `AuthUser`. Lỗi từ strategy (ví dụ `AUTH_004`) được `handleRequest()` giữ nguyên.
- `@nestjs/jwt` (`JwtModule`): Cấu hình secret và thời hạn token.
- `UserService`: Kiểm tra người dùng còn tồn tại (trong `validate()` của strategy).
- `AppException` + registry mã lỗi `AUTH_*`: Chuẩn hóa lỗi trả về.
- Decorator đi kèm: `@Public()`, `@CurrentUser()` (đặt tại `src/common/decorators/`).

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Đăng ký Guard ở mức Global

```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
```

### Cài đặt Guard

```typescript
// common/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    info?: unknown,
  ): TUser {
    // Lỗi từ JwtStrategy.validate() (AUTH_004 hoặc lỗi hạ tầng): giữ nguyên, không ghi đè
    if (err) throw err;
    if (!user) {
      throw new AppException({
        code: 'AUTH_002',
        httpStatus: 401,
        message: 'Access token is missing, invalid, or expired',
        cause: info,
      });
    }
    return user;
  }
}
```

### Mở route công khai bằng `@Public()`

```typescript
// common/decorators/public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// auth.controller.ts
@Controller('auth')
export class AuthController {
  @Public()
  @Post('google')
  loginWithGoogle(@Body() dto: GoogleLoginRequestDto) {
    return this.authService.loginWithGoogle(dto);
  }
}
```

### Lấy người dùng đã xác thực trong Controller

```typescript
@Controller('chat')
export class ChatController {
  @Get('history')
  getHistory(@CurrentUser() user: AuthUser) {
    // user đã được JwtAuthGuard xác thực và gán vào request
    return this.chatService.getHistory(user.id);
  }
}
```

---

## 7. Lưu ý & Quy tắc (Notes)

- Mặc định **mọi route đều yêu cầu xác thực**; chỉ opt-out bằng `@Public()` một cách tường minh và phải được review.
- Guard chỉ quyết định cho phép/từ chối; không chứa business logic và không truy cập DB trực tiếp (việc kiểm tra user nằm trong `JwtStrategy.validate()` thông qua service).
- Refresh-token chưa được chốt trong tài liệu dự án (Open Decision #4); guard này chỉ xử lý **access token**.
- Các thông số cụ thể (tên biến môi trường, thời hạn token, mã lỗi) thuộc nhóm **[Proposed]** trong `summary.md` và cần được xác nhận trước khi thành quy tắc chính thức.

---

## 8. Test Cases gợi ý

| #   | Tình huống                                      | Kết quả mong đợi                     |
| :-- | :---------------------------------------------- | :----------------------------------- |
| 1   | Route `@Public()`, không có token               | Cho đi tiếp                          |
| 2   | Route bảo vệ, không có header `Authorization`   | `401` / `AUTH_002`                   |
| 3   | Header sai định dạng (không có `Bearer`)        | `401` / `AUTH_002`                   |
| 4   | Token sai chữ ký                                | `401` / `AUTH_002`                   |
| 5   | Token hết hạn                                   | `401` / `AUTH_002`                   |
| 6   | Token hợp lệ nhưng người dùng không còn tồn tại | `401` / `AUTH_002`                   |
| 7   | Token hợp lệ, người dùng không được phép        | `403` / `AUTH_004`                   |
| 8   | Token hợp lệ, người dùng hợp lệ                 | Cho đi tiếp, `request.user` được gán |
