# [Module] Controller

- **Class**: `[Module]Controller` — `server/src/[module]/[module].controller.ts`
- **Base endpoint**: `/api/v1/[path]`
- **Auth**: [for example: every route needs the application JWT (global `JwtAuthGuard`). List the `@Public()` routes.]
- **Response**: `{ statusCode, message, data }`. [Name the routes that differ: no `data`, SSE, binary.]
- **Description**: [One or two sentences: what the module manages and how.]

---

## Endpoints

(Group the endpoints under `## [Group name]` headings when the module has several resources. Number endpoints across the whole file.)

### 1. [Title] — `[METHOD] /api/v1/[path]`

- **Handler**: `[methodName](args)`. [Status code when it is not 200, for example "Returns 201."]
- **Request** `[RequestDto]`: `field` ([type], required), `field?` ([type], optional, default [value]). [Query and path params the same way.]
- **Response `data`**: `{ field, field }` or [short description].
- Errors: [404 when ..., 400 when ..., 409 when ...].

### 2. [Title] — `[METHOD] /api/v1/[path]/:id`

- **Handler**: `[methodName](id)`. [Behavior in one or two sentences.]
