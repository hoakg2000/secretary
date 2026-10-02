# Billing

## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ chi tiết tất cả các giao dịch thu/chi tài chính, được tự động trích xuất từ email hoặc cập nhật từ biến động số dư.
- **Quan hệ (Relations):** Thuộc về một tài khoản cụ thể (`account_id` liên kết tới `Accounts(id)`).

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field)    | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                   | Mô tả chi tiết (Description)                                    |
| :----------------- | :----------------------- | :-------------------------------------------------------- | :-------------------------------------------------------------- |
| `id`               | VARCHAR(36) / UUID       | Primary Key, Default: UUID                                | Khóa chính của giao dịch.                                       |
| `account_id`       | VARCHAR(36) / UUID       | Foreign Key -> `Accounts(id)`, Not Null                   | ID của tài khoản liên kết thực hiện giao dịch.                  |
| `before_amount`    | DECIMAL(12, 2)           | Not Null                                                  | Số dư tài khoản trước khi giao dịch diễn ra (`before`).         |
| `after_amount`     | DECIMAL(12, 2)           | Not Null                                                  | Số dư tài khoản sau khi giao dịch diễn ra (`after`).            |
| `amount`           | DECIMAL(12, 2)           | Not Null                                                  | Số tiền biến động của giao dịch.                                |
| `type`             | ENUM                     | Not Null (`FOOD`, `BILL`, `EDUCATION`, `HEALTH`, `OTHER`) | Phân loại chi tiêu (Ăn uống, Hóa đơn, Học tập, Sức khỏe, Khác). |
| `priority`         | TINYINT                  | Not Null, Check (`priority` BETWEEN 1 AND 5)              | Mức độ ưu tiên/quan trọng của khoản chi (Từ 1 đến 5).           |
| `transaction_time` | DATETIME                 | Not Null                                                  | Thời điểm diễn ra giao dịch thực tế (`time`).                   |
| `created_at`       | TIMESTAMP                | Default: CURRENT_TIMESTAMP                                | Thời điểm bản ghi được tạo trong hệ thống.                      |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `INDEX idx_account_time (`account_id`, `transaction_time`):` Tối ưu truy vấn lịch sử giao dịch theo tài khoản và khoảng thời gian.
- `INDEX idx_type (`type`):` Tối ưu thống kê chi tiêu theo từng danh mục.

---

## 4. Khác (Function, Procedure, Hook)

- **Hook `after_billing_insert`:** Sau khi một giao dịch `Billing` được thêm thành công, tự động gọi procedure cập nhật hoặc khởi tạo tổng kết tháng tương ứng vào bảng `BillingMonthlySummary`.
