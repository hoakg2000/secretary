# Document Name: [Middleware Name] Middleware

**Document ID:** [DOC-MID-0001]
**Document Type:** Middleware
**Description:** [Short description of what the middleware intercepts, validates, or transforms]

## Changelog

| Date       | Version | Author      | Description of Changes |
| :--------- | :------ | :---------- | :--------------------- |
| YYYY-MM-DD | 1.0.0   | [Your Name] | Initial creation       |

## Service Dependencies

- **Service Document ID:** [DOC-SVC-AUTH-001]
- **Service Description:** Identity & Access Management Service
- **Usage:** [Sentence explaining usage, e.g., "Validates the incoming JWT against the centralized IAM service before allowing the request to proceed."]

## Middleware Specifications

- **Target Scope:** `[e.g., Global, /api/v1/secure/*]`
- **Execution Order:** `[e.g., Before Request Handler, After Error Handler]`

### Processing Logic

1.  Extract `[Header/Token]` from the incoming request.
2.  Validate `[Condition/Signature]`.
3.  If valid, append `[Context Data]` to the request object and proceed (`next()`).
4.  If invalid, return HTTP Status `[401/403]` with error payload.

### Injected Request Context (Output to next handler)

| Field Name      | Type   | Description                      |
| :-------------- | :----- | :------------------------------- |
| `req.user.id`   | UUID   | Authenticated user's unique ID   |
| `req.user.role` | String | Authenticated user's access role |
