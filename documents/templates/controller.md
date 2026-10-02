# API Endpoint Documentation Template

## 1. Thông tin cơ bản của API

- **Tên API:** `<Ví dụ: getProduct / syncUserEmails / createMemory>`
- **Endpoint:** `HTTP_METHOD /api/v{version}/{resource}`
- **Mô tả chức năng:** `<Mô tả ngắn gọn API này dùng để làm gì trong hệ thống trợ lý ảo thông minh>`
- **Authentication / Authorization (Guard):**
  - `<Ví dụ: JwtAuthGuard, RolesGuard (Yêu cầu role: ADMIN / USER)>`

---

## 2. DTO (Data Transfer Object) & Validation / Transformation

_(Sử dụng thư viện `class-validator` và `class-transformer`)_

### 2.1. Request DTO / Query / Params

- **Tên Class DTO:** `<Ví dụ: GetProductQueryDto>`
- **Mục đích:** `<Mô tả DTO này dùng để làm gì, validate dữ liệu đầu vào nào>`
- **Cấu trúc / Các trường:**
  - `field_name` (datatype): `@IsNotEmpty()`, `@IsString()`, `@Transform(...)` - `<Mô tả chi tiết trường>`

### 2.2. Response DTO

- **Tên Class DTO:** `<Ví dụ: ProductResponseDto>`
- **Mục đích:** `<Mô tả cấu trúc dữ liệu trả về sau khi đã transform>`
- **Cấu trúc / Các trường:**
  - `field_name` (datatype): `<Mô tả chi tiết trường trả về>`

---

## 3. Entity & Database Mapping

- **Entity liên quan:** `<Ví dụ: ProductEntity, UserMemoryEntity, EmailLogEntity>`
- **Mô tả quan hệ (Relations):** `<Ví dụ: ManyToOne với User, OneToMany với Transaction>`
- **Các trường chính sử dụng:**
  - `id`: `<Khóa chính>`
  - `created_at / updated_at`: `<Timestamp>`

---

## 4. Business Flow & Service Mapping

### 4.1. Sơ đồ Flow (Sequence / Activity Flow)

```text
Vẽ sơ đồ controller nhận data gì, các flow if else logic thể hiện bên trong controller (nếu gọi đến service thì ghi ra gọi service gì)
```

### 4.2. Mô tả chi tiết các bước xử lý & Tên Service gọi đến

1. **Bước 1 (Xác thực & Bảo mật):**
   - Kiểm tra Guard (`Guard Name`). Nếu không hợp lệ trả về lỗi `401/403`.
2. **Bước 2 (Xử lý tại Controller & Service):**
   - Controller tiếp nhận request đã được validate qua DTO và chuyển tiếp lời gọi sang tầng Service tương ứng.
   - **Mã Service gọi đến:** `SER-SV-001` - `<Tên hàm/service xử lý logic nghiệp vụ chính, ví dụ: ProductService.findAll() hoặc MemoryService.updateSemanticMemory()>`
3. **Bước 3 (Tương tác dữ liệu / External Integration):**
   - Service gọi Repository để query Database hoặc gọi Google API (nếu tích hợp Gmail/Calendar).
4. **Bước 4 (Định dạng kết quả trả về):**
   - Dữ liệu thô từ Service được ánh xạ qua Response DTO và trả về Client.

---

## 5. Output / Response Status Codes

_chỉ liệt kê nếu có, liệt kê đủ trường hợp, ví dụ 404 do không tìm thấy product và không tìm thấy category là 2 trường hợp khác nhau_

- **`200 OK / 201 Created`**: Mô tả trường hợp thành công kèm Response DTO.
- **`400 Bad Request`**: Lỗi do dữ liệu đầu vào không khớp với điều kiện trong DTO (`class-validator`).
- **`401 Unauthorized`**: Lỗi chưa đăng nhập hoặc token hết hạn.
- **`403 Forbidden`**: Lỗi không đủ quyền hạn (Guard từ chối).
- **`404 Not Found`**: Không tìm thấy tài nguyên trong Database.
- **`500 Internal Server Error`**: Lỗi hệ thống bất ngờ.
