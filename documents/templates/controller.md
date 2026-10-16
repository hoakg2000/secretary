# [Module] Controller

- **Class**: `[Module]Controller` — `server/src/[module]/[module].controller.ts`
- **Base endpoint**: `/api/v1/[path]`
- **Auth**: [for example: every route needs the application JWT (global `JwtAuthGuard`). List the `@Public()` routes.]
- **Response**: `{ statusCode, message, data }`. [Name the routes that differ: no `data`, SSE, binary.]
- **Description**: [One or two sentences: what the module manages and how.]

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built. `[De-scoped]` = decided against; never flip it to `[Implemented]` without the owner. Put one after each endpoint heading.

## Change log

| Date | Change |
|------|--------|
| YYYY-MM-DD | What changed and why. |
| 2026-10-16 | Rewritten from the module docs (review 2026-10-16): header bullets, `## Endpoints`, heading format, `Handler` / `Request` / `Response data` bullets, `[De-scoped]` tag. |

---

## Endpoints

(Group the endpoints under `## [Group name]` headings when the module has several resources. Number endpoints across the whole file.)

### 1. [Title] — `[METHOD] /api/v1/[path]` `[Implemented]`

- **Handler**: `[methodName](args)`. [Status code when it is not 200, for example "Returns 201."]
- **Request** `[RequestDto]`: `field` ([type], required), `field?` ([type], optional, default [value]). [Query and path params the same way.]
- **Response `data`**: `{ field, field }` or [short description].
- Errors: [404 when ..., 400 when ..., 409 when ...].

### 2. [Title] — `[METHOD] /api/v1/[path]/:id` `[Implemented]`

- **Handler**: `[methodName](id)`. [Behavior in one or two sentences.]

## Not built `[Planned]`

- [Item that is designed but not in the code. Use a second section headed "Not built" with the `[De-scoped]` tag for what was decided against.]
