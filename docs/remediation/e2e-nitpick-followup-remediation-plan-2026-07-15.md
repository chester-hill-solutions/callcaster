# CallCaster E2E Nitpick — Follow-up Remediation Plan (post-#1052)

**Date:** 2026-07-15  
**Prepared from:** Browser re-verification of Railway review env against current `origin/dev` (`4bc2d032` — Fix e2e nitpick audit findings, and get dev green #1052), plus corrections in [`e2e-nitpick-status-2026-07-15.md`](./e2e-nitpick-status-2026-07-15.md)  
**Environment:** `https://callcaster-review-visual-asset-review.up.railway.app/`  
**Test workspace:** `25dcc770-e805-4162-8940-ab7f95fd57c1` (owner, incomplete onboarding, 0 credits) — UI label `Audit Workspace Fixed 1784137242790`  
**Test campaigns:** `Audit Live Campaign` (id 1), `Audit SMS Campaign` (id 2)  
**Companion artifacts:** [`e2e-nitpick-status-2026-07-15.md`](./e2e-nitpick-status-2026-07-15.md), [`docs/migration-ledger-drift.md`](../migration-ledger-drift.md), PR [#1052](https://github.com/chester-hill-solutions/callcaster/pull/1052)  
**Status:** Complete on `fix/e2e-nitpick-followup` (2026-07-15) — Wave 0 review ledger gated; Waves 1–2 app fixes landed; KR-1–4 met on review

---

## 1. Commander's intent

Close the residual risk left after #1052 so review/staging and production cannot silently fail on infra drift or misconfigured send windows, without re-litigating journeys already proven fixed in the browser:

1. **Gate deploy-time schema/ledger sync** so credit purchases and additive columns cannot diverge from app HEAD.
2. **Make SMS send-window policy editable and honest** — users must set the field the server enforces (`campaign.sms_send_window`), not only the voice `schedule` relabeled as "Send Window".
3. **Bound Postgres pool wait** so saturated query/LISTEN pools fail closed instead of hanging SSR and API forever.
4. **Diagnose SSE pool coupling** before treating console noise as cosmetic — confirm whether each EventSource holds a `directPool` LISTEN slot.
5. **Defer polish** (queue sort lag, heading hierarchy, invite plural a11y, schedule checkbox labels) to a second wave after infra and SMS policy.

This plan does **not** replace the [Critical Review Orchestration Plan](./critical-review-orchestration-plan-2026-07-12.md) or the [live coaching orchestrator plan](./live-coaching-orchestrator-plan-2026-07-15.md). It operationalizes **what is still open** after the original e2e nitpick Wave 1 landed on `dev`.

---

## 2. Key results (definition of done)

| # | Result | Verification |
|---|--------|--------------|
| KR-1 | **Review (and other) DBs pass ledger gate** | `DATABASE_URL=<env> node scripts/db/check-migration-ledger.mjs --require-db` exits 0 after migrate, before app redeploy |
| KR-2 | **SMS send window is user-editable and enforced** | SMS settings persist `sms_send_window`; `api+/sms.action.server.ts` still gates via `isWithinSendWindow`; browser can set Mon–Fri hours and see them round-trip |
| KR-3 | **Query pool cannot hang forever** | `app/server/db.ts` sets explicit `connect_timeout` / `idle_timeout` / `max_lifetime` (and document chosen values); a saturated pool returns errors within the connect timeout rather than queueing indefinitely |
| KR-4 | **SSE vs pool documented or fixed** | Written finding: either (a) LISTEN uses dedicated `directPool` with documented max and no query-pool starvation, or (b) code change so SSE does not monopolize connections; include a short repro note |

Secondary (wave 2): queue sort reflects click immediately; page-level `h1` on `settings/numbers`; invite menu plural without spoken gap; schedule day checkboxes named.

---

## 3. Audit methodology and limitations

### What was re-exercised (browser, 2026-07-15)

**Pass A — original KR surfaces**

- Owner session on review env; workspace home → onboarding, campaigns, contacts, voicemails, settings/numbers, billing, join-call, global 404.
- Route `.data` JSON for contacts / scripts / audiences / audios: **no** `authToken`, `twilio_data`, `stripe_id`, `key`, Twilio SID/SK patterns.
- Campaign hub `/campaigns/1`: empty-results hero ("Your Campaign Results Will Show Here") — **no** perpetual Loading / React #419.
- Join call `/campaigns/1/call`: renders (inactive / 0 credits / no script overlays) — **no** disposition crash.
- Contacts `/contacts/new`: `ContactScreen` form; Edit enables fields.
- Voicemail setup: CTA `href` = `/workspaces/:id/settings/numbers` (absolute workspace path); numbers page loads.
- Global 404: "Page not found" with Go home / Try again — **no** throw.
- Onboarding step 1 empty Save & continue: required fields `aria-invalid` + inline errors; stays on step.
- SMS campaign settings: UI shows **Send Window** / **Set Send Window** but code still writes `campaign.schedule` (see UX-SMS-01).

**Pass B — continued workspace walk (same session)**

| Surface | Result |
|---------|--------|
| SMS settings → expand Send Window | Editor opens; day **Active** checkboxes have **no accessible name**; "Apply 9-5" buttons vs displayed `05:00–13:00` (local TZ) — confusing |
| Live campaign settings | Correctly labeled **Calling Hours** (not Send Window); script select `aria-invalid` when empty (expected) |
| Queue (SMS, empty) | Sort/filter controls named; empty table OK (sort-lag not re-proven without rows) |
| Scripts list + `/scripts/1` | Editor loads; dirty → single **Save Changes** + Reset only (status-doc dual-Save **not reproduced**) |
| Settings (members/invite/API/webhook) | Renders; invite form present |
| Audiences / Surveys / Audio / Archives / Exports | Empty states OK, HTTP 200 |
| Analytics | Date filters + zero metrics OK |
| Handset | Empty-state with link to workspace settings |
| Chats | Empty + New Chat composer; From disabled without numbers |
| Calls | Filters + empty pagination OK |
| Account menu (dark) | Opens; account control contrast ~16:1; spoken name `0 Pending Invitation s` (newline before plural `s`) |
| SSE `/api/workspaces/:id/events` | Single EventSource reached `open` within 3s |

### What was not exercised

- Live Twilio device / coaching panels / disposition save loop after join
- Stripe checkout completion on review (0 credits; ledger drift still a risk until Wave 0)
- Admin surfaces, survey **editor** (list only), full keyboard-only traversal
- Multi-tab EventSource load test (pool exhaustion) — single connection OK

### Live infra note

Wave 0 (migration ledger) still requires operator access per environment. App code cannot detect ledger drift alone — see [`docs/migration-ledger-drift.md`](../migration-ledger-drift.md).

---

## 4. Already resolved (do not re-fix)

Landed on `dev` via #1052 (`4bc2d032`). Browser re-check **passed** for each KR below.

| ID | Item | Evidence |
|----|------|----------|
| SEC-01 | Workspace secrets stripped from route `.data` | `getWorkspaceForClient()` + `check:workspace-projection` + `test/workspace-loader-secrets.test.ts`; live `.data` fetch clean |
| JOURNEY-01 | Campaign hub hang / SSR stream | `entry.server.tsx` deferred timeout; hub shows empty state |
| JOURNEY-02 | Null `disposition_options` crash | `normalizeDispositionOptions` in call-screen data path; join route renders |
| JOURNEY-03 | Contacts nested outlet | `/contacts/new` renders form |
| JOURNEY-04 | Onboarding empty advance | Required-field invalid + error copy |
| JOURNEY-05 | Voicemail CTA + 404 shell | Absolute numbers link; 404 page stable |
| Wave 2a/2b | Campaign UX + a11y batch | See #1052 commits; status doc for diagnosis corrections |
| UX-SCRIPT-01 | Dual Save on dirty script | **Not reproduced** on review: only SaveBar **Save Changes** + Reset when dirty |
| A11Y Navbar account | Dark-mode account control contrast | ~16:1 measured on review (status-doc fix held) |
| CI green | typecheck / effects / fixtures | Status doc § "Verified green" |

**Diagnosis corrections** (from status doc — agents must not implement the old plan literally):

- `authToken` is not a workspace column; projection must also omit `key` and `twilio_data`.
- Join CTA gating on `CampaignHeader` was a false lead.
- Dark-mode sidebar active item was **not** the contrast failure; Navbar account control was.
- Marketing `Navbar` under `/workspaces/*` is deliberate, not bleed-through.

---

## 5. Findings inventory (remaining)

### P0 — Infra / money integrity

#### INFRA-01: Migration ledger drift on deployed DBs (FIXED on review)

**Ops (2026-07-15):** Applied 11 missing `client/migrations` to review Postgres; created `auth_migrations.schema_migrations` (lowercase — postgres.js folds unquoted `AUTH_migrations`); seeded repo versions.  
`DATABASE_URL=$DATABASE_PUBLIC_URL node scripts/db/check-migration-ledger.mjs --require-db` → **OK**.  
`apply_ledger_entry_and_sync_credits` now casts `p_type::public.transaction_type`.  
**Note:** Always use `DATABASE_PUBLIC_URL` when running the ledger check from a laptop (`DATABASE_URL` is `*.railway.internal`).  
**Still needed:** same gate on other envs (prod); optional deploy-pipeline wiring.

---

#### INFRA-02: Query pool has no wait timeouts (FIXED)

**Fix:** [`app/server/db.ts`](../../app/server/db.ts) sets `connect_timeout: 10`, `idle_timeout: 20`, `max_lifetime: 60 * 30` on both pools.

---

### P1 — Product correctness

#### UX-SMS-01: `sms_send_window` has no UI; "Send Window" edits `schedule` (FIXED)

**Fix:** Message campaigns persist `sms_send_window` via `CampaignBasicInfo.Dates` + settings action `normalizeSchedule(sms_send_window)`; voice keeps `schedule`. UI tests cover both Apply paths.

---

#### UX-07: SSE console errors / pool coupling (CLOSED — capacity OK)

**Severity:** Was Medium; closed after multi-connection repro  
**Browser (2026-07-15 follow-up):** Opened **6 concurrent** EventSources to `/api/workspaces/:id/events` on review; all reached `readyState === OPEN` (`opened: 6`).  
**Verdict:** No code change required this wave. Keep per-connection LISTEN. INFRA-02 timeouts still bound hangs. KR-4 met.

---

### P2 — UX polish

#### UX-SCRIPT-01: Two Save controls when script dirty (CLOSED — not reproduced)

**Browser:** Dirty script editor showed only **Save Changes** + **Reset**. Treat as fixed by Wave 2a unless a second Save control reappears on another script route.

#### UX-QUEUE-01: Queue sort lags one click (FIXED)

**Fix:** Compute next sort order before `toggleSorting` / `clearSorting` in `QueueTable.tsx`; test expects `phone.asc` then `phone.desc`.

#### A11Y-HEAD-01: Heading hierarchy gaps (FIXED on numbers)

**Fix:** Page `h1` "Phone numbers" on settings numbers route; NumbersTable title demoted to `h2`.

#### A11Y-INVITE-01: Account menu plural spoken as "Invitation s" (FIXED)

**Fix:** Template string in `Navbar.tsx` + `Navbar.MobileMenu.tsx`.

#### A11Y-SCHED-01: Schedule/send-window day checkboxes unlabeled (FIXED)

**Fix:** `aria-label={`${day} active`}` on Checkbox in `CampaignBasicInfo.Schedule.tsx`.

#### UX-TZ-01: "Apply 9-5" vs displayed local window (FIXED)

**Fix:** Buttons labeled "Apply 09:00–17:00 local to …".

---

### P3 — Deferred / not exercised

| ID | Item | Notes |
|----|------|-------|
| LOW-LIVE-01 | Live call after join | Needs credits + active campaign window |
| LOW-SURVEY-01 | Survey editor / public flow | Not re-audited |
| LOW-ADMIN-01 | Admin surfaces | Out of scope |
| LOW-A11Y-KB | Full keyboard traversal | Wave 3 |

---

## 6. Implementation waves

### Wave 0 — Deploy ledger (ops)

1. For **visual-asset-review** (and prod when ready): migrate → `--require-db` ledger check → redeploy app.
2. Record pass/fail in operator notes (not in public repo).

**Exit:** KR-1 green on review; billing purchase smoke possible once credits path is unblocked.

### Wave 1 — App blockers (ordered)

| Order | Finding | Exit criterion |
|-------|---------|----------------|
| A | INFRA-02 pool timeouts | Client options set; focused unit/smoke; no `.env` edits |
| B | UX-SMS-01 send window binding | Round-trip `sms_send_window`; SMS gate still enforced |
| C | UX-07 SSE diagnosis | Written verdict + code change only if slots starve |

**Exit:** KR-2–KR-4 met; `npm run ci:local` green on the branch.

### Wave 2 — Polish

UX-QUEUE-01, A11Y-HEAD-01, A11Y-INVITE-01, A11Y-SCHED-01, UX-TZ-01.

**Exit:** Secondary KRs; no new `check:effects` grandparents without documentation.

### Wave 3 — Deferred nitpick

LOW-* surfaces when a dedicated browser pass is scheduled.

---

## 7. File touchpoint matrix

| Finding | Files | Tests |
|---------|-------|-------|
| INFRA-01 | `scripts/db/check-migration-ledger.mjs`, deploy pipeline | Manual `--require-db` per env |
| INFRA-02 | `app/server/db.ts` | Optional assert on client config; load test note |
| UX-SMS-01 | `CampaignBasicInfo.Dates.tsx`, campaign settings action/loader, `campaign-send-window.ts` | UI + API send-window tests |
| UX-07 | `events.loader.server.ts`, `db.ts` | Multi-client SSE harness or documented manual repro |
| UX-QUEUE-01 | `QueueTable.tsx` | `components-queue` UI test (update pin) |
| A11Y-HEAD-01 | settings numbers route, nav headings | Snapshot / a11y name test |
| A11Y-INVITE-01 | `Navbar.tsx`, `Navbar.MobileMenu.tsx` | a11y name assertion |
| A11Y-SCHED-01 | `CampaignBasicInfo.Schedule.tsx` | a11y name on day checkboxes |
| UX-TZ-01 | `CampaignBasicInfo.Dates.tsx` | Copy / label test |

**Do not swap:** `getWorkspaceById` remains for server-only Twilio/admin/API credential paths. Route loaders must keep `getWorkspaceForClient` (enforced by `check:workspace-projection`).

---

## 8. Test plan

### Automated

- `npm run ci:local` (includes `check:workspace-projection`, `db:ledger:check` inventory mode)
- Targeted: campaign settings / SMS window tests; `test/workspace-loader-secrets.test.ts` regression
- After INFRA-02: any existing db bootstrap tests still pass

### Manual review-env checklist

1. `.data` on contacts/scripts still free of `twilio_data` / `key` / `stripe_id`
2. Campaign hub + join-call still render
3. SMS settings: set send window → DB `sms_send_window` populated → send outside window rejected
4. Billing: after Wave 0, test-mode purchase completes (or fails with a clear app error, not RPC enum cast)
5. Open 6+ call-screen tabs: SSE errors vs connection exhaustion

### Regression risks

| Change | Risk | Mitigation |
|--------|------|------------|
| Pool timeouts | Short timeouts flake under CI load | Separate CI vs prod values via existing env patterns (no secret `.env` edits in-repo) |
| sms_send_window UI | Voice schedule broken for call campaigns | Branch UI by campaign type |
| SSE fan-out | Missed events | Keep polling fallback |

---

## 9. Repository invariants

- Tenant routes: `createTenantDb` / data-plane middleware; no `@/server/db` in route modules except documented allowlists (SSE `directPool`).
- Credits: `debitAmountFromCredits` + `insertTransactionHistoryIdempotent` + `shared/billing-keys.ts`.
- Do not modify user `.env`.
- Do not weaken `check:workspace-projection` or secret loader tests.
- Imports at module top; exhaustive switches.

---

## 10. Suggested PR structure

1. **PR-A (ops/docs):** Wave 0 runbook confirmation + any CI deploy step for `--require-db` (no product UI).
2. **PR-B:** INFRA-02 pool timeouts.
3. **PR-C:** UX-SMS-01 `sms_send_window` binding + tests.
4. **PR-D:** UX-07 SSE diagnosis outcome (fix or "documented benign").
5. **PR-E:** Wave 2 polish batch (script Save / queue sort / headings).

Merge order: A → B → C → D → E (C independent of B if needed; prefer B first).

---

## 11. Coverage matrix

| Surface | Status |
|---------|--------|
| Workspace `.data` secrets | Fixed |
| Campaign hub results | Fixed |
| Join call / disposition null | Fixed |
| Contacts new | Fixed |
| Voicemail → numbers CTA | Fixed |
| Global 404 | Fixed |
| Onboarding step 1 validation | Fixed |
| Billing purchase E2E | Ledger fixed on review (purchase smoke deferred) |
| SMS send window policy UI | Fixed |
| DB pool timeouts | Fixed |
| SSE / LISTEN coupling | Fixed (documented capacity OK) |
| Script dual Save | Fixed (not reproduced) |
| Queue / chats / calls / analytics / handset / archives / exports / settings | OK (empty-state / list) |
| Queue sort lag | Fixed |
| Heading hierarchy | Fixed (numbers page h1) |
| Invite plural a11y / schedule checkbox names / 9-5 label | Fixed |
| SSE single connection | OK; multi-tab OK (6 open) |
| Survey editor / live call / admin | Not exercised |

---

## 12. Out of scope

- Re-implementing #1052 journey fixes
- Live coaching / media-stream thermo-nuclear work (separate plan)
- Changing deliberate global `Navbar` on workspace routes
- Broad admin or marketing redesign
- Inventing new audit findings not in the status doc or this browser pass

---

## 13. Open questions (defaults if unanswered)

| Question | Default |
|----------|---------|
| Should `sms_send_window` and voice `schedule` ever share one editor for hybrid campaigns? | **No** — message campaigns only bind `sms_send_window`; voice keeps `schedule`. |
| Pool timeout values? | Start with `connect_timeout: 10`, `idle_timeout: 20`, `max_lifetime: 60 * 30` (seconds, postgres.js conventions); adjust after review metrics. |
| Is dual Save on scripts a product preference? | **Closed** — not reproduced on review; single SaveBar when dirty. |
| SSE: process-wide fan-out vs per-connection LISTEN? | Prefer **keep per-connection LISTEN** if `directPool.max` ≥ expected concurrent agents; else fan-out. |

---

## 14. References

- [`e2e-nitpick-status-2026-07-15.md`](./e2e-nitpick-status-2026-07-15.md) — corrections + landed commits
- [`docs/migration-ledger-drift.md`](../migration-ledger-drift.md)
- PR #1052 — `4bc2d032` on `dev`
- Review env: `https://callcaster-review-visual-asset-review.up.railway.app/`
- Workspace: `25dcc770-e805-4162-8940-ab7f95fd57c1`
