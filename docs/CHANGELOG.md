# Changelog

## [Unreleased]

### Added

- Supabase SQL migrations, `twilio-open-sync` Edge Function with pg_cron (`net.http_post` + service role JWT), shared open-sync candidate helpers and tests; `number-rental-billing` cron path documented for JWT-less invocation.
- Campaign SMS duplicate prevention (skip send when an equivalent queued/sent row exists), `onlyQueued` filtering on campaign queue reads, and tests.
- [docs/script-structure.md](script-structure.md) for campaign `script.steps` / IVR navigation, linked from README and docs index (see PR #963).
- Structured logging for `/api/inbound`, Twilio account JSON persistence helper for workspace creation.
- Inbound handset dial-end API, handset ringing toggle in phone settings, and call-handling hook improvements (auto-accept, connection management).

### Changed

- Campaign result aggregation (`CampaignResultDisplay`, disposition components, key message metrics), optional caller ID for messaging-service campaigns, SMS send mode / messaging service resolution utilities, database types, and workspace navigation for campaigns.
- Twilio open sync default fetch limits (100, cap 250) and related tests.
- Tooling and config: `package.json`, `tsconfig`, Vitest UI config, and related env/docs touchpoints.

### Fixed

- Campaign readiness: validate schedule intervals with clock semantics (overnight and UTC-shifted windows), aligned with `isWithinCallingHours`, fixing false invalid-window / readiness errors ([#971](https://github.com/chester-hill-solutions/callcaster/issues/971), PR [#973](https://github.com/chester-hill-solutions/callcaster/pull/973)).
- Supabase migrations: replay-safe and idempotent changes (dequeue fields in timestamped migration, chunk export SQL fixes, cron job detection via `cron.job`, FK/policy tolerance, CLI-friendly migration filenames).
- Inbound Twilio: load workspace `twilio_data` when join omits it; subaccount vs env `TWILIO_AUTH_TOKEN` fallback; workspace ID extraction for logging (PRs #948–#950).
- Realtime and API routes: refactors in Supabase hooks, chat routes, queue status checks, and improved type safety on several API routes.

### Removed

- Legacy `twilio-serverless` JS assets (`flow.js`, `ivr.js`, `recording.js`, `status.js`, etc.) and root `websocket.server.js` removed in favor of current app and Edge Function paths.

### Security

- **Remix Twilio webhooks:** `validateTwilioWebhook` / `validateTwilioWebhookParams` in `app/twilio.server.ts` currently **do not verify** `X-Twilio-Signature` (see `TODO: Re-enable Twilio signature validation`). **Re-enable or gate behind a dev-only flag before production.** Supabase Edge Functions that Twilio calls use `verify_jwt = false` in `supabase/config.toml` by design (Twilio sends signatures, not Supabase JWTs); that is separate from Remix route validation.

### 0.0.1

Base URL now passed in through env. Accessed in dashboard. No more NGROK.

---
