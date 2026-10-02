# Documentation: [Tên Middleware / Guard / Interceptor / Filter]

## 1. Tổng quan (Overview)

- **ID**: `[Ví dụ: SER-MID-001]`
- **Tên class / file:** `[Ví dụ: AuthGuard / auth.guard.ts]`
- **Loại component (Type):** `[Middleware | Guard | Interceptor | Pipe | Exception Filter]`
- **Mục đích:** `[Mô tả ngắn gọn 1-2 câu về nhiệm vụ chính của middleware này]`
- **Phạm vi áp dụng (Scope):** `[Global | Controller Level | Route Level]`

---

## 2. Luồng xử lý (Execution Flow)

Sơ đồ ngắn hoặc các bước logic mà middleware thực hiện khi một Request đi qua:

1. **Trích xuất dữ liệu:** `[Ví dụ: Lấy Bearer Token từ Header Authorization]`
2. **Kiểm tra / Validate:** `[Ví dụ: Verify JWT Token với Secret Key]`
3. **Gán Context:** `[Ví dụ: Decode thông tin User và gán vào request.user]`
4. **Quyết định:**
   - **Thành công:** Cho phép Request đi tiếp (`return true` hoặc `next()`).
   - **Thất bại:** Trả về HTTP Exception thích hợp.

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs)

| Nguồn (Location) | Tên biến (Key)  | Kiểu dữ liệu | Bắt buộc | Mô tả                           |
| :--------------- | :-------------- | :----------- | :------- | :------------------------------ |
| Header           | `Authorization` | String       | Có       | Token dạng `Bearer <JWT_TOKEN>` |
| Query / Body     | `...`           | ...          | ...      | ...                             |

### Dữ liệu gắn thêm vào Request (Request Context / Modifications)

| Tên biến gắn vào Request | Kiểu dữ liệu    | Mô tả                                                       |
| :----------------------- | :-------------- | :---------------------------------------------------------- |
| `request.user`           | `UserObject`    | Thông tin người dùng sau khi decode (`id`, `role`, `email`) |
| `request.traceId`        | `String (UUID)` | ID định danh request                                        |

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

Dưới đây là các mã lỗi middleware sẽ chủ động trả về client nếu có sự cố:

| HTTP Code               | Error Code (Nội bộ)   | Lý do phát sinh                                      | Response Example                                      |
| :---------------------- | :-------------------- | :--------------------------------------------------- | :---------------------------------------------------- |
| `401 Unauthorized`      | `UNAUTHORIZED`        | Không truyền Header Authorization hoặc Token hết hạn | `{"statusCode": 401, "message": "Token expired"}`     |
| `403 Forbidden`         | `FORBIDDEN_RESOURCE`  | User không có quyền truy cập resource này            | `{"statusCode": 403, "message": "Access denied"}`     |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | Vượt quá số request cho phép trong thời gian ngắn    | `{"statusCode": 429, "message": "Too many requests"}` |

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- `JWT_SECRET`: Khóa bí mật dùng để verify token.
- `RATE_LIMIT_TTL`: Thời gian window limit (tính bằng giây).

### Dependencies & Services liên quan

- `Reflector` (NestJS): Dùng để đọc Metadata `@Public()` hoặc `@Roles()`.
- `RedisModule` / `CacheModule`: Lưu vết IP/User để tính Rate limit.

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Cách áp dụng vào Controller / Route

```typescript
// Ví dụ áp dụng cho Controller hoặc Route cụ thể
@UseGuards(AuthGuard)
@Controller('chat')
export class ChatController {
  @Get('history')
  getHistory(@Req() req: Request) {
    // Lấy thông tin user đã được gán bởi AuthGuard
    const user = req.user;
  }
}
```
