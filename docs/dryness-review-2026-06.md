# Thermo-Nuclear DRYness Review — `app/` runtime

**Date:** 2026-06-28
**Scope:** `app/` runtime only (routes, lib, components, hooks, contexts). Excludes `archive/`, `scripts/`, `supabase/` edge functions, tests.
**Method:** Seven parallel `explore` subagents, each auditing one duplication-prone cluster against the thermo-nuclear rubric. High-conviction findings only; cosmetic nits dropped. Each finding carries `file:line` references and a consolidation recommendation that prefers reusing an **existing** canonical helper over inventing one.

---

## Verdict: **Revise** (do not approve as-is)

## Summary

The codebase has *already invented* most of its canonical owners — `requireWorkspaceLoaderContext`, `withWorkspaceApiLoader`, `resolveDataPlaneAuth`, `csv.ts`, `queue-status.ts`, `call-status.ts`, `transaction-history.server.ts`, `shared/pricing.ts`, `type-safety-utils.ts` — then used them in only a handful of places while ~25–60 route/handler/hook modules re-inline the same logic in subtly divergent forms. The cost is not just duplication: divergence has produced **real authorization gaps** (6 UI loaders skip membership checks), **real billing-correctness risks** (SMS flat-billed, voice double-debit key collision, credits-sync mechanism contradicts the design doc), and **~20+ dead files/helpers** carried as maintenance weight. The throughline remediation is mechanical and high-leverage: *delete the inline copies and call the helper that already exists* — not a rewrite.

**Cluster scores:** Auth **3/10**, Billing **5/10**, Twilio **6/10**, Readiness **4/10**, Platform API **6/10**, Campaign/Queue/SMS **6/10**, Utils/Types/UI **6/10**.

---

## Cross-cutting structural findings (the big rocks)

### S1 — No canonical workspace-auth/role gate; inlined in ~25 routes with real authz gaps · **Critical**

Sources: A1-1, A1-2, A1-6, A1-7, A3-4, A3-5.

- No helper takes a `minRole`. Role gating is inlined in **6 divergent idioms**; membership is re-inlined in ~18 UI loaders despite `requireWorkspaceLoaderContext` (`app/lib/workspace-route.server.ts:22`) existing for exactly this.
- **6 UI loaders do no membership check at all** — `audiences/$audience_id`, `audios/new`, `billing`, `exports`, `archive`, `queue` trust the URL `id`. These are authz gaps the duplication has already caused.
- API side: `withWorkspaceApiLoader`/`withWorkspaceApiAction` exist but only **1 of ~25** `api+/workspaces+/*` routes uses them; the rest re-inline the `workspaceId` guard + auth-passthrough ~25×. API keys work for some workspace endpoints and not others with no documented rationale.
- `api-route-auth.server.ts` is a grab-bag that re-exports `api-auth`, duplicates `authForCampaign`, and adds 2 one-off resource helpers — **delete it**.

**Plan-judo:** Extend `requireWorkspaceLoaderContext` + `withWorkspaceApiLoader/Action` with `{minRole}`; make them mandatory for all `workspaces+/$id/*` loaders and `api+/workspaces+/*` routes; delete `api-route-auth.server.ts`, `requireResourceWorkspaceAccess`, `getSupabaseFromAuth`; collapse the 4 `authFor*` into one `authForResource`.

### S2 — Billing-correctness divergence (DRY gap = money leak) · **Critical**

Sources: A4-1, A4-2, A4-7, A4-10, A2-6.

- `workspace.credits` is synced by a **Postgres trigger** (`supabase/migrations/202606100001_billing_reconciliation_and_credits_trigger.sql:2-20`), not the app-layer Drizzle tx CONTEXT.md documents — 0 `workspace.credits` updates and 0 Drizzle imports in `app/`. The documented invariant is false. **(Open question — see Slice 3 below.)**
- SMS debits a **flat 1 credit** regardless of `num_segments` (`app/routes/api+/sms/status.action.server.ts:114`); the segment counter `getSmsSegmentInfo` (`app/lib/sms-segments.ts:180`) is **dead code in runtime**. Multi-segment SMS is underbilled and inflates reconciliation variance.
- Voice billing: `ivr/status` and `auto-dial/status` reimplement call-status persistence + disposition + billing, **sharing the `call:${sid}` idempotency key** with the canonical route while computing *different* credit amounts — concrete double-debit/non-deterministic-debit hazard.
- Terminal-billable status sets disagree in **5 places** on whether `canceled`/`read` are billable; reconciliation uses a different set than the debit gate, masking leakage as "gap."
- `debitAmountFromCredits` exists at `shared/pricing.ts:62` with **0 callers**; every debit site hand-rolls `amount: -X` (a future sign flip silently *adds* credits).

### S3 — Readiness/onboarding: 5 parallel evaluators, 6 incompatible shapes, 70% predicate overlap · **Critical**

Sources: A5-1 through A5-7.

- `deriveWorkspaceMessagingReadiness`, `buildOnboardingStepsForState`, `assertWorkspaceCanSendSms`, `buildA2pBlockingIssues`, `getWorkspaceRcsBlockingIssues` all recompute the same 4–6 predicates inline (messaging-service-sid, A2P approved/live, first number, business profile, emergency voice).
- **6 return shapes** (typed object / step array / `string[]` / `void`+throw / `CampaignReadiness` / `CampaignSetupStep[]`); no shared `ReadinessResult`.
- A 60-line **verbatim duplicate** (`messaging-onboarding-display.ts`) that no runtime module imports.
- The SMS send-gate (`assertWorkspaceCanSendSms`) **ignores the canonical evaluator it imports** — UI can show "ready" while send throws, or vice-versa.
- "Business profile complete" checked 3 ways with 4-field vs 8-field sets → contradicting verdicts for the same row.
- Readiness computed in **React component bodies** instead of loaders; `.server.ts` barrel imported into client UI while the intended client mirror sits dead.

**Plan-judo:** One `WorkspaceReadinessPredicate[]` table + `CampaignReadiness`'s `{code,message,severity}` shape as the cluster `ReadinessResult` collapses A5-1/2/3/4/7 at once.

### S4 — Type/error/logging foundation duplicated · **Critical**

Sources: A7-1 through A7-6, A7-8, A1-8, A3-9, A7-19.

- `type-utils.ts` vs `type-safety-utils.ts`: ~12 duplicated exports, **silently divergent** (`deepClone` drops `Date`s in one; `createAppError` has different arity; `safeJsonParse` validates vs blind-casts). `type-utils` already imports from `type-safety-utils` — the dependency direction is clear.
- `AppError` is both a **class** (`errors.server.ts:54`) and an **interface** (`type-safety-utils.ts:12`) with different fields — name collision.
- `logger.server.ts` and `logger.client.ts` are **95% byte-identical** (only the env probe differs).
- **~8 error-response shapes** in flight: `{error}` / `{error,code}` / `{error,code,statusCode,details}` × `Response`/`routeData`/`throw`, plus `throw redirect` and `throw new Error` as error handlers. Two functions named `createErrorResponse` with different signatures.
- **3 `ValidationRule` interfaces** + two largely-dead form-validation hook implementations (`useFormValidation`, `useForm` — zero callers).

### S5 — Twilio client/TwiML/status divergence · **High**

Sources: A2-1, A2-2, A2-5, A2-6, A2-9.

- **10** raw `new Twilio(...)` sites: one canonical subaccount factory + one parent singleton compete with **4 inline subaccount builders** + **2 route-level leaks**. Only one site passes `accountSid` opts; none of the parallel sites use `withTwilioRetry`.
- **14 inline string-TwiML sites** (incl. a duplicated `TWIML_PAUSE_RESPONSE` constant) bypass the typed `VoiceResponse` builder — **no XML escaping** on interpolated URLs/script text (injection/breakage risk).
- `ivr/status` + `dial/status` reimplement call-status persistence + disposition mapping, bypassing `twilio-call-status.server.ts` (feeds S2's double-debit hazard).
- Webhook signature validation, by contrast, is **clean** (single policy, single dev-fallback) — the security spine is fine.

### S6 — Dead code carry cost (~20+ files/helpers) · **Medium-High**

Sources: A6-1/3/4/6, A7-8/14/15/20, A5-1/9, A1-4/5/10, A2-4.

- `app/contexts/` (2× 1-byte stubs: `CampaignContext.tsx`, `WorkspaceContext.tsx`)
- `app/components/script/` (6 files, ~35 KB)
- 5 flat-root QuestionCard/CampaignSettings.Script files (~30 KB)
- `app/components/forms/` (3 files: `AudioSelector`, `InputSelector`, `OutputSelector`)
- `messaging-onboarding-display.ts` (verbatim duplicate, no runtime importers)
- `database/campaign-outreach-export.server.ts` + `utils.ts` `extractKeys`/`flattenRow`/`generateCSVContent` (dead parallel export pipeline)
- `twilio.server.ts:sendSms` (no callers)
- `requireResourceWorkspaceAccess` (dead alias of `resolveDataPlaneAuth`)
- `getSupabaseFromAuth` (duplicate of `getDualAuthSupabase`)
- `useFormValidation` + `useForm` (zero callers)
- Dead `getCampaignReadiness` imports in three route modules
- Dead `if (!user)` guards after `verifyAuth` in ~12 routes (helper contract misunderstood — `verifyAuth` throws on no user)

---

## Other high-value findings (condensed)

| ID | Cluster | Finding | Sev |
|---|---|---|---|
| A2-3 | Twilio | `loadWorkspaceTwilioData` pattern inlined ~12× | Med |
| A2-7/8 | Twilio | `mapBrandStatus` locked local; usage fetch duplicated, ignores 30-day helper | Med |
| A3-2 | Platform API | 3 parallel "API surface" defs already disagree (3 vs 25 integrator paths) | High |
| A3-3 | Platform API | OpenAPI hand-maintained for 8/~145 paths; 2 Error schemas; no zod→OpenAPI | High |
| A3-6 | Platform API | Survey-responses CSV serializer duplicated ~120 lines (already drifted) | High |
| A3-7 | Platform API | Pagination parsing/envelope duplicated 4× with divergent defaults/shapes | Med |
| A4-3/5/6 | Billing | `getSmsSegmentInfo` dead; `formatUnitPrice` hardcodes "$0.02 CAD"; 3 CAD formatters | Med |
| A4-8/9 | Billing | Idempotency-key prefixes + prefix→bucket mapping maintained in 3 places | Med |
| A6-2 | Campaign | Campaign exporter hand-rolls CSV rows, bypasses `csv.ts` | High |
| A6-5 | SMS | Two live send paths duplicate the ~18-field `message`-table insert mapping | High |
| A6-7/8/9 | Queue | Hand-rolled queue filter/dequeue/release bypass `applyQueueStatusFilter`/`buildDequeuedQueueUpdate` (leaves stale v2 `queue_state`) | High |
| A6-11 | Queue | Query-level filter is legacy-`status`-only while row helpers support `queue_state` | Med |
| A7-7 | Utils | `utils.ts` 637-line grab-bag duplicates `csv.ts`/`phone.ts`/`queue-status.ts` | High |
| A7-9/10 | UI | DTMF keys 3× with 2 types; `formatTime` unit mismatch (renders 30s call as 00:00:00) | High |
| A7-11/12 | UI | `useCallState` (FSM) + `useCallHandling` (string) run parallel call-state machines; lib `call-status.ts` bypassed | High |
| A7-13/16/17/18 | UI | Queue literals hardcoded in components; `WebhookEvent` local copy drops `DELETE`; `call-list/` legacy leak; raw HTML controls vs `ui/` | Med-High |

---

## Recommended remediation plan — atomic, ordered slices

Each slice leaves the repo working and is independently verifiable (`npm run tools:routes:verify`, `npm run typecheck`, `npm run lint`, relevant vitest). The plan-judo move is consistent: **consolidate onto the existing canonical helper, then delete the copies** — do not invent new abstractions except where named below.

### Slice 0 — Dead-code purge (zero-risk)
Delete the ~20 dead files/helpers in S6. Verify: typecheck + lint + `npm test` green; `npm run tools:routes:verify`.

### Slice 1 — Foundation consolidation (unblocks the rest)
Fold `type-utils.ts` → `type-safety-utils.ts` (pick safer impls); rename `AppError` interface → `AppErrorShape`; unify `ErrorResponse`/`ClientError` → `ErrorPayload`; extract `logger-core.ts`; pick **one** error envelope and route `jsonError`/`routeJsonError`/`createErrorResponse`/`rateLimitResponse` through it. (S4)

### Slice 2 — Canonical auth/role gate
Extend `requireWorkspaceLoaderContext` + `withWorkspaceApiLoader/Action` with `{minRole}`; make them mandatory for all `workspaces+/$id/*` loaders and `api+/workspaces+/*` routes; delete `api-route-auth.server.ts`, `requireResourceWorkspaceAccess`, `getSupabaseFromAuth`; add `authForResource`/`resolveResourceWorkspaceId` to collapse the 4 `authFor*`. The 6 missing-membership routes get the guard for free. (S1)

### Slice 3 — Billing correctness (do before more features)
> **OPEN QUESTION (unresolved):** who owns the credits sync? Two options:
> - **(a) Keep the existing Postgres trigger** (it works) and fix CONTEXT.md + AGENTS.md to match reality. Lower risk, less code.
> - **(b) Implement the documented app-layer Drizzle/Postgres tx** (insert ledger + update credits atomically) and drop the trigger. Matches docs; bigger change.
>
> This decision is **deferred**. Either way, the rest of Slice 3 proceeds:
>
- Debit SMS by `num_segments` + wire `getSmsSegmentInfo` for estimates.
- Use `debitAmountFromCredits` at every debit site (delete hand-rolled `amount: -X`).
- Namespace call idempotency keys by billing kind + make `kind` required on `billingUnitsFromCallDurationSeconds` + single terminal-webhook debit.
- Unify terminal-status sets so reconciliation uses the debit gate's set.
- Idempotency-key builders (`smsKey`/`callKey`/`numberRentalPurchaseKey`/`stripeSessionKey`/`stripeEventKey`) + single `bucketFromIdempotencyKey` consumed by both `getBillingEventSource` and `categorizeLedgerRow`.
- (If option (b) is chosen) implement `applyLedgerEntryAndSyncCredits` in `transaction-history.server.ts` and drop the trigger. (S2)

### Slice 4 — Twilio layer
Extend `createWorkspaceTwilioInstance` (opts) and collapse the 4 inline builders + 2 route leaks onto it / the parent singleton; add `twilio-twiml.server.ts` (`hangupTwiml`/`pausePlayTwiml`/`pauseSayTwiml`/`pauseTwiml`) and replace the 14 inline strings; extract `persistCallStatusFromParams` and route `ivr/status`+`dial/status` through `twilio-call-status.server.ts`; `loadWorkspaceTwilioData` canonical + rename the webhook duplicate. (S5)

### Slice 5 — Readiness collapse
Extract `WorkspaceReadinessPredicate[]` + adopt `CampaignReadiness`'s `{code,message,severity}` as the cluster `ReadinessResult`; rewrite the 5 workspace evaluators as projections; make `assertWorkspaceCanSendSms` reuse `deriveWorkspaceMessagingReadiness`; per-channel `BUSINESS_PROFILE_REQUIRED_FIELDS`; move predicates to a non-`.server.ts` module and fix client imports; move readiness out of React bodies into loaders; stop storing `steps` (pure projection). (S3)

### Slice 6 — Campaign/queue/CSV/SMS
Campaign exporter → `csv.ts`; `sms-send.server.ts` shared send+persist (both paths delegate); `releaseAssignedQueueForUser` canonical + migrate hand-rolled dequeue/filter/release; add `queue_state` branches to `applyQueueStatusFilter`; export `compareByRecentActivity` and use it in the realtime hook. (A6-*)

### Slice 7 — UI/hooks
Split `utils.ts` grab-bag; consolidate phone helpers into `lib/phone.ts`; fix `formatTime` unit bug; `lib/dtmf.ts` for DTMF keys; route call-state through `call-status.ts` and collapse the parallel FSM; queue literals → lib constants; `WebhookEvent` → canonical import; migrate `call-list/` into `call/` and delete; raw controls → `ui/` primitives. (A7-*)

---

## Approval bar checklist

- [ ] One canonical workspace-auth/role gate used by every `workspaces+/$id/*` loader and `api+/workspaces+/*` route; the 6 membership-less routes guarded.
- [ ] Billing: credits-sync owner reconciled with docs (open question resolved); SMS debits by segment; voice idempotency keys cannot collide across webhooks; reconciliation uses the same billable-status set as the debit gate.
- [ ] One `ReadinessResult` shape; one predicate table; `assertWorkspaceCanSendSms` reuses `deriveWorkspaceMessagingReadiness`.
- [ ] One type-safety module; one `AppError` (class) + `AppErrorShape` (interface); one logger core; one error envelope.
- [ ] One Twilio subaccount factory + one parent singleton; no inline `new Twilio(...)` in routes; no inline string TwiML.
- [ ] All dead files/helpers in S6 deleted.
- [ ] Each slice ships with typecheck + lint + `tools:routes:verify` + relevant vitest green.

---

## Appendix — Cluster findings with `file:line` references

### A1 — Auth/permission + route boilerplate (cluster score 3/10)

- **A1-1 Critical — No canonical `requireWorkspaceMember(role)`.** Role gating inlined in 6 idioms: `onboarding.action.server.ts:89-96`, `settings/numbers.loader.server.ts:46`, `settings/queues.loader.server.ts:15`, `campaigns/$selected_id.loader.server.ts:94-96`, `analytics.loader.server.ts:114-117`, `settings.loader.server.ts:47`.
- **A1-2 Critical — `verifyAuth`+`getUserRole` boilerplate inlined in ~18 UI loaders** instead of `requireWorkspaceLoaderContext` (`workspace-route.server.ts:22`); 6 routes do **no** membership check (`audiences/$audience_id`, `audios/new`, `billing`, `exports`, `archive`, `campaigns/$selected_id/queue`).
- **A1-3 High — Four near-identical `authFor*` functions** (`platform-data.server.ts:164,194,224,254`) differing only in table/id/404 string; plus per-table `get*WorkspaceId` at `:116-162`.
- **A1-4 High — `getSupabaseFromAuth` duplicates `getDualAuthSupabase`** (`platform-data.server.ts:103` vs `api-auth.server.ts:205`) — identical one-liner.
- **A1-5 Medium — `requireResourceWorkspaceAccess` is a dead no-op alias** of `resolveDataPlaneAuth` (`platform-data.server.ts:109`); zero callers.
- **A1-6 High — Two parallel API auth entry points** (`resolveDataPlaneAuth` dual vs `requireJsonAuth` session-only) used inconsistently across `api+/workspaces+/*`; integrator API keys work for some endpoints and not others.
- **A1-7 High — `if (!workspaceId) return jsonError(...)` + `if (auth instanceof Response) return auth`** boilerplate repeated ~25× despite `withWorkspaceApiLoader/Action` existing to eliminate it.
- **A1-8 High — Divergent error-response shapes** (~8 surface shapes): `jsonError` (`platform-api.server.ts:13`), `routeData({error})`, `throw new Response(text)`, `throw redirect`, `throw new Error`, `createErrorResponse` (`errors.server.ts:78`), `routeJsonError` (`platform-api.server.ts:24`), `validationErrorResponse` (`api-parse.server.ts:16`).
- **A1-9 Medium — `api-route-auth.server.ts` grab-bag** overlaps `api-auth.server.ts` + `platform-data.server.ts`; re-exports, duplicates `authForCampaign`, adds 2 one-off helpers + 2 session resolvers. **Delete.**
- **A1-10 Medium — Dead `if (!user)` guards** after `verifyAuth` (which throws on no user) in ~12 routes.
- **A1-11 Medium — Two parallel form-body parsing paths** in workspaces+ actions (`parseActionRequest` vs manual `Object.fromEntries(formData.entries())`).

### A2 — Twilio layer (cluster score 6/10)

- **A2-1 High — Parallel subaccount client construction** bypassing `createWorkspaceTwilioInstance` (`database/workspace.server.ts:604`): `twilio-a2p.server.ts:40`, `caller-id-verification.server.ts:58`, `database/workspace-twilio-sync.server.ts:190`, `database.server.ts:201` (deprecated).
- **A2-2 High — Routes inline `new Twilio(...)`** (`api+/sms/status.action.server.ts:35`, `api+/numbers.loader.server.ts:49`) bypassing parent singleton `twilio` (`twilio.server.ts:107`).
- **A2-3 Medium — `loadWorkspaceTwilioData` pattern inlined ~12×** (twilio-bootstrap, twilio-a2p, twilio-a2p-status-sync, twilio-readiness, twilio-sender-pool, twilio-webhook-audit, workspace-twilio-sync, platform-admin-twilio, twilio-webhook ×4). Canonical: `merge-workspace-twilio-data.server.ts:7`.
- **A2-4 Medium — Two exports named `loadWorkspaceTwilioData`** with different semantics (`merge-workspace-twilio-data.server.ts:7` vs `twilio-webhook.server.ts:109`).
- **A2-5 Medium — Inline string TwiML** at 14 sites (incl. duplicated `TWIML_PAUSE_RESPONSE` at `api.disconnect.ts:11` + `api.disconnect.action.server.ts:7`) — no XML escaping. Correct builder pattern at `inbound-voicemail-twiml.server.ts`.
- **A2-6 High — Parallel call-status/disposition** in `ivr/status.action.server.ts:59-143` and `dial/status.action.server.ts:70-99` bypassing `twilio-call-status.server.ts`; shared `call:${sid}` idempotency key → double-debit hazard.
- **A2-7 Medium — `mapBrandStatus` locked local** (`twilio-a2p-status-sync.server.ts:12`); sibling `twilio-a2p.server.ts` hand-rolls equivalent strings.
- **A2-8 Medium — Twilio usage fetch duplicated** (`platform-admin-twilio.server.ts:171`, `database/workspace-twilio-sync.server.ts:194`) ignoring 30-day helper `getTwilioUsageDateRange` (`twilio-usage.ts:102`).
- **A2-9 Medium — `twilioParamsToUnderCase`** (`twilio-call-status.server.ts:15`) bypassed by `ivr/status` and `dial/status` (PascalCase access).

### A3 — Platform API surface (cluster score 6/10)

- **A3-1 High — No shared platform-handler scaffold**; 53 route files re-implement the auth→parse→call→shape→error skeleton (~20 lines each). `platform-api.server.ts` provides only leaf helpers.
- **A3-2 High — Three parallel "API surface" definitions**: `API_SURFACE` (`api-surface.ts:120`), `PLATFORM_API_SURFACE` (`api-surface-platform.ts:49`), `INTEGRATOR_API_PATHS` (`public-api.ts:7`, hardcoded 3 vs 25 actual `apiKeyOrSession` entries) + two hand-written schema override tables.
- **A3-3 High — OpenAPI hand-maintained** for 8/~145 paths; `errorResponse` defined 3× with different `$ref`s; two `Error` schemas (`Error` + `PlatformError`); no zod→OpenAPI generation.
- **A3-4 High — Divergent resource→workspace resolvers**: `platform-telephony.server.ts:317,334` (contact via `campaign_queue`) vs `platform-data.server.ts:116-162` (contact via `contact.workspace`) — can return different workspace_ids for the same contact.
- **A3-5 Medium — Role-guard duplicated across 4 platform files**: `requireMemberManager` (`platform-members.server.ts:22`), `requireNumbersManager` (`platform-workspace-numbers.server.ts:37`), `requireOnboardingAdmin` (`platform-onboarding.server.ts:138`), inline in `platform-workspace.server.ts:58` + `platform-media.server.ts:112`.
- **A3-6 High — Survey-responses CSV serializer duplicated ~120 lines**: `platform-analytics.server.ts:263-419` vs `platform-data.server.ts:1045-1162` (already drifted: `safeFilenamePart` NFKD-normalize-and-cap vs simple regex).
- **A3-7 Medium — Pagination parsing/envelope duplicated 4×** with divergent defaults (20 vs 50) and shapes (`total_pages` vs `has_more` vs `unfiltered_count`+`queued_count`).
- **A3-8 Medium — Idempotency scaffold `withIdempotency`** (`platform-idempotency.server.ts:59`) used in only 3 routes; parallel DB idempotency path `insertTransactionHistoryIdempotent` elsewhere.
- **A3-9 Medium — Multiple JSON-error wrappers**: `jsonError`/`routeJsonError` (`platform-api.server.ts:3,13,24`) + `rateLimitResponse` (`platform-rate-limit.server.ts:45`, hand-rolled, doesn't reuse `jsonError`).

### A4 — Billing (cluster score 5/10)

- **A4-1 Critical — Credits sync lives in a DB trigger, not the app layer** (contradicts CONTEXT.md "synced by the app layer via a Drizzle transaction, NOT a DB trigger in v2"). Open question — see Slice 3.
- **A4-2 Critical — SMS billing debits flat 1 credit per message** ignoring `num_segments` (`sms/status.action.server.ts:114`); underbilling + reconciliation variance masking.
- **A4-3 Medium — `getSmsSegmentInfo` dead code in runtime** (`sms-segments.ts:180`, only test ref).
- **A4-4 Medium — `debitAmountFromCredits`** (`shared/pricing.ts:62`) has 0 callers; every debit site hand-rolls `amount: -X`.
- **A4-5 Medium — `formatUnitPrice()` hardcodes `"$0.02 CAD"`** (`billing-format.ts:20`) instead of deriving from `CREDIT_PRICE_CAD` (`shared/pricing.ts:6`).
- **A4-6 Medium — Three CAD formatters**: inline `public-pricing.ts:35-38`, `billing-format.ts:13` `formatCurrency`, `shared/pricing.ts:66` `formatCadFromCredits`.
- **A4-7 High — Voice-billing kind resolution inconsistent**: `ivr/status.action.server.ts:134` hardcoded "ivr", `call-status.action.server.ts:123` resolves from campaign, `auto-dial/status.action.server.ts:215` defaults "staffed"; `call:${sid}` idempotency key collision across webhooks.
- **A4-8 Medium — Idempotency-key prefixes inline at every site** + re-parsed as string literals in `transaction-history-display.ts:16-23` and `shared/billing-reconciliation.ts:103-113`.
- **A4-9 Medium — `getBillingEventSource` (app) and `categorizeLedgerRow` (shared)** are parallel prefix→bucket mappers with divergent buckets (`number_rental` vs `numbers`, `unknown` vs `other`).
- **A4-10 High — Terminal billable status sets duplicated 5× with divergence** on `canceled`/`read`: `sms-status.ts:18-24`, `billing-reconciliation.server.ts:12`, `campaign-billing.server.ts:10`, `twilio-call-status.server.ts:116`, `billing-reconciliation.server.ts:13-19`.

### A5 — Readiness/onboarding (cluster score 4/10)

- **A5-1 Critical — `deriveWorkspaceMessagingReadiness` duplicated byte-for-byte**: `messaging-onboarding/readiness.server.ts:132-205` vs `messaging-onboarding-display.ts:7-83` (dead in runtime).
- **A5-2 Critical — Same predicates inlined across 5 evaluators (~70% overlap)**: `readiness.server.ts:149-185`, `readiness.server.ts:28-79`, `twilio-readiness.server.ts:50-77`, `twilio-a2p.server.ts:79-93`, `rcs-onboarding.server.ts:123-149`.
- **A5-3 High — `assertWorkspaceCanSendSms` ignores the canonical evaluator it imports** (`twilio-readiness.server.ts:33-86`); UI-vs-send-time divergence.
- **A5-4 High — Six+ incompatible readiness return shapes**; no shared `ReadinessResult`.
- **A5-5 High — Readiness computed in React component bodies** (`campaigns/$selected_id.route.tsx:112`, `settings.route.tsx:220-275`) instead of loaders.
- **A5-6 Medium — `.server.ts` barrel imported by client UI** (`OnboardingFirstNumberStep.tsx:9`, `OnboardingLaunchStep.tsx:5`, `OnboardingWizard.tsx:4`, `OnboardingOverviewCard.tsx:6`); intended client mirror `messaging-onboarding-display.ts` is dead.
- **A5-7 High — Business-profile "complete" checked 3 ways**: 4 fields (`readiness.server.ts:28-33`, `twilio-a2p.server.ts:79-90`) vs 8 fields (`rcs-onboarding.server.ts:126-149`) → contradicting verdicts.
- **A5-8 Medium — `buildOnboardingStepsForState` re-derived in ~14 sites** though normalize/merge already re-derives; stored `steps` field can drift.
- **A5-9 Low — Dead `getCampaignReadiness` imports** in 3 route modules.

### A6 — Campaign/queue/CSV/SMS (cluster score 6/10)

- **A6-1 Medium — Two parallel campaign-export pipelines** (one live `campaign-export.server.ts`, one dead `database/campaign-outreach-export.server.ts` + `utils.ts` `extractKeys`/`flattenRow`).
- **A6-2 High — Campaign exporter hand-rolls CSV rows** (`campaign-export.server.ts:218-243`, `:474-511`) bypassing `csv.ts:toCsvString`/`csvRow`.
- **A6-3 Low — Dead `generateCSVContent`** (`utils.ts:582`) — worse copy of `csv.ts:toCsvString` (uses `\n` not `\r\n`).
- **A6-4 Medium — Duplicate `OutreachExportData` type** (`outreach-export-types.ts:4` vs `database/campaign-outreach-export.server.ts:5`).
- **A6-5 High — Two live SMS send paths duplicate the ~18-field `message`-table insert mapping**: `chat-sms.server.ts:99-126` vs `sms.action.server.ts:155-182`.
- **A6-6 Low — Dead `twilio.server.ts:sendSms`** (no callers, bypasses all shared helpers).
- **A6-7 Medium — Hand-rolled "queued" filter** (`database/campaign.server.ts:495`) bypasses `applyQueueStatusFilter` (`queue-status.ts:233`).
- **A6-8 High — Hand-rolled dequeue update** (`auto-dial/$roomId.action.server.ts:47-52`) bypasses `buildDequeuedQueueUpdate` (`queue-status.ts:321`) → leaves stale v2 `queue_state`.
- **A6-9 High — Duplicated "release assigned queue rows"** (`platform-telephony.server.ts:284-307` vs `call.action.server.ts:45-68`).
- **A6-10 Medium — Conversation sort comparator inlined 3×** (`useChatRealtime.ts:272,296,360`) instead of `chat-conversation-sort.ts:compareByRecentActivity`.
- **A6-11 Medium — Query-level queue filter legacy-`status`-only** while row-level helpers support `queue_state` (`queue-status.ts:229-255` vs `:117-205`).
- **A6-12 Medium — Multiple "next contact" pickers** across layers; `dialer.action.server.ts:21` aliases `getNextAutoDialQueueContact as getNextContact` (misleading).

### A7 — Utils/types/UI/hooks (cluster score 6/10)

- **A7-1 Critical — `type-utils.ts` vs `type-safety-utils.ts`**: ~12 duplicated exports, silently divergent (`deepClone` drops `Date`s in one, `createAppError` different arity, `safeJsonParse` validates vs blind-casts). Fold into `type-safety-utils.ts`.
- **A7-2 High — `isObject`/`isRecord` defined 3×** (`type-safety-utils.ts:64`, `type-utils.ts:26`, `parse-utils.server.ts:1`).
- **A7-3 High — `safeJsonParse` 4× with divergent failure modes** (`errors.server.ts:240`, `type-safety-utils.ts:109`, `type-utils.ts:63`, `parse-utils.server.ts:9`).
- **A7-4 Critical — `AppError` shape 3× with incompatible shapes**: class (`errors.server.ts:54`) vs interface (`type-safety-utils.ts:12`) vs factory (`type-utils.ts:73`); plus `ClientError` ≈ `ErrorResponse`.
- **A7-5 High — `logger.server.ts` and `logger.client.ts` 95% copy-paste**; extract `logger-core.ts`.
- **A7-6 Medium — `ErrorResponse` vs `ClientError` same shape** (only `statusCode` optionality differs).
- **A7-7 High — `utils.ts` 637-line grab-bag** mixing 7 concerns; duplicates `csv.ts`, `utils/phone.ts` (`isPhoneNumber` vs `isValidPhoneNumber` different regexes; `parsePhoneNumber` returns null vs `normalizePhoneNumber` throws), `queue-status.ts`, `campaign-export-helpers.server.ts`.
- **A7-8 Critical — Three form-validation systems; two dead**: `form-validation.ts` (`ValidationRule`+`FormValidator`+`FormBuilder`+`useFormValidation` zero callers), `hooks/useForm.ts` (zero direct importers), `type-safety-utils.ts:168` (third `ValidationRule`).
- **A7-9 Medium — DTMF keypad keys 3-4×** with 2 types (string vs number): `softphone-constants.ts:1`, `CallScreen.DTMFPhone.tsx:11`, `useCallScreen.ts:292`.
- **A7-10 High — `formatTime` duplicated with divergent units (silent bug)**: `utils.ts:448` (param `milliseconds`, divides by 3600) vs `CallScreen.DTMFPhone.tsx:19` (param `seconds`, divides by 60). `useCallState.ts:117` increments seconds → 30s call renders as `00:00:00`.
- **A7-11 High — `useCallState` (FSM) + `useCallHandling` (string) parallel call-state machines** in same composition hook; `call-status.ts:getStateMachineAction` bypassed.
- **A7-12 Medium — `useCallStatusPolling` forwards raw provider status** skipping `normalizeProviderStatus` (`call-status.ts:23`).
- **A7-13 High — Queue status literals hardcoded in components** (`StatusDropdown.tsx:1`, `QueueTable.tsx:28` — the latter despite already importing `QUEUE_STATUS_FILTERS`).
- **A7-14 Critical — Script UI scattered across 4 locations; multiple dead copies**: live `campaign/settings/script/CampaignSettings.Script.*` + `question/QuestionCard.ResponseTable.EditModal.tsx`; dead 5 flat-root QuestionCard/CampaignSettings.Script files + 6 `app/components/script/` files.
- **A7-15 High — `app/contexts/` 1-byte dead stubs** (`CampaignContext.tsx`, `WorkspaceContext.tsx`).
- **A7-16 Medium — `WebhookEvent` redefined locally** dropping `DELETE` (`WebhookEditor.tsx:18` vs `twilio.types.ts:72`).
- **A7-17 High — `call-list/` legacy UI leaked into modern `call/` + `script/`** (inline styles + raw HTML, not `ui/`).
- **A7-18 Medium — Raw HTML form controls/tables** in script & queue UI bypass `ui/` primitives (violates AGENTS.md design system).
- **A7-19 Medium — `createErrorResponse` name collision** + third error-response path (`errors.server.ts:78` vs `type-utils.ts:94` vs `platform-api.server.ts:jsonError`).
- **A7-20 High — Dead `app/components/forms/`** (3 files, zero external importers).
- **A7-21 Low — `shared/CustomCard.tsx` 7-line re-export shim** of `BrandedCard`.

---

## Open questions for product/eng decision

1. **Credits-sync owner (Slice 3).** Keep the Postgres trigger and fix the docs, or implement the documented app-layer Drizzle/Postgres tx and drop the trigger? Currently **deferred** — flagged here for resolution before Slice 3 ships.
