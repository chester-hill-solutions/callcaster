# Handoff: CallCaster architecture review + Phase 3 campaign dispatch

**Date:** 2026-08-11  
**Repo:** `/home/nathaniel-arfin/Documents/callcaster`  
**Branch:** `fix/1206-1135-urgent` @ `0f5919cc`  
**Upstream:** `origin/dev` (`465760c1`) — branch is **1 commit ahead**, worktree **clean**  
**Not on:** `master` (`af73a76a`)

---

## Mission of the prior session

1. Ran **Improve Codebase Architecture** (deepening opportunities) across non-call hot spots.
2. Left **call-screen FSM** alone while another agent worked; later rescanned after it landed.
3. Locked product/policy decisions for build waves.
4. Tracked concurrent **Phase 3 campaign** work (SMS dispatch + `is_active` removal).
5. User asked for a **handoff plan** for the next agent.

---

## Suggested skills (invoke early)

| Skill | When |
|---|---|
| `/implement` | Executing the correction plan or P0 tickets |
| `/tdd` | Worker dispatch / SMS batch extraction (high regression risk) |
| `/diagnose` | If #1135 texts-not-sending still fails in review env |
| `/code-review` | Before PR: review since `origin/dev` or merge-base |
| `/domain-modeling` | If naming Campaign launch / dial lifecycle in CONTEXT.md |
| `/github-issues` | Filing P0 tickets or Phase 3 child issues |
| `/improve-codebase-architecture` | Only after Phase 3 + call lifecycle stabilize; HTML report was deferred (plan-mode blocked write to `/tmp`) |

Do **not** reopen full architecture exploration unless user asks — decisions and ranked candidates are below.

---

## Current git reality

```text
HEAD  0f5919cc  Fix #1206 (hangup stuck on dialing) and #1135 (texts not sending)
base  origin/dev 465760c1  fix: timezone-naive schedule (#1163)
```

**Commit touches (19 files):** call lifecycle hooks/types/tests + campaign execution/SMS send/worker handler + readiness + settings action + effects inventory baselines.

**Call-screen files in commit:**  
`app/hooks/call/useCallScreen.ts`, `useCampaignCallFlow.ts`, `app/lib/twilio/call-session-types.ts`, related UI tests.

**Campaign/SMS files in commit:**  
`app/lib/campaign-execution.server.ts` (new)  
`app/lib/campaign-sms-send.server.ts` (new)  
`app/lib/worker/handlers/campaign.server.ts`  
`app/routes/api+/sms.action.server.ts`  
`app/lib/campaign-readiness.ts` (+ actions)  
`settings.action.server.ts`

---

## Locked policy decisions (user-confirmed)

1. **Credits remain integer.** Aggregate AI usage; round final charge up. Rule-based coaching free. (AI product is dark — roadmap only for media/coaching depth.)
2. **Number purchase:** reserve/debit then compensate on provider failure; rental renewals atomic fail-closed affordability.
3. **Media/AI:** roadmap only for deepening; **STT/LLM models must stay variable** (no hard-coding provider into domain). Do not prioritize Live Transcription/Coaching implementation waves until product un-darkens.
4. **Public `campaign.is_active`:** recommended compatibility = accept deprecated field, ignore on write, derive on read from `status ∈ {running,waiting}` until versioned API drop. **Not yet implemented.**

---

## Architecture review summary (non-call zones)

Full deep scans covered: **billing/Ledger**, **Twilio data/webhooks**, **media-stream/coaching**, **middleware/tenant-db**, **cross-zone seams**. Call-screen was intentionally secondary then rescanned provisionally.

### Build waves (non-call) — do after / in parallel carefully with Phase 3

**P0 correctness (independent tickets):**  
Fractional AI debit containment · atomic rental affordability · number purchase reserve/compensate · Stripe grant validation unify · billing key classification closure · Twilio nested stale-snapshot merges · webhook AccountSid uniqueness fail-closed · Workspace Number identity · callback target drift guard · (media P0s deferred per dark product) · RPC actor-context · workspace projection closure.

**Waves:** A Ledger authority → B Twilio ownership → C media (deferred) → D cross-zone jobs → E client after call-state stable.

**Cross-zone invariants to preserve:**  
Ledger idempotency ≠ job idempotency · webhook fast-ack + worker side effects · money commits without depending on SSE · Twilio REST keys vs webhook auth tokens · `createTenantDb` stays the tenant seam.

**Docs drift (do not trust blindly):**  
`docs/billing-source-of-truth.md`, ADRs 0027–0030 / CONTEXT Deepgram vs ElevenLabs runtime, `docs/media-stream-ops.md`, webhook Edge docs, number-rental auto-release docs.

HTML architecture report was **not** written (plan-mode blocked non-plan file writes). Re-run `/improve-codebase-architecture` presentation step if user wants the visual report.

---

## Call lifecycle (#1206) — landed but incomplete

**Intent:** canonical `callLifecycleReducer` in `call-session-types.ts`; terminal phase/outcome separation; hangup wrapper sends `HANG_UP` before SDK teardown.

**Still true after land (from provisional review — re-verify if next agent touches call UI):**

- Generation/`agentSid`/`customerSid` fields largely unused; generation fence not real.
- Predictive `failed`/`no-answer` may still surface as completed via bridge + null outcome.
- Initial FSM `dialing` may not seed lifecycle → polling gate issues.
- `ending` disables polling needed to reach `ended`.
- Shadow FSM: still layered on legacy `useCallState` + `useCallHandling`; not ADR-0024 replacement.
- `NEXT` event declared, not handled; dead imports possible.

**Do not** combine broad call FSM collapse with Phase 3 SMS work.

---

## Phase 3 campaign SMS — status board

| Goal | Status |
|---|---|
| Shared SMS **batch** module | **Partial** — only `sendSingleCampaignSms` extracted |
| Replace URL `campaign_dispatch` with direct invoke | **Partial / unsafe** |
| Drop `campaign.is_active` after caller migration | **Not started** |

### Critical bugs in landed worker path

1. **`user_id: job.user_id ?? "system"`** (`campaign.server.ts` ~208) — invalid UUID for `rpcCreateOutreachAttempt`. Twilio create runs in parallel with outreach create → possible **send without dequeue** → **duplicate SMS** on retry.
2. **Successor enqueue** uses live dedupe **without `excludeJobId`** → successor **deduped against self** → **stops after first 10 contacts**.
3. **Live dedupe workspace-scoped** (`{ kind: "live", workspaceId }`) → second Campaign in same Workspace can be marked running with **no job**.
4. Worker **bypasses** route gates: credits, Send Window, quiet hours, opt-out, line-type, duplicates, phone normalize, templates, MMS media, portalConfig / Messaging Service (`portalConfig: {}`).
5. Contact errors **caught** → job returns `ok: true` → **no job retry**.
6. No **type === message** check; no **completion** via `try_complete_campaign_if_drained`; expiry/empty only log + return.
7. `launchCampaign` sets status **before** enqueue; no `userId` on job; still writes **`is_active`**.
8. Dead import: `scheduleNextDispatch` still imported in handler; `app/lib/worker/campaign-dispatch.ts` still exists.
9. Duplicate `CAMPAIGN_DISPATCH_JOB_TYPE` constant in `campaign-execution.server.ts` vs `job-types.server.ts`.

### Authoritative SMS loop today

Still in **`app/routes/api+/sms.action.server.ts`** (batch + gates) calling **`sendSingleCampaignSms`** in `campaign-sms-send.server.ts`.

Worker has a **second incomplete loop** in `campaignDispatchHandler`.

### Correction plan (implementation order)

1. Extract **`dispatchCampaignSmsBatch`** (full route loop + structured outcomes) into e.g. `app/lib/campaign-sms-dispatch.server.ts` (name flexible; keep deep module, not more shallow wrappers).
2. `/api/sms` = auth/capability/HTTP adapter only; worker = durable adapter; both call batch module.
3. `launchCampaign` must set **`enqueueJob({ userId })`** from authenticated actor; **never** `"system"` UUID.
4. **Campaign-scoped** live dedupe + **`excludeJobId: job.id`** on successors; pace via `runAt` / config, not in-handler sleep.
5. Claim/idempotency story for concurrent route+worker (at least campaign-scoped coordinator + existing duplicate message check).
6. Status gates: message type only; `scheduled→running` on claim; skip paused/archived/complete; complete when drained; defer + successor on Send Window / quiet hours.
7. Delete URL dispatcher module + unused imports; single job-type constant.
8. Migrate internal `is_active` readers/writers → **`status`**; expand/contract DB: rewrite `try_complete_campaign_if_drained` + `reset_campaign`, then drop column. Survey `is_active` **untouched**.
9. Public API: deprecated derived `is_active` unless product chooses break.
10. Tests: execution, batch module, worker handler, existing sms route tests, enqueue dedupe, settings launch; then `npm run ci:local`.

**Inventory anchors for `is_active`:** schema campaign column, settings UI/controller/action, join loader, AdminCampaignsPanel, platform-data transition + OpenAPI, create-with-script, seeds/doctor/e2e, RPC `reset_campaign` / completion SQL. Grep carefully — many hits are **survey**.

---

## What next agent should do first

**Default focus (unless user redirects):** make `#1135` / message Campaign dispatch **correct and complete** on this branch or a follow-up branch off current HEAD — **not** architecture HTML report, **not** `is_active` drop until dispatch is safe.

**Immediate checklist:**

1. Confirm branch + clean tree; pull `origin/dev` if needed.
2. Reproduce or unit-test: successor enqueue with `excludeJobId`; missing `userId`; worker missing gates.
3. Implement shared batch module + fix worker/launch (steps 1–7 above).
4. Add focused vitest coverage; run sms + campaign-settings + new worker tests.
5. Only then schedule `is_active` migration PR (or second commit) with public compatibility.

**Avoid:**

- Parallel edits to call lifecycle + SMS dispatch without need.
- Ledger/Twilio architecture waves mixed into this PR.
- Media-stream deepening (dark product).
- Treating worker “direct invoke” as done.

---

## Verification commands

```bash
# focused (adjust paths if renamed)
npx vitest run -c vitest.node.config.ts \
  test/sms.route.test.ts \
  test/sms-action.route.test.ts \
  test/campaign-settings.route.test.ts \
  test/enqueue-job.test.ts

npm run typecheck
npm run ci:local   # pre-PR bar
```

Prior session: typecheck passed on dirty tree once; one campaign-settings test timeout observed; **no** solid e2e coverage of new worker handler.

---

## Key file map

| Path | Role |
|---|---|
| `app/lib/campaign-execution.server.ts` | Launch + enqueue (broken contract) |
| `app/lib/campaign-sms-send.server.ts` | Single-send primitive |
| `app/routes/api+/sms.action.server.ts` | Full gated batch (source of truth behavior) |
| `app/lib/worker/handlers/campaign.server.ts` | Unsafe direct dispatch loop |
| `app/lib/worker/campaign-dispatch.ts` | Obsolete URL tick |
| `app/lib/worker/enqueue-job.server.ts` | Live dedupe / `excludeJobId` |
| `app/lib/worker/job-types.server.ts` | Canonical `CAMPAIGN_DISPATCH_JOB_TYPE` |
| `app/lib/twilio/call-session-types.ts` | Lifecycle reducer (#1206) |
| `CONTEXT.md` | Domain language |
| `docs/adr/0007`, `0018`, `0024`, `0025` | Worker, API boundary, softphone, dial modes |
| `AGENTS.md` | Repo agent conventions |

---

## Open questions for user (if blocked)

1. Confirm public API keeps derived `is_active` during column drop.
2. System actor for worker-only launches vs **require launching userId** always (recommended).
3. Whether two message Campaigns may run concurrently per Workspace (drives dedupe key design).
4. Whether call-lifecycle follow-ups ship in same PR as SMS fix or separate.

---

## Session artifacts not created

- Architecture HTML report under `$TMPDIR` (blocked in plan mode).
- No GitHub issues filed from this session.
- No commits by the architecture agent (user/other agent committed `0f5919cc`).
