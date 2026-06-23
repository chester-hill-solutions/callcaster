# Public API test and coverage drift

Coordination notes for the public API surface. Update when adding endpoints or changing contracts.

## Resolved (API docs sweep)

| Area | Status |
|------|--------|
| Scalar `/docs` + `/api/docs/openapi` | Shipped |
| `PUBLIC_API_PATHS` / OpenAPI / Zod parity | `test/openapi.test.ts` + `app/lib/public-api.ts` |
| `parseJsonBodyOrResponse` | Covered in `test/api-parse.server.test.ts` |
| Public route schema validation | `create-with-script`, `chat_sms`, `sms` route tests |

## Remaining gaps

| Area | Issue | Target fix |
|------|--------|------------|
| `test/sms.route.test.ts`, `test/chat-sms.route.test.ts` | Some happy-path fixtures still use short workspace IDs (`w1`) via mocks | Optional cleanup; real validation tests use UUIDs |
| Stripe webhook, agent-status, inbound IVR | No dedicated route tests | Add after handler contracts stabilize |
| Hey API codegen | Not wired | `openapi-ts.config.ts` + `tools:api:codegen` when public set is stable |

## Verification

```bash
npm run typecheck
npm run test:node -- openapi docs api-parse campaigns-create-with-script chat-sms sms.route
npm run tools:routes:verify
```
