# Twilio webhook auth and credential policy

CallCaster validates Twilio webhooks with `X-Twilio-Signature` using each workspace’s subaccount auth token from `workspace.twilio_data`. When no workspace token is available, behavior differs between the **Node app** and **Supabase Edge Functions**.

## Environment detection

| Runtime | Non-production signal | Production signal |
| --- | --- | --- |
| **Node app** (`app/lib/twilio-workspace-credentials.ts`) | `process.env.NODE_ENV !== "production"` | `NODE_ENV === "production"` |
| **Edge Functions** (`supabase/functions/_shared/twilio-workspace-credentials.ts`) | `ENVIRONMENT` unset or not `"production"`, and no `DENO_DEPLOYMENT_ID` | `ENVIRONMENT === "production"` or `DENO_DEPLOYMENT_ID` is set |

Both implementations share `readTwilioWorkspaceCredentials()` (camelCase and snake_case keys). They diverge only in how they decide whether to fall back to the main account token.

## Auth token resolution

1. **Prefer workspace credentials** — if `workspace.twilio_data` includes `authToken` / `auth_token`, use it for signature validation and Twilio REST calls.
2. **CallSid / MessageSid first** — resolve the workspace from the call or message row when present.
3. **AccountSid fallback** — if the row is missing (create→insert race), look up the workspace by webhook `AccountSid` against `workspace.twilio_data.sid` (also `account_sid` / `accountSid`).
4. **Production fail-closed** — missing workspace credentials yield no auth token; webhook validation returns 403 hangup TwiML. Failures are logged as `twilio.webhook.auth_failed` with a reason (`missing_signature`, `missing_credentials`, `invalid_signature`, `resolver_error`). Bun pre-handler exceptions log `twilio.webhook.prehandler_error` instead of failing silently.

App helpers live in `app/lib/twilio-webhook.server.ts` (`requireTwilioSignature`, etc.).

## Validation toggle

The Node app also respects `TWILIO_VALIDATE_WEBHOOKS` (`app/twilio.server.ts` → `shouldValidateTwilioWebhooks()`). When set to `false` or `0`, signature checks are skipped locally. Edge Functions do not use this flag; they always validate when an auth token is present.

## CallSid vs MessageSid asymmetry

Documented in `app/lib/twilio-webhook.server.ts`:

- **CallSid webhooks** may validate against the main account token in non-production when no `call` row exists yet (early lifecycle callbacks during local testing).
- **MessageSid webhooks** fail closed when no `message` row exists — inbound SMS must attribute workspace before persisting.

## Live webhooks (app) vs open sync (Edge)

| Path | Role | Auth for Twilio REST |
| --- | --- | --- |
| **App routes** (`app/routes/api+/…`) | Real-time Twilio webhooks (inbound voice/SMS, call/SMS status, IVR, etc.) | Workspace `twilio_data` per request; dev fallback via `NODE_ENV` |
| **Edge `twilio-open-sync`** | Scheduled backfill (`pg_cron` every 5m) for stale `call` / `message` rows | Workspace `twilio_data` from DB only; dev fallback via `ENVIRONMENT` |

Parity: both paths use the same credential parsing and the same production rule (no main-account fallback). The app handles Twilio **push** callbacks; `twilio-open-sync` **pulls** open statuses from Twilio REST for rows that missed webhooks. Billing/disposition logic in open sync mirrors app status handlers via shared Edge modules (`_shared/ivr-status-logic.ts`, `_shared/sms-status-logic.ts`).

Open sync is invoked with a service-role JWT from `app.settings.supabase_service_role_jwt` (see `supabase/migrations/20260414200000_twilio_open_sync_cron.sql`). Twilio-facing Edge functions called directly by Twilio (`sms-status`, `ivr-status`, etc.) use `verify_jwt = false` and rely on signature validation instead.

## Related docs and tests

- Testing map: `docs/testing-map.md` (webhook section)
- App validation tests: `test/twilio-webhook.server.test.ts`, `test/twilio-webhook-validation.test.ts`
- Credential policy tests: `test/twilio-workspace-credentials.test.ts`
- Open sync candidates: `test/twilio-open-sync-candidates.test.ts`
