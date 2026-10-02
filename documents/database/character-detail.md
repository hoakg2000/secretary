# CharacterDetails

## 1. Tổng quan (Overview)

- **Mục đích:** Lưu trữ các thông tin chi tiết và phân loại nội dung của nhân vật theo từng khía cạnh như bối cảnh, đặc điểm, mối quan hệ, hội thoại mẫu hoặc thông tin khác phục vụ cho việc xây dựng ngữ cảnh AI.
- **Quan hệ (Relations):** Quan hệ N-1 với bảng `Characters` (thông qua `character_id`).

---

## 2. Cấu trúc trường dữ liệu (Schema / Columns)

| Tên cột (Field) | Kiểu dữ liệu (Data Type) | Ràng buộc (Constraints)                                                                          | Mô tả chi tiết (Description)                                |
| :-------------- | :----------------------- | :----------------------------------------------------------------------------------------------- | :---------------------------------------------------------- |
| `character_id`  | VARCHAR(36) / UUID       | Foreign Key -> `Characters(id)`, Not Null                                                        | Khóa ngoại liên kết tới bảng nhân vật.                      |
| `type`          | ENUM                     | Not Null (`background`, `characters`, `traits`, `relationship`, `sample conversation`, `others`) | Phân loại khía cạnh chi tiết của nhân vật.                  |
| `context`       | TEXT                     | Not Null                                                                                         | Nội dung chi tiết của khía cạnh tương ứng (cột đặt ở cuối). |
| `created_at`    | TIMESTAMP                | Default: CURRENT_TIMESTAMP                                                                       | Thời điểm chi tiết bản ghi được tạo.                        |
| `updated_at`    | TIMESTAMP                | Default: CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP                                           | Thời điểm chi tiết bản ghi được cập nhật.                   |

---

## 3. Chỉ mục tối ưu (Indexes & Performance)

- `PRIMARY KEY (`character_id`, `type`):` Khóa chính tổng hợp đảm bảo mỗi loại thông tin chi tiết (`type`) chỉ xuất hiện một lần cho mỗi nhân vật.
- `INDEX idx_character_type (`character_id`, `type`):` Tối ưu hóa truy vấn lấy thông tin chi tiết theo nhân vật và phân loại.

---

## 4. Khác (Function, Procedure, Hook)

- Trống.
