# End-to-end audit and remediation plan — 2026-08-03

**Branch audited:** `dev` @ `41d162f0` (clean tree, identical to `origin/dev`)
**Prod status:** `origin/prod` @ `44518484` is **238 commits behind** `dev`. Every finding below is
dev-only. None has reached customers — **yet**.

> **PR [#1120](https://github.com/chester-hill-solutions/callcaster/pull/1120) "Ship CallCaster v2
> to production (dev → master)" is open.** It ships every Phase 0 and Phase 1 finding to customers.
> Treat Phase 0 and Phase 1 as blockers on that merge. No other branch fixes any of them — see
> "Work already done elsewhere" below.

---

## Baseline: all automated tooling is green — and proves less than it appears to

| Gate | Result | What it actually covered |
|---|---|---|
| `typecheck` | pass | **`app/` and `shared/` only.** Zero files from `worker/`, `server/`, `services/`, `scripts/` — see Phase 4 item 0 |
| `lint` | pass | full tree |
| `test:node`, `test:ui` | pass | DB mocked in the suites covering the worst bugs — see below |
| 15 × `check:*` guards + `tools:routes:verify` + `tools:api:surface:check` | pass | several scan narrower than their docblocks claim — see Phase 4 |
| `db:ledger:check` | pass | compared **nothing** (no `DATABASE_URL` locally — it warns loudly, correctly) |

**That is the story of this audit.** Every finding below lives in a blind spot of a gate that
reports success. Three distinct blind spots, in rough order of how much they hide:

**1. Scope.** `npm run typecheck` type-checks `app/` and `shared/` and nothing else — the job
worker that runs all billing jobs, the Bun server that performs Twilio signature validation, and the
media-stream service are entirely untyped. Three of the four runtimes this app ships have no type
checking at all. Detail and fix in Phase 4 item 0.

**2. Mocks defining the contract instead of the database.** P1-0 survives because
`test/auto-dial-status.test.ts:272` mocks `@/server/admin-db` with a `Proxy` that manufactures
whatever property is asked for — including a `.channel()` that does not exist on the real client.
P1-2 survives because `test/acd-router.test.ts:42` mocks `adminDb.execute` entirely, so a query
naming a non-existent enum label never runs. P0-3 survives because the rental test stubs `findFirst`
rather than exercising real idempotency keys. Every Phase 1 fix should ship with a test against the
compose DB, not a richer mock.

**3. Guards that scan less than they claim.** The shape already recorded as this repo's top bug
class: a hand-maintained list, an opt-in allowlist, or a scan scope narrower than the code it
purports to cover. All of Phase 4.

Treat Phase 4 as equal in priority to the individual fixes, not as cleanup afterward. Otherwise this
exact report regenerates in a month.

Dependency advisories: `npm audit --omit=dev` reports 2 high. The React Router one
(GHSA-qwww-vcr4-c8h2) is **RSC-mode only** and this app runs framework mode with `ssr: true` and
no RSC — not exploitable here. `postcss` is build-time. Patch both on hygiene cadence, not as P0.

---

## Phase 0 — Blocks PR #1120 (data exposure + money)

### P0-1. Public survey route leaks every contact in every workspace
`app/routes/survey+/$surveyId.loader.server.ts:25-29` → `app/lib/survey-db.server.ts:153-160`

The route is public — no middleware, no `auth:`. `?contact=<int>` is passed straight to
`loadContactById`, a bare `select().from(contactTable).where(eq(id, contactId))` returning the
**entire** row. Walking integer ids dumps every contact's name, phone, email, and address across
all tenants into the loader payload. The sibling *actions* already guard this
(`api+/survey-answer.action.server.ts:91`, `survey-complete.action.server.ts:86` both check
`contact.workspace !== survey.workspace`); the loader was missed.

**Fix:** require the signed respondent token (`verifyRespondentToken`, already used by the actions)
instead of a raw id, and reject unless `contact.workspace === survey.workspace`. Return only the
fields the survey UI renders, not `select()`.

### P0-2. Three cross-tenant IDOR routes on the legacy `api+` surface

All three authenticate the caller but never check **workspace membership**:

| Route | Line | Effect |
|---|---|---|
| `app/routes/api+/contacts.loader.server.ts` | 23, 31 | `workspace_id` read from the query string and passed to `createTenantDb` — any logged-in user reads any workspace's contacts |
| `app/routes/api+/campaign_audience.action.server.ts` | 42, 116 | `campaignAndAudienceShareWorkspace` proves the two *resources* match, never the caller — cross-tenant write that also mass-enqueues contacts for real dialing |
| `app/routes/api+/outreach-attempts.action.server.ts` | 25-38 | workspace derived from an attacker-supplied `contact_id`, membership never checked |

**Fix:** `await requireWorkspaceAccess({ user, workspaceId })` after resolving the workspace, in
each. `reset_campaign.action.server.ts:41` and `campaign_queue.action.server.ts:46` already do
exactly this — copy that shape.

### P0-3. First rental month is charged twice
`app/lib/platform-workspace-numbers.server.ts:318-324` vs `app/lib/number-rental-billing.server.ts:64-78, 386-393`

Purchase debits 100 credits under `number_rent_purchase:<ws>:<sid>`. `elapsedDueDates`
deliberately includes the creation-month cycle (its docblock says so) and bills it under
`number_rent:<id>:<YYYY-MM>`. The `alreadyBilled` probe only looks up the **cycle** key, so it
never sees the purchase debit. A number bought on the 3rd is charged 100 at purchase and 100
again on that day's sweep. The unit test stubs `findFirst`, so it never exercises the real keys.

**Fix:** start the `elapsedDueDates` cursor at the month *after* the anchor. Add a test that runs
purchase and sweep against the same fake ledger and asserts one debit.

### P0-4. Suspension is never lifted
`app/lib/number-rental-billing.server.ts:186-190`

`suspended_at` is written in exactly one place and cleared in **zero** — grep across `app/`,
`worker/`, `shared/`, `client/migrations/`, `test/` finds no write back to `NULL`. Once the unpaid
count returns to 0 the ladder block is skipped entirely, so paying never un-suspends. The email the
customer receives says "Add credits to restore it."

**Fix:** clear `suspended_at` after a successful `insertTransactionHistoryIdempotent` in the charge
loop.

### P0-5. Ladder can release on its first run, skipping warn and suspend
`app/lib/number-rental-lifecycle.ts:30`

`if (unpaidCycles >= RENTAL_RELEASE_AFTER_CYCLES) return "release"`. Unpaid cycles are derived from
history, and `ROLLOUT_CUTOFF_DATE` is `2026-04-01` while the ladder shipped 2026-07-31. Any number
rented in April whose workspace has been short on credits carries ~4 unpaid cycles the first time
this runs — released immediately, with no warning and no suspension ever sent. Irreversible.

**Fix:** gate release on a prior rung — only release when `suspended_at` is already set and not
recent; otherwise fall through to `suspend`.

### P0-6. Release is reported as done — and pages ops — even when it failed
`app/lib/number-rental-billing.server.ts:216-229` → `app/lib/database/workspace.server.ts:529, 617-619`

`removeWorkspacePhoneNumber` wraps its whole body in `try/catch` and **returns `{ error }`, never
throws**. Any Twilio failure is swallowed, yet the customer has already been emailed "*This cannot
be undone*", ops is paged claiming an irreversible action completed, and the number is still owned
and still unbilled. It repeats daily.

**Fix:** `const { error } = await removeWorkspacePhoneNumber(...); if (error) throw error;` before
the notify and the `"release"` return.

### P0-7. `confirm-payment` grants credits without checking `payment_status`
`app/lib/platform-billing.server.ts:309`

Guards `session.status !== "complete"` only. `checkout.session.completed` fires with
`payment_status: "unpaid"` for delayed-notification methods. Both sibling paths get this right —
`pollBillingCheckoutSession:247` and the webhook at `stripe-webhook.action.server.ts:61-67` check
both fields. This is the primary grant path (the Stripe success redirect).

**Fix:** add `|| session.payment_status !== "paid"` to the guard.

---

## Phase 1 — Blocks PR #1120 (deterministically broken product paths)

These are not edge cases. Each fails on every request, not intermittently. They read as lower
priority than Phase 0 only because a broken dialer is less damaging than leaked contact PII — on
the day #1120 merges, they are equally shipped.

These are deterministic runtime failures, invisible to CI because the DB layer is mocked in the
tests that cover them.

### P1-0. Every auto-dial status callback 500s on a dead Supabase Realtime call
`app/routes/api+/auto-dial/status.action.server.ts:325, 340, 388`

```ts
type RealtimeChannel = any;                    // :32
realtime = (adminDb as any).channel(...)       // :340
```

`adminDb` is the Drizzle client (`app/server/admin-db.ts:13`, `export const adminDb = db`). Drizzle
has no `.channel()`, and Supabase is not a dependency anywhere in `package.json` (grep count: 0).
Every invocation throws `TypeError`, lands in the catch at :382, and returns **500 — which Twilio
retries**. The `realtime.send(...)` calls at :170, :218, :286 are equally unreachable. The `as any`
is the only reason this compiles.

**This is the blocker for the whole auto-dial path.** `realtime` is assigned at :340 and
`handleCallStatus` is not called until :352, so the route dies before P1-1 is ever reached — but
P1-1 bites the moment this is fixed. Fix both in one change.

CI is green because `test/auto-dial-status.test.ts:272` mocks `@/server/admin-db` with a `Proxy`
that manufactures a `.channel()` from the stub client.

**Fix:** delete the channel / `send` / `removeChannel` path outright — it broadcasts to nobody — and
drop the `as any`. If the broadcast is still wanted, route it through the existing SSE endpoint
(`api+/workspaces+/$workspaceId/events`).

### P1-1. Predictive dial loop dies after one call — invalid UUID
`app/routes/api+/auto-dial/status.action.server.ts:164-169` (reachable only once P1-0 is fixed)

`dequeuedById: callUpdate.conference_id ?? ""` passes a **conference name**, minted as
`` `${userId}~${uuid}` `` (`auto-dial-start.server.ts:79`), into an argument bound as `::uuid`
(`db-rpc.server.ts:175-181`). Postgres raises `22P02`, `handleCallStatus` throws, the contact is
never dequeued, and `triggerAutoDialer` on line 180 is never reached. The campaign then shows
"Running" forever. The correct helper — `resolveUserIdFromConferenceName` — is defined at line 96
of the same file and used for `triggerAutoDialer` but not here.

**Fix:** `dequeuedById: resolveUserIdFromConferenceName(callUpdate.conference_id) || null`.

### P1-2. ACD queries a non-existent enum label — no inbound call is ever routed
`app/lib/acd/acd-router.server.ts:63-71`

`status not in ('completed', 'abandoned', 'failed')`. `queue_entry_state`
(`drizzle/0006_app_schema_tail.sql:124-126`) has labels `queued, offered, accepted, declined,
timed_out, abandoned, completed` — there is **no `failed`**. Postgres raises
`invalid input value for enum` on every call. `handleAcdRouterRequest` swallows it into the generic
"please wait" TwiML, so no agent is ever dialed and nothing surfaces as an error.
`app/db/schema.ts:480` types the column `text()`, which is why the type system never caught it.

**Fix:** invert to a positive list — `status in ('queued','offered','accepted')` — which also fixes
P1-3. Correct `schema.ts:480` to the real enum type.

### P1-3. Declined / timed-out offers permanently block re-offering
Same filter. A `declined` or `timed_out` entry still counts as "active", so `handleWaitUrl` skips
the claim branch and the caller holds until `MAX_QUEUE_TIME_SECONDS` (3600). Meanwhile
`countInboundQueueOfferAttempts` explicitly counts `offered/declined/timed_out` for the retry cap —
proving those states were *meant* to be re-offered — so `MAX_OFFER_ATTEMPTS` is dead code. This also
nullifies the 1eac226c reclaim fix from the caller's side: the sweep releases the agent, but the
released entry then blocks re-offering that same call.

**Fix:** covered by the positive-list change in P1-2.

### P1-4. Campaign queue loader calls an RPC that references a dropped column
`drizzle/0000_baseline.sql:4467-4505` (`AND cq.status = 'queued'`), called live from
`app/routes/api+/queues.loader.server.ts:45`

`client/migrations/20260722120000_fix_stale_status_queue_rpcs.sql:37-38` explicitly deferred this
("*NOT touched here: get_campaign_queue and select_and_update_campaign_contacts also still
reference cq.status. Leave a follow-up migration for those*") and **no follow-up exists**. Every
call raises `column cq.status does not exist` — the exact incident class that migration was written
to close.

**Fix:** one migration rewriting `select_and_update_campaign_contacts` onto `queue_state`, plus
`DROP FUNCTION public.get_campaign_queue(bigint)` (its existence also makes the 1-arg call at
`db-rpc.server.ts:214` an overload coin-flip).

### P1-5. Stale campaign-queue claims have no live reaper — and silently complete campaigns early
`app/lib/worker/campaign-dispatch.ts:55-62` is the only caller of
`reset_stale_campaign_queue_claims`, and that module is the dead Supabase-shaped one (its functions
take an injected `CampaignDispatchDb` with `.rpc()`; the only export any live code imports is
`scheduleNextDispatch`, which touches no DB).

Consequence: a row stuck in `assigned` is counted as pending by
`campaign_queue_has_pending_work` **only while `claimed_at >= now() - 10 minutes`**
(`drizzle/0000_baseline.sql:594-602`). Eleven minutes later the drain path
(`auto-dial.server.ts:355-362`) marks the campaign `complete` with un-dialled contacts stranded.
That is a remaining early-completion path the 4a29e72f fix does not cover.

**Fix:** call `reset_stale_campaign_queue_claims(campaign_id)` at the top of `runAutoDialerTurn` —
the same sweep-before-claim shape the ACD fix uses. Then delete the dead module (keeping
`scheduleNextDispatch`).

### P1-6. Max-attempts safety net is inert — two columns, two writers
`drizzle/0006_app_schema_tail.sql:230-238` — `claim_next_queue_contact` increments `attempts`,
while every policy guard reads `attempt_count` (`0000_baseline.sql:567, 600, 1343, 4232`). On the
live dialer path `attempt_count` stays 0 forever, so no contact is ever marked exhausted. The batch
RPC at `:772` does increment it, so the two paths disagree.

**Fix:** increment `attempt_count` alongside `attempts` in `claim_next_queue_contact`; plan a
follow-up to collapse the two columns.

### P1-7. Poison-pill job retries forever and starves the queue
`app/lib/worker/poll-jobs.server.ts:116-141`

`claimNextJob`'s SELECT has no `AND attempt_count < max_attempts`. Dead-lettering only happens
inside `failJob`, which is only reached when the handler **throws**. A job that kills the process
(OOM, `uncaughtException` → `exit(1)`) never gets there: Railway restarts, `resetStaleClaims`
re-queues after the 5-minute TTL, the job is re-claimed, crash, repeat. `attempt_count` climbs past
`max_attempts` and nothing reads it.

**Fix:** add `AND attempt_count < max_attempts` to the claim SELECT, plus a sweep that dead-letters
rows exceeding it.

---

## Phase 2 — Alarm storms and eroded controls

The reconciliation and rental-ladder alerting currently fire constantly, which trains everyone to
ignore billing mail — including the real alerts.

### P2-1. Reconciliation compares minutes/segments against ledger **row counts**
`shared/billing-reconciliation.ts:193, 200` — `variance: voiceTwilioMinutes - ledgerSummary.voice.events`.
One 10-minute call is 10 Twilio minutes but exactly one ledger row (`callKey` is per-SID), so
variance is 9. Threshold is 2. bba88951 fixed the *window* but left the *unit* mismatch, so the
drift detector is structurally a constant-true alarm.
**Fix:** compare derived units — SMS against `ledgerSummary.sms.credits`; voice against the sum of
`startedMinutesFromDurationSeconds` over billed calls.

### P2-2. `callGap` counts zero-duration calls the debit gate deliberately skips
`app/lib/billing-reconciliation.server.ts:42-46` has no duration predicate, but
`billTerminalCallStatus` (`twilio-call-status.server.ts:164`) returns `null` when `duration <= 0`,
and `shared/pricing.ts:78-81` documents that. Every `failed`/`busy`/`no-answer` call inflates
`billableCalls` with no matching debit. Same bug class as bba88951: two definitions of "billable".
**Fix:** add the non-zero-duration predicate so both sides share one definition.

### P2-3. Drift email dedupe never suppresses anything
`shared/billing-reconciliation-alert.ts:54-57` dedupes on `periodStart`/`periodEnd`, but the period
is a rolling 30 days ending today — both change daily. Combined with P2-1/P2-2, affected workspaces
get an internal-metrics email **every day, forever**.
**Fix:** dedupe on marker *presence*, cleared on recovery — exactly what
`app/lib/low-credit-notify.server.ts:107-140` already does correctly.

### P2-4. Warn rung re-emails daily
`app/lib/number-rental-billing.server.ts:169-181`. The suspend rung is guarded by
`if (number.suspended_at) return "none"` and every rung has an ops `dedupeKey`, but the **customer
warn email has no dedupe at all**. A workspace at 1 unpaid cycle gets "Payment needed for +1555…"
once per day per number, indefinitely. After P0-4 lands this gets worse, not better: a partially
paying suspended customer drops back to 1 cycle and starts receiving daily *warn* mail while still
suspended.
**Fix:** persist a warn marker and skip when already sent for the same unpaid-cycle count.

### P2-5. Rental renewal reminders can only fire for anchor days ≥ 26 / ≥ 16 / ≥ 4
`app/lib/number-rental-billing.server.ts:321, 325-327`. `getDueDate(anchorDate, today)` always
returns the due date in the **current** month, so `daysUntilDue = anchorDay − todayDay` and goes
negative once the day passes. Hitting the 25-day window needs `anchorDay ≥ 26`. A number rented on
the 2nd gets **no reminder, ever**. The test bakes the bug in by using anchor days 26/16/04.
**Fix:** roll to next month when `currentMonthDue < today` before computing `daysBetween`.

---

## Phase 2b — UI, error handling, and unbounded queries

### P2b-1. Export polling wedges permanently on any non-200
`AsyncExportButton.tsx:35-39` and `AdminAsyncExportButton.tsx:36-40` call `response.json()` with no
`response.ok` check. `campaign-export-status.loader.server.ts` returns `{ error }` with **no
`status` field** on 401/404/500, so `setExportStatus(undefined)` changes the effect dep → cleanup
clears the interval → the `exportStatus === "processing"` guard is now false → polling never
restarts while `isExporting` stays `true`. The button sticks on "Exporting…" forever. The 404 window
is real: the client starts polling before the status blob is written to object storage.
**Fix:** `if (!response.ok || typeof data.status !== "string") return;` before touching state.

### P2b-2. The last live instance of the `#419` deferred-loader gotcha
`app/routes/admin+/workspaces/$workspaceId/twilio.loader.server.ts:16` returns a real promise
(`routeData({ twilioData: loadTwilioData(workspaceId) })`), and `AdminTwilioPortal.tsx:24-25`
renders it through `<Suspense><Await>` with **no `errorElement`** — in a route tree that has no
`ErrorBoundary` at all (`grep -rn ErrorBoundary app/routes/admin+/` is empty across 20+ modules).
`loadTwilioData.server.ts:89` calls `twilio.usage.records.list()` with **no `limit`**, so the Twilio
helper auto-pages the entire usage history; blowing past `streamTimeout` (4950 ms,
`entry.server.tsx:29`) is exactly the scenario that comment describes.
**Fix:** add `errorElement` to the `Await`, export `RouteErrorBoundary` from `admin+/route.tsx`, and
pass `{ limit: 200 }` to the usage query.

Related and cheap: `queue.route.tsx:37, 240` types an already-awaited plain object as
`Promise<QueueResponse>` and wraps it in `Suspense`/`Await`, so the spinner is unreachable and a
`as QueueResponse` cast is forced at :247. Harmless, but actively misleading given the history —
rename to `queue` and delete the boundary.

### P2b-3. Contact writes skip the phone normalization every other write path applies
`workspaces+/$id/contacts/$contactId.action.server.ts:52-61` writes `formData.get("phone")` raw,
while CSV import normalizes (`csv-contacts.ts:133`). Reads compensate with an 8-format candidate
fan-out plus an `ilike` fallback (`database/contact.server.ts:30-57`), so formats outside that list
(`416 555 1234`, `+1 416-555-1234`) silently fail to match.
**Fix:** normalize on write, same as the CSV path.

### P2b-4. `JSON.parse` on request data outside the try block
`queue.action.server.ts:66` and `:133` parse `data.filters` / `data.contacts` outside their
surrounding try, so malformed input is a 500 rather than a 400; `settings.action.server.ts:82` is
wrapped at the call site but still degrades to a generic error.
`campaign-export-status.loader.server.ts:48` parses a status blob unguarded and its outer catch
returns `error.message` verbatim to the client. `surveys.action.server.ts:29`,
`test-webhook.action.server.ts:24` and `survey-responses.action.server.ts:30` all do this correctly
— so this is drift, not a missing convention.

### P2b-5. Unthrottled search-as-you-type with no ordering guard
`app/hooks/contact/useContactSearch.ts:128-136` fires two network calls per keystroke with no
debounce, no `AbortController`, and no request-sequence check. Out-of-order responses set stale
state, and `searchContact` calls `setManualContact(null)` (:74), so a late response wipes the user's
selection. The file's own `@effect-why-not-loader` note already prescribes the fix (debounced
`useFetcher().load()`).

### P2b-6. Unbounded loader queries on growth tables
`contacts/$contactId.loader.server.ts:67` (`outreach_attempt.findMany` by contact, no limit, no
order — one row per dial attempt) and `:100` (every audience in the workspace); plus the Twilio
usage query in P2b-2. Separately, the campaign-options query is byte-duplicated across
`calls.loader.server.ts:65`, `contacts.loader.server.ts:95` and `analytics.loader.server.ts:67`,
where the third has already drifted to the array `orderBy` form, and none has a `LIMIT`.
**Fix:** extract `listWorkspaceCampaignOptions(tdb)` with a limit; paginate attempt history.

The core list surfaces are properly bounded (`contacts`, `chats`, `queue`, `calls` all clamp page
size), so this is confined to ancillary dropdown and detail queries.

### P2b-7. `toUserMessage` bypassed in 26+ modules
`two-factor.action.server.ts:56`, `accept-invite.action.server.ts:80`,
`api+/chat_sms.action.server.ts:256` (leaks Twilio error text straight into the chat composer),
`campaign-export.action.server.ts:91`, `audience-upload.action.server.ts:265`, and
`queue.route.tsx:44` (renders `useRouteError().message` raw). The helper exists precisely to strip
internals.

### P2b-8. `defineAction` has no `formData` validation path
`app/lib/handler.server.ts:77-80` reads `request.clone().json()` only, so `input:` is unusable for
form posts. 9 of 145 action modules use zod; the other 136 hand-coerce (`Number(formData.get(…))`,
`as string` on ten fields in `$contactId.action.server.ts:51-61` — a `File` upload lands in the DB
as `[object File]`, and `Number(...)` of a File is `NaN`). **Fix:** add an `inputForm?: z.ZodType`
branch parsing `Object.fromEntries(await request.formData())` with the same automatic 400. This one
change removes the root cause of P2b-4 and most hand-coercion.

### P2b-9. Dead Supabase-shaped modules that still typecheck
Beyond `campaign-dispatch.ts` (P1-5, where 13 of 14 exports have zero callers and all take a
`CampaignDispatchDb` declaring `db.rpc()` / `db.from().select()`), `shared/queue-sync.ts` is 106
lines whose only reference is its own test, and `shared/ivr-status-logic.ts` exports two test-only
functions plus an unreferenced `sleepMs`. Same latent-trap class as P1-0.
**Fix:** delete, or wire to the Drizzle client if the behaviour is still wanted.

Smaller cleanups in the same pass: 21 files carry a dead `import { data as routeData }` (codemod
residue — enabling `@typescript-eslint/no-unused-vars` for imports catches these); 14 of 20 exports
in `app/lib/type-safety-utils.ts` have no consumers; `replace(/\D/g, "")` is re-implemented in 10
places despite `app/lib/phone.ts` exporting `stripPhoneNumber`; `formatAnswer` is duplicated between
`survey-db.server.ts:864` and `responses.route.tsx:84`.

---

## Phase 3 — Security hardening (real, not yet exploited)

- **Open redirect on email verification** — `app/routes/auth/confirm.loader.server.ts:11, 24`
  redirects to a fully unvalidated `?next`, applying freshly-set session cookies.
  `api+/auth/callback.loader.server.ts:7-13` has a `getSafeRedirectPath` helper this route doesn't
  use. **Fix:** extract that helper to a shared module (it is currently duplicated in two files) and
  use it here.
- **Protocol-relative redirect after sign-in / 2FA** — `signin.action.server.ts:39` and
  `two-factor.action.server.ts:46` check `startsWith("/")` but not `//`.
  `account.security.loader.server.ts:112` gets this right. **Fix:** same shared helper.
- **Unrate-limited password reset with host-derived callback** —
  `app/routes/remember.action.server.ts:14-17` has no rate limit (its sibling
  `api+/auth/forgot-password.action.server.ts:8` uses `rateLimitedPostAuth`) and builds `redirectTo`
  from `url.origin`. **Fix:** apply `rateLimitedPostAuth`, pin `redirectTo` to `env.BASE_URL()`.
- **`X-Forwarded-Host` feeds Better Auth trusted origins** —
  `app/lib/auth-trusted-origins.server.ts:84-108` trusts the header unconditionally, so a
  cross-site request can make its own `Origin` trusted. Chains with the item above into reset-token
  leakage. **Fix:** only derive from forwarded headers behind a `TRUST_PROXY` flag, validated
  against an allowlist.
- **Twilio handset token minted with a caller-supplied identity** —
  `app/routes/api+/handset-token.loader.server.ts:13, 28-31` sets `incomingAllow: true` on an
  arbitrary `client_identity`, so any member (including the lowest `caller` role) can receive
  another member's inbound calls. `api+/token.loader.server.ts:42` correctly hardcodes
  `auth.user.id`. **Fix:** derive identity from the session.
- **`BETTER_AUTH_SECRET` has no production guard** — `.env.example:9` ships
  `dev-better-auth-secret-change-me` and `required-env-keys.mjs:53` checks presence only.
  `MEDIA_STREAM_SECRET` (`env.server.ts:216-227`) already models the right behaviour. **Fix:**
  reject the dev literal in production inside `validateRequiredEnv` (boot-time, not use-time — and
  move the `MEDIA_STREAM_SECRET` check there too, since its `.env.example` comment already
  overclaims that prod "refuses to start").
- **Non-constant-time cron secret comparison** —
  `app/lib/worker/cron-job-enqueue-route.server.ts:17-21` uses `===`; it is the only secret
  comparison in the repo not using the existing `secureCompare`.
- **Dev TLS private key committed to a public repo** — `scripts/dev/certs/server.key`. Dev-only
  self-signed material, but delete it, generate on demand, and gitignore the directory.
- **Unsanitised path segment into an S3 key** —
  `workspaces+/$id/audios/$fileName.edit.{loader,action}.server.ts` build
  `${workspaceId}/${fileName}` from a decoded param that can contain `/` and `..`. Safe today only
  because S3 treats keys literally. **Fix:** reject separators before building the key.

---

## Phase 4 — Widen the guards (the actual root cause)

Do not treat this as cleanup. Every Phase 0–3 finding got through a green CI run.

0. **`npm run typecheck` checks `app/` and `shared/` only — nothing else.** `tsconfig.json:2-8`
   includes `app/env.ts`, `app/**/*.{ts,tsx}`, `shared/**/*.ts` and the generated route types.
   `npx tsc --listFiles` confirms the real number: **1134 files from `app/`, 23 from `shared/`, and
   zero from `worker/`, `server/`, `services/`, or `scripts/`.** The job worker that runs all
   billing jobs, the Bun server that performs Twilio signature validation, and the media-stream
   service are **entirely untyped in CI**. `tsconfig.server.json` exists and covers `server/**`, but
   is referenced by no npm script and no workflow — it is dead config.
   **Fix:** add `worker/**`, `server/**`, `services/**` to the typecheck (a project-references setup
   or a second `tsc -p` invocation in `typecheck`), and either wire `tsconfig.server.json` in or
   delete it. Expect this to surface real errors on first run — budget for that rather than
   ratcheting it in behind a baseline.

   Note this also corrects a previously recorded belief: the `services/` gap was **not** closed on
   2026-07-15. The fix that added `services/` to `check-credit-write-paths.mjs` lives in commit
   `a7c86e90` on the **unmerged** `feat/live-coaching` branch (open PR #1053) and has never reached
   `dev`. See "Work already done elsewhere" below.

1. **`check-route-authz.mjs:23` scans one directory** — `app/routes/workspaces+/` only. The whole
   `api+/workspaces+/$workspaceId/**` data plane and the legacy top-level `api+/*` surface (where
   all three P0-2 IDORs live) are unscanned, as are loaders. `dataPlaneMiddleware` proves membership
   but is role-blind, and e.g. `billing/checkout-session.action.server.ts:36` and
   `exports.action.server.ts:58` have no `minRole` — a `caller` can start Stripe checkouts and
   export full campaign data. **Fix:** scan a list of roots including `app/routes/api+/`, cover
   loaders, and treat a missing `minRole` on a data-plane write as an offender.
2. **`check-credit-write-paths.mjs:33-53` misses the repo's own DB idiom** — it catches
   `adminDb.update(...)` and raw `sql`, but **not** `tdb.workspace.update({ set: { credits } })`
   (the TenantDb API used everywhere else), not a second RPC via `db.execute`, and not
   `ON CONFLICT DO UPDATE SET credits`. `SCAN_DIRS` also omits `services/`, `server/`, `shared/`,
   `scripts/`, and still lists `client/functions`, which no longer exists.
3. **`check-twilio-webhook-coverage.mjs:12-21` accepts non-authenticating patterns** —
   `VALIDATION_PATTERNS` includes `safeOutboundUrl` (an *egress* SSRF guard, proving nothing about
   request authenticity) plus `requireWorkspaceAccess`/`verifyAuth`. All 28 inventoried routes do
   genuinely validate today, so this is a latent false-pass, not a live hole. The inventory is also
   an opt-in allowlist with no drift detection. **Fix:** drop those patterns; cross-check
   `TWILIO_WEBHOOK_SUFFIXES` against `server/twilio-webhook-paths.ts`.
4. **`check-db-rpcs.mjs` verifies names, not signatures or bodies**
   (`scripts/lib/app-db-objects.mjs:66-95` matches `create function <name>(`). It could not have
   caught P1-2, P1-4, or the earlier `dequeue_contact(integer)` incident — i.e. every RPC failure
   that has actually shipped. **Fix:** add a CI step that calls each app-invoked RPC with
   representative arguments against the compose DB.
5. **`workspace_audio` is missing from `WORKSPACE_SCOPED_TABLES`** (`app/db/schema.ts:534` has
   `workspace_id NOT NULL`). So `workspace-audio-metadata.server.ts` imports the raw `db` and
   hand-writes the scope filter at 4 call sites — the pattern ADR-0004 exists to eliminate. The
   test is blind by construction: `test/tenant-db.test.ts:195` asserts `toHaveLength(26)` against
   `SCOPED_TABLE_NAMES`, *a second hand-maintained list in the same file*. **Fix:** register the
   table; derive the assertion from `schema.ts` with an explicit opt-out set.
6. **`verify-route-tree.mjs:19-22` swallows a failed `npx react-router routes` into `""`** — in
   `--update-baseline` mode that writes an empty baseline and exits 0. **Fix:** exit 1 on empty.
7. **`db:ledger:check` is never run with `--require-db` anywhere.** The script and
   `docs/migration-ledger-drift.md` are both correct; no deploy pipeline invokes the gating form,
   so the gate the doc prescribes never actually runs.
8. **`drizzle/*.sql` sits outside the unwired-file guard** — `drizzle/0009_rate_limit_bucket.sql`
   is orphaned (both bootstrap lists stop at `0008`); it is a harmless duplicate today because
   `client/migrations/20260714120000_rate_limit_bucket.sql` creates the table, but the same hole
   would swallow a genuinely needed `0010`.
9. Minor: `check-app-file-size.mjs:15` exempts `lib/database.types.ts`, deleted in the Supabase
   migration, and `EXEMPT` has no missing-file check (unlike `BASELINE_ALLOWLIST`); two pins carry
   100–233 lines of stale slack. `check-twilio-webhook-coverage.mjs:31-32` excludes two files that
   are now `retiredEndpoint` stubs. Add `ci:codegen:verify` to `ci:local` so it mirrors CI.

---

## Phase 5 — Documentation and environment (fast, low risk)

**`AGENTS.md:15` states the opposite of the actual convention:** "Each route is a **single module**
(`folder/route.tsx`) … no manual `route.server.tsx`." The repo has **255**
`*.action.server.ts` / `*.loader.server.ts` modules, and `app/routes.ts:10-11` explicitly
`ignoredRouteFiles`-lists both patterns. This actively misdirects any agent reading it — fix first.

Also in `AGENTS.md`: a whole block describing pg_cron `net.http_post` routing and `verify_jwt` in
`client/config.toml`, a file that does not exist and a mechanism retired by
`client/migrations/20260714130000_retire_pg_cron_http_job_routes.sql`; four dead migration links
(lines 55, 60, 72); "28 tables" where the registry says 26; 4 structural guards listed where CI runs 12.

**`docs/media-stream-ops.md` cannot be followed:** it gives the worker entry point as
`scripts/worker.ts` (it is `worker/index.ts`) and says all three services share one image with only
the start command differing — but **neither Dockerfile copies `services/`**. `Dockerfile:41-51`
copies `build public server app shared client/migrations node_modules package.json tsconfig.json`;
`Dockerfile.worker:9-13` copies `app shared worker tsconfig.json`. The media-stream service has no
deployable image. **Fix:** add `COPY --from=builder --chown=bun:bun /app/services ./services`, and
correct the runbook.

**Undocumented env vars** (all referenced in code, none in `.env.example`):
`RUN_CLIENT_MIGRATIONS_ON_BOOT` (highest impact — the prod `Dockerfile` ships `client/migrations`
solely for it), `TWILIO_A2P_MESSAGING_POLICY_SID` (its Trust Hub sibling *is* documented),
`DB_STATEMENT_TIMEOUT_MS`, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`, `DISABLE_AUTH_RATE_LIMIT`
(its `DISABLE_2FA_ENFORCEMENT` twin is documented), `PROCESS_FATAL_ON_REJECTION`,
`MEDIA_STREAM_PORT`, `S3_FORCE_PATH_STYLE`, `S3_URL_STYLE`. Nothing in `.env.example` is unused.

**Other doc drift:** `docs/remediation/decisions.md:11, 38-39` claims Redis backs rate limiting —
there is no Redis anywhere in the repo; it is Postgres (`platform-rate-limit-db.server.ts`).
ADR-0030 and `CONTEXT.md:129` specify `MEDIA_STREAM_URL` and port 8081; the code uses
`MEDIA_STREAM_HOST` + `MEDIA_STREAM_PORT` defaulting to 3001, and `MEDIA_STREAM_URL` appears in zero
lines of code. `docs/README.md` indexes 41 of 137 docs and links a `docs/CONTEXT.md` that doesn't
exist. `README.md:3` says React Router 7; `package.json` pins 8. `docker-compose.dev.yml:12` pins
`postgres:17-alpine` against 18.4 in Railway. The Supabase-era plan docs (117 stale source paths
concentrated in four files) should move to `docs/archive/`.

---

## Work already done elsewhere — branch check

Checked every local and remote branch plus both worktrees against each finding's signature.
**No branch fixes any Phase 0, Phase 1, or Phase 2 finding.** Every one of the 14 refs still carries
`(adminDb as any).channel(`, `dequeuedById: callUpdate.conference_id`, the `'failed'` enum literal,
the unguarded survey loader, all three `api+` IDORs, and the missing `payment_status` check.

Branches with commits not in `dev`:

| Branch | Unmerged | Touches a finding? |
|---|---:|---|
| `origin/feat/live-coaching` (PR #1053) | 7 | **Yes — partial.** `a7c86e90` adds `services/` to `SCAN_DIRS` in `check-credit-write-paths.mjs` (part of item 4-2). Does **not** fix P2-1 — `shared/billing-reconciliation.ts` still has `variance: voiceTwilioMinutes - ledgerSummary.voice.events`. |
| `origin/claude/contact-management` | 5 | No. `d60025fd` touches `poll-jobs.server.ts` but does not add the `attempt_count < max_attempts` claim guard (P1-7). |
| `origin/claude/recipient-calling-windows` | 4 | No |
| `origin/claude/phone-parsing-1057` | 4 | No |
| `origin/claude/e2e-worker-harness` | 4 | No |
| `origin/claude/caas-quality-improvements-51e1e4` | 3 | No |
| `origin/fix/pr-env-client-migration-bootstrap` | 1 | No |
| `origin/fix/1099-manual-dial-unassigned-queue` | 1 | No |
| `origin/fix/1096-workspace-event-emission-best-effort` | 1 | No |
| `api-coverage`, `fix/work-surface-remediation`, `fix/sai-onboarding-2026-07-28`, `claude/distracted-wozniak-a09e30` | 0 | Fully merged into `dev` |

Three consequences, all folded into the sequencing below:

- **Salvage the `services/` scan fix from `feat/live-coaching` rather than rewriting it**
  (`a7c86e90`) — a one-line change plus a comment explaining exactly how unbilled media-stream
  debits shipped.
- **PR #1120 ships every Phase 0 and Phase 1 finding to customers.** The "nobody is affected"
  framing at the top of this document holds only until it merges.
- **A fix existing is not the same as a fix having landed.** The `services/` guard gap was recorded
  as closed on 2026-07-15; the commit is real and correctly dated, but it sits on a branch that has
  been unmerged for three weeks. Before trusting any "we already fixed that", run
  `git merge-base --is-ancestor <sha> origin/dev`. This repo carries long-lived branches with real
  fixes on them, and PR #1053 has been open since 2026-07-16.

**Re-run this branch check immediately before #1120 merges** — `feat/live-coaching` and
`claude/contact-management` are both live and touch adjacent files.

---

## Suggested sequencing

The split below is the whole decision: what must land before PR #1120 merges, and what can follow
the ship on a normal cadence.

### Before #1120 merges (ship blockers)

| Step | Contents | Why here, why together |
|---|---|---|
| 0 | **Phase 4 item 0** — widen `typecheck` to `worker/`, `server/`, `services/` | Do this **first**, not last. It is the only step that can still *find* new blockers, and it runs in minutes. Three untyped runtimes ship in #1120; you want the error list before you decide the PR is safe, not after. Expect real failures — budget for fixing them rather than baselining them. |
| 1 | P0-1, P0-2 | One PR, one concern: tenant isolation. P0-1 is unauthenticated cross-tenant PII, so it is the single highest-urgency item in this document. Add an RBAC E2E case per route. |
| 2 | P0-3 … P0-7 | Billing correctness — double charges, permanent suspensions, first-run mass release, credits for unpaid sessions. Land with tests that exercise real idempotency keys rather than stubbing `findFirst`. |
| 3 | P1-0 … P1-7 | Telephony. P1-0 and P1-1 are one change (P1-0 masks P1-1). Needs the compose DB — these are exactly the bugs mocked tests cannot see. |

Steps 1–3 are independent of each other and can run in parallel across three people. Step 0 gates
all of them only in the sense that its output may add work; don't serialise on it.

**Three Phase 3 items are worth pulling forward into this group** — they are small, and they are the
ones whose blast radius is a real user rather than an internal metric: the handset-token identity
(any member, including the lowest `caller` role, can mint a token that receives another member's
inbound calls), the unvalidated `?next` on the email-verification callback (redirects off-site
*with* freshly-set session cookies), and the unrate-limited password reset. Each is a few lines. The
rest of Phase 3 can wait.

### After the ship

| Step | Contents | Why together |
|---|---|---|
| 4 | Rest of Phase 4 | Guard widening. Start by cherry-picking `a7c86e90` from `feat/live-coaching` for the `services/` scan rather than rewriting it. Do this **before** declaring the rest done — otherwise you re-verify by hand. |
| 5 | P2-1 … P2-5 | Alerting. Cheap once billing is correct; do not do it before, or you will tune thresholds around real bugs. |
| 6 | P2b-1 … P2b-9 | UI and error handling. P2b-8 (`inputForm`) first — it removes the root cause of P2b-4 and most hand-coercion. |
| 7 | Rest of Phase 3 | Security hardening, minus the three items pulled forward above. Independent of everything else; can run in parallel throughout. |
| 8 | Phase 5 | Docs and env. `AGENTS.md:15` should jump the whole queue — it is a one-line fix that currently misdirects every agent that reads it. |

Two cross-cutting notes. First, several fixes here (P1-2, P1-4, P1-6) are SQL, and
`app/db/schema.ts` disagrees with the real column types in at least two places
(`inbound_queue_entry.status` typed `text()` against a real enum; `transaction_history.created_at`
and `workspace_number.created_at` typed `text()` against `timestamptz`, so postgres.js returns
`Date` objects typed as `string`). Fix the type declarations in the same pass, or the type checker
keeps hiding this class. Second, `NUMBER_RENTAL_MONTHLY_CREDITS` is defined twice
(`shared/pricing.ts:65` and `number-rental-billing.server.ts:26`) and `bucketFromIdempotencyKey`'s
prefix table exists in three hand-synced copies — all currently agreeing, and all next in line to
drift.
