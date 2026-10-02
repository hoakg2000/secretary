# CalendarEvents

## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ bản sao cục bộ (cache) rút gọn của các sự kiện từ Google Calendar nhằm tăng tốc độ truy vấn lịch trình cá nhân, hiển thị nhanh trên giao diện và giảm thiểu số lượng gọi API sang Google Calendar.
- **Quan hệ (Relations):** Thuộc sở hữu của `Users` (`user_id` -> `Users(id)`). Có thể liên kết với các bảng quản lý công việc hoặc thông báo khác trong hệ thống trợ lý ảo.

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field)   | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)              | Mô tả chi tiết (Description)                      |
| :---------------- | :----------------------- | :----------------------------------- | :------------------------------------------------ |
| `id`              | VARCHAR(36) / UUID       | Primary Key, Default: UUID           | Khóa chính của bản ghi sự kiện trong DB nội bộ.   |
| `user_id`         | VARCHAR(36) / UUID       | Foreign Key -> `Users(id)`, Not Null | ID của người dùng sở hữu sự kiện lịch này.        |
| `google_event_id` | VARCHAR(255)             | Not Null, Index                      | ID định danh của sự kiện trên Google Calendar.    |
| `summary`         | VARCHAR(255)             | Not Null                             | Tiêu đề hoặc tên của sự kiện lịch.                |
| `description`     | TEXT                     | Nullable                             | Mô tả chi tiết tóm tắt của sự kiện.               |
| `location`        | VARCHAR(255)             | Nullable                             | Địa điểm diễn ra sự kiện hoặc link họp online.    |
| `start_time`      | DATETIME                 | Not Null                             | Thời gian bắt đầu sự kiện.                        |
| `end_time`        | DATETIME                 | Not Null                             | Thời gian kết thúc sự kiện.                       |
| `is_all_day`      | BOOLEAN                  | Default: FALSE                       | Xác định sự kiện kéo dài cả ngày (All-day event). |
| `status`          | VARCHAR(50)              | Default: 'confirmed'                 | Trạng thái sự kiện (confirmed, tentative, etc.).  |
| `synced_at`       | TIMESTAMP                | Default: CURRENT_TIMESTAMP           | Thời điểm đồng bộ dữ liệu mới nhất từ Google.     |
| `created_at`      | TIMESTAMP                | Default: CURRENT_TIMESTAMP           | Thời điểm bản ghi được tạo trong hệ thống.        |
| `updated_at`      | TIMESTAMP                | Default: CURRENT_TIMESTAMP           | Thời điểm cập nhật dữ liệu gần nhất.              |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `INDEX idx_user_time (`user_id`, `start_time`, `end_time`):` Tối ưu hóa truy vấn tìm kiếm các sự kiện theo khoảng thời gian của người dùng.
- `INDEX idx_google_event (`google_event_id`):` Hỗ trợ tra cứu, đồng bộ hoặc cập nhật nhanh chóng theo ID gốc từ Google Calendar.

## 4. Khác (Function, Procedure, Hook)

- **`sync_google_calendar_hook`**: Hook tự động gọi Google Calendar API để làm mới dữ liệu cache khi người dùng yêu cầu xem chi tiết sự kiện mà dữ liệu cục bộ đã cũ hoặc không tồn tại.
- **`cleanup_old_events_proc`**: Procedure định kỳ xóa hoặc lưu trữ các sự kiện quá hạn lâu ngày nhằm tối ưu hóa dung lượng lưu trữ bảng cache.
