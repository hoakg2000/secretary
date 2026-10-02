# chatSession

## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ thông tin về các phiên trò chuyện (session) giữa người dùng và trợ lý ảo thông minh, giúp quản lý ngữ cảnh, thời gian bắt đầu/kết thúc và định danh cho các phiên làm việc đa nền tảng.
- **Quan hệ (Relations):** Thuộc về bảng `Users` (1 người dùng có nhiều phiên chat) và là cha của bảng `chatHistory` (1 phiên chat chứa nhiều tin nhắn lịch sử).

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field) | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                | Mô tả chi tiết (Description)                         |
| :-------------- | :----------------------- | :----------------------------------------------------- | :--------------------------------------------------- |
| `id`            | VARCHAR(36) / UUID       | Primary Key, Default: UUID                             | Khóa chính của phiên trò chuyện.                     |
| `user_id`       | VARCHAR(36) / UUID       | Foreign Key -> `Users(id)`, Not Null                   | ID của người dùng sở hữu phiên trò chuyện này.       |
| `title`         | VARCHAR(255)             | Not Null                                               | Tiêu đề tóm tắt của phiên chat (sinh tự động).       |
| `status`        | ENUM                     | Not Null (`ACTIVE`, `ARCHIVED`, `CLOSED`)              | Trạng thái hiện tại của phiên trò chuyện.            |
| `metadata`      | JSON / TEXT              | Nullable                                               | Lưu trữ các thông tin bổ sung, ngữ cảnh khởi tạo.    |
| `created_at`    | TIMESTAMP                | Default: CURRENT_TIMESTAMP                             | Thời điểm phiên chat được khởi tạo.                  |
| `updated_at`    | TIMESTAMP                | Default: CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | Thời điểm phiên chat có hoạt động cập nhật gần nhất. |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `INDEX idx_user_updated (`user_id`, `updated_at`):` Tối ưu hóa việc truy vấn danh sách phiên chat gần đây của người dùng.
- `INDEX idx_status (`status`):` Tối ưu khi lọc các phiên chat đang hoạt động (`ACTIVE`).

## 4. Khác (Function, Procedure, Hook)

- **`update_session_timestamp_hook`**: Trigger/Hook tự động cập nhật lại trường `updated_at` của `chatSession` mỗi khi có bản ghi tin nhắn mới được thêm vào bảng `chatHistory` thuộc phiên đó.
