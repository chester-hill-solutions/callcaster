# Pre-prod resilience gate — 2026-07-14

## Key results

| KR | Criterion | Status |
|----|-----------|--------|
| KR1 | Bun worker deployed; pg_cron HTTP retired; no duplicate cron | **PASS** — `callcaster-worker` SUCCESS (1 replica); job table aligned; `/api/jobs/*` enqueue-only; Railway cron functions scaled to 0; pg_cron unschedules in migration |
| KR2 | Manual Twilio smoke on review | **BLOCKED** — `CallCaster` CRASHED (empty Twilio/Stripe/Resend secrets). Checklist filed at [twilio-smoke-review-results.md](./twilio-smoke-review-results.md) |
| KR3 | Heavy webhook side effects off request path | **PASS** (code) — call-status / sms-status / recording enqueue side-effect jobs |
| KR4 | Agent mutations emit workspace events | **PASS** (code) — chat/queue/campaign status emitters wired |
| KR5 | Sentry + correlation IDs | **PASS** (code) — env-gated `SENTRY_DSN`; request context on web/worker/media-stream; dead-letter admin panel |
| KR6 | Billing alerts + debit audit | **PASS** (code/docs) — [billing-debit-audit.md](./billing-debit-audit.md), [credit-floor-policy.md](./credit-floor-policy.md), reconcile material-variance logging |
| KR7 | Cross-tenant leak tests | **PASS** — `test/data-plane-cross-tenant-*.test.ts` green |
| KR8 | `ci:local` green | **PARTIAL** — typecheck clean; focused resilience suites green; full `ci:local` not blocked on Twilio secrets |

## Soft gate (CHS packages)

| Item | Status |
|------|--------|
| jobqueue / pg-realtime / media-library / contact-import | **Deferred with adapters** — [chs-package-adoption.md](./chs-package-adoption.md); thin adapters under `app/lib/adapters/` |

## Unblock Twilio smoke

1. Populate `TWILIO_*`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY` on `CallCaster` (and referenced on worker).
2. Restart `CallCaster` until `/readyz` is ready.
3. Execute [manual-test-plan-zero-supabase.md](./manual-test-plan-zero-supabase.md) categories 1–8; update [twilio-smoke-review-results.md](./twilio-smoke-review-results.md).
