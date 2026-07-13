# CallCaster Critical Review — Orchestration Plan

**Date:** 2026-07-12  
**Prepared from:** static whole-codebase review on the then-current `chore/effects-strictness` snapshot plus its working tree  
**Execution mode:** `/orchestrator`  
**Status:** Wave 0 complete (2026-07-13) — artifacts in [`wave0-index-2026-07-13.md`](./wave0-index-2026-07-13.md); Gate W0 partially met pending CHS extension approval and live ledger compare

## 1. Commander's intent

Make CallCaster safe to operate as a multi-tenant, prepaid contact-center platform by closing exploitable trust-boundary gaps first, then making telephony, billing, and background work recoverable and exactly-once where the domain requires it.

Why this matters:

- Current code can expose or overwrite tenant Twilio credentials.
- Unauthenticated routes can initiate or disrupt calls.
- Several queue and invitation mutations are not bound to the authenticated tenant or user.
- Money jobs are scheduled with inputs their handlers reject.
- External side effects can succeed before durable state exists.
- Existing architectural controls are strong but optional at legacy call sites.

## 2. Key results

The orchestrator should not declare this plan complete until all five results are met:

1. **Boundary enforcement:** every tenant mutation derives or verifies workspace ownership; no application response exposes provider credentials; every provider callback or call-control endpoint has an explicit, tested trust mechanism.
2. **Recoverable external effects:** a crash or database error cannot produce an untracked call, silently duplicated SMS, lost export, or permanently processing upload; ambiguous provider outcomes are quarantined rather than blindly retried.
3. **Money integrity:** recurring rental and reconciliation work runs for every eligible workspace, catches up after downtime, and produces unit-correct, idempotent results.
4. **Journey integrity:** public survey completion is durable and validated; role capabilities, pricing, and primary agent surfaces are consistent across navigation and server enforcement.
5. **Assurance:** hosted CI exercises all runtime TypeScript surfaces and enforces the structural, effects, type-safety, migration, and coverage invariants this plan relies on.

## 3. Baseline and constraints

### Audit snapshot and current repository state

Refreshed for handoff on 2026-07-13:

- Branch: `chore/effects-strictness`
- HEAD: `5e8716a6`
- Working tree: 139 changed/untracked paths, dominated by the in-progress `defineAction`/`defineLoader` handler-strictness migration across route modules, associated tests, and new `app/lib/ivr-webhook-auth.server.ts`.

These are user-owned in-flight changes, not remediation output. Boundary work must extend `app/lib/handler.server.ts`, the handler checks, and the new IVR signature helper rather than adding parallel route preambles. The orchestrator must re-run `git status` before implementation and must not overwrite, reset, or accidentally fold unrelated user changes into remediation work.

This is an audit snapshot, not an assertion about the later execution state. Wave 0 must replace it with:

- current branch and HEAD;
- merge-base against the intended integration branch;
- tracked, staged, and untracked changes;
- which changes belong to the user versus the remediation effort;
- baseline generated-file differences.

`docs/migration-delivery-board.md` describes work on `feat/supabase-postgres-migration`, while this handoff is on `chore/effects-strictness`. Before remediation, establish the intended integration branch and reconcile those histories without resetting either working tree. Do not treat delivery-board “Done” claims as present on the current branch until verified in the chosen integration base.

Do not run a command ending in `git diff --exit-code` against a knowingly dirty shared tree and interpret the expected user diff as a quality failure. Run the constituent checks, compare generated differences with the captured baseline, or use an isolated worktree after the remediation changes have a committed branch. Never stash, reset, commit, or discard the user's existing work without explicit authorization.

### Repository invariants

All agents must read `AGENTS.md` and `docs/AGENT-PLATFORM-GUIDE.md` before editing. In particular:

- Tenant route code uses `createTenantDb(workspaceId)`.
- Non-members receive a uniform 404; insufficient member roles receive 403.
- Credit writes go through `insertTransactionHistoryIdempotent` and the ledger RPC.
- Debit signs come from `debitAmountFromCredits`.
- Billing keys come from `shared/billing-keys.ts`.
- Twilio webhooks validate `X-Twilio-Signature`; session auth is not a substitute.
- New auth/session/router glue should use a CHS package where one already fits.
- **Decision (2026-07-12):** extend the CHS auth suite rather than implementing parallel CallCaster-only authz/invite infrastructure:
  - `@chester-hill-solutions/auth` owns framework/database-neutral authorization actor and capability contracts plus email/token primitives.
  - `@chester-hill-solutions/auth-postgres` owns Postgres workspace feature authorization and email-first invitation persistence/redemption primitives.
  - `@chester-hill-solutions/auth-react-router` owns session/verified-email and invite-completion route adapters.
  - CallCaster retains product capability IDs, workspace API-key rows/lifecycle, and the adapter that presents a scoped key as an authorization actor.
- Authorization uses stable, deny-by-default capability IDs. Session users resolve capabilities through CHS `auth-postgres` workspace role/feature permissions; CallCaster workspace API keys store an explicit allowlist of the same capability IDs. API-key storage and lifecycle remain product-specific to CallCaster.
- Before implementing worker or scheduler infrastructure, inspect `@chester-hill-solutions/jobqueue`; the platform guide identifies it as the intended Phase 3 replacement. Record whether it is installable and sufficient before approving bespoke job primitives.
- **Decision (2026-07-12):** extend and publish `@chester-hill-solutions/jobqueue` as the canonical worker foundation before CallCaster replaces its local poller. The package must gain claim-token fencing, lease heartbeat/extension, scheduled execution, idempotency keys, retry/dead-letter metadata, and a consumer-defined typed job registry.
- This intentionally supersedes ADR-0007's proposed `@chester-hill-solutions/job-worker` name and HTTP-wake/self-catch-up scheduler details. Update ADR-0007 before implementation so the accepted package name and durable schedule-definition model are unambiguous.
- Do not modify `.env`.
- Do not rename already-applied migrations without first inspecting deployed migration ledgers.
- Use top-level imports and exhaustive TypeScript switches.

### Static-review limitations

The findings were verified against source, tests, migrations, and configuration, but the review did not inspect:

- deployed Railway migration ledgers;
- production cron rows or worker deployment;
- Twilio callback configuration;
- Stripe event history;
- live balances or transaction ledgers;
- browser accessibility behavior;
- actual test/build results after the current working-tree changes.

Every implementation agent must re-verify its finding immediately before editing.

### Cutover context

As clarified on 2026-07-12, no customers are running on the Railway/Postgres target yet; customers remain on the Supabase production system. The canonical authz/membership schema is part of the Supabase-to-Postgres cutover, so CallCaster does not need a long-lived dual-schema compatibility period on the target.

Consequences:

- Change the target Postgres schema atomically before customer cutover.
- Promote the Railway review Postgres/database shape that passed staging, applying only the rehearsed final Supabase data delta; do not construct an untested production schema independently.
- Update the Supabase export/import transform to write canonical CHS membership, role, feature, permission, and invitation structures directly.
- Preserve each Supabase auth user UUID as the Better Auth/public user UUID and remap membership/profile foreign keys without generating replacement identities.
- Validate conversion against production-shaped dumps and review-environment rehearsals.
- Do not add dual writes or a permanent `workspace_users` compatibility adapter solely for an unused target schema.
- Target schema replacement itself causes no customer downtime because Railway/Postgres is not serving customers.
- The later customer cutover uses the already-planned one-shot maintenance/read-only window: pause Supabase writes, export/import the final delta, run count/parity and smoke checks, then move traffic. A failed gate resumes the unchanged Supabase source; it does not attempt to run mixed app/schema versions.
- The traffic switch is the data-authority point of no return. Before it, any failed gate resumes Supabase. After the first accepted Postgres write, recovery is roll-forward or Postgres PITR/restore; Supabase remains a read-only retained snapshot and is never made writable again without an explicit reverse-migration project.
- Retain the frozen Supabase source read-only for 90 days with least-privilege access and access logging. Disable app/provider/cron writes at cutover; after reconciliation and owner sign-off, export legally required audit records and destroy the Supabase project/data according to the runbook.
- The 90-day read-only retention and post-switch Postgres-authority decisions supersede the 24-hour/fallback wording in `docs/supabase-postgres-migration-plan.md` and historical ADR-0008; update those documents in the same cutover-plan PR.
- The atomic target-schema setup is a pre-customer exception. After cutover, ordinary changes use expand → backfill/migrate → switch readers/writers → contract across releases. App and worker rolling deployments support the previous schema/payload version until old instances and queued jobs are drained.
- Before the final export, stop new campaign/call/message/export dispatch and pause schedulers. Drain voice to zero active calls within the cutover window; if it does not drain, abort/postpone rather than terminating customers unexpectedly.
- Import unresolved messages by provider SID, queued campaign/contact state, job/schedule definitions, and resumable export/upload checkpoints. Repoint Twilio/provider callbacks, then run canonical open-sync/reconciliation before reopening dispatch. Deterministic idempotency/occurrence keys prevent re-enqueue duplication.
- Do not import Supabase sessions, transient presence, stale leases, or already-derived caches; rebuild those on Postgres.
- Treat this as a coordinated low-traffic migration (currently roughly one active user), not an enterprise rollout ceremony. Name one accountable cutover owner, run the automated/parity checklist, record the UTC go/no-go decision, and target a maintenance window under two hours.
- Coordinate the window directly with the active user and confirm completion/re-login afterward. A full status-page campaign, seven-day notice sequence, or multi-party approval ceremony is not required at the current scale.

### Delivery split: cutover versus follow-up

Do not make the low-traffic Postgres migration wait for every improvement in this document.

**Cutover blockers — fix, prove, or deliberately disable**

- Wave 0 repository/deployment evidence, Drizzle target baseline, transformed data-import rehearsal, and parity checks.
- Canonical CHS auth/membership adoption, session invalidation, MFA re-enrollment, and the Critical/High tenant/auth boundaries in SEC-01 through SEC-08 and DATA-01.
- Minimal redacted audit events for privileged cutover-era mutations; tamper anchoring and full export UX may follow.
- Telephony, SMS, campaign, worker, scheduler, and billing paths that the active user actually needs: CHS jobqueue fencing plus the relevant TEL/BILL/ASYNC items. Any unfinished path must be disabled rather than exposed in a known-unsafe state.
- SURVEY-01 if public surveys remain enabled; otherwise disable public survey submission until repaired. Preserve the migration gate that publishes/adopts `scriptkit-survey-core` and `scriptkit-survey-react`; respondent security must extend those package/domain seams rather than entrenching another standalone survey engine.
- Production build/typecheck, focused security/money/telephony tests, route/schema checks, the existing 77/77 compose E2E gate, manual Twilio/auth smoke on the Railway review URL, verified storage copy, deployed/healthy worker, backup/PITR configuration, and one restore rehearsal.
- Directly verify Twilio callback targets, current balances/ledger totals, active API consumers, and the single active user's required journeys.

**Sequenced post-cutover remediation**

- Full API-01 programmatic parity, Hey API SDK breadth, and legacy-route sunset beyond operations needed at cutover.
- DATA-02 retention automation, COMPLIANCE-01/02, full AUDIT-01 integrity/export features, adaptive survey abuse controls, and upload quarantine/ClamAV unless their affected feature remains enabled at cutover.
- UX-01 through UX-03, PRODUCT-01/02 presentation cleanup, OPS-02 Grafana/SLO maturity, coverage ratcheting, module deepening, and documentation consolidation.

The orchestrator must produce a short cutover manifest listing each in-scope feature as **proved**, **disabled**, or **deferred**. “Deferred but still enabled” is not an acceptable state for a Critical/High finding.

## 4. Evidence snapshot

- Approximately 1,001 application TypeScript files and 110k application LOC.
- 500 route-directory files, 166 components, and 62 hooks.
- 275 unit/integration test files and 25 Playwright specs.
- 31 ADRs.
- 88 documented effects; 11 are recorded as removal candidates.
- 19 active client migration files but only 17 unique version prefixes.
- 483 files are expected by the merged coverage gate; routes and several runtime roots are excluded.
- Three production modules exceed 1,000 lines.
- No local TypeScript import cycles were found by the static review.

## 5. Finding registry

Use these IDs in branches, PR descriptions, tests, and progress updates.

### Critical

#### SEC-01 — Workspace credential disclosure and mutation

**Evidence**

- `app/routes/api+/workspace.action.server.ts:66-100`
- `app/lib/workspace-members-db.server.ts:561-590`
- `app/db/schema.ts` workspace credential columns

Any workspace member passes `requireWorkspaceAccess`. The route accepts arbitrary non-prototype keys, merges them into `twilio_data`, and returns the full workspace row selected by `getWorkspaceById`.

**Impact:** tenant Twilio credential disclosure, credential replacement, webhook forgery, unauthorized calling, and billing exposure.

**Required outcome**

- **Adjusted decision (2026-07-13):** hard-delete `/api/workspace` and finish the existing secret-free `GET/PATCH /api/workspaces/:workspaceId` route at `app/routes/api+/workspaces+/$workspaceId.action.server.ts`. Put the route root behind the same canonical data-plane dual-auth boundary as its children rather than creating a parallel cutover route tree.
- Session mutation requires `admin` or `owner`; reads return a public/settings projection rather than the database row.
- API-key access remains programmatic but is governed by the API-key authority decision in the decision log.
- Replace the open update object with a strict allowlisted schema.
- Never return `key`, `token`, `twilio_data`, or future secret-bearing columns.
- Move credential updates behind purpose-specific audited operations.
- Add caller/member denial and secret-redaction tests.

#### SEC-02 — Unauthenticated predictive dialer

**Evidence**

- `app/routes/api+/auto-dial/dialer.action.server.ts:23-36`
- `test/auto-dial-dialer.route.test.ts`

The action trusts body-supplied user, campaign, workspace, device, and conference identifiers before invoking `runAutoDialerTurn`.

**Impact:** unauthorized calls, queue changes, credit consumption, caller impersonation, and compliance exposure.

**Required outcome**

- **Decision (2026-07-12):** expose dialer start as a canonical workspace-scoped action that accepts either an authenticated session or a workspace API key. The lower-level “next turn” remains an internal function invoked by signed callbacks, not a public HTTP operation.
- Cutover route: `POST /api/workspaces/:workspaceId/campaigns/:campaignId/dialer/start`; API-01 may add a `/api/v1` alias post-cutover without duplicating domain logic.
- Session callers must be `caller` or higher and act as themselves.
- API-key callers must provide `agentUserId`; the server verifies that the agent is a `caller`-or-higher member of the route workspace before using that identity for the Twilio client target, conference ownership, queue attribution, and audit.
- Derive workspace and campaign from route parameters; do not trust body-supplied workspace/campaign identity.
- Hard-cut migration: update all in-repo callers and delete both `/api/auto-dial` and `/api/auto-dial/dialer`; do not retain compatibility shims.
- Add unauthenticated, cross-workspace, wrong-role, and replay tests.

#### SEC-03 — Invitation acceptance is not bound to the invitee

**Evidence**

- `app/routes/accept-invite.action.server.ts`
- `app/lib/database/workspace.server.ts:994-1067`

Invitation rows are fetched by submitted IDs only, then their roles are granted to the currently authenticated user.

**Impact:** a leaked or guessed invitation ID can grant workspace access to the wrong account.

**Required outcome**

- **Decision (2026-07-12):** adopt the Quick Canvass email-first invitation model rather than requiring a pre-existing user.
- Store normalized invite email, role, inviter, status, expiry, and only a SHA-256 hash of a 32-byte opaque token. Never store or log the raw token.
- Deliver through Better Auth magic link with separate callbacks for new and existing users.
- Redemption requires an authenticated, verified email matching the normalized invite email.
- Insert membership and mark the invite accepted in one transaction using a pending/unexpired compare-and-set so concurrent or replayed redemption is idempotent.
- Resend rotates the token and expiry; cancel invalidates the pending invite.
- Enforce one pending invite per workspace/email and retain accepted/superseded audit state.
- Expose invite create/list/resend/cancel through the scoped programmatic API capability, while redemption remains an identity-bound public/session flow.
- Invite creation requires `members.invite`. Owner sessions may invite admin/member/caller; admin sessions may invite member/caller; member sessions may invite caller; callers cannot invite. API keys require `members.invite` plus an explicit `members.assign.<role>` capability for the requested strictly subordinate role. `owner` is never invitational—ownership changes only through the step-up-authenticated transfer flow.
- Do not copy NES Dashboard's signup-request coupling or its resend behavior that deletes an existing auth user.
- Add new-user, existing-user, wrong-email, expired, superseded, canceled, replay, and concurrent-accept tests.

#### DATA-01 — Cross-tenant campaign queue mutation

**Evidence**

- `app/routes/workspaces+/$id/campaigns/$selected_id/queue.action.server.ts:30-154`
- `app/lib/campaign-queue-db.server.ts:60-104`

The workspace route imports context access but never reads it. Queue update/delete helpers make workspace scope optional, and audience/contact inputs are not consistently verified against the campaign workspace.

**Impact:** another tenant's queue rows can be changed or deleted using guessed IDs; foreign contacts or audiences can be attached to a campaign.

**Required outcome**

- Make `workspaceId` mandatory in every tenant queue helper.
- Scope by workspace and campaign where both are available.
- Verify campaign, audience, contact, and queue-row ownership before mutation.
- Prefer the tenant DB facade or a domain adapter that cannot express an unscoped operation.
- Add cross-workspace tests for every queue intent and API surface.

#### SEC-04 — Stored outbound webhook SSRF

**Evidence**

- `app/lib/workspace-webhooks.server.ts:58-88`
- `app/lib/safe-outbound-url.server.ts`

`safeOutboundFetch` already exists and is used by configuration/test paths. Production delivery in `workspace-webhooks.server.ts` still performs a raw `fetch`, follows the current DNS result, has no bounded timeout, and accepts custom headers.

**Impact:** internal-service probing, metadata access, redirect/rebinding bypass, credential forwarding, and hung application requests.

**Required outcome**

- Use `safeOutboundFetch` for every delivery attempt.
- Accept public HTTPS destinations only. Reject embedded credentials, private/loopback/link-local/reserved addresses, unsafe ports, and redirects.
- Resolve and validate DNS at delivery time and pin/connect to the validated public address so DNS rebinding cannot bypass the check.
- Add timeout, body-size, and safe-header policies.
- Sign outbound payloads.
- Move delivery to the durable worker before enabling retries.
- Wave 1 must either disable stored production delivery or route every attempt through the safe fetch primitive. Durable retries/signing/history land with the Wave 3 webhook worker; do not claim all of SEC-04 complete in Wave 1.

### High

#### SEC-05 — Unauthenticated parent-account disconnect

**Evidence:** `app/routes/api.disconnect.action.server.ts:27-57`

The endpoint accepts an arbitrary CallSid and updates it with parent Twilio credentials.

**Adjusted decision (2026-07-13):** replace the legacy endpoint with `POST /api/workspaces/:workspaceId/calls/:callSid/disconnect`. It uses the existing data-plane dual-auth boundary and verifies the CallSid belongs to the route workspace before using workspace-scoped Twilio credentials. Delete `/api/disconnect`; API-01 may add a `/api/v1` alias post-cutover.

**Required outcome:** any `caller`-or-higher session member with the call-control capability may control any call in their workspace; a scoped API key with that capability has the same workspace-wide call-control authority. Verify workspace/call ownership, use workspace rather than parent credentials, and add unauthenticated, missing-capability, and cross-workspace tests.

#### SEC-06 — Unsigned inbound verification callback

**Evidence:** `app/routes/api+/inbound-verification.action.server.ts`

The route trusts form `From` and mutates phone-verification state without Twilio signature validation.

**Required outcome:** validate the correct Twilio account signature before reading or mutating pending verification state.

#### SEC-07 — Sessions and API keys need one capability vocabulary

**Evidence**

- `@chester-hill-solutions/auth-postgres` provides deny-by-default `workspace_role`, `workspace_feature`, and `workspace_feature_permission` authorization with stable feature IDs.
- Quick Canvass centralizes session role checks but does not provide an API-key scope model.
- CallCaster workspace API keys are intentionally product-specific and currently have no scopes.

**Decision (2026-07-12)**

- Sessions and API keys use the same stable CallCaster capability IDs.
- Session capabilities resolve through CHS workspace role/feature permissions.
- Each CallCaster workspace API key stores an explicit allowlist of capability IDs.
- Missing capability grants deny access by default.
- API-key persistence, issuance, rotation, and revocation remain in CallCaster rather than being forced into Better Auth.
- Reusable actor/capability contracts are added to `@chester-hill-solutions/auth`; Postgres feature checks are extended in `auth-postgres`; React Router guards are added in `auth-react-router`.
- The shared Postgres workspace auth schema standardizes workspace and member user foreign keys on PostgreSQL UUID before first production adoption.
- CallCaster atomically replaces the target Postgres `workspace_users` text-role schema with canonical CHS `workspace_member.role_id`, `workspace_role`, `workspace_feature`, and `workspace_feature_permission` tables before customer cutover; it does not retain a permanent adapter or dual-write path.

**Required outcome**

- Define a typed capability registry and map every programmatic action to one capability.
- Capability IDs are stable resource-operation names, not route names or broad feature flags—for example `campaigns.read`, `campaigns.write`, `campaigns.dispatch`, `calls.start`, `calls.control`, `messages.send`, and `members.invite`.
- At cutover, owner/admin/member/caller are fixed seeded product role templates. Although the shared schema can represent workspace-specific overrides, CallCaster does not expose custom roles or a role-capability editor/API in this program.
- Introduce one actor-aware authorization helper for session and API-key callers.
- Make route declarations and implementations use the same capability metadata.
- Programmatic parity applies to product and workspace operations, but not to the human trust root. Identity changes, 2FA, workspace ownership transfer, provider-secret mutation, and API-key issuance/rotation/revocation require an owner session with step-up authentication. Workspace deletion may be initiated by an admin or owner session with step-up. None are authorized by a workspace API key.
- Step-up requires a fresh password re-authentication plus a fresh 2FA challenge when enrolled/required. The grant is bound to the current session, expires after 10 minutes, is audited, and is invalidated by password/security/session changes.
- Require explicit scopes when issuing a key; display them in settings and audit output.
- API-key expiry is mandatory: default 90 days, maximum one year. Preserve one-time secret reveal, rotation/revocation, last-used metadata, and advance expiry warnings.
- API-key capability sets are immutable. Any scope change issues a new key and revokes the old key; capabilities are never expanded silently in place.
- Existing unscoped keys are backfilled only with capabilities matching the currently supported integrator endpoints (campaign creation and SMS). They do not inherit newly exposed telephony, settings, membership, billing, or admin powers.
- New capabilities require an explicit key update or reissue, with an auditable actor and timestamp.
- Test existing-integrator compatibility and denial of every newly introduced capability.

#### API-01 — Product actions lack a complete programmatic contract

**Adjusted decision (2026-07-13):** extend the repository's existing TypeScript-authored OpenAPI pipeline rather than replacing it with a nonexistent YAML source. `app/lib/openapi*.ts` exports `openapi/public-api.json`, `openapi/complete-api.json`, and the SDK-focused `openapi/integrator-api.json`; Hey API generates TypeScript, Zod, and the fetch SDK from `integrator-api.json`.

**Required outcome**

- Wave 0 inventories every user-visible action and classifies it as public product API, owner-session trust root, provider callback, identity flow, or internal worker/control operation.
- At cutover, secure and document the existing `/api/workspaces/:workspaceId/...` data plane and the three current integrator operations. Do not make the migration wait for a second REST tree.
- Post-cutover, introduce `/api/v1/workspaces/:workspaceId/...` as aliases before declaring them canonical. Update/supersede ADR-0018 explicitly, preserve the existing `@chester-hill-solutions/scriptkit-callcaster-client`/Adagio contract, and never duplicate domain services.
- Existing `/api/campaigns/create-with-script`, `/api/sms`, and `/api/chat_sms` routes remain thin compatibility adapters for 90 days after their versioned replacements ship. Emit standard `Deprecation` and `Sunset` headers, record usage telemetry, publish a migration guide, notify known integrators, and remove adapters after the announced date.
- Path-scoped operations derive tenancy from `workspaceId`; request bodies omit `workspace_id` (legacy adapters may accept it only when it matches the authenticated/path workspace).
- Existing React Router form actions may remain browser adapters, but they and public JSON routes call the same domain service and authorization policy; business behavior is not duplicated.
- Write the OpenAPI operation, examples, security, success/error responses, and stable `operationId` before the route. Generate SDK artifacts only for explicitly promoted integrator operations; session/platform operations remain in the public/complete specs without automatically expanding SDK scope.
- Generate artifacts in CI and fail on drift. Do not hand-edit generated files.
- Define consistent pagination, filtering, error envelopes, idempotency keys for externally effective creates, `201`/`202`/`204` semantics, and request correlation/audit metadata.
- Require `Idempotency-Key` for externally effective creates. Scope records by workspace, operation, and key; retain them for seven days with a canonical request hash and original response reference. An exact replay returns the original resource/result, while reuse with a different payload returns `409 Conflict`. Domain uniqueness/audit records outlive the API replay window where required.
- New versioned collection operations use opaque keyset cursors with stable `(created_at,id)` ordering, `next_cursor`, a default page size of 50, and maximum 100. Existing unversioned endpoints retain their offset contract until sunset.
- Rate limits are tiered by operation and enforced on both actor/API-key and workspace aggregate dimensions. Return `429` with standard limit, remaining, reset, and retry metadata. Provider-effect operations additionally obey workspace Twilio throughput/concurrency limits even when HTTP request limits remain.
- Post-cutover, back distributed API limits with the atomic Postgres window tables already anticipated by ADR-0007. Use bounded cardinality/cleanup and hash sensitive identifiers; this does not block the one-user cutover unless a live integrator requires it.
- Provider webhooks, Better Auth endpoints, public respondent flows, and internal worker/dialer-next controls are documented separately and are not mislabeled as integrator APIs.
- Each domain PR updates its relevant inventory/spec and contract tests. Full product-action parity remains a post-cutover completion criterion, not a migration gate.

#### SEC-08 — MFA factors cannot be assumed portable across auth cutover

**Decision (2026-07-12):** preserve user UUIDs, verified email state, and compatible bcrypt password hashes, but do not migrate Supabase MFA factor secrets. Invalidate every Supabase session at cutover.

**Required outcome**

- Notify affected users before cutover and explain the one-time login/MFA re-enrollment.
- After password authentication, owner/admin users must enroll a new Better Auth factor and store fresh recovery codes before accessing workspace data. There is no post-cutover MFA bypass grace period.
- Bind bootstrap enrollment to the imported verified identity/session, rate-limit attempts, audit completion/reset, and prevent other trust-root actions until enrollment is complete.
- Lost-factor recovery uses one-time recovery codes first. If both factor and codes are unavailable, only platform support may reset MFA after documented identity verification, two-person approval, a 24-hour delay, and notification to every workspace owner; verified email alone is insufficient.
- Caller/member users may follow the normal role policy, but any later role elevation to admin/owner requires MFA enrollment first.
- Preflight the Supabase source for legacy `field_director` memberships. Because the fixed cutover templates omit that role while current MFA policy treats it as privileged, map any existing `field_director` membership to `admin` unless the cutover owner approves an explicit per-user lower-role mapping; never silently downgrade or discard it.
- Add imported-password login, session invalidation, mandatory enrollment, recovery, role-elevation, and wrong-account tests.

#### TEL-01 — Complete and verify monotonic call status

**Evidence**

- The original audit found an unconditional upsert path in `app/lib/twilio-call-status.server.ts`.
- Current code now routes workspace-known upserts through `updateCallBySid`, whose SQL `CASE` atomically prevents terminal-to-nonterminal regression in `app/lib/telephony-db.server.ts`.
- The remaining questions are whether every callback/recovery path supplies workspace and uses the guard, and how conflicting terminal statuses are ordered.

**Required outcome**

- Re-verify the original finding against execution HEAD and retain the current atomic SQL guard.
- Define one canonical call-status precedence/sequence model, including terminal-to-terminal conflicts.
- Persist and compare Twilio `SequenceNumber` when present. A higher provider sequence may supersede an earlier status; duplicate/lower sequences are ignored. Without a sequence, the first terminal status remains authoritative and a conflicting terminal observation is recorded for reconciliation rather than overwriting it.
- Canonical call progression is `queued` → `initiated` → `ringing` → `in-progress` → one of `completed|busy|no-answer|failed|canceled`. Provider sequence wins when present; otherwise only forward progression is accepted and first terminal wins.
- Ensure every callback, open-sync, and repair path uses the same guarded transition.
- Preserve the correct terminal state under out-of-order and replayed callbacks.
- Prove one billing debit under callback permutations.

#### TEL-02 — Live calls can become untracked

**Evidence:** `app/lib/auto-dial.server.ts`

Twilio call creation occurs before dequeue and durable call persistence; persistence failures can be swallowed.

**Required outcome**

- Persist a durable call intent and queue/contact claim before provider creation, with a unique provider SID constraint and signed intent correlation in callback URLs.
- Dispatch at most one automatic provider-create attempt per intent. If the response is ambiguous, perform bounded reconciliation; attach only a unique matching provider call, otherwise mark the intent unknown and quarantine the queue/contact for explicit resolution. Never automatically redial an ambiguous attempt.
- If a known provider call cannot be durably attached, retry persistence/reconcile and terminate it only as an explicit compensation path; callback correlation must be able to recover the intent after a response-write failure.
- Never report failure while leaving an untracked live call.
- Make dequeue and persistence idempotent.
- Add crash-point/failure-injection tests after every external step.

#### TEL-03 — ACD lifecycle loses entry and agent state

**Evidence**

- `app/routes/api+/inbound.action.server.ts:203-216`
- `app/lib/acd/acd-router.server.ts`

Inbound TwiML hardcodes `entry_id=0`, and failed agent dialing logs without releasing the claimed agent.

**Required outcome**

- Correlate completion to a real queue entry.
- Preserve the canonical lifecycle already defined in `docs/contact-center-platform-plan.md` and ADR-0013: Postgres is authoritative; realtime is only a UI accelerator; each offer binds one entry, agent, and lease generation.
- Release/requeue offers and agents on decline, timeout, caller abandonment, provider error, bridge failure, stale heartbeat, and worker loss. A stale lease holder cannot accept or complete a reclaimed offer.
- Keep `enqueued_at` stable across re-offers, enforce server-authoritative offer timeout/max-offer/overflow behavior, and auto-set missed/connect-failed agents away as documented.
- Reconcile implementation and ADR-0013 so conference-per-entry correlation, wrap-up, disposition, and recovery behavior are truthful.

#### TEL-04 — Open-sync does not recover terminal billing

**Evidence:** `app/lib/twilio-open-sync.server.ts:45-128`

Provider records are filtered to statuses that remain open; terminal transitions are excluded and direct status writes bypass canonical billing.

**Required outcome**

- Select locally open records and inspect their current provider state, including terminal states.
- Route recovered changes through canonical status/billing processors.
- Add lost-webhook recovery tests for calls and messages.

#### TEL-05 — Message status transitions need the same canonical recovery model

SMS status processing, open-sync recovery, billing, and outbound-message intent must agree on monotonic message states and terminal handling.

**Required outcome**

- Separate durable outbound-intent state from provider message status.
- Canonical outbound provider progression is `accepted|scheduled|queued` → `sending` → `sent` → `delivered` → `read`, with terminal failure branches `canceled|failed|undelivered`. Inbound progression is `receiving` → `received`.
- `delivered`, `read`, `canceled`, `failed`, `undelivered`, and inbound `received` are terminal for regression purposes; `delivered` may advance to `read` without another debit.
- Use provider sequence ordering if supplied; otherwise accept only forward rank, keep the first conflicting terminal outcome, and record the conflict for reconciliation.
- Prevent terminal-to-nonterminal regression atomically.
- Persist deduplicated status observations so ignored replays/conflicts remain auditable.
- Route provider callbacks and open-sync through the same processor.
- Prove replayed and out-of-order callbacks produce one final state and one debit.

#### BILL-01 — Scheduled money jobs reject their scheduled inputs

**Evidence**

- `client/migrations/20260704000000_update_pg_cron_to_remix_routes.sql`
- `app/lib/number-rental-billing.server.ts`
- `app/routes/api+/jobs+/billing-reconcile.action.server.ts`
- `app/routes/api+/jobs+/twilio-open-sync.action.server.ts`

The migration posts `workspaceId: NULL`; the handlers require a valid workspace.

**Required outcome**

- Choose one canonical scheduler architecture.
- **Decision (2026-07-12):** durable database schedule definitions are the source of recurring work. The worker materializes due schedules into idempotent occurrence jobs; HTTP pg_cron, Railway Cron, and handler self-enqueue are not the recurrence source.
- Each schedule occurrence uses a deterministic uniqueness key and enqueues bounded per-workspace jobs or a coordinator that durably fans out per-workspace jobs.
- Global schedules create one coordinator occurrence. The coordinator durably records fan-out progress and enqueues deterministic per-workspace child jobs keyed by job type, workspace, and UTC occurrence. It does not process every workspace inline or create a permanent schedule row per workspace.
- Reuse `runLowCreditNotify`'s current all-workspace enumeration as the interim coordinator pattern while migrating it to durable child jobs; do not invent a second workspace-discovery path.
- Add singleton/idempotency keys for recurring periods.
- Alert when a required recurring job has no future occurrence.
- Add scheduler-to-handler integration tests.

#### BILL-02 — Missed rental cycles are not caught up

**Evidence:** `app/lib/number-rental-billing.server.ts`

Charging occurs only when execution lands on the exact anchor-day due date.

**Required outcome**

- Process all unbilled cycles through the current date.
- Make affordability/reservation and debit atomic.
- **Decision (2026-07-12):** on insufficient credits, enter a seven-day grace period with owner/admin notices, suspend use when grace expires, and automatically release the provider number after 30 unpaid days with repeated/final warnings.
- Persist due, unpaid, grace, suspended, scheduled-release, released, and recovered state plus notification timestamps.
- A successful catch-up payment before release restores service and cancels scheduled release idempotently.
- Add downtime, month-length, leap-year, and concurrent-run tests.

#### BILL-03 — Reconciliation compares incompatible units

**Evidence**

- `shared/billing-reconciliation.ts`
- `app/lib/billing-reconciliation.server.ts`
- `test/billing-reconciliation.test.ts`

Segments and minutes are compared with ledger event counts, producing expected false variance.

**Required outcome**

- Reconcile by canonical billing units and idempotency keys.
- Treat zero-duration calls and period boundaries intentionally.
- Add multi-segment and multi-minute fixtures with zero expected variance.

#### BILL-04 — Number provisioning occurs before durable payment

**Evidence:** `app/lib/platform-workspace-numbers.server.ts`

The provider purchase and local number creation can succeed before the ledger debit, while the balance check is not an atomic reservation.

**Decision (2026-07-12)**

- Create a durable number-purchase intent.
- Atomically reserve/debit the required credits before calling Twilio.
- On provider success, finalize the number and intent.
- On provider failure, issue an idempotent compensating ledger credit and mark the intent failed.
- Recovery workers reconcile intents stuck between reservation, provider purchase, local persistence, and compensation.

**Required outcome:** concurrent purchases cannot overspend; every crash point converges to either one active paid number or no number plus one refund.

#### BILL-05 — Provider dispatch needs explicit prepaid reservation

**Decision (2026-07-12):** reserve exact estimated SMS/MMS credits before dispatch and at least the first voice minute before dialing. Voice may use only a documented bounded settlement exposure.

**Required outcome**

- Add atomic, idempotent credit reservations/holds distinct from final ledger settlement; available-to-spend excludes active holds.
- SMS/MMS reserves the canonical estimator amount, then settles against provider `num_segments`/media outcome exactly once and releases or adjusts the hold.
- Voice reserves the first minute and atomically allocates a bounded duration budget based on remaining available credits and workspace concurrency. Pass the resulting maximum duration to Twilio and prevent concurrent calls from allocating the same exposure.
- Final call billing settles actual started minutes and releases unused authorization. Any provider rounding/status discrepancy is bounded, visible in reconciliation, and cannot silently grant unlimited negative credit.
- Expired/failed/unknown intents have explicit hold-release rules; unknown provider outcomes retain the hold until reconciliation or an audited resolution.
- Add concurrent-dispatch, estimator-difference, long-call, timeout, compensation, and insufficient-credit tests.

#### ASYNC-01 — SMS send is not durable or idempotent

**Evidence**

- `app/lib/sms-send.server.ts`
- `app/lib/chat-sms.server.ts`
- `app/routes/api+/sms.action.server.ts`

Twilio send precedes persistence; retries after a persistence failure can duplicate delivery.

**Required outcome**

- Persist an outbound-message intent with a unique client/request key.
- On a new submission, return `201 Created` only after the durable intent exists, with the queued message representation and a `Location` header. An idempotency-key replay returns the existing resource as `200 OK`.
- Session UI renders the durable resource immediately as pending; API consumers use the resource URL and workspace events to observe transitions.
- Dispatch through a durable handler.
- Record provider SID before treating the attempt as confirmed.
- Use an explicit message state machine: `queued` → `dispatching` → `accepted` → provider terminal state (`delivered`, `undelivered`, or `failed`), with `unknown` and pre-dispatch `canceled` escape states. Store provider status separately from application state.
- If the provider outcome is unknown because the response was lost, perform bounded reconciliation. Link only a uniquely matching provider record; otherwise mark the intent `unknown` and never auto-resend.
- A user may explicitly create a new message after acknowledging a duplicate-delivery warning; this uses a new idempotency key and leaves the unknown intent immutable for audit.
- Define and document the achievable delivery guarantee. Do not claim provider-level exactly-once delivery unless Twilio offers and the implementation uses a supported idempotency mechanism.
- Reconcile confirmed sends by Twilio SID.
- Add provider-success/database-failure and retry tests.

#### ASYNC-02 — Worker leases are not fenced

**Evidence:** `app/lib/worker/poll-jobs.server.ts:51-213`

Heartbeat, completion, and failure updates use job ID only. A stale worker can mutate a job after another worker reclaims it.

**Required outcome**

- Add a claim token or generation.
- Compare worker/token/status on heartbeat, completion, and failure.
- Use configurable claim TTL consistently.
- Add two-worker lease-expiry tests proving a single valid completion.

#### ASYNC-03 — Exports, uploads, and webhook delivery are not durable

**Evidence**

- `app/routes/api+/campaign-export.action.server.ts`
- `app/routes/api+/audience-upload.action.server.ts`
- `app/lib/worker/handlers.server.ts`

Exports/uploads run as unawaited promises, while `campaign_export`, `campaign_dispatch`, and `webhook_delivery` handlers throw as unimplemented.

**Required outcome**

- Store inputs in durable object storage or normalized job data.
- Upload into a private quarantine namespace, enforce streaming size/content/type limits, and scan through a private-network ClamAV Railway service whose signature freshness is monitored. Fail closed when the scanner is unavailable or stale.
- Promote only clean, normalized output to application storage. Parse CSV defensively against encoding/row/column/decompression abuse and neutralize spreadsheet formulas in generated exports; transcode media with strict resource/time limits.
- Automatically expire rejected/orphaned quarantine objects and retain only redacted scan metadata/audit evidence.
- Implement idempotent handlers and resumable checkpoints.
- Ensure domain failures reject jobs instead of being converted to successful returns.
- Add restart, retry, and stale-processing recovery tests.
- Outbound webhooks use signed at-least-once delivery with a stable event ID. Sign the exact body and UTC timestamp using versioned HMAC-SHA256 headers so receivers can deduplicate and enforce replay windows.
- Attempt at most eight times over 24 hours with bounded exponential backoff. Any 2xx completes delivery; redirects are not followed; `410 Gone` disables the endpoint; other network/non-2xx outcomes retry until dead-lettered.
- Webhook secret creation/rotation/revocation remains an owner-session trust-root action, with one-time reveal and a bounded previous-secret verification overlap.

#### ASYNC-04 — Campaign dispatch is registered but unimplemented

`campaign_dispatch` is a registered job type whose handler throws. The current repository has no producer, but the Supabase-removal architecture assigns automated campaign queue draining to this job.

**Required outcome**

- **Decision (2026-07-12):** implement it as the durable coordinator for automated `message` and `robocall` campaign queue draining.
- Predictive and manual calling remain agent-owned request flows and must not be claimed by this worker.
- Port the useful throughput, stale-claim, duplicate, retry, and completion semantics from `app/lib/worker/campaign-dispatch.ts` away from its Supabase-shaped DB interface.
- Enqueue idempotent per-contact SMS-send or robocall-initiation child jobs; the coordinator does not perform provider effects inline.
- No registered production job type may intentionally dead-letter every invocation.

#### SURVEY-01 — Public survey response identity and isolation are incomplete

**Evidence**

- `app/routes/survey+/$surveyId.tsx`
- `app/routes/api+/survey-answer.action.server.ts`
- `app/routes/api+/survey-complete.action.server.ts`
- `app/lib/survey-db.server.ts`

The page does not consistently preserve the respondent token, completion is displayed before server success, required fields are not gated by a form, and question lookup is not constrained through the requested survey.

**Required outcome**

- Mint or load one respondent token and preserve it across answers, reload, and completion.
- Support two explicit identity modes. Anonymous respondent tokens cannot attach a contact; contact-specific links bind the workspace, survey, result, and contact ID inside the signed token, and the client may not override that association.
- Respondent tokens expire at the survey close time, capped at 90 days from issuance. A completed response is immutable/read-only; reopening requires an explicit workspace-side action and a newly issued token.
- Keep honeypot and distributed rate limits, and require server-verified Cloudflare Turnstile adaptively when anonymous traffic crosses risk/rate thresholds. Valid contact-bound links normally bypass the challenge unless abuse signals require it.
- Validate survey → page → question before creating or advancing a response.
- Make answer/progress/completion transactional where needed.
- Display completion only after successful server confirmation.
- Add a full multi-page E2E covering required fields, reload/resume, failure/retry, and completion.

#### DATA-02 — Sensitive-data retention is not enforced end to end

**Decision (2026-07-12):** use category-specific, workspace-configurable retention with automatic deletion and legal holds.

**Default profile**

- Call recordings: 90 days.
- Generated exports and processed raw-upload objects: 7 days.
- Webhook delivery and non-audit job payload/results: 30 days.
- Call/SMS content and metadata: 2 years.
- Contacts and survey data: while the workspace is active, then 30 days after workspace deletion.
- Security, access, and billing audit records: 7 years, with secrets and unnecessary message/contact content excluded.

**Required outcome**

- Admins/owners may choose shorter periods; any extension requires an explicit documented platform policy. Legal hold pauses deletion for identified records without silently changing the workspace policy.
- Durable UTC schedules enqueue bounded, idempotent deletion jobs across Postgres and object storage, with dry-run/count preview and auditable completion.
- Deletion covers derived files, exports, recordings, payload copies, search/index material, and caches. Telemetry must never receive the sensitive payload in the first place.
- PITR/backups expire deleted data through the backup retention lifecycle; restore procedures reapply deletion tombstones so erased data is not silently resurrected.
- Workspace deletion is a step-up-confirmed staged process with a 30-day recovery period, then irreversible purge except records subject to legal/audit retention.
- Admins may configure retention and initiate staged workspace deletion with step-up authentication. Notify every owner immediately; any owner may cancel during the 30-day recovery period. Legal holds require platform-admin authority. API keys may read the effective policy but cannot mutate retention, holds, or deletion state.
- Add clock-boundary, retry, legal-hold, restore, and cross-workspace tests.

#### COMPLIANCE-01 — Recording and monitoring configuration needs accountable consent controls

**Decision (2026-07-12):** customers remain responsible for determining lawful recording/monitoring consent and announcement requirements; CallCaster does not force one jurisdictional announcement.

**Required outcome**

- Recording/monitoring is not enabled accidentally: an admin must explicitly configure it, attest that the workspace has an appropriate legal basis/process, and re-attest when the material policy changes.
- Persist attestation actor/time/version and every recording/monitoring configuration change in the security audit trail.
- Show persistent compliance status/warnings in queue, number, recording, and supervisor-monitoring settings.
- Provide configurable announcement/consent tooling and documentation without claiming that one template guarantees compliance.
- Log supervisor listen/whisper/barge events and expose them to owners; recordings follow DATA-02 retention and access controls.
- Add unauthorized-enable, missing-attestation, audit, and role tests.

#### COMPLIANCE-02 — Data location and subprocessors need explicit disclosure

**Decision (2026-07-13):** CallCaster does not promise Canada-only residency. It documents processor/storage regions, minimizes transfers, and obtains the appropriate customer agreement.

**Required outcome**

- Maintain a data-flow/subprocessor register for Railway, Twilio, Stripe, object replication, Grafana Cloud, Cloudflare Turnstile, email delivery, and any support tooling, including data categories, purposes, regions, retention, and transfer mechanism.
- Configure Canadian/North-American regions where practical without claiming all data remains in Canada.
- Keep sensitive payloads out of telemetry and support tools; send each processor only the minimum fields needed.
- Publish customer-facing residency/subprocessor disclosures and change-notification terms; align contracts/DPA and internal support access with the actual deployment.
- Verify primary, backup, object-replica, and telemetry regions before cutover and whenever infrastructure changes.

#### AUDIT-01 — Privileged actions need one immutable audit contract

**Decision (2026-07-12):** workspace owners may view/export their workspace audit trail; API keys require `audit.read`; platform-support access requires a reason and creates its own audit event.

**Required outcome**

- Define one append-only security/administration audit schema and writer used by session, API-key, support, worker, retention, billing, recording/monitoring, and trust-root paths.
- Record UTC time, workspace, actor type/ID, API key ID where applicable, capability/action, target type/ID, outcome, request/correlation ID, and redacted structured change metadata. Never record secrets, tokens, credentials, message bodies, survey answers, or raw contact data.
- Prevent update/delete through application roles. Chain/batch integrity digests and periodically anchor them in immutable object storage so privileged database mutation is detectable.
- Retain audit records for seven years, expose cursor-paginated `/api/v1/workspaces/:workspaceId/audit-events` with `audit.read`, and generate large exports through the durable worker.
- Owners receive UI access. Platform support must supply a reason code/ticket; the access event is visible to owners. Admin/member/caller templates do not receive `audit.read`.
- Add tamper, redaction, capability, support-access, export, and cross-workspace tests.

### Medium product and assurance findings

#### PRODUCT-01 — Role capabilities are inconsistent

Caller navigation exposes management paths that corresponding product intent may not support, while several creation actions do not enforce a minimum member role.

**Decision (2026-07-12)**

- Templates are cumulative for ordinary product work: caller < member < admin < owner.
- Caller performs operational work: view assigned campaign/contact/script/survey context, use Handset, place/control workspace calls, and send/read messages. No bulk export or resource/settings management.
- Member is a content/data collaborator: caller powers plus create/edit campaigns, audiences, contacts, scripts, surveys, and media, and view analytics. Members cannot activate automated dispatch, manage peers, export bulk data, or change workspace/provider/billing settings.
- Admin adds campaign activation/dispatch, bulk exports, subordinate invitations, number/queue/workspace configuration, and ordinary billing administration.
- Owner adds trust-root operations: ownership transfer, workspace deletion, API-key/webhook-secret lifecycle, provider-secret changes, and security/2FA policy.

**Required outcome:** materialize the exact stable capability matrix as seeded data, enforce it in loaders/actions, derive navigation visibility from the same evaluator, and test every role by direct URL and action as well as visible navigation.

#### PRODUCT-02 — Pricing contradicts billing

`app/routes/pricing.tsx` hardcodes `$0.03/text` and `$0.06/dial`; `app/routes/workspaces+/$id/billing.route.tsx` states `$0.02/segment` and `$0.04` IVR dial.

**Decision (2026-07-12):** render public and authenticated pricing from canonical shared constants and show both credits and their CAD equivalent. State SMS pricing per segment, MMS flat pricing, IVR/staffed first and additional started-minute rates, monthly number rental, minimum purchase, and applicable billing of provider-attempt outcomes without presenting a flat per-message/per-call claim.

#### UX-01 — Mobile navigation is not an accessible modal

`app/components/layout/Navbar.MobileMenu.tsx` lacks dialog semantics, focus trapping, Escape behavior, focus restoration, and accessible names for icon buttons.

**Required outcome:** use the canonical `Sheet` and add keyboard/screen-reader tests.

#### UX-02 — FormField accessibility contract is incomplete

Descriptions and errors are not reliably connected to controls; invalid controls are not consistently marked or focused.

**Required outcome:** establish one control-aware `FormField` contract and test `aria-describedby`, `aria-invalid`, live errors, and focus.

#### UX-03 — Core journeys contain avoidable fragmentation

- Campaign activation crosses roughly nine distinct screens.
- Calls and Handset both appear to be live inbound-agent destinations.
- Voicemail and export empty states lack direct actions.
- Closed signup still presents “Sign Up” before becoming “Request Access.”

**Required outcome**

- Rename Calls to **Call History** and remove inbound pickup/listening controls from that route.
- Handset is the sole live inbound and agent-desktop destination.
- Make the canonical campaign journey explicit before restructuring routes; preserve return context when campaign setup sends users to create dependencies.
- Persist an incomplete campaign draft before leaving setup. Open the canonical dependency editor with validated/signed internal return context; on success, return to the same setup step and preselect the new resource.
- Add redirects/links and journey tests so existing Calls bookmarks still reach history and active agents do not maintain two competing sessions.

#### OPS-01 — Recovery objectives and restore proof are not encoded

**Decision (2026-07-12):** production Postgres requires RPO ≤5 minutes and RTO ≤60 minutes, point-in-time recovery, and a quarterly isolated restore exercise.

**Required outcome**

- Configure and document backup/PITR retention sufficient to meet the RPO.
- Apply the recovery objective to durable customer objects as well as Postgres. Version/replicate source audio, retained recordings, and other non-regenerable clean objects to a separate failure domain; generated exports, quarantine, caches, and reproducible derivatives are disposable.
- Replication and restore preserve DATA-02 expiry/legal-hold semantics and do not resurrect deleted objects.
- Restore into an isolated environment at least quarterly; never test restoration over production.
- Time the full restore, run schema/count/integrity and application smoke checks, and retain a redacted evidence record.
- Maintain an owner, escalation path, and practiced cutover/rollback/restore runbook.
- Block customer cutover until one production-shaped rehearsal meets both objectives.

#### OPS-02 — Reliability objectives lack end-to-end telemetry

**Decision (2026-07-12):** target 99.9% monthly app/API availability and instrument with vendor-neutral OpenTelemetry exported via OTLP to Grafana Cloud.

**Required outcome**

- Define SLIs and budgets for availability, API read/write latency, provider-webhook acknowledgement latency, worker queue/schedule lag, dead-letter rate, and recurring-job freshness.
- Initial budgets: p95 API reads ≤500 ms, non-provider writes ≤1 s, provider webhook acknowledgement ≤1 s, and immediate-job queue lag ≤15 s; tune only from measured evidence without weakening the 99.9% availability target.
- Propagate correlation, workspace, actor/key, request, job, provider SID, and idempotency identifiers through traces and structured logs, using hashed/redacted values where sensitive.
- Never emit message bodies, phone numbers, tokens, provider credentials, API keys, survey answers, or raw contact data into telemetry.
- Add multi-window burn-rate, dead-letter, stale-schedule, billing variance, callback failure, and backup/restore alerts with owners and runbooks.
- Instrument app, worker, scheduler, webhook, DB, and provider-client boundaries; verify trace continuity in the review environment before cutover.

#### QA-01 — Coverage gate overstates assurance

Non-strict coverage verifies presence in LCOV rather than a meaningful threshold and excludes routes plus several runtime roots.

**Decision (2026-07-12):** include every production runtime root, measure a clean baseline, set line/branch/function/statement floors at that baseline, and fail any regression. Raise the ratchet as remediation tests land; do not invent an immediate 80% cutover gate. Add changed-file coverage so new/modified behavior receives direct tests.

#### QA-02 — Hosted CI omits strictness and runtime checks

`ci:local` now includes the type-safety and handler/effects checks in the current working tree. The remaining question is hosted-CI parity and whether the TypeScript projects semantically check every server/worker/service/test surface and build both production images.

**Required outcome:** preserve the in-progress `defineAction`/`defineLoader` and type-safety ratchets, make hosted CI enforce the same invariants, close any remaining TS-project root gaps, and build both production images.

#### ARCH-01 — Migration ledger permits duplicate versions

Three active migrations share `20260705000200`, while the checker collapses duplicate versions in a `Map`.

The current checker explicitly grandfathers that historical version. Treat the three filenames as frozen applied history: do not rename them merely to satisfy uniqueness.

**Decision (2026-07-12):** Drizzle migrations are the sole schema authority for Railway Postgres after cutover. `client/migrations` becomes frozen Supabase source history/import support and is never replayed as the target schema history.

**Required outcome**

- Inspect the live Supabase source ledger and retain applied filenames/checksums unchanged; do not rename historical files.
- Freeze `client/migrations` against new product-schema evolution, preserve the explicit historical grandfather entry, and make any new duplicate version or modification a hard checker failure.
- Establish a reviewed Drizzle baseline plus forward migrations for the canonical target schema; `__drizzle_migrations` is authoritative on Railway.
- Rebuild disposable pre-customer Railway databases from the Drizzle baseline rather than reconciling Supabase migration ledgers into them.
- The customer cutover imports transformed data into that target schema; it does not replay `client/migrations`.

#### ARCH-02 — Oversized shallow modules reduce locality

Hotspots include:

- `app/lib/platform-data.server.ts`
- `app/lib/database/workspace.server.ts`
- `app/lib/api-surface.ts`
- `app/lib/survey-db.server.ts`

**Required outcome:** defer splitting until correctness fixes identify stable domain seams. Deepen modules around tenant-safe operations rather than creating pass-through files.

#### DOC-01 — Current-state documentation conflicts

Migration, testing, worker, route-module, package, and platform docs describe different stages of the architecture.

**Required outcome:** after behavior is corrected, establish one current-state page and label historical plans explicitly.

## 6. Orchestration strategy

Use a **supervisor/coordinator pattern** with phase-dependent pipelines:

1. The parent orchestrator owns priorities, branch safety, cross-workstream decisions, synthesis, and final delivery.
2. Read-only investigators verify findings and produce implementation briefs.
3. Implementers work in non-overlapping vertical slices.
4. Reviewers challenge tenant isolation, idempotency, concurrency, and failure recovery.
5. A final integration agent verifies the whole branch against repository invariants and user journeys.

Do not launch all implementers simultaneously. Parallelize only work with disjoint files and no unresolved shared design.

## 7. Team design

### Orchestrator

**Purpose:** maintain the dependency graph, approve design decisions, divide PRs, reconcile conflicts, and enforce exit criteria.

**Tools:** full repository tools, git status/diff/log, tests, and delegated agents.  
**Model tier:** strongest available reasoning model.  
**Output:** integrated remediation branch or sequenced PRs, updated tracker, verification evidence, and remaining risks.

### Boundary investigator

**Purpose:** re-verify SEC-01 through SEC-07 and DATA-01 before any edits.

**Tools:** read/search and non-mutating git commands only.  
**Output:** route-by-route trust matrix, current consumers, proposed auth helper, exact negative tests, and any contradiction with the audit.  
**Success:** every boundary has one explicit caller identity and one server-derived tenant identity.

### Boundary implementer

**Purpose:** apply approved SEC/DATA fixes in small PRs.

**Tools:** repository edit/test tools; no external service mutation.  
**Output:** code, adversarial tests, and API compatibility notes.  
**Success:** unauthorized/cross-tenant tests fail before the fix and pass afterward.

### CHS auth package implementer

**Purpose:** provide the reusable authorization and invitation seams required by SEC-03 and SEC-07 before CallCaster adopts them.

**Repository:** `/Users/ladmin/WebProjects/chester-hill-solutions`

**Ownership**

- `packages/auth`: authorization actor/capability contracts, normalized email, secure opaque-token generation/hash/constant-time verification, and shared error/result vocabulary.
- `packages/auth-postgres`: UUID-based canonical workspace/member schema, deny-by-default workspace feature evaluation for session-role actors, canonical email-first invitation schema/service primitives, expiry/status/compare-and-set redemption, and transaction-safe membership handoff.
- `packages/auth-react-router`: adapters that obtain the authenticated verified email/session actor, preserve safe continuation, and drive new/existing-user invite completion.

**Constraints**

- Keep application capability IDs and API-key persistence out of the shared packages.
- Do not add CallCaster role names or routes to shared code.
- Preserve package dependency direction: React Router depends on auth contracts; Postgres depends on auth contracts; core auth depends on neither.
- Treat the switch from text IDs to UUID foreign keys as a published schema/migration change with clean-install and upgrade tests.
- Add package-level tests and public README/API documentation.

**Success:** package tests/typechecks/builds pass; the exported interfaces support CallCaster and can also express the Quick Canvass invitation flow without app-specific branches.

**Release sequence decision (2026-07-12):** merge and publish semver package releases from the CHS monorepo first. CallCaster then installs the released GitHub Package versions. Do not develop the remediation against temporary `file:` links or merge consumer code that depends on unpublished APIs.

**Sibling adoption decision (2026-07-12):** use Quick Canvass as the proven design reference, adopt the published APIs in CallCaster in this plan, then migrate Quick Canvass in a separate follow-up. NES Dashboard remains on its current auth stack unless a later dedicated migration is approved.

### Public API contract implementer

**Purpose:** own API-01 and coordinate the contract slice of every domain PR.

**Inputs:** the Wave 0 user-action inventory, capability registry, `.cursor/skills/hey-api-openapi/SKILL.md`, `app/lib/openapi*.ts`, `app/lib/api-surface*.ts`, `scripts/export-openapi-spec.ts`, `openapi-ts.config.ts`, and ADR-0018.

**Output:** corrected TypeScript-authored specs and JSON exports, generated TypeScript/Zod/fetch SDK artifacts for the narrow integrator surface, served docs integration, drift checks, compatibility/path matrix, contract tests, and a parity ledger keyed by user action and `operationId`.

**Constraints:** spec first; no handwritten duplicate request/response types; no provider/internal endpoints in the public tag; route and UI adapters share domain services.

**Success:** every in-scope product action has a documented dual-auth operation, generated client surface, capability, negative auth tests, and parity status.

### Telephony state implementer

**Purpose:** own TEL-01 through TEL-05.

**Inputs:** Twilio callback map, ADRs 0013/0025, billing status constants, queue RPCs.  
**Output:** canonical state model, failure compensation, recovery tests, and corrected docs.  
**Success:** callback permutation and crash-point tests preserve one terminal state and one debit.

### Billing and scheduler implementer

**Purpose:** own BILL-01 through BILL-05 and coordinate with ARCH-01.

**Constraints:** no migration rename until deployed ledgers are inspected; no direct credit writes; do not approve a scheduler implementation until the CHS jobqueue decision is recorded.  
**Output:** scheduler design, catch-up logic, unit-correct reconciliation, migrations, and tests.  
**Success:** downtime/replay/concurrency simulations result in exact expected charges.

### Worker and external-effects implementer

**Purpose:** own ASYNC-01 through ASYNC-04.

**Output:** fenced leases, durable intents, implemented handlers, retries/dead letters, and recovery tests.  
**Success:** process termination at every defined crash point leaves recoverable state and does not duplicate provider effects.

### CHS jobqueue package implementer

**Purpose:** make `@chester-hill-solutions/jobqueue` the safe reusable execution engine required by CallCaster.

**Repository:** `/Users/ladmin/WebProjects/chester-hill-solutions`

**Required package capabilities**

- Consumer-defined Zod job registry rather than a fixed package-owned product job list.
- Versioned payload envelopes with explicit parse/migration failure; deployments must remain able to drain jobs produced by the previous app version.
- Atomic `SKIP LOCKED` claim returning a unique claim token/generation.
- Heartbeat, complete, fail, and cancel compare-and-set on job ID plus claim token and running status.
- Transaction-bound enqueue support so domain state and its job become visible atomically.
- Cooperative cancellation: queued jobs cancel immediately; running jobs record `cancellation_requested`, handlers observe an abort signal/checkpoint, and irreversible provider effects use domain compensation rather than pretending cancellation undid them.
- Configurable lease duration and stale-claim recovery.
- `scheduledFor`, priority, max attempts, bounded backoff, result/error/dead-letter metadata.
- Optional unique idempotency key with a database uniqueness guarantee.
- Durable schedule definitions and atomic due-occurrence materialization with deterministic occurrence keys; handler self-enqueue is not recurrence.
- Recurrence uses cron expressions interpreted strictly in UTC. All schedule, claim, retry, and occurrence timestamps are persisted as timezone-aware UTC values, including `next_run_at`.
- Abort-aware worker loop hooks without package-owned logging or product handlers.
- PGlite integration tests covering two-worker reclaim races and stale-worker rejection.

**Release sequence:** merge, test, version, and publish the package first; then install the released version in CallCaster and delete the local polling implementation.

### Survey and UX implementer

**Purpose:** own SURVEY-01, PRODUCT-01/02, and UX-01/02 after security and state designs stabilize.

**Constraint:** coordinate survey domain/editor changes through the published `@chester-hill-solutions/scriptkit-survey-*` packages required by the migration plan. CallCaster retains route/auth/respondent persistence adapters, not a duplicate survey model.

**Constraints:** use existing design-system primitives and preserve public compatibility where safe.  
**Output:** end-to-end journey tests, corrected pricing source, permission-driven navigation, accessible mobile/form primitives.  
**Success:** the full respondent journey and keyboard navigation are testable without timing assumptions.

### CI and architecture implementer

**Purpose:** own QA-01/02, ARCH-01/02, and DOC-01.

**Constraints:** do not use architecture cleanup to obscure behavior changes; preserve the ongoing type-safety working tree.  
**Output:** honest gates, full runtime typecheck, migration duplicate detection, measured module deepening, current-state docs.  
**Success:** hosted CI reproduces the agreed local bar and reports truthful coverage.

### Adversarial reviewer

**Purpose:** review each phase without implementing it.

**Review rubric**

- Can the caller choose another workspace, campaign, contact, audience, queue row, invite, CallSid, or job?
- Can a provider effect succeed while durable state fails?
- Can a callback arrive twice or out of order?
- Can two workers/processes both believe they own work?
- Can a failed scheduled run be caught up?
- Can secrets appear in responses, logs, webhook headers, or test fixtures?
- Does the test prove the negative path rather than only mock the helper?

**Success:** no Critical/High objection remains unresolved or explicitly accepted by the orchestrator.

## 8. Standard delegation brief

Every sub-agent prompt should use this structure:

```text
You are a sub-agent. Do not reply to the user directly; return your artifact to the parent orchestrator.

Goal:
<one finding or tightly coupled finding group>

Context:
- Repository: /Users/ladmin/WebProjects/callcaster
- Read AGENTS.md and docs/AGENT-PLATFORM-GUIDE.md first.
- Finding IDs: <IDs>
- Existing working-tree changes must be preserved.

Inputs:
- <specific files, ADRs, tests, and prior-agent artifact>

Expected output:
- Verified root cause
- Proposed implementation and files
- Tests that fail before and pass after
- Compatibility/migration risks
- Explicit uncertainties or blockers

Constraints:
- No unrelated cleanup.
- No .env changes.
- No destructive git operations.
- No migration renames without deployed-ledger evidence.
- Follow tenant, billing, route, and import rules from AGENTS.md.

Success criteria:
<copy the measurable exit criteria from this plan>

If uncertain, say so and explain why. If blocked, stop and report the blocker.
```

## 9. Execution waves and PR boundaries

### Wave 0 — Establish truth

May run in parallel:

- **Repository-state investigator:** capture branch, HEAD, merge-base, all working-tree changes, generated-file baseline, and pre-existing quality failures. Reconcile every claimed cutover blocker against `docs/migration-delivery-board.md` and the current handler/IVR working tree. Output: a dated state manifest with user-owned changes clearly marked and each delivery-board item mapped to **proved**, **still required**, or **superseded**.
- **Boundary investigator:** map consumers and legitimate caller identities for `/api/workspace`, predictive dialer, disconnect, inbound verification, invitation, survey, queue, and stored-webhook paths. Output: one trust matrix with route, caller, auth mechanism, tenant derivation, consumers, and compatibility decision.
- **Migration investigator:** inspect the live Supabase source ledger and every relevant Railway environment read-only. Record source versions/checksums and target Drizzle state without assuming a ledger name. Output: a redacted source-history manifest, target-baseline validation, and cutover import recommendation.
- **Worker investigator:** inspect deployed worker/cron state, job producers, registered handlers, recurrence rows, and current HTTP cron payloads. Compare the current `@chester-hill-solutions/jobqueue` package with CallCaster requirements. Output: package extension API, producer-handler matrix, migration plan from the local job table/poller, and scheduler architecture decision.
- **Auth-package investigator:** map the current public exports and release/install state of CHS `auth`, `auth-postgres`, and `auth-react-router`; compare Quick Canvass and CallCaster invite/authz needs; identify schema compatibility and migration constraints. Output: a three-package API proposal and adoption/release sequence.
- **Programmatic-surface investigator:** enumerate each user-visible mutation/read journey and its current loader/action/domain service. Classify trust-root/provider/public/internal exclusions and map every in-scope action to a proposed stable `operationId`, capability, canonical workspace route, idempotency requirement, and existing/new domain service. Output: the API parity ledger that later PRs must close.
- **Quality investigator:** run read-only-safe or isolated quality checks, record current test counts, coverage behavior, typecheck scope, and expected generated diffs. Output: baseline pass/fail ledger with reproducible commands.

**Gate W0**

- Findings are revalidated against current HEAD.
- Existing failures are documented.
- Migration authority and repair strategy have evidence from every relevant deployed ledger.
- Duplicate-version detection is fixed, and any required forward-only ledger repair is completed before later waves add schema migrations.
- The CHS jobqueue extension API and publish/adoption sequence are approved before worker or scheduler implementation.
- The CHS auth package API and publish/adoption sequence are approved before SEC-03 or SEC-07 implementation.
- Every registered job type has a producer/owner decision: implement or remove.
- The verification strategy distinguishes user-owned dirty-tree changes from remediation-generated drift.
- No implementation begins on an ambiguous caller/trust model.
- The API parity ledger accounts for every user-visible action and records each explicit exclusion.

### Wave 1 — Contain exploitable boundaries

Suggested PRs:

**Shared auth package tranche:** land and release the approved `auth`, `auth-postgres`, and `auth-react-router` extensions with package-level tests and migration guidance.

**Authorization foundation:** after the package tranche is consumable, implement `SEC-07` in CallCaster: typed product capability registry, session-role resolution through CHS feature permissions, API-key scope storage, and one actor-aware route guard. This precedes every dual-auth programmatic action below.

**Cutover API foundation:** extend the existing TypeScript → JSON → Hey API pipeline, secure/document the routes required by SEC-01/02/05 and the active integrator surface, and keep current campaign/SMS/chat-SMS contracts compatible. Versioned aliases, keyset pagination, broad SDK growth, and 90-day sunsets are post-cutover API-01 work.

**Canonical membership migration:** this is not present in the current `drizzle/0000_baseline.sql`, `app/db/schema.ts`, or `scripts/schema-transform/09-drop-legacy-presence.sql`; treat it as an explicit new cutover blocker, not completed migration work. After the CHS package schema release, update the Drizzle baseline/forward migration, every reader/writer, E2E seeds, and the Supabase-to-Postgres transform so customer membership/invitation data lands directly in the shared UUID-based role/member/feature schema. Rehearse clean install and full import, then verify per-workspace/user/role parity before cutover.

**Audit foundation:** implement AUDIT-01 before merging trust-root, key, invitation, retention, recording, or support mutations that depend on it.

1. `SEC-01`: secret-free workspace API with strict role/schema.
2. `SEC-02`: predictive-dialer caller authentication and tenant derivation.
3. `SEC-05`: disconnect deletion or authenticated workspace ownership.
4. `SEC-06`: signed inbound phone verification.
4a. `SEC-08`: imported identity/session cutover and mandatory owner/admin MFA re-enrollment.
5. `SEC-03`: invite binding and transactional consumption.
6. `DATA-01`: mandatory queue tenancy.
7. `SEC-04a`: enforce safe fetch or disable stored production delivery; defer durable retry/signing/history to Wave 3.

Parallelism:

- SEC-01, SEC-03, and SEC-04a are largely independent after their Wave 0 decisions.
- SEC-02, SEC-05, and SEC-06 have distinct caller identities and should remain separate even if one reviewer owns all three.
- DATA-01 should not overlap with telephony queue-state changes in Wave 2.

**Gate W1**

- Every programmatic route declares and enforces a stable capability ID for both session and API-key actors.
- Cross-tenant and wrong-role tests exist for each affected operation.
- No response snapshot contains provider credentials.
- Every telephony control path has an explicit trust classification.
- SSRF tests cover private addresses, metadata, redirects, DNS changes, timeouts, and unsafe headers.
- No enabled stored-webhook path can reach the raw-fetch implementation.
- `tools:api:surface:check`, OpenAPI export/codegen drift checks, and SDK contract tests pass for the existing integrator surface plus cutover-critical operations.
- Imported owner/admin users cannot enter a workspace or perform trust-root actions until new Better Auth MFA enrollment completes.
- Every privileged mutation emits a redacted append-only audit event, and cross-workspace/support access tests prove the owner-visible boundary.

### Wave 2 — Restore telephony and money integrity

Suggested PRs:

**Shared jobqueue tranche:** extend, test, and publish `@chester-hill-solutions/jobqueue` with the approved fencing, scheduling, idempotency, recurrence, and typed-registry APIs.

**Worker foundation:** install the published package, migrate the job schema and each implemented local handler, deploy/health-check `callcaster-worker` on Railway review, and prove stale-worker rejection before billing schedules or provider-effect jobs depend on it. Delete the local poller only after producer/handler/state parity is demonstrated; do not discard the existing open-sync, billing, compliance, and webhook-audit handlers.

8. `TEL-01`: monotonic call-state transition module and replay tests.
9. `TEL-05`: monotonic message-state transition module and replay tests.
10. `TEL-02`: durable call intent and compensation.
11. `TEL-03`: ACD entry correlation, release, and stale recovery.
12. `TEL-04`: billing-capable open-sync recovery through both canonical state processors.
13. `BILL-01` + `BILL-02`: durable per-workspace scheduling and rental catch-up.
14. `BILL-03`: unit-correct reconciliation.
14a. `BILL-04`: durable reserve-first number-purchase saga and recovery.
14b. `BILL-05`: prepaid SMS and bounded voice credit reservations/settlement.

Dependencies:

- TEL-01 and TEL-05 precede TEL-04.
- Published jobqueue adoption and `ASYNC-02` precede BILL-01.
- TEL-02 should establish the external-effect pattern reused by ASYNC-01.

**Gate W2**

- Callback-order property tests cannot regress terminal state.
- Lost callback simulation recovers terminal status and exactly one ledger debit.
- Provider success plus DB failure leaves a compensatable/recoverable record.
- ACD agent/entry state is released under every failure path.
- One delayed scheduler run catches up all due rental cycles once.
- Reconciliation fixtures report zero variance for valid multi-unit usage.
- Number-purchase crash-point tests converge to one paid active number or one idempotent refund.
- Concurrent SMS/call starts cannot allocate the same credits; final settlement releases unused holds and stays within the documented voice exposure bound.
- A stale worker cannot heartbeat, complete, fail, or cancel a reclaimed job.

### Wave 3 — Make asynchronous work durable

Suggested PRs:

16. `ASYNC-01`: outbound-message intent, explicit unknown-outcome state, and worker dispatch.
17. `ASYNC-03a`: campaign export handler.
18. `ASYNC-03b`: audience upload handler and resumable/idempotent chunks.
19. `SEC-04b` + `ASYNC-03c`: signed safe webhook-delivery handler with retries, history, and dead letters.
20. `ASYNC-04`: implement automated message/robocall campaign dispatch with per-contact durable child jobs; exclude predictive/manual campaigns.
20a. `DATA-02`: retention policy schema, deletion/tombstone jobs, object/database purge, legal holds, and restore behavior.

Dependencies:

- Wave 2's published jobqueue adoption and `ASYNC-02` precede every worker-backed feature.
- SEC-04a safe-delivery enforcement precedes SEC-04b/ASYNC-03c retries.
- Upload field allowlisting and size limits belong in PR 18.

**Gate W3**

- Two-worker lease tests prove stale workers cannot heartbeat, complete, or fail reclaimed jobs.
- Every registered production job type has an implemented handler or is removed.
- Restart tests leave no permanently processing export/upload.
- A confirmed SMS attempt cannot be redispatched for the same client request; ambiguous provider outcomes are quarantined and surfaced rather than automatically resent.
- Webhook recipients can verify signatures and inspect delivery history.
- Retention dry-runs and deletion jobs prove tenant-safe database/object cleanup, legal-hold preservation, and no resurrection after a restore rehearsal.

### Wave 4 — Repair journeys and UX

Suggested PRs:

21. `SURVEY-01`: respondent identity, isolation, validation, and durable completion.
22. `PRODUCT-01`: shared permission matrix and role-driven navigation.
23. `PRODUCT-02`: canonical pricing presentation.
24. `UX-01` + `UX-02`: mobile navigation and form accessibility.
25. `UX-03`: campaign return context, actionable empty states, Call History cleanup, and Handset as the sole live agent destination.
25a. `COMPLIANCE-01`: recording/monitoring attestation, warnings, audit trail, and configurable announcement tooling.
25b. `COMPLIANCE-02`: data-flow/subprocessor register, region verification, and customer disclosures.

**Gate W4**

- Multi-page survey E2E covers required validation, reload/resume, failed save, retry, and successful completion.
- Role matrix tests cover direct URLs and actions, not only hidden navigation.
- Public and billing prices are rendered from one canonical source.
- Keyboard tests cover opening, traversing, closing, and restoring focus for mobile navigation.
- Error descriptions are programmatically associated with invalid controls.
- Recording/monitoring settings require current attestation, and published residency/subprocessor disclosures match verified infrastructure.
- Recording/monitoring cannot be enabled without current admin attestation, and supervisor actions are owner-visible in audit history.

### Wave 5 — Ratchet assurance and architecture

Suggested PRs:

26. `QA-02`: complete TypeScript projects and hosted strictness gates.
27. `QA-01`: truthful all-runtime coverage thresholds.
28. `ARCH-02`: deepen one proven module seam at a time.
29. `DOC-01`: current-state documentation reconciliation, including the completed ARCH-01 evidence and repair.
30. `OPS-01`: PITR configuration, restore runbook, and production-shaped isolated restore rehearsal.
31. `OPS-02`: OpenTelemetry/Grafana Cloud instrumentation, dashboards, SLOs, alerts, and runbooks.

**Gate W5**

- Hosted CI mirrors the agreed local bar.
- App, routes, server, worker, shared, services, and tests receive semantic typechecking.
- Coverage output states actual percentages and includes every production root.
- ARCH-01's earlier duplicate-version guard and forward repair remain green against clean and upgraded databases.
- Architecture changes reduce interfaces or caller knowledge; they do not merely create more files.
- Active docs agree on runtime, worker, migration, route, and package status.
- The parity ledger has no unimplemented in-scope action and no undocumented exception.
- A dated isolated restore rehearsal meets RPO ≤5 minutes and RTO ≤60 minutes with integrity and app smoke evidence.
- Review-environment traces cross request/job/provider boundaries, dashboards calculate the agreed SLIs, and synthetic alert tests reach the assigned owner.

## 10. Verification matrix

### Required during development and on every PR

Run the smallest relevant tests during development. Before handoff, run the affected suites plus these structural checks when the PR touches their domains:

```bash
npm run typecheck
npm run lint
npm run tools:routes:verify
npm run tools:api:surface:check
npm run check:route-server-leaks
npm run check:twilio-webhooks
npm run check:middleware
npm run check:credit-writes
npm run check:effects
```

Run `npm run test:node`, `npm run test:ui`, build, and bundle checks at integration gates or when affected. Include `npm run check:type-safety` once the current working-tree gate is integrated.

### Required at phase boundaries

```bash
npm run ci:local
npm run tools:check-file-size
npm run test:coverage
npm run test:e2e:compose
```

`npm run ci:local` includes `git diff --exit-code`. Run it only in a clean remediation worktree/branch. In the shared dirty tree, run its constituent commands and compare the resulting diff with the Wave 0 baseline.

Money, telephony, scheduler, and migration phases additionally require:

- replay and out-of-order callback tests;
- cross-workspace adversarial tests;
- concurrent worker/queue tests against real Postgres;
- clean database migration;
- upgrade-path migration from the observed deployed ledger state;
- failure injection at each external-effect boundary.

### Runtime smoke after static verification

Do not treat unit tests as sufficient for:

- Twilio signature URL construction;
- parent/subaccount credential selection;
- call creation and callback correlation;
- Stripe checkout/webhook convergence;
- S3 upload and export download;
- worker restart/lease expiry;
- public survey reload/resume;
- keyboard/focus behavior.

Use the review environment and documented test credentials only after the orchestrator confirms scope and safety.

## 11. Definition of done for each finding

A finding is complete only when:

1. The root cause is removed, not merely guarded in the UI.
2. A negative or failure-path test demonstrates the prior vulnerability or correctness gap.
3. The implementation follows tenant, billing, auth, and provider invariants.
4. Relevant structural guards are extended when the pattern could recur.
5. Documentation describes the implemented behavior.
6. The adversarial reviewer signs off.
7. The orchestrator records residual risk and compatibility impact.

## 12. Decision log required during execution

Record these decisions in the PR or an ADR before dependent work proceeds:

- **Deferred by decision (2026-07-13):** encrypted per-workspace credential vault work is outside this remediation.
- **Approved (2026-07-13):** CHS auth three-package extension API and publish/adopt sequence per [`wave0-auth-gap-analysis-2026-07-13.md`](./wave0-auth-gap-analysis-2026-07-13.md).
- **Approved (2026-07-13):** CHS jobqueue extension API and publish/adopt sequence per [`wave0-worker-matrix-2026-07-13.md`](./wave0-worker-matrix-2026-07-13.md).
- **Approved (2026-07-13):** remediation branch workflow — `chore/improvements` off `chore/effects-strictness`, squash-merge back.
- **Adjusted:** predictive dialer start is `POST /api/workspaces/:workspaceId/campaigns/:campaignId/dialer/start` at cutover, with a post-cutover `/api/v1` alias. Sessions require `caller+` and act as themselves; API keys provide a verified `caller+` workspace member as `agentUserId`. Both legacy auto-dial endpoints are deleted, while next-turn remains internal-only.
- **Adjusted:** replace `/api/disconnect` with workspace-scoped dual-auth call control at `POST /api/workspaces/:workspaceId/calls/:callSid/disconnect`; a `/api/v1` alias follows post-cutover. Any `caller+` session or API key with the call-control capability may control any call in that workspace.
- **Adjusted:** hard-delete `/api/workspace`; finish the existing secret-free `GET/PATCH /api/workspaces/:workspaceId` route and its data-plane dual-auth boundary. Session mutation requires `admin` or `owner`; API-key authority follows the cross-cutting API-key policy.
- **Resolved:** sessions and workspace API keys share stable, deny-by-default capability IDs. CHS role/feature permissions resolve session capabilities; CallCaster keys store explicit capability allowlists.
- **Resolved:** capability granularity is resource-operation level, independent of HTTP route layout.
- **Resolved:** CallCaster uses fixed seeded owner/admin/member/caller capability templates for cutover; custom roles and workspace overrides are deferred.
- **Resolved:** existing unscoped keys receive only the legacy campaign-create/SMS capability set; new programmatic powers require explicit grant or reissue.
- **Resolved:** API keys expire by default after 90 days and may not exceed one year.
- **Resolved:** API-key capability sets are immutable; changing scopes requires key replacement.
- **Resolved:** programmatic parity excludes trust-root actions. Identity, 2FA, ownership transfer, provider-secret changes, and API-key lifecycle remain owner-session operations; admins or owners may initiate staged workspace deletion. All require step-up and none allow API keys.
- **Adjusted:** extend the current TypeScript-authored OpenAPI pipeline; JSON exports feed served docs and the narrow `integrator-api.json` Hey API SDK, and CI rejects drift.
- **Adjusted:** existing unversioned APIs remain stable through cutover. `/api/v1/...` aliases and any ADR-0018 supersession are post-cutover work; breaking changes require a new URL major.
- **Resolved:** existing campaign-create/SMS/chat-SMS API routes receive a 90-day measured deprecation window after versioned replacements ship.
- **Resolved:** externally effective API creates require idempotency records retained for seven days; changed-payload key reuse returns `409`.
- **Resolved:** new `/api/v1` collections use opaque keyset cursors, default 50 and maximum 100 items; unversioned collections retain offset pagination until sunset.
- **Resolved:** API rate limits are operation-tiered and enforced per actor/key plus workspace aggregate, with provider throughput as an additional bound.
- **Resolved:** distributed API rate limits use atomic Postgres buckets initially; in-memory enforcement is not authoritative.
- **Resolved:** trust-root step-up is session-bound recent password re-auth plus 2FA when required, valid for 10 minutes.
- **Resolved:** Supabase MFA secrets are not migrated; sessions invalidate and imported owner/admin users must re-enroll in Better Auth before workspace access.
- **Resolved:** MFA recovery without a factor/code requires platform-support identity verification, dual control, 24-hour delay, and owner notifications.
- **Resolved:** workspace invitations are email-first, hashed-token Better Auth magic links modeled on Quick Canvass, with explicit expiry and atomic single-use redemption bound to the authenticated verified email.
- **Resolved:** invitation grants are strictly downward: admin→member/caller, member→caller; API keys also require an explicit assign-role capability, and ownership is never invitational.
- **Resolved:** `member` is a content/data collaborator; campaign dispatch, peer administration, bulk export, and workspace/provider/billing configuration begin at admin.
- **Resolved:** invitation creation requires `members:invite`; session and API-key grant authority is bounded, and ownership cannot be granted by invitation.
- **Resolved:** implement reusable authorization/invitation infrastructure across CHS `auth`, `auth-postgres`, and `auth-react-router`; keep CallCaster capability IDs and API-key persistence product-specific.
- **Resolved:** publish versioned CHS auth package releases before CallCaster consumes them; no temporary `file:`-linked implementation path.
- **Resolved:** CallCaster is the first consumer in this program; Quick Canvass migration follows separately, and NES Dashboard is out of scope.
- **Resolved:** extend and publish CHS `jobqueue` before CallCaster worker adoption; the local poller is replaced rather than independently repaired.
- **Resolved:** recurring jobs originate from durable database schedule definitions materialized by the worker into idempotent occurrence jobs.
- **Resolved:** recurrence is UTC cron; all stored times and materialized `next_run_at` values are UTC.
- **Resolved:** global recurring work uses a coordinator occurrence with durable, idempotent per-workspace child-job fan-out.
- **Resolved:** `campaign_dispatch` owns automated message/robocall campaigns only; predictive/manual calling remains agent-driven.
- **Resolved:** surveys support explicit anonymous and contact-bound modes; only a signed contact-bound token may associate a response with a contact.
- **Resolved:** respondent links expire at survey close, capped at 90 days; completed responses are read-only unless explicitly reopened and reissued.
- **Resolved:** anonymous survey abuse controls use adaptive Turnstile plus shared rate limits/honeypots; contact-bound links normally avoid challenge friction.
- **Resolved:** use the balanced category-specific retention profile in DATA-02, automatic deletion, admin-configurable periods, and legal-hold override.
- **Resolved:** admins may change retention and initiate staged deletion with step-up; owners are notified and may cancel during 30 days; API keys are read-only for retention policy.
- **Resolved:** recording/monitoring compliance remains customer-owned, but explicit admin attestation, persistent warnings, configuration tooling, and audit logs are mandatory.
- **Resolved:** there is no Canada-only residency promise; processor regions/transfers are documented, minimized, contractually disclosed, and verified.
- **Resolved:** workspace audit trails are owner-visible and available to API keys with `audit.read`; platform-support access is reason-coded and owner-visible.
- **Resolved:** CHS workspace auth uses UUID workspace/user foreign keys; CallCaster migrates to the canonical role/member/feature tables rather than keeping a legacy membership adapter.
- **Resolved:** membership-schema replacement is atomic on the not-yet-customer-facing Postgres target and ships as part of the Supabase cutover; no long-lived dual-write or compatibility view.
- **Resolved:** the production traffic switch is the authority boundary; Supabase is rollback only before the switch and read-only afterward, while post-switch recovery stays on Postgres.
- **Resolved:** retain the frozen Supabase source read-only for 90 days after cutover, then export required audit records and destroy it after sign-off.
- **Resolved:** post-cutover schema and app/worker changes use expand-contract compatibility; atomic replacement is limited to the unused pre-customer target.
- **Resolved:** cutover stops new effects, drains active voice, migrates unresolved durable work, repoints callbacks, and reconciles on Postgres before dispatch resumes.
- **Resolved:** cutover is a directly coordinated, low-traffic migration with one accountable owner, automated/parity gates, a recorded go/no-go decision, and a target window under two hours.
- **Resolved:** Drizzle migrations are the sole Railway/Postgres schema authority; Supabase `client/migrations` is frozen source history and is not replayed on the target.
- **Resolved:** coverage uses a truthful all-runtime baseline ratchet plus changed-file coverage; thresholds may only rise.
- **Resolved:** Call History is historical/reporting only; Handset is the sole live inbound/agent destination.
- **Resolved:** campaign dependency creation uses a persisted draft plus validated return context, then resumes the same setup step with the new resource selected.
- **Resolved:** pricing displays both credits and CAD equivalents from one shared rate card with explicit segment, started-minute, and rental semantics.
- **Resolved:** production database recovery targets are RPO ≤5 minutes and RTO ≤60 minutes with PITR and quarterly isolated restore tests.
- **Resolved:** the same recovery commitment covers non-regenerable customer objects; generated exports, quarantine, caches, and reproducible derivatives are not backed up.
- **Resolved:** app/API availability target is 99.9% monthly; OpenTelemetry exports metrics/traces/logs via OTLP to Grafana Cloud with burn-rate alerts.
- **Resolved:** the dedicated Bun worker using CHS jobqueue is the sole durable background executor; web requests enqueue work and do not launch unawaited product effects.
- **Resolved:** global schedules enqueue durable coordinator occurrences, which fan out idempotent per-workspace jobs.
- **Resolved:** SMS promises durable submission and at most one automatic provider attempt per intent, with ambiguous outcomes quarantined; outbound webhooks are at-least-once.
- **Resolved:** seven-day grace, then suspension, then automatic provider release after 30 unpaid days with owner/admin warnings; payment before release restores service.
- **Resolved:** phone-number purchases reserve/debit credits before provider provisioning and use an idempotent refund compensation on failure.
- **Resolved:** SMS/MMS requires exact estimated reservation; voice reserves the first minute and receives a concurrency-aware bounded duration budget before dialing.
- **Resolved:** call statuses use provider sequence ordering when available; without it, first terminal wins and conflicts go to reconciliation.
- **Resolved:** call/message reducers enforce the canonical forward state machines in TEL-01/TEL-05; provider sequence wins, otherwise rank plus first-terminal conflict handling applies.
- **Resolved:** ambiguous call creation is reconciled and quarantined without automatic redial; durable intent/callback correlation recovers known provider calls.
- **Resolved:** SMS submission creates a durable resource synchronously (`201` new, `200` idempotent replay); provider delivery proceeds asynchronously.
- **Resolved:** ambiguous SMS provider outcomes receive bounded reconciliation, never automatic resend; an explicit warned user action may create a new message.
- **Resolved:** outbound webhooks are signed, at-least-once, and retried at most eight times over 24 hours; redirects are rejected and `410` disables the endpoint.
- **Resolved:** outbound webhook destinations are public HTTPS only with delivery-time DNS/IP validation and rebinding protection.
- **Resolved:** uploads use private quarantine and fail-closed ClamAV scanning on Railway before normalized output is promoted.

## 13. Progress tracker

### Wave 0

- [x] Revalidate repository and existing failures — [`wave0-state-manifest-2026-07-13.md`](./wave0-state-manifest-2026-07-13.md), [`wave0-quality-baseline-2026-07-13.md`](./wave0-quality-baseline-2026-07-13.md)
- [x] Map endpoint consumers and trust models — [`wave0-trust-matrix-2026-07-13.md`](./wave0-trust-matrix-2026-07-13.md)
- [x] Inventory every user action in the API parity ledger — [`wave0-api-parity-ledger-2026-07-13.md`](./wave0-api-parity-ledger-2026-07-13.md)
- [x] Identify migration authority in each environment — [`wave0-migration-manifest-2026-07-13.md`](./wave0-migration-manifest-2026-07-13.md)
- [x] Inspect deployed migration ledgers — review PG18: 38 `supabase_migrations` rows; `AUTH_migrations` absent
- [x] ARCH-01 duplicate-version guard and forward-only repair — `20260705000200` not on review; renumber before apply
- [x] Approve CHS jobqueue extension API and release sequence — **approved 2026-07-13**
- [x] Approve CHS auth/auth-postgres/auth-react-router extension APIs and release sequence — **approved 2026-07-13**
- [x] Inspect worker and cron deployment state — worker matrix documents HTTP cron NULL regression; Railway worker image status per delivery board
- [x] Classify every registered job type as implement or remove — 10/10 in worker matrix
- [x] Establish dirty-tree-safe verification baseline — quality baseline doc; user WIP preserved

### Wave 1

- [ ] Publish/adopt CHS auth package extensions
- [ ] SEC-07 shared capability authorization
- [ ] API-01 existing OpenAPI/Hey API cutover foundation — telephony + audit read routes documented; capability stubs for SEC-07
- [x] AUDIT-01 immutable workspace audit foundation — append-only schema, writer, cursor-paginated owner read route, consumers (disconnect, dialer/start, api-keys, workspace PATCH/DELETE)
- [x] SEC-01 workspace secret boundary — deleted `POST /api/workspace`; scoped `GET/PATCH/DELETE` uses data-plane auth; PATCH requires admin+
- [x] SEC-02 predictive dialer auth — deleted `/api/auto-dial` and `/api/auto-dial/dialer`; added workspace dialer/start; hardened auto-dial/end
- [ ] SEC-03 invite binding
- [x] DATA-01 queue tenancy — mandatory `workspaceId` on queue mutations; UI/API queue routes scoped
- [x] SEC-04a safe/disabled stored webhook boundary — production fanout uses `safeOutboundFetch`
- [x] SEC-05 disconnect auth/removal — deleted `/api/disconnect`; added workspace-scoped disconnect
- [x] SEC-06 inbound verification signature — main-account Twilio signature on `/api/inbound-verification`
- [x] SEC-08 auth cutover and MFA re-enrollment — data-plane MFA gate, role-elevation/ownership 2FA checks, enrollment rate limits (cutover session invalidation remains pre-launch)

### Wave 2

- [ ] Publish/adopt CHS jobqueue extension
- [ ] ASYNC-02 worker lease fencing
- [ ] TEL-01 monotonic call state
- [ ] TEL-02 durable call intent
- [ ] TEL-03 ACD lifecycle recovery
- [ ] TEL-04 open-sync recovery
- [ ] TEL-05 monotonic message state
- [ ] BILL-01 scheduler architecture
- [ ] BILL-02 rental catch-up
- [ ] BILL-03 reconciliation units
- [ ] BILL-04 reserve-first number purchase
- [ ] BILL-05 prepaid provider reservations

### Wave 3

- [ ] ASYNC-01 durable SMS intent
- [ ] ASYNC-03 export/upload/webhook handlers
- [ ] ASYNC-04 automated campaign dispatch
- [ ] DATA-02 retention and deletion lifecycle

### Wave 4

- [ ] SURVEY-01 respondent journey
- [ ] PRODUCT-01 permission matrix
- [ ] PRODUCT-02 canonical pricing
- [ ] UX-01 mobile navigation
- [ ] UX-02 form accessibility
- [ ] UX-03 journey dead ends and agent surfaces
- [ ] COMPLIANCE-01 recording/monitoring controls
- [ ] COMPLIANCE-02 residency/subprocessor disclosures

### Wave 5

- [ ] API-01 close programmatic parity ledger
- [ ] QA-01 truthful coverage
- [ ] QA-02 hosted CI/runtime type safety
- [ ] ARCH-02 module deepening
- [ ] DOC-01 current-state docs
- [ ] OPS-01 PITR and restore rehearsal
- [ ] OPS-02 telemetry, SLOs, and alerts

## 14. Final orchestration handoff

Start another agent with:

```text
/orchestrator

Execute docs/remediation/critical-review-orchestration-plan-2026-07-12.md.

Begin with Wave 0 only. Revalidate every finding against the current working tree, preserve all existing user changes, and report any contradiction before editing. Use the supervisor/coordinator pattern and the agent briefs in the plan. Do not begin a dependent wave until its gate is met. Keep findings, branches, tests, and status updates keyed by the IDs in the plan.
```

The orchestrator should update this document's checkboxes as work is completed, but should not weaken an exit criterion without recording the reason and residual risk.
