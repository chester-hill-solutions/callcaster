# Handoff — Supabase-exit robustness plan (hardening)

**Date:** 2026-09-05
**Handoff source session:** `ses_f8e04a8e5ffeDyarFLMPDzKcDQ`

## Status as of 2026-09-05 (end of day)

Everything below landed on `dev` as one PR per issue. Do not re-verify these.

| Phase | Item | Issue | PR |
| --- | --- | --- | --- |
| 1 | Contacts API bound to the authorized workspace | #1541 | #1545 |
| 1 | Tenant db `update` strips the tenancy column at runtime | #1542 | #1544 |
| 1 | Workspace invites validate the role and enforce the escalation guard | #1543 | #1546 |
| 2 | Client-migration bootstrap holds an advisory lock | #1547 | #1549 |
| 3 | accept-invite refuses account creation while signup is closed | #1550 | #1552 |
| 3 | Browser password reset surfaces failure, stops trimming | #1559 | #1562 |
| 3 | JSON reset endpoint public, carries the token | #1560 | #1568 |
| 3 | Password reset revokes existing sessions | #1561 | #1565 |
| 3 | Bearer sign-out revokes the session token | #1563 | #1566 |
| 3 | Account security verify forwards Better Auth cookies | #1564 | #1573 |
| 3 | Two-factor turned off behind `TWO_FACTOR_ENABLED` (product decision) | #1567 | #1569 |
| 4 | Worker complete/fail/heartbeat fenced to the claiming worker | #1548 | #1551 |
| 4 | Schedule-chain watchdog + reschedule-failure alert | #1570 | #1572 |
| 5 | Number-rental technical failures kept out of the non-payment ladder | #1555 | #1556 |
| 5 | Open-sync queues the SMS billing job before the terminal write | #1571 | #1574 |
| 6 | Inbound MMS attachments signed for the chat view | #1557 | #1558 |
| 6 | Campaign media delete is reference-safe | #1575 | #1576 |
| 6 | S3 missing key normalized to `ObjectNotFoundError` | #1577 | #1579 |
| 7 | Compose reset/purge scripts refuse non-local targets | #1553 | #1554 |

Still open, by design:

- **Durable SMS send outbox** (Phase 5): designed in #1578, awaiting review before implementation.
- **Backup-code login** (Phase 3): moot while two-factor is off.
- **Decisions for the owner**: per-file migration failure stopping boot (#1547 body; would break fresh PR environments), Railway `checkSuites: false`, and the six `SUPABASE_*` variables still set in production.

## Goal

Implement the Supabase-exit robustness plan on a current baseline. The app
migrated from Supabase to direct Postgres + Drizzle on Railway. Fix the
security, reliability, billing, and operational gaps found in the multi-domain
audit. Preserve the user's billing work (safe on a remote branch). Do **not**
deploy, revoke credentials, mutate live DBs, or open PRs without the user.

## Acceptance checks

- Changes built on current `origin/dev` (`0e3b13a4`), not the stale Aug-28 local
  checkout — no re-implementing already-fixed items (#1476 waiting, #1230 bigint,
  SMS pacing/dedup, credit checks, IVR dup, owner-transfer MFA, Twilio checker,
  boot-ledger union).
- Regression test per repaired boundary (red/green; kill-check tests, no
  tautologies).
- Full `npm run ci:local` green before any push/PR.
- No unsupported claims of live provider recovery or operational verification.

## Current baseline

- Main worktree: `dev` at `0e3b13a4` (current `origin/dev`, clean working tree).
- Hardening worktree: `/tmp/opencode/callcaster-hardening`, branch
  `fix/supabase-exit-hardening` (from `origin/dev@0e3b13a`), `npm ci` done, **no
  code changes yet**.
- User's 13 billing/housekeeping/docs files are on remote branch
  `wip/billing-rate-and-docs-pickup` (3 commits:
  `3ecac844` billing rates, `cb597f0a` agent docs, `42cb3a1d` roadmap docs).
  Do **not** touch these files on the main worktree.

## Done

1. Multi-domain audit complete (auth, DB, workers, storage, deployment) via 5
   sub-agents; findings reconciled against remote `dev` + prod. Already-fixed
   items removed from scope.
2. Branch reconcile: main `dev` fast-forwarded `1079785f` → `0e3b13a4` (83
   commits). User's 13 files stashed, reapplied, and pushed to the pickup branch.
   Two pricing conflicts (`pricing.tsx`, `test/public-pricing.test.ts`) resolved
   keeping upstream #1392 (user approved).
3. Board goal/acceptance updated.

## Remaining — implementation backlog (board todo list)

Order by risk. Phase 1 is the highest-risk security fix and should go first.

1. **Phase 1 — Access boundaries (security)**
   - Contact workspace binding: `app/routes/api+/contacts.action.server.ts:37`
     reads `workspace_id` from the request body; `createContact(data)` trusts
     `data.workspace` (different field) at `app/lib/database/contact.server.ts:352`.
     Authorize and bind via the **same** workspace value; don't trust form body.
     Also `bulkCreateContacts(data.contacts, workspaceId, …)` at line 58-63.
   - Tenant column immutability: `app/server/tenant-db.ts:98` `update` passes
     `opts.set` through un-stripped — a caller could reassign the tenancy column
     at runtime. Types only strip it in `ScopedUpdate` (compile-time, not
     runtime). Strip (or reject) the workspace column from `set` at runtime; test
     both tenant column names (`workspace` / `workspace_id`).
   - Invitation role escalation: `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts:21`
     `handleAddUser` calls low-level `inviteUserByEmail` with `new_user_workspace_role`
     unvalidated — a member can invite themselves as owner/admin. Route
     `app/routes/workspaces+/$id/settings.action.server.ts:40` allows role
     `"addUser"` at Member level. Use the actor-aware
     `inviteWorkspaceMember(userId, workspaceId, email, role)` from
     `app/lib/platform-members.server.ts:338` (enforces
     `assertNoRoleEscalation`) and validate the requested role against the
     allowed `MemberRole` set. Note admin invite route
     `app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts:27` also
     uses `handleAddUser`.
2. **Phase 2 — Migration fail-closed** (`app/server/bootstrap-migrations.server.ts`)
   - Migration failure must stop boot (no server readiness), not continue.
   - Lock migration ownership; atomic tracking; handle enums in separate commits.
3. **Phase 3 — Auth lifecycle**
   - Password-reset session revocation; real bearer logout (not cookie-only);
     JSON reset-token auth schema; browser reset failure must not return success
     or trim password; forward MFA mutation cookies; backup-code login path;
     native MFA disable policy; `/accept-invite` must not bypass signup-closed.
4. **Phase 4 — Worker fencing** (`app/lib/worker/poll-jobs.server.ts`)
   - Stale worker claims: heartbeat/claim tokens; a stale worker must not
     complete/fail another worker's claim. Recurring schedule survival in
     `app/lib/worker/handlers/shared.server.ts`; successor insert failures must
     not drop future schedules.
5. **Phase 5 — Billing & delivery**
   - `app/lib/number-rental-billing.server.ts`: distinguish paid vs unaffordable
     vs technical failure BEFORE warn/suspend/release; scan paid cycles even if
     earlier unaffordable; technical failure must never punish the customer.
   - `app/lib/twilio-open-sync.server.ts`: terminal-status-before-enqueue billing
     gap (bounded reconciliation or transactional intent only, no re-pricing).
   - `app/lib/campaign-sms-send.server.ts`: durable send-outbox (line ~85).
6. **Phase 6 — Media stability**
   - `app/lib/chats/fetch-message-page.server.ts:30` — signedUrls always empty.
   - `app/lib/object-storage.server.ts` — media reference stability; inbound MMS
     keys resolved after scoped message read; reference-safe DELETE; S3 404
     normalization.
7. **Phase 7 — Deployment safeguards**
   - `.railway/config/shared.ts:5` `checkSuites:false` — gate deploys.
   - Protect destructive tools: `scripts/e2e/run-compose-e2e.mjs` (line ~22,
     docker compose up), `scripts/e2e/bootstrap-compose-reset.sql` (DROP SCHEMA),
     `scripts/e2e/ensure-minio-bucket.mjs` (purge default, line ~56). Add
     target-safety guards so a stray env var can't point them at prod.
   - 6 `SUPABASE_*` env vars still in production — flag, do NOT revoke without
     approval.
8. **Phase 8 — Review & CI**
   - Review all changes, run `npm run ci:local` fully (NOT yet run on this
     branch since reconcile), report real blockers.

## Parallel-agent claims (active)

From the earlier (failed, credit-exhausted) subagent fan-out, claims exist on
these groups in `/tmp/opencode/callcaster-hardening` under `ses_f8df`:
`app/lib/object-storage.server.ts`, `{number-rental-billing,low-credit-notify,
ops-alert}*`, `{bootstrap-migrations.server.ts, server/bun.ts,
scripts/db/bootstrap-fresh-db.mjs, scripts/e2e/bootstrap-compose-db.mjs,
scripts/lib/app-db-objects.mjs}`, `worker/{webhook-side-effects,
twilio-open-sync}*`. Claims may have expired; check `claim_list` before editing
these paths or take over explicitly.

## Skills to load

- `tdd` (red/green, seams, no tautologies)
- `design-baseline` (if any UI work: source from `@chester-hill-solutions/ui-kit`)
- `code-review` (final review pass, two axes)
- `github-cli` (PR work if requested)

## Clipboard topics to read

- `tooling-rg-output-mangling` — rg output can mangle identifiers on multi-line /
  template-string code; cross-check grep results against the file.
- `overnight-nnna-loop` — nnna loop context (non-null assertions).
- `branch-reconcile` — how the pickup branch was created and pushed.

## Recipes

- `node-test` — `node --test`
- `e2e-flake-triage` — rerun failed e2e before diffing
- `qmd-update` / `qmd-search-smoke` — knowledge base refresh

## Pointers (no duplication)

- Audit findings / delivery plan: discussed in sessions; `AGENTS.md` has the
  route/API/billing/DB conventions.
- Issue board: `ISSUE_BOARD.md` at repo root (75+ open issues); enrichment data
  in `scripts/issue-board-enrichment/`.
- `docs/migration-delivery-board.md` — fresh-start decision (no bcrypt/bulk
  import).
- `docs/AGENT-PLATFORM-GUIDE.md` — CHS role, shared packages, branch boundaries.

## Recently-landed (do not re-implement)

#1476 waiting status, #1230 bigint, scheduled-start guard, SMS batch pacing/dedup,
credit checks, IVR dup checks, owner-transfer MFA, Twilio checker repair,
boot-ledger union. Also #1392 pricing rewrite (main `dev` already has it).

## Redactions

No secrets, tokens, or credentials in this document.