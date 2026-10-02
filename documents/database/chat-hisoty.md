## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ chi tiết toàn bộ nội dung tin nhắn trao đổi (cả phía người dùng và trợ lý ảo) trong từng phiên trò chuyện, phục vụ cho việc hiển thị lịch sử và làm nguồn dữ liệu cho hệ thống Self-Updating Semantic Memory.
- **Quan hệ (Relations):** Thuộc về bảng `chatSession` (1 phiên chat chứa nhiều bản ghi lịch sử tin nhắn).

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field) | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                    | Mô tả chi tiết (Description)                                    |
| :-------------- | :----------------------- | :----------------------------------------- | :-------------------------------------------------------------- |
| `id`            | VARCHAR(36) / UUID       | Primary Key, Default: UUID                 | Khóa chính của bản ghi tin nhắn.                                |
| `session_id`    | VARCHAR(36) / UUID       | Foreign Key -> `chatSession(id)`, Not Null | ID của phiên trò chuyện chứa tin nhắn này.                      |
| `sender_type`   | ENUM                     | Not Null (`USER`, `ASSISTANT`, `SYSTEM`)   | Xác định đối tượng gửi tin nhắn.                                |
| `content`       | TEXT                     | Not Null                                   | Nội dung chi tiết của tin nhắn.                                 |
| `tokens_used`   | INT                      | Nullable                                   | Số lượng token tiêu thụ cho tin nhắn này (nếu cần quản lý LLM). |
| `created_at`    | TIMESTAMP                | Default: CURRENT_TIMESTAMP                 | Thời điểm tin nhắn được gửi và lưu trữ.                         |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `INDEX idx_session_created (`session_id`, `created_at`):` Tối ưu hóa việc tải lịch sử tin nhắn theo thứ tự thời gian của một phiên chat cụ thể.
- `INDEX idx_sender (`sender_type`):` Tối ưu khi cần lọc hoặc phân tích theo nguồn gửi tin nhắn.

## 4. Khác (Function, Procedure, Hook)

- **`memory_extraction_hook`**: Hook chạy nền (Background Job / Webhook) kích hoạt sau khi một tin nhắn mới từ `USER` hoặc `ASSISTANT` được lưu thành công, nhằm trích xuất thông tin ngữ nghĩa và cập nhật vào hệ thống Self-Updating Semantic Memory của người dùng.
