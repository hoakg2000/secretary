# Backend Service (`/server`)

Thư mục `server` chứa toàn bộ mã nguồn phía Backend của hệ thống, được xây dựng dựa trên framework **NestJS** với ngôn ngữ **TypeScript**. Hệ thống cung cấp các RESTful API, quản lý xác thực người dùng, tích hợp các mô hình AI tiên tiến, tương tác với hệ sinh thái Google APIs và xử lý các tác vụ nền (background jobs).

---

## 🛠 Tech Stack Chính

- **Framework**: [NestJS](https://nestjs.com/) (TypeScript)
- **Architecture**: REST API, Dependency Injection, Modular Architecture
- **Database ORM**: [Prisma](https://www.prisma.io/)
- **Validation**: Zod, Class-Validator, Class-Transformer
- **Task Scheduling**: NestJS Schedule (Cron)

---

## 📦 Các Package & Thư Viện Sử Dụng

Danh sách các thư viện chính được sử dụng trong dự án và vai trò của từng package:

### 1. AI & Automation (Trí tuệ nhân tạo & Tự động hóa)

- **`@google/genai`**: Kết nối và giao tiếp trực tiếp với các mô hình Gemini AI từ Google. Xử lý kịch bản nâng cao như **Tool Calling (Function Calling)** để AI có thể thực thi các chức năng cụ thể trong hệ thống.
- **`@nestjs/schedule`** _(kèm `cron`)_: Quản lý và lập lịch chạy các tác vụ định kỳ (Cronjob) tự động ở phía backend.

### 2. Google Ecosystem Integration (Hệ sinh thái Google)

- **`googleapis`**: Kết nối, ủy quyền và tương tác trực tiếp với các dịch vụ trong hệ sinh thái Google (chẳng hạn như Google Drive, Gmail, Google Calendar,...).
- **`google-auth-library`**: Xác minh tính hợp lệ của Google ID Token được gởi từ phía Client trong luồng Đăng nhập bằng Google (Google OAuth/SSO).

### 3. Authentication & Security (Xác thực & Bảo mật)

- **`@nestjs/jwt`**: Tạo, giải mã và xác thực chuỗi JSON Web Token (JWT) phục vụ duy trì phiên đăng nhập của người dùng.
- **`@nestjs/passport`** _(kèm `passport-jwt`)_: Xây dựng các Lớp bảo vệ (Guards) và chiến lược xác thực (Auth Strategies) cho API.
- **`argon2`**: Thuật toán mã hóa thế hệ mới dùng để băm (hash) và kiểm tra mật khẩu người dùng một cách an toàn nhất.

### 4. Database & Validation (Cơ sở dữ liệu & Kiểm tra dữ liệu)

- **`Prisma`**: ORM hiện đại giúp tương tác với cơ sở dữ liệu một cách Type-safe, quản lý migration và truy vấn dữ liệu hiệu quả.
- **`class-validator` & `class-transformer`**: Validate dữ liệu đầu vào (DTO) gửi lên từ client và ép kiểu dữ liệu tự động.
- **`Zod`**: Được kết hợp sử dụng để kiểm tra cấu trúc dữ liệu linh hoạt (Schema validation).

### 5. Utilities & Integration (Tiện ích & Tích hợp)

- **`@nestjs/config`**: Đọc và quản lý tập trung các biến môi trường từ file `.env`.
- **`@nestjs/axios`** _(kèm `axios`)_: Wrapper HTTP Client giúp gửi yêu cầu và nhận dữ liệu từ các dịch vụ bên thứ ba (3rd-party APIs).

---

## 🚀 Cấu trúc thư mục định hướng (Tham khảo)

```text
server/
├── src/
├── prisma/
│   └── schema.prisma
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```
