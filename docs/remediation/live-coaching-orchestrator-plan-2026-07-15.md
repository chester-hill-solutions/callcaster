# Live Coaching / Transcription — Orchestrator Remediation Plan

**Date:** 2026-07-15  
**Prepared from:** thermo-nuclear code quality review of commits `d0b4ed48` through `0fc77b6c` on `ai-power`  
**Execution mode:** `/orchestrator`  
**Status:** Complete — executed 2026-07-15. See §10 for outcomes, decisions, and corrections to this plan.

---

## 1. Commander's Intent

Make the live transcription and coaching feature structurally safe to ship without changing the intended product behavior:

1. A single capability model controls stream attachment, coaching execution, UI tabs, and SSE subscription.
2. Live and batch transcription billing are explicit, idempotent, and impossible to accidentally skip or double-charge.
3. The media-stream service has an intentional boundary with app data, billing, and workspace-event infrastructure.
4. Coaching logic is decomposed into clear, testable modules instead of mixing rules, LLM calls, persistence, events, and billing in one file.
5. Review scope is made manageable by separating unrelated refactors from the coaching feature.

The goal is not to polish local style. The goal is to delete ambiguity: feature flags should mean one thing, money should flow through one policy, and realtime events should have typed contracts on both sides.

---

## 2. Definition of Done

The orchestrator should not declare this plan complete until all required outcomes are met.

### Required Outcomes

1. **Capability coherence:** `liveTranscription` and `liveCoaching` are interpreted through one shared `LiveMediaCapabilities` model used by TwiML generation, media-stream startup, UI rendering, and the call-screen SSE hook.
2. **Billing integrity:** live STT is billed when realtime STT actually runs, independent of coaching; batch transcription is gated or explicitly declared as a separate paid product with canonical billing keys.
3. **Boundary clarity:** `services/media-stream/` either has an explicit accepted in-process coupling contract or emits domain events to an app-owned persistence/billing path. Dynamic inline billing imports are removed.
4. **Engine decomposition:** `coaching-engine.ts` no longer owns rules, Cohere calls, event writes, session persistence, and billing in one module.
5. **Typed realtime contract:** transcript/coaching workspace events use shared schemas for producers and consumers. The UI does not rely on loose `String()` / `Number()` coercion of unknown payloads.
6. **Recoverable live UI:** call-screen coaching/transcript state has an initial hydration or cursor-resume strategy, and SSE is not mounted when capabilities are off.
7. **Review hygiene:** unrelated refactors and docs are split or clearly isolated so the live coaching PR can be reviewed on its own.

### Non-Goals

- Do not redesign the product surface beyond the reviewed feature.
- Do not replace the existing workspace-events SSE system.
- Do not modify `.env` or environment variables.
- Do not broaden this into a full `ai-power` branch review.

---

## 3. Baseline And Constraints

### Review Scope

The thermo-nuclear review covered the coaching/transcription work in:

- `d0b4ed48` — schema and feature flag foundation.
- `0fc77b6c` — live pipeline, media-stream service modules, call-screen panels, worker transcription path, and adjacent refactors.

The full branch diff against `main` is much larger and was intentionally out of scope. Implementation agents must re-run `git status` and inspect the current diff before editing because this branch may contain user-owned or unrelated work.

### Repository Invariants

All implementation agents must follow the repo rules in `AGENTS.md`, especially:

- Use `debitAmountFromCredits()` for credit debits.
- Use `insertTransactionHistoryIdempotent()` and canonical idempotency keys for ledger writes.
- Prefer `shared/billing-keys.ts` over handwritten billing key prefixes.
- Keep imports at the top of modules; no inline imports unless a documented circular dependency requires it.
- Preserve user changes; do not reset, stash, or revert unrelated work.
- Route code should use canonical tenant/data-plane helpers where applicable.

### Known Structural Findings

1. `coachingEnabled()` currently means `liveTranscription || liveCoaching`, while TwiML attaches only for `liveTranscription` and media-stream coaching state only exists for `liveCoaching`.
2. `useCallCoaching()` is called before `CallScreenLiveCoachingPanels` checks flags, so SSE can mount even when panels render `null`.
3. Live transcription billing is inside `finalizeCoachingSession()`, so transcription-only calls can be unbilled.
4. Batch transcription is enqueued from recording side effects without checking the feature policy and uses a different idempotency namespace.
5. `services/media-stream/` imports app internals directly and `coaching-engine.ts` uses dynamic inline imports for billing.
6. Workspace event payloads are untyped at the producer/consumer boundary.
7. No initial hydration exists for transcript/coaching state on call-screen mount.
8. Several unrelated refactors are bundled with the coaching commit.

---

## 4. Workstreams

### WS-0 — Repository Triage And Scope Lock

**Owner:** orchestrator  
**Complexity:** moderate reasoning  
**Depends on:** none

Tasks:

1. Capture current branch, HEAD, merge-base, working-tree status, staged changes, and untracked files.
2. Identify which changed files belong to live coaching/transcription versus unrelated refactors.
3. Decide whether remediation happens on the current branch or a fresh branch from `ai-power`.
4. Create a file list for each workstream and mark any user-owned changes that must not be touched.

Acceptance criteria:

- A short implementation note or PR description can name the exact files in and out of scope.
- No unrelated `.env`, settings, generated files, or user-owned changes are modified.

Suggested delegated prompt:

```text
In /Users/ladmin/WebProjects/callcaster, inspect the current git state for the live coaching remediation. Return: branch, HEAD, status, changed files grouped as coaching feature / adjacent refactor / unrelated, and any files that look risky to edit because they contain user-owned changes. Do not modify files.
```

### WS-1 — Capability Model

**Owner:** implementation agent  
**Complexity:** deep reasoning  
**Depends on:** WS-0

Tasks:

1. Introduce a shared `LiveMediaCapabilities` helper near the existing feature-flag/coaching schema layer.
2. Decide and encode the product invariant: live coaching implies realtime stream attachment because coaching cannot operate without transcription input.
3. Replace `coachingEnabled()` call sites with capability fields:
   - TwiML stream attachment uses `attachStream`.
   - Media-stream coaching state uses `runCoaching`.
   - Transcript tab uses `showTranscript`.
   - Coaching tab uses `showCoaching`.
   - SSE hook mounts only when either visible capability is true.
4. Add focused tests for all four flag combinations.

Acceptance criteria:

- `liveCoaching=true`, `liveTranscription=false` does not produce an empty UI with no stream.
- `liveTranscription=true`, `liveCoaching=false` shows transcript behavior without coaching UI.
- The call screen does not open an EventSource when both capabilities are off.
- Tests document the intended flag matrix.

### WS-2 — Transcription Billing Policy

**Owner:** billing-focused implementation agent  
**Complexity:** deep reasoning  
**Depends on:** WS-1 capability semantics

Tasks:

1. Move live transcription billing out of `finalizeCoachingSession()` and into the media-stream stop lifecycle for any call where STT opened.
2. Add canonical billing key helpers for live transcription and batch transcription, or extend existing shared helpers.
3. Decide the batch policy:
   - If batch is a post-call golden transcript, it must be gated and documented as separately billable.
   - If batch is only a fallback, skip it when live transcription already succeeded.
4. Ensure credits use `debitAmountFromCredits()` and ledger writes use `insertTransactionHistoryIdempotent()`.
5. Add tests for transcription-only, coaching-enabled, batch-only, and live-plus-batch policy cases.

Acceptance criteria:

- A transcription-only live stream cannot finish without the expected live transcription ledger entry.
- A call cannot accidentally receive both live and batch transcription debits unless the product policy explicitly allows that path.
- Idempotency keys classify correctly through shared billing key helpers.

### WS-3 — Media-Stream Boundary Contract

**Owner:** architecture-focused implementation agent  
**Complexity:** deep reasoning  
**Depends on:** WS-1 and WS-2 decisions

Tasks:

1. Choose the v1 boundary:
   - accepted in-process coupling with explicit service-role imports, or
   - real boundary where media-stream emits domain events and app code owns DB/billing/SSE.
2. Remove dynamic inline imports from `coaching-engine.ts`.
3. Centralize media-stream persistence/event writes behind one narrow module if keeping in-process coupling.
4. Document any intentional `@/` imports from `services/media-stream/` and add or update structural allowlists if needed.

Acceptance criteria:

- Media-stream dependencies are visible at top level.
- Billing dependencies are not hidden inside functions.
- Future maintainers can tell which layer owns DB writes, workspace events, and ledger debits.

### WS-4 — Coaching Engine Decomposition

**Owner:** implementation agent  
**Complexity:** moderate reasoning  
**Depends on:** WS-3 import/boundary decision

Tasks:

1. Split pure rule evaluation from side-effect orchestration.
2. Extract Cohere generate/parse behavior into a reusable `coaching-llm` module.
3. Extract billing into `coaching-billing` or the chosen boundary-owned billing module.
4. Extract final session orchestration if it remains non-trivial.
5. Replace the hardcoded score component (`75 * 0.2`) with an explicit named signal or remove it.

Target shape:

- `coaching-rules.ts` — utterance/state in, cue intents and metric snapshot out.
- `coaching-llm.ts` — Cohere prompt, response parsing, validation.
- `coaching-billing.ts` — live transcription and cue debit helpers.
- `coaching-finalize.ts` — summary, final metrics, persistence, publish.
- `coaching-engine.ts` — thin orchestration facade, if still needed.

Acceptance criteria:

- Pure rule tests can run without DB, SSE, billing, or network mocks.
- LLM parsing failures are validated and non-fatal without broad `JSON.parse` assumptions.
- The top-level stream handler remains easy to read.

### WS-5 — Typed Workspace Events And Hydration

**Owner:** realtime/UI implementation agent  
**Complexity:** moderate reasoning  
**Depends on:** WS-1 capability model

Tasks:

1. Define shared schemas for:
   - `transcript_segment`
   - `coaching_metrics`
   - `coaching_cue`
   - `coaching_session_final`
2. Use schemas in `db-writer` publishers and `useCallCoaching` consumers.
3. Replace UI-side coercion with schema parsing and explicit error handling.
4. Add initial hydration or cursor-resume behavior for active call transcript/coaching data.
5. Preserve optimistic cue acknowledgement only if failed POSTs are surfaced or reverted.

Acceptance criteria:

- Producer and consumer share one event contract.
- Late call-screen mount shows existing transcript/coaching state or resumes from a durable event cursor.
- Invalid events are logged and ignored without corrupting UI state.

### WS-6 — Twilio Attachment Consolidation

**Owner:** route implementation agent  
**Complexity:** local transformation  
**Depends on:** WS-1 capability model

Tasks:

1. Extract a route helper such as `appendLiveMediaStreamForCall()`.
2. Replace the duplicated stream-attachment boilerplate in:
   - `api+/call.action.server.ts`
   - `api+/dial/$number.action.server.ts`
   - `api+/auto-dial/$roomId.action.server.ts`
   - `api+/inbound.action.server.ts`
3. Keep route-specific call metadata explicit and typed.
4. Add focused tests or update existing route tests to cover stream on/off behavior.

Acceptance criteria:

- Stream attachment policy lives in one helper.
- Routes no longer each perform bespoke flag interpretation.
- Existing Twilio route behavior remains unchanged when capabilities are off.

### WS-7 — Review Hygiene Split

**Owner:** orchestrator  
**Complexity:** moderate reasoning  
**Depends on:** WS-0

Tasks:

1. Separate or clearly isolate unrelated changes from the coaching remediation:
   - `platform-data.server.ts`
   - `outreach-typed-fields.server.ts`
   - `questions.action.server.ts`
   - queue/campaign progress UI
   - remediation docs unrelated to live coaching
2. Decide whether to split into separate PRs, separate commits, or leave with explicit rationale.
3. Ensure tests and PR summary reflect the chosen scope.

Acceptance criteria:

- A reviewer can evaluate live coaching/transcription without also reviewing unrelated platform-data or queue refactors.
- Any retained unrelated change has a clear reason for being in the same branch.

---

## 5. Execution Sequence

1. **WS-0 first:** lock scope and current git state.
2. **WS-1 next:** capability model is the root dependency for TwiML, UI, handler, and tests.
3. **WS-2 and WS-3 in parallel after WS-1:** billing policy and boundary ownership can proceed together but must reconcile before final code lands.
4. **WS-4 after WS-3:** decompose the engine once import and ownership decisions are known.
5. **WS-5 after WS-1, parallel with WS-4:** event schemas and hydration touch UI/realtime, mostly independent of engine internals.
6. **WS-6 after WS-1:** consolidate Twilio route boilerplate once capabilities exist.
7. **WS-7 throughout:** keep review scope from growing as fixes land.
8. **Final integration:** run focused tests, lints for edited files, and the smallest repo check set that covers routes, billing, media-stream, and UI.

---

## 6. Delegation Plan

Use parallel delegation only where outputs can be reconciled cleanly.

### Suggested Agents

- **Scope scout:** read-only code search and git-state grouping.
- **Capability implementer:** shared flag/capability helper plus UI/TwiML/handler integration.
- **Billing implementer:** live and batch transcription debit policy, key helpers, billing tests.
- **Boundary reviewer:** media-stream dependency contract and import allowlist recommendation.
- **Realtime implementer:** typed event schemas, hook parsing, hydration/resume.
- **Route cleanup implementer:** Twilio attach helper and route test updates.
- **Verifier:** focused final review against this plan and thermo-nuclear findings.

### Supervision Rules

- Do not let any implementation agent change `.env`.
- Do not let a local route cleanup agent decide billing semantics.
- Do not let billing changes land without tests around idempotency keys and credit signs.
- Do not let UI changes hide the Coaching tab mismatch without fixing the shared capability model.
- Do not accept a refactor that only moves `coaching-engine.ts` complexity into equally tangled files.

---

## 7. Test And Verification Plan

### Focused Tests

Add or update tests for:

- Feature flag matrix:
  - neither flag
  - transcription only
  - coaching only
  - both flags
- TwiML stream attachment for each call mode.
- `useCallCoaching` does not mount SSE when disabled.
- Event schema parse success/failure.
- Transcript hydration or cursor-resume behavior.
- Live transcription billing on STT stop.
- Batch transcription gating or explicit dual-billing policy.
- Cue billing idempotency.
- Pure coaching rules independent of DB/network.

### Local Checks

Prefer focused checks first:

- Relevant Vitest files for feature flags, billing, media-stream handler, route TwiML, and UI hook/components.
- `ReadLints` for edited files after changes.
- `npm run typecheck` if the edit touches shared types, route contracts, or DB schema.
- `npm run ci:local` before PR if this becomes a merge-ready branch.

### Manual Smoke

Before shipping a review environment:

1. Workspace with both flags off: call screen has no coaching/transcript SSE panel.
2. Transcription only: live transcript appears; no coaching tab or cue behavior.
3. Coaching enabled: stream attaches, transcript appears, coaching metrics/cues appear.
4. Simulated disconnect/reload: transcript state is recovered or resumed.
5. Completed call: expected ledger entries exist exactly once.

---

## 8. Risks And Decisions To Record

### Product Decisions

- Does `liveCoaching` imply `liveTranscription` in persisted feature flags, or only in derived runtime capabilities?
- Is batch transcription a paid golden transcript in addition to live transcription, or a fallback path?
- Can any workspace member acknowledge a coaching cue, or only the call agent / manager roles?
- Should missing `MEDIA_STREAM_HOST` fail closed when a live capability is enabled?

### Technical Risks

- Changing billing policy can alter current branch test assumptions.
- Hydration may require adding a loader/query path for active call transcript segments and coaching events.
- Tightening event schemas may expose existing workspace event payload drift.
- Splitting unrelated changes may be hard if commits already interleave feature and refactor edits.

Record decisions in the PR description or a follow-up ADR if they affect shipped billing/product semantics.

---

## 9. Final Review Checklist

Before marking this plan complete, verify:

- `liveMediaCapabilities` is the only place that interprets the flag combination.
- No call path can show coaching UI without a stream path.
- No call path can open realtime STT without an explicit billing or free-tier policy.
- Batch and live transcription idempotency keys are canonical and classified.
- `coaching-engine.ts` is not a side-effect god module.
- Media-stream imports are top-level and intentionally allowed.
- Workspace events are typed at producer and consumer.
- SSE/hydration behavior survives reload or reconnect.
- Four Twilio routes no longer duplicate policy logic.
- Unrelated refactors are separated or explicitly justified.
- Focused tests and lint/type checks pass for edited files.

---

## 10. Execution Record (2026-07-15)

All workstreams WS-0 through WS-7 are complete. `ai-power` was rebuilt from one
65-file commit into six reviewable commits. Backup ref: `backup/ai-power-pre-split`
(points at the original `0fc77b6c`).

### Product decisions recorded

| Decision | Choice |
| --- | --- |
| `liveCoaching` implies `liveTranscription`? | Derived at runtime only; persisted flags stay independent. |
| Batch transcription | Gated off behind a default-off `batchTranscription` flag pending policy. Neither enqueued nor billed. |
| Cue acknowledgement authz | Any workspace member, any role. Unchanged. |
| Missing `MEDIA_STREAM_HOST` | Fail closed, log loudly, call proceeds. |
| `services/**` typecheck | Fixed now, via `services/tsconfig.json` under bun types. No casts needed. |

### Corrections to this plan

The plan was accurate in outline but wrong or incomplete in five places:

1. **The billing hole was larger than Finding 3 described.** STT opened
   unconditionally in `twilio-handler.ts` — it was never gated on
   `liveTranscription` at all. Combined with the debit living inside
   `finalizeCoachingSession` (coaching-only), *every* transcription-only call ran
   ElevenLabs STT unbilled. The debit also measured the coaching clock, not the
   STT clock.
2. **The "other" bucket was actively harmful, not merely uncategorised.**
   `unrecognizedDebitEvents = ledgerSummary.other.events`, and any value > 0 raises
   a reconciliation alert — so every transcription/coaching debit was firing a
   false alert. Fixed with a new `ai` bucket, deliberately kept out of `voice`
   (which reconciles unit-for-unit against Twilio minutes).
3. **WS-6's premise dissolved.** Once WS-1 moved the gate inside the TwiML helper,
   the four routes needed no change — none interpreted flags itself. The proposed
   `appendLiveMediaStreamForCall()` was declined as a shallow wrapper that would
   have removed zero policy logic. The real gap was that no route test asserted
   stream attachment at all; 16 were added.
4. **WS-7's scope was smaller than assumed.** `d0b4ed48` is already on `origin/dev`
   and cannot be split. Only `0fc77b6c` was in play — and it split cleanly by file
   path with zero mixed files.
5. **The dynamic imports guarded nothing.** No circular dependency existed. They
   only hid the debits from static analysis, which is precisely how the
   credit-write guard missed them.

### Root causes addressed

The unbilled-STT bug shipped because `services/` sat outside both safety nets:
`scripts/check-credit-write-paths.mjs` did not scan it, and `tsconfig.json` did not
typecheck it. Both are now closed. Typechecking the service immediately found a
real bug: an `as ArrayBuffer` cast on a value Bun delivers as a `Buffer`.

### Known-good caveats

- `npm run typecheck` chains `tsc && tsc -p services/tsconfig.json`, so the
  services pass is masked until the pre-existing
  `app/lib/messaging-onboarding/normalize.server.ts(241,41)` failure on
  `origin/dev` is fixed. CI fails either way; the guard is simply not yet doing
  its job.
- Local Node is v25 against CI's 22, which manufactures ~218 unrelated test
  failures locally. Verified against a clean `HEAD` worktree: this work newly
  breaks **zero** files and fixes one (`test/feature-flags.test.ts`, which
  imported `bun:test` and therefore had never run).

### Still open

- Batch transcription policy (paid golden transcript vs fallback) — flag is
  default-off until decided.
- `app/AudioStreamer.tsx` is dead code reading `process.env.MEDIA_STREAM_HOST`
  with no vite `define`; it would build `wss://undefined/...` if ever rendered.
- The SSE loader replays from id 0 on a fresh mount, because a fresh EventSource
  sends no `Last-Event-ID`. The client discards non-matching rows, so this is a
  performance concern that grows with transcript volume, not a correctness one.
  Hydration is deduped against the replay, but the replay itself is untouched.
- **Membership on the SSE endpoint is enforced — an earlier note here claiming
  otherwise was wrong** (investigated and retracted 2026-07-15; see §11).
- ~~Membership is checked once at connect time and never re-checked for the life
  of the stream~~ — **fixed** in `f7a49b1a`. See §11.

---

## 11. Workspace-Events SSE Tenant Isolation — Investigated and Retracted (2026-07-15)

### The claim was FALSE. Membership is enforced.

An earlier read-only audit reported that
`app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts` streams every
workspace event to any caller passing the route context, with no membership check.
**This is wrong.** No vulnerability exists. The audit read the loader in isolation
and missed that enforcement lives one level up, in middleware.

The verified chain:

1. `events.route.tsx` re-exports the loader and is nested under the
   `api+/workspaces+/$workspaceId.tsx` layout.
2. That layout exports `middleware = [dataPlaneMiddleware]`
   (`$workspaceId.middleware.server.ts:4`), which every nested route inherits.
3. `dataPlaneMiddleware` calls `resolveDataPlaneAuth(request, workspaceId)`
   (`data-plane-middleware.server.ts:21`) and returns its `Response` on failure —
   `next()` is never reached.
4. `resolveDataPlaneAuth` (`platform-data.server.ts:133`) authenticates, then:
   - **session auth** → `requireWorkspaceAccess({ user, workspaceId })` (:153),
     returning 404/403 for a non-member;
   - **API key auth** → 404 unless `auth.workspaceId === workspaceId` (:142).

So a non-member never reaches the loader. What misled the audit is real but benign:
the loader discards `getDataPlaneRouteContext`'s return value and uses `getSession`
only for headers — because the authorization already happened upstream.

### Existing coverage (all green)

- `test/workspace-events.route.test.ts` — including `loader throws when data-plane
  context is missing`, i.e. the loader **fails closed** if it were ever mounted
  outside the middleware.
- `test/data-plane-cross-tenant-auth.test.ts` — workspace A's API key and session
  each receive 404 for workspace B.
- `test/route-middleware-exports.test.ts` — pins the data-plane middleware export
  shape (a bare function instead of an array silently breaks the router pipeline).

No new test was added: attempting the attack at the loader level cannot reproduce
it, because the loader is not where the check lives, and the three suites above
already cover both the gate and the fail-closed path.

### Two real observations (neither is the reported gap)

1. **Revocation was not enforced mid-stream — FIXED in `f7a49b1a`.** Membership was
   checked once, at connect time. The stream then lived until `request.signal`
   aborted, with no re-authorization anywhere in the loop, so a user removed from a
   workspace kept receiving events — by then, verbatim call transcripts — on an
   already-open connection.

   The fix re-checks on the existing heartbeat and sends a terminal
   `access_revoked` frame before closing. Decisions worth knowing:
   - **Revocation takes up to 15s, not effect instantly.** Re-checking per 2s poll
     would cut the window but cost 7.5× the lookups. `getUserRole` is one indexed
     tenant-scoped read, so per-connection-per-heartbeat is affordable; per-poll is
     harder to justify for a bounded exposure to an ex-member.
   - **A failed lookup keeps the stream open.** A database blip is not evidence of
     revocation, and connect-time auth already passed; failing closed would drop
     every listener on a hiccup. The next tick re-checks.
   - **Clients must close on the terminal frame.** EventSource reconnects after a
     server-side close, so without an explicit `close()` a revoked tab retries
     against a middleware that rejects it every time.
   - **API-key connections are out of scope** — pinned to one workspace at issue
     time, with no membership to revoke. Key revocation is separate.
2. **The loader's `getDataPlaneRouteContext(context, workspaceId)` check is
   tautological here.** The middleware sets the context as `{ ...auth, workspaceId }`
   using `params.workspaceId`, so `auth.workspaceId !== workspaceId` can never be
   true on this route. It is harmless dead defense — the real check ran upstream
   against the same id — but it should not be mistaken for the thing providing
   isolation.

