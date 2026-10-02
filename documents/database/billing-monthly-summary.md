# BillingMonthlySummary

## 1. Tổng quan (Overview)

- **Mục đích:** Tổng hợp và thống kê chi tiêu nhóm theo từng danh mục (`type`) theo từng tháng cho mỗi tài khoản hoặc toàn bộ người dùng, giúp tối ưu hiệu năng hiển thị biểu đồ báo cáo.
- **Quan hệ (Relations):** Phụ thuộc dữ liệu tổng hợp từ bảng `Billing` và liên kết với `Accounts`.

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field) | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                   | Mô tả chi tiết (Description)                                         |
| :-------------- | :----------------------- | :-------------------------------------------------------- | :------------------------------------------------------------------- |
| `id`            | VARCHAR(36) / UUID       | Primary Key, Default: UUID                                | Khóa chính của bảng tổng kết tháng.                                  |
| `account_id`    | VARCHAR(36) / UUID       | Foreign Key -> `Accounts(id)`, Not Null                   | ID tài khoản liên quan đến tổng kết chi tiêu.                        |
| `summary_month` | DATE / VARCHAR(7)        | Not Null (VD: '2026-10' hoặc '2026-10-01')                | Tháng tổng kết (mặc định tạo sẵn cho tháng N-1 hoặc tháng hiện tại). |
| `type`          | ENUM                     | Not Null (`FOOD`, `BILL`, `EDUCATION`, `HEALTH`, `OTHER`) | Loại danh mục chi tiêu được thống kê.                                |
| `total_amount`  | DECIMAL(12, 2)           | Not Null, Default: 0.00                                   | Tổng số tiền chi tiêu trong tháng cho danh mục này.                  |
| `updated_at`    | TIMESTAMP                | Default: CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP    | Thời điểm bản ghi tổng kết được cập nhật mới nhất.                   |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `UNIQUE INDEX idx_account_month_type (`account_id`, `summary_month`, `type`):` Đảm bảo mỗi danh mục trong một tháng của tài khoản chỉ có 1 bản ghi tổng kết duy nhất, dễ dàng cho việc `UPSERT`.
- `INDEX idx_summary_month (`summary_month`):` Tối ưu truy vấn báo cáo theo mốc thời gian tháng.

---

## 4. Khác (Function, Procedure, Hook)

- **Procedure `sp_update_monthly_summary`:** Tự động kiểm tra nếu đã tồn tại record của tháng N (hoặc tháng N-1 theo logic mặc định) thì cộng dồn `amount`, nếu chưa thì khởi tạo record mới khi có biến động từ bảng `Billing`.
