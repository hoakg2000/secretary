# Documentation: AiTool Decorator

## 1. Tổng quan (Overview)

- **ID**: `SER-DEC-001`
- **Tên class / file:** `AiTool / ai-tool.decorator.ts`
- **Loại component (Type):** `Decorator`
- **Mục đích:** Đánh dấu và cấu hình metadata (tên, mô tả, schema tham số) trực tiếp lên các method trong Service để hệ thống tự động quét và đăng ký làm Tool (Function Calling) cho AI Agent (Gemini).
- **Phạm vi áp dụng (Scope):** `Route Level (Method Level)`

---

## 2. Luồng xử lý (Execution Flow)

Sơ đồ ngắn hoặc các bước logic khi sử dụng và vận hành Decorator:

1. **Khai báo Metadata:** Developer gắn `@AiTool({ name, description, parameters })` lên method trong Service.
2. **Quét khởi động (Bootstrap):** `AiToolRegistry` (dùng `DiscoveryService` và `Reflector`) quét toàn bộ Provider khi ứng dụng khởi động.
3. **Đăng ký Tool:** Trích xuất metadata từ các method được đánh dấu và biên dịch thành danh sách định nghĩa Tool cho Gemini.
4. **Thực thi khi AI gọi:**
   - **Thành công:** Gemini trả về tên Tool và arguments -> `AiToolRegistry` gọi trực tiếp method tương ứng của Service kèm theo `userId` từ context phiên chat.
   - **Thất bại:** Ném ngoại lệ nếu không tìm thấy Tool hoặc lỗi tham số đầu vào.

---

## 3. Input & Output Contract

### Dữ liệu đầu vào (Required Inputs cho Decorator)

| Nguồn (Location) | Tên biến (Key) | Kiểu dữ liệu         | Bắt buộc | Mô tả                                                   |
| :--------------- | :------------- | :------------------- | :------- | :------------------------------------------------------ |
| Decorator Option | `name`         | String               | Có       | Tên định danh duy nhất của Tool (VD: `getBillingStats`) |
| Decorator Option | `description`  | String               | Có       | Mô tả chức năng để Gemini biết khi nào nên gọi Tool này |
| Decorator Option | `parameters`   | Object (JSON Schema) | Tùy chọn | Định nghĩa cấu trúc tham số đầu vào mà AI cần cung cấp  |

### Dữ liệu gắn thêm vào Context / Method Argument

| Tên biến truyền vào Service Method | Kiểu dữ liệu | Mô tả                                                                       |
| :--------------------------------- | :----------- | :-------------------------------------------------------------------------- |
| `context.userId`                   | `String`     | ID của người dùng lấy từ token xác thực phiên chat (bảo mật quyền truy cập) |
| `args`                             | `Object`     | Các tham số do AI Agent tự trích xuất từ câu lệnh của người dùng            |

---

## 4. Xử lý lỗi & HTTP Status Codes (Error Handling)

Các lỗi phát sinh liên quan đến quá trình gọi Tool của AI:

| HTTP Code / Status          | Error Code (Nội bộ)        | Lý do phát sinh                                                    | Response Example                                            |
| :-------------------------- | :------------------------- | :----------------------------------------------------------------- | :---------------------------------------------------------- |
| `400 Bad Request`           | `AI_TOOL_NOT_FOUND`        | AI cố gọi một Tool không tồn tại hoặc chưa được đánh dấu decorator | `{"statusCode": 400, "message": "Tool getStats not found"}` |
| `500 Internal Server Error` | `AI_TOOL_EXECUTION_FAILED` | Lỗi xảy ra bên trong Service method khi tương tác với Database     | `{"statusCode": 500, "message": "Database query failed"}`   |

---

## 5. Môi trường & Cấu hình (Configuration & Dependencies)

### Biến môi trường phụ thuộc (Environment Variables)

- Không yêu cầu biến môi trường riêng biệt (tuân theo cấu hình chung của AI Service/Gemini API).

### Dependencies & Services liên quan

- `Reflector` (NestJS): Đọc metadata được gán bởi `@AiTool()`.
- `DiscoveryService` & `MetadataScanner` (NestJS): Quét và phát hiện các method trong toàn bộ app module.

---

## 6. Hướng dẫn sử dụng cho Developer (Usage Examples)

### Cách áp dụng vào Service Method

```typescript
import { Injectable } from '@nestjs/common';
import { AiTool } from '../../common/decorators/ai-tool.decorator';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  @AiTool({
    name: 'getBillingStats',
    description: 'Thống kê tổng doanh thu và hóa đơn theo khoảng thời gian',
    parameters: {
      type: 'OBJECT',
      properties: {
        startDate: { type: 'STRING', description: 'Ngày bắt đầu YYYY-MM-DD' },
        endDate: { type: 'STRING', description: 'Ngày kết thúc YYYY-MM-DD' },
      },
      required: ['startDate', 'endDate'],
    },
  })
  async getBillingStats(
    userId: string,
    args: { startDate: string; endDate: string },
  ) {
    return this.prisma.billing.aggregate({
      where: {
        userId,
        createdAt: {
          gte: new Date(args.startDate),
          lte: new Date(args.endDate),
        },
      },
      _sum: { amount: true },
    });
  }
}
```
