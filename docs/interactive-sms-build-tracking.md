# Interactive SMS/MMS — Build Orchestration & Tracking

> **Branch:** `feat/interactive-sms` (worktree `../callcaster-interactive-sms`)
> **Plan of record:** `docs/interactive-sms-delivery-plan.md`
> **Tracker:** GitHub issues under `chester-hill-solutions/callcaster`
> **Epic:** replaces/augments this doc once created (create Epic issue named
> *"Interactive SMS/MMS campaigns — release one"*, type `Epic`).

This file is the working surface for the EM+PM team during build. It mirrors the
phases in the plan and tracks each work item's issue number, owner, and exit gate.
Engineering-default decisions that require no product re-litigation are recorded here so
implementers don't reopen them.

---

## Validated engineering defaults (do not re-open)

These were settled during planning and are directionally safe. Flag only if a new fact
(provider/policy/scale) contradicts them.

- **State authority:** audited transactional state machine, not full event sourcing.
- **`send` completion:** provider acceptance (Twilio returns SID). Late delivery failure → typed
  event + pause/handoff unless a Script delivery-failure transition exists; never silent resend.
- **Ambiguous provider outcome:** mark effect `ambiguous`, resolve via callback/operator; alert on aged.
- **Duplicate/race ordering:** per-Interaction serialization with optimistic versioning; commit order wins
  at a timeout boundary.
- **Quiet window:** reply → state advances, outbound effect scheduled (deferred, not pre-answered).
- **Unexpected input:** retained; non-advancing; platform escalation keywords + script aliases;
  threshold (configurable) then handoff.
- **Classifier contract:** provider-neutral; exact match first; model fallback gated per Script;
  constrained to authored candidate transitions; model never writes state/effects; sensitive actions
  exact + confirmation + human approval only.
- **Consent:** recipient ledger authoritative; `contact.opt_out` compatibility projection during rollout.
- **Shared phone:** endpoint correlation + preserved target Contact from Queue Entry.
- **Model selection:** compare hosted vs self-hosted small English model on a de-identified corpus;
  Command R7B / Command A benchmark candidates; exact-only beta needs no model.
- **Template language:** unify on a single canonical syntax (decide ScriptKit `{{key}}` vs SMS
  `{key|fallback}`; ship a compatibility layer if both inbound).
- **API:** additive, role-gated, idempotency keys, doc-first OpenAPI + generated SDK; legacy `/api/sms`
  compatibility adapter retained.

---

## Milestone board

| Milestone | Work | Exit gate | Owner | Issues |
|---|---|---|---|---|
| **A. Prerequisites & consolidation** | ratify v2 contracts; message domain ID; inbound attribution; single dispatch coordinator (unify `/api/sms` + worker); credit reservation RPC; consent/disclosure+retention policy; feature flags+observability | both SMS dispatch adapters pass one contract suite; no policy divergence; local messages before SID; reservation concurrency tests pass; legacy API compat | EM | — |
| **B. Vertical slice** | v2 core, conversion, publish validator; Revisions/Runs/Run queue; Interaction/event/effect persistence; opener→reply→exact→followup; endpoint correlation; editor/simulator/Run API/funnel | one flagged workspace authors/publishes/launches/completes exact-classifier SMS/MMS; no duplicate effects/billing; late failure visible; STOP suppresses; simulator==production | EM | — |
| **C. Beta hardening** | model adapter; inbox handoff; full analytics/audit/ops; load+failure injection; MMS; SDK/docs/migration | no Sev-1/2 in 2-wk soak; ledger exact; SLOs; security/privacy+compliance copy; rollback proven | PM+EM | — |
| **D. Follow-on migration** | migrate eligible message campaigns to v2; deprecate legacy `/api/sms` orchestration; remove obsolete queue assumptions | cloud: beta-stable then migrate; voice/IVR as separate project | PM | — |

---

## Orphaned prerequisite (must land before Phase B runtime)

- **Consolidate the two campaign SMS dispatch paths.** Today [legacy `/api/sms`]
  (`app/routes/api+/sms.action.server.ts`) enforces windows, quiet hours, opt-out, line type, duplicates,
  templates, media, sender, throughput; the Bun worker (`app/lib/worker/handlers/campaign.server.ts`)
  omits most of these. Build one dispatch coordinator used by both; keep the legacy endpoint backward
  compatible (ADR-0018). This is the primary integrity risk and gates beta.
- **Complete message domain-id PK** (ADR-0015 SMS portion): local domain id + nullable indexed
  `twilio_sid`, rows created before provider dispatch.
- **Normalize inbound Twilio attribution** (ADR-0011) off `workspace.twilio_data` JSON.
- **`campaign_queue.run_id`** + uniqueness `(run_id, contact_id)`.

---

## Process conventions

- Every work item gets a GitHub issue under the Epic: type `Task`/`User Story`/`Bug`; use native
  parent/child + `blocked-by` edges (see `.agents/skills/github-issues`).
- Pre-PR gate: `npm run ci:local`; + Postgres/MinIO E2E. Structural guards + codegen drift mandatory.
- New tables → register in `app/db/workspace-scoped-tables.ts`; routes use `createTenantDb` (ADR-0004).
- No triggers/DB behavior (ADR-0006); narrow PL/pgSQL only for claim + reservation (ADR-0003).
- Migrations wired into production + compose bootstrap + migration ledger.
- Mark issue + this board together when a milestone gate passes. Update `## Validated` only with new facts.
