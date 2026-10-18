# web-client

Dashboard of the Secretary assistant: Next.js (App Router), React, Tailwind with shadcn/ui, TanStack Query, next-intl (vi default, en).

## Run

1. Start the server (`server/`) on port 3000 with `CLIENT_URL=http://localhost:3001` in its `.env`. The server CORS
   and the Google OAuth redirect use that value.
2. In `web-client/`:

   ```bash
   cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
   npm install
   npm run dev                  # http://localhost:3001
   ```

Open `http://localhost:3001`; it redirects to `/vi/chat`, and to `/vi/login` when there is no session.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | dev server on port 3001 |
| `npm run build` / `npm start` | production build / serve on port 3001 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (jsdom) |

## Layout

- `src/app/[locale]/` routes. `login` is public; `(app)/` pages sit behind the client-side auth guard in `components/layout/app-shell.tsx`.
- `src/proxy.ts` is the Next 16 name for middleware. It only does locale routing; auth cannot live there because the refresh cookie belongs to the API host.
- `src/lib/api/` `client.ts` (`apiFetch`, `apiFetchRaw`), `types.ts`, `sse.ts`, `endpoints/*` (one typed function per route).
- `src/lib/auth/auth-provider.tsx` holds the access token in memory only; a reload restores the session from the httpOnly refresh cookie.
- `messages/vi.json`, `messages/en.json` must keep the same keys (checked by a test).

## Auth notes

The refresh cookie is `httpOnly`, `sameSite=lax`, path `/api/v1/auth`. `localhost:3001` and `localhost:3000` are the same site, so it works in dev. In production the API and the client must share a registrable domain.
