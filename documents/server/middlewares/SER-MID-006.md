# Documentation: AllExceptionsFilter (Global Exception Filter)

## 1. Tổng quan (Overview)

- **ID**: `SER-MID-006`
- **Tên class / file:** `AllExceptionsFilter / all-exceptions.filter.ts` (đặt tại `src/common/filters/`)
- **Loại component (Type):** `Exception Filter`
- **Mục đích:** Bắt mọi lỗi phát sinh trong quá trình xử lý request, chuyển về một định dạng error envelope thống nhất với mã lỗi ổn định, ghi log lỗi kèm `requestId`, và không bao giờ để lộ stack trace, SQL, thông báo của dịch vụ ngoài hay token ra client.
- **Phạm vi áp dụng (Scope):** `Global` (đăng ký bằng `APP_FILTER` trong `AppModule`).

> Controller và service không dùng try/catch để trả lỗi. Chúng ném `AppException` và để filter này xử lý.

---

## 2. Luồng xử lý (Execution Flow)

```text
Middleware / Guard / Interceptor / Pipe / Controller / Service
        │  (ném lỗi bất kỳ)
        ▼
[SER-MID-006] AllExceptionsFilter
   1. Chuẩn hóa lỗi → { code, httpStatus, message, details }
   2. Ghi log (request.failed)
   3. Trả error envelope
```

1. **Kiểm tra loại context:** Nếu không phải `http`, ném lại lỗi (filter này chỉ xử lý HTTP).
2. **Chuẩn hóa lỗi** theo thứ tự ưu tiên:

   | Thứ tự | Loại lỗi                               | Kết quả                                                                            |
   | :----- | :------------------------------------- | :--------------------------------------------------------------------------------- |
   | 1      | `AppException`                         | Dùng nguyên `code`, `httpStatus`, `message`, `details` của nó                      |
   | 2      | `Prisma.PrismaClientKnownRequestError` | `P2002` → `COMMON_003` (409); `P2025` → `COMMON_002` (404); mã khác → `COMMON_500` |
   | 3      | `HttpException` của Nest               | Ánh xạ theo status (bảng bên dưới)                                                 |
   | 4      | Mọi lỗi còn lại                        | `COMMON_500` (500), thông báo chung                                                |

   **Ánh xạ `HttpException` theo status:**

   | HTTP status          | Error Code   | Ghi chú                                                               |
   | :------------------- | :----------- | :-------------------------------------------------------------------- |
   | 400                  | `COMMON_001` | Nếu `message` là mảng (lỗi `class-validator`), đưa mảng vào `details` |
   | 401                  | `AUTH_002`   |                                                                       |
   | 403                  | `AUTH_004`   |                                                                       |
   | 404                  | `COMMON_002` | Gồm cả trường hợp route không tồn tại                                 |
   | 409                  | `COMMON_003` |                                                                       |
   | 429                  | `COMMON_004` |                                                                       |
   | 4xx khác (413, 415…) | `COMMON_001` | Giữ nguyên HTTP status gốc                                            |
   | 5xx                  | `COMMON_500` | Thông báo chung                                                       |

3. **Gán Context:** Lấy `requestId` từ context (`ClsService`), nếu không có thì từ `request.requestId`.
4. **Ghi log:** `event: 'request.failed'` kèm `requestId`, `method`, `path`, `userId`, `statusCode`, `errorCode`, `durationMs`.
   - Lỗi 5xx: mức `error`, kèm stack và nguyên nhân gốc.
   - Lỗi 4xx: mức `warn`, không kèm stack.
5. **Quyết định:** Trả error envelope với HTTP status tương ứng qua `HttpAdapterHost`. Filter không ném lỗi tiếp.

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs)

| Nguồn (Location) | Tên biến (Key)    | Kiểu dữ liệu | Bắt buộc | Mô tả                                               |
| :--------------- | :---------------- | :----------- | :------- | :-------------------------------------------------- |
| Exception        | _(đối tượng lỗi)_ | `unknown`    | Có       | Bất kỳ giá trị nào bị ném ra                        |
| Request          | `requestId`       | String       | Không    | Do `SER-MID-002` gán                                |
| Request          | `user`            | `AuthUser`   | Không    | Dùng để lấy `userId` trong log                      |
| Context (CLS)    | `startedAt`       | `bigint`     | Không    | Do `SER-MID-004` ghi; thiếu thì `durationMs = null` |

### Dữ liệu gắn thêm vào Request (Request Context / Modifications)

Filter không thay đổi request. Output là **error envelope**:

```json
{
  "success": false,
  "error": {
    "code": "COMMON_001",
    "message": "Request validation failed",
    "details": [{ "field": "email", "messages": ["email must be an email"] }]
  },
  "meta": {
    "requestId": "7b0f4e0a-5f55-4c63-8d3b-5d1a2f9e9a10",
    "timestamp": "2026-10-02T08:30:00.000Z"
  }
}
```

| Trường           | Kiểu dữ liệu      | Mô tả                                                         |
| :--------------- | :---------------- | :------------------------------------------------------------ |
| `success`        | Boolean           | Luôn `false`                                                  |
| `error.code`     | String            | Mã từ registry (`<DOMAIN>_<NNN>`), ổn định, không tái sử dụng |
| `error.message`  | String            | Thông báo an toàn cho người dùng                              |
| `error.details`  | Any \| null       | Chi tiết an toàn (ví dụ lỗi từng trường); `null` nếu không có |
| `meta.requestId` | String \| null    | Cùng giá trị với header `X-Request-Id`                        |
| `meta.timestamp` | String (ISO 8601) | Thời điểm tạo response                                        |

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

Filter này là nơi duy nhất chuyển lỗi thành response. Các mã sau lấy từ registry trong `summary.md` (mục 6.4):

| HTTP Code                   | Error Code (Nội bộ)                          | Lý do phát sinh                                           | Response Example (rút gọn)                                                               |
| :-------------------------- | :------------------------------------------- | :-------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| `400 Bad Request`           | `COMMON_001`                                 | Request không hợp lệ                                      | `{"error": {"code": "COMMON_001", "message": "Request validation failed", ...}}`         |
| `401 Unauthorized`          | `AUTH_002`                                   | Chưa xác thực / token không hợp lệ                        | `{"error": {"code": "AUTH_002", ...}}`                                                   |
| `403 Forbidden`             | `AUTH_004`                                   | Không có quyền                                            | `{"error": {"code": "AUTH_004", ...}}`                                                   |
| `404 Not Found`             | `COMMON_002`                                 | Không có tài nguyên hoặc route; Prisma `P2025`            | `{"error": {"code": "COMMON_002", "message": "Resource not found", ...}}`                |
| `409 Conflict`              | `COMMON_003`                                 | Xung đột dữ liệu; Prisma `P2002`                          | `{"error": {"code": "COMMON_003", "message": "Resource already exists", ...}}`           |
| `429 Too Many Requests`     | `COMMON_004`                                 | Vượt giới hạn tần suất                                    | `{"error": {"code": "COMMON_004", ...}}`                                                 |
| `500 Internal Server Error` | `COMMON_500`                                 | Lỗi không lường trước                                     | `{"error": {"code": "COMMON_500", "message": "Internal server error", "details": null}}` |
| `502/504/422`...            | `AI_*`, `GOOGLE_*`, `TTS_*`, `VECTOR_*`, ... | Lỗi do `AppException` từ các lớp `infra/*` hoặc nghiệp vụ | Dùng đúng `code` và `httpStatus` mà `AppException` mang theo                             |

Quy ước:

- **Không bao giờ** trả ra client: stack trace, nội dung SQL, `meta.target` của Prisma, thông báo gốc của vendor, token, `cause`.
- Với 5xx và lỗi không xác định, `message` luôn là thông báo chung; thông tin thật chỉ có trong log.
- Giá trị trong `details` phải do code của dự án tạo ra (lỗi từng trường, dữ liệu an toàn), không chuyển tiếp dữ liệu thô từ lỗi bên ngoài.

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- Không có biến riêng.

### Dependencies & Services liên quan

- `HttpAdapterHost` (`@nestjs/core`): Gửi response không phụ thuộc Express/Fastify.
- `ClsService` (`nestjs-cls`): Lấy `requestId`, `startedAt`.
- `Logger` (`@nestjs/common`): Ghi log lỗi dạng object.
- `Prisma` (`@prisma/client`): Nhận diện `PrismaClientKnownRequestError`.
- `AppException` và registry mã lỗi trong `src/common/errors/`.
- Hàm tiện ích `elapsedMs()` (`src/common/utils/duration.util.ts`, xem `SER-MID-005`).

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Cài đặt Filter

```typescript
// common/filters/all-exceptions.filter.ts
interface NormalizedError {
  code: string;
  httpStatus: number;
  message: string;
  details: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const error = this.normalize(exception);
    const requestId = this.cls.get('requestId') ?? req.requestId ?? null;

    this.log(exception, error, req, requestId);

    this.httpAdapterHost.httpAdapter.reply(
      res,
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        meta: { requestId, timestamp: new Date().toISOString() },
      },
      error.httpStatus,
    );
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        code: exception.code,
        httpStatus: exception.httpStatus,
        message: exception.message,
        details: exception.details ?? null,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          code: 'COMMON_003',
          httpStatus: 409,
          message: 'Resource already exists',
          details: null,
        };
      }
      if (exception.code === 'P2025') {
        return {
          code: 'COMMON_002',
          httpStatus: 404,
          message: 'Resource not found',
          details: null,
        };
      }
      return INTERNAL_ERROR;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) return INTERNAL_ERROR;

      const body = exception.getResponse();
      const rawMessage =
        typeof body === 'object' && body !== null
          ? (body as { message?: unknown }).message
          : undefined;
      const details = Array.isArray(rawMessage) ? rawMessage : null;

      return {
        code: HTTP_STATUS_TO_CODE[status] ?? 'COMMON_001',
        httpStatus: status,
        message: details ? 'Request validation failed' : exception.message,
        details,
      };
    }

    return INTERNAL_ERROR;
  }

  private log(
    exception: unknown,
    error: NormalizedError,
    req: Request,
    requestId: string | null,
  ): void {
    const payload = {
      event: 'request.failed',
      requestId,
      method: req.method,
      path: req.path,
      userId: req.user?.id ?? null,
      statusCode: error.httpStatus,
      errorCode: error.code,
      durationMs: elapsedMs(this.cls.get('startedAt')),
    };

    if (error.httpStatus >= 500) {
      const err =
        exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        {
          ...payload,
          errorName: err.name,
          cause: err.cause instanceof Error ? err.cause.message : undefined,
        },
        err.stack,
      );
    } else {
      this.logger.warn(payload);
    }
  }
}

const INTERNAL_ERROR: NormalizedError = {
  code: 'COMMON_500',
  httpStatus: 500,
  message: 'Internal server error',
  details: null,
};

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  400: 'COMMON_001',
  401: 'AUTH_002',
  403: 'AUTH_004',
  404: 'COMMON_002',
  409: 'COMMON_003',
  429: 'COMMON_004',
};
```

### Đăng ký ở mức Global

```typescript
// app.module.ts
providers: [
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
],
```

### Cách ném lỗi trong Service (không dùng try/catch ở Controller)

```typescript
// calendar.service.ts
const event = await this.calendarRepository.findById(id);
if (!event) {
  throw new AppException({
    code: 'CALENDAR_001',
    httpStatus: 404,
    message: 'Calendar event not found',
  });
}
```

---

## 7. Lưu ý & Quy tắc (Notes)

- **Đăng ký bằng `APP_FILTER` thay vì `useGlobalFilters()` trong `main.ts`:** `summary.md` mô tả filter đăng ký ở `main.ts`; cách `APP_FILTER` có cùng hiệu lực nhưng cho phép tiêm dependency (`ClsService`, `HttpAdapterHost`) theo chuẩn của NestJS.
- **Filter bắt cả lỗi từ middleware và guard**, nên request bị `401` vẫn nhận error envelope có `requestId`.
- **Lỗi validate:** `ValidationPipe` nên cấu hình `exceptionFactory` để ném `AppException` với `COMMON_001` và `details` gồm lỗi từng trường. Nhánh `BadRequestException` có `message` dạng mảng trong filter chỉ là phương án dự phòng. Cấu hình pipe sẽ mô tả ở document riêng khi có.
- **Mã lỗi validate:** mục 6.3 của `summary.md` ghi "`COMMON_400`-class", còn bảng 6.4 dùng `COMMON_001`. Document này dùng `COMMON_001` theo bảng 6.4; cần thống nhất lại trong `summary.md`.
- **Mỗi request thất bại có đúng một dòng log kết thúc** (`request.failed`); `SER-MID-005` chỉ ghi các request thành công.
- **Request bị chặn trước `SER-MID-004`** (lỗi ở middleware hoặc guard) không có `startedAt` nên `durationMs` là `null`.
- **Lỗi hạ tầng không bị biến thành lỗi nghiệp vụ:** lỗi DB, lỗi không xác định luôn là `COMMON_500`.
- **Job nền (cron) không đi qua filter này;** job tự bắt lỗi, ghi log và quyết định thử lại hay bỏ qua (mục 6.5 của `summary.md`).
- Nhóm mã `AI_*`, `GOOGLE_*`, `TTS_*`, `VECTOR_*` do các wrapper trong `infra/*` ném ra dưới dạng `AppException`, filter không cần biết chi tiết từng dịch vụ.
- Toàn bộ cách ánh xạ và cấu trúc envelope thuộc nhóm **[Proposed]** trong `summary.md`, cần xác nhận trước khi thành quy tắc chính thức.

---

## 8. Test Cases gợi ý

| #   | Tình huống                                       | Kết quả mong đợi                                                            |
| :-- | :----------------------------------------------- | :-------------------------------------------------------------------------- |
| 1   | Service ném `AppException` (`CALENDAR_001`, 404) | Envelope có đúng `code`, status 404                                         |
| 2   | Body sai (thiếu trường, sai kiểu)                | `400` / `COMMON_001`, `details` chứa lỗi từng trường                        |
| 3   | Route không tồn tại                              | `404` / `COMMON_002`                                                        |
| 4   | Prisma `P2002` (vi phạm unique)                  | `409` / `COMMON_003`, không lộ `meta.target`                                |
| 5   | Prisma `P2025` (không tìm thấy bản ghi)          | `404` / `COMMON_002`                                                        |
| 6   | Lỗi Prisma khác (ví dụ mất kết nối DB)           | `500` / `COMMON_500`, message chung                                         |
| 7   | `throw new Error('secret db password')`          | `500` / `COMMON_500`, response không chứa chuỗi `secret db password`        |
| 8   | Vượt rate limit                                  | `429` / `COMMON_004`                                                        |
| 9   | Request bị `JwtAuthGuard` từ chối                | `401` / `AUTH_002`, envelope có `meta.requestId`, log có `durationMs: null` |
| 10  | Lỗi 5xx                                          | Log mức `error` kèm stack; response không có stack                          |
| 11  | Lỗi 4xx                                          | Log mức `warn`, không kèm stack                                             |
| 12  | `meta.requestId` so với header `X-Request-Id`    | Hai giá trị giống nhau                                                      |
