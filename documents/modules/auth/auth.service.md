# Auth Services

- **Module**: `AuthModule` — `server/src/auth/auth.module.ts`
- **Description**: login, refresh-token rotation, session lifecycle, JWT validation, Google OAuth2 clients and
  encrypted storage of Google tokens.

| Class | File (under `server/src/auth/`) | Role | Status |
|-------|---------------------------------|------|--------|
| `AuthService` | `auth.service.ts` | Login, refresh, logout, session, Google connect and callback. | `[Implemented]` |
| `JwtStrategy` | `strategies/jwt.strategy.ts` | Verifies an access token and checks its session row. | `[Implemented]` |
| `JwtAuthGuard` | `guards/jwt-auth.guard.ts` | Global guard; skips routes with `@Public()`. | `[Implemented]` |
| `GoogleClientFactory` | `google-client.factory.ts` | OAuth2 client per user, saves tokens, saves refreshed tokens. | `[Implemented]` |

**Tables**: `users`, `user_sessions`, `refresh_tokens`.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. Refresh tokens are stored as a SHA-256 hash (not encrypted); each carries a `jti`. Rotation, replay detection (a rotated token used again deletes the session), `JwtStrategy` session check, signed OAuth `state`, and `GoogleClientFactory` added. `device_id` is never written. No AI tool in this module. |
| 2026-10-16 | Review fix: method headings tagged `[Implemented]`. |

---

## AuthService

Not an AI tool in any method.

### 1. login(loginDto, userAgent?, ipAddress?) `[Implemented]`

- Looks up `users` by `email`. Fails with the same 401 for an unknown user, no `password_hash`, inactive user or a
  failed `bcrypt` compare.
- Creates a `user_sessions` row (`user_agent` default `Unknown`, `ip_address` default `127.0.0.1`).
- Signs the access token (`JWT_SECRET`, `JWT_EXPIRES_IN`; claims `sub`, `email`, `sessionId`, `typ: access`).
- Issues a refresh token: signed with `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, claims `sub`, `sessionId`,
  `typ: refresh`, `jti`. Its SHA-256 hash goes to `refresh_tokens.token_hash`; `expires_at` is the token's `exp`.
- Returns `{ accessToken, refreshToken, refreshExpiresAt, user: { id, email } }`.
- **Tables**: `users` (read), `user_sessions` (create), `refresh_tokens` (create).

### 2. refreshAccessToken(refreshToken?) `[Implemented]`

- Verifies the signature and `typ: refresh`, finds the row by hash. Missing or expired → 401.
- Row already `is_revoked` → the session is deleted (refresh tokens go with it by cascade) and 401 follows.
- The session's user must match `sub` and be active.
- In one transaction: marks the old row revoked (`updateMany` where not revoked; zero rows → 401) and issues a new
  refresh token. Returns a new access token and the new refresh token.
- **Tables**: `refresh_tokens` (read, create, update), `user_sessions` (read, delete on replay), `users` (read).

### 3. logout(userId, sessionId) `[Implemented]`

- `deleteMany` on `user_sessions` where `id` and `user_id` match; refresh tokens cascade. Returns `{ success: true }`,
  also when nothing matched.

### 4. getActiveSession(userId, sessionId) `[Implemented]`

- Reads the session and its user; 401 when missing. Sets `last_active_at = now`. Returns the session and
  `user: { id, email, isActive, createdAt }`.

### 5. getGoogleConnectUrl(userId) `[Implemented]`

- Signs `state` (`{ sub: userId, typ: 'oauth_state' }`, 10 minutes, `JWT_SECRET`) and returns the Google consent URL
  (`access_type: offline`, `prompt: consent`).

### 6. handleGoogleCallback(code?, state?) `[Implemented]`

- 400 without `code`. Verifies `state` (signature, `typ: oauth_state`, `sub`); otherwise 400.
- Exchanges `code` for tokens, 400 when there is no access token, then `GoogleClientFactory.saveTokens`.
- **Tables**: `users` (update).

---

## JwtStrategy `[Implemented]`

`validate(payload)` accepts only `typ: access` with `sub` and `sessionId`, and requires a `user_sessions` row for
that ID whose `user_id` equals `sub` and whose user is active. Returns `{ userId, email, sessionId }` as `req.user`.

## GoogleClientFactory `[Implemented]`

- `createOAuthClient()`: client from `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- `saveTokens(userId, tokens)`: encrypts access and refresh tokens with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`,
  `server/src/common/crypto/token-cipher.ts`, format `v1:<iv>:<tag>:<ciphertext>`) and writes them with
  `google_token_expires_at` to `users`. Absent values are left unchanged.
- `forUser(userId)`: decrypts the stored tokens and returns an OAuth2 client, or `null` when Google is not
  connected. Tokens refreshed by Google are saved back. Used by the calendar sync and the Gmail push service.
