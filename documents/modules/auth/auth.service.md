# Authentication & Session Service

- **General Description**: Manages core business logic for user authentication, session lifecycle, JWT issuance, token rotation, and credential verification.
- **Accessed Database Tables**:
  - `users`
  - `user_sessions`
  - `refresh_tokens`

---

## List of Methods

### 1. login

- **Task Description**: Validates user credentials against `users`. On successful verification, generates an Access Token and Refresh Token, persists the refresh token in `refresh_tokens`, and inserts a new active session into `user_sessions`.
- **Accessed Tables**: `users` (Read), `user_sessions` (Create), `refresh_tokens` (Create)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `loginDto`: `LoginDto` - Data transfer object containing user credentials, device ID, and user agent info.
  - `ipAddress`: `string` - Client IP address extracted from request headers.

- **Output**:
  - `Promise<{ response: LoginResponseDto; rawRefreshToken: string }>`: Access token payload, session details, and unencrypted refresh token string for cookie setup.

---

### 2. refreshAccessToken

- **Task Description**: Validates the incoming refresh token against `refresh_tokens` and verifies session status in `user_sessions`. Ensures token is not expired or revoked. Generates and returns a fresh Access Token.
- **Accessed Tables**: `refresh_tokens` (Read), `user_sessions` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `refreshToken`: `string` - Unencrypted refresh token provided by client.

- **Output**:
  - `Promise<RefreshTokenResponseDto>`: Newly generated JWT access token details.

---

### 3. logout

- **Task Description**: Revokes the active refresh token in `refresh_tokens` and removes or deactivates the corresponding session record in `user_sessions`.
- **Accessed Tables**: `refresh_tokens` (Update), `user_sessions` (Delete/Update)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `userId`: `string` - Authenticated Master User UUID.
  - `sessionId`: `string` - UUID of the session to terminate.

- **Output**:
  - `Promise<LogoutResponseDto>`: Status flag and operation result message.

---

### 4. getActiveSession

- **Task Description**: Queries `user_sessions` for session details associated with the current session ID and updates the `last_active_at` timestamp.
- **Accessed Tables**: `user_sessions` (Read, Update), `users` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `userId`: `string` - Authenticated Master User UUID.
  - `sessionId`: `string` - Current active session UUID.

- **Output**:
  - `Promise<SessionInfoResponseDto>`: Active session metadata and associated user information.
