# Wave 0 — Cutover Feature Manifest

**Generated:** 2026-07-13

> **2026-07-29 status addendum (code-verified pre-ship pass).** This manifest
> predates the Wave 1 hard-cuts and has drifted; verified deltas:
> SEC-01/02/05/06 hard-cuts landed (`/api/auto-dial/dialer` and
> `/api/disconnect` deleted with authenticated workspace replacements;
> inbound-verification signed). SURVEY-01 respondent POSTs are hardened
> (DB rate limit + honeypot + signed respondent token); the GET loader remains
> public by design. Sign-in/2FA/verify-email/reset-password/contact-form are
> now rate-limited. The A2P Event Streams sink is gated by
> `TWILIO_EVENTS_SINK_SECRET`. TEL-01 call-side guard is atomic in
> `updateCallBySid` and messages now have the same terminal guard
> (`updateMessageBySid`); TEL-04 open-sync recovers lost terminal billing;
> BILL-02 rental billing catches up missed cycles. TEL-02 is fixed on the
> predictive-dialer path (intent-park on ambiguous dial); TEL-03
> complete/abandon now resolves entries by CallSid and releases agents on
> dial failure. Data cutover scope is void: ship decision (2026-07-29) is a
> fresh production database — no Supabase data migration. See
> `docs/api-internal-unsupported.md` and the ship plan for the current gate
> list.

Each feature classified for the low-traffic Postgres cutover window. **Proved** = safe on target with current code path. **Disabled** = must turn off if not fixed before cutover. **Deferred** = explicitly post-cutover.

## Security & auth

| Feature | Status | Wave / ID |
|---------|--------|-----------|
| Secret-free workspace settings API | **Disabled** until SEC-01 | W1 |
| Legacy `POST /api/workspace` | **Disabled** (delete) | W1 SEC-01 |
| Predictive dialer HTTP | **Disabled** (delete unauthenticated route) | W1 SEC-02 |
| Workspace-scoped dialer start | **Deferred** until implemented | W1 SEC-02 |
| `/api/disconnect` | **Disabled** (delete) | W1 SEC-05 |
| Inbound phone verification | **Disabled** until signed | W1 SEC-06 |
| Email-bound invites | **Deferred** until SEC-03 + CHS publish | W1 |
| Capability registry + API key scopes | **Deferred** until SEC-07 | W1 |
| MFA re-enrollment owner/admin | **Required at cutover** | W1 SEC-08 |
| Stored webhook production delivery | **Disabled** or safe-fetch only | W1 SEC-04a |
| Queue cross-tenant mutations | **Disabled** until DATA-01 | W1 |

## Telephony & messaging

| Feature | Status | Wave / ID |
|---------|--------|-----------|
| Manual agent dial (session) | **Proved** | — |
| Twilio webhook callbacks | **Proved** | signature paths |
| Monotonic call/message state | **Partial** — TEL-01 guard exists on `updateCallBySid` | W2 |
| ACD lifecycle recovery | **Deferred** | W2 TEL-03 |
| Durable call/SMS intent | **Deferred** | W2/W3 |

## Billing & worker

| Feature | Status | Wave / ID |
|---------|--------|-----------|
| pg_cron billing/sync HTTP | **Broken** — NULL workspaceId | W2 BILL-01 |
| Number rental billing | **Broken** at cron layer | W2 BILL-02 |
| Ledger reconciliation cron | **Broken** at cron layer | W2 BILL-03 |
| Low credit notify | **Partial** — HTTP sweep works; no durable schedule | W2 |
| Bun worker on Railway | **Proved** per board (image boots) | — |
| CHS jobqueue adoption | **Deferred** | W2 |

## Integrator API

| Feature | Status | Wave / ID |
|---------|--------|-----------|
| 3-path integrator SDK (campaign create, SMS, chat SMS) | **Proved** | — |
| Full API-01 parity | **Deferred** | post-cutover |
| `/api/v1` aliases | **Deferred** | post-cutover |

## Data & compliance

| Feature | Status | Wave / ID |
|---------|--------|-----------|
| Tenant-scoped Drizzle access | **Proved** | ADR-0004 |
| Retention automation | **Deferred** | W3 DATA-02 |
| Recording attestation | **Deferred** | W4 COMPLIANCE-01 |
| Encrypted credential vault | **Deferred** — vault package broken | decision log |

## UX & surveys

| Feature | Status | Wave / ID |
|---------|--------|-----------|
| Public surveys | **At risk** — SURVEY-01 open; disable or fix before cutover if exposed | W4 |
| Agent Handset / call screen | **Proved** | session paths |

## Cutover gate minimum (from plan)

Before traffic switch:

- [ ] W1 security boundaries (SEC-01–08, DATA-01, SEC-04a)
- [ ] Canonical membership schema + import rehearsal
- [ ] 77/77 compose E2E + manual Twilio smoke on review URL
- [ ] Billing coordinator or cron fix (BILL-01) — money jobs must run
- [ ] MFA re-enrollment for owner/admin
- [ ] Drain voice; repoint Twilio callbacks; parity checks

Post-cutover (not blocking cutover):

- API-01 full parity, UX-01–03, DATA-02, COMPLIANCE-01/02, OPS-02, coverage ratcheting
