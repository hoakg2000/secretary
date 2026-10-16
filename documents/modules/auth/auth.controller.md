# Auth Controller

- **Class**: `AuthController` — `server/src/auth/auth.controller.ts`
- **Base endpoint**: `/api/v1/auth`
- **Auth**: global `JwtAuthGuard`; routes marked `@Public()` are open. The access token is checked against
  `user_sessions` on every request (`JwtStrategy`), so ending a session ends its access token.
- **Response**: `{ statusCode, message, data }`.
- **Description**: login of the master user, refresh-token rotation, logout, current session, Google OAuth2 connect
  and callback (Gmail and Calendar).

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. `LoginDto` is `email` + `password` (was `username`, `deviceId`, `userAgent`); `user_sessions.device_id` is never written. Login returns `accessToken` and `user` only (no `tokenType`, `expiresIn`, `session`). Added `POST /auth/refresh` rotation and replay rule, `GET /auth/session`, `GET /auth/google/connect` and the `state` check on the callback. The refresh token is stored as a SHA-256 hash, not encrypted. |

---

## Endpoints

### 1. Login — `POST /api/v1/auth/login` `[Implemented]`

- **Handler**: `login(loginDto, req, res)` → `AuthService.login`
- **Auth**: `@Public()`, `ThrottlerGuard` (5 per minute, key `req.ip`; 429 beyond that).
- **Request** `LoginDto`: `email` (valid email, required), `password` (string, min 6, required).
- **Does**: creates a `user_sessions` row (with `User-Agent` and `req.ip`), signs the tokens, stores the refresh
  token hash. Sets the `refreshToken` cookie: `httpOnly`, `sameSite: lax`, path `/api/v1/auth`, `secure` when
  `NODE_ENV=production`, lifetime from the token's `exp`.
- **Response `data`**: `{ accessToken, user: { id, email } }`.
- 401 for an unknown email, a user without a password, an inactive user, or a wrong password (same message).

### 2. Refresh — `POST /api/v1/auth/refresh` `[Implemented]`

- **Handler**: `refreshAccessToken(req, body, res)` → `AuthService.refreshAccessToken`
- **Auth**: `@Public()`.
- **Request** `RefreshTokenDto`: `refreshToken?` (string). The cookie wins; the body is the fallback.
- **Does**: rotates the token (old one revoked, new one issued, same transaction) and sets a new cookie.
- **Response `data`**: `{ accessToken }`, plus `refreshToken` only when no cookie was sent.
- 401 for a bad, expired or unknown token. Presenting an already rotated token deletes the whole session.

### 3. Logout — `POST /api/v1/auth/logout` `[Implemented]`

- **Handler**: `logout(req, body, res)` → `AuthService.logout`
- **Auth**: JWT.
- **Request** `LogoutDto`: `sessionId?` (UUID). Omitted → the current session. Another session is accepted only
  when it belongs to the same user.
- Clears the cookie only when the current session ends. Response has no `data`.

### 4. Current session — `GET /api/v1/auth/session` `[Implemented]`

- **Handler**: `getActiveSession(req)` → `AuthService.getActiveSession`
- **Auth**: JWT.
- **Response `data`**: `{ sessionId, ipAddress, userAgent, lastActiveAt, createdAt, user: { id, email, isActive, createdAt } }`.
  Also updates `last_active_at`.

### 5. Google connect URL — `GET /api/v1/auth/google/connect` `[Implemented]`

- **Handler**: `getGoogleConnectUrl(req)` → `AuthService.getGoogleConnectUrl`
- **Auth**: JWT.
- **Response `data`**: `{ url }`. Offline access, forced consent, scopes `https://mail.google.com/`,
  `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/userinfo.email`. The `state` is a
  JWT (`typ: oauth_state`) valid 10 minutes that carries the user ID.

### 6. Google callback — `GET /api/v1/auth/google/callback` `[Implemented]`

- **Handler**: `handleGoogleCallback(code, state)` → `AuthService.handleGoogleCallback`
- **Auth**: `@Public()` (Google redirects the browser here; the signed `state` is the proof).
- **Query**: `code`, `state` (both required).
- **Response `data`**: `{ success: true }`. Tokens are stored encrypted.
- 400 for a missing `code`, an invalid, expired or wrong-type `state`, or when Google returns no access token.
