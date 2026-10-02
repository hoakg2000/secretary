# [Tên bảng: VD: BillingTransactions]

## 1. Tổng quan (Overview)

- **Mục đích:** `[Vai trò của database này]`
- **Quan hệ (Relations):** `[Mô tả quan hệ với các database khác]`

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

ex:

| Tên cột (Field)    | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)              | Mô tả chi tiết (Description)                     |
| :----------------- | :----------------------- | :----------------------------------- | :----------------------------------------------- |
| `id`               | VARCHAR(36) / UUID       | Primary Key, Default: UUID           | Khóa chính của bản ghi.                          |
| `user_id`          | VARCHAR(36) / UUID       | Foreign Key -> `Users(id)`, Not Null | ID của người dùng sở hữu giao dịch này.          |
| `amount`           | DECIMAL(12, 2)           | Not Null                             | Số tiền giao dịch (VD: 500000.00).               |
| `type`             | ENUM                     | Not Null (`INCOME`, `EXPENSE`)       | Loại biến động: Thu (Income) hoặc Chi (Expense). |
| `bank_name`        | VARCHAR(100)             | Nullable                             | Tên ngân hàng (VD: Techcombank, VCB).            |
| `raw_content`      | TEXT                     | Nullable                             | Nội dung chuyển khoản hoặc trích đoạn email gốc. |
| `transaction_date` | DATETIME                 | Not Null                             | Thời gian giao dịch thực tế trên thông báo.      |
| `created_at`       | TIMESTAMP                | Default: CURRENT_TIMESTAMP           | Thời điểm bản ghi được tạo trong hệ thống.       |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

_Liệt kê các Index cần tạo để đảm bảo query không bị chậm khi dữ liệu lớn._

ex:

- `PRIMARY KEY (`id`)`
- `INDEX idx_user_date (`user_id`, `transaction_date`):` Tối ưu hóa việc query thống kê theo user và khoảng thời gian.
- `INDEX idx_type (`type`):` Tối ưu khi lọc nhanh các giao dịch thu/chi.

## 4. Khác (Function, Procedure, Hook)

_Mô tả function/procedure/hook, mỗi cài cần có tên, mô tả, vai trò, không có thì để trống_
