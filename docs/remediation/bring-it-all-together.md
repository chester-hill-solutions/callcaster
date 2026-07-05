# Bring It All Together

## Cross-Cutting Themes

These issues span multiple slices and must be fixed at the architecture/tooling level.

### 1. Workspace Authorization Is Not Consistently Enforced

- **Where:** data-plane routes, settings UI, telephony loaders, media upload, survey responses.
- **Problem:** Many routes call `requireDualAuth` or `verifyAuth` and then use a request-supplied `workspace_id` or `campaign_id` without membership/role checks.
- **Remediation:** Create a small `requireWorkspaceAction`/`requireWorkspaceLoader` wrapper used at the top of every workspace-scoped route. Extend the API surface coverage check to assert the route helper matches its declared `authClass`. Return 404 for non-members per ADR-0004.

### 2. Concurrency Is a First-Class Threat

- **Where:** predictive dialer queue, IVR response writes, ACD offers, SMS duplicate checks, invite acceptance.
- **Problem:** Read-modify-write races, non-atomic claims, and missing locks allow duplicate calls, lost DTMF inputs, duplicate offers, and duplicate SMS.
- **Remediation:** Use `SELECT ... FOR UPDATE SKIP LOCKED`, atomic upserts, JSON-merge RPCs, and partial unique indexes. Add concurrency tests for every critical path.

### 3. Schema and Migration Drift Is Critical

- **Where:** `job` table, `transaction_history`/`apply_ledger_entry`, legacy triggers, `workspace_users`/`workspace_invite` unique constraints, survey child tables, join-table scoping.
- **Problem:** The baseline, Drizzle schema, client migrations, and archive migrations disagree. Legacy triggers with hardcoded Supabase JWTs are still in the baseline.
- **Remediation:** Reconcile the active migration path. Add a single migration that drops obsolete triggers/functions and creates the current RPCs. Regenerate the baseline from the current DB state after cleanup.

### 4. Twilio Signature Validation Is Inconsistent

- **Where:** call, dial, IVR, ACD, voicemail, media, disconnect routes.
- **Problem:** Some TwiML/status callbacks validate signatures; many don't. Dev fallback to main account token creates a spoofing path.
- **Remediation:** Central `requireTwilioSignature` wrapper for all Twilio-facing routes, plus server-level middleware for Twilio paths. Use canonical `BASE_URL()`. Remove the main-account fallback.

### 5. Billing Idempotency and Correctness Are Fragmented

- **Where:** call-status, auto-dial/status, IVR/status, Stripe webhook, confirm-payment, checkout.
- **Problem:** Different idempotency keys for the same event; double-debits; failed calls billed; manual dial not billed; IVR vs staffed mismatch.
- **Remediation:** Single source of truth for call status/billing: one function, one key per call, campaign-derived billing kind. Use `stripeSessionKey(session.id)` everywhere. Add a reconciliation job that alerts on duplicate ledger rows.

### 6. Background Work Architecture Is Undecided

- **Where:** Bun worker, cron jobs, media stream service.
- **Problem:** Cron jobs hit HTTP routes that are unauthenticated or broken; worker is a stub; media stream is external.
- **Remediation:** Finish the Bun worker with the Drizzle `job` table as canonical. Long-running worker for real-time jobs; cron enqueues scheduled jobs. Move media stream in-repo as a separate Bun service with signed-token auth.

### 7. No-RLS Data Boundary Is Leaking

- **Where:** tenant-db, admin-db, shared helpers.
- **Problem:** Scoped Drizzle is the intended accessor, but shared helpers import `adminDb`. `tenantDb.update` can move rows between workspaces. `execute` bypasses scoping.
- **Remediation:** Strip workspace column in tenant `insert`/`update`. Remove or rename raw `execute`. Restrict unscoped helpers to admin-only modules. Add ESLint or test coverage for route-importable modules importing `adminDb`.

### 8. Secrets and Logging Hygiene

- **Where:** baseline SQL, logs, cron routes, webhook payloads.
- **Problem:** Hardcoded JWT in repo; logs emit raw errors/results; optional cron secrets; outgoing webhooks unsigned.
- **Remediation:** Rotate leaked secrets; add secret scanner to CI; implement redaction logger; sign webhooks; make cron secrets mandatory.

### 9. Rate Limiting Is Not Production-Ready

- **Where:** auth, integrator, API-key, SMS, webhook test.
- **Problem:** In-memory `Map` per process; no limits on integrator or API-key routes; `X-Forwarded-For` trusted.
- **Remediation:** Redis-backed in production, in-memory fallback locally. Key by API key ID for integrator routes, IP for public routes, user ID for authenticated HTML. Provision Redis in Railway.

### 10. Survey, Media, and Public Forms Lack Abuse Controls

- **Where:** public survey endpoints, message_media, contact-form.
- **Problem:** Public endpoints accept client-generated IDs; media upload has no auth or validation; no CAPTCHA/rate limiting.
- **Remediation:** Server-generate survey result IDs; add CAPTCHA and rate limits; enforce workspace auth on media; validate file type/size.

### 11. OpenAPI / API Surface Drift

- **Where:** `api-surface.ts`, `openapi-build.ts`, public routes.
- **Problem:** Declared `authClass` does not match implementation; non-integrator routes use broad object schemas; drift not caught by CI.
- **Remediation:** Extend the API surface coverage check to enforce auth-class fidelity. Migrate public routes to actual Zod schemas in OpenAPI.

### 12. Bun Server Is Not Production-Ready

- **Where:** `server/bun.ts`.
- **Problem:** Path traversal, missing static files, shallow health checks, missing production niceties.
- **Remediation:** Fix path traversal and align with `server/index.js` before production use. Add tests.

### 13. Testing Must Be Adversarial

- **Where:** all slices.
- **Problem:** Existing tests cover happy paths. Cross-workspace, concurrency, billing, signature, and replay scenarios are missing.
- **Remediation:** Add an adversarial security test suite per slice. Run it on every PR.

### 14. Documentation Drift Is Real

- **Where:** API surface inventory, OpenAPI spec, `docs/stripe-webhook.md`, `public-api-test-drift.md`.
- **Problem:** Docs describe behavior the code does not implement.
- **Remediation:** Update docs only after fixes are shipped. Keep the remediation docs as the source of truth until then.

## Master Priority Order

| Phase | Focus | Estimated Duration |
|---|---|---|
| **Phase 0** | Fix schema/migration drift (job table, `apply_ledger_entry`, drop legacy triggers, rotate hardcoded JWT) | 3–5 days |
| **Phase 1** | Workspace auth + RBAC across all slices; API-key auth | 1–2 weeks |
| **Phase 2** | Telephony concurrency + billing correctness + Twilio signature validation | 1–2 weeks |
| **Phase 3** | Worker implementation, cron auth, media stream in-repo, SSE hardening | 2–3 weeks |
| **Phase 4** | Public API/OpenAPI, webhook signing, admin CSRF/audit, observability | 2–3 weeks |

## Suggested First PRs

1. **Schema/migration cleanup** — drop legacy triggers, promote `apply_ledger_entry`, reconcile `job` table.
2. **Workspace auth sweep** — add `requireWorkspaceAccess` to data-plane and settings routes.
3. **Auth correctness** — fix reset password, sign-out, accept-invite.
4. **API-key prefix fix** — derive unique prefix, add index.
5. **Twilio signature wrapper** — add middleware + route wrapper.

## Tracking

See the per-slice docs in `docs/remediation/` and the status tracker in `docs/remediation/README.md`.
