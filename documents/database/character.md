# Characters

## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ thông tin cơ bản của các nhân vật trong hệ thống trợ lý ảo hoặc hệ thống AI tương tác, bao gồm tên và cấu hình giọng nói.
- **Quan hệ (Relations):** Quan hệ 1-N với bảng `CharacterDetails` để lưu trữ các thông tin chi tiết, bối cảnh và đặc điểm của nhân vật.

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field)  | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                | Mô tả chi tiết (Description)                         |
| :--------------- | :----------------------- | :----------------------------------------------------- | :--------------------------------------------------- |
| `id`             | VARCHAR(36) / UUID       | Primary Key, Default: UUID                             | Khóa chính định danh duy nhất cho nhân vật.          |
| `character_name` | VARCHAR(150)             | Not Null                                               | Tên hiển thị của nhân vật.                           |
| `voice_model_id` | VARCHAR(100)             | Nullable                                               | ID mô hình giọng nói trên Fish.audio (voice ID).     |
| `created_at`     | TIMESTAMP                | Default: CURRENT_TIMESTAMP                             | Thời điểm bản ghi nhân vật được tạo.                 |
| `updated_at`     | TIMESTAMP                | Default: CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | Thời điểm thông tin nhân vật được cập nhật gần nhất. |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`id`)`
- `INDEX idx_character_name (`character_name`):` Tối ưu hóa việc tìm kiếm nhân vật theo tên.

---

## 4. Khác (Function, Procedure, Hook)

- Trống.
