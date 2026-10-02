# Documentation: RequestLoggingInterceptor (Pre: log đầu vào & bắt đầu đo thời gian)

## 1. Tổng quan (Overview)

- **ID**: `SER-MID-004`
- **Tên class / file:** `RequestLoggingInterceptor / request-logging.interceptor.ts` (đặt tại `src/common/interceptors/`)
- **Loại component (Type):** `Interceptor` (pha Pre, chạy trước handler)
- **Mục đích:** Ghi nhận thời điểm bắt đầu xử lý request vào context và ghi một dòng log có cấu trúc mô tả request đầu vào (ai gọi, gọi gì, kích thước ra sao). Không ghi nội dung dữ liệu.
- **Phạm vi áp dụng (Scope):** `Global` (đăng ký bằng `APP_INTERCEPTOR`). Route có `@SkipLog()` (ví dụ `/health`) không bị ghi log nhưng vẫn được ghi thời điểm bắt đầu.

> Phạm vi của document: chỉ mô tả **một file** này. Phần log đầu ra và tính thời gian kết thúc nằm ở `SER-MID-005`. Hai interceptor trao đổi với nhau qua khóa `startedAt` trong context của request.

---

## 2. Luồng xử lý (Execution Flow)

```text
Request
  → SER-MID-002 RequestIdMiddleware
  → SER-MID-001 JwtAuthGuard (+ SER-MID-003 JwtStrategy)
  → [SER-MID-004] RequestLoggingInterceptor (Pre)   ← tài liệu này
  → [SER-MID-005] ResponseLoggingInterceptor (Post)
  → ValidationPipe → Controller → Service → ...
```

1. **Kiểm tra loại context:** Nếu không phải `http`, cho đi tiếp ngay.
2. **Ghi thời điểm bắt đầu:** Lưu `process.hrtime.bigint()` vào context với khóa `startedAt`. Bước này luôn chạy, kể cả với route `@SkipLog()`.
3. **Kiểm tra bỏ qua log:** Dùng `Reflector` đọc metadata `@SkipLog()` trên handler và class. Nếu có, bỏ qua bước log.
4. **Trích xuất dữ liệu để log:** `requestId`, `method`, `path` (không kèm query string), `userId` (nếu đã xác thực), `ip`, `user-agent`, `content-length`, danh sách **tên** tham số query và **tên** trường body.
5. **Ghi log:** Một dòng log mức `log` với `event: 'request.received'`.
6. **Quyết định:** Luôn trả `next.handle()`. Interceptor này không chặn request và không ném lỗi.

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs)

| Nguồn (Location) | Tên biến (Key)                 | Kiểu dữ liệu | Bắt buộc | Mô tả                                                    |
| :--------------- | :----------------------------- | :----------- | :------- | :------------------------------------------------------- |
| Request          | `requestId`                    | String       | Có       | Do `SER-MID-002` gán                                     |
| Request          | `user`                         | `AuthUser`   | Không    | Có nếu route đã xác thực; route `@Public()` thì không có |
| Request          | `method`, `path`, `ip`         | String       | Có       | Thông tin HTTP cơ bản                                    |
| Header           | `User-Agent`, `Content-Length` | String       | Không    | Dùng để log                                              |
| Metadata         | `SKIP_LOG_KEY`                 | Boolean      | Không    | Được set bởi `@SkipLog()`                                |

### Dữ liệu gắn thêm vào Request (Request Context / Modifications)

| Tên biến gắn vào Context | Kiểu dữ liệu | Mô tả                                                                                                       |
| :----------------------- | :----------- | :---------------------------------------------------------------------------------------------------------- |
| `startedAt` (CLS)        | `bigint`     | Mốc thời gian bắt đầu (`process.hrtime.bigint()`), `SER-MID-005` và `SER-MID-006` dùng để tính `durationMs` |

**Cấu trúc dòng log `request.received`:**

| Trường          | Kiểu dữ liệu     | Ghi chú                                                       |
| :-------------- | :--------------- | :------------------------------------------------------------ |
| `event`         | String           | Luôn là `request.received`                                    |
| `requestId`     | String (UUID)    |                                                               |
| `method`        | String           |                                                               |
| `path`          | String           | Không kèm query string                                        |
| `userId`        | String \| null   | `null` với route công khai                                    |
| `ip`            | String           |                                                               |
| `userAgent`     | String \| null   |                                                               |
| `contentLength` | Number \| null   |                                                               |
| `queryKeys`     | String[]         | Chỉ tên tham số, không có giá trị                             |
| `bodyKeys`      | String[] \| null | Chỉ tên trường (tối đa 20), `null` nếu body không phải object |

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

Interceptor này **không chủ động trả lỗi** cho client.

| HTTP Code  | Error Code (Nội bộ) | Lý do phát sinh                               | Response Example |
| :--------- | :------------------ | :-------------------------------------------- | :--------------- |
| _Không có_ | _Không có_          | Việc ghi log không được phép làm hỏng request | —                |

Quy ước:

- Code lấy dữ liệu log phải an toàn trước giá trị thiếu (dùng optional chaining, giá trị mặc định `null`), không dùng try/catch để che lỗi.
- Request bị `JwtAuthGuard` từ chối (`401`/`403`) chưa tới interceptor nên **không có** dòng `request.received`. Trường hợp này được ghi bởi `AllExceptionsFilter` (`SER-MID-006`).

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- Không có biến riêng. Mức log chung của ứng dụng (ví dụ `LOG_LEVEL`) do cấu hình logging quyết định.

### Dependencies & Services liên quan

- `Reflector` (NestJS): Đọc metadata `@SkipLog()`.
- `ClsService` (`nestjs-cls`, đã dùng ở `SER-MID-002`): Lưu `startedAt`. Context được định kiểu bằng `AppClsStore`.
- `Logger` (`@nestjs/common`): Ghi log dạng object. Nếu dự án chọn `nestjs-pino` thì không cần đổi code gọi.
- Decorator `@SkipLog()` và hằng `SKIP_LOG_KEY` tại `src/common/decorators/skip-log.decorator.ts`.
- Hàm tiện ích `describeBodyKeys()` tại `src/common/utils/log.util.ts`.

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Kiểu context dùng chung

```typescript
// common/types/cls-store.type.ts
import { ClsStore } from 'nestjs-cls';

export interface AppClsStore extends ClsStore {
  requestId: string;
  startedAt: bigint;
}
```

### Decorator `@SkipLog()`

```typescript
// common/decorators/skip-log.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const SKIP_LOG_KEY = 'skipLog';
export const SkipLog = () => SetMetadata(SKIP_LOG_KEY, true);
```

### Hàm tiện ích mô tả body (không lộ giá trị)

```typescript
// common/utils/log.util.ts
export function describeBodyKeys(body: unknown): string[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return Object.keys(body).slice(0, 20);
}
```

### Cài đặt Interceptor

```typescript
// common/interceptors/request-logging.interceptor.ts
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    this.cls.set('startedAt', process.hrtime.bigint());

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!skip) {
      const req = context.switchToHttp().getRequest<Request>();
      const contentLength = req.get('content-length');

      this.logger.log({
        event: 'request.received',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        userId: req.user?.id ?? null,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
        contentLength: contentLength ? Number(contentLength) : null,
        queryKeys: Object.keys(req.query),
        bodyKeys: describeBodyKeys(req.body),
      });
    }

    return next.handle();
  }
}
```

### Đăng ký ở mức Global (thứ tự quan trọng)

```typescript
// app.module.ts
providers: [
  { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },  // SER-MID-004: đăng ký trước
  { provide: APP_INTERCEPTOR, useClass: ResponseLoggingInterceptor }, // SER-MID-005
],
```

### Bỏ qua log cho một route

```typescript
@SkipLog()
@Public()
@Get('health')
check() {
  return { status: 'ok' };
}
```

---

## 7. Lưu ý & Quy tắc (Notes)

- **Không log dữ liệu nhạy cảm:** `summary.md` yêu cầu không log token, nội dung email hay nội dung chat. Vì vậy chỉ log **tên** trường body và query, không log giá trị. Thêm route mới không cần cấu hình redaction vì giá trị không bao giờ được log.
- **Không log query string nguyên văn:** query có thể chứa mã OAuth (`code`) hoặc token.
- **Đo thời gian bằng `process.hrtime.bigint()`** (đơn điệu, không bị ảnh hưởng khi đồng hồ hệ thống thay đổi), không dùng `Date.now()`.
- **Đăng ký trước `SER-MID-005`:** interceptor đăng ký trước là lớp ngoài cùng, chạy đầu tiên ở pha Pre.
- **Giới hạn đã biết:** mốc `startedAt` được ghi sau guard, nên thời gian xác thực không nằm trong `durationMs`. Request bị từ chối ở guard không có `startedAt`; nếu cần, có thể chuyển việc ghi `startedAt` sang `SER-MID-002`.
- **`req.ip` phía sau reverse proxy / Docker:** cần cấu hình `trust proxy` đúng, nếu không `ip` sẽ là địa chỉ của proxy. Đây là quyết định triển khai, chưa chốt trong dự án.
- Interceptor này không chứa business logic và không gọi service nghiệp vụ.

---

## 8. Test Cases gợi ý

| #   | Tình huống                                   | Kết quả mong đợi                                                   |
| :-- | :------------------------------------------- | :----------------------------------------------------------------- |
| 1   | Request đã xác thực bình thường              | Có 1 dòng `request.received` với `userId` đúng                     |
| 2   | Route `@Public()` không có token             | Có log, `userId` là `null`                                         |
| 3   | Route có `@SkipLog()`                        | Không có log, nhưng `startedAt` vẫn được ghi                       |
| 4   | Body chứa trường nhạy cảm (ví dụ `password`) | Log chỉ chứa tên trường, không chứa giá trị                        |
| 5   | URL có query `?code=abc`                     | `path` không chứa query; `queryKeys` là `["code"]`, không có `abc` |
| 6   | Body là mảng hoặc dữ liệu nhị phân           | `bodyKeys` là `null`                                               |
| 7   | Hai request đồng thời                        | Mỗi request có `startedAt` riêng, không lẫn nhau                   |
| 8   | Request bị `JwtAuthGuard` từ chối            | Không có `request.received` (filter sẽ ghi log lỗi)                |
