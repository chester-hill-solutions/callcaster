# Changelog

## [Unreleased]

### Added

- React Router v7 migration: Vite-based build (`react-router build`), `@react-router/express` custom server, and `data()` responses instead of Remix `json()`.
- Runtime server hardening: shared `validateRequiredEnv` (`app/lib/required-env-keys.mjs`), `/readyz` waits for `buildReady`, structured JSON request logs (excluding probes), security headers, and optional `PROCESS_FATAL_ON_REJECTION`.
- Supabase SQL migrations, `twilio-open-sync` Edge Function with pg_cron (`net.http_post` + service role JWT), shared open-sync candidate helpers and tests; `number-rental-billing` cron path documented for JWT-less invocation.
- Campaign SMS duplicate prevention (skip send when an equivalent queued/sent row exists), `onlyQueued` filtering on campaign queue reads, and tests.
- [docs/script-structure.md](script-structure.md) for campaign `script.steps` / IVR navigation, linked from README and docs index (see PR #963).
- Structured logging for `/api/inbound`, Twilio account JSON persistence helper for workspace creation.
- Inbound handset dial-end API, handset ringing toggle in phone settings, and call-handling hook improvements (auto-accept, connection management).

### Changed

- Route modules consolidated to single `route.tsx` files per URL (RR7 automatic client/server split); removed colocated `route.server.tsx` shims under `app/routes/`.
- Campaign result aggregation (`CampaignResultDisplay`, disposition components, key message metrics), optional caller ID for messaging-service campaigns, SMS send mode / messaging service resolution utilities, database types, and workspace navigation for campaigns.
- Twilio open sync default fetch limits (100, cap 250) and related tests.
- Tooling and config: `package.json`, `tsconfig`, Vitest UI config, and related env/docs touchpoints.

### Fixed

- Campaign readiness: validate schedule intervals with clock semantics (overnight and UTC-shifted windows), aligned with `isWithinCallingHours`, fixing false invalid-window / readiness errors ([#971](https://github.com/chester-hill-solutions/callcaster/issues/971), PR [#973](https://github.com/chester-hill-solutions/callcaster/pull/973)).
- Supabase migrations: replay-safe and idempotent changes (dequeue fields in timestamped migration, chunk export SQL fixes, cron job detection via `cron.job`, FK/policy tolerance, CLI-friendly migration filenames).
- Inbound Twilio: load workspace `twilio_data` when join omits it; subaccount vs env `TWILIO_AUTH_TOKEN` fallback; workspace ID extraction for logging (PRs #948–#950).
- Realtime and API routes: refactors in Supabase hooks, chat routes, queue status checks, and improved type safety on several API routes.

### Removed

- Legacy `app/routes/archive/**` and `old.*` IVR/dashboard routes; `app/lib/legacy-route.server.ts`. Route modules now live under nested folders (`workspaces+/$id/...`, `api+/...`) via remix-flat-routes.
- Legacy `twilio-serverless` JS assets (`flow.js`, `ivr.js`, `recording.js`, `status.js`, etc.) and root `websocket.server.js` removed in favor of current app and Edge Function paths.

### Security

- **Remix Twilio webhooks:** `validateTwilioWebhook` / `validateTwilioWebhookParams` in `app/twilio.server.ts` verify `X-Twilio-Signature` by default; set `TWILIO_VALIDATE_WEBHOOKS=false` (or `0`) for local tunnel dev only.
- **API auth:** `api.auto-dial.dialer`, `api.test-webhook`, `api.campaign_audience`, `api.outreach-attempts`, and `api.queues` enforce session auth and workspace access.
- **Cron:** `number-rental-billing` accepts optional `NUMBER_RENTAL_CRON_SECRET` via `x-cron-secret` when configured.
- **Legacy routes:** `app/routes/old.*` and `app/routes/archive/**` return HTTP 410 in production via `legacyRouteGoneResponse()`.

### 0.0.1

Base URL now passed in through env. Accessed in dashboard. No more NGROK.

---
