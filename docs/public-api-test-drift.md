# Public API test and coverage drift

Coordination notes for API documentation and contracts. Update when adding endpoints or changing auth.

## Resolved

| Area | Status |
|------|--------|
| Scalar `/docs` (public + complete tabs) | Shipped |
| Public OpenAPI — user-facing session + workspace routes | `app/lib/openapi.ts`, `tools:api:surface:check` |
| Integrator OpenAPI (3 paths, detailed schemas) | `openapi/integrator-api.json`, Hey API codegen |
| Complete surface inventory + CI gate | `app/lib/api-surface.ts`, PR #993 |
| `INTEGRATOR_API_PATHS` / Zod parity | `test/openapi.test.ts` |
| XOR `script` / `script_id` refine | Zod + OpenAPI + tests |

## Remaining gaps

| Area | Issue | Target fix |
|------|--------|------------|
| Session route schemas | Many public routes use broad `object` bodies | Add Zod + OpenAPI detail per high-traffic route |
| Outreach `$id` auth | Weak session client on legacy path | Session scoping or route removal |
| `/api/queues` | Documented security gap | Mandatory `verifyAuth` before public promotion |

## Verification

```bash
npm run typecheck
npm run test:node -- openapi api-surface docs-openapi
npm run tools:routes:verify
npm run tools:api:surface:check
npm run tools:api:codegen
git diff --exit-code
```
