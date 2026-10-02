# Documentation: RequestIdMiddleware (Gắn Request ID cho mỗi request)

## 1. Tổng quan (Overview)

- **ID**: `SER-MID-002`
- **Tên class / file:** `RequestIdMiddleware / request-id.middleware.ts` (đặt tại `src/common/middlewares/`)
- **Loại component (Type):** `Middleware`
- **Mục đích:** Gắn một ID duy nhất (`requestId`) cho mỗi HTTP request ngay khi request vào hệ thống, trả ID đó về client qua response header, và lưu vào context của request để log, exception filter và response envelope dùng chung. Nhờ đó theo dõi được toàn bộ luồng xử lý từ lúc gọi API đến lúc có response.
- **Phạm vi áp dụng (Scope):** `Global` (áp dụng cho mọi route, đăng ký trong `AppModule.configure()`).

> Phạm vi của document: chỉ mô tả **một file** `request-id.middleware.ts`. Middleware này **không** gắn thông tin User (chạy trước `JwtAuthGuard` nên chưa biết ai đang gọi API). Các thành phần dùng `requestId` như response interceptor, global exception filter, cấu hình logging được mô tả ở document riêng của từng thành phần.

---

## 2. Luồng xử lý (Execution Flow)

1. **Trích xuất dữ liệu:** Đọc header `X-Request-Id` từ request (nếu client hoặc reverse proxy có gửi).
2. **Kiểm tra / Validate:**
   - Nếu header tồn tại, là một chuỗi đơn và đúng định dạng UUID, dùng lại giá trị đó.
   - Nếu không có, nhiều giá trị, hoặc sai định dạng, bỏ qua giá trị client gửi và tự sinh UUID mới bằng `crypto.randomUUID()`. Việc này không gây lỗi và không trả lỗi cho client.
3. **Gán Context:**
   - Gán `request.requestId`.
   - Set header `X-Request-Id` vào response.
   - Lưu `requestId` vào context của request (`ClsService`) để các lớp sau đọc được mà không phải truyền tay qua tham số.
4. **Quyết định:**
   - **Thành công:** Gọi `next()` để request đi tiếp tới `JwtAuthGuard` (SER-MID-001).
   - **Thất bại:** Không có nhánh thất bại. Middleware luôn gọi `next()`, vì luôn có thể sinh ID mới.

```text
Request
  → [SER-MID-002] RequestIdMiddleware   ← ĐẦU CHUỖI
  → [SER-MID-001] JwtAuthGuard
  → ValidationPipe → Controller → Service → ...
  → Response interceptor / Exception filter (đọc requestId để đưa vào meta và log)
```

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs)

| Nguồn (Location) | Tên biến (Key) | Kiểu dữ liệu | Bắt buộc | Mô tả                                                                               |
| :--------------- | :------------- | :----------- | :------- | :---------------------------------------------------------------------------------- |
| Header           | `X-Request-Id` | String       | Không    | ID do client hoặc reverse proxy gửi lên. Chỉ được dùng lại nếu đúng định dạng UUID. |

### Dữ liệu gắn thêm vào Request (Request Context / Modifications)

| Tên biến gắn vào Request / Response | Kiểu dữ liệu    | Mô tả                                                             |
| :---------------------------------- | :-------------- | :---------------------------------------------------------------- |
| `request.requestId`                 | `String (UUID)` | ID định danh request, dùng xuyên suốt vòng đời request            |
| Response header `X-Request-Id`      | `String (UUID)` | Trả về client, giúp đối chiếu khi báo lỗi hoặc tra log            |
| Context key `requestId` (CLS)       | `String (UUID)` | Đọc được ở service, infra, logger mà không cần truyền qua tham số |

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

Middleware này **không chủ động trả lỗi** cho client.

| HTTP Code  | Error Code (Nội bộ) | Lý do phát sinh                                                                        | Response Example |
| :--------- | :------------------ | :------------------------------------------------------------------------------------- | :--------------- |
| _Không có_ | _Không có_          | Header `X-Request-Id` không hợp lệ chỉ khiến middleware tự sinh ID mới, không phải lỗi | —                |

Quy ước:

- Giá trị `X-Request-Id` do client gửi là dữ liệu không đáng tin. Không dùng lại nếu sai định dạng, nhằm tránh chèn ký tự lạ vào log (log injection).
- Nếu `ClsService` chưa có context (cấu hình sai thứ tự đăng ký), đây là lỗi cấu hình của developer, cần phát hiện qua test (mục 8), không xử lý bằng try/catch trong middleware.

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- Không có. Tên header (`X-Request-Id`) là hằng số trong code (`request-id.constants.ts`).

### Dependencies & Services liên quan

- `crypto` (Node.js built-in): `randomUUID()` để sinh ID, không cần cài thêm package.
- `nestjs-cls` (`ClsModule`, `ClsService`): Lưu `requestId` vào context của request qua `AsyncLocalStorage`. Đây là package **[Proposed]**, chưa được dự án xác nhận; có thể thay bằng cách tự dùng `AsyncLocalStorage`.
- Khai báo kiểu cho `Request` (type augmentation) để `request.requestId` có kiểu `string`.

> Điều kiện: `ClsModule` phải được đăng ký trong `AppModule` và context của request phải được khởi tạo trước khi `RequestIdMiddleware` chạy.

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Cài đặt Middleware

```typescript
// common/middlewares/request-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';

const REQUEST_ID_HEADER = 'x-request-id';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && UUID_REGEX.test(incoming)
        ? incoming
        : randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    this.cls.set('requestId', requestId);

    next();
  }
}
```

### Khai báo kiểu cho Request

```typescript
// common/types/express.d.ts
declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}
```

### Đăng ký ở mức Global

```typescript
// app.module.ts
@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: true } })],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    // NestJS 11 (Express 5): dùng forRoutes('{*splat}') thay cho '*'
  }
}
```

### Đọc requestId ở các lớp phía sau

```typescript
// Ở service / infra / logger
const requestId = this.cls.get<string>('requestId');

// Ở response interceptor / exception filter
const requestId = request.requestId; // đưa vào meta.requestId của envelope
```

---

## 7. Lưu ý & Quy tắc (Notes)

- Middleware phải chạy **đầu chuỗi**, trước `JwtAuthGuard`, để cả request bị từ chối với `401` vẫn có `requestId` trong error envelope và log.
- Tên biến thống nhất là `requestId` (khớp `meta.requestId` trong envelope của `summary.md`), không dùng `traceId`.
- Không gắn thông tin User ở middleware này. Nếu sau này cần `userId` trong log thì bổ sung ở bước sau khi guard xác thực xong, và mô tả trong document riêng.
- Background job (cron) không đi qua HTTP middleware; mỗi lần chạy tự sinh `runId` riêng theo quy ước ở mục 6.5 của `summary.md`.
- Tách ID ra khỏi dữ liệu nhạy cảm: `requestId` chỉ là UUID ngẫu nhiên, không chứa thông tin người dùng.
- `nestjs-cls` và các thông số khác thuộc nhóm **[Proposed]**, cần được xác nhận trước khi thành quy tắc chính thức.

---

## 8. Test Cases gợi ý

| #   | Tình huống                                              | Kết quả mong đợi                                                      |
| :-- | :------------------------------------------------------ | :-------------------------------------------------------------------- |
| 1   | Request không có header `X-Request-Id`                  | Sinh UUID mới; `request.requestId` và response header có cùng giá trị |
| 2   | Request có `X-Request-Id` là UUID hợp lệ                | Dùng lại đúng giá trị client gửi                                      |
| 3   | `X-Request-Id` sai định dạng (chuỗi tùy ý, có ký tự lạ) | Bỏ qua, sinh UUID mới                                                 |
| 4   | `X-Request-Id` bị gửi nhiều lần (mảng giá trị)          | Bỏ qua, sinh UUID mới                                                 |
| 5   | Request bị `JwtAuthGuard` từ chối (`401`)               | Response vẫn có header `X-Request-Id` và `meta.requestId`             |
| 6   | Hai request đồng thời                                   | Mỗi request có `requestId` riêng, không lẫn nhau trong CLS            |
| 7   | Service gọi `cls.get('requestId')` trong cùng request   | Trả về đúng ID của request đó                                         |
