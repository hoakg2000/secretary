# Emails

## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ toàn bộ danh sách các email đã được hệ thống ghi nhận và đồng bộ (bao gồm cả các email được forward từ nhiều hòm thư cá nhân về một hòm thư trung tâm). Phục vụ cho việc trích xuất thông tin tự động, phân loại ngữ cảnh và làm đầu vào cho Self-Updating Semantic Memory.
- **Quan hệ (Relations):** Quan hệ 1-nhiều với các bảng xử lý chi tiết (VD: `BillingTransactions`, `Schedules`, `MemoryFacts`, v.v.) dựa trên `id` hoặc `type` của email.

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field)    | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                     | Mô tả chi tiết (Description)                                                           |
| :----------------- | :----------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| `id`               | VARCHAR(36) / UUID       | Primary Key, Default: UUID                                  | Khóa chính định danh duy nhất cho bản ghi email.                                       |
| `user_id`          | VARCHAR(36) / UUID       | Foreign Key -> `Users(id)`, Not Null                        | ID của người dùng sở hữu/nhận email này.                                               |
| `mail`             | VARCHAR(255)             | Not Null                                                    | Địa chỉ hòm thư trung tâm thực tế nhận được email này.                                 |
| `sender`           | VARCHAR(255)             | Not Null                                                    | Người gửi hiển thị (bao gồm tên và địa chỉ email, VD: "Nguyễn Văn A <a@gmail.com>").   |
| `original_sender`  | VARCHAR(255)             | Nullable                                                    | Người gửi gốc của email (dùng trong trường hợp email bị forward từ hòm thư khác).      |
| `is_forwarded`     | BOOLEAN                  | Default: FALSE                                              | Đánh dấu xem email này có phải là email được forward từ tài khoản khác về hay không.   |
| `receiver`         | TEXT / JSON              | Not Null                                                    | Danh sách tất cả những người nhận (To) lưu dưới dạng JSON array hoặc chuỗi phân tách.  |
| `cc`               | TEXT / JSON              | Nullable                                                    | Danh sách những người nhận bản sao (CC) lưu dưới dạng JSON array hoặc chuỗi phân tách. |
| `sendtime`         | DATETIME                 | Not Null                                                    | Thời gian email được gửi thực tế từ nguồn.                                             |
| `content`          | LONGTEXT                 | Not Null                                                    | Nội dung toàn bộ chi tiết của email (hoặc nội dung gốc sau khi bóc tách forward).      |
| `summary_content`  | TEXT                     | Nullable                                                    | Nội dung tóm tắt ngắn gọn của email do hệ thống AI xử lý.                              |
| `type`             | ENUM                     | Not Null (`billing`, `carrer`, `study`, `booking`, `other`) | Phân loại chủ đề/lĩnh vực của email để phục vụ cho việc xử lý logic nghiệp vụ sau này. |
| `importance_level` | INT                      | Not Null (Range: 1 to 5)                                    | Mức độ quan trọng của email (1: Thấp nhất, 5: Quan trọng cao/khẩn cấp).                |
| `created_at`       | TIMESTAMP                | Default: CURRENT_TIMESTAMP                                  | Thời điểm bản ghi email được lưu thành công vào database.                              |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `INDEX idx_user_time (`user_id`, `sendtime`):` Tối ưu hóa việc query tìm kiếm và sắp xếp email theo thời gian của người dùng.
- `INDEX idx_type (`type`):` Tối ưu khi hệ thống cần lọc nhanh các email theo nhóm nghiệp vụ (billing, booking,...).
- `INDEX idx_importance (`importance_level`):` Hỗ trợ lọc các email có mức độ quan trọng cao để ưu tiên xử lý trước.
- `FULLTEXT INDEX ft_content (`content`, `summary_content`):` Hỗ trợ tìm kiếm từ khóa thông minh bên trong nội dung email.

---

## 4. Khác (Function, Procedure, Hook)

- **Hook `before_insert_parse_forward`:**
  - _Mô tả & Vai trò:_ Tự động quét nội dung email đến để phát hiện các header forward phổ biến (như "---------- Forwarded message ---------"), từ đó tự động tách lấy `original_sender` và thời gian gửi gốc điền vào các trường tương ứng, đồng thời set `is_forwarded = TRUE`.
