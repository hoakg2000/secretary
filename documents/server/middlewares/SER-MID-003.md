# Documentation: JwtStrategy (Giải mã token & Validate user)

## 1. Tổng quan (Overview)

- **ID**: `SER-MID-003`
- **Tên class / file:** `JwtStrategy / jwt.strategy.ts` (đặt tại `src/modules/auth/strategies/`)
- **Loại component (Type):** `Guard` (Passport Strategy, được `JwtAuthGuard` SER-MID-001 gọi)
- **Mục đích:** Giải mã và xác minh access token (chữ ký, thời hạn, thuật toán), kiểm tra payload đúng cấu trúc, xác nhận người dùng trong token vẫn còn tồn tại và còn được phép truy cập hệ thống, sau đó trả về `AuthUser` để Passport gán vào `request.user`.
- **Phạm vi áp dụng (Scope):** `Global` (strategy tên `jwt`, áp dụng cho mọi route không gắn `@Public()`).

> Phân chia trách nhiệm với SER-MID-001:
>
> - `SER-MID-001` (`JwtAuthGuard`): quyết định route có cần xác thực không (`@Public()`), gọi strategy, và chuyển kết quả thành lỗi chuẩn.
> - `SER-MID-003` (`JwtStrategy`): xác minh token và xác minh người dùng.

---

## 2. Luồng xử lý (Execution Flow)

1. **Trích xuất dữ liệu:** `ExtractJwt.fromAuthHeaderAsBearerToken()` lấy token từ header `Authorization: Bearer <token>`.
2. **Kiểm tra / Validate token:** `passport-jwt` verify chữ ký bằng `JWT_SECRET`, chỉ chấp nhận thuật toán `HS256`, không bỏ qua thời hạn (`ignoreExpiration: false`). Token thiếu, sai chữ ký hoặc hết hạn khiến Passport báo thất bại, `JwtAuthGuard` chuyển thành `AUTH_002`.
3. **Validate payload:** Parse payload bằng Zod schema `jwtPayloadSchema` (`sub`, `email`). Sai cấu trúc thì ném `AUTH_002`.
4. **Validate người dùng:** Gọi `UserService.findAuthUserById(sub)`:
   - Không tìm thấy người dùng: ném `AUTH_002` (401), thông báo chung, không tiết lộ lý do.
   - Người dùng tồn tại nhưng bị vô hiệu hóa: ném `AUTH_004` (403).
5. **Gán Context:** Trả về `AuthUser { id, email }`. Passport tự gán vào `request.user`.
6. **Quyết định:**
   - **Thành công:** Trả `AuthUser`, request đi tiếp.
   - **Thất bại:** Ném `AppException`. Lỗi hạ tầng (ví dụ DB không truy cập được) được để nguyên, không đổi thành lỗi xác thực.

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs)

| Nguồn (Location) | Tên biến (Key)  | Kiểu dữ liệu | Bắt buộc | Mô tả                                  |
| :--------------- | :-------------- | :----------- | :------- | :------------------------------------- |
| Header           | `Authorization` | String       | Có       | Token dạng `Bearer <JWT_ACCESS_TOKEN>` |

**Payload JWT mong đợi (`jwtPayloadSchema`):**

| Trường  | Kiểu dữ liệu | Bắt buộc | Mô tả               |
| :------ | :----------- | :------- | :------------------ |
| `sub`   | String       | Có       | ID người dùng       |
| `email` | String       | Có       | Email người dùng    |
| `iat`   | Number       | Có       | Thời điểm phát hành |
| `exp`   | Number       | Có       | Thời điểm hết hạn   |

### Dữ liệu gắn thêm vào Request (Request Context / Modifications)

| Tên biến gắn vào Request | Kiểu dữ liệu | Mô tả                                                                           |
| :----------------------- | :----------- | :------------------------------------------------------------------------------ |
| `request.user`           | `AuthUser`   | `{ id: string; email: string }`. Không chứa password hash hay token của Google. |

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

| HTTP Code          | Error Code (Nội bộ) | Lý do phát sinh                                                                      | Response Example                                                                                                                               |
| :----------------- | :------------------ | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `401 Unauthorized` | `AUTH_002`          | Token thiếu, sai chữ ký, hết hạn; payload sai cấu trúc; người dùng không còn tồn tại | `{"success": false, "error": {"code": "AUTH_002", "message": "Access token is missing, invalid, or expired", "details": null}, "meta": {...}}` |
| `403 Forbidden`    | `AUTH_004`          | Token hợp lệ, người dùng tồn tại nhưng bị vô hiệu hóa                                | `{"success": false, "error": {"code": "AUTH_004", "message": "Access denied", "details": null}, "meta": {...}}`                                |
| `500` (qua filter) | `COMMON_500`        | Lỗi hạ tầng khi tra cứu người dùng (ví dụ DB lỗi), không phải lỗi xác thực           | Do `AllExceptionsFilter` (SER-MID-006) trả về                                                                                                  |

Quy ước:

- Strategy ném `AppException`; `JwtAuthGuard.handleRequest()` phải **ném lại nguyên** mọi lỗi nhận được từ strategy để `AUTH_004` và lỗi hạ tầng không bị ghi đè thành `AUTH_002` (đã cập nhật trong SER-MID-001).
- Thông báo trả client luôn chung chung. Lý do chi tiết chỉ nằm trong `cause`, chỉ ghi vào log nội bộ.
- Không bao giờ log nội dung token.

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- `JWT_SECRET`: Khóa bí mật dùng để verify token. Validate bằng Zod khi khởi động, độ dài tối thiểu 32 ký tự.

### Dependencies & Services liên quan

- `@nestjs/passport` + `passport-jwt`: Nền tảng strategy.
- `@nestjs/config` (`ConfigService` có kiểu `Env` suy ra từ Zod schema): Đọc `JWT_SECRET`.
- `UserService.findAuthUserById(id)`: Trả về `{ id, email, isActive }` hoặc `null`. Chỉ `select` các trường cần thiết, đi qua `UserRepository`.
- `Zod`: Validate payload.
- `AppException` và registry mã lỗi `AUTH_*`.
- Kiểu `AuthUser` đặt tại `src/common/types/auth-user.type.ts` (không đặt trong module `auth`, vì `common/` không được phụ thuộc module nghiệp vụ).

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Zod schema cho payload

```typescript
// modules/auth/schemas/jwt-payload.schema.ts
import { z } from 'zod';

export const jwtPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  iat: z.number(),
  exp: z.number(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
```

### Cài đặt Strategy

```typescript
// modules/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: unknown): Promise<AuthUser> {
    const parsed = jwtPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppException({
        code: 'AUTH_002',
        httpStatus: 401,
        message: 'Access token is missing, invalid, or expired',
        cause: parsed.error,
      });
    }

    const user = await this.userService.findAuthUserById(parsed.data.sub);
    if (!user) {
      throw new AppException({
        code: 'AUTH_002',
        httpStatus: 401,
        message: 'Access token is missing, invalid, or expired',
      });
    }
    if (!user.isActive) {
      throw new AppException({
        code: 'AUTH_004',
        httpStatus: 403,
        message: 'Access denied',
      });
    }

    return { id: user.id, email: user.email };
  }
}
```

### Khai báo kiểu cho `request.user`

```typescript
// common/types/auth-user.type.ts
export interface AuthUser {
  id: string;
  email: string;
}

// common/types/express.d.ts
declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}
```

### Đăng ký trong AuthModule

```typescript
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
        },
      }),
    }),
    UserModule,
  ],
  providers: [JwtStrategy, AuthService],
})
export class AuthModule {}
```

---

## 7. Lưu ý & Quy tắc (Notes)

- **Cố định thuật toán** (`algorithms: ['HS256']`) để tránh tấn công nhầm lẫn thuật toán (algorithm confusion).
- **Luôn kiểm tra người dùng trong DB** dù token còn hạn, để tài khoản bị xóa hoặc vô hiệu hóa mất quyền ngay. Hệ thống chỉ có một người dùng nên một truy vấn nhẹ cho mỗi request là chấp nhận được, chưa cần cache.
- Trường `isActive` trong `User` là **[Proposed]**, chưa có trong tài liệu dự án; nếu schema không có trạng thái vô hiệu hóa thì bỏ nhánh `AUTH_004` ở bước 4.
- Khi bổ sung refresh token (Open Decision #4 trong `summary.md`), cần thêm claim phân biệt loại token (ví dụ `type: 'access' | 'refresh'`) và strategy này phải từ chối refresh token.
- Có thể bổ sung `issuer` và `audience` khi hệ thống có nhiều thành phần cùng phát hành token.
- Strategy không chứa business logic. Việc tra cứu người dùng nằm ở `UserService`.
- Các thông số cụ thể (độ dài secret, `isActive`) thuộc nhóm **[Proposed]**.

---

## 8. Test Cases gợi ý

| #   | Tình huống                                              | Kết quả mong đợi                        |
| :-- | :------------------------------------------------------ | :-------------------------------------- |
| 1   | Token hợp lệ, người dùng tồn tại và đang hoạt động      | Trả `AuthUser`, `request.user` được gán |
| 2   | Không có header `Authorization`                         | `401` / `AUTH_002`                      |
| 3   | Token sai chữ ký                                        | `401` / `AUTH_002`                      |
| 4   | Token hết hạn                                           | `401` / `AUTH_002`                      |
| 5   | Token ký bằng thuật toán khác `HS256` (ví dụ `none`)    | `401` / `AUTH_002`                      |
| 6   | Payload thiếu `sub` hoặc `email` sai định dạng          | `401` / `AUTH_002`                      |
| 7   | Token hợp lệ nhưng người dùng đã bị xóa                 | `401` / `AUTH_002`                      |
| 8   | Token hợp lệ, người dùng bị vô hiệu hóa                 | `403` / `AUTH_004`                      |
| 9   | DB lỗi khi tra cứu người dùng                           | `500` / `COMMON_500` (không phải `401`) |
| 10  | `request.user` không chứa trường nhạy cảm (hash, token) | Chỉ có `id` và `email`                  |
