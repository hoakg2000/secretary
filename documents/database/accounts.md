# Accounts Billing

## 1. Tổng quan (Overview)

- **Mục đích:** Quản lý thông tin các tài khoản ngân hàng hoặc ví điện tử của người dùng, theo dõi số dư hiện tại và phân loại tài khoản.
- **Quan hệ (Relations):** Liên kết 1-nhiều (1-N) với bảng `Billing` (một tài khoản có thể có nhiều giao dịch lịch sử).

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field)  | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                | Mô tả chi tiết (Description)                                                         |
| :--------------- | :----------------------- | :----------------------------------------------------- | :----------------------------------------------------------------------------------- |
| `id`             | VARCHAR(36) / UUID       | Primary Key, Default: UUID                             | Khóa chính duy nhất của bản ghi tài khoản.                                           |
| `bank`           | VARCHAR(100)             | Not Null                                               | Tên ngân hàng hoặc ví điện tử (VD: Techcombank, Momo, VCB).                          |
| `current_amount` | DECIMAL(12, 2)           | Not Null, Default: 0.00                                | Số dư hiện tại của tài khoản.                                                        |
| `type`           | ENUM                     | Not Null (`CREDIT`, `DEBIT`)                           | Phân loại tài khoản: Thẻ tín dụng (Credit) hoặc Tài khoản ghi nợ/thanh toán (Debit). |
| `created_at`     | TIMESTAMP                | Default: CURRENT_TIMESTAMP                             | Thời điểm tài khoản được thêm vào hệ thống.                                          |
| `updated_at`     | TIMESTAMP                | Default: CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | Thời điểm cập nhật số dư/thông tin tài khoản gần nhất.                               |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `INDEX idx_bank (`bank`):` Tối ưu hóa việc tìm kiếm tài khoản theo tên ngân hàng.

---

## 4. Khác (Function, Procedure, Hook)

- **Trigger / Hook `trg_update_account_balance`:** Tự động cập nhật lại `current_amount` trong bảng `Accounts` mỗi khi có bản ghi `Billing` mới được thêm vào.
