# Users

## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ thông tin tài khoản người dùng trong hệ thống, quản lý phân quyền (Admin và User), và lưu trữ thông tin xác thực/trạng thái tài khoản (ví dụ: liên kết tài khoản Google, trạng thái hoạt động).
- **Quan hệ (Relations):**
  - Quan hệ 1-N với các bảng liên quan đến trợ lý ảo như `Conversations` (Phiên trò chuyện), `Schedules` (Lịch trình/Google Calendar), `BillingTransactions` (Giao dịch thu chi), và `SemanticMemories` (Bộ nhớ ngữ nghĩa).

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field)          | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                | Mô tả chi tiết (Description)                                                    |
| :----------------------- | :----------------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------ |
| `id`                     | VARCHAR(36) / UUID       | Primary Key, Default: UUID                             | Khóa chính định danh duy nhất cho người dùng.                                   |
| `email`                  | VARCHAR(255)             | Not Null, Unique                                       | Địa chỉ email của người dùng (dùng để đăng nhập và đồng bộ Google).             |
| `password_hash`          | VARCHAR(255)             | Nullable                                               | Chuỗi mật khẩu đã được mã hóa (bỏ trống nếu dùng SSO Google hoàn toàn).         |
| `full_name`              | VARCHAR(100)             | Not Null                                               | Họ và tên đầy đủ của người dùng.                                                |
| `role`                   | ENUM                     | Not Null, Default: `USER` (`ADMIN`, `USER`)            | Vai trò phân quyền tài khoản trong hệ thống.                                    |
| `google_token_encrypted` | TEXT                     | Nullable                                               | Token xác thực và cấp quyền Google API của người dùng (đã được mã hóa an toàn). |
| `is_active`              | BOOLEAN                  | Not Null, Default: `TRUE`                              | Trạng thái tài khoản (Đang hoạt động hoặc bị khóa).                             |
| `created_at`             | TIMESTAMP                | Default: CURRENT_TIMESTAMP                             | Thời điểm tài khoản được tạo trên hệ thống.                                     |
| `updated_at`             | TIMESTAMP                | Default: CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | Thời điểm thông tin tài khoản được cập nhật gần nhất.                           |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

_Liệt kê các Index cần tạo để đảm bảo query không bị chậm khi dữ liệu lớn._

- `PRIMARY KEY (`id`)`
- `UNIQUE INDEX idx_email (`email`):` Đảm bảo tính duy nhất của email và tăng tốc độ tìm kiếm/xác thực khi đăng nhập.
- `INDEX idx_role (`role`):` Tối ưu hóa việc phân loại và lọc người dùng theo quyền hạn (Admin hoặc User).

---

## 4. Khác (Function, Procedure, Hook)

- **Trigger `trg_update_timestamp`:** Tự động cập nhật giá trị cho trường `updated_at` mỗi khi thông tin bản ghi của người dùng được chỉnh sửa.
- **Function `fn_is_admin`:** Hàm kiểm tra nhanh xem một `user_id` cụ thể có sở hữu quyền `ADMIN` hay không để phục vụ cho các middleware bảo mật phân quyền API.
