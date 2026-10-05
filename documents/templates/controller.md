# [Controller Name] Controller

- **Base Endpoint**: `/api/v1/...`
- **General Description**: [Brief description of the purpose and functionality of this Controller]

---

## List of Endpoints

### 1. [Name/Summary of Endpoint 1 Functionality]

- **Endpoint**: `[POST / GET / PUT / PATCH / DELETE] /api/v1/...`
- **Guard / Auth**: `[Guard / Middleware / Permissions Name, e.g., AuthGuard('jwt'), RolesGuard('ADMIN')]`
- **Description**: [Detailed description of the process flow and purpose of this endpoint]

#### Data Transfer Objects (DTO)

- **Request DTO**: `[Request DTO Name, e.g., CreateUserDto]`
  - `field1` (`Type`, required): [Description of field 1]
  - `field2` (`Type`, optional): [Description of field 2]

- **Response DTO**: `[Response DTO Name, e.g., UserResponseDto]`
  - `field1` (`Type`): [Description of field 1]
  - `field2` (`Type`): [Description of field 2]

---

### 2. [Name/Summary of Endpoint 2 Functionality]

- **Endpoint**: `[POST / GET / PUT / PATCH / DELETE] /api/v1/...`
- **Guard / Auth**: `[Guard / Middleware / Permissions Name]`
- **Description**: [Detailed description of the process flow and purpose of this endpoint]

#### Data Transfer Objects (DTO)

- **Request DTO**: `[Request DTO / Params / Query Name]`
  - `id` (`string`, path param): [Description of param]

- **Response DTO**: `[Response DTO Name]`
  - `success` (`boolean`): [Processing status]
