# Public API & Webhooks Remediation

## Summary

The public API and webhooks slice has unauthenticated call-control routes, privilege erosion on admin-tagged endpoints, unsafe CallCaster-to-integrator webhook fanout, and significant OpenAPI/SDK drift. The webhook fanout and `/api/disconnect` are the most severe.

## Detailed Findings

| Severity | Location | Problem | Remediation |
|---|---|---|---|
| Critical | `api+/dial/$number.action.server.ts` | Returns TwiML dialing any number with recording; no auth or signature. | Add Twilio signature validation or gate behind session/API key. |
| Critical | `api.disconnect.action.server.ts` | Pauses arbitrary calls using main account token; no auth. | Delete or gate behind signature/session; verify call ownership. |
| Critical | `api+/workspace.action.server.ts` | Classified `workspaceAdmin` but only checks membership; callers can mutate `twilio_data`. | Enforce owner/admin role; return only public fields. |
| High | `api+/test-webhook.action.server.ts` | Classified `workspaceAdmin` but any authenticated user can fire arbitrary outbound POSTs. | Require workspace admin; harden SSRF. |
| High | `api+/workspaces+/$workspaceId/webhook.action.server.ts` | POST branch never calls membership/role check. | Add `requireMemberManager` or equivalent. |
| High | `api+/campaigns/create-with-script.action.server.ts`, `api+/chat_sms.action.server.ts`, `api+/sms.action.server.ts` | No `Idempotency-Key` handling; duplicate campaigns/SMS/billing. | Add `Idempotency-Key` support for full business transaction. |
| High | `api-keys.action.server.ts`, integrator routes | No rate limiting. | Add per-API-key and per-IP limits. |
| High | `workspace-webhooks.server.ts`, `WorkspaceSettingUtils.server.ts` | Outgoing webhooks have no HMAC signature, retry, or timeout. | Sign with workspace secret; add timeout and retry. |
| High | `workspace-webhooks.server.ts` | CallCaster-to-integrator fanout is undocumented and unsafe. | Document in `api-webhooks.md`; add delivery table; retry; signature. |
| Medium | `safe-outbound-url.server.ts` | SSRF guard bypassable via DNS rebinding/redirects. | Resolve IP before fetch; disable redirects; add timeout. |
| Medium | `platform-auth.server.ts` | `/api/auth/token` returns same value for access and refresh token. | Return distinct tokens or redesign contract. |
| Medium | `scripts/check-api-surface-coverage.ts` | Checks structural coverage but not auth-class fidelity. | Add static analysis to assert route helper matches declared `authClass`. |
| Medium | `api+/recording.action.server.ts` | Validates signature but does not persist recording metadata. | Persist to call row or dedicated table. |
| Medium | `openapi-build.ts` | Most public routes use `broadObjectSchema` with `additionalProperties: true`. | Replace with actual Zod schemas; add CI check. |
| Medium | `openapi-integrator.ts`, `api-generated/client.gen.ts` | Spec claims `Authorization: Bearer cc_...` but generated SDK uses `X-API-Key`. | Align spec and SDK; ship pre-configured client factory. |
| Medium | `workspace_api_key` table, `platform-members.server.ts`, `api-auth.server.ts` | No expiry, revocation, audit, rotation; SHA-256 hash. | Add `expires_at`, `revoked_at`, audit log, rotation; use slow hash. |
| Medium | `platform-idempotency.server.ts` | In-memory `Map`; not used for integrator mutations. | Move to Postgres/Redis; add `Idempotency-Key` to integrator routes. |
| Low | `public-api-test-drift.md` | `/api/queues` listed as security gap; it is a feature gap. | Update drift doc to reflect accurate status. |

## Remediation Plan

| Priority | Item | Effort |
|---|---|---|
| P0 | Gate `/api/dial/$number` and `/api/disconnect` | 1–2 days |
| P0 | Fix `/api/workspace` authorization | 1 day |
| P0 | Fix `/api/test-webhook` and POST webhook route | 1 day |
| P1 | Add idempotency to integrator writes | 2–3 days |
| P1 | Add rate limiting to API-key/integrator routes | 2 days |
| P1 | Sign outgoing webhooks with retry/timeout | 2–3 days |
| P2 | Fix `/api/auth/token` refresh token contract | 1 day |
| P2 | Add API surface auth-class fidelity check | 1–2 days |
| P2 | Improve OpenAPI request-body schemas | 2–3 days |
| P2 | Align generated SDK with spec auth | 1–2 days |
| P3 | Add API key lifecycle controls | 2–3 days |

## Cross-Cutting Concerns

- The public API depends on the auth, workspace, and data-plane slices being correct first.
- Webhook delivery reliability requires the worker to be functional.
- OpenAPI fidelity is a product/documentation issue as much as an engineering one.
