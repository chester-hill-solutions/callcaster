# Public API test and coverage drift

Coordination notes for the public API surface. Update when adding endpoints or changing contracts.

## Resolved (API docs sweep)

| Area | Status |
|------|--------|
| Scalar `/docs` + `/api/docs/openapi` | Shipped |
| `PUBLIC_API_PATHS` / OpenAPI / Zod parity | `test/openapi.test.ts` + `app/lib/public-api.ts` |
| `parseJsonBodyOrResponse` | Covered in `test/api-parse.server.test.ts` |
| Public route schema validation | `create-with-script`, `chat_sms`, `sms` route tests |
| XOR `script` / `script_id` refine | Zod + OpenAPI description + tests |
| UUID test fixtures | `test/helpers/public-api-fixtures.ts` |
| Integrator docs (quickstart, errors, SDK) | `docs/api-overview.md` |
| OpenAPI response examples + caveats | `app/lib/openapi.ts` |
| Hey API codegen | `openapi-ts.config.ts`, `tools:api:codegen`, CI drift gate |

## Remaining gaps

| Area | Issue | Target fix |
|------|--------|------------|
| Next public endpoints | Audiences, scripts CRUD, campaign status | Product decision + doc-first promotion |
| Outreach `$id` auth (E53) | Before public promotion | Session scoping on `PATCH /api/outreach_attempts/:id` |

## Verification

```bash
npm run typecheck
npm run test:node -- openapi docs api-parse campaigns-create-with-script chat-sms sms.route
npm run tools:routes:verify
npm run tools:api:codegen
git diff --exit-code
```
