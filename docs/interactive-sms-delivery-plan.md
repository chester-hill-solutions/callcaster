# Interactive SMS/MMS Campaigns — Delivery Plan

> **Status:** Plan of record (implementation not yet started)
> **Branch:** `feat/interactive-sms`
> **Owners:** PM + EM
> **Last updated:** 2026-08-15

This is the single planning artifact for interactive SMS/MMS campaigns in CallCaster,
synthesized from product/domain decisions (grilled) and engineering analysis. It is
the reference for all build orchestration. Voice and legacy runtime migration are
**out of scope** for release one.

---

# Part A — PM Plan

## A.1 Charter

Enable workspaces to design, publish, launch, operate, hand off, and measure
multi-step SMS interactions in which each targeted Contact executes a pinned Script
Revision through a durable Campaign Run. Release one supports production-grade
SMS and outbound MMS, deterministic behavior, consent safety, auditable outcomes,
predictable credits, and human intervention.

**First-release exclusions:** voice execution on v2; migration of legacy voice/IVR
scripts or runtime; inbound MMS interpretation; multilingual intent (English only);
open-ended agentic actions; unbounded loops; automatic resumption after handoff.

## A.2 Locked decisions (do not reopen)

| Area | Decision |
|---|---|
| Script model | `ScriptDocument v2` in a new `scriptkit-interaction-core` package. |
| Compatibility | v1 requires explicit conversion; no silent conversion. |
| Lifecycle | Script = stable/draft identity; monolithic immutable Script Revisions. |
| Operations | `send`, `collect`, `action`, `wait(timer)`, `handoff`, `complete`. |
| Graph | Typed transitions; bounded cycles only. |
| Authoring groups | Authoring-only, never runtime operations. |
| Channels | Inline per-channel overrides; strict publish validation. |
| Campaign | Reusable configuration. |
| Campaign Run | First-class immutable snapshot; universal model, phased adoption. |
| Queue | Run owns snapshotted Queue Entries; pins revision/settings/budget. |
| Interaction | Created at dispatch; one Contact executes one revision. |
| Shared phones | Target Contact receives outcomes even when phone shared. |
| Endpoint concurrency | One active Interaction per concrete sender+recipient; pool reservation. |
| STOP | Inbound STOP terminates all applicable Contact Interactions workspace-wide. |
| START | Eligibility restored only by recipient START. |
| Consent | Recipient-level Messaging Consent ledger required before dispatch. |
| Disclosure | Initial opt-out disclosure tracked per Workspace–recipient; sender identity in every Run opener; jurisdiction authorization required. |
| MMS | Outbound only. |
| Intent | Deterministic match first, then a small intent model. |
| Language | English first. |
| Ambiguity | One clarification, then handoff. |
| Sensitive actions | Require exact intent + confirmation + human approval. |
| Handoff | Existing inbox; pauses automation; explicit resume at cursor. |
| Manual sends | Manual outbound auto-pauses automation. |
| Windows | Automated replies obey windows. |
| Collection | Each `collect` has a timeout. |
| Unexpected input | Retained; threshold/escalation ends in handoff. |
| Credits | Continuation credits reserved at Run launch. |
| Actions | Controlled, allow-listed domain actions. |
| Runtime authority | Authoritative state machine + immutable event audit. |
| Surfaces | Full API, visual editor/simulator, full-funnel analytics. |

## A.3 Users / JTBD

- **Compliance admin** — prove eligibility, authorization, bounded cost, and that risky
  actions cannot execute without approval; export audit/consent; kill switch.
- **Campaign manager** — create reusable interaction, simulate all paths, launch to a
  defined audience, understand where recipients end up.
- **Content author** — express branching conversational logic without knowing the runtime.
- **Inbox operator** — see why automation handed off, what it did, and safely take over/resume.
- **Analyst/supervisor** — funnel, outcome, and cost reporting.
- **API integrator** — same lifecycle via API, durable events, reconciliation.
- **Recipient** — clear sender identity, respected choices/time, simple replies understood,
  human connection when automation cannot help.

## A.4 Success metrics

**North-star:** qualified interaction completion rate
`Interactions reaching a valid complete outcome ÷ eligible dispatched Interactions`.

**Funnel:** targeted → eligible → reserved → opener attempted → opener delivered →
replied → first collect resolved → clarified → handoff → handoff resolved →
action approved/executed → completed with outcome.

**Conversation quality:** delivered-to-response; deterministic-match; model-fallback;
clarification rate & recovery; unexpected-rate; handoff rate; timeout rate; automated vs
assisted completion; median messages & elapsed time.

**Compliance targets:** post-STOP sends = 0; ineligible dispatch = 0; sensitive actions
without all three safeguards = 0; sends outside enforced windows = 0; manual sends that
failed to pause = 0.

**Economics:** duplicate opener/effect sends; reservation conflict rate; stuck timers;
credits reserved/consumed/released; credit per delivered/responded/completed/outcome;
handoff queue age/SLA.

## A.5 Delivery phases (PM milestones)

0. **Definition & governance** — PRD, decision register, glossary, policy matrix,
   sensitive-action registry, metric dictionary, beta segmentation.
1. **Core contracts & prototypes** — v2 package contract, v1 conversion spec, publish
   validator rules, Run/Interaction resource contracts, state machine + event schemas.
2. **Authoring & simulation slice** — script library, draft/revision lifecycle, typed
   editor, publication, simulator covering all paths.
3. **Run & dispatch slice** — reusable Campaign, immutable Run snapshot, Run queue,
   endpoint reservation, Interaction creation, deterministic execution, credit reserve,
   STOP/START + consent ledger, provider idempotency + audit.
4. **Intent, handoff, actions** — deterministic matcher, constrained model fallback,
   one-clarification, inbox integration + auto-pause + explicit resume, action registry,
   sensitive-action approval.
5. **API, analytics, operations** — full API + webhooks, dashboard + funnel, exports,
   reconciliation, alerts, kill switches, runbooks.
6. **Alpha / beta / GA** — internal alpha → design-partner beta (deterministic only) →
   beta 2 (+model/MMS/API) → GA.

## A.6 Launch segmentation

- **Alpha:** staff workspaces, synthetic/consenting recipients, deterministic intent only,
  no sensitive actions, low concurrency, daily reconciliation.
- **Beta 1:** allow-listed customers with approved messaging setup, clear consent,
  simple English scripts, single sender, low-risk collection, monitored handoffs.
- **Beta 2:** + model fallback, sender pools, outbound MMS, controlled non-sensitive actions,
  API integrations.
- **GA:** published policy/AUP, self-service readiness, validated SLOs, stable APIs,
  real funnels + billing reconciliation, ≥2 successful beta cohorts, no unresolved P0/P1,
  explicit owner sign-off.

## A.7 Principal risks

| Risk | Mitigation |
|---|---|
| STOP race with queued reply | Priority consent command, transactional suppression, cancel timers, race tests + alerts. |
| Shared phone wrong attribution | Endpoint reservation preserves target Contact. |
| Model unsafe transition | Constrain candidates to authored transitions; precision threshold; sensitive actions exact-only. |
| Mutable config corrupts history | Immutable Revisions/Runs with hashes + copied settings. |
| Credit exhaustion mid-interaction | Reserve continuation credits; pause before send; release unused reserve. |
| Human/automation both reply | Manual send atomically pauses; explicit resume only. |
| Timer sends during quiet hours | Timer wakes state machine; outbound rechecks windows and defers. |
| Unexpected replies create loops | Bounded cycles, unexpected counter, one clarification, threshold handoff. |
| Event/state divergence | Single command path, state versioning, reconciliation + repair tooling. |

---

# Part B — EM Technical Plan

## B.1 Architecture

**Runtime:** Bun web + worker (ADR-0001). Reuse generalized job infra (ADR-0007).
**State:** authoritative transactional state machine + append-only semantic events, not
full event sourcing. Pure reducer:

```
state' = reduce(state, event, revision) -> { nextState, effects[] }
```

Effects carry stable IDs and durable acknowledgements; executors never write state.
Provider acceptance completes a `send`; later delivery failures are typed events, never
implicit retries.

**Transaction boundary (every accepted input):**
1. lock Interaction by id/version → 2. dedupe source event → 3. append semantic event →
4. pure reducer → 5. update projected state + version → 6. insert deterministic effects →
7. commit. No provider/model/storage/webhook calls inside the transaction.
Use Drizzle CRUD; narrow PL/pgSQL only for queue claim + credit reservation (ADR-0003).
No triggers/DB-side behavior (ADR-0006).

## B.2 Package boundaries

- **`scriptkit-interaction-core` (v2):** provider/framework-neutral schemas, `convertV1ToV2`,
  strict publish validator, pure reducer, stable effect-ID, exact classifier, model-classifier
  contract, consensus/disclosure requirements, simulator engine, deterministic fixtures.
  Vendored under `vendor/scriptkit/` until semver stabilizes. **No** Twilio/Drizzle/React/logging/env.
- **Existing `scriptkit-call-script-*`:** unchanged, stays v1 voice/IVR.
- **CallCaster app:** persistence/repos, Runs + Interaction orchestration, consent + billing
  policy, Twilio adapters/webhooks, model adapter, OpenAPI/SDK, editor, inbox, analytics.
  All new tables registered in `workspace-scoped-tables.ts` (ADR-0004); routes use `createTenantDb`.

## B.3 Data model

| Entity | Invariants |
|---|---|
| `script_revision` | Domain ID, workspace, script id, schema version, immutable JSON + checksum, conversion diagnostics. Never updates. |
| `campaign_run` | Campaign, channel, phase, immutable revision, policy/disclosure version, lifecycle, schedule, counters. |
| `campaign_queue.run_id` | Uniqueness `(run_id, contact_id)` for new SMS runs. |
| `interaction` | Workspace/run/contact, endpoint, state JSON + version, status, handoff state, last activity. |
| `interaction_event` | Append-only, sequence, source id, typed payload, actor + timestamp, unique source key. |
| `interaction_effect` | Stable effect id, type, payload, status, attempts, ack, provider correlation, reservation id, lease. |
| `interaction_endpoint` | Channel + normalized sender/recipient pair, active state, unique active correlation. |
| `recipient_consent_event` | Append-only grant/revoke/opt-out/import evidence, purpose, channel, source, disclosure version, actor. |
| `recipient_consent` | Maintained projection (no trigger). |
| `credit_reservation` | Workspace, interaction/effect, estimate, state, expiry, settlement, idempotency key. |
| `message` additions | Local domain id, nullable `twilio_sid`, `interaction_id`, `interaction_effect_id`. |

## B.4 Migration strategy

1. Expand (additive tables/columns/indexes/RPCs).
2. Backfill Revisions via explicit v1 conversion; preserve original checksum + warnings.
3. Backfill message identity (domain ids; keep SID in serializers).
4. Freeze a legacy Run only when an existing message campaign first enters consolidated dispatcher.
5. Attach eligible existing SMS queue rows to the legacy Run.
6. Dual-read compatibility; old APIs keep reading existing fields.
7. Only after beta stability: require `run_id` for new SMS queues, remove obsolete dispatch code.

**Prerequisite migrations/packages:** message domain-id PK (ADR-0015 SMS portion),
normalized Twilio attribution (ADR-0011), `campaign_queue.run_id` uniqueness,
typed feature flags. All migrations wired into production + compose bootstrap + ledger.

## B.5 Reducer, effects, idempotency, workers

**Effect ID:** `interaction_id + causation_event_id + effect_ordinal + effect_type + revision_checksum`,
guarded by a unique constraint. States `pending → claimed → attempted → accepted`
(± retryable_failed / ambiguous / terminal_failed). "Accepted" = Twilio accepted
`messages.create`.

**Provider crash gap (no Twilio app idempotency key):** create local message/effect row
before calling Twilio; put effect id in the status callback URL; never blindly retry an
`attempted` send with unknown outcome — mark `ambiguous`, resolve via callback/reconcile/
operated action; alert on aged ambiguous effects.

**Classification:** normalize → deterministic match → (if permitted) `classify_with_model`
effect → worker calls provider-neutral adapter → typed `classification_resolved`/`failed`
event → reducer decides. The model never writes state or effects.

## B.6 Twilio webhooks

Extend signature-only Bun routes (ADR-0009). Inbound correlation order: workspace by
`To`/Messaging Service → provider/effect correlation → active `interaction_endpoint` →
exactly one → append event; zero → general inbox; multiple → fail-closed automation,
route to inbox review. STOP writes consent-revoked, updates projection, suppresses
pending sends, dequeues future work in one transaction; retain `contact.opt_out` as a
compatibility projection during rollout.

## B.7 Billing reservation

Reserve exact estimated credits (segment/MMS from shared/pricing.ts) via atomic RPC
before send. Available = `workspace.credits - active reservations`. Settlement on provider
acceptance; terminal callback reconciles actual segments; cancelled/orphaned release holds;
late delivery failure follows existing billable policy. Reconciliation jobs for expired/
orphaned/double-settled/negative-available reservations.

## B.8 Consent & disclosures — strict publish must require

Sender identity; initial disclosure + opt-out; purpose/phase; expected automated frequency;
locale + policy version; valid fallback/handoff; consent policy per outbound transition;
reachable terminals; no unbounded loops; valid MMS/merge tags/choices/model policy.
Consent record types: import evidence, explicit opt-in, inbound START, administrative
override, STOP/revocation — with evidence refs + policy versions. CallCaster provides
controls + evidence, not a legal-compliance guarantee.

## B.9 API-first

Add schemas in `app/lib/schemas/api/`, entries in `api-surface.ts`, export OpenAPI via
`openapi.ts`, generate SDK (opens in ADR-0014/0018). Proposed surface: script/revision CRUD/
conversion/publish; Run CRUD/lifecycle; Run queue preview/enroll/status; Interaction
list/get/events; simulator sessions; handoff/claim/release/manual reply; analytics; consent.
Additive + role-gated, granular API-key capabilities, idempotency keys, stable error codes.

## B.10 Editor / simulator / inbox / analytics

- **Editor:** separate v2 editor alongside current script editor; message/MMS nodes, exact
  choices, model fallback, timers, branching, disclosures, handoff, terminal outcomes;
  revision compare; strict validation panel; explicit Publish.
- **Simulator:** same core reducer in-memory; synthetic context; mocked model; time advance;
  effect transcript; credit estimates; no Twilio/test write.
- **Inbox handoff:** extend existing chats surface; on `handoff_requested` suspend effects,
  show Run/revision/path/classification/consent/SLA; atomic claim/release; manual replies
  via shared effect executor; resume only via revision-defined handback event.
- **Analytics:** event-derived funnel; do not overload current status-only campaign stats.

## B.11 Observability / security / privacy

Correlate request_id + workspace + run + interaction + event + effect + job + message id +
Twilio SID. Never log bodies, prompts, media URLs, consent evidence, credentials. Metrics for
queue lag, effect age, reservation age, correlation failure, ambiguous sends, model latency/
error, late delivery failure. Reuse Sentry/ops, redaction, SSE for UI freshness (semantic events
stay durable). Retention for bodies/MMS/classifier inputs/consent evidence; tenant-safe deletion
workers preserve audit proof. Validate MMS MIME/size/ownership/signed retrieval. Uniform 404 /
role 403.

## B.12 Test strategy

- Core: v1→v2 golden fixtures; publish validation; reducer determinism/property; effect-id
  stability; classifier; loop/reachability; simulator parity.
- Persistence/concurrency: tenant registry; optimistic conflict; event dedupe; effect unique
  insert + lease; queue claim; reservation affordability/settle/expiry/reconcile.
- Twilio: signature; correlation; duplicate callbacks; STOP/START; MMS; late failure;
  crash-after-provider ambiguity.
- API/UI/E2E: OpenAPI conformance + SDK smoke; publish permissions; Run lifecycle + flag
  denial; editor revision history; simulator deterministic paths; inbox claim race; analytics
  reconciliation; legacy `/api/sms` compat.
- Release gate: `npm run ci:local` + Postgres/MinIO E2E.

## B.13 Sequencing / milestones / exit criteria

**Phase A — Prerequisites & consolidation (wk 1–4):**
ratify v2 contracts + API surface; message domain identity; normalize inbound attribution;
single dispatch coordinator (**prerequisite: unify the two divergent campaign SMS dispatch
paths** — legacy `/api/sms` vs worker); credit reservation RPC; consent/disclosure policy +
retention; feature flags + observability. Exit: both dispatch adapters pass one contract suite;
no policy divergence; local messages before SID; reservation concurrency tests pass; legacy API
compat.

**Phase B — Vertical slice (wk 5–9):**
v2 core, explicit conversion, publish validation; Revisions/Runs/Run queue; Interaction/event/
effect persistence; opener → reply → exact classify → follow-up; endpoint correlation +
acceptance semantics; basic editor/simulator/Run API/funnel. Exit: one flagged workspace authors,
publishes, launches, completes an exact-classifier SMS/MMS interaction; no duplicate effects/
billing; late failure visible without resend; STOP suppresses pending automation; simulator
matches production.

**Phase C — Beta hardening (wk 10–14):**
model adapter + fallback; inbox handoff/claim/manual; full analytics/audit/retention/reconcile/
ops tooling; load + failure injection; MMS hardening; SDK/docs/migration tooling. Exit: no
Sev-1/2 integrity defect in 2-week soak; ledger reconciliation exact; ambiguity/stuck workflows;
SLOs met; security/privacy review + compliance copy approved; rollback proven.

**Phase D — Follow-on migration:** migrate eligible message campaigns to v2 after explicit
review; deprecate legacy `/api/sms` orchestration (compat adapter); remove obsolete campaign-level
queue assumptions; voice/IVR adoption as a separate project.

## B.14 Staffing

Architecture/core (TL, 1); persistence/queue/billing (2 senior BE); Twilio/webhooks/workers
(1 senior BE shared); editor/simulator (1 senior FE); inbox/analytics (1 full-stack);
OpenAPI/SDK/integration (0.5–1); SDET (1); security/privacy/SRE and consent policy (part-time).
Effective team ~6–7 engineers + SDET. Below 4 engineers, run model, handoff, and advanced
analytics sequentially.

## B.15 Critical path

1. Core v2 event/effect contract.
2. Message identity + dispatch consolidation.
3. Credit reservation + Run-owned queue schema.
4. Interaction transaction/outbox.
5. Twilio acceptance + inbound correlation.
6. Strict publish + editor.
7. Inbox/model/analytics hardening.

Do not commit to beta until dispatch consolidation, message identity, and reservation
semantics are complete — those are the integrity risks, not the editor.

---

# Decision register (validation items — optimize, don't re-litigate)

- Default `collect` timeouts / timer presets.
- Unexpected-message threshold defaults.
- Confidence thresholds + acceptable false-positive rate.
- Exact-match normalization/alias scope (case, whitespace, numeric, regex).
- Sensitive-action catalog + approval roles.
- Jurisdiction authorization evidence + disclosure wording (counsel-approved).
- Handoff queue triage, ownership, response SLA.
- Resume UX + operator context.
- Budget reserve formula + low-credit warnings.
- Beta segments for model-assisted intent.
- Retention/export requirements for content, model inputs, events, media.
- Pricing/packaging; held vs spent credits presentation.
- Whether `action` catalog is closed or extensible (locked: closed core, extensible action catalog).
- Full event sourcing vs audited state machine (locked: audited state machine).
- Keyword handling: exact-only for launch (locked: deterministic first, model fallback).
