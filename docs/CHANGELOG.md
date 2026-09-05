# Changelog

Customer- and operator-facing changes, newest first. Every PR that changes app behavior adds a line under **Unreleased**; each dev → master release PR moves those lines into a dated section headed by the release PR. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed

- On the onboarding **Number** step, the "Rent a Canadian number" and "Verify your own number" titles no longer have the box edge drawn through them ([#1113](https://github.com/chester-hill-solutions/callcaster/issues/1113)).
- The **Identity** step in onboarding now shows as complete once the legal business name is saved. It previously stayed marked unfinished because it was judged against the messaging-program fields collected on a later step ([#1204](https://github.com/chester-hill-solutions/callcaster/issues/1204)).
- One-off chat texts are recorded before they are handed to Twilio, the same protection campaign texts gained, so a write failure after sending can no longer leave a sent text unbilled and missing from the conversation ([#1586](https://github.com/chester-hill-solutions/callcaster/issues/1586)).
- The Twilio status recovery sweep finishes pending campaign texts that never received a delivery callback: it matches them to the provider record and bills them, or marks them failed without a charge when the provider has no record ([#1578](https://github.com/chester-hill-solutions/callcaster/issues/1578)).
- Campaign texts are recorded before they are handed to Twilio, so a send can no longer go out unrecorded and unbilled if the write after sending fails; the delivery callback attaches the provider ID to the pending record. A contact whose send Twilio refused stays eligible for the next attempt ([#1582](https://github.com/chester-hill-solutions/callcaster/issues/1582)).
- A campaign text that Twilio accepted but whose record could not be saved is now reported to operations immediately instead of disappearing from billing and the conversation view unnoticed ([#1581](https://github.com/chester-hill-solutions/callcaster/issues/1581)).
- Polling the status of a campaign export that no longer exists returns "not found" instead of a server error ([#1577](https://github.com/chester-hill-solutions/callcaster/issues/1577)).
- The `POST /api/auth/reset-password` endpoint works again: it accepts the reset `token` in the body and no longer requires a signed-in session to reset a forgotten password ([#1560](https://github.com/chester-hill-solutions/callcaster/issues/1560)).
- The Twilio status recovery sweep now queues an SMS's billing job before marking the message delivered or failed. Previously a failure between those two steps left the message marked terminal and never billed ([#1571](https://github.com/chester-hill-solutions/callcaster/issues/1571)).
- Removing an image from one campaign's message no longer deletes the file while another campaign in the workspace still uses it. The file is only deleted when no campaign references it ([#1575](https://github.com/chester-hill-solutions/callcaster/issues/1575)).
- Background schedules (billing reconciliation, number rental billing, low-credit notices, campaign schedule sweeps) now restart themselves within minutes if a run fails to queue its next occurrence, and ops is alerted when that happens. Previously one such failure silently paused the schedule until the worker was redeployed ([#1570](https://github.com/chester-hill-solutions/callcaster/issues/1570)).
- Confirming a new authenticator code on **Account → Security** now keeps you verified. The confirmation response was missing the cookie that records the check, so the next protected page could send you back to the code screen ([#1564](https://github.com/chester-hill-solutions/callcaster/issues/1564)).
- The monthly number-rental sweep no longer treats its own errors as non-payment. A failed balance lookup, an unknown balance, or a failed ledger write skips that number for the day and retries on the next sweep, instead of warning, suspending, or releasing a number whose owner did nothing wrong ([#1555](https://github.com/chester-hill-solutions/callcaster/issues/1555)).
- The **Reset password** page now tells you when a reset link is invalid or expired instead of reporting success, and it no longer strips spaces from the start or end of the new password ([#1559](https://github.com/chester-hill-solutions/callcaster/issues/1559)).
- A background worker that stalls past its claim timeout can no longer complete, retry, dead-letter, or extend a job that another worker has since taken over. Those writes are fenced to the claiming worker and log `worker.claim_lost` instead ([#1548](https://github.com/chester-hill-solutions/callcaster/issues/1548)).
- The boot-time migration bootstrap takes a database advisory lock for the whole pass, so two app instances starting at once no longer replay the same migration files concurrently ([#1547](https://github.com/chester-hill-solutions/callcaster/issues/1547)).
- Photos and other attachments on **inbound** text messages now show in the chat view. They were stored correctly but never given a viewable link, so only the message text appeared ([#1557](https://github.com/chester-hill-solutions/callcaster/issues/1557)).

### Changed

- The automated calling goal is called **Automated phone menu** everywhere: the onboarding goal picker no longer says "IVR" and campaign labels no longer say "Robocall". Advanced IVR keeps its own name ([#1347](https://github.com/chester-hill-solutions/callcaster/issues/1347)).
- Every place that shows or edits a time now says which time zone it uses: the campaign schedule's Start and End columns, the chat "Send later" picker, and the billing activity date column all show your browser's time zone alongside the value ([#969](https://github.com/chester-hill-solutions/callcaster/issues/969)).
- Contact, call-list, and onboarding screens now consistently say **Call list** where some labels still said "Audience" (headings, the queue picker placeholder, the add-list page, and the onboarding step) ([#1067](https://github.com/chester-hill-solutions/callcaster/issues/1067)).
- New campaigns default to calling hours of **09:00 to 21:00** local (was 09:00 to 17:00), and the same default applies when you enable a day or use the "Apply … to Weekdays / All Days" buttons. Saved schedules are unchanged ([#1127](https://github.com/chester-hill-solutions/callcaster/issues/1127)).
- Two-factor authentication is turned off for all accounts for now. Sign-in no longer asks for an authenticator code, owners and admins are not asked to enroll, and **Account → Security** says so. Existing enrollments are kept and everything returns when the `TWO_FACTOR_ENABLED` setting is switched on ([#1567](https://github.com/chester-hill-solutions/callcaster/issues/1567)).
- The compose e2e scripts that drop the database schema and purge the MinIO bucket now refuse any `DATABASE_URL` or `S3_ENDPOINT` that is not the local stack, so a stray exported variable cannot point them at a real environment ([#1553](https://github.com/chester-hill-solutions/callcaster/issues/1553)).

- Outbound messages now cost **2 credits per SMS segment** ($0.04) and **4 credits per MMS** ($0.08), up from 1 and 2. The billing page, campaign cost estimates, and the Twilio reconciliation report all follow the new rate ([#1533](https://github.com/chester-hill-solutions/callcaster/issues/1533)).

### Security

- Signing out through the API with a bearer token now revokes that token's session; it previously only cleared the browser cookie ([#1563](https://github.com/chester-hill-solutions/callcaster/issues/1563)).
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
