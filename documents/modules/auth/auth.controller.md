# Authentication & Session Controller

- **Base Endpoint**: `/api/v1/auth`
- **General Description**: Handles Master User authentication, token issuance and refresh, session termination, active session retrieval, and Google OAuth2 integration (connect & callback for Gmail and Calendar APIs).

---

## List of Endpoints

### 1. Master User Login

- **Endpoint**: `POST /api/v1/auth/login`
- **Guard / Auth**: None (Public)
- **Description**: Authenticates the Master User credentials. Upon successful validation, issues an Access Token in the response body and sets an HTTP-Only Refresh Token cookie. It also creates a new active record in `user_sessions` and records token metadata in `refresh_tokens`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `LoginDto`
  - `username` (`string`, required): Master User username or email address.
  - `password` (`string`, required): Plaintext password for authentication.
  - `deviceId` (`string`, optional): Unique client device identifier.
  - `userAgent` (`string`, optional): User-Agent string from the HTTP request header.

- **Response DTO**: `LoginResponseDto`
  - `accessToken` (`string`): Issued JWT Access Token.
  - `tokenType` (`string`): Token type identifier (e.g., `Bearer`).
  - `expiresIn` (`number`): Access Token expiration time in seconds.
  - `session` (`SessionInfoDto`): Newly created user session summary.

---

### 2. Refresh Access Token

- **Endpoint**: `POST /api/v1/auth/refresh`
- **Guard / Auth**: None (Validates Refresh Token from HTTP-Only cookie or payload)
- **Description**: Verifies the provided Refresh Token against active records in `refresh_tokens`. If valid and non-revoked, issues a new JWT Access Token. Supports rotation/replay detection to safeguard session security.

#### Data Transfer Objects (DTO)

- **Request DTO**: `RefreshTokenDto`
  - `refreshToken` (`string`, optional): Refresh Token value if not sent via HTTP-Only cookie.

- **Response DTO**: `RefreshTokenResponseDto`
  - `accessToken` (`string`): Newly issued JWT Access Token.
  - `tokenType` (`string`): Token type identifier (e.g., `Bearer`).
  - `expiresIn` (`number`): Access Token expiration time in seconds.

---

### 3. Terminate Login Session (Logout)

- **Endpoint**: `POST /api/v1/auth/logout`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Terminates the current login session by marking or deleting the corresponding record in `user_sessions`, revoking the Refresh Token in `refresh_tokens`, and clearing the HTTP-Only cookie.

#### Data Transfer Objects (DTO)

- **Request DTO**: `LogoutDto`
  - `sessionId` (`string`, optional): Specific session ID to terminate. Defaults to current active session if omitted.

- **Response DTO**: `LogoutResponseDto`
  - `success` (`boolean`): Indicates whether the logout operation was successful.
  - `message` (`string`): Confirmation message detailing session termination.

---

### 4. Retrieve Active Session Information

- **Endpoint**: `GET /api/v1/auth/session`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Fetches current active session details from `user_sessions` and current user metadata from `users` based on the authenticated JWT Access Token.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetSessionQueryDto`
  - None (Uses Access Token payload from headers)

- **Response DTO**: `SessionInfoResponseDto`
  - `id` (`string`): Session UUID.
  - `userId` (`string`): Master User UUID.
  - `deviceId` (`string`): Registered device identifier.
  - `ipAddress` (`string`): IP address recorded during session creation/activity.
  - `userAgent` (`string`): Browser or client user-agent string.
  - `lastActiveAt` (`string`): ISO 8601 timestamp of last activity.
  - `createdAt` (`string`): ISO 8601 timestamp of session creation.

---

### 5. Connect Google Account

- **Endpoint**: `GET /api/v1/auth/google/connect`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Generates and returns the Google OAuth2 consent screen setup URL for authenticating the Google account with full scopes for both Gmail API (`https://mail.google.com/`) and Google Calendar API (`https://www.googleapis.com/auth/calendar`).

#### Data Transfer Objects (DTO)

- **Request DTO**: None

- **Response DTO**: `ConnectGoogleResponseDto`
  - `url` (`string`): Google OAuth2 consent URL.

---

### 6. Handle Google OAuth Callback

- **Endpoint**: `GET /api/v1/auth/google/callback`
- **Guard / Auth**: None
- **Description**: Handles callback from Google OAuth2 server with Authorization Code, exchanges it for access & refresh tokens covering both Gmail and Google Calendar APIs, encrypts the tokens, and updates user profile settings in `users`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GoogleOAuthCallbackQueryDto`
  - `code` (`string`, required): OAuth authorization code returned by Google.
  - `state` (`string`, optional): Security state token.

- **Response DTO**: `GoogleOAuthCallbackResponseDto`
  - `success` (`boolean`): OAuth linkage success status.
  - `message` (`string`): Outcome description message.

