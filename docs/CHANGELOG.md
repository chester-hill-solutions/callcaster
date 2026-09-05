# Changelog

Customer- and operator-facing changes, newest first. Every PR that changes app behavior adds a line under **Unreleased**; each dev → master release PR moves those lines into a dated section headed by the release PR. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed

- Confirming a new authenticator code on **Account → Security** now keeps you verified. The confirmation response was missing the cookie that records the check, so the next protected page could send you back to the code screen ([#1564](https://github.com/chester-hill-solutions/callcaster/issues/1564)).
- The monthly number-rental sweep no longer treats its own errors as non-payment. A failed balance lookup, an unknown balance, or a failed ledger write skips that number for the day and retries on the next sweep, instead of warning, suspending, or releasing a number whose owner did nothing wrong ([#1555](https://github.com/chester-hill-solutions/callcaster/issues/1555)).
- The **Reset password** page now tells you when a reset link is invalid or expired instead of reporting success, and it no longer strips spaces from the start or end of the new password ([#1559](https://github.com/chester-hill-solutions/callcaster/issues/1559)).
- A background worker that stalls past its claim timeout can no longer complete, retry, dead-letter, or extend a job that another worker has since taken over. Those writes are fenced to the claiming worker and log `worker.claim_lost` instead ([#1548](https://github.com/chester-hill-solutions/callcaster/issues/1548)).
- The boot-time migration bootstrap takes a database advisory lock for the whole pass, so two app instances starting at once no longer replay the same migration files concurrently ([#1547](https://github.com/chester-hill-solutions/callcaster/issues/1547)).
- Photos and other attachments on **inbound** text messages now show in the chat view. They were stored correctly but never given a viewable link, so only the message text appeared ([#1557](https://github.com/chester-hill-solutions/callcaster/issues/1557)).

### Changed

- Two-factor authentication is turned off for all accounts for now. Sign-in no longer asks for an authenticator code, owners and admins are not asked to enroll, and **Account → Security** says so. Existing enrollments are kept and everything returns when the `TWO_FACTOR_ENABLED` setting is switched on ([#1567](https://github.com/chester-hill-solutions/callcaster/issues/1567)).
- The compose e2e scripts that drop the database schema and purge the MinIO bucket now refuse any `DATABASE_URL` or `S3_ENDPOINT` that is not the local stack, so a stray exported variable cannot point them at a real environment ([#1553](https://github.com/chester-hill-solutions/callcaster/issues/1553)).

### Changed

- Outbound messages now cost **2 credits per SMS segment** ($0.04) and **4 credits per MMS** ($0.08), up from 1 and 2. The billing page, campaign cost estimates, and the Twilio reconciliation report all follow the new rate ([#1533](https://github.com/chester-hill-solutions/callcaster/issues/1533)).

### Security

- Resetting your password now signs out every other session on the account, so a session that was already open elsewhere stops working ([#1561](https://github.com/chester-hill-solutions/callcaster/issues/1561)).
- Workspace-scoped database updates now drop the workspace column from the update payload at runtime, so no code path can move a row to another workspace ([#1542](https://github.com/chester-hill-solutions/callcaster/issues/1542)).
- The contacts API creates a new contact in the workspace the caller was authorized for, ignoring any other workspace named in the request body ([#1541](https://github.com/chester-hill-solutions/callcaster/issues/1541)).
- Workspace invites from **Settings → Members** validate the requested role and refuse a role above the inviter's own, so a member can no longer invite someone as admin or owner ([#1543](https://github.com/chester-hill-solutions/callcaster/issues/1543)).
- The accept-invite page no longer creates accounts while registration is closed. It now returns the same "Registration is closed." refusal as the signup page ([#1550](https://github.com/chester-hill-solutions/callcaster/issues/1550)).

## 2026-09-02 — release [#1506](https://github.com/chester-hill-solutions/callcaster/pull/1506)

### Added

- CI blocks a release pull request into `master` whose behavior changes have no dated changelog entries or that leaves entries under Unreleased ([#1505](https://github.com/chester-hill-solutions/callcaster/pull/1505)).

### Fixed

- Campaigns launched with **Schedule** no longer start sending early. The worker holds a scheduled campaign until its start date, and a scheduled launch re-times any dispatch job already queued for the campaign ([#1502](https://github.com/chester-hill-solutions/callcaster/pull/1502), [#1501](https://github.com/chester-hill-solutions/callcaster/issues/1501)).
- **Duplicate campaign** works again and always creates a draft under a free title ("X (Copy)", "X (Copy 2)", …). It copies the queue and audience links, and a title race returns a clear conflict instead of a generic failure ([#1503](https://github.com/chester-hill-solutions/callcaster/pull/1503), [#1500](https://github.com/chester-hill-solutions/callcaster/issues/1500)).

## 2026-09-02 — release [#1499](https://github.com/chester-hill-solutions/callcaster/pull/1499)

### Added

- Workspace **Billing → Activity** rolls usage for the same campaign and calendar month into one expandable row showing the period, entry count, activity types, and total credits. Purchases, number rentals, and one-off usage stay as individual lines ([#1496](https://github.com/chester-hill-solutions/callcaster/pull/1496), [#1488](https://github.com/chester-hill-solutions/callcaster/issues/1488)).

### Fixed

- A chat SMS that Twilio accepted is never reported as a failed send. A send that uses up the balance shows a separate billing warning instead ([#1497](https://github.com/chester-hill-solutions/callcaster/pull/1497), [#1487](https://github.com/chester-hill-solutions/callcaster/issues/1487)).
- SMS usage debits now record the campaign they belong to, matching voice debits ([#1495](https://github.com/chester-hill-solutions/callcaster/pull/1495), [#1494](https://github.com/chester-hill-solutions/callcaster/issues/1494)).

## 2026-09-02 — release [#1493](https://github.com/chester-hill-solutions/callcaster/pull/1493)

### Added

- **Join** on the call screen now explicitly registers the phone device instead of registering on page load ([#1470](https://github.com/chester-hill-solutions/callcaster/pull/1470)).
- `db:schema:check` compares enum values against the live database, so a missing enum value fails the drift check ([#1479](https://github.com/chester-hill-solutions/callcaster/pull/1479)).
- Client migrations run on boot in the dev and staging environments, not only production ([#1478](https://github.com/chester-hill-solutions/callcaster/pull/1478)).

### Fixed

- **Add from Audience** on the campaign queue reports every outcome, including "already linked" and "no contacts with a phone number", and resets the picker so it cannot be double-submitted ([#1489](https://github.com/chester-hill-solutions/callcaster/pull/1489), [#1472](https://github.com/chester-hill-solutions/callcaster/issues/1472)).
- Twilio voice geo-permission updates send the complete per-country object; enabling permissions during onboarding no longer fails with error 20001 ([#1490](https://github.com/chester-hill-solutions/callcaster/pull/1490), [#1474](https://github.com/chester-hill-solutions/callcaster/issues/1474)).
- The `waiting` campaign status exists in every database lineage; the campaign schedule sync no longer dead-letters every minute and drained campaigns can complete ([#1491](https://github.com/chester-hill-solutions/callcaster/pull/1491), [#1476](https://github.com/chester-hill-solutions/callcaster/issues/1476)).
- Stripe webhook signatures verify under Bun, so credit purchases confirm again ([#1480](https://github.com/chester-hill-solutions/callcaster/pull/1480)).
- The call screen's only navigate-away action is **Leave Campaign** ([#1469](https://github.com/chester-hill-solutions/callcaster/pull/1469)).
- Add Audio and call-list upload zones share one drop zone component ([#1467](https://github.com/chester-hill-solutions/callcaster/pull/1467)).

## 2026-08-31 — release [#1466](https://github.com/chester-hill-solutions/callcaster/pull/1466)

### Added

- An audible end-of-call tone plays when either side hangs up ([#1461](https://github.com/chester-hill-solutions/callcaster/pull/1461), [#1363](https://github.com/chester-hill-solutions/callcaster/issues/1363)).

### Fixed

- The inactive-campaign dialog on the call screen navigates to the campaign page instead of history-back ([#1465](https://github.com/chester-hill-solutions/callcaster/pull/1465)).

## 2026-08-31 — release [#1460](https://github.com/chester-hill-solutions/callcaster/pull/1460)

### Added

- The workspace switcher is a searchable combobox, and long dropdowns cap to the viewport ([#1454](https://github.com/chester-hill-solutions/callcaster/pull/1454)).

### Fixed

- The dial tone keeps ringing for the whole dialing window; unmuting no longer silences it ([#1457](https://github.com/chester-hill-solutions/callcaster/pull/1457)).
- The call-screen header holds the just-called contact until the agent hands off ([#1459](https://github.com/chester-hill-solutions/callcaster/pull/1459)).
- Onboarding reports format errors as format errors, not "required" ([#1456](https://github.com/chester-hill-solutions/callcaster/pull/1456), [#1122](https://github.com/chester-hill-solutions/callcaster/issues/1122)).
- Onboarding wizard content width is capped, except on the first-number step ([#1455](https://github.com/chester-hill-solutions/callcaster/pull/1455)).

## v2 platform cutover — 2026-08-31 and earlier

Production moved from the Supabase-era app to the v2 platform on 2026-08-31. The entries below were accumulated during that migration and are kept as written.

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
