# Documentation: ResponseLoggingInterceptor (Post: log đầu ra & đo thời gian kết thúc)

## 1. Tổng quan (Overview)

- **ID**: `SER-MID-005`
- **Tên class / file:** `ResponseLoggingInterceptor / response-logging.interceptor.ts` (đặt tại `src/common/interceptors/`)
- **Loại component (Type):** `Interceptor` (pha Post, chạy sau khi handler trả kết quả)
- **Mục đích:** Khi request xử lý thành công, tính thời gian xử lý (`durationMs`) dựa trên mốc `startedAt` do `SER-MID-004` ghi, và ghi một dòng log có cấu trúc mô tả kết quả (status code, thời gian, loại kết quả). Cảnh báo khi request chậm. Không ghi nội dung response.
- **Phạm vi áp dụng (Scope):** `Global` (đăng ký bằng `APP_INTERCEPTOR`). Route có `@SkipLog()` bị bỏ qua.

> Phạm vi của document: chỉ mô tả **một file** này. Đường lỗi (request thất bại) được ghi bởi `AllExceptionsFilter` (`SER-MID-006`), không ghi ở đây. Nhờ vậy mỗi request có **đúng một** dòng log kết thúc: `request.completed` (thành công) hoặc `request.failed` (thất bại).

---

## 2. Luồng xử lý (Execution Flow)

```text
... → [SER-MID-004] Pre → [SER-MID-005] Post → ValidationPipe → Controller → Service
                                                                      │
Response ← [SER-MID-004] ← [SER-MID-005] (tap: ghi log) ← kết quả ───┘
```

1. **Kiểm tra loại context:** Nếu không phải `http`, cho đi tiếp ngay.
2. **Kiểm tra bỏ qua log:** Nếu có `@SkipLog()`, trả `next.handle()` không can thiệp.
3. **Chờ kết quả:** `next.handle().pipe(tap(...))`. Chỉ khi handler trả kết quả thành công thì `tap` mới chạy.
4. **Tính thời gian:** `durationMs = (process.hrtime.bigint() - startedAt) / 1e6`, lấy `startedAt` từ context. Nếu không có `startedAt` thì `durationMs` là `null`.
5. **Xác định status code:** Lấy theo thứ tự: status đã set thủ công trên response, rồi `@HttpCode()` của handler, rồi mặc định theo method (`POST` là `201`, còn lại là `200`).
6. **Ghi log:** `event: 'request.completed'`. Mức `log` bình thường; mức `warn` kèm `slow: true` nếu `durationMs` vượt `LOG_SLOW_REQUEST_MS`.
7. **Quyết định:** Luôn để kết quả đi tiếp nguyên vẹn, không biến đổi dữ liệu. Lỗi từ handler đi qua không bị chặn (không có `catchError`).

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs)

| Nguồn (Location) | Tên biến (Key)     | Kiểu dữ liệu | Bắt buộc | Mô tả                                               |
| :--------------- | :----------------- | :----------- | :------- | :-------------------------------------------------- |
| Context (CLS)    | `startedAt`        | `bigint`     | Không    | Do `SER-MID-004` ghi; thiếu thì `durationMs = null` |
| Request          | `requestId`        | String       | Có       | Do `SER-MID-002` gán                                |
| Request          | `user`             | `AuthUser`   | Không    | Dùng để lấy `userId`                                |
| Kết quả handler  | _(giá trị trả về)_ | `unknown`    | Không    | Chỉ để xác định loại kết quả, không log nội dung    |
| Metadata         | `SKIP_LOG_KEY`     | Boolean      | Không    | Được set bởi `@SkipLog()`                           |

### Dữ liệu gắn thêm vào Request (Request Context / Modifications)

Interceptor này **không** thay đổi request, response hay context. Chỉ ghi log.

**Cấu trúc dòng log `request.completed`:**

| Trường         | Kiểu dữ liệu   | Ghi chú                                                       |
| :------------- | :------------- | :------------------------------------------------------------ |
| `event`        | String         | Luôn là `request.completed`                                   |
| `requestId`    | String (UUID)  |                                                               |
| `method`       | String         |                                                               |
| `path`         | String         | Không kèm query string                                        |
| `userId`       | String \| null |                                                               |
| `statusCode`   | Number         | Xem bước 5 ở mục 2                                            |
| `durationMs`   | Number \| null | Làm tròn 2 chữ số thập phân                                   |
| `responseKind` | String         | `empty` (không có nội dung), `stream`, hoặc `json`            |
| `slow`         | Boolean        | `true` khi vượt ngưỡng `LOG_SLOW_REQUEST_MS` (kèm mức `warn`) |

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

Interceptor này **không chủ động trả lỗi** cho client.

| HTTP Code  | Error Code (Nội bộ) | Lý do phát sinh                                                             | Response Example |
| :--------- | :------------------ | :-------------------------------------------------------------------------- | :--------------- |
| _Không có_ | _Không có_          | Lỗi của handler đi qua nguyên vẹn tới `AllExceptionsFilter` (`SER-MID-006`) | —                |

Quy ước:

- Không dùng `catchError` để nuốt hoặc đổi lỗi. Lỗi chỉ được chuyển thành response ở một nơi duy nhất là `SER-MID-006`.
- Không log nội dung response (tránh lộ dữ liệu chat, email, kết quả AI).

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- `LOG_SLOW_REQUEST_MS`: Ngưỡng (mili giây) để coi request là chậm, giá trị mặc định đề xuất `3000`. Validate bằng Zod khi khởi động và có trong `.env.example`.

### Dependencies & Services liên quan

- `Reflector` (NestJS): Đọc `@SkipLog()` và `@HttpCode()` (`HTTP_CODE_METADATA`).
- `ClsService` (`nestjs-cls`): Đọc `startedAt`.
- `ConfigService<Env, true>`: Đọc `LOG_SLOW_REQUEST_MS`.
- `Logger` (`@nestjs/common`): Ghi log dạng object.
- `rxjs` (`tap`): Chạy side-effect ghi log mà không đổi dữ liệu.
- Hàm tiện ích `elapsedMs()` tại `src/common/utils/duration.util.ts`, dùng chung với `SER-MID-006`.

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Hàm tiện ích tính thời gian (dùng chung)

```typescript
// common/utils/duration.util.ts
export function elapsedMs(startedAt: bigint | undefined): number | null {
  if (startedAt === undefined) return null;
  const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  return Math.round(ms * 100) / 100;
}
```

### Cài đặt Interceptor

```typescript
// common/interceptors/response-logging.interceptor.ts
@Injectable()
export class ResponseLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly slowThresholdMs: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
    config: ConfigService<Env, true>,
  ) {
    this.slowThresholdMs = config.get('LOG_SLOW_REQUEST_MS', { infer: true });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap((result) => {
        const durationMs = elapsedMs(this.cls.get('startedAt'));
        const slow = durationMs !== null && durationMs >= this.slowThresholdMs;
        const payload = {
          event: 'request.completed',
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          userId: req.user?.id ?? null,
          statusCode: this.resolveStatusCode(context, req, res),
          durationMs,
          responseKind: this.describeResult(result),
          slow,
        };
        if (slow) this.logger.warn(payload);
        else this.logger.log(payload);
      }),
    );
  }

  // Nest chỉ set status cuối cùng khi gửi response (sau interceptor),
  // nên res.statusCode lúc này có thể còn là giá trị mặc định 200.
  private resolveStatusCode(
    context: ExecutionContext,
    req: Request,
    res: Response,
  ): number {
    if (res.statusCode !== HttpStatus.OK) return res.statusCode;
    const fromDecorator = this.reflector.get<number | undefined>(
      HTTP_CODE_METADATA,
      context.getHandler(),
    );
    if (fromDecorator) return fromDecorator;
    return req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK;
  }

  private describeResult(result: unknown): 'empty' | 'stream' | 'json' {
    if (result === undefined || result === null) return 'empty';
    if (result instanceof StreamableFile) return 'stream';
    return 'json';
  }
}
```

### Thứ tự đăng ký

Xem `SER-MID-004`: `RequestLoggingInterceptor` đăng ký trước, `ResponseLoggingInterceptor` đăng ký sau. Nếu sau này thêm interceptor đóng gói response envelope (`success`, `data`, `meta`), đăng ký nó **sau** interceptor này để interceptor này nằm ngoài, tức là thấy kết quả cuối cùng.

---

## 7. Lưu ý & Quy tắc (Notes)

- **Một dòng kết thúc cho mỗi request:** thành công do `SER-MID-005` ghi, thất bại do `SER-MID-006` ghi. Không ghi trùng ở hai nơi.
- **Response dạng stream** (ví dụ audio TTS của Voice Chat): `tap` chạy khi handler trả về `StreamableFile`, không phải khi stream gửi xong, nên `durationMs` chỉ là thời gian tạo ra stream. Nếu cần đo thời gian gửi hết, xử lý riêng ở tầng stream.
- **Không log nội dung response**, chỉ log loại kết quả (`responseKind`) và metadata. Điều này phù hợp yêu cầu không log nội dung chat/email trong `summary.md`.
- Ngưỡng `LOG_SLOW_REQUEST_MS` tính cả thời gian gọi dịch vụ ngoài (Gemini, Google API); route AI có thể cần ngưỡng cao hơn, nên cân nhắc cho phép ghi đè theo route nếu thực tế phát sinh nhiều cảnh báo.
- Interceptor này không chứa business logic và không biến đổi dữ liệu trả về.
- `LOG_SLOW_REQUEST_MS` và cấu trúc log thuộc nhóm **[Proposed]**.

---

## 8. Test Cases gợi ý

| #   | Tình huống                                        | Kết quả mong đợi                                                     |
| :-- | :------------------------------------------------ | :------------------------------------------------------------------- |
| 1   | `GET` thành công                                  | Có 1 dòng `request.completed`, `statusCode: 200`, `durationMs` là số |
| 2   | `POST` thành công không khai báo `@HttpCode()`    | `statusCode: 201`                                                    |
| 3   | Handler có `@HttpCode(204)` và không trả nội dung | `statusCode: 204`, `responseKind: 'empty'`                           |
| 4   | Request chậm hơn `LOG_SLOW_REQUEST_MS`            | Log mức `warn`, `slow: true`                                         |
| 5   | Handler ném lỗi                                   | Không có `request.completed` (filter ghi `request.failed`)           |
| 6   | Route `@SkipLog()`                                | Không có log                                                         |
| 7   | Handler trả `StreamableFile`                      | `responseKind: 'stream'`                                             |
| 8   | Không có `startedAt` trong context                | `durationMs: null`, request vẫn xử lý bình thường                    |
| 9   | Nội dung response chứa dữ liệu nhạy cảm           | Không xuất hiện trong log                                            |
