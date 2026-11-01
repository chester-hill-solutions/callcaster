# CallCaster — Open Issue Board for Agents

Base snapshots: complete native Issue metadata and Project export from 2026-10-29 UTC (401 issues; 398 Project rows). The full open-issue inventory was checked again on 2026-11-01 UTC: 403 issues, exactly matching this board. This is not a new full Project export. Unselected entries retain their dated evidence. Refresh the full board with npm run tools:issues:board.

Selected refresh, 2026-11-01 UTC: all 27 current Urgent/High issues plus #2533 and #2776. Native Type, Priority, Effort, Enviornment, owners, relationships and full timelines were read. Actual Project Status was read separately in the authenticated issue sidebar; no Status is inferred from a PR or label. The earlier full Project view omitted #100, #2902 and #2906; their Project Status stays unknown.

PR #3100 is merged and healthy on dev: #2533 now shows both elapsed session time and accumulated connected talk time. PR #3099 for #2776 is also merged and healthy; script errors use block names. Those tasks and the merged redirect repair #3073 move to Verify and close. Operator and release acceptance remain.

Take existing urgent and high-priority app requirements first. The approved batch #3070, contact import #3087, consent #3090, reviewed contact repair #3093, archive/restore #3094, archive-key revocation #3096 and released-number history #3097 are on dev. Parent #2546 remains In progress with three on-dev children; preserve #2089 and the CMS deferral under #2677. PRs #3081, #3086 and #3092 stay parked with their branches preserved. Use one open PR for the active branch.

The user made #2700 human-only: skip agent setup and acceptance. Keep receipt quantity #1981 and the stated 13% Ontario tax #1983 blocked. See [the account audit](docs/stripe-environments.md). The retention/repeat decision #2029 remains open despite Status on-dev. In #2168, the keep-list is delivered; name backfill and repeat policy remain, and workspace-row cleanup stays deferred. PR #2537 changed planning evidence only. No provider cleanup was run for this refresh.

Earlier selected updates remain: #1724 is answered and closed as completed; #2992–#2995 are on-dev; #2943 keeps its postal address by owner decision. Dev delivery and source tests do not replace operator, provider or release acceptance.

## How to use this board

1. Pick from **Fix now** first (confirmed, with an exact resolution path).
2. Read the full issue before starting: `gh issue view <number>`.
3. Claim it: `gh issue edit <number> --add-assignee @me`.
4. Use one active branch from `dev` and one open PR, kept in draft while work is unfinished. Follow the repository git and PR skills.
5. Issues marked **Verify and close** need a verification pass, not new code.

Lane assignments, root causes, resolution paths, and test gaps come from the audit in
`scripts/issue-board-enrichment/` — update those files when evidence changes.

## CHS backlog Status flow (project 9)

`gh project item-edit` does NOT close issues and must NOT move closed items:

- A fix merged to **dev** moves the issue's Status to **on-dev** (the `issue-on-dev`
  workflow does this; the project-on-dev-status skill backfills it). The issue stays OPEN.
- A manual verification pass moves it to **tested-on-dev**. Still open.
- When the fix is promoted to **master** the issue is CLOSED by the release PR, and the
  project's "Item closed" automation moves the item to **on-qa** automatically.
- **Never move a CLOSED issue by hand.** Closed items go to **on-qa** on their own;
  moving them (e.g. to `archive`) loses that signal.
- A CLOSED issue whose state reason is `not_planned`/`duplicate` is the ONE manual move:
  its Status goes to **archive**. Everything closed as completed stays in **on-qa**.

---

## Fix now — 22

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) Dev-environment PR acceptance suite
- Verdict: **Fix now** · Type: Task · Priority: Medium · Effort: Low · Environment: unset · Labels: devops/admin · Assignee: none · Updated: 2026-10-19
- Nothing in origin/master provides a dev-environment PR acceptance suite: the only PR-level end-to-end gate is the local docker-compose Playwright run, and the Twilio tier uses Twilio's free test credentials, not a CallCaster-dev account.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: This issue is an acceptance-suite work item, not a code defect, so nothing in the tree can 'fix' it in the usual sense. The upstream dependency is #1827 'Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it', which the board still lists in the 'Blocked / split first' lane (ISSUE_BOARD.md:565-574) with #1356 (dev DNS/IaC) ahead of it. manual: true because the missing artefact is a dev-environment acceptance run that only a person with the dev Twilio account and dev environment credentials can execute.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `test/integration-twilio/twilio-test-credentials.test.ts`
- Existing tests: None. `git ls-tree -r origin/master --name-only | grep -i acceptance` returns nothing, and there is no dev-environment Playwright project (e2e/playwright.config.ts and e2e/playwright.sim.config.ts both target the local compose/sim stack).

### [#3080](https://github.com/chester-hill-solutions/callcaster/issues/3080) Rate-limit failed password checks when disabling 2FA in account security
- Verdict: **Fix now** · Type: Bug · Priority: Low · Effort: Low · Environment: unset · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-29
- An authenticated ordinary account can repeat failed password checks on the local 2FA disable path without an application limiter.
- Current behavior: An isolated current-source probe made 15 wrong-password requests using the real local limiter module; all 15 reached the mocked disable API and returned Invalid password. The route checks session freshness and refuses protected accounts; no factor was removed.
- Root cause: The enable and TOTP verification branches have user-scoped setup limiters. The disable branch calls Better Auth disableTwoFactor without one.
- Resolution: Add a user-scoped limiter before the disable password check and include that credential surface in the guard. Preserve protected-account refusal and successful ordinary-account disable behavior.
- Look in: `app/routes/account.security.loader.server.ts`, `app/lib/two-factor-rate-limit.server.ts`, `scripts/check-auth-rate-limits.mjs`, `test/account-security.route.test.ts`
- Existing tests: Private scratch probe: 15 requests reached a mocked password provider. The working source hash stayed unchanged. This proves admission behavior, not password bypass or factor removal.
- Missing tests: Exhaustion blocks before the password provider; separate users and reset windows retain their own budgets.; Protected accounts remain refused, and an ordinary correct-password disable still works.; The regression must fail when its limiter is removed.
- Done when: Failed disable password checks are limited by the authenticated user identity before the provider call.; The source coverage guard detects a missing or wrong limiter on this operation.
- Tracker: New native Bug; Priority Low, Effort Low, Enviornment unset; Project Status Backlog. No assignee, PR, parent, children or native dependencies. File and implement separately from the public credential-budget repair #2867.

### [#2879](https://github.com/chester-hill-solutions/callcaster/issues/2879) Outbound credit gate reserves nothing, so concurrent voice dispatches overshoot the funded balance and drive…
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-29
- Recommended title: **Outbound credit gate reserves nothing, so concurrent voice dispatches overshoot the funded balance and drive workspace.credits negative**
- Outbound credit reservations are partly implemented on an unpublished branch. Handset preparation, phone audio replacement and final admission checks remain.
- Current behavior: Published dev still needs the outbound funding contract. The protected unpublished branch at be2e726b has reservation, manual and predictive work plus unfinished handset changes. The phone must replace browser mic and speaker; connecting it remains connection-only and must not start a contact or add a separate customer charge. This source is excluded from merge batch #3070.
- Root cause: The shared gate reads workspace.credits without locking or reserving the first-minute cost. HTTP, background IVR, test-call and predictive paths can each reuse that balance.
- Resolution: Build one workspace-scoped reservation contract under a workspace row lock. Count existing voice and number-purchase holds; retain uncertain creates; fence dispatch ownership; settle the hold atomically with the existing idempotent terminal debit. Apply the contract to every outbound voice path and preserve the staffed two-leg rate. Per-credential limits bound starts, while durable holds bound funded admission.
- Look in: `app/lib/outbound-credit-gate.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/auto-dial.server.ts`, `app/routes/api+/dial.action.server.ts`, `app/lib/twilio-call-status.server.ts`, `app/server/number-purchase-reservation.server.ts`
- Existing tests: Current-source reproduction on private PostgreSQL 18: two admission assertions fail; zero-balance and affordable/idempotent-completion controls pass. Four executed cases, none skipped. Provider and event boundaries are mocked; no live traffic.; Observed before interruption: 321 real PostgreSQL 18 cases passed with zero skips after the predictive rebase. At be2e726b, all 16 focused legacy media-stream cases passed. The later full local gate was interrupted; no passing final result is retained. Current handset changes have not passed typecheck or behavior tests.
- Missing tests: Competing reservations must admit only one funded first minute.; Reject/release before provider work; retain uncertain sends and prevent replay or expired-owner sends.; Prove early callback, parent/child billing identity, zero-duration/canceled release and once-only settlement; keep multi-minute in-flight grace explicit.; Full local and applicable remote CI after the complete implementation.; Complete handset preparation, phone audio replacement and held-credit admission; then rebase the protected branch and run its real-DB proofs and complete local and remote gates.
- Done when: New voice dispatches cannot reuse funds already held by another outbound call or number purchase.; First-minute reservation and canonical terminal billing remain separate accounting events; holds do not add a second usage charge.; Recovery cannot free a hold while a provider call may exist.
- Tracker: Keep In progress. No PR or push exists for this protected work. The user chose connection-only phone setup and requires it to replace browser audio. Resume after the authorized green merge batch; preserve the existing issue checklist.

### [#2882](https://github.com/chester-hill-solutions/callcaster/issues/2882) Campaign export hands the lowest-trust workspace role every agent's attempts and contact PII
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-26
- PR #3064 restricts export creation, status and saved links to members or higher, and carries requester scope into call CSV queries. Review, merge and deployed acceptance remain.
- Current behavior: At dev@a4d22ee5, a caller can start campaign exports and retrieve other agents' saved download links. Tenant SQL correctly scopes the workspace, but call exports select every agent's attempts. The candidate in open PR #3064 is not merged into dev or master.
- Root cause: Legacy creation/status, workspace export services and the UI list require membership without a member role floor. Call-export count and paging queries filter campaign and workspace but omit requester user_id. The pipeline has no required requester identity, including its worker caller.
- Resolution: Review PR #3064 and exact-head checks. Enforce member/admin/owner before export storage access on all creation, status and list paths; retain admin/owner for SMS reports. A required user/system actor carries authenticated identity through UI/API requests and user-owned worker jobs; trusted jobs without a user use explicit system authority. Canonical membership and role ranking choose all-agent or own-agent scope, shared by SQL count and paging before offset/limit. Public API notes and generated specs state the role rules. Existing signed URLs retain their 24-hour expiry. Verify deployed dev after merge, then release.
- Look in: `app/routes/api+/campaign-export.action.server.ts`, `app/routes/api+/campaign-export-status.loader.server.ts`, `app/routes/workspaces+/$id/exports.loader.server.ts`, `app/lib/platform-analytics.server.ts`, `app/lib/campaign-export.server.ts`, `app/lib/campaign-export-db.server.ts`, `app/lib/campaign-export-types.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `test/integration-db/campaign-export-access.test.ts`
- Existing tests: 24 real Better Auth session/Postgres cases pass with zero skips. They exercise legacy start/status, both workspace API methods through data-plane middleware and the UI list through workspace middleware; caller denials precede storage, members retain exports, non-member API requests get 404, SMS status remains admin/owner, caller SQL filtering precedes paging, and user/system CSVs exclude foreign workspace rows.; Original source executes 24 cases: 9 expected failures and 15 passing controls. Removing role floors fails 5/24; SQL user filters 3/24; user-policy bypass 2/24; requester wiring 6/7 thin-adapter cases while the explicit system control passes. Restored source passes all 24 with matching hashes. Email delivery, object storage and promise tracking are intercepted; session auth, membership SQL and CSV generation remain real, and background work is awaited before cleanup.; 64 focused export cases, 26 SMS-report authorization cases and 97 other worker/OpenAPI contract cases pass. Typecheck/codegen pass. Baseline lint comparison across 12 changed TypeScript files adds no warning debt. Full source ci:local passes on the clean commit; the PR records exact source/final heads and full-suite counts.
- Missing tests: After merge, verify role denials and valid exports on deployed dev, then complete release acceptance. Local proof uses dummy identities and in-memory storage, so it does not prove deployed storage or invalidate download URLs already issued before this fix. Those URLs retain their existing 24-hour expiry.
- Done when: Require member/admin/owner for campaign export creation, status and saved-link lists.; Keep SMS reports restricted to admin/owner.; Use canonical role rules and authenticated requester identity for call-export scope.; Filter both SQL totals and paging to the allowed agent rows without widening workspace or campaign scope.; Keep valid user-owned and trusted system worker exports working.
- Tracker: Included from original PR #3064 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

### [#2860](https://github.com/chester-hill-solutions/callcaster/issues/2860) A webhook credential for one workspace releases or accepts another tenant's live inbound call offer
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-26
- PR #3063 binds inbound-offer mutations to the authenticated workspace. Review, merge and deployed verification remain.
- Current behavior: At dev@a4d22ee5, an A-signed queue callback can mutate B's selected offer because four SQL functions accept an entry ID without a workspace. The new candidate in open PR #3063 is not merged into dev or master.
- Root cause: The router resolves a credential from queue_id, queue_name or the entry, but previously did not bind the selected mutation target to that workspace. The four RPC wrappers and original 20260731130000 SQL definitions accepted only entry ID. The complete handler also resolves an entry from queue name and CallSid after authentication.
- Resolution: Review PR #3063. A scoped tenant-client read rejects foreign entries after authentication and after complete fallback. A new migration requires workspace UUID in accept/release/complete/abandon, filters entry reads and writes, locks read-then-update transitions and removes legacy unscoped overloads. All wrappers, failed call-start cleanup, stale sweep and both fresh bootstrap lists carry workspace. Apply the migration before using the new app signatures, then verify deployed dev and release.
- Look in: `app/lib/acd/acd-router.server.ts`, `app/lib/db-rpc.server.ts`, `client/migrations/20261026000000_scope_inbound_offer_rpcs_by_workspace.sql`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`, `test/integration-db/inbound-offer-workspace.test.ts`
- Existing tests: Real Postgres 18.6 and real SDK-signed route actions: 40 cases cover four mutations, queue-ID and queue-name credential selection, direct RPC scope, A-to-A success, invalid tokens, entry-only fallback, complete fallback, null workspace, legacy-overload removal, accepted replay and global stale cleanup. Denial cases compare both tenants' full entry, agent and audit rows.; Original dev source and schema fail 19 cases while 21 controls pass. Removing the request guard fails 10/40; removing SQL workspace predicates fails 8/40; omitting the stale sweep workspace fails 1/40. Other controls pass and restored source passes all 56 real DB cases, including 13 existing active-offer and 3 SDK setup-failure controls; 0 skips.; Upgrade and both fresh bootstrap paths each pass 56/56 on owned disposable databases. Focused Node tests pass 33/33. Typecheck and focused lint pass. Full source ci:local passes on the clean source commit; see the PR for final-head checks and exact full-suite counts.
- Missing tests: Merge and verify the migration and valid callback lifecycle on deployed dev, then complete release acceptance. Local proof uses dummy tenants and a disposable database; it does not place real calls, apply production migrations or prove a released deployment.
- Done when: A workspace credential can mutate only inbound entries owned by that workspace.; Require workspace scope in every offer RPC and remove unscoped overloads.; Keep valid callbacks, accepted offers, stale cleanup and failed call-start cleanup working.
- Tracker: Included from original PR #3063 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

### [#2895](https://github.com/chester-hill-solutions/callcaster/issues/2895) Workspace-UI recording path stores the take before it measures its duration, and no maximum duration exists…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Workspace-UI recording path stores the take before it measures its duration, and no maximum duration exists anywhere to compare against**
- POST /workspaces/:id/audios/record normalises the uploaded take with ffmpeg and writes it to the tenant bucket (uploadObject, app/routes/workspaces+/$id/audios/record.action.server.ts:72-81), and only then measures its length with…
- Current behavior: POST /workspaces/:id/audios/record normalises the uploaded take with ffmpeg and writes it to the tenant bucket (uploadObject, app/routes/workspaces+/$id/audios/record.action.server.ts:72-81), and only then measures its length with probeAudioDurationMs (line 84). The measured value is written to workspace_audio.duration_ms and is never compared against a maximum. No maximum-duration constant exists anywhere in the tracked source: a scan of 2525 files across app, shared, server, worker, services, client, scripts, e2e and test found only unrelated string-length caps (Twilio friendly name, IVR hint, audit metadata string, log line, contact message, name, workspace name) and no duration ceiling…
- Root cause: The record action's duration handling is a measurement, not a limit: probeAudioDurationMs runs after uploadObject and its return value is only persisted, and no maximum duration is defined or enforced anywhere on the upload/record path, so an arbitrarily long recording is written to durable storage and to the metadata table before anything could reject it.
- Resolution: Define one maximum recording duration as a shared constant and enforce it before the take is transcoded and before it is stored. Probe the uploaded container with the server's own tool (probeAudioDurationMs) on the raw upload, so an over-long take is rejected with 413 without ever spending ffmpeg time on it and without writing anything to storage; keep the post-transcode measurement for the stored metadata. Have the browser recorder stop at the same maximum, and keep the ffmpeg wall-clock guard consistent with the maximum rather than relying on it as the policy.
- Look in: `app/lib/audio-upload.ts`, `app/lib/audio.server.ts`, `app/lib/audio-process.server.ts`, `app/components/file-assets/AudioRecorder.tsx`, `app/lib/audio-clip.server.ts`, `app/db/schema.ts`
- Existing tests: The request returned 302 with Location /workspaces/<workspaceId>/audios/recorded-<stamp>.mp3/edit, the normalised object was PUT to the bucket (8279 bytes), and workspace_audio held a row with file_name 'recorded-<stamp>.mp3', origin 'recording', duration_ms 14266340 (3.96 hours), size_bytes 8279, content_type…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A recording is bounded in duration before it is transcoded and before it is stored. The server already measures every recording with its own probe (probeAudioDurationMs), specifically so the recorded length is the server's own measurement rather than the client's timer, and the client already sends a durationMs field; that measured length is expected to be checked against a maximum, with the request rejected before the object is written, and the browser recorder expected to stop at the same maximum.

### [#2881](https://github.com/chester-hill-solutions/callcaster/issues/2881) A tenant workspace delete is aborted by the job table's NO ACTION foreign key, so the delete removes nothing and…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **A tenant workspace delete is aborted by the job table's NO ACTION foreign key, so the delete removes nothing and the tenant's data survives**
- deleteWorkspaceById (app/lib/workspace-members-db.server.ts:375-381) issues a single 'DELETE FROM workspace WHERE id = $1 RETURNING *' through the unscoped adminDb and relies entirely on database cascade for the tenant's rows
- Current behavior: deleteWorkspaceById (app/lib/workspace-members-db.server.ts:375-381) issues a single 'DELETE FROM workspace WHERE id = $1 RETURNING *' through the unscoped adminDb and relies entirely on database cascade for the tenant's rows. The job table is the one tenant table that does not cascade: drizzle/0003_job.sql:8 declares 'workspace_id uuid REFERENCES workspace(id)' with the default NO ACTION referential action, and no migration in client/migrations/ changes it. As long as any job row references the workspace, Postgres rejects the whole DELETE with 'update or delete on table "workspace" violates foreign key constraint "job_workspace_id_fkey" on table "job"' (SQLSTATE 23503).…
- Root cause: The job table's workspace foreign key was created without ON DELETE CASCADE (drizzle/0003_job.sql:8, the only place in the repo that creates public.job), and the workspace delete path (app/lib/workspace-members-db.server.ts:375) performs a bare row delete with no teardown of the job rows (or of any other non-cascading residue) that reference the workspace. Postgres therefore refuses the DELETE instead of cascading, and the application treats the refusal as an ordinary error rather than as a lifecycle contract failure.
- Resolution: Make the tenant delete a real teardown instead of a bare row delete. (1) Give job.workspace_id the same ON DELETE CASCADE every other tenant table has. On a database that already has the constraint this needs a NEW migration that drops and recreates job_workspace_id_fkey with ON DELETE CASCADE - editing drizzle/0003_job.sql alone is a no-op for any database that was already bootstrapped - and drizzle/0003_job.sql must be updated too so a fresh bootstrap gets the cascading constraint. (2) Remove the workspace's job rows inside the same transaction immediately before the workspace row, so the delete cannot be blocked by a row the tenant no longer controls. (3) Run the whole teardown in one…
- Look in: `drizzle/0003_job.sql`, `client/migrations/20261007000001_uuid_workspace_references.sql`, `app/lib/workspace-members-db.server.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/worker/enqueue-job.server.ts`, `app/routes/api+/audience-upload.action.server.ts`
- Existing tests: deleteWorkspaceById THREW: 'Failed query: delete from "workspace" where "workspace"."id" = $1 returning "created_at", "credits", ...' with cause 'PostgresError: update or delete on table "workspace" violates foreign key constraint "job_workspace_id_fkey" on table "job"' (SQLSTATE 23503). handleDeleteWorkspace returned…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A workspace owner deleting their workspace (or a platform operator deleting a tenant on request) expects the delete to succeed and to remove the tenant's data, including its queued work. Either the job rows must be removed with the workspace, or the job table's workspace reference must cascade like every other tenant table, so the delete cannot be blocked by a row the tenant no longer controls.

### [#2870](https://github.com/chester-hill-solutions/callcaster/issues/2870) POST /api/ivr places a machine-dialed IVR campaign call without reading the recipient's opt-out state or the…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **POST /api/ivr places a machine-dialed IVR campaign call without reading the recipient's opt-out state or the campaign calling window**
- CallCaster produces machine-dialed IVR campaign calls from two paths, and they enforce different consent rules
- Current behavior: CallCaster produces machine-dialed IVR campaign calls from two paths, and they enforce different consent rules. The durable worker path (app/lib/campaign-ivr-dispatch.server.ts) reads the recipient's consent state and the campaign's calling window before it dials: it defers a row outside the recipient-local 8am-9pm window (:252), dequeues a member whose contact has opt_out = true instead of dialling (:264), and re-checks the campaign calling policy at the provider boundary (:303, :373). The session-authenticated HTTP route (app/routes/api+/ivr.action.server.ts) reimplements the per-contact mechanics and enforces neither gate: to_number, contact_id, queue_id and campaign_id are taken…
- Root cause: The HTTP route re-implements the per-contact send mechanics instead of sharing the dispatcher's eligibility gate, so the consent and window checks that live in the worker dispatcher (app/lib/campaign-ivr-dispatch.server.ts:252, :264, :303) and in the queue-claim and get_campaign_queue RPCs are absent from the send path. The route trusts the request body for the recipient, contact and queue identifiers, never reads contact.opt_out, never resolves the campaign for its calling window, and places the provider call before the queue row is touched, so no state can veto the dial.
- Resolution: Give the session IVR route the same eligibility gate the worker dispatcher has, before any provider request: resolve the campaign workspace-scoped (findCampaignInWorkspace) and apply the IVR calling policy (isDispatchAllowedAt(ivrCallingPolicy(campaign))), and resolve the queue row plus its contact workspace-scoped, refusing the dial when the row is no longer queued/assigned or the contact has opt_out = true (dequeuing the row with the same 'Contact opted out' reason so the two paths cannot diverge again). Because the same rule is now needed in two places, extract it into one shared helper (for example app/lib/campaign-ivr-dispatch-gate.server.ts) called by both…
- Look in: `app/routes/api+/ivr.action.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/chat-opt-out.ts`, `app/lib/csv-contacts.ts`, `app/lib/capabilities.ts`, `app/lib/api-surface-generated.ts`
- Existing tests: 7/7 assertions passed in the sandbox-pg container (Postgres 18 bootstrapped from the repo's own migrations in the same command, node + vitest 4.1.11, no external network, read-only target at /target, writes confined to scratch; exit 0). Against a real contact with opt_out = true, a real workspace_member row with…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: Every machine-dialed campaign IVR call honours the recipient's consent state and the campaign's calling window before the provider request. The repository states this in three places: app/lib/campaign-ivr-dispatch.server.ts:15 ('Per-contact mechanics match the proven /api/ivr choke point exactly'), app/lib/csv-contacts.ts:94-96 ('contact.opt_out gates dispatch: campaign-ivr-dispatch.server.ts dequeues a member only when opt_out is truthy, and chat-sms-guards.server.ts blocks a send on the same flag. So opt_out === false means contactable.'), and app/routes/api+/inbound-sms.action.server.ts:205-228 (an opt-out sets contact.opt_out and pulls the contact out of every campaign queue in the workspace).

### [#2869](https://github.com/chester-hill-solutions/callcaster/issues/2869) Audience CSV upload reads an unbounded request body, then persists the whole file (base64) into the shared job…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Audience CSV upload reads an unbounded request body, then persists the whole file (base64) into the shared job queue and the shared object-storage bucket**
- Independently re-verified at commit 67d40abb (branch dev)
- Current behavior: Independently re-verified at commit 67d40abb (branch dev). POST /api/audience-upload reads the multipart body with a bare `await request.formData()` (app/routes/api+/audience-upload.action.server.ts:93) - no byte cap, no Content-Length pre-check, no streaming bound - so the whole upload is buffered in the request handler before anything else happens. The file is then copied into a second full-size ArrayBuffer (line 150), decoded (line 153), fully parsed by parseCSV() (line 157) although only `parsedFile.headers` is used (line 158), base64-encoded (line 202), written whole to the shared 'audience-uploads' bucket (line 221) and queued verbatim as `params.fileContent` (line 256) into the…
- Root cause: The route reads the multipart body with `await request.formData()` (app/routes/api+/audience-upload.action.server.ts:93) instead of the repository's bounded reader `readBoundedFormData(request, MAX_MEDIA_BODY_BYTES)` that the sibling media upload routes use (app/routes/api+/media.action.server.ts:28, app/routes/api+/message_media.action.server.ts:53). Nothing downstream bounds the size either: the file is copied whole into an ArrayBuffer (line 150), decoded (line 153), fully parsed by parseCSV (line 157) although only the headers are used (line 158), base64-encoded (line 202), written to object storage (line 221) and queued verbatim as `params.fileContent` (line 256). The queued payload is…
- Resolution: Apply the repository's existing bounded-body control to this route instead of writing a new one, bound the file itself, stop materialising every row in the request path, and stop copying the whole file into the queue payload. Concretely: (1) read the body with `readBoundedFormData(request, MAX_AUDIENCE_BODY_BYTES)` and map FormBodyError to 413, the way app/routes/api+/media.action.server.ts does; (2) add an explicit file-size check on the `contacts` part before arrayBuffer(); (3) read only the header row for the mapped-column validation instead of parseCSV() over the whole file; (4) drop `fileContent` from the queued params and change the worker to read the already-stored object by key, so…
- Look in: `app/routes/api+/audience-upload.action.server.ts`, `app/lib/bounded-form-data.server.ts`, `app/lib/media-upload.server.ts`, `app/routes/api+/media.action.server.ts`, `app/routes/api+/message_media.action.server.ts`, `docs/api-data-management.md`
- Existing tests: Check 1: the route accepted the payload - HTTP 200 with {success:true, audience_id 22, upload_id 99}; uploadObject received bucket 'audience-uploads', key <workspaceId>/99/original.csv and storedObjectBytes equal to the accepted CSV bytes (25,165,832); the queued 'audience_upload' job carried params.fileContent of…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: The request body is bounded before it is buffered, using the control the repository already ships and documents for uploads: `readBoundedFormData(request, MAX_AUDIENCE_BODY_BYTES)` returns 413 above the cap and cancels the stream, the way app/routes/api+/media.action.server.ts does, so an upload above the platform's declared upload ceiling is rejected instead of being buffered, parsed and persisted. The uploaded file is additionally size-checked (the media routes do this with `validateMediaFile`), the header validation reads only the header row instead of materialising every row, the queue payload carries a reference to the stored object rather than a base64 copy of the whole file, and the stored original is deleted once the import completes so the shared bucket does not retain every upload forever.

### [#2862](https://github.com/chester-hill-solutions/callcaster/issues/2862) Public api+ multipart routes buffer the whole request body with no byte cap
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- POST /api/contact-form is a public, unauthenticated multipart route: the route module re-exports the action (app/routes/api+/contact-form.tsx:1), the path is in scripts/baselines/route-tree.txt:68, and the repository's own API surface…
- Current behavior: POST /api/contact-form is a public, unauthenticated multipart route: the route module re-exports the action (app/routes/api+/contact-form.tsx:1), the path is in scripts/baselines/route-tree.txt:68, and the repository's own API surface inventory lists it as publicUnauthenticated (docs/api-surface-inventory.md:64). The action reads the body with await request.formData() at app/routes/api+/contact-form.action.server.ts:36 - no byte cap - before any of its own field limits run. An anonymous multipart POST carrying a 32 MiB body made the shared web process grow by 64.5 MiB of resident memory inside the request (measured: 202.4 MiB -> 270.1 MiB peak RSS, still 269.5 MiB after a forced GC), and…
- Root cause: The request-body size check this codebase already implements as app/lib/bounded-form-data.server.ts#readBoundedFormData was applied only to the media upload surfaces. Every other multipart route under app/routes/api+ calls the platform's request.formData() directly, which reads the entire body into process memory before any field validation runs, so the bytes one caller can make the shared web process hold are bounded only by the transport's own per-request default (Bun's 128 MB, node_modules/bun-types/serve.d.ts:676, not overridden at server/bun.ts:357) and by nothing at all in aggregate.
- Resolution: Read every request body through the reader this codebase already has. Replace each direct request.formData() in app/routes/api+ with readBoundedFormData(request, cap) and map FormBodyError to its 413 status, choosing a cap from the route's own field limits (a few tens of KiB for the contact form, a few hundred KiB for survey submissions). Apply the same to the authenticated variants (audiodrop, surveys). As defence in depth, set an explicit maxRequestBodySize on Bun.serve so the transport, not just the handler, bounds a request body; keep it above the largest legitimate body (the media upload cap is 10 MiB + 64 KiB).
- Look in: `app/routes/api+/contact-form.tsx`, `app/routes/api+/contact-form.action.server.ts`, `app/lib/handler.server.ts`, `app/lib/platform-rate-limit.server.ts`, `client/migrations/20260714120000_rate_limit_bucket.sql`, `app/lib/bounded-form-data.server.ts`
- Existing tests: Bun 1.3.14 in the sandbox (the production Docker image pins oven/bun:1.3.5 and package.json allows bun >=1.2.15). request.formData() over a streamed 32 MiB multipart body: +67.8 MB resident (2.02x body). Real POST /api/contact-form action, 32 MiB body with the honeypot filled: peak RSS 202.4 -> 270.1 MiB (+64.5 MiB,…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A route should read a request body only through a reader that caps the bytes it will consume and rejects an oversized body with 413, so that a field-level limit (MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH, a honeypot) bounds the work rather than being validated after the fact. readBoundedFormData(request, maxBytes) already does exactly this and is used by the media surfaces for a ~10 MiB body, with the repository's own test suite (test/bounded-form-data.test.ts) asserting the 413 and the early stream cancellation. The public and authenticated multipart routes should use the same reader with a cap sized for their own fields, and the transport should carry an explicit maxRequestBodySize as a backstop.

### [#3007](https://github.com/chester-hill-solutions/callcaster/issues/3007) IVR outbound throughput is throttled by idle polling and legacy batch sizing
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @wra-sol · Updated: 2026-10-26
- IVR dispatch loses throughput to idle polling and uses an obsolete default batch rate.
- Current behavior: The current production code misses a one-second successor until the five-second idle poll. The speed patch wakes for eligible scheduled jobs, uses the one-CPS default, and paces provider requests and retries. Production throughput after release has not been measured.
- Root cause: A fixed empty-queue sleep ignores queued future jobs. The legacy voice branch also sizes two-call batches from a 1.43-CPS webhook-delay heuristic instead of the default one-CPS voice policy. Waking sooner without request spacing would expose batch bursts.
- Resolution: Review and release the independently tested speed patch, then measure the actual campaign start rate without increasing the saved or provider limits.
- Look in: `app/lib/worker/poll-jobs.server.ts`, `app/lib/throughput-config.ts`, `app/lib/campaign-dispatch-pacing.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/campaign-outbound-estimate.ts`
- Existing tests: test/worker.test.ts: a one-second successor wakes on time and one-minute simulations produce 6/60/150/300 starts at 0.1/1/2.5/5 CPS with no external calls.; test/campaign-ivr-dispatch.test.ts: default batch, actual provider-start spacing, paced retries and calling-window closure after a wait.; test/integration-db/job-schedule.test.ts: real PostgreSQL eligibility, lane filters, idle ceiling and no-spin controls.
- Missing tests: Measure actual production campaign throughput after release; the simulation excludes provider and database latency.
- Done when: Default one-CPS campaigns approach 60 starts/minute subject to real latency.; Fractional and higher configured rates preserve request spacing within and between batches.; Scheduled-job wakeups respect lane filters, attempt bounds, cancellation and the existing idle ceiling.; Queue estimates use the actual pacing policy; no provider capacity increase is assumed.
- Tracker: Included from original PR #3009 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

### [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) IVR: store speech answers as { value, raw, inputType } (slice B)
- **IN PROGRESS** · Verdict: **Fix now** · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-19
- Slice A and slice B items 4-5 shipped: a vx-any step sends hints with a valid speechModel/speechTimeout pairing, a single-key menu sends numDigits, and every recorded speech answer is stored as `{ value, raw, confidence, inputType }` — but slice B item 6 (normalised intent matching, per-option spoken aliases, a confidence threshold and a re-prompt) is not implemented and is deferred to the #1880 decision.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: Two commits are in origin/master: 642f4ee7 'feat(ivr): improve speech capture with hints, valid model, and numDigits (#1875) (#1876)' (slice A) and 9dcab08b 'feat(ivr): store structured speech answers (#2160)' (slice B items 4-5). The brief's candidate list only names the slice A commit, which by itself would not satisfy the slice B title; the slice B shape landed later under PR #2160 and is what the master tree contains. The remaining slice B item 6 is knowingly deferred: the repo's own triage record for #1880 ('Decide: adopt Jev (TypeSafe) or hand-roll IVR speech intent', scripts/issue-board-enrichment/needs-decision.json:311-328) says its decision 'decides #1862 and the deferred confidence slice of #1875', and the board still lists #1880 in the 'Needs decision' lane. Because the issue's own acceptance criteria (hints + valid model/timeout pairing, numDigits, and a confidence value on each recorded speech answer) are all met but the slice-B scope named in the title is not complete, the verdict is PARTIAL rather than VERIFIED. manual: false — everything that is implemented is machine-checkable.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/lib/ivr-gather.server.ts`, `app/lib/ivr-webhook-auth.server.ts`, `app/lib/ivr-results.ts`
- Existing tests: test/ivr-webhook-auth.server.test.ts — 'captures speech text and a valid Twilio confidence score' (Confidence "0.87" → `answer.confidence === 0.87`), 'keeps confidence null when Twilio sends an invalid or missing value', 'records DTMF as structured input without speech confidence'; test/ivr-results.test.ts — the `IvrRecordedAnswer` aggregation; test/campaign-export-voice-credits.test.ts — the export carries the structured answer and its confidence; test/ivr-gather.test.ts — the gather attributes (hints / speechTimeout / speechModel / numDigits / input). Ran green: test/ivr-webhook-auth.server.test.ts, test/ivr-results.test.ts and test/campaign-export-voice-credits.test.ts all passed.

### [#2638](https://github.com/chester-hill-solutions/callcaster/issues/2638) Give Call list selection controls accessible names
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- PR #3023 names the Call list selection controls and reuses one named Rows per page control. Review, merge and deployed acceptance remain.
- Current behavior: At dev@a4d22ee5, AudienceTable renders unnamed header and contact checkboxes and a local unnamed page-size Select. The reviewed candidate in open PR #3023 is not merged into dev or master.
- Root cause: The selection controls do not receive accessible names. The Call list duplicates the page-size widget already named in TablePagination. Its URL page and size must stay in the existing single navigation; calling two captured-parameter callbacks can overwrite the new size.
- Resolution: Review PR #3023 and its exact-head checks. The header names its visible-page scope; row names use a trimmed name, phone or email with a contact ID fallback and duplicate-name disambiguation. RowsPerPageSelect now owns the named control for both consumers. Keep each consumer callback contract, checkbox states and current geometry. Verify on deployed dev after merge, then complete release acceptance.
- Look in: `app/components/audience/AudienceTable.tsx`, `app/components/shared/RowsPerPageSelect.tsx`, `app/components/shared/TablePagination.tsx`, `test/ui/audience-selection-names.test.tsx`, `test/ui/table-pagination-page-size.test.tsx`
- Existing tests: The focused run passes 41 cases with real Checkbox, Select and router controls. Six new cases cover duplicate and missing names, Space and mixed states, the correct bulk-delete contact IDs, filtered/current-page selection, empty results, keyboard paging and an atomic size/page change that retains query, sort and repeated tags.; The original runtime fails all six new cases while four shared pagination controls pass. A row-name fault fails five cases with five controls passing; a two-callback page-size overwrite fails one with nine controls passing. The candidate is restored byte-for-byte. Focused source warnings decrease from 14 to 12; the new shared control and test have none.; The source commit passes full ci:local; post-CI browser checks compare baseline/candidate geometry in both themes and exercise real keyboard controls with a controlled loader. See the PR validation for the final commit and exact counts.
- Missing tests: After merge, verify selection names, states and page-size changes on deployed dev and complete release acceptance. Local browser and router checks use synthetic contacts; they do not prove authentication, production data access or the full workspace shell.
- Done when: Select all names the contacts shown on the current page.; Row names identify the contact, including duplicate, partial and absent names.; Use the shared named Rows per page control.; Keep checked, partial and focus states exposed.; Preserve keyboard selection and paging; size changes reset page and retain other URL values.
- Tracker: Included from original PR #3023 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

### [#2626](https://github.com/chester-hill-solutions/callcaster/issues/2626) Group identical calling hours in the collapsed campaign summary
- **IN PROGRESS** · Verdict: **Fix now** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- PR #3034 groups matching campaign schedules in a compact shared-text summary. Review, merge and deployed acceptance remain.
- Current behavior: At dev@a4d22ee5, SelectDates shows one row per active day in a padded colored block, hides inactive days and reads only the first interval. An active day without intervals is described as All day. The reviewed candidate in open PR #3034 is not merged into dev or master.
- Root cause: The collapsed presentation filters active days before rendering and reads intervals[0]. It has no grouping by complete interval sets, so later-interval exceptions disappear and identical days repeat. Summary presentation owns decorative block styling instead of using shared section/text treatment.
- Resolution: Review PR #3034 and its exact-head checks. ScheduleSummary copies and sorts complete interval sets for comparison, groups matching days, shows inactive exceptions and all local intervals, and distinguishes missing intervals from full-day ranges. Keep the existing channel-specific saved fields, editor, timezone conversion and calling-window safeguards. Verify on deployed dev after merge, then complete release acceptance.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.ScheduleSummary.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.Schedule.tsx`, `test/ui/campaign-schedule-summary.test.tsx`, `test/ui/campaign-weekly-schedule.test.tsx`
- Existing tests: The focused run passes 33 cases: 16 new summary cases across calls and SMS, six real weekly-editor controls and 11 existing campaign cases. Coverage includes identical days, complete sets in different orders, later-interval exceptions, inactive groups, full-day and overnight ranges, missing intervals, empty states, distinct saved fields and Edit/Hide with later intervals retained.; Original Dates fails 12 cases while 10 controls pass. Targeted faults fail two cases for in-place sorting, two for first-interval grouping, six for omitted later intervals, four for omitted inactive days, 12 for raw UTC output and nine for wrong-channel reads. Positive controls remain and restored source passes all 22 fault-run cases with matching hashes. Dates warnings decrease from two to one; the new component and test have none.; The source commit passes full ci:local. Post-CI browser checks compare baseline/candidate compact height and exercise exceptions, both themes and both channels with real controls. See PR validation for the final commit, exact counts and browser dimensions.
- Missing tests: After merge, verify collapsed schedules and the full weekly editor on deployed dev and complete release acceptance. Local browser checks use saved synthetic schedules; they do not prove authentication, production data access or provider dispatch. The existing calling-window enforcement is unchanged.
- Done when: Group days only when their complete active interval sets match.; Keep differing days, inactive days and every daily interval discoverable.; Preserve full editor access and day-specific controls.; Retain local timezone display, full-day/overnight meaning and calling-window safeguards.; Keep separate saved schedules for calls and SMS.; Use shared section/text treatment without the large decorative summary block.
- Tracker: Included from original PR #3034 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

### [#2871](https://github.com/chester-hill-solutions/callcaster/issues/2871) Tenant-facing GET /api/numbers falls back to the platform parent-account Twilio credential when workspace_id is…
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-29
- Recommended title: **Tenant-facing GET /api/numbers falls back to the platform parent-account Twilio credential when workspace_id is omitted**
- Workspace-only number search is implemented in PR #3078. Full local CI, focused tests and three mutation checks pass; review, merge and release verification remain.
- Current behavior: PR #3078 rejects missing or blank workspace_id with 400, checks membership before creating a client, preserves uniform non-member 404 and searches only through createWorkspaceTwilioInstance. The dev branch still has the parent-account fallback.
- Root cause: The optional workspace_id selected the provider identity. Omitting it bypassed membership and constructed a parent-account client. A broad provider catch also changed membership 404 into 500.
- Resolution: Require workspace_id, remove the parent fallback, and await membership outside the provider error handler. Keep local and toll-free searches on the workspace client. Mark workspace_id required in both published OpenAPI documents.
- Look in: `app/routes/api+/numbers.loader.server.ts`, `app/twilio.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/api-surface-annotations.ts`, `openapi/complete-api.json`
- Existing tests: 56 focused tests pass across number route, number mapping and public/complete API contracts. The unchanged loader fails four regressions with 23 controls passing. Restoring the old loader fails four tests; removing membership fails four; making the contract optional fails two. Three authentication/validation controls pass in every mutation run. Provider calls are mocked; no live Twilio traffic.
- Done when: A number search must run under the identity of the tenant that owns it. GET /api/numbers should require a workspace_id, verify the caller is a member of that workspace, and use that workspace's Twilio subaccount - which is what the declared surface (exposure sessionOnly, authClass session, workspaceScoped true, app/lib/api-surface-annotations.ts:87) and the published OpenAPI operation (workspace_id 'required for session auth', openapi/complete-api.json:6631) describe. A request with no workspace context must be rejected; if parent-account search is genuinely required for platform operators, it must sit behind platform-admin authority (requireSudo / the admin surface) and must never be the silent fallback of a tenant-facing route.
- Tracker: Included from original PR #3078 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

### [#2864](https://github.com/chester-hill-solutions/callcaster/issues/2864) POST /api/survey-responses stores a contact id from another tenant: the no-auth-strategy handler's inline gate…
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-29
- Recommended title: **POST /api/survey-responses stores a contact id from another tenant: the no-auth-strategy handler's inline gate never binds responseData.contact_id**
- POST /api/survey-responses is one of the twenty API-surface entries whose derived authVia mentions "no-auth-strategy" (12 with authVia exactly "action:no-auth-strategy", 3 with "action:no-auth-strategy + loader:no-auth-strategy")
- Current behavior: POST /api/survey-responses is one of the twenty API-surface entries whose derived authVia mentions "no-auth-strategy" (12 with authVia exactly "action:no-auth-strategy", 3 with "action:no-auth-strategy + loader:no-auth-strategy"). The handler declares no `auth:` strategy, so the factory's optional auth slot is empty and app/lib/handler.server.ts:100-112 runs the handler body with no factory-level authentication: the inline gate inside the handler body is the entire authorization story. That gate resolves the SURVEY's workspace and checks the caller against it (API-key branch: `workspaceId !== auth.workspaceId`; session branch: `requireWorkspaceAccess({ user, workspaceId })` with no…
- Root cause: app/routes/api+/survey-responses.action.server.ts:64-103 - the handler is defined with `defineAction({ sideEffects, handler })` and no `auth:` key, so `withGuards` (app/lib/handler.server.ts:100-112) runs the body with no factory-level authentication. The inline gate at lines 71-101 authorizes only the survey: the API-key branch (81-84) compares `workspaceId !== auth.workspaceId` and the session branch (94) calls `requireWorkspaceAccess({ user, workspaceId })` with no role floor. `responseData.contact_id` is parsed at line 30 and passed through untouched at lines 45-48, and app/lib/survey-db.server.ts:398 writes it into `survey_response.contact_id` with no workspace check. The deployed…
- Resolution: Bind the caller-supplied contact id to the survey's workspace at the sink, so every caller of submitSurveyResponse inherits the check the public path already has. The survey is loaded inside submitSurveyResponse, so its `workspace` is available there: resolve the contact through the workspace-scoped loader (import loadSurveyRespondentContact from @/lib/survey-respondent.server) and reject a foreign or non-existent id with 400. As defence in depth, also scope the contact lookup in loadRecentSurveyResponses by workspace, and correct the Drizzle model for survey_response.contact_id so it matches the deployed bigint column (or migrate the column to int4 and drop the typeof filter).
- Look in: `app/lib/api-surface-generated.ts`, `app/lib/handler.server.ts`, `app/routes/api+/survey-responses.action.server.ts`, `app/lib/survey-db.server.ts`, `app/db/schema-survey.ts`, `drizzle/0000_baseline.sql`
- Existing tests: Independently reproduced in the sandbox against a private PostgreSQL 18 (schema applied by scripts/e2e/bootstrap-compose-db.mjs), with locally generated dummy fixtures only. (1) With the scope-less workspace API key the action returned HTTP 200 {success:true, response_id:"1", result_id:"6244b8ea-..."} and the inserted…; At dev@03c3e15a, the new real-PostgreSQL route/service suite has 11 failing regressions and three passing valid controls. The candidate passes all 14 with real caller sessions and workspace API keys; no provider or email traffic is sent.; Removing the sink guard through an isolated test transform causes 10 failures; removing the read workspace join or bigint mapping causes one failure each. All three normal-submission controls remain green, and working source hashes stay unchanged.; All 14 cases pass with DATABASE_URL alone, INTEGRATION_DB_URL alone and conflicting loopback app URLs. All 83 survey PostgreSQL cases and 105 focused survey unit cases pass; typecheck passes and lint adds no warnings.
- Done when: A contact id supplied by a caller must resolve to a contact in the survey's own workspace before it is stored, exactly as the public survey path does: app/lib/survey-public-action.server.ts:142-167 routes the id through app/lib/survey-respondent.server.ts:27-46, which applies `eq(contactTable.workspace, workspaceId)` so a foreign id simply does not resolve and the request is refused with 400.
- Tracker: Included from original PR #3077 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

### [#2884](https://github.com/chester-hill-solutions/callcaster/issues/2884) The structural-review merge gate classifies only four path prefixes as high-risk, so changes to the webhook, auth,…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **The structural-review merge gate classifies only four path prefixes as high-risk, so changes to the webhook, auth, capability, media-stream and route code…**
- `.github/workflows/review-coverage.yml` is the repository's only mechanical prompt for a declared structural review of high-risk code on a pull request into `dev`
- Current behavior: `.github/workflows/review-coverage.yml` is the repository's only mechanical prompt for a declared structural review of high-risk code on a pull request into `dev`. Its `high_risk` test is one anchored pattern - `^(app/lib/worker/|app/server/|app/db/|client/migrations/)` at line 41 - applied to the pull request's own file list (line 38), and the only other arm that can fail the gate is the 500-added-line test at line 68. Four directories are matched; every other path in the repository is silently exempt below that size. The components that carry the platform's trust boundaries live in the unmatched paths: the production HTTP entrypoint and its anonymous->Twilio webhook pre-handler…
- Root cause: The high-risk classification is a hard-coded list of four path prefixes that was never widened past the directories it was written around: it was introduced in commit 93def136 ('chore(ci): require structural-review coverage on high-risk PRs (#1932) (#1935)') with those same four prefixes and the later commits (3ab6c37a docs-only exemption, 689684c1 pagination fix) left it untouched, even though the repository also carries a top-level `server/` HTTP entrypoint, a top-level `worker/` service, a `services/` tree and the entire `app/routes/` surface. Every path outside the list is silently exempt, nothing reports the exemption, and the gate's header (lines 3-7) and pull-request template (lines…
- Resolution: Widen the high-risk classification to the components the gate claims to cover and keep the set explicit in one place, so a new component cannot silently fall outside it: match the whole `app/lib/` tree, `app/server/`, `app/db/`, `app/routes/`, the top-level `server/`, `services/` and `worker/`, and `client/migrations/`. A dedicated script (like scripts/lib/ci-changes-lib.mjs for the job-scoping patterns) with a unit test would keep the list reviewable. Widening the list alone is necessary but not sufficient: the same gate's marker arm is satisfied by the pull-request template's pre-filled `**Structural review:**` line, so the check must also require a value the author actually wrote…
- Look in: `.github/workflows/review-coverage.yml`, `app/lib/twilio-webhook.server.ts`, `server/twilio-webhook.ts`, `server/bun.ts`, `services/media-stream/index.ts`, `services/media-stream/db-writer.ts`
- Existing tests: Extracted from the target: regex `^(app/lib/worker/|app/server/|app/db/|client/migrations/)`, threshold 500, marker `Structural review:`. Missed-path set (app/lib/twilio-webhook.server.ts, app/lib/auth.server.ts, app/lib/api-auth.server.ts, app/lib/capability-guard.server.ts, server/bun.ts, server/twilio-webhook.ts,…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: The gate should treat the components it documents as high risk: the webhook pre-handler and its signature validation, the auth, API-key and capability libraries, the media-stream service, the worker entrypoint and the route surface. A pull request that changes one of them should require a `Structural review:` declaration even when it is small, and the declaration must be a value the author actually wrote rather than a template line that is pre-filled.

### [#2883](https://github.com/chester-hill-solutions/callcaster/issues/2883) The release-closing merge gate decides from the pull request's own checkout, so a release PR can neutralise it
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- `release-close-issues.yml` exists so that a `dev -> master` release PR closes the issues it promotes (#1956): GitHub closes one issue per closing keyword, a bare `(#1234)` mention closes nothing, and the workflow header records release PR…
- Current behavior: `release-close-issues.yml` exists so that a `dev -> master` release PR closes the issues it promotes (#1956): GitHub closes one issue per closing keyword, a bare `(#1234)` mention closes nothing, and the workflow header records release PR #2668 listing seventeen issues behind a single keyword with only #2655 closing. The workflow checks the repository out with `actions/checkout@v4` and no `ref:` (line 68), so for a `pull_request` event the tree on disk is the pull request's merge commit, which carries the pull request's own copy of `scripts/check-release-closing-references.mjs`. The gate then runs that file twice (lines 77 and 78) and records the file's own self-reported `closes.length` as…
- Root cause: The gate sources its decision logic from the artifact it constrains. `actions/checkout@v4` is used without `ref:`, so for a `pull_request` event the checked-out tree is the pull request's merge commit and the checker at `scripts/check-release-closing-references.mjs` is whatever the pull request contains. The sibling workflow in the same repository already shows the intended pattern: `ledger-drift-check.yml` pins its checkout to a trusted ref (`ref: dev` at line 100, `ref: master` at lines 133 and 162) before running repository scripts with an environment's DATABASE_URL. Because the workflow file itself is also taken from the pull request's merge ref for a `pull_request` event, pinning the…
- Resolution: Decide the gate from trusted content, in two parts, because a `pull_request` event takes both the checked-out tree and the workflow file from the pull request's merge ref. (1) Pin the checkout to the base branch so the checker that judges the body is the repository's own copy: `ref: ${{ github.event.pull_request.base.sha }}` - the pattern ledger-drift-check.yml already uses with `ref:`. (2) Require an independent approver for the gate definitions themselves: add a CODEOWNERS entry for `/.github/workflows/` and `scripts/check-release-closing-references.mjs` plus a branch-protection rule on `master` requiring that approval, so a pull request cannot merge a change to the gate that judges it.…
- Look in: `.github/workflows/release-close-issues.yml`, `.github/workflows/ledger-drift-check.yml`, `.github/workflows/ci.yml`, `scripts/check-release-closing-references.mjs`, `test/check-release-closing-references.test.ts`, `.github/workflows/issue-on-dev.yml`
- Existing tests: test/**/*.test.ts covers the neighbouring behaviour on this path.; Trusted checker: line-77 step exit code 0, numbers=0, GATE VERDICT FAIL (the release PR is rejected). Pull-request-modified checker (CLI-only edit): line-77 step exit code 0, numbers=1, GATE VERDICT PASS - the release PR is allowed to merge with zero issues closed, the exact condition the workflow was written to…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A merge gate must decide from trusted content. The checker that validates a release PR's body should be the base branch's copy, and the gate's own definition must not be editable by the pull request it judges.

### [#2880](https://github.com/chester-hill-solutions/callcaster/issues/2880) A successful workspace deletion leaves no audit record: the workspace.delete audit insert targets the row the…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **A successful workspace deletion leaves no audit record: the workspace.delete audit insert targets the row the delete already removed**
- deleteWorkspaceApi calls handleDeleteWorkspace first (app/lib/platform-workspace.server.ts:139) and only afterwards calls safeRecordWorkspaceAuditEvent({action: 'workspace.delete'}) (app/lib/platform-workspace.server.ts:148)
- Current behavior: deleteWorkspaceApi calls handleDeleteWorkspace first (app/lib/platform-workspace.server.ts:139) and only afterwards calls safeRecordWorkspaceAuditEvent({action: 'workspace.delete'}) (app/lib/platform-workspace.server.ts:148). handleDeleteWorkspace issues a single DELETE against public.workspace (app/lib/workspace-members-db.server.ts:375), so by the time the deletion event is written the workspace row is gone, and workspace_audit_event.workspace_id carries a validated, non-deferrable ON DELETE CASCADE foreign key to public.workspace (client/migrations/20261007000003_workspace_audit_event_workspace_reference.sql:37). The insert is therefore rejected with SQLSTATE 23503 - 'insert or update on…
- Root cause: The workspace audit trail is keyed to the workspace row with ON DELETE CASCADE, and the deletion event is recorded only after the delete has already removed both the workspace row and the audit table's parent. The event can therefore never be written, the wrapper that records it treats the failure as non-fatal, and no durable platform-level record of the deletion exists anywhere else. Reordering the write alone does not fix it: an audit row written before the delete carries the same cascading workspace foreign key and is destroyed by the same cascade, which the reproduction confirmed (a control row written before the delete was gone afterwards).
- Resolution: Land the deletion record in a sink that does not cascade with the tenant, and write it in the same transaction as the delete. Reordering the write alone is NOT sufficient: the audit row carries the same cascading workspace foreign key, so a 'workspace.delete' event written into workspace_audit_event before the delete is destroyed by the same cascade (reproduced: a control row written before the delete was gone afterwards). Either give the audit table a durable, non-cascading owner (workspace_id nullable with ON DELETE SET NULL and the workspace id kept in target_id, or a separate platform-level table with no workspace foreign key) and write the event there, or write a platform-level…
- Look in: `app/lib/platform-workspace.server.ts`, `client/migrations/20261007000003_workspace_audit_event_workspace_reference.sql`, `app/lib/audit-event.server.ts`, `app/db/workspace-scoped-tables.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/workspace-members-db.server.ts`
- Existing tests: Control: the exact 'workspace.delete' payload written while the workspace existed succeeded (audit rows 3 -> 4). Production deleteWorkspaceApi() returned {ok:true}; during that same call the wrapper logged one error - 'Failed to record workspace audit event', action workspace.delete, PostgresError code 23503, detail…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A tenant deletion is an accountable platform action: it should leave a durable, attributable record (an audit event and/or a platform-level tombstone with the workspace id, the actor and the timestamp) that survives the deletion of the tenant's own data.

### [#2872](https://github.com/chester-hill-solutions/callcaster/issues/2872) Audience import creates and mutates audience records and links audiences to campaigns under a membership-only gate…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Audience import creates and mutates audience records and links audiences to campaigns under a membership-only gate that the sibling audience surfaces refuse**
- POST /api/audience-upload authorizes with requireWorkspaceAccess({ user, workspaceId }) and nothing else (app/routes/api+/audience-upload.action.server.ts:120), so any workspace member, including the lowest `caller` role, passes
- Current behavior: POST /api/audience-upload authorizes with requireWorkspaceAccess({ user, workspaceId }) and nothing else (app/routes/api+/audience-upload.action.server.ts:120), so any workspace member, including the lowest `caller` role, passes. On that admission the route itself creates an audience row (createAudienceForUpload, :193), flips an existing audience's status to processing (markAudienceUpdating, :245), inserts a campaign_audience link for a campaign in the workspace (linkAudienceToCampaign, :234-243) and enqueues an audience_upload job attributed to the caller (:247) whose durable run then inserts contact rows into the workspace's contact table and links them to the audience…
- Root cause: The import route's authorization was written as a bare membership check and never adopted the capability or role floor that the sibling audience surfaces enforce. Because the route itself creates the audience, mutates an existing audience, links the audience to a campaign and enqueues the import that writes the contact rows, the missing floor is the whole authorization boundary for the import path.
- Resolution: Gate the audience-import route with the same floor the sibling audience surfaces use, in the call that proves workspace access, so the request is refused before createAudienceForUpload, linkAudienceToCampaign, markAudienceUpdating or the job enqueue run. Require the member role (equivalent to campaigns.write for session actors) or resolve a capability actor and require campaigns.write explicitly if the route is migrated to the capability strategies.
- Look in: `app/routes/api+/audience-upload.action.server.ts`, `app/routes/api+/audiences.action.server.ts`, `app/lib/audience-api-auth.server.ts`, `app/lib/capability-guard.server.ts`, `app/lib/capabilities.ts`, `app/routes/api+/campaign_audience.action.server.ts`
- Existing tests: 4 of 4 assertions passed against a private Postgres 18 inside the OS-enforced sandbox, with no network access and no external service touched. (1) requireWorkspaceAccess with no minRole resolved for the caller-role member; the same call with minRole 'member' threw an AppError with statusCode 403;…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: Audience creation and audience mutation belong to the campaigns.write capability (app/lib/capabilities.ts:12, :75), which the caller role does not hold, and the product enforces that model in app/lib/audience-api-auth.server.ts (requireAudienceWorkspaceAccess, :30) and with a member role floor in app/routes/api+/campaign_audience.action.server.ts:76 and app/routes/api+/campaigns/$campaignId/queue.action.server.ts:60. The import route should apply the same floor before it creates an audience, mutates one, links one to a campaign, or enqueues the import.

### [#2863](https://github.com/chester-hill-solutions/callcaster/issues/2863) POST /api/survey-responses accepts a workspace API key with an empty scope allowlist although the published…
- Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **POST /api/survey-responses accepts a workspace API key with an empty scope allowlist although the published contract is session-only**
- POST /api/survey-responses is a `no-auth-strategy` handler: the derived inventory records authVia "action:no-auth-strategy" (app/lib/api-surface-generated.ts:117) and the declared auth class comes only from a hand-written annotation that…
- Current behavior: POST /api/survey-responses is a `no-auth-strategy` handler: the derived inventory records authVia "action:no-auth-strategy" (app/lib/api-surface-generated.ts:117) and the declared auth class comes only from a hand-written annotation that no gate constrains, because scripts/check-api-surface-coverage.ts compares the declared class against the code only when the derivation produced an `authAllows` set (line 118), and an unresolved handler produces none (scripts/lib/api-surface-derive.mjs:499-505). The annotation declares authClass "session" and exposure "sessionOnly" (app/lib/api-surface-annotations.ts:100), and the published OpenAPI entry for this path carries x-callcaster-auth-class…
- Root cause: app/routes/api+/survey-responses.action.server.ts:64-84 - the handler declares no `auth:` strategy, and the inline gate it does declare is `requireDualAuth(request)` (line 71) with no `capability` option, so app/lib/api-auth.server.ts:175-190 never evaluates the API key's scope allowlist. The api_key branch (81-84) checks only the workspace binding. The sibling pattern is not unique: app/routes/api+/message_media.action.server.ts:25-30 admits an API key the same way. Every other requireDualAuth route in app/routes either rejects key actors with getDualAuthUser (app/routes/api+/surveys.action.server.ts:158-161, app/routes/api+/campaign_audience.action.server.ts:38-41,…
- Resolution: Make the route's auth class a mechanical fact instead of free text. The published spec already says session-only, so the smallest behaviour-correct fix is to require a user session (bearer or cookie) and drop the api_key branch; if API-key access is wanted instead, declare it as apiKeyOrSession and add an explicit capability check so the key's scope allowlist is consulted (app/lib/api-auth.server.ts:175-190). Either way, reject key actors in the handler the way the sibling route does (app/routes/api+/campaign_audience.action.server.ts:38-41) so the declared session-only exposure is actually true. Note the surface gate will not police this on its own:…
- Look in: `app/lib/api-surface-generated.ts`, `app/lib/api-surface-annotations.ts`, `app/routes/api+/survey-responses.action.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/capabilities.ts`, `app/routes/api+/campaign_audience.action.server.ts`
- Existing tests: All four assertions passed inside the parent-approved sandbox against a private PostgreSQL 18. (1) An API key whose scopes array was EMPTY returned HTTP 200 {success:true, response_id:"1", result_id:"e58565fd-8a3c-4fc4-ba6a-052fb360a65d"} and a survey_response row was created for that key's own survey. (2) A key whose…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A route the inventory and the published OpenAPI spec declare session-only must reject workspace API keys, and a key that reaches a write path must have the capability that write requires. The platform's documented rule is that an empty scope allowlist denies (app/lib/capabilities.ts:45).

### [#2616](https://github.com/chester-hill-solutions/callcaster/issues/2616) Give contact search and its clear button explicit accessible names
- **IN PROGRESS** · Verdict: **Fix now** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- PR #3010 gives Contacts search and Clear search persistent accessible names and returns focus to the field after clear. Review, merge and deployed acceptance remain.
- Current behavior: At dev@a4d22ee5, ContactsPage identifies its search input only by placeholder and renders an unnamed Clear button. When clear removes that button, no input ref restores focus. The reviewed candidate is in open PR #3010; it is not merged into dev or master.
- Root cause: The search input has no stable ID/label association. The conditional icon button has no accessible name, and its click handler only changes URL parameters before the focused button disappears.
- Resolution: Review PR #3010 and its latest exact-head checks. The fix uses the canonical nested FormFieldControl, a useId-backed Search contacts label, a native Input ref and a Clear search name. Keep the existing URL handler and shared control styling. Verify on deployed dev after merge, then complete release acceptance.
- Look in: `app/components/contacts/ContactsPage.tsx`, `app/components/ui/form-field.tsx`, `test/ui/contacts-page-a11y.test.tsx`, `test/ui/contacts-route-outlet.test.tsx`
- Existing tests: PR #3010 extends the real-router contacts accessibility suite to seven cases, retaining both old controls. The focused run passes 21 cases with route outlet and shared FormField coverage. It checks persistent names and IDs, pointer/Enter/Space clear, focus return, controlled loader results, q removal, page reset and preserved sort/repeated tag values.; Fresh original-source control: five failures and two passing controls. Removing only focus return fails three cases with four controls passing; removing only the Clear name fails four with three passing. The candidate is restored byte-for-byte. Focused lint retains 17 baseline source warnings and zero test warnings.; Source head 3de12c56 passes full ci:local: 5,973 Node, 34 Bun and 1,546 UI tests, with 11 existing skips; guards, production build, bundle check and codegen verification pass.; Post-CI real-browser comparisons match baseline input, wrapper and Clear-button bounds in light/dark at 390/1100 px container widths. The Clear target remains 42 by 40 px. Pointer, Enter and Space return visible focus to the same named input and preserve the required URL values. Names persist with one or zero matches. No mobile viewport emulation is claimed.
- Missing tests: After merge, verify actual Contacts search and clear on deployed dev and complete release acceptance. Local tests and browser checks use a controlled loader; they do not prove production authentication, database filtering or the full workspace shell.
- Done when: Search contacts has a persistent accessible name, including when no contacts match.; Clear search has an explicit name and preserves the existing target size and shared styling.; Pointer, Enter and Space clear the query, reset page to 1, retain unrelated parameters and return focus to the same input.; Keep edit links, empty-state composition and shared Input/Button behavior.
- Tracker: Included from original PR #3010 in the user-authorized merge batch PR #3070. Original-head GitHub checks passed. Final combined-head tests, merge, deployed verification and release remain. Actual Project Status is In progress; keep open and do not mark on-dev before the batch merges.

---

## Verify and close — 64

### [#2533](https://github.com/chester-hill-solutions/callcaster/issues/2533) show caller how long theyve been calling for somewhere (agent request)
- Verdict: **Verify and close** · Type: Feature · Priority: Medium · Effort: Low · Environment: unset · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-11-01
- Both owner-requested totals are merged and deployed to dev in PR #3100: elapsed session time and accumulated connected talk time.
- Current behavior: At dev@09f41816, both dialing modes show Session and Talk in the shared header. Session continues between contacts; Talk uses the recipient connected state and retains fractional time. Queue refreshes preserve totals; a new workspace/campaign visit resets them.
- Root cause: The missing visit clock and connected-time total were added to the shared calling header.
- Resolution: Complete operator and release acceptance. Preserve the owner decision to show both totals; no further implementation is needed without a failing requirement.
- Look in: `app/components/call/CallScreen.SessionTimers.tsx`, `app/components/call/CallScreen.Header.tsx`, `app/components/call/CallScreen.Layout.tsx`, `test/ui/call-screen-session-timers.test.tsx`, `test/ui/call-screen-leave.test.tsx`
- Existing tests: 65 focused UI cases, 18 board cases, 37 local gates and all 17 applicable GitHub checks passed on b15c07a3.; The original code fails all eleven new header cases. Using agent-device state as talk input fails both real call-screen wiring cases while fourteen controls pass.; Phone and desktop browser checks cover both modes, light/dark, queue refresh and talk-time pause. Exact dev app/worker deployments are healthy and /readyz returns 200.
- Missing tests: Operator and release acceptance remain.
- Done when: Both dialing modes show elapsed session time and total connected talk time.; Session time continues between calls; talk time pauses when the recipient is not connected and adds time across contacts.; Queue and title refreshes preserve the totals; leaving or changing workspace/campaign starts a new visit.; Delayed timer callbacks do not slow the clock, and fractional connected time is retained between short calls.; Both timers and the campaign title remain readable on phone and desktop widths; timer updates do not announce every second.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Feature, Priority Medium, Effort Low, Enviornment unset; assignee @wra-sol. No parent. Children: none. Native open blockers: none. PR #3100 is merged and deployed. Owner decision: show both timers. Keep open for release acceptance.

### [#2776](https://github.com/chester-hill-solutions/callcaster/issues/2776) Script validation error doesn't use human readable block names
- Verdict: **Verify and close** · Type: Bug · Priority: Medium · Effort: unset · Environment: prod · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-11-01
- Readable script validation errors are merged and deployed to dev in PR #3099. Errors use the saved block title, with the legacy ID as fallback.
- Current behavior: At dev@a6ba6390, the reported three-step self-loop identifies Support in inbound and outbound editors and server launch validation. Routing targets and structured issue IDs remain stable.
- Root cause: Routing messages interpolate the block ID, and the raw inbound routing adapter drops the saved title.
- Resolution: Complete operator and release acceptance. Keep saved titles in the inbound adapter and preserve the untitled-block fallback.
- Look in: `app/lib/ivr-script-validation.ts`, `app/lib/inbound-script-validation.ts`, `test/ivr-script-validation.test.ts`, `test/ui/inbound-script-validation.test.tsx`
- Existing tests: 78 focused Node cases, 13 UI cases, 37 local gates and all 17 applicable GitHub checks passed on b8d53bd8.; The original runtime fails two new Node and two real editor cases; eight Node and eleven UI controls pass.; Exact dev app/worker deployments and /readyz were healthy after merge.
- Missing tests: Operator and release acceptance remain.
- Done when: The reported three-step self-loop identifies Support instead of its internal ID.; Inbound and outbound validation display the saved block names.; Untitled legacy blocks retain a useful ID fallback.; Routing decisions and machine-readable issue IDs remain unchanged.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority Medium, Effort unset, Enviornment prod; assignee @wra-sol. No parent. Children: none. Native open blockers: none. PR #3099 is merged and deployed; operator and release acceptance remain.

### [#3073](https://github.com/chester-hill-solutions/callcaster/issues/3073) Align the patched Twilio redirect dependency
- Verdict: **Verify and close** · Type: Task · Priority: High · Effort: Low · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-29
- The Twilio redirect dependency repair is merged into dev. npm and Bun both resolve follow-redirects 1.16.2.
- Current behavior: PR #3076 merged at e5db5f28 and the approved batch PR #3070 merged at af5767d6. The current npm and Bun lockfiles retain the fixed runtime dependency.
- Root cause: The two locks resolve different compatible versions of the same transitive runtime package.
- Resolution: Complete release acceptance. Do not restart the dependency patch from the stale open-PR record.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Existing tests: Six loopback Twilio/Axios cases pass. The old npm tree fails three credential-forwarding cases while three controls pass; the old Bun tree already passes.; Full npm run ci:local passed on the final commit. All applicable exact-head GitHub checks passed.
- Missing tests: Release acceptance remains; no live provider traffic is required to retest redirect credential isolation.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Task, Priority High, Effort Low, Enviornment unset; assignee @wra-sol. Parent #1802 (open). Children: none. Native open blockers: none. PR #3076 and batch #3070 are merged. Release acceptance remains.

### [#2994](https://github.com/chester-hill-solutions/callcaster/issues/2994) Task: decide whether an archived workspace's API keys stay valid
- Verdict: **Verify and close** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-31
- Permanent API-key revocation is merged and deployed to dev in PR #3096. Restore needs new keys. Operator and release acceptance remain.
- Current behavior: At dev@05195e1e and later, archive deletes the workspace keys in its final transaction. Archived keys and sessions cannot use workspace APIs; restore also removes legacy keys before reopening access.
- Root cause: The old archive write retained keys, and key creation did not share its workspace lock. PR #3096 adds the shared lock and active-workspace checks.
- Resolution: Verify the merged archive and restore flow, then follow the release process. Do not implement another revocation patch.
- Look in: `app/server/workspace-credentials.server.ts`, `app/lib/workspace-membership.server.ts`, `app/server/workspace-restore.server.ts`, `test/integration-db/workspace-archive-credentials.test.ts`
- Existing tests: The original runtime failed seven of nine initial database cases. The merged fix passed 23 real-session database tests, 149 affected Node tests and 10 UI tests, plus full local and exact-head GitHub CI.; The dev app and worker were healthy at merge 05195e1e; /readyz returned 200.
- Missing tests: Operator acceptance and promotion to master remain. Provider tests used an isolated fake; they did not revoke deployed keys or release live numbers.
- Done when: Archive permanently revokes the workspace keys and reports the exact count.; Archived workspaces refuse key and session access.; Restore requires new keys, including for workspaces archived under the old rule.; Concurrent key creation cannot leave a valid key after archive.; Failed number release keeps the workspace and its keys active; database failures roll back key deletion.
- Tracker: Native Project Status is on-dev, read in the authenticated board on 2026-11-01. Assigned to @wra-sol, child of High-priority #2732; own Priority, Effort and Enviornment fields are unset. The owner decision is recorded at https://github.com/chester-hill-solutions/callcaster/issues/2994#issuecomment-6549744222 . Keep open for operator and release acceptance.

### [#2995](https://github.com/chester-hill-solutions/callcaster/issues/2995) Task: keep a released number's row with a released status
- Verdict: **Verify and close** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-11-01
- Released-number history is merged and deployed to dev in PR #3097. Operator and release acceptance remain.
- Current behavior: At dev@0b73c943, release retains the original workspace_number row with released status and a date. Workspace and support views show read-only history; live lists, routing, senders, rental billing and reports exclude it.
- Root cause: The old release path deleted the original row, and number consumers assumed every stored row was live. PR #3097 adds the lifecycle filter and database protection with the release write.
- Resolution: Verify the merged history and live-use exclusions, then follow the release process. A later explicit purchase creates a new rental row; do not reactivate the retained row.
- Look in: `app/server/number-release-intent.server.ts`, `app/lib/workspace-number-history.server.ts`, `app/components/phone-numbers/NumberHistory.tsx`, `client/migrations/20261031000001_workspace_number_release_history.sql`, `test/integration-db/number-history-live-paths.test.ts`
- Existing tests: The original runtime failed 15 of 56 initial cases. The final source passed 37 local gates, 3,523 affected Node tests, 125 focused database tests, 23 UI tests and 48 response/API contract checks.; Full PostgreSQL 18 CI passed 1,358 cases, including 40 new live-path cases. All 19 applicable exact-head checks and both post-merge drift checks passed.; Dev app and worker were healthy at merge 0b73c943; /readyz returned 200.
- Missing tests: Operator acceptance and promotion to master remain. Provider tests used an isolated fake; no live number was released.
- Done when: Release retains the original row with released status and a date.; Live lists, routing, senders, billing and reports exclude released rows.; Workspace and support history show the release date without mutation controls.; Repeat release and attempts to reactivate the same row are refused without repeated provider work or charges.; Archive keeps release-first ordering and failure recovery; script/queue cleanup preserves valid history references.
- Tracker: Native Project Status is on-dev, confirmed in the authenticated board on 2026-11-01. Assigned to @wra-sol, child of High-priority #2732; own Priority, Effort and Enviornment fields are unset. Keep open for operator and release acceptance.

### [#2992](https://github.com/chester-hill-solutions/callcaster/issues/2992) Task: restore an archived workspace
- Verdict: **Verify and close** · Status: on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Assignee: @wra-sol · Updated: 2026-10-31
- Admin restore is merged into dev in PR #3094. Operators can identify archived workspaces and confirm a restore that preserves released-number state.
- Current behavior: PR #3094 merged at f979d25a with a tree equal to tested 095c21a7. All 17 applicable GitHub checks pass, including 1,306 PostgreSQL 18.6 cases and all 11 restore cases. Both dev app and worker are online at the exact merge.
- Resolution: Verify the operator flow in an approved dev test workspace, then follow release acceptance. The issues remain open; restore does not re-rent released numbers.
- Tracker: Native Task, assigned @wra-sol, parent #2732 verified. Priority, Effort and Enviornment are unset. Actual Project Status on-dev was verified in both authenticated issue sidebars after merge. There are no open PRs.

### [#2993](https://github.com/chester-hill-solutions/callcaster/issues/2993) Task: show archived workspaces in the admin console
- Verdict: **Verify and close** · Status: on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Assignee: @wra-sol · Updated: 2026-10-31
- Admin archive visibility is merged into dev in PR #3094. Operators can identify archived workspaces and confirm a restore that preserves released-number state.
- Current behavior: PR #3094 merged at f979d25a with a tree equal to tested 095c21a7. All 17 applicable GitHub checks pass, including 1,306 PostgreSQL 18.6 cases and all 11 restore cases. Both dev app and worker are online at the exact merge.
- Resolution: Verify the operator flow in an approved dev test workspace, then follow release acceptance. The issues remain open; restore does not re-rent released numbers.
- Tracker: Native Task, assigned @wra-sol, parent #2732 verified. Priority, Effort and Enviornment are unset. Actual Project Status on-dev was verified in both authenticated issue sidebars after merge. There are no open PRs.


### [#2943](https://github.com/chester-hill-solutions/callcaster/issues/2943) Reset password email styling is off
- Verdict: **Verify and close** · Type: Task · Priority: High · Effort: nothing-burger · Environment: dev · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-10-24
- High-priority email styling fix is on dev in PR #2954. The recorded 2026-10-24 decision keeps the postal address; no footer-content decision remains.
- Current behavior: The shared email shell uses the repaired font attributes and retains the postal footer as explicitly requested.
- Root cause: The original layout defect needs real mail-client acceptance; the old planning record missed the later keep-address decision.
- Resolution: Verify password-reset alignment in real mail clients and compare other transactional emails that use the same shell. Keep the postal address. Follow the release acceptance path.
- Look in: `app/lib/email-layout.server.ts`, `test/email-layout.server.test.ts`
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Task, Priority High, Effort nothing-burger, Enviornment dev; assignee none. Parent #2075 (open). Children: none. Native open blockers: none. PR #2954 is merged. The recorded owner decision keeps the postal address; real mail-client acceptance remains.

### [#3091](https://github.com/chester-hill-solutions/callcaster/issues/3091) Provide a reviewed repair for duplicate workspace contacts
- Verdict: **Verify and close** · Type: Bug · Priority: High · Effort: High · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-31
- Reviewed repair from High-priority parent #2546 is merged into dev. Operators can merge confirmed copies of one person without merging different people who share a phone.
- Current behavior: PR #3093 is merged into dev at f5bbbfe5. The tested merge preserves source profiles, history, call lists, queue completion, restrictive opt-outs and continuation links. Both dev deployments are successful, and a read-only query confirms the receipt table and recorded migration.
- Root cause: Legacy duplicate-person rows leave the strict manual-SMS identity guard ambiguous. Direct deletion would cascade through history and queue links.
- Resolution: Verify the deployed operator flow with approved data and follow release acceptance. Keep the issue open and do not add further code without a failing requirement.
- Look in: `app/server/contact-merge.server.ts`, `app/server/contact-merge-relations.server.ts`, `app/components/contact/ContactMergePanel.tsx`, `test/integration-db/contact-merge.test.ts`
- Existing tests: All 37 local gate checks pass on clean cb175e79. Focused validation passes 116 database/schema cases, 78 Node cases and 37 UI cases. Fresh database setup and both migration-list guards pass.; All 19 applicable exact-head GitHub checks pass. PostgreSQL 18.6 runs all 30 repair cases within 1,295 passing database cases. Full Node/UI, browser, build, bundle, codegen and schema gates pass.; The original merge regressions fail while valid controls pass. The import lock-order regression and saved list-total regression fail before their fixes. Rollback includes profile, membership, history, queue, continuation and list-total state.; The dev merge tree equals tested cb175e79. App and worker are online at f5bbbfe5, readiness passes, and the receipt table plus migration ledger were verified with transaction_read_only enabled.
- Missing tests: Deployed operator acceptance with approved contacts and release acceptance.
- Done when: Do not merge distinct external or voter identities or bypass ambiguous-recipient protection.; Retain the chosen profile, source snapshots, history and completed queue state. Any saved opt-out remains effective.; Keep import receipts immutable and serialize imports with repair. Reject active work and stale reviews; roll back failures; repeat requests apply once.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority High, Effort High, Enviornment unset; assignee @wra-sol. Parent #2546 (open). Children: none. Native open blockers: none. PR #3093 is merged at f5bbbfe5. Operator and release acceptance remain. Parked #3081, #3086 and #3092 branches are preserved.

### [#3088](https://github.com/chester-hill-solutions/callcaster/issues/3088) Honor opt-outs across duplicate workspace contacts in campaign SMS
- Verdict: **Verify and close** · Type: Bug · Priority: High · Effort: Medium · Environment: unset · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-31
- High-priority consent requirement from #2546. A saved opt-out on any workspace copy must block campaign SMS to that normalized phone.
- Current behavior: PR #3090 is merged into dev at 71ecaadd. Campaign SMS reads all normalized workspace phone matches and blocks any saved opt-out before intent, provider and outreach work.
- Root cause: Bulk campaign dispatch checks only member.contact.opt_out; its message duplicate lookup and in-process phone claim do not read other saved contact opt-outs.
- Resolution: Verify deployed behavior and release acceptance. Preserve eligible sends, tenant isolation, queue attempts, credits and sender policies. No further implementation is needed without a failing requirement.
- Look in: `app/lib/campaign-sms-dispatch.server.ts`, `app/lib/database/contact.server.ts`, `test/campaign-sms-dispatch-contract.test.ts`, `test/integration-db/sms-recipient-identity.test.ts`
- Existing tests: The new requirement fails on both real adapters with the old coordinator; 17 controls pass.; Rebased 982371e6 passes all 37 local checks, 136 affected Node cases and 36 real-Postgres cases with no test skips. Checks cover both adapters, no intent/provider/outreach work on opt-out or read failure, eligible and all-opted-in duplicate controls, formatted and international phones, another workspace, and 65,536 selected phones.; Before the CI tooling rebase, full local CI passed on clean 3f532afa in 698.01 seconds: 6,159 Node cases with three existing skips, 34 Bun cases and 1,568 UI cases; all guards, typecheck, lint, build, bundle and codegen checks passed. The rebase changes only approved CI tooling paths; application and affected test sources are unchanged.; Final publication head 4395c28a passes the fast local gate, 136 affected Node cases, 36 real database cases and all applicable GitHub CI. Squash merge 71ecaadd has the identical tested tree.
- Missing tests: Deployed dev and release acceptance.
- Done when: An opted-out same-workspace phone copy blocks the queued copy, including records outside the selected audience.; Both adapters enforce the rule before message intents, provider calls and outreach attempts.; Other phones and other workspaces cannot block a permitted recipient.; All-opted-in duplicates retain the existing one-send behavior.; A failed read consumes no contact attempts and removes no queued work.; Bound database parameters and reuse canonical normalized phone identity.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority High, Effort Medium, Enviornment unset; assignee @wra-sol. Parent #2546 (open). Children: none. Native open blockers: none. PR #3090 is merged at 71ecaadd; release acceptance remains.

### [#3071](https://github.com/chester-hill-solutions/callcaster/issues/3071) Patch Better Auth verification token isolation
- Verdict: **Verify and close** · Type: Task · Priority: Urgent · Effort: Medium · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-29
- The repair merged into dev through PR #3074. Deployed verification and release acceptance remain.
- Current behavior: The tested repair is on dev at 553a7a63, from original head ceef311c. The complete Project snapshot now reports on-dev. No released-master or live-provider acceptance is claimed.
- Root cause: Affected library versions share verification identifiers between token purposes. Version 1.7.7 is published and fixes the namespace separation.
- Resolution: Verify the deployed repair and complete release acceptance. Keep the issue open until promotion and symptom verification are complete.
- Look in: `package.json`, `package-lock.json`, `bun.lock`, `app/server/auth-instance.ts`
- Existing tests: Token-purpose regressions fail against the old library and pass against the patch.; Full npm run ci:local passed on the final commit. All applicable exact-head GitHub checks passed.; PR #3074: 6,102 Node, 34 Bun and 1,541 UI cases; three existing Node skips passed at ceef311c; merged into dev as 553a7a63. The current complete Project export confirms on-dev.
- Missing tests: Deployed verification and required release acceptance remain.
- Done when: A token from one purpose cannot authenticate another purpose or consume its pending state.; Valid email/password and one-use Magic Link controls pass in an isolated fixture.; App verification, recovery, session and two-factor policies remain covered.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Task, Priority Urgent, Effort Medium, Enviornment unset; assignee @wra-sol. Parent #1802 (open). Children: none. Native open blockers: none. PR #3074 is merged; no new isolation implementation is needed without a failing requirement. Release acceptance remains.

### [#2774](https://github.com/chester-hill-solutions/callcaster/issues/2774) IVR Voicemails Drops aren't smart and get cut off
- Verdict: **Verify and close** · Type: Bug · Priority: Urgent · Effort: unset · Environment: prod · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-26
- IVR voicemail drops start during the greeting and a valid machine-end result can hang up without leaving the saved message.
- Current behavior: PR #3005 merged into dev on 2026-10-26. Machine detection waits for the greeting end before voicemail playback. Urgent priority; live Project Status is on-dev.
- Root cause: Twilio Enable returns machine_start while the greeting is still playing. The fixed one-second pause cannot wait for that greeting. The previous substring classifier also excluded machine_end_other, which Twilio documents as a machine result. Regression tests reproduced both code defects before the patch.
- Resolution: Verify a complete voicemail with an approved test recipient, then follow the release process. No new source fix is required unless acceptance fails.
- Look in: `app/lib/ivr-machine-detection.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/lib/ivr-machine.server.ts`, `app/routes/api+/ivr.action.server.ts`
- Existing tests: test/campaign-ivr-dispatch.test.ts; test/campaign-test-call.test.ts; test/ivr-machine-detection.test.ts; test/ivr-page.route.test.ts; test/ivr.route.test.ts; test/ivr-initiate.server.test.ts
- Missing tests: A controlled live voicemail recording with a confirmed test recipient after deployment.
- Done when: Configured drops wait for greeting completion on production and test calls.; Beep, silence and other machine-end results play the saved drop; completed callbacks cannot replay it.; An approved recipient confirms the entire message was recorded after deployment.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority Urgent, Effort unset, Enviornment prod; assignee @wra-sol. No parent. Children: none. Native open blockers: none. PR #3005 is merged. A complete voicemail with an approved recipient remains the provider acceptance step.

### [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) Restore the password recovery email journey
- Verdict: **Verify and close** · Type: Bug · Priority: Urgent · Effort: Low · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- The password recovery journey is wired end to end again: the request is pinned to the configured BASE_URL with /reset-password as the callback, Better Auth emails a link that keeps its token, the reset page reads that token and posts it to the reset action, and the action hands it to the installed Better Auth `resetPassword` implementation; the success copy now describes a password change, and both verification-callback failure paths land on a real route without a token.
- Current behavior: Reset recovery, password-rule feedback and the missing-token recovery path have merged. The 2026-10-23 issue reports read-only deployed dev checks for feedback; the real email journey remains unverified.
- Root cause: The fix is commit 9aa2025e 'Restore the password recovery email journey (#2279)', an ancestor of origin/master (first merged by release 268c2692 on 2026-10-08), with two later touches in master: cb88df8b 'Show reset-password action failures once (#2310)' and ca652b9e 'fix: return to sign in after password reset (#2606)'. IMPORTANT — the operator's 2026-10-17 comment ('I get "This reset link is invalid or has expired. Request a new one from the sign-in page." when attempting to reset password') was NOT a broken journey: the deployed dev log for that minute shows exactly one entry, `reset-password: reset rejected` with `error: "Password too short"` (Railway dev env 18ef9173-4b33-4a62-9b94-9dfc7a36eb05, service CallCaster, 2026-10-17T09:58:21Z). That error is raised by Better Auth AFTER the token was accepted, so the emailed link did reach the reset form with a valid token; the submitted new password was simply shorter than Better Auth's minimum (8 characters, node_modules/better-auth/dist/context/create-context.mjs:185). One residual defect is worth a follow-up ticket but is outside this issue's acceptance criteria: the reset form has no `minLength={8}` on its password inputs (app/routes/reset-password.tsx:35-46), unlike sign-up (app/routes/signup.tsx:121), and the too-short error is reported through the generic catch in app/routes/reset-password.action.server.ts:58-70 with the misleading 'This reset link is invalid or has expired' text. manual: true — the final proof is a real reset email landing in a real inbox, a real link, a real password change and a real sign-in with the new password.
- Resolution: Request a reset with an approved test account, receive the issued email, follow its link and change the password. Confirm expiry/replay behavior and promote through the release process. Do not treat read-only page checks as full recovery acceptance.
- Look in: `app/routes/remember.action.server.ts`, `app/routes/reset-password.loader.server.ts`, `app/routes/reset-password.action.server.ts`, `app/routes/reset-password.tsx`, `/auth/callback.loader.server.ts`, `app/routes/remember.tsx`
- Existing tests: test/password-recovery-journey.test.ts — walks the ACTUAL issued email through the installed Better Auth (memory adapter): it reads the reset link out of the sent mail, drives the real `api+/auth/$.loader.server` callback (expects 302 to /reset-password?token=<issued token>), loads the reset page (expects `{ token }`), submits the new password, asserts the password changed (the old password no longer signs in, the new one does) and that the link cannot be replayed (the second submit returns 400). It also covers identical generic feedback for known and unknown emails, the caller-selected-host resistance, the expired-link path, and the request rate limit. Ran green on this tree: `npx vitest run -c vitest.node.config.ts test/password-recovery-journey.test.ts ...` -> 4 files passed, 34 tests passed. test/ui/reset-password-feedback.test.tsx and e2e/specs/password-reset-feedback.spec.ts cover the failure feedback (one toast, retained fields, no layout shift) but the UI suite could not be executed in this checkout (every UI test fails with 'Cannot read properties of null (reading useContext)' from the vendored shad-cc copy of next-themes/react; an unrelated control test fails identically — a local install artifact, not a code defect).
- Done when: A person confirms the reported symptom is gone on master.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status tested-on-dev. Native Type Bug, Priority Urgent, Effort Low, Enviornment unset; assignee none. No parent. Children: #2661 (open), #2943 (open). Native open blockers: none. The timeline records deployed feedback checks from #2944. The current Status records a dev test; real-inbox and release evidence must be checked before closure.

### [#2931](https://github.com/chester-hill-solutions/callcaster/issues/2931) workspace number renewal reminder even though worksapce is in weird limbo state without a number
- Verdict: **Verify and close** · Type: Bug · Priority: Urgent · Effort: unset · Environment: dev · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-23
- Urgent renewal-notice defect has a source fix on dev in PR #2933.
- Current behavior: The rental sweep excludes rows with no provider number SID, so an unprovisioned row is not renewed or announced as a rental.
- Root cause: The old sweep selected rented rows without checking that a provider rental existed.
- Resolution: Run the focused rental tests, then verify the affected workspace and scheduled notices in the deployed environment before release.
- Look in: `app/lib/number-rental-billing.server.ts`, `test/number-rental-billing.server.test.ts`
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority Urgent, Effort unset, Enviornment dev; assignee @wra-sol. Parent #2168 (open). Children: none. Native open blockers: none. PR #2933 is included in current dev. Scheduled notice and billing acceptance remain.

### [#2519](https://github.com/chester-hill-solutions/callcaster/issues/2519) call settings: call in verification not conigured
- Verdict: **Verify and close** · Type: Bug · Priority: Urgent · Effort: Medium · Environment: prod · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- The call-in verification number is now platform data instead of an environment variable: a verification_number table holds the numbers, getActiveVerificationNumber reads the one active row, the Admin System Settings panel registers, activates and removes a number, and the session route answers 503 'Call-in verification is not configured' when no row is active.
- Current behavior: The code is in master. What is left is a person's action on master, so the issue stays open until they finish it and confirm it.
- Root cause: PARTIAL, and manual. What is covered: the number is no longer an invisible, redeploy-only environment variable. It is a database row, it is visible and changeable in Admin, the decision is written in docs/adr/0038, and the route answers a clean 503 instead of failing. What is not covered: the number itself. The issue's screenshot is the Call settings modal showing 'Call-in verification is not configured', and that is exactly what production still shows after this release, because no row is active. The release guide for the same release says so in plain words. The remaining work is an operator action, not a code change: register and activate a number in Admin (or run scripts/configure-verification-number.mjs), then place a real verification call. manual: true because that last step is a real phone call to a real handset. The candidate commit 6c7c361a (PR #2726) is not an ancestor of origin/master by SHA, but its content is in master through the release merge 91c4409b.
- Resolution: No new code. Register and activate the number (or run the operator script), then make the real call and confirm it.
- Look in: `app/lib/verification-number.server.ts`, `/verify-call-in-session.loader.server.ts`, `/route.action.server.ts`, `/panels/AdminSystemSettingsPanel.tsx`, `docs/release-test-guide-2026-10-19.md`
- Existing tests: No automated test for this change. scripts/configure-verification-number.mjs registers and activates a number in one transaction and is the operator path, and docs/release-test-guide-2026-10-19.md:13-21 lists the manual checks.
- Done when: A person confirms the reported symptom is gone on master.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-qa. Native Type Bug, Priority Urgent, Effort Medium, Enviornment prod; assignee @wra-sol. No parent. Children: none. Native open blockers: none. The code is in master; an operator must register and activate a dedicated number and complete a real verification call. Do not use a customer support line.

### [#3085](https://github.com/chester-hill-solutions/callcaster/issues/3085) Reuse an existing workspace contact across audience imports
- Verdict: **Verify and close** · Type: Bug · Priority: High · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-31
- Import reuse is merged into dev through PR #3087 at 6f940f35. Verify the deployed flow and release before closing; no new import fix is needed.
- Current behavior: New imports reuse one normalized workspace contact, preserve its saved data and add audience membership. Ambiguous legacy contacts receive a clear row result without another contact or membership.
- Root cause: The old import lookup checked only the target audience, so another audience could create a second workspace contact and make manual SMS ambiguous.
- Resolution: Verify a synthetic repeated-phone import through deployed dev without sending SMS, then follow release acceptance. Existing duplicate repair remains in #2546; do not claim that the whole parent is fixed.
- Look in: `app/server/audience-import-effects.server.ts`, `app/lib/database/contact.server.ts`, `app/lib/audience-import-download.server.ts`, `test/integration-db/audience-import-recovery.test.ts`, `test/integration-db/audience-import-report.test.ts`
- Existing tests: 50 real-database cases pass without skips. The original implementation fails four contact-reuse cases while 33 controls pass. The original renderer fails the new reuse/ambiguity download assertion while three controls pass.; 35 focused Node cases pass. Changed runtime files and the report test have no lint warnings; the recovery test retains its one existing warning.; Full npm run ci:local passes on clean 030d8bd45cec1ab46243489322ce0306f4181d9a in 698.38 seconds: 6,153 Node tests with three existing skips, 34 Bun tests and 1,568 UI tests. All guards, typecheck, lint, build, bundle and codegen checks pass. Start/end commit and source hashes match.
- Missing tests: Deployed dev acceptance of repeated-phone imports and default-branch promotion remain. No live SMS or phone traffic was sent.
- Done when: One workspace contact can belong to two audiences.; Concurrent imports, replay and recovery cannot duplicate contacts, memberships or receipts.; Reuse preserves saved profile, opt-out, line type, household and history.; Ambiguous legacy phones add no contact or membership and produce a clear report.; Workspace isolation and unmapped-phone behavior stay intact.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority High, Effort unset, Enviornment unset; assignee @wra-sol. Parent #2546 (open). Children: none. Native open blockers: none. PR #3087 is merged at 6f940f35; release acceptance remains. Do not claim the whole parent is complete.

### [#3072](https://github.com/chester-hill-solutions/callcaster/issues/3072) Patch the API generator Handlebars compiler
- Verdict: **Verify and close** · Type: Task · Priority: High · Effort: Low · Environment: unset · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-29
- The repair merged into dev through PR #3075. Deployed verification and release acceptance remain.
- Current behavior: The tested repair is on dev at c33a0a20, from original head 7e044729. The complete Project snapshot now reports on-dev. No released-master or live-provider acceptance is claimed.
- Root cause: The existing override floor still permits the affected compiler release.
- Resolution: Verify the deployed repair and complete release acceptance. Keep the issue open until promotion and symptom verification are complete.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Existing tests: Four real compiler cases pass; the old compiler fails three while the normal control passes.; Full npm run ci:local passed on the final commit. All applicable exact-head GitHub checks passed.; PR #3075: 6,106 Node, 34 Bun and 1,541 UI cases; three existing Node skips passed at 7e044729; merged into dev as c33a0a20. The current complete Project export confirms on-dev.
- Missing tests: Deployed verification and required release acceptance remain.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Task, Priority High, Effort Low, Enviornment unset; assignee @wra-sol. No parent. Children: none. Native open blockers: none. PR #3075 is merged; no new compiler implementation is needed without a failing requirement. Release acceptance remains.

### [#2603](https://github.com/chester-hill-solutions/callcaster/issues/2603) SMS Exports should have "external_id" and/or all contact fields not just contact name
- Verdict: **Verify and close** · Type: Feature · Priority: High · Effort: Low · Environment: prod · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: @wra-sol · Updated: 2026-10-28
- High priority. SMS report CSVs omit external_id, although the older campaign-export CSV already includes it.
- Current behavior: PR #3068 merged into dev as a0060296 on 2026-10-28. SMS all-message and opt-out CSVs append external_id. Ambiguous or missing contact identity remains blank; existing columns and dates are preserved. Live Project Status on-dev was verified after the merge.
- Root cause: The report data projection and CSV column list do not carry the contact external_id.
- Resolution: Verify an approved review-environment CSV against known contact IDs, then promote through the release process. No additional source repair is needed unless acceptance fails.
- Look in: `app/lib/campaign-sms-report.server.ts`, `app/lib/campaign-sms-report-data.server.ts`, `test/integration-db/campaign-sms-report.test.ts`
- Existing tests: Four added real-PostgreSQL identity cases and the existing report suite pass: 12 cases, zero skipped. Original source and weakened identity guards fail the relevant cases. Full local CI and all applicable GitHub checks passed at final head 582f1255 before the approved merge.
- Done when: Exported delivery and reply CSVs retain the contact external_id.; Missing external IDs produce an empty cell without losing the row.; Existing access rules, column values and tenant scope remain correct.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Feature, Priority High, Effort Low, Enviornment prod; assignee @wra-sol. Parent #1752 (closed). Children: none. Native open blockers: none. PR #3068 is merged at a0060296. Verify an approved CSV against known external IDs, then complete release acceptance.

### [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) IVR estimates are too low. projected CPS is too high
- Verdict: **Verify and close** · Type: Bug · Priority: High · Effort: Low · Environment: dev · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-26
- The revised completion estimate is on dev in PR #3006. Provider pacing from PR #3009 is also merged; real campaign accuracy still needs acceptance.
- Current behavior: PR #3006 merged into dev on 2026-10-26. The completion estimate now includes the durable worker polling delay. High priority; live Project Status is on-dev.
- Root cause: The old 200ms queue-next plus 500ms webhook-delay heuristic assumes 1.43 dial starts per second. Durable dispatch now schedules a successor one second after each batch; an idle worker sleeps five seconds before claiming it. The concurrency-only patch did not model that loop. The UI also appends calls/sec and CPS to values already converted to per minute. Remaining queue counts are correct; no arbitrary duration multiplier or worker pacing change is needed.
- Resolution: Compare the displayed completion estimate with an approved real campaign and follow release acceptance. PR #3009 for #3007 is merged at 4253788d; do not start another pacing patch from the old open-PR claim.
- Look in: `app/lib/campaign-outbound-estimate.ts`, `app/lib/throughput-config.ts`, `app/lib/worker/poll-jobs.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`
- Existing tests: test/worker.test.ts: real poll loop with fake time proves a one-second successor waits five seconds.; test/campaign-outbound-estimate.test.ts: 24/minute cadence, stable projected average finish for both reported screenshot counts, configured-rate and concurrency controls.; test/ui/campaign-launch-ivr-estimate.test.tsx: real notice renders calls/minute, worker pacing and remaining-queue wording.
- Missing tests: After release, compare the displayed range with an actual campaign; the estimate is a planning model and provider/database delays can vary.
- Done when: Default planning rate includes the durable worker batch and poll cadence.; The two reported queue counts keep the average projected finish stable at the reported processing pace.; Rate labels use consistent units and distinguish a drained queue from calls still in flight.; A deployed campaign confirms the estimate is useful before closing.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority High, Effort Low, Enviornment dev; assignee @wra-sol. No parent. Children: none. Native open blockers: none. A real campaign comparison remains; code merge is not throughput acceptance.

### [#2732](https://github.com/chester-hill-solutions/callcaster/issues/2732) Delete Workspace Option
- Verdict: **Verify and close** · Type: Feature · Priority: High · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-24
- High priority. Workspace archive and provider-number release are implemented in PR #2958.
- Current behavior: archiveWorkspace releases each number through removeWorkspacePhoneNumber before setting archived_at. A release failure returns 409 and keeps the workspace visible for retry. History is retained.
- Root cause: The archive flow preserves provider release state instead of deleting rows before their numbers can be released.
- Resolution: Verify archive, release-failure recovery, retained history and navigation in an approved test workspace. Keep restore and archived-key policy in their separate tasks.
- Look in: `app/lib/workspace-archive.server.ts`, `test/workspace-archive.test.ts`, `test/workspace-archive-middleware.test.ts`
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Feature, Priority High, Effort unset, Enviornment unset; assignee @wra-sol. No parent. Children: #2992 (open), #2993 (open), #2995 (open), #2994 (open). Native open blockers: none. Archive, restore, key revocation and released-number history are on dev through #2958, #3094, #3096 and #3097. Approved workspace/operator and release acceptance remain; do not archive a live customer for testing.

### [#2757](https://github.com/chester-hill-solutions/callcaster/issues/2757) Include all subaccount resources in the Twilio prune report
- Verdict: **Verify and close** · Type: Bug · Priority: High · Effort: Low · Environment: prod · Size: S · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-24
- The report repair uses the Messaging Services API with subaccount credentials, scans all SDK pages and stops on unreadable lists. The keep-list and deletion policy stay unchanged.
- Current behavior: Fixed on dev. The prune report walks the subaccount's resources rather than only the parent account's, so resources held under the subaccount are included in the report.
- Root cause: The subaccount lookup used /2010-04-01/Accounts/{sid}/Messaging/Services.json, ignored the raw response shape and caught every error as an empty list. SDK limit options capped the total inventory instead of setting a page size.
- Resolution: Fixed in #2758 (`860b344f`): `scripts/lib/twilio-prune-resources.mjs` and `scripts/twilio-resource-prune-report.mjs`.
- Look in: `scripts/twilio-resource-prune-report.mjs`, `scripts/lib/twilio-prune-resources.mjs`, `test/twilio-prune-resources.test.ts`
- Existing tests: test/twilio-prune-resources.test.ts
- Done when: Include Messaging Services with the subaccount’s own credentials.; Enumerate all account and resource pages.; Fail unreadable lists with account context instead of reporting an empty successful scan.; Keep the report read-only and preserve all keep-list and environment/owner decisions.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Bug, Priority High, Effort Low, Enviornment prod; assignee @wra-sol. Parent #1165 (open). Children: none. Native open blockers: none. PR #2758 is merged at 860b344f. The suspended-account read failure stays explicit; full cleanup is not accepted.

### [#2531](https://github.com/chester-hill-solutions/callcaster/issues/2531) Add a Notes field for all callers
- Verdict: **Verify and close** · Type: Feature · Priority: High · Effort: Medium · Environment: prod · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-24
- PR #2755 is merged into dev. Notes are available to all callers in both dialing modes, with saved-result restoration and contact-safe autosave. Deployed and release acceptance remain.
- Current behavior: Fixed on dev. Every caller role has a Notes field on the call screen, edited like the other questionnaire fields.
- Root cause: The call screen only renders script questions. Saved outreach results do not initialize the draft, contact changes can retain the preceding draft, and the debounce does not retain the original save target across a handoff. Contact selection also discards results when no provider call row exists.
- Resolution: Verify Notes with a caller role, reload the saved attempt and switch contacts. Confirm notes and questionnaire results remain separate and the phone/desktop layouts meet the recorded criteria. Follow release acceptance.
- Look in: `app/components/call/CallScreen.Questionnaire.tsx`, `app/hooks/call/useCallScreen.ts`, `app/hooks/utils/useDebouncedSave.ts`, `app/routes/api+/questions.action.server.ts`, `app/lib/callscreenActions.ts`
- Existing tests: test/ui/call-screen-questionnaire.test.tsx; test/ui/hooks-call-screen.test.tsx
- Done when: All callers can edit Notes in Power and Predictive modes.; Notes save with the selected outreach attempt and return after reload or contact selection.; Questionnaire answers, notes and disposition edits preserve one another.; Notes do not carry over when the selected contact changes.; The field uses the shared accessible controls and works at phone and desktop widths.; Desktop queue, questionnaire and call-control frames have equal heights; long scripts retain reachable call controls and phone layouts remain stacked.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Feature, Priority High, Effort Medium, Enviornment prod; assignee @wra-sol. No parent. Children: none. Native open blockers: none. PR #2755 is merged; operator and release acceptance remain.

### [#2512](https://github.com/chester-hill-solutions/callcaster/issues/2512) SMS Message page is super slow when sending out a campaign
- Verdict: **Verify and close** · Type: Task · Priority: High · Effort: Medium · Environment: unset · Labels: ux, business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- The chats list defaults to the hasReplied filter and renders a virtual row window: the loader and the hook both default the sort to hasReplied, the SQL and the JS filter drop conversations the contact never replied to, ConversationList draws a fixed-height spacer with absolutely positioned rows, and the accumulated pages are cached under a fetcher key built from the campaign, sort and search filters.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Both asks are implemented in master: the list defaults to conversations where the other user replied, and the list is virtualised with a page cache so the page does not freeze as the list grows. manual: true because the reported symptom is perceived slowness under a real campaign load; the virtualisation is structural but no test measures frame cost, so only a person on a large campaign can confirm the page stays responsive.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/hooks/chats/useChatsPage.ts`, `id/chats.loader.server.ts`, `app/lib/database/workspace-conversations.server.ts`, `app/lib/chat-conversation-sort.ts`, `id/chats/ConversationList.tsx`, `app/lib/chats/conversation-utils.ts`
- Existing tests: test/chat-conversation-sort.test.ts:31 — 'filters out unreplied conversations for hasReplied' and the getChatSortOption default cases (lines 189-196); test/ui/use-chats-page-pagination.test.tsx:185 — 'defaults to conversations with a reply' plus the page-cache key cases; test/conversation-utils.test.ts — the phone-key merge cases. Added by 4ea8f3ba (PR #2535).
- Done when: A person confirms the reported symptom is gone on master.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-qa. Native Type Task, Priority High, Effort Medium, Enviornment unset; assignee @wra-sol. No parent. Children: none. Native open blockers: none. Verify responsiveness with a large approved campaign. Virtualization and a page cache do not measure perceived performance.

### [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) IVR key press does not interrupt the current audio block (prompt sits outside the Gather)
- Verdict: **Verify and close** · Type: Bug · Priority: High · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-19
- The IVR prompt is now emitted inside the `<Gather>` element instead of as its sibling, so Twilio listens for DTMF while the prompt plays and a key press stops the audio and takes the mapped branch; both the outbound campaign IVR and the inbound IVR route render through the same shared block renderer that does this.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix commit 51240b0b 'fix(ivr): nest prompts inside Gather so key presses interrupt audio (#1841) (#1851)' — `git merge-base --is-ancestor 51240b0b origin/master` confirms it is in master. The TwiML snapshot tests prove the structural change (prompt inside Gather) but the barge-in itself is a Twilio platform behaviour heard on a live PSTN call, so manual: true: a person still has to place a call and press a key mid-prompt to confirm the audio actually stops. The issue's note about `speechTimeout`/`timeout` still behaving with a nested prompt is covered — the gather attributes are unchanged except for the DTMF-only/speech split (see #1856) and `numDigits` for single-key menus.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-block-render.server.ts`, `blockId.action.server.ts`, `test/ivr-block.route.test.ts`, `test/inbound-ivr-block.route.test.ts`
- Existing tests: test/ivr-block.route.test.ts (outbound) and test/inbound-ivr-block.route.test.ts (inbound) — both assert the nested `<Gather><Play/></Gather>` TwiML. Ran green: `DATABASE_URL=... npx vitest run test/inbound-ivr-block.route.test.ts test/ivr-page.route.test.ts` → 2 files / 24 tests passed; test/ivr-block.route.test.ts also passed in the earlier run.
- Done when: A person confirms the reported symptom is gone on master.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-qa. Native Type Bug, Priority High, Effort unset, Enviornment unset; assignee none. No parent. Children: none. Native open blockers: none. The code is in master; a person must confirm that a mid-prompt key press stops audio on both IVR paths.

### [#2698](https://github.com/chester-hill-solutions/callcaster/issues/2698) call interface in "Predictive Dialer" campaign says "power dialer" and in "power dialer" says "manual dialing"
- Verdict: **Verify and close** · Type: Bug · Priority: Medium · Effort: Low · Environment: dev · Size: XS · Risk: low · Labels: design, ux · Assignee: @wra-sol · Updated: 2026-10-20
- Recommended title: **Show the correct dialing mode on the call screen**
- PR #2754 contains the correct call-screen mode labels and regression coverage. Deployed acceptance remains after merge.
- Current behavior: Fixed on dev. The call screen labels the campaign's own dialing mode: a predictive campaign reads "Predictive dialing" and a power campaign reads "Power dialing".
- Root cause: TopChrome assigns the wrong user-facing name to both values of the predictive flag.
- Resolution: Fixed in #2754 (`e4bb8ac6`): `app/components/call/CallScreen.Header.tsx:250`.
- Look in: `app/components/call/CallScreen.Header.tsx`, `app/components/call/CallScreen.Layout.tsx`, `test/ui/call-screen-leave.test.tsx`
- Existing tests: test/ui/call-screen-leave.test.tsx; test/auto-dial.server.test.ts
- Done when: Predictive Dialer campaigns show Predictive dialing; Power Dialer campaigns show Power dialing; Existing campaign call and leave behavior stays covered
- Tracker: Review [PR #2754](https://github.com/chester-hill-solutions/callcaster/pull/2754), then verify on dev. Keep the issue open until default-branch promotion and release acceptance.

### [#1333](https://github.com/chester-hill-solutions/callcaster/issues/1333) STOP and START text remains visible to operators but no system information messages
- **IN PROGRESS** · Verdict: **Verify and close** · Type: Change Request · Priority: Low · Effort: Low · Environment: prod · Size: XS · Risk: low · Labels: ux · Assignee: none · Updated: 2026-10-24
- Recommended title: **test(chats): prove STOP and START text remains visible to operators**
- STOP/START bodies are stored unchanged and rendered verbatim in the transcript and conversation preview. The only remaining obfuscation is generic opt-out-banner copy ('replied with an opt-out keyword').
- Current behavior: inbound-sms persists the raw body before opt-out processing; ChatMessages renders message.body; ConversationList preview shows it; STOP-only hiding is explicit.
- Root cause: Already implemented; the ask likely refers to banner copy.
- Resolution: Verify the transcript shows the exact text; if the banner is the concern, include the exact matched keyword in ChatOptOutBanner copy. Add tests pinning unchanged persistence.
- Look in: `app/routes/api+/inbound-sms.action.server.ts`, `app/components/sms-ui/ChatMessages.tsx`, `app/components/chats/ChatOptOutBanner.tsx`, `app/lib/chat-opt-out.ts`
- Existing tests: test/inbound-sms.route.test.ts (keyword state changes)
- Missing tests: STOP/START bodies persisted unchanged; transcript/preview exact text
- Done when: Opt-out text unchanged in history; Preview shows exact text; Hiding STOP-only stays explicit
- Tracker: Close after verification; future #1268 consent work replaces the boolean authority.

### [#2507](https://github.com/chester-hill-solutions/callcaster/issues/2507) CSV Upload success should not have a toast (or be a simple success toast that goes away).
- Verdict: **Verify and close** · Type: Change Request · Priority: Low · Effort: nothing-burger · Environment: prod · Labels: ux · Assignee: @sai-sy, @wra-sol · Updated: 2026-10-20
- PR #2749 removes the persistent CSV upload success toast and keeps the inline completion message and saved report link. Full local CI passes; merge and deployed verification remain.
- Current behavior: Fixed on dev. A successful CSV upload no longer raises a persistent success toast; progress is shown in the upload panel and the notice clears.
- Root cause: The completion hook created an infinite-duration root success toast with a report download action, duplicating the upload panel's feedback and report action.
- Resolution: Fixed in #2749 (`5d453f5c`): `app/components/audience/use-audience-upload-progress.ts` no longer imports sonner or emits a success toast.
- Look in: `app/components/audience/use-audience-upload-progress.ts`, `app/components/audience/AudienceUploadProgressPanel.tsx`
- Existing tests: test/ui/audience-import-report-handoff.test.tsx
- Done when: CSV upload success does not create a root toast or a toast download prompt.; Inline completion feedback and the saved row report link remain available.; Embedded and standalone completion callbacks still run once.
- Tracker: Live inspection on 2026-10-20: Change Request; Priority Low; Effort nothing-burger; Enviornment prod; Project Status In progress; no parent, children or dependency links. PR #2749 targets dev and has the verified Development link. The old PR #2576 is closed and unmerged. Keep the issue open until the fix reaches production and the reported symptom is verified.

### [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) Pass the live caller-ID verification status to the onboarding verification sheet
- Verdict: **Verify and close** · Type: Bug · Priority: Low · Effort: Low · Environment: dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-20
- PR #2750 refreshes the onboarding loader from workspace_number events, so an open verification sheet changes from pending to success or failure without a reload. Merge and deployed verification remain.
- Current behavior: Fixed on dev. Number events revalidate the onboarding verification sheet, so the live caller-ID verification status appears without a reload.
- Root cause: PR #1971 added the sheet status prop, but the workspace revalidation hook listened only for campaign, campaign_queue and transaction_history events. The callback already saves and emits the workspace_number update.
- Resolution: Fixed in #2750 (`33d43c1b`): `app/hooks/realtime/useWorkspaceRealtimeRevalidation.ts` revalidates on `workspace_number` events.
- Look in: `app/hooks/realtime/useWorkspaceRealtimeRevalidation.ts`, `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/onboarding.loader.server.ts`
- Existing tests: test/ui/workspace-realtime-revalidation.test.tsx; test/ui/onboarding-first-number-flow.test.tsx
- Done when: An open pending verification sheet displays the success or failure returned by the callback without a page reload; Number events use the existing batched refresh scheduler; navigation, event filtering and cleanup controls keep passing; Complete deployed caller-ID verification acceptance before closing
- Tracker: Live inspection on 2026-10-20: Bug; Priority Low; Effort Low; Enviornment dev; Project Status In progress. Assigned to wra-sol; no parent, children or dependency links. PR #2750 is open into dev with a verified Development link; PR #1971 is the earlier incomplete fix. Keep the issue open for release and deployed acceptance.

### [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) auth pages: sign-in hides the real error behind "We couldn't sign you in, Try again shortly"
- Verdict: **Verify and close** · Type: Task · Priority: Low · Effort: Medium · Environment: unset · Labels: business-logic · Assignee: none · Updated: 2026-10-19
- Sign-in failures are no longer collapsed into one generic message: the shared login helper maps Better Auth's known credential codes (and their expected status) to safe user-facing text, gives provider rate limits their own retry message, and only falls back to the generic string for unknown codes, mismatched statuses, database or network failures — and the browser surfaces that text through the root toast.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The fix is commit 81aebcbb 'Show safe sign-in errors for known provider failures (#2361)', an ancestor of origin/master (first merged by release 268c2692 on 2026-10-08). The issue's own 'Deployed QA — 8 October 2026' section already records browser evidence for the known-credential case on staging, and it explicitly separates the empty-form validation defect into #2494 (out of scope here). manual: true — the issue's remaining acceptance is explicitly a deployed one: 'Check rate-limit feedback and a temporary provider failure on the deployed sign-in page', plus desktop and approved-account checks and two-factor routing. A 429 and a genuine provider outage cannot be produced by a local test, so a person has to sign in on the deployed page and observe the toast.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/platform-auth.server.ts`, `app/routes/signin.action.server.ts`, `app/routes/signin.tsx`
- Existing tests: test/platform-auth.test.ts — the provider-code and status mapping cases for `loginWithPassword` (known 401 invalid-credentials, 403 email-not-verified, 429 rate limit, unknown code, mismatched status, and a thrown DB/network failure that must keep the generic text). test/ui/signin-feedback.test.tsx — 'shows <message> once through the root toaster and retains the form' for 'Invalid email or password.', 'Too many sign-in attempts. Wait a minute and try again.' and "We couldn't sign you in. Try again shortly."; it asserts the toast appears once, the message is NOT inside `<main>` (i.e. not inline text), and the password field keeps its value. The node suite ran green on this tree (`npx vitest run -c vitest.node.config.ts ... test/platform-auth.test.ts` -> 4 files passed, 34 tests passed). The UI suite could NOT be run in this checkout: every UI test fails with 'Cannot read properties of null (reading useContext)' from the vendored shad-cc copy of next-themes/react, and an unrelated control UI test (test/ui/debounce-owner-unmount.test.tsx) fails identically — a local install artifact, not a code defect. The UI test is part of CI.
- Done when: A person confirms the reported symptom is gone on master.

### [#2867](https://github.com/chester-hill-solutions/callcaster/issues/2867) The strict 10/min credential bucket is not applied to every credential surface: POST /api/auth/token performs the…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-29
- Recommended title: **Unify credential rate limits across auth endpoints**
- The repair merged into dev through PR #3079. Deployed verification and release acceptance remain.
- Current behavior: The tested repair is on dev at 04614d2b, from original head 8f66aa28. The complete Project snapshot now reports on-dev. No released-master or live-provider acceptance is claimed.
- Root cause: Token login used a separate 30/min scope, while the catch-all sent signup and reset aliases through the loose scope. The source guard skipped tokenLogin and checked only for some limiter, so comments and wrong scopes could satisfy it.
- Resolution: Verify the deployed repair and complete release acceptance. Keep the issue open until promotion and symptom verification are complete.
- Look in: `app/lib/platform-auth-rate-limit.server.ts`, `app/routes/api+/auth/token.action.server.ts`, `app/lib/platform-auth.server.ts`, `app/routes/signin.action.server.ts`, `app/routes/api+/auth/$.loader.server.ts`, `app/routes/api+/auth/register.action.server.ts`
- Existing tests: 68 focused tests pass. Reverting the runtime fails 11 of 15 cases; loose token and default budgets fail two each, and a split registration budget fails one. Four positive controls pass in every runtime mutation. Restoring the old guard fails 13 cases while nine existing controls pass. Typed Better Auth aliases and the stronger user-scoped 2FA setup limiter are covered. Working source hashes stay unchanged during mutation runs. Tests use the real application limiter with its in-memory backend and mocked auth handlers; no mail or provider traffic.; PR #3079: the complete local gate and all required GitHub checks passed at 8f66aa28; merged into dev as 04614d2b. The current complete Project export confirms on-dev.
- Missing tests: Deployed verification and required release acceptance remain.
- Done when: Every surface that performs an email+password credential check is bounded by the strict 'auth:sign-in' bucket (10/min), and every surface that performs a password-reset request or an account creation is bounded by the 10/min scope documented for that operation, so the per-client budget for the same operation does not depend on which URL the caller uses.
- Tracker: PR #3079 is merged into dev. Actual Project Status on-dev was read from the complete 398-item export. Keep open for deployed verification and release; do not start a duplicate implementation.

### [#2866](https://github.com/chester-hill-solutions/callcaster/issues/2866) Failed credential-bearing workspace writes copy the tenant's Twilio API key secret and subaccount auth token into…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-28
- Recommended title: **Failed credential-bearing workspace writes copy the tenant's Twilio API key secret and subaccount auth token into the log stream and into the error response**
- CallCaster stores each tenant's Twilio provider credentials in three columns of public.workspace: `key` (Twilio API key SID), `token` (Twilio API key secret) and `twilio_data` (a JSON blob whose `authToken` is the live Twilio subaccount…
- Current behavior: PR #3069 merged into dev as 03c3e15a on 2026-10-28. Shared redaction now protects JSON/pretty/legacy logs, ops email and Sentry; onboarding catches and both response adapters use caller-safe messages. Live Project Status on-dev was verified after the merge.
- Root cause: Drizzle embeds SQL bound values in error.message and error.stack. JSON and pretty logging, ops email and the Sentry wrapper have no shared redaction boundary.
- Resolution: Verify safe diagnostics in an approved deployed test failure, then follow the release process. Preserve caller-written validation messages and safe operation/error codes.
- Look in: `app/lib/logger-core.ts`, `app/lib/logger.server.ts`, `node_modules/drizzle-orm/errors.js`, `node_modules/drizzle-orm/pg-core/session.js`, `app/db/schema.ts`, `app/lib/twilio-workspace-credentials.ts`
- Existing tests: 77 focused cases pass, including actual diagnostic sinks and UI/API onboarding payloads. Each weakened boundary fails its regression. Full local CI and all applicable GitHub checks passed at final head ea7663ef before the approved merge.
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A workspace's Twilio provider credentials must never leave the server process into a log line, an alert email, a third-party error tracker, or an HTTP response body. The repository states this policy for the audit trail (app/lib/audit-event.server.ts#redactAuditEventMetadata drops password/secret/token/authorization/body/credential keys) and for user-facing errors (docs/pg-error-strictness.md:38 - 'Never return a raw caught error object in action/loader data ... serialize a { message } built with toUserMessage(error, fallback) and log the original server-side'; app/lib/user-message.ts:20 denies the phrase 'failed query' precisely to redact Drizzle messages). The logger and the shared error responder are the two sinks that bypass both controls.
- Tracker: Merged source proof on dev, with Project Status on-dev verified in the live issue sidebar on 2026-10-28. No production credentials, provider traffic, live mail or error-tracker delivery were used. Deployed acceptance remains separate.

### [#2997](https://github.com/chester-hill-solutions/callcaster/issues/2997) Task: route caller-facing failure messages through AppError
- Verdict: **Verify and close** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **Route caller-facing failure messages through AppError**
- The `#2888` change made plain errors generic, which cost four caller-facing messages. They are now AppErrors with matching statuses.
- Current behavior: Fixed on dev. A malformed phone number on POST /api/dial is a 400 naming the problem, a missing field on POST /api/ivr is a 400 naming it, a failed call insert keeps its message at 500, and a number-registration failure returns the provider reason with the status it reported.
- Root cause: Those routes threw plain `Error`s whose text was written for the caller, which `createErrorResponse` now replaces with the route default.
- Resolution: Fixed in #3002: the three throws became `AppError` with the matching status (`app/routes/api+/dial.action.server.ts`, `app/routes/api+/ivr.action.server.ts`, `app/routes/api+/numbers.action.server.ts`).
- Look in: `app/routes/api+/dial.action.server.ts`, `app/routes/api+/ivr.action.server.ts`, `app/routes/api+/numbers.action.server.ts`
- Existing tests: test/dial.route.test.ts; test/ivr.route.test.ts; test/numbers.route.test.ts

### [#2877](https://github.com/chester-hill-solutions/callcaster/issues/2877) Cron enqueue route's body workspaceId bypasses the workspace.disabled suspension gate for billing_reconcile and…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **Cron enqueue route's body workspaceId bypasses the workspace.disabled suspension gate for billing_reconcile and twilio_open_sync**
- POST /api/jobs/billing-reconcile and POST /api/jobs/twilio-open-sync read the tenant selector from the request body (workspaceId) and write it onto the job row's workspace_id column
- Current behavior: Fixed on dev. A cron job that names one workspace in its request body applies the same tenant-eligibility rule as the all-workspaces sweep: a missing or suspended workspace is skipped instead of run, so a suspended tenant is not debited or reconciled through that path. The includeDisabled opt-in still lets the number-rental ladder run for suspended workspaces.
- Root cause: withOptionalWorkspaceFanout (app/lib/worker/handlers/cron.server.ts:62) splits into two branches, and the tenant-eligibility policy (the workspace.disabled skip) lives only inside runCronWorkspaceFanout, which the per-workspace branch bypasses. The cron enqueue route (app/lib/worker/cron-job-enqueue-route.server.ts:26,66) takes the tenant selector from the untrusted body and writes it to job.workspace_id, so a body-controlled selector picks the branch that has no gate. The route is the only producer of a workspace-scoped billing_reconcile job and one of two producers of a workspace-scoped twilio_open_sync job (the other is app/server/predictive-machine-continuation.server.ts:277), so the…
- Resolution: Fixed in #3001: the disabled/missing check in `withOptionalWorkspaceFanout` (`app/lib/worker/handlers/cron.server.ts`) before `runOne`.
- Look in: `app/lib/cron-workspace-fanout.server.ts`, `app/lib/worker/handlers/cron.server.ts`, `app/lib/worker/cron-job-enqueue-route.server.ts`, `app/lib/worker/enqueue-job.server.ts`, `app/lib/number-rental-billing.server.ts`, `app/lib/twilio-call-status.server.ts`
- Existing tests: test/worker-cron-handlers.server.test.ts
- Done when: A suspended workspace's money must not move. app/lib/cron-workspace-fanout.server.ts:44 states the rule - 'A job that moves money or reconciles a live Twilio account must not run for a workspace the platform has suspended: it keeps debiting a balance nobody will pay and keeps reconciling an account that should be frozen' - and line 92 implements it by skipping a disabled workspace unless the job opts in. billing_reconcile and twilio_open_sync deliberately do not opt in (the includeDisabled field is absent at app/lib/worker/handlers/cron.server.ts:141 and :99), and the repo's own test asserts that (test/worker-cron-handlers.server.test.ts:213, :222, and :228-238, which pins number_rental_billing as the only job that opts in). The intended behaviour is therefore that a suspended tenant is skipped on BOTH branches of withOptionalWorkspaceFanout.

### [#2890](https://github.com/chester-hill-solutions/callcaster/issues/2890) Media upload API routes let the `caller` workspace role rewrite campaign media that `campaigns.write` reserves for…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **Media upload API routes let the `caller` workspace role rewrite campaign media that `campaigns.write` reserves for member and above**
- POST /api/media and POST/DELETE /api/message_media authorise their campaign mutation with workspace membership alone (`requireWorkspaceAccess` without `minRole`), so a workspace member whose `role_id` is `caller` - the lowest role, which…
- Current behavior: Fixed on dev. Uploading a campaign's voicemail-drop audio, attaching campaign message media and deleting it all require the `member` role, and a workspace API key must carry `campaigns.write` for the campaign branches. The campaign-less chat image upload stays open to every member.
- Root cause: app/routes/api+/media.action.server.ts line 46 and app/routes/api+/message_media.action.server.ts line 36 both call `requireWorkspaceAccess({ user, workspaceId })` with no `minRole`. `requireWorkspaceAccess` only consults `hasMinRole` when `minRole` is supplied (app/lib/workspace-membership.server.ts line 183), and `hasMinRole` returns true for an omitted gate (app/lib/member-role.ts line 28), so any membership role, including `caller`, passes. The routes then mutate a campaign through `updateCampaignVoicedropAudio` / `updateCampaignMessageMedia`, which are `campaigns.write` operations, without ever consulting the actor's role or capability. The guard that expresses the policy exists and…
- Resolution: Fixed in #2999: the `member` floor on `/api/media` (`app/routes/api+/media.action.server.ts`) and on the campaign branches of `/api/message_media` (`app/routes/api+/message_media.action.server.ts`), with both operations declared in `scripts/capability-baseline.json`.
- Look in: `app/routes/api+/media.action.server.ts`, `app/routes/api+/message_media.action.server.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/member-role.ts`, `app/lib/capabilities.ts`, `app/routes/api+/campaigns/$campaignId.action.server.ts`
- Existing tests: test/media.route.test.ts; test/message-media.route.test.ts
- Done when: A campaign mutation requires the `campaigns.write` capability and at least the `member` role. `CALLCASTER_ROLE_CAPABILITY_MATRIX` (app/lib/capabilities.ts lines 47-78) grants `campaigns.write` to `owner`, `admin` and `member` and gives `caller` only `campaigns.read`, `calls.start` and `calls.control`. app/routes/api+/campaigns/$campaignId.action.server.ts lines 29-33 states the rule in words: 'Both branches below (duplicate, status transition) are destructive mutations: require at least `member`, blocking the `caller` role.' The same rule is applied across the sibling media surface: `uploadWorkspaceAudioApi` (app/lib/platform-media.server.ts line 116) and `createWorkspaceAudioClip` (app/lib/audio-clip.server.ts line 56) return 403 'Not authorized' for `caller`, the workspace audio routes require `MemberRole.Member` (app/routes/workspaces+/$id/audios/new.action.server.ts line 17, .../record.action.server.ts line 36, .../$fileName.edit.action.server.ts line 29), the product's own campaign-configuration writes are member-gated (app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.action.server.ts line 21 and .../queue.action.server.ts line 47 require `MemberRole.Member`; .../settings.action.server.ts line 91 requires `MemberRole.Admin`), and app/routes/api+/inbound-queue.action.server.ts line 35 rejects `caller` outright.

### [#2888](https://github.com/chester-hill-solutions/callcaster/issues/2888) API error responses return raw database error text, disclosing the failed statement's internal table and column…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **API error responses return raw database error text, disclosing the failed statement's internal table and column names**
- app/lib/errors.server.ts#handleDatabaseError (line 160) builds an AppError whose message is the raw driver error text prefixed with a context string, and app/lib/errors.server.ts#createErrorResponse (lines 80 and 87) puts that message into…
- Current behavior: Fixed on dev. A plain (non-AppError) error never reaches the caller with its own message: the body carries the caller-supplied default and the real message goes to the log. Database errors report the failure class only (unique / foreign key / not found / generic) with the SQLSTATE in `details`, so the failed statement, its table and column names and the bound parameter values stay on the server.
- Root cause: app/lib/errors.server.ts#createErrorResponse uses the raw Error message as the client-facing error text for both AppError (line 80) and plain Error (line 87), and app/lib/errors.server.ts#handleDatabaseError copies the driver error text into the AppError message (line 160). There is no production-only redaction step between the database error and the HTTP response body, so the failed statement's SQL, its table and column names, the bound values and the SQLSTATE reach the caller verbatim.
- Resolution: Fixed in #2998: `createErrorResponse` returns `defaultMessage` for any plain error and logs the original; `handleDatabaseError` logs the driver message and details and throws an AppError built from `callerSafeDatabaseMessage` (`app/lib/errors.server.ts`).
- Look in: `app/lib/errors.server.ts`, `app/lib/handler.server.ts`, `app/routes/api+/surveys.action.server.ts`, `app/lib/api-auth.server.ts`, `app/server/db.ts`, `app/lib/parse-utils.server.ts`
- Existing tests: test/errors.server.test.ts
- Done when: A 4xx/5xx API response should carry a stable, caller-actionable error code and a generic message, and keep the database's own error text (SQL, table, column and constraint names, SQLSTATE, driver detail lines) in the server log only. The repository already applies that discipline on a neighbouring path - app/routes/api+/contact-form.action.server.ts:73-74 logs the underlying error and returns 'Failed to process message'.

### [#2892](https://github.com/chester-hill-solutions/callcaster/issues/2892) Workspace SSE stream re-checks membership only, so a demoted owner or a revoked API key keeps the owner-only event…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **Workspace SSE stream re-checks membership only, so a demoted owner or a revoked API key keeps the owner-only event stream**
- GET /api/workspaces/:workspaceId/events is gated at connect time on the owner-only `audit.read` capability (`dataPlaneCapabilityAuth("audit.read")`, events.loader.server.ts:61), but the only periodic re-authorization of the already-open…
- Current behavior: Fixed on dev. An open workspace event stream re-applies the authorization that opened it: a session or bearer actor must still hold a valid session and a role whose current capabilities include `audit.read`, and an API-key actor's row must still exist, be unexpired and carry `audit.read` in its current scopes. Either failing closes the stream with `workspace_access_revoked`; a failed lookup still keeps it open.
- Root cause: The stream's revocation hook only enforces workspace membership, not the authorization decision that opened the stream. In `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts`, `stillHasWorkspaceAccess` (line 89) returns `true` unconditionally for API-key actors (`if (!auth.userId) return true;`, line 92) and otherwise evaluates only `getUserRole({ user: { id: auth.userId }, workspaceId }) != null` (line 94) - i.e. "is there still a `workspace_member` row". It never re-derives the actor's capabilities from the current role, never re-reads the API key row (existence/expiry/scopes), and never re-validates the session. The 15s heartbeat (lines 174-186) is the only place a…
- Resolution: Fixed in #2989: `stillHasWorkspaceAccess` in `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts` now evaluates the capability through `capabilitySetForRole` / `capabilitySetFromScopeAllowlist` instead of testing membership.
- Look in: `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts`, `app/lib/capabilities.ts`, `app/lib/workspace-members-db.server.ts`, `app/server/auth-instance.ts`, `services/media-stream/db-writer.ts`, `app/lib/workspace-events.server.ts`
- Existing tests: test/workspace-events.route.test.ts
- Done when: The stream's own doc comment states that it outlives the connect-time check by design, and its gate is deliberately the owner-only `audit.read` capability - the same capability the sibling `/api/workspaces/:workspaceId/audit-events` endpoint enforces (audit-events.loader.server.ts:7). A stream that outlives its connect check must therefore be re-authorized with the same authority on every tick: re-derive the actor's current capabilities from the CURRENT workspace role and require `audit.read`; for API-key actors re-read the key row and require the current scopes to contain `audit.read`; for cookie actors re-validate the session. When the re-authorization fails the stream must emit `workspace_access_revoked` and close - exactly as it already does today for a removed member.

### [#2861](https://github.com/chester-hill-solutions/callcaster/issues/2861) Legacy flat PATCH /api/contacts authorizes on membership alone, so a `caller` can rewrite any contact in its…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **Legacy flat PATCH /api/contacts authorizes on membership alone, so a `caller` can rewrite any contact in its workspace and clear the opt_out consent flag the…**
- The legacy flat contact route under app/routes/api+ authorizes POST and PATCH /api/contacts on workspace MEMBERSHIP alone: the body workspace_id is taken from the request, requireWorkspaceAccess is called with no minRole, and no product…
- Current behavior: Fixed on dev. `PATCH /api/contacts` requires the `campaigns.write` capability, so a workspace `caller` cannot rewrite contacts through it, and the write accepts only the fields the contact editor exposes — `opt_out`, `created_by`, `workspace` and `id` are unreachable. Creating a contact stays membership-only, because callers create contacts from the chat composer and the queue picker.
- Root cause: app/routes/api+/contacts.action.server.ts performs the authorization decision with a bare membership check (requireWorkspaceAccess({ user, workspaceId }) at line 41) and never calls a capability or role guard, while the canonical contact create/update route gates the same state change on the `member` role (app/routes/workspaces+/$id/contacts/$contactId.action.server.ts:37). The legacy route then hands the whole request body to updateContact, which uses it verbatim as the UPDATE column set (app/lib/database/contact.server.ts:266), so a column the product deliberately excludes from its own editor - opt_out, the consent flag - becomes caller-controlled.
- Resolution: Fixed in #2986: the `requireFlatApiCapability` gate on the PATCH branch (`app/routes/api+/contacts.action.server.ts`), the `CONTACT_UPDATE_FIELDS` allowlist in `updateContact` (`app/lib/database/contact.server.ts`), and the capability declared in `scripts/capability-baseline.json`.
- Look in: `app/routes/api+/contacts.action.server.ts`, `app/routes/workspaces+/$id/contacts/$contactId.action.server.ts`, `app/server/contact-editor.server.ts`, `app/lib/database/contact.server.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/capabilities.ts`
- Existing tests: test/contacts-action.server.test.ts; test/contact-update-allowlist.test.ts; test/db-contact.server.test.ts
- Done when: A workspace member holding the lowest role (`caller`) must not be able to mutate an existing contact record, and no role may set the opt_out consent flag through the generic contact-update endpoint. The product already enforces both rules on its canonical contact editor route: the write action requires the `member` role and answers 403 to a `caller` (app/routes/workspaces+/$id/contacts/$contactId.action.server.ts:37), and it writes a fixed field set that excludes opt_out (app/server/contact-editor.server.ts:8). Contact deletion is `campaigns.write` plus a `member` floor (app/routes/api+/contacts/$contactId.action.server.ts:24), and `caller` does not hold campaigns.write (app/lib/capabilities.ts:76). The legacy flat route should apply the same capability and role floor to PATCH /api/contacts and accept a fixed column set rather than the raw request body. Contact CREATION via POST /api/contacts must stay membership-only, because the chat composer and the queue picker legitimately create contacts as a `caller` (app/routes/api+/contacts.loader.server.ts:33).

### [#2896](https://github.com/chester-hill-solutions/callcaster/issues/2896) POST /api/jobs/twilio-open-sync stores unbounded sweep limits: a negative limit silently removes the sweep's LIMIT…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **POST /api/jobs/twilio-open-sync stores unbounded sweep limits: a negative limit silently removes the sweep's LIMIT and a non-positive maxAgeMinutes collapses…**
- POST /api/jobs/twilio-open-sync narrows callLimit, messageLimit and maxAgeMinutes with a bare `typeof body.X === "number"` check, and the job's params schema (legacyNumericParam) keeps any finite number, negative and zero included
- Current behavior: Fixed on dev. The Twilio open-sync cron route replaces a negative or zero sweep limit with its default instead of storing it, so a bad request cannot turn the bounded sweep into an unbounded read or collapse the 404 grace window. A stored bad value is clamped when the job is parsed, and the successor job inherits the defaults rather than the current job's parameters.
- Root cause: The per-route body narrowing (app/routes/api+/jobs+/twilio-open-sync.action.server.ts:15) accepts any number and the registered params schema (app/lib/worker/job-params.server.ts:68 -> legacyNumericParam, app/lib/worker/job-registry.server.ts:124-132) has no lower bound, so an out-of-range value is stored as job.params and later used both as a SQL row bound and as a provider page size. withReschedule (app/lib/worker/handlers/cron.server.ts:91) then copies the parsed params verbatim into the chain successor, so whenever a workspace-less job carries such a value it becomes the chain's permanent configuration instead of one run's parameter.
- Resolution: Fixed in #2985: `sweepNumber` in `app/routes/api+/jobs+/twilio-open-sync.action.server.ts`, the clamp in `boundedSweepNumber` (`app/lib/worker/job-params.server.ts`), and the successor inheriting `TWILIO_OPEN_SYNC_DEFAULTS` (`app/lib/worker/handlers/cron.server.ts`).
- Look in: `app/routes/api+/jobs+/twilio-open-sync.action.server.ts`, `app/lib/worker/job-registry.server.ts`, `app/lib/worker/job-params.server.ts`, `app/lib/worker/handlers/cron.server.ts`, `app/lib/worker/handlers/shared.server.ts`, `app/lib/worker/cron-job-enqueue-route.server.ts`
- Existing tests: test/jobs-twilio-open-sync.route.test.ts; test/worker-cron-handlers.server.test.ts
- Done when: The three numbers are the sweep's budgets, not free-form input: callLimit/messageLimit bound how many open rows one run may touch, and maxAgeMinutes is the grace window that decides when a call the provider does not know yet may be terminalized ('Terminalize it as failed once it is old enough that a race with call creation is impossible', app/lib/twilio-open-sync.server.ts:234). A limit must be a positive integer and maxAgeMinutes must be at least 1, so a negative or zero value can never be stored; and the chain successor must not inherit an unvalidated parameter, because the successor is the platform's only scheduler for this job ('These chains are the only scheduler: there is no pg_cron and no external trigger', app/lib/worker/handlers/shared.server.ts:8), so a bad value there is permanent.

### [#2893](https://github.com/chester-hill-solutions/callcaster/issues/2893) Worker's affected-row count is always zero, so dead-letter and crash-recovery alerts never fire
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- The worker decides whether a write did anything by counting the rows it affected, but it reads that count from the wrong field of the wrong shape
- Current behavior: Fixed on dev. The worker reads the affected-row count from the database driver's `count` before the array length, so a write that changed rows is no longer read as a write that changed nothing. The stale-claim reset signal and the dead-letter and crash-recovery alerts that depend on it fire again.
- Root cause: affectedRowCount() in app/lib/worker/poll-jobs.server.ts:79-86 tests Array.isArray(result) before the driver's count property. Under the postgres-js driver the application uses (app/server/db.ts:1,63,72; drizzle-orm 0.45.2 and postgres 3.4.9 pinned in bun.lock), db.execute() resolves to a postgres.js Result object, which extends Array (node_modules/postgres/src/result.js:1) and is empty (length 0) for an UPDATE without RETURNING while carrying the affected-row count on .count. Drizzle's raw execute path returns the driver object unchanged (node_modules/drizzle-orm/postgres-js/session.js:30-33, 'return await client.unsafe(query, params)'). The array branch returns first, so the helper…
- Resolution: Fixed in #2983: `affectedRowCount` in `app/lib/worker/poll-jobs.server.ts` reads `count` first (postgres.js resolves `db.execute()` to an Array that carries it) and keeps the array length as the fallback for plain rows.
- Look in: `app/lib/worker/poll-jobs.server.ts`, `app/server/db.ts`, `node_modules/postgres/src/result.js`, `node_modules/drizzle-orm/postgres-js/session.js`, `app/lib/worker/handlers.server.ts`, `app/lib/ops-alert.server.ts`
- Existing tests: test/affected-row-count.test.ts
- Done when: failJob should log worker.job.dead_letter and page on-call through notifyOps when a job permanently fails, resetStaleClaims should log worker.stale_claims_reset when it reclaims a row from a dead worker, deadLetterExhaustedJobs should log worker.exhausted_jobs_dead_lettered when it buries an exhausted row, and worker.claim_lost should be logged only when a post-claim write was actually rejected by the claim fence.

### [#2876](https://github.com/chester-hill-solutions/callcaster/issues/2876) The Better Auth mount exposes /api/auth/two-factor/disable, bypassing the rule that privileged accounts cannot…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **The Better Auth mount exposes /api/auth/two-factor/disable, bypassing the rule that privileged accounts cannot disable 2FA**
- The application's rule 'privileged accounts cannot disable two-factor authentication' is implemented in exactly one place - the intent=disable branch of the POST /account/security action…
- Current behavior: Fixed on dev. The Better Auth mount refuses every endpoint that changes 2FA enrolment state — `two-factor/enable`, `two-factor/disable` and `two-factor/generate-backup-codes` — and answers 403 pointing at the account security page, which enforces the prior-state and protected-account rules. The sign-in challenge endpoints (`verify-totp`, `verify-backup-code`) stay reachable.
- Root cause: app/routes/api+/auth/$.loader.server.ts:18-30 forwards every Better Auth request to auth.handler(request) after only a rate limit (lines 19-25) and the signup-closed check (lines 26-28); it applies no application-level policy to the /api/auth/two-factor/* endpoints. Better Auth's disableTwoFactor (node_modules/better-auth/dist/plugins/two-factor/index.mjs:138-187) therefore runs with only its own session check (use: [sensitiveSessionMiddleware], line 141) plus password validation (lines 156-162), sets twoFactorEnabled=false (line 163) and deletes the auth_two_factor row (line 164). The protected-user rule (app/lib/two-factor.server.ts:121) lives solely in the application route's action and…
- Resolution: Fixed in #2901 (enable/disable) and #2982 (backup-code generation): `isAppManagedTwoFactorPath` in `app/routes/api+/auth/$.loader.server.ts` blocks the three state-changing endpoints before `auth.handler` runs.
- Look in: `app/routes/api+/auth/$.loader.server.ts`, `app/routes/account.security.loader.server.ts`, `node_modules/better-auth/dist/plugins/two-factor/index.mjs`, `app/server/auth-instance.ts`, `app/lib/two-factor.server.ts`, `scripts/baselines/route-tree.txt`
- Existing tests: test/auth-catch-all-rate-limit.route.test.ts
- Done when: The application's 2FA policy must be the effective policy on every door that changes 2FA state. The /api/auth/* mount should either refuse the raw two-factor state-changing endpoints (POST /api/auth/two-factor/enable and POST /api/auth/two-factor/disable) so that all 2FA changes go through the POST /account/security action, which enforces userIsTwoFactorProtected and the per-user setup rate limit, or apply the same protected-user rule inside handleAuthRequest before delegating to auth.handler for those paths. The sign-in challenge endpoint POST /api/auth/two-factor/verify-totp must stay reachable, because the 2FA sign-in flow posts there.

### [#2891](https://github.com/chester-hill-solutions/callcaster/issues/2891) Changing the account password leaves every other session of that account usable
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- PATCH /api/me is the product's only password-change path
- Current behavior: Fixed on dev. Changing the account password revokes every other session of the account, including bearer tokens from `POST /api/auth/token`, and returns a replacement session in the body and as a cookie so the caller is not logged out by its own change.
- Root cause: app/lib/platform-auth.server.ts:468 invokes auth.api.changePassword without revokeOtherSessions, so the password rotation updates the credential hash and leaves the account's other auth_session rows (and therefore every other session cookie and bearer token) valid; the session invalidation the app performs for the reset path (app/server/auth-instance.ts:30, revokeSessionsOnPasswordReset) has no equivalent on the change path, and no other control in app/ revokes sessions on a password change.
- Resolution: Fixed in #2979: `changePassword` is called with `revokeOtherSessions: true` and `returnHeaders: true` (`app/lib/platform-auth.server.ts`), and `PATCH /api/me` returns `session_token` (`app/routes/api+/me.action.server.ts`).
- Look in: `app/lib/platform-auth.server.ts`, `app/server/auth-instance.ts`, `app/routes/api+/me.action.server.ts`, `app/lib/schemas/api/platform-auth.ts`, `app/lib/auth.server.ts`, `node_modules/better-auth/dist/api/routes/update-user.mjs`
- Existing tests: test/platform-auth.test.ts
- Done when: Changing the account password invalidates the account's other sessions, so a password rotation is an effective response to suspected session compromise. The app already states this intent for the sibling path: app/server/auth-instance.ts:28-30 sets revokeSessionsOnPasswordReset with the comment that the sessions which already exist are exactly the ones that must stop working.

### [#2874](https://github.com/chester-hill-solutions/callcaster/issues/2874) Platform-admin 'Disable user' writes access_level='disabled', a value no authorization path enforces: the disabled…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **Platform-admin 'Disable user' writes access_level='disabled', a value no authorization path enforces: the disabled user keeps a live session and full workspace…**
- The admin panel offers a 'Disable user' control on every user row (POST /admin with _action=toggle_user_status) and the JSON admin plane exposes the same operation (POST /api/admin/dashboard with {"action":"toggle_user_status"}); PATCH…
- Current behavior: Fixed on dev. Disabling an account revokes its sessions, and both session-resolution paths treat `access_level = 'disabled'` as unauthenticated, so a disabled account can neither keep using a live cookie or bearer token nor obtain a working session again. Workspace membership is kept, so restoring a level restores access.
- Root cause: disableUser treats the string 'disabled' as an account state, but 'disabled' is only a free-text column value on public.user (plain `text DEFAULT 'standard'`, no CHECK constraint, no enum) with no consumer. The disable operation is written as a single-column UPDATE and never revokes the target's Better Auth sessions (auth_session rows) and never touches workspace_member - the two things that actually grant the user authority - so both remain in force. The enforcement that does exist for access_level ('sudo' only) is read in four TypeScript sites and one plpgsql function, none of which is on the disabled path, so the disable control cannot fail closed: it can only fail open. The codebase…
- Resolution: Fixed in #2978: `disableUser` revokes the account's sessions (`app/lib/platform-admin.server.ts`), `getSession` and `resolveBearerSessionUser` reject a disabled account (`app/lib/auth.server.ts`), and the admin console states what the level means (`admin+/users/$userId/edit.route.tsx`).
- Look in: `app/lib/workspace-members-db.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/admin-middleware.server.ts`, `app/lib/two-factor.server.ts`, `app/routes/admin+/requireSudoAdmin.server.ts`, `app/lib/workspace-middleware.server.ts`
- Existing tests: test/disabled-user-enforcement.test.ts
- Done when: Pressing 'Disable user' in the admin panel, or setting access_level='disabled' through PATCH /api/admin/users/:userId, must stop the target account from acting: its live sessions must stop working, it must not be able to sign in again, and it must no longer be admitted to its workspaces, so an administrator who offboards or contains a user is not told 'User disabled successfully' while the account keeps working.

### [#2875](https://github.com/chester-hill-solutions/callcaster/issues/2875) PATCH /api/admin/users/:userId silently rewrites access_level to 'standard' when the field is omitted, stripping…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **PATCH /api/admin/users/:userId silently rewrites access_level to 'standard' when the field is omitted, stripping sudo (and the 2FA mandate) from the target**
- The JSON admin API documents PATCH /api/admin/users/:userId as 'User detail / edit profile & access level' (docs/api-admin.md:18)
- Current behavior: Fixed on dev. `PATCH /api/admin/users/:userId` writes only the fields the caller supplied, so a rename no longer blanks names or demotes an account from sudo to standard, and `access_level` is constrained to the four values the console offers.
- Root cause: updateUserProfile treats an absent optional field as 'standard' instead of leaving the column untouched, so a partial update is a full overwrite of the access level. The request schema (access_level: z.string().optional()) and the write helper (args.access_level ?? 'standard') disagree about what 'omitted' means, and nothing reconciles them.
- Resolution: Fixed in #2977: `updateUserProfile` builds a partial set (`app/lib/workspace-members-db.server.ts`), the route constrains the value with `z.enum(ACCESS_LEVELS)` (`app/routes/api+/admin+/users+/$userId.action.server.ts`), and the levels live once in `shared/access-levels.ts`.
- Look in: `app/lib/workspace-members-db.server.ts`, `app/routes/api+/admin+/users+/$userId.action.server.ts`, `docs/api-admin.md`, `app/lib/two-factor.server.ts`, `app/routes/admin+/users/$userId/edit.action.server.ts`, `app/lib/platform-admin.server.ts`
- Existing tests: test/admin-user-partial-update.test.ts
- Done when: A PATCH that does not mention access_level must leave the target's access_level unchanged, exactly as the HTML admin form and updateOwnUserProfile do. An administrator renaming a user must not silently change that user's platform role or drop their 2FA mandate.

### [#2886](https://github.com/chester-hill-solutions/callcaster/issues/2886) Public contact form writes unescaped caller text into the ops-inbox email HTML body
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- The public, unauthenticated contact form POST /api/contact-form copies the caller-supplied `name` and `message` form fields into the `html` part of the email sent to the CallCaster operations inbox
- Current behavior: Fixed on dev. The public contact form escapes the visitor's name and message in the HTML body of the operations-inbox email, so an anonymous submission cannot inject links, images or markup; the plain-text body still carries their words verbatim.
- Root cause: app/routes/api+/contact-form.action.server.ts builds the outbound email HTML body with a raw template literal (`html: `<p>From: ${name}.</p><br/>${message}``) and never routes the two caller-controlled fields through the repository's own `escapeHtml()` helper from app/lib/email-html.ts, which the module does not import.
- Resolution: Fixed in #2976: `escapeHtml` from `app/lib/email-html.ts` at the sink in `app/routes/api+/contact-form.action.server.ts`.
- Look in: `app/routes/api+/contact-form.action.server.ts`, `app/lib/email-html.ts`, `app/lib/number-rental-billing.server.ts`, `app/lib/low-credit-notify.server.ts`, `app/lib/billing-reconciliation-alert.server.ts`, `node_modules/resend/dist/index.mjs`
- Existing tests: test/contact-form.route.test.ts
- Done when: The visitor's `name` and `message` must reach the operations inbox as literal text, not as markup. The sibling outbound emails that carry caller text escape it first, so the contact form should render `<p>From: ${escapeHtml(name)}.</p><br/>${escapeHtml(message)}` and still deliver the visitor's words in the unchanged plain-text part of the same email.

### [#2868](https://github.com/chester-hill-solutions/callcaster/issues/2868) Public survey answer/complete accept a contact-derived respondent token, letting an anonymous caller overwrite…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-24
- Recommended title: **Public survey answer/complete accept a contact-derived respondent token, letting an anonymous caller overwrite another respondent's answers and completion state**
- POST /api/survey-answer and POST /api/survey-complete treat the signed respondent token as the sole authority for which survey_response row a submission may touch, and the token's result_id - the identity of that row - is minted by the…
- Current behavior: Fixed on dev. The survey loader only reuses an existing response's `result_id` when the request carries a signed proof for that survey and contact; a bare `?contact=` id can start a new response but cannot mint a credential for someone else's.
- Root cause: app/routes/survey+/$surveyId.loader.server.ts:87-96 resolves an existing response row from the caller-supplied `?contact=` integer and reuses that row's result_id when minting the respondent token, so the minted credential carries the authority to mutate a response the caller never owned. app/lib/survey-public-action.server.ts:36-46 then accepts that credential as sufficient: verifyRespondentToken binds it to survey_id and workspace only, and result_id is copied out of the payload with no check that the caller controls the contact the response belongs to. resolvePublicSurveyContactId (app/lib/survey-public-action.server.ts:142-167) repeats the pattern on the write path by taking the…
- Resolution: Fixed in #2930 (`5dd77b56`): `verifySurveyContactProof` (app/lib/survey-contact-proof.server.ts:72) checks a signature over survey, contact and expiry; the loader gates on it at app/routes/survey+/$surveyId.loader.server.ts:39,66.
- Look in: `app/lib/survey-public-action.server.ts`, `app/routes/survey+/$surveyId.loader.server.ts`, `app/lib/survey-db.server.ts`, `app/server/survey-completion.ts`, `app/lib/survey-respondent.server.ts`, `drizzle/0000_baseline.sql`
- Existing tests: test/survey-contact-proof.test.ts
- Done when: Only the respondent who owns a response row may answer for it or change its completion state. The respondent token is the designed proof of that ownership ('Signed respondent token bound to survey id, workspace, result id, and expiry'), the contact lookup is a workspace-scoped read whose stated job is to make a cross-tenant read impossible (app/lib/survey-respondent.server.ts:14-26), and the loader states that the contact id is a bare legacy integer whose only protection is a rate limit (app/routes/survey+/$surveyId.loader.server.ts:25-31). A guessable identifier that is not proof of possession must not select another respondent's response row or another respondent's identity on a write.

### [#2865](https://github.com/chester-hill-solutions/callcaster/issues/2865) The optional workspaceId on the campaign_queue write helpers is never applied to the WHERE clause, so POST…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-24
- Recommended title: **The optional workspaceId on the campaign_queue write helpers is never applied to the WHERE clause, so POST /api/ivr lets a member of one workspace dequeue…**
- app/lib/campaign-queue-db.server.ts performs its campaign_queue UPDATEs on the unscoped `db` client from `@/server/db` and builds the WHERE clause entirely from a caller-assembled `conditions` array, so the tenant predicate is an *optional…
- Current behavior: Fixed on dev. `dequeueCampaignQueueById` always adds `eq(campaignQueueTable.workspace, workspaceId)` and refuses a workspace-less call, `recordQueueAttemptFailure` takes a required `workspaceId` and puts it in the predicate, and `POST /api/ivr` passes the workspace it authorised.
- Root cause: The tenancy of a `campaign_queue` write is delegated to the caller as an optional `workspaceId` argument instead of being enforced by the helper. `updateCampaignQueueAndEmit` runs on the unscoped `db` client (`const exec = args.exec ?? db`, campaign-queue-db.server.ts:106) and applies exactly the predicates the caller assembled. `dequeueCampaignQueueById` adds the workspace term only `if (args.workspaceId)` (lines 404-407), and `recordQueueAttemptFailure` never adds it (lines 605-613) even though it takes the argument. `campaign_queue` is a registered workspace-scoped table (app/db/workspace-scoped-tables.ts:50), so ADR-0004's `createTenantDb(workspaceId)` (app/server/tenant-db.ts:32-35)…
- Resolution: Fixed in #2925 (`b5a4dc18`): the tenant predicate is a property of the helper, not an optional argument. `app/lib/campaign-queue-db.server.ts:235` (by-id dequeue), `:604` (failed-attempt counter), `app/routes/api+/ivr.action.server.ts:80`.
- Look in: `app/lib/campaign-queue-db.server.ts`, `app/routes/api+/ivr.action.server.ts`, `app/lib/api-surface-generated.ts`, `test/ivr.route.test.ts`, `client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql`, `app/server/tenant-db.ts`
- Existing tests: test/campaign-queue-workspace-scope.test.ts
- Done when: A write to a workspace-scoped table must be bound to the authenticated workspace before it is issued. ADR-0004 (`app/server/tenant-db.ts:32-35`, `app/db/workspace-scoped-tables.ts`) makes `createTenantDb(workspaceId)` the only tenant-data accessor for route code precisely because the base `db` client bypasses tenancy, and the audit's architecture summary names `createTenantDb` as the strongest source-visible control on the tenant-to-tenant boundary with no RLS behind it. The repository already applied exactly this discipline to the plpgsql equivalents in client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql, which added a mandatory workspace parameter to `dequeue_contact` and `create_outreach_attempt` and named /api/dial, /api/hangup and /api/questions as the exposed callers. The TypeScript by-id dequeue path was not covered by that fix, and /api/ivr is not among the callers it named.

### [#2292](https://github.com/chester-hill-solutions/callcaster/issues/2292) Assess fragmented public survey responses
- Verdict: **Verify and close** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-24
- The read-only production assessment is complete: zero surveys, responses and answers. No stored rows are available for repair in the inspected database.
- Current behavior: Production app and Postgres-jAO4 database identities matched. The repeatable-read, read-only snapshot at 2026-10-21T06:04:48Z returned zero in each anonymous, contact-backed and unlinked-contact population; RLS does not hide rows.
- Root cause: The confirmed tokenless identity defect occurs in retained production source from the August 21 deployment until the fixed October 8 replacement. Missing-row completions leave no stored response and cannot be reconstructed from an empty table.
- Resolution: Review and land docs/assessments/2292-survey-response-history.md and its aggregate-only SQL. Do not repair or merge rows in this empty target database. A separate legacy data source needs its own scoped read and identity evidence.
- Look in: `docs/assessments/2292-survey-response-history.md`, `docs/assessments/2292-survey-response-history.sql`
- Existing tests: The aggregate SQL executed in a server-enforced read-only production transaction with a 15-second statement limit.; All three synthetic controls passed through the same aggregation: legitimate same-contact repeats, separate anonymous visits and ambiguous partial attempts stay distinct.; Released source and retained deployment metadata establish pre-fix and fixed boundaries; exact traffic switch times remain unavailable.
- Done when: Record the inspected environment, revision/deployment interval and aggregate counts.; Separate anonymous, contact-backed and unlinked-contact populations; distinguish missing evidence from zero stored rows.; Keep legitimate repeated-attempt controls and explain limits of attribution.; State a repair/no-repair recommendation without changing or exporting respondent rows.
- Tracker: Native Task; assigned wra-sol; organization fields unset; no hierarchy or dependency links. Live Project Status In progress. The assessment is complete and awaits review; keep open until the report is accepted and reaches master. The separate source fix is already released.

### [#2052](https://github.com/chester-hill-solutions/callcaster/issues/2052) Give the completion RPC one best-effort owner
- Verdict: **Verify and close** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-24
- The dispatch worker still propagates a completion RPC error after a successful batch. The dialer now catches this error, but queue, dialer, IVR and settlement paths have separate logging and catch policies.
- Current behavior: Fixed on dev. Campaign completion has one best-effort owner: `recheckCampaignCompletion` calls the SQL gate `rpcTryCompleteCampaignIfDrained` with the caller's executor and treats a failure as "not complete yet".
- Root cause: Completion error handling was repeated at call sites. The dispatch tail had no guard, so a label update failure could retry finished work.
- Resolution: Fixed in #2759 (`2b879007`): `app/lib/campaign-completion.server.ts`, with the queue, settlement, recovery, worker and IVR-status callers routed through it.
- Look in: `app/lib/campaign-completion.server.ts`, `app/lib/campaign-queue-completion.server.ts`, `app/lib/campaign-settle-recheck.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/lib/auto-dial.server.ts`, `app/routes/api+/ivr/status.action.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`
- Existing tests: test/campaign-completion*.test.ts
- Done when: Exactly one code path owns the best-effort completion call; All five call sites use it with no local try/catch; A completion RPC failure never propagates into a dispatch job, dial drain, webhook or sweep; One log event name and field set from every surface; Failure path tested at each call site, not only at the owner
- Tracker: Task; unassigned; Priority, Effort and environment unset at the audit. Project Status Backlog verified in the browser. Review https://github.com/chester-hill-solutions/callcaster/pull/2759; keep open through delivery verification.

### [#2216](https://github.com/chester-hill-solutions/callcaster/issues/2216) Email verification is half-wired: a verify-email route and a "verify your email" prompt both exist, but no verification email is ever sent
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-24
- Mandatory email verification is implemented on dev in PR #2953. The old decision claim is stale.
- Current behavior: Auth requires email verification and provides a sendVerificationEmail callback. Signup and invite flows carry the verification requirement. The email journey and callback tests are in the full local suite.
- Root cause: The earlier missing delivery and enforcement settings were added in ce0ca7ce / PR #2953.
- Resolution: Verify issuance, delivery, token consumption and sign-in on the deployed target, then follow the release process. Do not reopen the mandatory-versus-removal decision.
- Look in: `app/server/auth-instance.ts`, `app/lib/send-verification-email.server.ts`, `test/email-verification-journey.test.ts`
- Missing tests: No test exercises real registration to assert verification issuance and session policy. Account-address occupancy is established; automatic account takeover by the first registrant is not, since reset goes to the actual mailbox owner.
- Done when: A test registers a user and asserts one of the two outcomes, so the half-wired state cannot return; No user-visible string references verification unless verification happens; The dead route and its rate limit are either live or removed; A test covers the chosen path end to end
- Tracker: Source and live issue reviewed 2026-10-28 at dev@4977bfef. Project Status on-dev; native Bug. Keep the inbox acceptance gap visible. #2941 also needs an abuse and rollout policy.

### [#2760](https://github.com/chester-hill-solutions/callcaster/issues/2760) Detect dev-only fixes correctly in the issue verification planner
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- The planner treated Git ancestry stdout as a boolean, so a candidate present on dev but absent from master was classified as requiring implementation. The source fix uses confirmed exit results for both refs.
- Current behavior: Fixed on dev. The verification planner detects a dev-only fix with `git merge-base --is-ancestor` against the release line instead of assuming a commit on dev has shipped.
- Root cause: git merge-base --is-ancestor reports through its exit code and produces empty stdout. A normal non-ancestor result also throws from execFileSync and skips the second predicate in the shared try block.
- Resolution: Fixed in #2762 (`b4c8f8fe`): `.opencode/tools/lib/issue-verdict-git.mjs` and `.opencode/tools/apply-issue-verdicts.mjs`.
- Look in: `.opencode/tools/apply-issue-verdicts.mjs`, `.opencode/tools/lib/issue-verdict-git.mjs`, `test/apply-issue-verdicts.test.ts`
- Existing tests: test/apply-issue-verdicts.test.ts
- Done when: PARTIAL and NOT_FIXED code verdicts with a confirmed dev-only candidate plan on-dev.; A candidate in master or outside dev, invalid data and unavailable refs retain the conservative path.; Remaining operator actions still plan on-qa.; The real dry-run CLI runs with a temporary Git graph and rejects GitHub writes during tests.
- Tracker: Bug; assigned to wra-sol; Priority, Effort and environment unset. Project Status Backlog verified in the browser. No parent, children, blockers or linked fixing PR at the start. The internal tooling fix is ready for comprehensive checks.

### [#2060](https://github.com/chester-hill-solutions/callcaster/issues/2060) Verify welcome-credit classification through the display and reconciliation adapters
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- Both public adapters already classify welcome and manual CREDIT grants as purchase. Focused adapter tests now cover the displayed Purchase label, reconciliation category and unchanged prefix-only grant buckets.
- Current behavior: At dev@e4bb8ac6, getBillingEventSource maps other+CREDIT to purchase, and categorizeLedgerRow maps CREDIT to purchase before reading the shared prefix classifier. Grant prefixes intentionally remain other.
- Root cause: The original report mistook the prefix-only bucket for the final credit reporting category. No application behavior change is needed.
- Resolution: Verify the public display and reconciliation adapters with real helpers and debit controls. Keep the grant prefix classifier unchanged. Review the regression tests, then close the verified report.
- Look in: `app/lib/transaction-history-display.ts`, `shared/billing-reconciliation.ts`, `shared/billing-keys.ts`, `test/billing-grant-classification.test.ts`
- Existing tests: test/billing-keys.test.ts verifies the intentional other bucket for grant prefixes.; test/billing-grant-classification.test.ts verifies both public CREDIT adapters, the Purchase label and DEBIT controls using the real implementations.; 17 focused cases pass. Wrong display classification fails two new cases; inverted reconciliation type handling fails all four. Source faults were restored before the passing run.
- Done when: A welcome CREDIT displays as Purchase and reconciles as purchase through the public adapters.; The intentional prefix-only grant bucket remains other unless product semantics change.; Any change to distinguish paid purchases and grants has its own decision and task.
- Tracker: Bug; unassigned; Priority, Effort and environment unset. Project Status Backlog verified in the browser. No parent, children, blockers or linked PR at the start. Regression tests verify the existing behavior; no billing-rule change is proposed.

### [#2894](https://github.com/chester-hill-solutions/callcaster/issues/2894) Workspace API keys keep their full scope set after the member who minted them is removed or demoted
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- A workspace API key is a bearer credential whose authority comes exclusively from the `scopes` array on the key row
- Current behavior: Fixed on dev. An API key's scopes are re-derived from its creator's current role on every request, so removing or demoting the creator narrows or revokes the key; a key with no recorded creator fails closed with the same 401.
- Root cause: The API-key principal model records the creator (`created_by`) but never binds the key to a live workspace principal, and no cascade exists between a membership change and the key rows. `created_by` has no surviving foreign key (dropped in client/migrations/20260919120000_drop_legacy_auth_users_fks.sql:16) and is read by no runtime path; the scope ceiling `assertScopesWithinActorRole` (app/lib/platform-members.server.ts:120) is applied once at mint time against the creator's then-current role and, as the code comment at app/lib/platform-members.server.ts:80-89 states, is never re-derived. The session path re-resolves the role on every request (app/lib/capability-guard.server.ts:54,…
- Resolution: Fixed in #2928 (`13e1a6c4`): `app/lib/api-auth.server.ts:108-118` re-checks the creator's current role, with the ceiling in `app/lib/capabilities.ts` and the lookup in `app/lib/workspace-members-db.server.ts`.
- Look in: `app/lib/platform-members.server.ts`, `app/lib/capability-actor.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/capability-guard.server.ts`, `app/lib/workspace-members-db.server.ts`, `app/db/schema.ts`
- Existing tests: test/api-auth.test.ts
- Done when: Removing or demoting a workspace member ends that member's effective authority over the workspace, including through credentials the member issued. The platform already implements that for sessions: the membership lookup in `requireWorkspaceAccess` / `getUserRole` yields 404 'Workspace not found' for a non-member, so the session dies with the membership. A key should either be bound to a live membership - with its capability set re-checked against the creator's current role - or be revoked automatically when that membership is removed or reduced. The platform's chosen compensations for key durability are admin-only minting, a mint-time role cap and mandatory expiry; a membership-driven cascade is the missing one. (Note: the platform does NOT fail closed on workspace suspension either - `workspace.disabled` is read only by cron fan-out, number-rental billing and the admin console - so the asymmetry is specifically between the session path and the API-key path on membership change.)

### [#2885](https://github.com/chester-hill-solutions/callcaster/issues/2885) create_outreach_attempt stores an unchecked foreign contact id and get_campaign_attempts renders that contact…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **create_outreach_attempt stores an unchecked foreign contact id and get_campaign_attempts renders that contact inside the caller's own campaign export**
- public.create_outreach_attempt(con_id, cam_id, usr_id, wks_id, queue_id) inserts the caller-supplied contact id and campaign id into an outreach_attempt row and stamps that row with the caller's own wks_id, without checking that the…
- Current behavior: Fixed on dev. `create_outreach_attempt` proves the contact and the campaign belong to the caller's workspace before it stores the row, and `get_campaign_attempts` joins with a workspace predicate, so a foreign contact id can no longer be stored or rendered.
- Root cause: The outreach_attempt INSERT accepts a contact id and a campaign id that are never compared with the workspace the row is tagged with, and the export RPC that renders those rows re-joins contact on id alone. Nothing in the SQL binds the contact or the campaign to the workspace, and the route that calls the wrapper validates only the workspace it was given - the attacker's own workspace - never the contact id it was given. The 2026-08-07 hardening in client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql scoped only the campaign_queue attempts-counter UPDATE to workspace = wks_id; its own header records the attempt INSERT as 'correctly tagged with wks_id',…
- Resolution: Fixed in #2927 (`386a2042`): `client/migrations/20261020000000_scope_outreach_attempt_contact_and_campaign_by_workspace.sql` adds the proof to both RPCs, reached through `app/lib/db-rpc.server.ts` and the campaign action.
- Look in: `app/routes/api+/questions.action.server.ts`, `client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql`, `client/migrations/20260722110000_contact_other_data_jsonb.sql`, `app/routes/workspaces+/$id/campaigns/$selected_id.action.server.ts`, `app/lib/db-rpc.server.ts`
- Existing tests: test/integration-db/scope-outreach-attempt-by-workspace.test.ts
- Done when: An outreach attempt, and any export that renders it, must only contain contacts and campaigns owned by the workspace the attempt was recorded for.

### [#2889](https://github.com/chester-hill-solutions/callcaster/issues/2889) Media-stream token without a call SID lets a WebSocket peer overwrite another tenant's coaching rows
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- The media-stream service authenticates a session with an HMAC token that binds the workspace and only optionally the call
- Current behavior: Fixed on dev. A media-stream token cannot be minted without a call SID — `createMediaStreamToken` throws when `callSid` is absent — and the DB writer resolves coaching rows through that call rather than a peer-supplied identity.
- Root cause: The call SID is an optional claim in the signed media-stream token, and the service's call-binding check is conditional on that claim being present (`tokenCallSid && msg.start.callSid && msg.start.callSid !== tokenCallSid`). When the token carries no call SID the check is skipped and the row key of the unscoped admin-DB writes is taken from a client-supplied frame field, so the token authorizes writes for a resource it never named. The fix that introduced the check (commit 55e6477b, 'fix(media-stream): bind transcript/coaching writes to the token's callSid (#1530)') hardened only the mint paths that happen to know the call SID at TwiML-generation time and left the predictive auto-dial path…
- Resolution: Fixed in #2926 (`1cb8dad0`): `app/lib/media-stream-token.server.ts:41` requires the call SID, `app/lib/media-stream-twiml.server.ts` and `app/routes/api+/auto-dial/$roomId.action.server.ts` pass it.
- Look in: `services/media-stream/twilio-handler.ts`, `app/lib/media-stream-token.server.ts`, `app/lib/media-stream-twiml.server.ts`, `app/routes/api+/auto-dial/$roomId.action.server.ts`, `services/media-stream/db-writer.ts`, `app/db/schema-transcription.ts`
- Existing tests: test/media-stream-token.test.ts; test/media-stream-db-writer.test.ts
- Done when: A media-stream token must authorize writes only for the workspace and the call it was minted for, and a `start` frame that names any other call must be refused. Commit 55e6477b states the intent explicitly: 'A token holder for their own workspace could send another workspace's live Call SID and inject rows the victim later sees as genuine.' For that to hold, every minted token must carry the call SID it authorizes (the field must not be optional), and the stream handler must refuse any `start` frame whose call SID is missing or different from the token's, rather than falling back to the frame's value.

### [#2873](https://github.com/chester-hill-solutions/callcaster/issues/2873) POST /account/security intent=enable replaces an already-enrolled second factor with only the password, bypassing…
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **POST /account/security intent=enable replaces an already-enrolled second factor with only the password, bypassing the protected-user rule**
- The two-factor enrolment state machine at POST /account/security has no prior-state check on its `enable` transition and no protected-user check, while the sibling `disable` transition has both
- Current behavior: Fixed on dev. `intent=enable` refuses with `Two-factor authentication is already enabled.` when the account is enrolled, so a password alone can no longer replace an existing factor.
- Root cause: app/routes/account.security.loader.server.ts:61-100 handles `intent=enable` as a stateless operation: it reads the password from the form and calls Better Auth's enableTwoFactor without checking whether the account already has an enrolled second factor (isTwoFactorEnabled / the auth_two_factor row) and without applying userIsTwoFactorProtected, which the `disable` branch does apply at line 151. Better Auth's enableTwoFactor is a replacement operation (node_modules/better-auth/dist/plugins/two-factor/index.mjs:113 deletes the existing auth_two_factor row and line 126 recreates it with `verified` inherited from the previous verified row), so the missing server-side state check turns an…
- Resolution: Fixed in #2901 (`69587240`): the enable branch checks `isTwoFactorEnabled(user.id)` before calling Better Auth's `enableTwoFactor`, which replaces the factor. `app/routes/account.security.loader.server.ts`, `app/routes/api+/auth/$.loader.server.ts`.
- Look in: `app/routes/account.security.loader.server.ts`, `app/routes/account.security.tsx`, `app/routes/account.tsx`, `node_modules/better-auth/dist/plugins/two-factor/index.mjs`, `app/lib/two-factor.server.ts`, `app/server/auth-instance.ts`
- Existing tests: test/account-security.route.test.ts
- Done when: Replacing or removing an enrolled account's second factor must require assurance beyond the first factor, and a privileged account's 2FA state must be governed by the same rule that already blocks intent=disable. Concretely: the server must reject `intent=enable` when the account already has an enrolled second factor (mirroring the client-side guards at app/routes/account.security.tsx:107 and app/routes/account.tsx:229), and any deliberate re-enrolment must first prove possession of the current factor (the existing TOTP code or a backup code) and must satisfy userIsTwoFactorProtected for privileged accounts, so that the effective policy on both transitions is the same.

### [#2878](https://github.com/chester-hill-solutions/callcaster/issues/2878) Workspace settings member-role update accepts the legacy `field_director` alias and grants the `admin` role
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- POST /workspaces/:id/settings (formName=updateUser) takes the target role straight from the request body and never validates it against the current workspace role vocabulary
- Current behavior: Fixed on dev. The member-role update validates the submitted role with `isMemberRole` before it is ranked or written, the escalation guard fails closed on an unknown role, and `memberRoleToRoleId` no longer maps the legacy `field_director` alias onto `admin`.
- Root cause: The role string that reaches the membership write is cast rather than validated, and the two components that reason about it disagree about the same string: assertNoRoleEscalation ranks an unknown role name as 0 (fails open), while memberRoleToRoleId recognises the legacy alias `field_director` and maps it to `admin` (fails open into a privileged role). Both are needed for the escalation: the rank guard alone is harmless, and the writer's alias alone is unreachable, because the only unvalidated producer of `field_director` is this form branch. The privileged-role 2FA gate is keyed on the same unvalidated string, so the alias also skips requireTwoFactorForPrivilegedRoleAssignment, whose…
- Resolution: Fixed in #2898 (`948b200e`): `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts:79`, `app/lib/platform-members.server.ts:151-160`, `app/lib/workspace-membership.server.ts:34-48`. The alias mapping now lives only in the one-off backfill SQL.
- Look in: `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/platform-members.server.ts`, `app/lib/member-role.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/workspace-members-db.server.ts`, `app/lib/two-factor.server.ts`
- Existing tests: test/workspace-role-alias.test.ts; test/workspace-setting-utils.test.ts
- Done when: The workspace settings role-update action must accept only one of the four current workspace roles (owner, admin, member, caller), and no actor may ever grant a role that outranks their own. The sibling addUser branch on the same form enforces this with isMemberRole, and PATCH /api/workspaces/:workspaceId/members enforces it with z.enum(['owner','admin','member','caller']). A member asking for admin must be refused; only an owner/admin may grant admin, and a privileged grant must satisfy the 2FA enrolment requirement.

### [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396) Make predictive machine playback and continuation retry-safe
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @wra-sol · Updated: 2026-10-22
- Predictive-machine playback is now a durable, leased operation row bound to workspace/call/attempt/campaign/actor/conference, so a signed replay polls the journal instead of issuing a second Play, the continuation job refuses to run until the post-Play acknowledgement commits, and uncertain or rejected outcomes are recorded as a recoverable state with a reconciliation job rather than silently advancing.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Change is commit db0e1686 (PR #2424, 'Make predictive machine recovery retry-safe'), confirmed in origin/master; the mechanism is still present at master head 91c4409b. manual: true because the acceptance criteria end at a real provider call — a person must hear the voicemail and confirm the continuation actually happens; the code and the 85+ real-Postgres cases stop short of that. The issue's own note (migration and registered worker verified on the release candidate, provider acceptance for playback, acknowledgement, callback retries and recovery) is a release-QA step, not a code gap. Durable-object reconciliation and uncertain attachment outcomes for audio uploads remain in their own issues (#2356); this verdict covers the predictive machine only.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/predictive-machine.server.ts`, `app/server/predictive-machine-operation.server.ts`, `app/server/predictive-successor-callback.server.ts`, `app/lib/worker/job-types.server.ts`
- Existing tests: test/integration-db/predictive-machine-operation.test.ts (real Postgres, real TwiML builder, real signature helper, real tenant-scoped claim state) — 'concurrent callbacks emit one Play and no early continuation'; 'sequential redelivery polls without replaying audio'; 'post-Play acknowledgement commits one continuation for concurrent replays'; 'failed audio preparation is recorded and a signed retry can issue once'; 'lost issued response cannot claim voicemail or replay on retry'; 'continuation is refused before the post-Play callback'; 'a waiting callback cannot issue another Play'; 'a foreign signed room cannot acknowledge an issued operation'; 'acknowledgement and disposition roll back when the outbox fails'; 'provider history with the exact post-Play request recovers lost local acknowledgement'; 'a saved successor and journal share a transaction and recovery cannot dial again'; 'unknown successor acknowledgement remains fenced after a process lease expires'. test/integration-db/predictive-machine-continuation.test.ts — the continuation/recovery cases. docs/predictive-machine-recovery.md — the recorded recovery policy.
- Done when: A person confirms the reported symptom is gone on master.

### [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) Prepare a valid A2P Messaging Profile before brand registration
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @wra-sol · Updated: 2026-10-22
- Brand registration is now gated on a prepared, submitted A2P Messaging Profile: `prepareA2pMessagingProfile` creates or recovers the `us_a2p_messaging_profile_information` EndUser, assigns it and the Secondary Customer Profile to the Trust Product, evaluates the product (requiring a `compliant` result), submits it, and only then does `provisionA2pRegistration` proceed to brand registration — with any failure thrown and surfaced instead of suppressed.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix landed in PR #2450 (commit d1f5664e), confirmed an ancestor of origin/master. This replaces the old behaviour the issue documented, where `provisionA2pRegistration` created a Trust Product, assigned the Secondary Customer Profile, had no `us_a2p_messaging_profile_information` EndUser, suppressed Trust Product submission failure and continued to brand registration anyway. manual: true — the deliverable is Twilio accepting a real A2P registration, and the tests use a synthetic provider transport (test/fixtures/a2p-profile-provider.ts) rather than the live TrustHub API, so they prove the sequence, the error surfacing and the idempotency but not that Twilio's real evaluation returns `compliant` for a real business. The issue's own note agrees: "Provider transport in tests is synthetic. Actual deployed provider verification, accepted-product repair, Authentication+, historic registration review, release QA and default-branch promotion remain. A prepared profile is not brand or campaign approval." A person still has to run a real registration against Twilio's TrustHub to confirm the profile is accepted. The manual A2P setup path through the canonical compliance jobs is the separate PR #2283.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/twilio-a2p-messaging-profile.server.ts`, `app/lib/twilio-a2p-provision.server.ts`, `app/lib/a2p-messaging-profile.server.ts`
- Existing tests: test/twilio-a2p-provision.server.test.ts — I ran it plus test/a2p-messaging-profile.test.ts and test/twilio-a2p-status-sync.test.ts against origin/master: 113 tests passed, 3 files green. The cases that carry the mechanism: "public company sends stock and representative email on EndUser, not BrandRegistration"; "submission failure retains IDs and assignment evidence for a single-resource retry"; "existing approved profile with complete actual attributes can be read without inventing local company data"; "incomplete legacy public profile is repaired before brand reuse without duplicate EndUser"; "unrecorded owned provider product and EndUser are recovered instead of duplicated"; "a preparation failure during polling is retained by the fresh-row status update"; "a concurrent business change prevents old preparation from marking the new inputs ready"; "all assignment pages are read before deciding to create a duplicate". test/integration-db/a2p-messaging-profile.test.ts — 13 real-Postgres storage and callback cases, which I also ran green against a live Postgres 18.
- Done when: A person confirms the reported symptom is gone on master.

### [#100](https://github.com/chester-hill-solutions/callcaster/issues/100) "Theme" value from ThemeProvider is undefined by default
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @manstephen, @wra-sol · Updated: 2026-10-20
- Browser verification confirms that both workspace member icons use black in system-dark mode. The candidate fix uses the themed button foreground, including before the theme is resolved.
- Current behavior: Fixed on dev. Workspace member icons inherit the themed button foreground instead of hard-coding black, so they stay visible in system-dark mode.
- Root cause: TeamMember compares the raw next-themes theme with dark and supplies black otherwise. System mode keeps theme equal to system even when resolvedTheme is dark. An undefined value before hydration is expected from next-themes, so changing the provider default would conceal the wrong dependency. CSS currentColor and the existing theme tokens remove that dependency. The default button variant also supplies a dark primary background despite bg-transparent; the ghost variant supplies the intended transparent icon control and readable hover colours.
- Resolution: Fixed in #2753 (`d0972882`): the icons use the compact icon-xs ghost buttons and inherit their themed foreground (`app/components/workspace/TeamMember.tsx`).
- Look in: `app/components/shared/theme-provider.tsx`, `app/components/workspace/TeamMember.tsx`, `app/components/shared/mode-toggle.tsx`, `app/root.tsx`
- Existing tests: test/ui/team-member-theme.test.tsx
- Done when: Manage-member and cancel-invite icons use the correct foreground in light, dark and system modes.; Icons render without waiting for a JavaScript theme value; theme switching and member actions remain available.

### [#2684](https://github.com/chester-hill-solutions/callcaster/issues/2684) Decide the CORS policy for the public API
- Verdict: **Verify and close** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: wayfinder:grilling · Assignee: @wra-sol · Updated: 2026-10-20
- This change states the existing server-to-server CORS policy in both quickstarts and the public error reference, and replaces the overview's stale Express wording. Review and merge remain.
- Current behavior: Answered on dev. The server-only CORS policy is stated in the integration quickstarts and the public error reference; CORS stays disabled and no runtime change is required.
- Root cause: The earlier closure recorded the policy decision but left its promised quickstart and error-reference guidance unwritten. Only the overview's final CORS section mentioned the constraint, and it still named the retired Express layer.
- Resolution: Answered in #2751 (`b19922ad`): the policy is documented in the quickstarts and error guidance, replacing the overview's stale Express wording.
- Look in: `docs/api-overview.md`, `docs/api-agent-quickstart.md`
- Done when: The overview, quickstarts and error reference state that public integrator calls are server-to-server and workspace API keys stay on the backend; The error reference explains that failed preflight blocks the intended request, while a request without preflight can reach the server but its response remains blocked in browser JavaScript; Same-origin browser session access remains documented and CORS remains disabled
- Tracker: Live inspection on 2026-10-20: Task; Priority, Effort and Enviornment unset; Project Status In progress; assigned to wra-sol. Parent #2677; no children, dependency links or active fixing PR at the start. Keep the issue open until the documentation reaches master.

### [#2268](https://github.com/chester-hill-solutions/callcaster/issues/2268) Deliver inbound IVR voicemail to the script recipient
- Verdict: **Verify and close** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-19
- An IVR `voicemail:{email}` target is now bound to the call before the recording TwiML is emitted — the first valid recipient wins and is stored in a workspace-scoped `inbound_voicemail_recipient` row keyed by (call, phone, workspace) — and the recording callback reads that bound recipient (falling back to the number's `inbound_action` only when there is no binding), so the script's inbox receives the voicemail and a callback field cannot replace it.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix landed in PR #2446 (commit 63c80142), confirmed an ancestor of origin/master. manual: true — the deliverable is a real email landing in a real inbox. The 31 integration cases stub the Resend transport and the S3 copy, so they prove the routing, the binding, the idempotency and the retry semantics (the provider call is asserted to carry `to: ["script@example.test"]`), but they do not prove that a real Resend message actually arrives in the script recipient's inbox. The issue's own verification note agrees: "Provider boundaries are stubbed in tests; no live provider message or account change was made" and "Deployed-dev recording delivery ... remain open." A person still has to place a real inbound call, let it reach the voicemail target and confirm the message arrives in the script's inbox. Storage and playback of the recording itself are #2088 (verified separately).
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `blockId/response.action.server.ts`, `app/server/inbound-voicemail-store.server.ts`, `/email-vm.action.server.ts`, `app/lib/ivr-script-validation.ts`, `docs/contact-center-platform-plan.md`
- Existing tests: test/integration-db/inbound-voicemail-recipient.test.ts — 31 real-Postgres cases, all passing when I ran them against origin/master with a live Postgres 18. The ones that carry the mechanism: "the IVR script inbox receives the recording instead of a different number default" (the provider send is addressed to `script@example.test`, not the number's `default@example.test`); "legacy recording delivery retains the number default when there is no IVR binding"; "the bound recipient survives an old workspace row for the same phone"; "script edits and duplicate menu responses cannot replace the bound inbox"; "callback email fields cannot override the stored recipient" (a forged `Email`/`recipient`/`To` form field is ignored); "a cross-workspace menu response cannot record or bind an inbox"; "a general recording URL write cannot suppress bound IVR delivery"; "a completed callback replay does not resend or rebuild the email"; "provider retry preserves the exact payload and key after settings change"; "an uncertain retry outside the provider key window does not send again or choose another inbox"; "concurrent callbacks cannot own two email attempts".
- Done when: A person confirms the reported symptom is gone on master.

### [#2148](https://github.com/chester-hill-solutions/callcaster/issues/2148) The inbound IVR renderer has no speech-text fallback and no WAV sidecar lookup, so a documented-format block emits an empty Say
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-19
- The inbound IVR block route no longer renders audio with its own local handler: it delegates to the shared `renderIvrBlock`, which falls back through audioFile → content → prompt → title for the spoken words (so a documented content-only block speaks instead of emitting an empty `<Say></Say>`), keeps the editor-selected voice, and resolves the WAV sidecar for recorded blocks with the stored MP3 as fallback.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix commit 4d9bbde2 (PR #2456) is an ancestor of origin/master and the master copy of the inbound route still calls `renderIvrBlock` (line 46). manual: true because the reported symptom is what a caller hears on a live inbound call ('the caller hears nothing at that step and the call appears to hang'), and only a person on a real line can confirm the prompt is audible — the same treatment the sibling IVR prompt verdicts (#1841, #1856, #1857) received in this sweep. The TwiML itself is provably non-empty and the source-side repair is complete; the follow-on workspace-binding defect (#2455) is a separate issue. No live Twilio call was made. Run note: test/inbound-ivr-block.route.test.ts was run green in this checkout (node config).
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `blockId.action.server.ts`, `app/lib/ivr-block-render.server.ts`, `app/lib/ivr-wav.server.ts`
- Existing tests: test/inbound-ivr-block.route.test.ts — "content speech stays inside the inbound Gather with its response URL" asserts `<Gather action="…/response" …><Say voice="Polly.Salli-Neural">Press one</Say></Gather>` and no `<Say/>`/`<Say></Say>`; "keeps editor speech and its selected allowed voice" asserts `<Say voice="Polly.Matthew-Neural">Editor words</Say>`; "signs the existing WAV sidecar in the number's workspace" asserts the signed key `ivr-wav/w1/a.wav`; "a failed sidecar lookup still plays the canonical MP3" asserts `workspaceAudio`, `w1/a.mp3`. test/integration-db/inbound-ivr-prompt.test.ts covers the persisted inbound prompt cases.
- Done when: A person confirms the reported symptom is gone on master.

### [#2061](https://github.com/chester-hill-solutions/callcaster/issues/2061) Dark mode: a neutral Alert reads as an error because --brand-wash goes dark maroon while --brand-tertiary stays pale
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- Option B shipped: the shared Alert's default variant is now the neutral card surface (`bg-card text-card-foreground border-border`) instead of `border-brand-tertiary bg-brand-wash`, so a neutral Alert no longer inherits the dark-maroon `--brand-wash` and reads as an error in dark mode; warning-toned sites now select an explicit `variant="warning"`, and every unvarianted Alert site is listed in the inventory with a tone decision.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Change is commit f9b9670c (PR #2561, 'Use neutral alerts and explicit warning tones (#2061)'), confirmed an ancestor of origin/master. The mechanism that fixes the reported defect is code-level and machine-readable: the default Alert no longer uses `--brand-wash`/`--brand-tertiary` at all, so the dark-mode maroon wash cannot apply to a neutral Alert. manual: true, however, because the issue's stated remaining verification is 'Actual light/dark rendered tone and contrast, including default/explicit warning sites; browser geometry for any migrated dynamic notices' — the test asserts class names in jsdom, which cannot prove the perceived dark-mode contrast or that the migrated dynamic notices do not shift layout. A human must look at the rendered light/dark result. Note also that the global `brand-wash` / `brand-tertiary` tokens were deliberately left unchanged, as the issue's Option B decision required.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx`, `app/components/ui/alert.tsx`, `app/routes/account.tsx`, `workspaceId/twilio/AdminTwilioPortal.HealthPanel.tsx`, `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx`, `docs/feedback-inventory.md`
- Existing tests: test/ui/alert-tones.test.tsx — 'omitted and explicit neutral variants use the agreed card surface' asserts the neutral Alert has `bg-card text-card-foreground border-border` and NOT `bg-brand-wash border-brand-tertiary`; 'bulk-send safeguards use the warning surface' asserts `bg-warning/` and not `bg-brand-wash`; 'stored webhook drift is a warning rather than a neutral summary' asserts `bg-warning/`; 'the actual MFA setup form uses the warning tone after its fetcher result' asserts `observeTone` was last called with "warning"; 'insufficient rental credits retain the existing error surface and billing remedy' keeps `bg-destructive/` and the Buy-credits link.
- Done when: A person confirms the reported symptom is gone on master.

### [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) Dead Twilio recording callbacks on dial/:number and connect-campaign-conference
- Verdict: **Verify and close** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-19
- The manual-dial path now sends Twilio's `recordingStatusCallback` to the canonical signed `/api/recording` endpoint with the `completed` event, and the campaign-conference path no longer sets `record` at all, so no outbound path captures audio that CallCaster never downloads.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Change is commit bc74dd45 (PR #2439, 'Route manual recordings and remove unsupported conference capture (#2439)'), confirmed an ancestor of origin/master. manual: true — the evidence stops at the code: the tests use the real SDK TwiML builder but mock provider IO and the auth boundary, so they do not prove that a real Twilio call actually delivers the `completed` recording callback, that the MP3 is downloaded, or that it is stored and playable in Call History. The issue's own scope explicitly allowed the conference removal option, and that option is what shipped. Conference-aware recording/storage remains a separate open decision under #1873.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `number.action.server.ts`, `campaignId.loader.server.ts`, `/recording.action.server.ts`, `/call.action.server.ts`
- Existing tests: test/dial-number.route.test.ts:78-80 — asserts the rendered TwiML matches `<Dial[^>]*record="record-from-answer"`, `<Dial[^>]*recordingStatusCallback="https://base.example/api/recording"` and `<Dial[^>]*recordingStatusCallbackEvent="completed"`. test/connect-campaign-conference.route.test.ts:63 — asserts `expect(body).not.toMatch(/<Conference[^>]*\brecord=/)` while the join settings (`endConferenceOnExit`, `startConferenceOnEnter`, `beep`, `waitUrl`) are retained.
- Done when: A person confirms the reported symptom is gone on master.

---

## Needs reproduction — 17

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

### [#1718](https://github.com/chester-hill-solutions/callcaster/issues/1718) contact has opted out message should be dynamic
- Verdict: **Needs reproduction** · Type: Feature · Priority: Low · Effort: Low · Environment: dev · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-10-19
- Screenshot only, no repro or expected copy; generic opt-out banner is intentional per #1333 evidence. Needs the specific scenario before coding.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1670](https://github.com/chester-hill-solutions/callcaster/issues/1670) phone number search is too strict
- Verdict: **Needs reproduction** · Type: Change Request · Priority: Low · Effort: Low · Environment: dev · Labels: ux · Assignee: none · Updated: 2026-09-23
- Searching Pickering does not find South Pickering. PR #1675 changed rate-centre display names; it did not prove search matching.
- Resolution: Compare the submitted locality with provider results and determine whether the provider supports partial matching before changing the search contract.
- Look in: `app/components/phone-numbers/NumberPurchase.tsx`, `app/lib/number-locality.ts`

### [#2828](https://github.com/chester-hill-solutions/callcaster/issues/2828) Task: migrate existing SIM SMS setup to personas
- **IN PROGRESS** · Verdict: **Needs reproduction** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-27
- The local SIM migration candidate is open in PR #3067, but its remote verification is not green.
- Current behavior: PR #3067 at 43666254 has failed billing-checkout access guards and browser tests. The browser job was rerun once and failed again. The source is not merged into dev.
- Root cause: The failed guard assertions involve expected checkout sessions and access results. This review records the failure without assigning a new source cause.
- Resolution: Inspect the billing-checkout guard failures and compare the persisted browser failure with a passing sibling before editing policy or fixtures. Keep local mock credit fulfillment isolated and preserve no-traffic verification.
- Look in: `test/integration-db/billing-checkout-access.test.ts`
- Tracker: Native Task, live Project Status In progress. Continue the existing PR and issue; do not create another SIM implementation or treat the local CI report as completed remote acceptance.

### [#2902](https://github.com/chester-hill-solutions/callcaster/issues/2902) Caller-supplied forwarded host/proto widen the per-request Better Auth trusted-origin list; a wildcard host becomes a catch-all glob that switches off the CSRF…
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-24
- resolveAuthTrustedOrigins() adds one entry per request to the trusted-origin set, derived entirely from the request's own forwarding headers, with no allowlist against the configured origins and no check of the header value
- Current behavior: resolveAuthTrustedOrigins() adds one entry per request to the trusted-origin set, derived entirely from the request's own forwarding headers, with no allowlist against the configured origins and no check of the header value. app/server/auth-instance.ts:20 passes that resolver to Better Auth as `trustedOrigins`, and better-auth 1.6.23 matches the Origin header (the CSRF check) and the callbackURL/redirectTo (the post-authentication redirect allow-list) against the merged list with matchesOriginPattern, which compares http/https origins exactly BUT expands any pattern containing `*` or `?` into a glob. Verified locally against the application's own auth instance (drizzle + Postgres) and the…
- Root cause: app/lib/auth-trusted-origins.server.ts:84-87 reads `x-forwarded-host` (first comma-separated element) with the `host` header as fallback, and `x-forwarded-proto` for the scheme, from the request itself; lines 100-109 then add `${proto}://${host}` to the trusted-origin set with no allowlist against the configured origins, no hostname validation and no rejection of wildcard characters. app/server/auth-instance.ts:20 passes that resolver to Better Auth as the `trustedOrigins` option, and Better Auth's matcher (node_modules/better-auth/dist/auth/trusted-origins.mjs:18-22) expands any pattern containing `*` or `?` into a glob, so a caller-chosen host of `*` becomes a catch-all pattern. Both…
- Resolution: Owner-observed check against the application's own public auth endpoint, non-destructive and creating no account and no session for a real user. Use a non-existent address and a made-up password: POST https://<app-host>/api/auth/sign-in/email with Content-Type: application/json, body {"email":"v40-probe@example.invalid","password":"not-a-real-password"}, header `Origin: https://probe-host.invalid` and header `X-Forwarded-Host: probe-host.invalid`; repeat once with `X-Forwarded-Host: *` and `X-Forwarded-Proto: https`; repeat once with no X-Forwarded-* header at all as the control. Send at most three requests and space them more than 10 seconds apart so Better Auth's own per-path rate limit…
- Look in: `app/lib/auth-trusted-origins.server.ts`, `app/server/auth-instance.ts`, `node_modules/better-auth/dist/auth/trusted-origins.mjs`, `node_modules/better-auth/dist/api/middlewares/origin-check.mjs`, `node_modules/better-auth/dist/cookies/index.mjs`, `server/bun.ts`, `app/lib/safe-redirect.ts`, `app/routes/remember.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2924](https://github.com/chester-hill-solutions/callcaster/issues/2924) Unsanitised media name reaches the workspaceAudio S3 object key and the signed URL, bypassing the repository's own traversal check; the cross-tenant effect is…
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Source-confirmed defect: a workspace member controls the media name supplied as the form field `name` (or `media-name`) on POST /api/workspaces/$workspaceId/audios
- Current behavior: Source-confirmed defect: a workspace member controls the media name supplied as the form field `name` (or `media-name`) on POST /api/workspaces/$workspaceId/audios. That name reaches the workspaceAudio object key with `..` and `/` intact - `uploadWorkspaceAudioApi` builds `${workspaceId}/${getSafeMediaBaseName(name)}.${ext}` (app/lib/platform-media.server.ts line 127), `getSafeMediaBaseName` (app/lib/audio-upload.ts line 53) only strips a trailing allowed audio extension, and `uploadObject` (app/lib/object-storage.server.ts line 202) validates nothing about the path it is handed. The repository ships the rule for exactly this job - `isSafeObjectName` (app/lib/audio-upload.ts line 36), whose…
- Root cause: `getSafeMediaBaseName` is used as the object-name sanitiser for the workspace audio library, but it only removes a known trailing audio extension and never rejects path separators or dot segments, so it is not the control the repository states for this job. The repository already ships two controls for exactly this job - `isSafeObjectName` (app/lib/audio-upload.ts line 36, applied to every route parameter that is concatenated into an object key) and `sanitizeFilename` (app/lib/media-upload.server.ts line 44, used by /api/media and /api/message_media). `uploadWorkspaceAudioApi` uses neither, and `uploadObject` in app/lib/object-storage.server.ts performs no validation of the object path, so…
- Resolution: Owner-observed, non-destructive, on the deployed bucket only. (1) Create two throwaway non-production workspaces P (the uploader) and T (the target) and record their UUIDs. (2) From P, POST /api/workspaces/<P>/audios with a small throwaway audio file and the form field name='../<T-uuid>/probe.mp3'; record the response status (201 versus 4xx/5xx). (3) List the bucket keys (Railway dashboard or `aws s3api list-objects-v2` against the same bucket) and record whether a key appears as the literal '<P-uuid>/../<T-uuid>/probe.mp3' or as the cleaned '<T-uuid>/probe.mp3'. (4) GET the signed_url from the response twice - once exactly as a browser would (the path normalises) and once with the raw path…
- Look in: `app/lib/audio-upload.ts`, `app/lib/media-upload.server.ts`, `app/lib/platform-media.server.ts`, `app/lib/object-storage.server.ts`, `app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts`, `app/routes/workspaces+/$id/audios/new.action.server.ts`, `app/lib/audio-clip.server.ts`, `app/routes/api+/audio-upload.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2923](https://github.com/chester-hill-solutions/callcaster/issues/2923) Job claim fence binds only the lane id, not the per-claim attempt number
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The worker's post-claim fence is `id + status='running' + claimed_by = workerId` (poll-jobs.server.ts:228-230, 253-256, 354-357)
- Current behavior: The worker's post-claim fence is `id + status='running' + claimed_by = workerId` (poll-jobs.server.ts:228-230, 253-256, 354-357). The identity it stores is not per claim: `claimed_by` is a process-scoped lane id, `bun-worker-${process.pid}-${Date.now()}` (poll-jobs.server.ts:70-72), reused for every claim that process makes, while the per-claim discriminator `attempt_count` is written by the claim UPDATE (poll-jobs.server.ts:188-190) and never used by the fence. Two claims of the same row that share a `claimed_by` value are therefore indistinguishable: the earlier attempt's completeJob, failJob and heartbeat satisfy the fence and overwrite the newer owner's state. This was reproduced…
- Root cause: The claim identity stored on the row is not unique per claim. `claimed_by` is set to a process-scoped lane id (`bun-worker-${process.pid}-${Date.now()}`, poll-jobs.server.ts:70-72) that is reused for every claim that process makes (poll-jobs.server.ts:188), and the post-claim UPDATEs fence on `claimed_by` alone (poll-jobs.server.ts:228-230, 253-256, 354-357) without binding the attempt number that claimNextJob increments (poll-jobs.server.ts:190). Two claims of the same row that share a claimed_by value are therefore indistinguishable, so an earlier attempt's completeJob, failJob or heartbeat passes the fence and overwrites the newer owner's state.
- Resolution: Read-only, with no queue writes: (1) in the Railway console for the worker service, read the replica count and the container and pid model, because the repository states the console rather than railway.worker.toml is authoritative; (2) collect the `worker.start` banner line, which prints the workerId (worker/index.ts:168), from every live worker process and check whether two concurrently live processes ever report the SAME workerId, since that is the only way two claim-holders of one row can share a claimed_by value; (3) establish the lease-expiry precondition from the rows themselves through the operator's own admin jobs view (app/lib/admin-jobs.server.ts), looking for rows with…
- Look in: `app/lib/worker/poll-jobs.server.ts`, `app/lib/worker/run-worker.server.ts`, `app/server/audience-import-recovery.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `test/worker.test.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2921](https://github.com/chester-hill-solutions/callcaster/issues/2921) Tenant-scoped Drizzle facade hands out an unscoped raw-SQL executor, so TenantDb.execute applies no workspace predicate
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- createTenantDb implements tenancy as a per-table workspaceFilter (app/server/tenant-db.ts:187) that is merged into each table method's where clause (lines 191-223), and the facade's own doc comment promises exactly that (lines 33-35):…
- Current behavior: createTenantDb implements tenancy as a per-table workspaceFilter (app/server/tenant-db.ts:187) that is merged into each table method's where clause (lines 191-223), and the facade's own doc comment promises exactly that (lines 33-35): 'Auto-scoped Drizzle facade for a single workspace. Every table in WORKSPACE_SCOPED_TABLES is filtered by its tenancy column on every query.' The facade also attaches execute (line 227), which forwards the caller's SQL straight to the shared Drizzle client with no tenancy predicate of any kind, and execute is part of the exported TenantDb type (line 40), so the tenant-scoped facade structurally satisfies RpcExecutor (app/lib/db-rpc.server.ts:9) and can be…
- Root cause: app/server/tenant-db.ts#createTenantDb builds a per-workspace facade whose tenancy guarantee is implemented solely as a per-table workspaceFilter merged into findMany/findFirst/insert/insertMany/update/delete/count (app/server/tenant-db.ts:187-223), while the same facade attaches execute, defined as (query: SQL) => dbInstance.execute(query) at app/server/tenant-db.ts:227 and declared on the exported TenantDb type at app/server/tenant-db.ts:40. Because execute bypasses the per-table facade entirely, none of the workspaceScopedFilter predicates apply to it, so the one method that can reach any table, column or plpgsql function is the one method the filter never reaches. The type is part of…
- Resolution: Owner-observed inspection only, no probing of a live target and no writes: (1) read the deployed definition with SELECT pg_get_functiondef('public.claim_next_queue_contact(integer,uuid)'::regprocedure) and compare it with client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql, confirming whether it still selects only on ca.id = campaign_id_variable, still takes no workspace argument, and is SECURITY DEFINER; (2) compare the deployed application build against commit 67d40abb for the set of call sites that pass a TenantDb to an RpcExecutor or call TenantDb.execute, and identify any caller that binds a campaign id without first proving it belongs to the caller's workspace;…
- Look in: `app/server/tenant-db.ts`, `app/lib/campaign-queue-db.server.ts`, `client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql`, `app/lib/auto-dial-start.server.ts`, `app/routes/api+/auto-dial/status.action.server.ts`, `app/lib/contacts/tenant-scope.server.ts`, `app/routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2917](https://github.com/chester-hill-solutions/callcaster/issues/2917) public.claim_next_queue_contact has no workspace predicate and the tenant-scoped executor adds no filter to raw SQL
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- public.claim_next_queue_contact(campaign_id_variable integer, user_id_variable uuid) is SECURITY DEFINER and its deployed body never mentions a workspace column: the row set is selected from campaign_queue JOIN contact JOIN campaign WHERE…
- Current behavior: public.claim_next_queue_contact(campaign_id_variable integer, user_id_variable uuid) is SECURITY DEFINER and its deployed body never mentions a workspace column: the row set is selected from campaign_queue JOIN contact JOIN campaign WHERE ca.id = campaign_id_variable, and the UPDATE that follows writes that row with no workspace predicate either. The application reaches it through createTenantDb(workspaceId).execute(), whose execute is a straight pass-through to the underlying client, so the 'tenant-scoped' executor contributes no isolation to the raw SQL. Independently reproduced in the parent-approved sandbox against a private Postgres 18 booted from the repository migration chain, with…
- Root cause: public.claim_next_queue_contact(campaign_id_variable integer, user_id_variable uuid) is SECURITY DEFINER and filters only on `ca.id = campaign_id_variable`, with no workspace comparison on campaign_queue, contact or campaign (client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql:20-46, 52-71; pg_get_functiondef of the deployed body on the sandbox database returns a 2488-character body with no occurrence of the word 'workspace' at all). The application calls it as `select * from claim_next_queue_contact(campaignId, userId::uuid)` through the caller-supplied executor (app/lib/campaign-queue-db.server.ts:163-165), and createTenantDb's execute is a straight pass-through to…
- Resolution: Owner-observed checks on a database copy (no live traffic, read-only): (1) select cq.id, cq.workspace, cq.campaign_id, c.workspace as contact_workspace from campaign_queue cq join contact c on c.id = cq.contact_id where cq.workspace <> c.workspace - any row proves the foreign-contact precondition of the second blocker; (2) select c.id, c.workspace, c.campaign_id from call c where c.campaign_id is not null and not exists (select 1 from campaign cm where cm.id = c.campaign_id and cm.workspace = c.workspace) - any row proves a call row already carries another workspace's campaign; (3) select ca.contact_id, c.workspace as contact_workspace, a.workspace as audience_workspace from…
- Look in: `client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql`, `app/server/tenant-db.ts`, `app/lib/campaign-queue-db.server.ts`, `app/lib/auto-dial.server.ts`, `client/migrations/20260705000200_add_campaign_queue_workspace.sql`, `client/migrations/20260930150000_dequeue_paths_clear_inflight_claim.sql`, `app/routes/api+/auto-dial/$roomId.action.server.ts`, `app/routes/api+/auto-dial/status.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2915](https://github.com/chester-hill-solutions/callcaster/issues/2915) e2e.yml is the only workflow with no workflow-level permissions block, and its changes job runs the pull request's own script with an unpinned GITHUB_TOKEN
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Verified in source: of the nine workflow files in .github/workflows, eight declare a workflow-level `permissions:` block (ci.yml:32, issue-on-dev.yml:48, ledger-drift-check.yml:77, pr-issue-reference.yml:18, railway-iac.yml:25,…
- Current behavior: Verified in source: of the nine workflow files in .github/workflows, eight declare a workflow-level `permissions:` block (ci.yml:32, issue-on-dev.yml:48, ledger-drift-check.yml:77, pr-issue-reference.yml:18, railway-iac.yml:25, release-close-issues.yml:44, review-coverage.yml:24, schema-default-drift.yml:34) and e2e.yml does not. Inside e2e.yml the sibling `e2e` job pins `contents: read` and `packages: read` at job level (e2e.yml:59-61), but the `changes` job (e2e.yml:41-52) declares no `permissions:` at either level, so its GITHUB_TOKEN is never pinned by this repository. That job checks out the pull request's merge ref (e2e.yml:46, `actions/checkout@v4` with `fetch-depth: 0` and no `ref:`…
- Root cause: The token-permission narrowing that the repository applies at workflow level was not applied to .github/workflows/e2e.yml, and the one job left without a pinned token is the job that executes unmerged pull-request code.
- Resolution: Owner-observed, read-only checks; no probe of a deployed target and no workflow edit required. (1) Read the default token permission setting: repository Settings > Actions > General > 'Default Workflow permissions', plus the organisation default under Organization Settings > Actions > Policies if the organisation sets one. If the effective default is the read-only default, the unpinned job's token is equivalent to the pinned {contents: read, packages: read} and the finding is a hardening and consistency gap with no privilege difference. (2) Read the effective scope of the `changes` job's token on a recent pull-request run of e2e.yml, using the sibling `e2e` job as the control; the job log…
- Look in: `.github/workflows/e2e.yml`, `.github/workflows/ci.yml`, `scripts/ci-changes.mjs`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2914](https://github.com/chester-hill-solutions/callcaster/issues/2914) Workspace deletion performs no teardown: it purges no stored objects and releases no provider resources, and the cascade destroys the only database records of…
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Both server-side workspace-delete paths end in the same five-line function
- Current behavior: Both server-side workspace-delete paths end in the same five-line function. handleDeleteWorkspace calls deleteWorkspaceById(workspaceId) and nothing else: it issues no object-storage request and no provider request, so the tenant's stored objects are never purged and the tenant's Twilio subaccount and rented numbers are never released. At the same moment the workspace row goes, the FK cascade destroys every database record that identifies those provider assets, leaving the platform holding objects it will never clean up and provider resources it can no longer map to a tenant. Reproduced in the sandbox against the application's own modules on a private Postgres 18: with S3 pointed at a local…
- Root cause: The workspace teardown is a bare row delete. deleteWorkspaceById (app/lib/workspace-members-db.server.ts:375-381) issues a single DELETE on the workspace row through the unscoped admin client and adds no teardown step: it does not list or delete the tenant's objects under the workspaceAudio, messageMedia, campaign-exports and audience-uploads prefixes, and it makes no call to release the tenant's Twilio subaccount or rented numbers. The FK cascade then removes the rows that hold the Twilio number SIDs and, with the workspace row, the subaccount auth token - the only records the platform has of those provider assets.
- Resolution: Owner-observed, on a scratch tenant in a staging environment, with no real customer data and no destructive action beyond the tenant itself: (a) pick a tenant with no job rows (or delete its job rows first) so the delete is not rejected by job_workspace_id_fkey, and record before the delete its workspace uuid, its subaccount SID and auth token (workspace.twilio_data), the SIDs of its rented numbers (workspace_number.twilio_phone_number_sid, workspace_number_purchase.provider_sid) and the exact object keys under the workspaceAudio/<ws>/, messageMedia/<ws>/, campaign-exports/<ws>/ and audience-uploads/<ws>/ prefixes; (b) delete the workspace with DELETE /api/workspaces/{id} as the owner…
- Look in: `app/lib/workspace-members-db.server.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/object-storage.server.ts`, `app/db/schema.ts`, `drizzle/0000_baseline.sql`, `docs/remediation/workspace-billing.md`, `scripts/lib/twilio-resource-prune-policy.mjs`, `app/lib/worker/handlers/cron.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2910](https://github.com/chester-hill-solutions/callcaster/issues/2910) The Stripe Checkout return URLs are built from the incoming request origin instead of the configured canonical origin env.BASE_URL(), and the payment-return…
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- When a workspace Admin starts a credit purchase, app/lib/platform-billing.server.ts:146 computes `const baseUrl = new URL(requestUrl).origin` from the URL of the incoming request, and lines 170-171 send `success_url =…
- Current behavior: When a workspace Admin starts a credit purchase, app/lib/platform-billing.server.ts:146 computes `const baseUrl = new URL(requestUrl).origin` from the URL of the incoming request, and lines 170-171 send `success_url = ${baseUrl}/confirm-payment?session_id={CHECKOUT_SESSION_ID}` and `cancel_url = ${baseUrl}/workspaces/<workspaceId>/billing?payment_status=canceled` to Stripe. The configured canonical public origin, env.BASE_URL() (app/lib/env.server.ts:196), is never consulted: the string 'BASE_URL' does not occur anywhere in app/lib/platform-billing.server.ts, although the file already imports `env` for the Stripe key. I reproduced the app-side behaviour independently in the approved sandbox…
- Root cause: app/lib/platform-billing.server.ts:146 derives the Stripe Checkout return-URL origin from the incoming request URL (its host and scheme) instead of from the configured canonical origin env.BASE_URL(). The host and scheme of a request are a deployment-level trust decision that the application is expected to normalise, and it does not: server/bun.ts hands the raw request to the React Router handler without rewriting the URL from X-Forwarded-Host or X-Forwarded-Proto (the only reader of those headers in the tree is app/lib/auth-trusted-origins.server.ts:85-87, for Better Auth's origin set), and Bun derives the request origin from the Host header or the absolute-form request target.
- Resolution: Owner-observed, read-only checks. (a) Read BASE_URL (and BETTER_AUTH_URL) from the app service's environment variables in the Railway dashboard - no changes. (b) In the Stripe dashboard, open the most recent Checkout Sessions for the platform account and read their success_url: record the host and whether the scheme is https - read-only inspection, do not create, complete or refund a session. (c) Determine what the edge sends to the app: whether the request that reaches the app carries the canonical Host header and whether X-Forwarded-Proto is set, and whether the edge answers http with an https redirect (if it does, note that the cleartext first hop still exposes the session id). (d) If…
- Look in: `app/lib/platform-billing.server.ts`, `app/routes/api+/workspaces+/$workspaceId/billing/checkout-session.action.server.ts`, `app/routes/workspaces+/$id/billing.action.server.ts`, `server/bun.ts`, `app/lib/twilio-webhook.server.ts`, `app/lib/low-credit-notify.server.ts`, `app/lib/env.server.ts`, `app/lib/safe-redirect.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2909](https://github.com/chester-hill-solutions/callcaster/issues/2909) Workspace audio upload buffers the whole multipart body with no application-level byte cap and enforces no file-size limit
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- POST /api/workspaces/:workspaceId/audios (app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts:36), POST /api/audio-upload (app/routes/api+/audio-upload.action.server.ts:17) and the workspace-UI form action POST…
- Current behavior: POST /api/workspaces/:workspaceId/audios (app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts:36), POST /api/audio-upload (app/routes/api+/audio-upload.action.server.ts:17) and the workspace-UI form action POST /workspaces/:workspaceId/audios/new (app/routes/workspaces+/$id/audios/new.action.server.ts:30, a third audio upload entrypoint the candidate did not cite) read their multipart body with `await request.formData()` and pass the file to uploadWorkspaceAudioApi -> normalizeUploadedAudio -> assertValidAudioUpload (app/lib/audio.server.ts:88), which checks only the file extension and the MIME type and has no size check. The repository's own bounded-body control is applied to…
- Root cause: The audio upload path never applies the repository's existing bounded-body control. `app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts:36`, `app/routes/api+/audio-upload.action.server.ts:17` and `app/routes/workspaces+/$id/audios/new.action.server.ts:30` call `await request.formData()` instead of `readBoundedFormData(request, MAX_MEDIA_BODY_BYTES)` (`app/lib/bounded-form-data.server.ts:11`), and the shared validator `assertValidAudioUpload` (`app/lib/audio.server.ts:88`) omits the `file.size > MAX_MEDIA_FILE_BYTES` check that its sibling `validateMediaFile` (`app/lib/media-upload.server.ts:79`) performs.
- Resolution: Owner-observed on the production service, non-destructive and with no load generation: (1) confirm the effective maxRequestBodySize of the production Bun server, since server/bun.ts:357 sets none; (2) confirm the memory limit configured for the `callcaster` Railway service, which has one replica (.railway/environments/production.ts:80); (3) confirm whether any edge proxy in front of the application caps request bodies below 134,217,728 bytes; (4) as a single-request check only (one request, no concurrency), observe that POST /api/audio-upload, POST /api/workspaces/:workspaceId/audios or POST /workspaces/:workspaceId/audios/new today accepts a body larger than 10,551,296 bytes and does not…
- Look in: `app/lib/media-upload.server.ts`, `app/lib/bounded-form-data.server.ts`, `app/routes/api+/media.action.server.ts`, `app/routes/api+/message_media.action.server.ts`, `app/lib/api-surface-annotations.ts`, `app/lib/openapi-build.ts`, `app/lib/api-write-rate-limit.server.ts`, `app/lib/platform-media.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2908](https://github.com/chester-hill-solutions/callcaster/issues/2908) Transcoded audio output has no byte ceiling: the ffmpeg child's whole stdout is buffered in the shared web process and the only limit is a 10-minute wall clock
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Every accepted workspace-audio upload runs ffmpeg twice: once to normalise the file to MP3 (app/lib/audio.server.ts:155) and once to write the 8 kHz mono PCM WAV sidecar (app/lib/audio.server.ts:185)
- Current behavior: Every accepted workspace-audio upload runs ffmpeg twice: once to normalise the file to MP3 (app/lib/audio.server.ts:155) and once to write the 8 kHz mono PCM WAV sidecar (app/lib/audio.server.ts:185). `runAudioProcess` pushes every stdout chunk into an array and concatenates it (app/lib/audio-process.server.ts:36 and :49), so the whole transcoded output is resident in the one web process that serves every workspace. The sidecar encoder is fixed at 8 kHz, 1 channel, pcm_s16le (app/lib/audio.server.ts:72), which emits 16,000 bytes of uncompressed PCM per second of source audio however small the uploaded file was, and the upload path never bounds the source duration: `assertValidAudioUpload`…
- Root cause: `runAudioProcess` (app/lib/audio-process.server.ts:78) collects the child's whole stdout into an in-memory chunk list and concatenates it at lines 36 and 49, with no output-size ceiling on the collector and no `-t`, `-fs` or `-frames:a` limit on the encoder argv; `transcodeToWavBuffer` (app/lib/audio.server.ts:185) encodes with `WAV_ENCODE_ARGS` (app/lib/audio.server.ts:72: -vn -acodec pcm_s16le -ac 1 -ar 8000 -f wav), which produces 16,000 bytes of uncompressed output per second of source audio however small the uploaded file was. Nothing in the upload path bounds the source duration or the produced output, and the AbortSignal that `runAudioProcess` accepts…
- Resolution: Owner-observed, read-only, on the owner's own deployment; no customer traffic, no workspace data and no deployed endpoint is contacted by this audit. (1) Confirm from the production build log that the app image contains ffmpeg (`ffmpeg -version`), because .railway/environments/production.ts:77 selects the Nixpacks builder for the app service while the ffmpeg install lives in the Dockerfile that production.ts:100-101 wires only to the worker. (2) Read the container memory allocation for the `callcaster` service (one replica, .railway/environments/production.ts:80) from the Railway dashboard, so the resident-buffer blast radius has a denominator. (3) Transcode one 60-minute silent source once…
- Look in: `app/lib/audio.server.ts`, `app/lib/audio-process.server.ts`, `app/routes/workspaces+/$id/audios/record.action.server.ts`, `server/bun.ts`, `app/lib/api-write-rate-limit.server.ts`, `app/lib/platform-media.server.ts`, `.railway/environments/production.ts`, `app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2907](https://github.com/chester-hill-solutions/callcaster/issues/2907) Caller-supplied webhook custom headers are forwarded unfiltered, so the outbound request's Host can be decoupled from the validated destination
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The webhook custom-header map is copied verbatim from the request body and spread over the outbound request headers, with no allowlist, denylist, case normalisation or length limit on header names
- Current behavior: The webhook custom-header map is copied verbatim from the request body and spread over the outbound request headers, with no allowlist, denylist, case normalisation or length limit on header names. safeOutboundFetch hands the map unchanged to http.request/https.request, so a caller-supplied Host key replaces the URL host in the emitted request while the socket stays pinned to the DNS-validated address, and a caller-supplied Transfer-Encoding key produces a request that carries both Transfer-Encoding: chunked and the runtime's Content-Length over a body that is not chunk-framed. I reproduced this independently in the approved sandbox with the production runtime (bun 1.3.14), driving the real…
- Root cause: app/lib/platform-members.server.ts:240-252 normalizeCustomHeaders copies every caller-supplied [key, value] pair into a Record with no header-name constraint, and app/lib/schemas/api/platform-workspace-admin.ts:63-82 accepts any record of string to string (or an array of string tuples) for custom_headers. app/lib/workspace-webhooks.server.ts:59-69 and app/lib/webhook-test-delivery.server.ts:14-31 spread that map after the 'Content-Type: application/json' default and pass it to safeOutboundFetch, which forwards init.headers unchanged as the `headers` option of the request (app/lib/safe-outbound-url.server.ts:267). No layer inspects the header names between the request body and the socket.
- Resolution: Owner-observed configuration review only - no request is made to any live or third-party system. (1) From the deployment configuration, record the egress source addresses of the callcaster app and callcaster-worker processes, and whether the platform is registered with, or allowlisted by, any destination that fronts more than one virtual host from one public address. (2) For each such front-end, ask its owner - do not probe it - whether an access rule is keyed to the source address of the platform and whether that rule applies to virtual hosts other than the one named in destination_url. (3) For each candidate front-end/origin pair, obtain the owner-documented framing behaviour,…
- Look in: `app/lib/platform-members.server.ts`, `app/lib/schemas/api/platform-workspace-admin.ts`, `app/lib/workspace-webhooks.server.ts`, `app/lib/webhook-test-delivery.server.ts`, `app/lib/safe-outbound-url.server.ts`, `docs/remediation/critical-review-orchestration-plan-2026-07-12.md`, `app/routes/api+/workspaces+/$workspaceId/webhook.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2906](https://github.com/chester-hill-solutions/callcaster/issues/2906) Outbound webhook guard accepts IETF special-purpose address ranges, including 100.100.100.200 (Alibaba Cloud instance metadata)
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The SSRF guard that every user-configured outbound webhook passes through classifies any parseable address it does not explicitly list as a public destination
- Current behavior: The SSRF guard that every user-configured outbound webhook passes through classifies any parseable address it does not explicitly list as a public destination. Its IPv4 list (app/lib/safe-outbound-url.server.ts:49-62) covers 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12 and 192.168.0.0/16 and nothing else. RFC 6598 shared address space (100.64.0.0/10), RFC 2544 benchmarking (198.18.0.0/15), RFC 6890 protocol assignments (192.0.0.0/24), multicast (224.0.0.0/4), reserved (240.0.0.0/4) and the broadcast address are therefore accepted as webhook destinations, and 100.64.0.0/10 contains 100.100.100.200, the Alibaba Cloud instance-metadata endpoint that returns workload…
- Root cause: app/lib/safe-outbound-url.server.ts:49-62 isPrivateIpv4 enumerates only six IPv4 prefixes (0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16) and returns false for every other parseable address. app/lib/safe-outbound-url.server.ts:99-109 isPrivateOrMetadataIp special-cases 169.254.169.254, unwraps IPv4-mapped IPv6 and then defers to isPrivateIpv4/isPrivateIpv6, failing closed only for unparseable addresses, so every other special-purpose address inherits the 'public' verdict. app/lib/safe-outbound-url.server.ts:85-97 isPrivateIpv6 rejects only ::1, ::, fc00::/7 and fe80::/10, so fec0::/10, 64:ff9b::/96 and 2002::/16 are classified public. Both resolveSafeOutboundTarget (lines 146-151 for…
- Resolution: Owner-observed, read-only check inside a production container, without contacting any endpoint and without sending traffic to any candidate address: (a) record the cloud provider and region the workload runs in, and the private-network peer addressing Railway assigns to the app, the worker and the PostgreSQL service; (b) read the workload's route table (ip route / route -n) and the platform's own instance-metadata configuration (the address that cloud provider documents for that workload) and write both down; (c) compare those two lists against the omitted ranges - 100.64.0.0/10, 198.18.0.0/15, 192.0.0.0/24, 224.0.0.0/4, 240.0.0.0/4, 255.255.255.255 and, for IPv6, fec0::/10, 64:ff9b::/96,…
- Look in: `app/lib/safe-outbound-url.server.ts`, `app/lib/webhook-test-delivery.server.ts`, `app/lib/schemas/api/platform-workspace-admin.ts`, `.railway/environments/dev.ts`, `app/routes/api+/workspaces+/$workspaceId/webhook.action.server.ts`, `app/lib/platform-members.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2905](https://github.com/chester-hill-solutions/callcaster/issues/2905) Outbound voicemail, ops-alert and Twilio-compliance email bodies interpolate caller- and provider-originated text into HTML without escapeHtml
- Verdict: **Needs reproduction** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Three outbound email builders build their HTML body by raw template-literal interpolation, without the HTML-escaping helper the repository already owns (app/lib/email-html.ts#escapeHtml), while the same codebase applies that helper in the…
- Current behavior: Three outbound email builders build their HTML body by raw template-literal interpolation, without the HTML-escaping helper the repository already owns (app/lib/email-html.ts#escapeHtml), while the same codebase applies that helper in the sibling builders (app/lib/low-credit-notify.server.ts:50, app/lib/billing-reconciliation-alert.server.ts:40, app/lib/number-rental-billing.server.ts:124 and :330). The omission is real and I reproduced it independently in the approved sandbox: calling the PRODUCTION builders with only the provider boundaries stubbed and parsing the resulting html field with parse5, the payload <a href="https://attacker.invalid/verify-callcaster">Verify your CallCaster…
- Root cause: The three ops-email HTML bodies are built with template-literal interpolation of values that are not passed through escapeHtml (app/lib/email-html.ts), so caller- or provider-originated text is inserted into the HTML body (and, for the voicemail subject, into the subject line) as markup instead of as text. The same codebase applies escapeHtml to the equivalent interpolations in app/lib/low-credit-notify.server.ts:50, app/lib/billing-reconciliation-alert.server.ts:40 and app/lib/number-rental-billing.server.ts:124 and :330, so the omission is inconsistent rather than a deliberate design. Verified: none of app/lib/inbound-voicemail-email.server.ts, app/lib/ops-alert.server.ts or…
- Resolution: Owner-observed checks, non-production tenant only, with no mail sent to any uninvolved recipient. (a) Sink 1: on a non-production tenant whose voicemail notification address is a mailbox the owner controls, place a real inbound call from a carrier or VoIP provider that permits a non-numeric or alphanumeric caller id, and record byte-for-byte what Twilio delivers in the From parameter of the inbound-call webhook (app/routes/api+/inbound.action.server.ts:163) together with the value stored in call.from. If From is always E.164, sink 1 collapses to tenant self-injection only and the candidate must be re-scoped to the provider-echo sinks with severity reassessed. (b) Sink 3: on the same…
- Look in: `app/lib/email-html.ts`, `app/lib/inbound-voicemail-email.server.ts`, `app/lib/ops-alert.server.ts`, `app/lib/twilio-compliance-notify.server.ts`, `app/lib/env.server.ts`, `app/routes/api+/email-vm.action.server.ts`, `app/routes/api+/inbound.action.server.ts`, `app/lib/twilio-webhook.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2330](https://github.com/chester-hill-solutions/callcaster/issues/2330) Use verified client identity for public rate limits
- Verdict: **Needs reproduction** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-06
- The current rate key uses leftmost X-Forwarded-For. Actual ingress and spoof resistance must be verified before changing the trusted identity boundary.
- Current behavior: clientRateLimitKey still reads the leftmost forwarded address and falls back to unknown. Official Railway employee guidance states its HTTP proxy sets and overwrites X-Real-IP and prevents direct access through that arrangement; stable peer CIDRs are not published. This is provider guidance, not proof of the actual CallCaster ingress. An additional proxy, direct/local request identity and forged-header controls remain unverified.
- Root cause: The rate-limit helper receives a Request without a verified transport identity and trusts forwarded input without an established CallCaster proxy boundary.
- Resolution: Inspect the real CallCaster public ingress and direct/local server arrangement. Prove overwrite or append behavior using actual forged-header and valid-client controls, then implement the verified transport rule. Preserve PostgreSQL windows and authenticated-user limits. Do not infer trust from X-Railway-Edge or an undocumented private CIDR.
- Look in: `app/lib/platform-rate-limit.server.ts`, `app/lib/platform-auth-rate-limit.server.ts`, `server/bun.ts`, `.railway/`
- Existing tests: test/platform-api.test.ts; test/auth-catch-all-rate-limit.route.test.ts
- Missing tests: Actual transport/proxy arrangement with client-supplied X-Forwarded-For/X-Real-IP, valid clients, IPv4/IPv6, missing/malformed headers and stable local peer identity.
- Done when: Derive public auth rate-limit identity from a verified transport/proxy boundary. A client cannot obtain a fresh bucket by varying the leftmost X-Forwarded-For or any other untrusted identity header.; Document the actual public ingress and trusted-hop rule, including direct/local requests and additional proxies where present.; Keep a real permitted-client control, IPv4/IPv6 controls and missing/malformed-header controls. Headerless local requests must not all share one unknown identity, and a fresh random key per request is not an acceptable fallback.; Test the actual production request arrangement, not only Request fixtures that set the supposed trusted header. Record what overwrites or appends each address field.; Preserve the existing distributed PostgreSQL window contract and authenticated user-based write limits.; Full npm run ci:local and final remote gates pass; deployed forged-header controls prove the rule before release promotion.
- Tracker: Unassigned native child of #2099. Required CallCaster ingress proof remains; primary provider guidance was added to the issue without claiming acceptance.

---

## Needs decision — 42

Product, security, or operations decision required before implementation can be scoped.

### [#2029](https://github.com/chester-hill-solutions/callcaster/issues/2029) Decide the release list and the retention policy for unused dev-environment Twilio numbers
- Verdict: **Needs decision** · Type: Task · Priority: Urgent · Effort: Medium · Environment: unset · Size: S · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- An operations task, not a code change, and it is waiting on two things rather than on engineering. The screenshot shows 76 numbers in the dev account at $86.20/month, plus 4 number-setups at $0. The body names the three numbers Sai uses (2608141501, a 2026 Municipal Ward 19 NES campaign, a HESC Phone Bank) and asks @wra-sol to say which workspaces Arfin wants kept; everything else is proposed for release. Two decisions are open. First, the list: Arfin's workspaces are not in the issue, so the release set is undefined. Second, and more important, there is no stated rule for what makes a dev number safe to release, and no automated check — a number that is still referenced by a workspace_number row, a campaign sender, a messaging service, a caller ID, or a verification in progress will break on release, and in a dev environment that breakage is discovered by the next person who uses it. There is a number lifecycle in the app (app/lib/number-rental-billing.server.ts handles suspension and release and notifies the workspace), but nothing there enumerates what a number is still referenced by.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The read-only tooling now exists: scripts/twilio-resource-prune-report.mjs scans the account for TwiML Apps, Messaging Services, phone numbers and subaccounts, classifies each one, and prints the accounts it found with their last activity. The keep-list scripts/twilio-resource-prune-keep-list.mjs holds the Chester Hill Solutions business line. The three numbers this issue names are NOT in that keep-list, and the keep-list is the place a decision like this belongs.
- Root cause: Dev numbers accumulate because renting is cheap and there is no reaper. The list of what is safe to release is held in people's heads and in Slack, not in the repo or the database.
- Resolution: The tooling to make the decision is in place. Two decisions remain and both are human: which of the unused dev numbers are released, and what the retention rule is. Put the survivors in scripts/twilio-resource-prune-keep-list.mjs, then release the rest. Twilio has no API delete for a subaccount, so each release is a console action; a rented phone number is released through the workspace number release path.
- Look in: `scripts/twilio-resource-prune-report.mjs (the read-only report, with the accounts section)`, `scripts/twilio-resource-prune-keep-list.mjs (where the survivors go)`, `app/lib/number-release.server.ts:152 (the number release path and its E911 blocker)`
- Missing tests: no check reports which numbers in an account are referenced by a live workspace record, which is the check that would make this repeatable; no test covers a release that is refused because a reference exists; no test asserts that a released number cannot still be selected as a campaign sender
- Done when: Arfin's keep-list is recorded in the issue, with the workspace each kept number belongs to; Every number released is confirmed to have no live workspace reference, checked by query and not by eye; The kept numbers are confirmed still working after the release run; The rule for 'in use' is written down, with the chosen option; A decision is recorded on whether the clean-up repeats on a schedule or stays a one-off
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type Task, Priority Urgent, Effort Medium, Enviornment unset; assignee @wra-sol. Parent #1165 (open). Children: #2168 (open). Native open blockers: #1320. The in-use and repeat-policy decisions are still unrecorded. Status on-dev does not resolve this decision. #1320 is an open native blocker.

### [#1320](https://github.com/chester-hill-solutions/callcaster/issues/1320) ops(twilio): migrate one CHS number with callback and database reconciliation
- Verdict: **Needs decision** · Type: Task · Priority: Urgent · Effort: unset · Environment: unset · Size: S-M · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-15
- Transfer a Twilio number from the old CHS workspace to the new one. This is an operational migration (Twilio-side), not a product feature; no number-transfer action exists.
- Current behavior: Settings support routing/release/purchase/caller-id only; no transfer workflow.
- Root cause: Not a product gap; one-off infra task.
- Resolution: Run a one-off runbook: confirm ownership, transfer in Twilio, insert/update destination workspace row, repoint callbacks/messaging service, verify inbound/outbound, remove old row, record rollback + evidence.
- Look in: `app/routes/workspaces+/$id/settings/numbers.action.server.ts`, `app/lib/platform-workspace-numbers.server.ts`
- Existing tests: n/a — operational
- Missing tests: before/after evidence, rollback steps
- Done when: Ownership confirmed before transfer; Voice/SMS/callbacks work in new workspace; Single owner after migration
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status Backlog. Native Type Task, Priority Urgent, Effort unset, Enviornment unset; assignee @wra-sol. No parent. Children: none. Native open blockers: none. An operator must confirm source/target ownership, billing and callbacks before the production number transfer. No transfer was made.

### [#2941](https://github.com/chester-hill-solutions/callcaster/issues/2941) Enable self-serve signup in production deliberately
- Verdict: **Needs decision** · Type: Feature · Priority: High · Effort: Medium · Environment: prod · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-23
- High priority. Mandatory email verification has landed; self-serve signup still needs an abuse bound, welcome-credit policy and rollout decision.
- Current behavior: PR #2953 implements the verification prerequisite. #2216 remains open for deployed verification. The issue also asks for a deliberate signup volume limit and trial credit policy.
- Root cause: Production signup cannot be scoped from the verification merge alone; the accepted volume and provisioning cost remain policy inputs.
- Resolution: Complete #2216 acceptance. Record the signup volume bound, trial credit policy and intended production flag. Then make one atomic rollout change with open/closed-path tests.
- Look in: `app/server/auth-instance.ts`, `app/routes/signup.action.server.ts`, `shared/pricing.ts`
- Blocked by: [#2216](https://github.com/chester-hill-solutions/callcaster/issues/2216)
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status Backlog. Native Type Feature, Priority High, Effort Medium, Enviornment prod; assignee none. No parent. Children: none. Native open blockers: #2216. The verification code has landed, but signup volume, trial-credit policy and deliberate production configuration still need decisions. Do not change SIGNUP_OPEN in this task.

### [#2546](https://github.com/chester-hill-solutions/callcaster/issues/2546) Audience imports create duplicate workspace contacts and block or duplicate SMS
- **IN PROGRESS** · Verdict: **Needs decision** · Type: Bug · Priority: High · Effort: Medium · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-15
- High-priority user requirement. Import reuse #3085, campaign consent #3088 and reviewed legacy repair #3091 are merged into dev. Keep the parent open for deployed operator checks and release acceptance.
- Current behavior: Dev includes PR #3087 contact reuse, PR #3090 cross-contact opt-out protection and PR #3093 reviewed duplicate-person repair. The #2089 manual-SMS ambiguity guard remains intact. The #3091 app/worker deployments and receipt migration are verified.
- Root cause: Contact identity is deduplicated inside one audience, while SMS recipient identity is workspace-wide.
- Resolution: Verify deployed operator behavior for #3085, #3088 and #3091, then complete release acceptance. Preserve the #2089 ambiguous-recipient guard. CMS re-sync and external-ID upsert work are outside current delivery under the newer #2677 scope decision; #2679 is historical decision evidence, not an implementation commitment.
- Look in: `app/lib/audience-import-map.server.ts`, `app/server/audience-import-effects.server.ts`, `app/lib/chat-sms-guards.server.ts`
- Existing tests: The #3085 focused real-database run passes 50 cases, including cross-audience reuse, concurrent imports, formatted phones, opt-out preservation, workspace isolation, replay/recovery, manual-SMS identity and download messages. The original implementation fails four regression cases.; Full npm run ci:local passes on clean 030d8bd45cec1ab46243489322ce0306f4181d9a in 698.38 seconds: 6,153 Node tests with three existing skips, 34 Bun tests and 1,568 UI tests. All guards, typecheck, lint, build, bundle and codegen checks pass. Start/end commit and source hashes match.; The #3088 old coordinator fails both HTTP and worker consent regressions while 17 controls pass. Draft PR #3090 passes 37 local checks, 136 affected Node cases and 36 real-database cases after rebasing onto merged CI PR #3089. Full local CI passed before that tooling-only rebase; application and affected test sources are unchanged.; PR #3090 is merged at 71ecaadd with an identical tested tree, green applicable GitHub checks and successful dev app/worker deployments. Child #3091 has real database red/green evidence for reviewed repair.; PR #3093 passes all applicable exact-head CI, including 1,295 PostgreSQL 18.6 database cases and all 30 repair cases. Both dev services are online at the source-equivalent merge; a read-only schema check confirms its migration.
- Done when: Never pick an arbitrary duplicate or loosen opt-out checks.; The data repair must preserve history and apply the most restrictive consent state.; Reusing a canonical contact must add a conflict-safe audience membership.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status In progress. Native Type Bug, Priority High, Effort Medium, Enviornment unset; assignee none. No parent. Children: #3085 (open), #3088 (open), #3091 (open). Native open blockers: none. Children #3085, #3088 and #3091 are on-dev. Preserve #2089 consent and ambiguity protection. Keep parent open for its remaining requirements; CMS work remains deferred under #2677.

### [#1709](https://github.com/chester-hill-solutions/callcaster/issues/1709) Workspace Sidebar
- Verdict: **Needs decision** · Type: Change Request · Priority: Medium · Effort: Medium · Environment: unset · Size: S · Risk: medium · Labels: design, ux · Assignee: @sai-sy · Updated: 2026-10-21
- Major UX redesign of the workspace/campaign sidebar; interaction model (per-campaign sidebar with status/completion/quick controls) needs a product decision before scoping.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1852](https://github.com/chester-hill-solutions/callcaster/issues/1852) cleanup .env: document Twilio env vars and define config-as-code vs layered secrets
- Verdict: **Needs decision** · Type: Task · Priority: Medium · Effort: Medium · Environment: unset · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-10-19
- Audit and rationalize environment variables. Both TWILIO_APP_SID and TWILIO_AUTH_TOKEN in .env.example are used, but there is no documented policy for config-as-code vs secrets and no layered secret resolution.
- Current behavior: TWILIO_APP_SID is the TwiML App SID for Voice SDK outbound and is auto-assigned per non-protected environment; TWILIO_AUTH_TOKEN is used for REST calls. Some paths use TWILIO_API_KEY/TWILIO_API_SECRET. No ENVIRONMENT singleton and no .secrets/env.<environment> layering.
- Root cause: No documented owner/purpose per variable and no agreed boundary between config and secrets.
- Resolution: Decide the env schema and secret precedence (.env -> .secrets/env.<environment> -> secrets manager), document each variable's purpose and which are secrets, then prune unused/duplicated variables. Prefer an ENVIRONMENT selector over per-value env config.
- Look in: `.env.example`, `app/lib/env.server.ts`, `app/lib/required-env-keys.mjs`, `app/server/environment-twiml-app.server.ts`, `docs/twilio-runtime-inventory.md`, `docs/local-development.md`, `scripts/railway/`
- Existing tests: test/env.server.test.ts
- Missing tests: Env validation / precedence for layered secrets; A guard that fails on an undocumented or unused required key
- Done when: Every env var has a documented purpose and secret/config classification; Unused or duplicated variables removed; Secret precedence defined and easy to swap to a secrets manager; Non-sensitive config handled as config, not env values
- Tracker: Decision (secrets/config policy) before edits. Coordinate with #1329. Do not touch the user's live .env.

### [#1742](https://github.com/chester-hill-solutions/callcaster/issues/1742) feature(ivr): preview Speak (TTS) steps in the script editor
- Verdict: **Needs decision** · Type: Feature · Priority: Medium · Effort: Medium · Environment: unset · Size: M · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-10-17
- Spoken IVR steps have no in-editor preview; recorded steps do. Add a Preview control that plays the text in the selected Polly voice.
- Current behavior: No TTS preview endpoint; text+voice only materialise when Twilio runs the call.
- Root cause: Feature gap.
- Resolution: Add a workspace-gated route using AWS Polly SynthesizeSpeech (voices are Polly ids) + a preview control in SpokenStepFields; AWS creds need polly:SynthesizeSpeech.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/lib/tts-voices.ts`, `app/routes/workspaces+/$id/audios/$fileName.preview.loader.server.ts`
- Missing tests: preview plays selected voice text; membership enforced
- Done when: Speak step previews audibly; voice matches the block; workspace-gated
- Tracker: Confirm provider (Polly vs ElevenLabs) then implement.

### [#1729](https://github.com/chester-hill-solutions/callcaster/issues/1729) Auto selected disposition
- Verdict: **Needs decision** · Type: Feature · Priority: Medium · Effort: Medium · Environment: unset · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-10-17
- Auto-disposition mapping needs a spec (which outcome → which disposition, when overridable). Relevant machinery already exists (#1458 hold-screen, debounced auto-save).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1722](https://github.com/chester-hill-solutions/callcaster/issues/1722) What does "kick off" on campaign launch pane do
- Verdict: **Needs decision** · Type: Task · Priority: Medium · Effort: unset · Environment: dev · Size: S · Risk: medium · Labels: question, business-logic · Assignee: @wra-sol · Updated: 2026-10-17
- 'Kick off' button (running/paused) has no explanation and Sai 2026-09-09 confirms confusion; product decides label/tooltip/placement.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1345](https://github.com/chester-hill-solutions/callcaster/issues/1345) Decide and add a CHS-managed toll-free SMS verification path
- Verdict: **Needs decision** · Type: Feature · Priority: Medium · Effort: High · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Political campaigns have no business number, so toll-free SMS (which requires a BN) does not serve them. Offer a CHS-managed path — but only after a compliance/ownership decision.
- Current behavior: Goal step offers toll-free (requires customer BN) or local (no BN); readiness requires businessRegistrationNumber for toll-free; twilio-toll-free-provision uses workspace business identity.
- Root cause: No managed-sponsorship model; CHS BN must not be stored as customer identity.
- Resolution: Decide if CHS can sponsor customer traffic; if yes, add a support-request flow with clear ownership/review status and local-number alternative.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingGoalStep.tsx`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/twilio-toll-free-provision.server.ts`
- Existing tests: test/ui/onboarding-goal-step.test.tsx
- Missing tests: managed-service request path (once approved)
- Done when: Compliance approves/rejects sponsorship; Users without BN can request support; CHS BN not stored as customer identity
- Tracker: Blocked on product/compliance decision; issue title says 'calls' but scope is SMS.

### [#1732](https://github.com/chester-hill-solutions/callcaster/issues/1732) Campaign queue statuses
- Verdict: **Needs decision** · Type: Change Request · Priority: Medium · Effort: High · Environment: unset · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-09
- Umbrella queue status-model redesign (completion vs outreach status; missing opted-out/dialing/failed states). Big product decision; 1720 is a subset.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1815](https://github.com/chester-hill-solutions/callcaster/issues/1815) Implement TWO_FACTOR_ENABLED kill-switch state per environment
- Verdict: **Needs decision** · Type: Change Request · Priority: Low · Effort: nothing-burger · Environment: prod · Size: XS · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-24
- Recommended title: **Decide TWO_FACTOR_ENABLED kill-switch state per environment**
- Screenshot-only report from Sai. Env check resolves it: MFA is off BECAUSE TWO_FACTOR_ENABLED is unset on the review (dev) env AND on production app services (Railway list-variables; only DISABLE_2FA_ENFORCEMENT + NODE_ENV present on review, and neither 2FA var on production). isTwoFactorFeatureEnabled() (env.server.ts:270) is false unless TWO_FACTOR_ENABLED=true|1 — the #1569 kill-switch default.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The code half shipped: commit 27277319 (feat(auth): turn two-factor authentication off behind a TWO_FACTOR_ENABLED kill switch (#1569)) registers the Better Auth twoFactor plugin only when the flag is true, and every privileged-role mandate is off with it. test/two-factor-kill-switch.route.test.ts, test/two-factor.server.test.ts and test/auth-instance.server.test.ts cover it. What is missing is the state, not the code: .env.example:159 still has TWO_FACTOR_ENABLED commented out, no Railway environment model sets it, and no ADR records whether 2FA is meant to be off.
- Root cause: None — MFA is off by the intended kill-switch default because the optional env flag is unset everywhere.
- Resolution: Decide and record the per-environment state, then set the flag to match. The code is done and tested, so this is a decision plus configuration, not an implementation. A short ADR next to the existing ones is the right record, because the current position - 2FA off everywhere by default - is only correct if it is intended.
- Look in: `app/lib/env.server.ts:262-271 (isTwoFactorFeatureEnabled)`, `app/server/auth-instance.ts:59-67 (the plugin is registered only when the flag is on)`, `.env.example:159 (the flag, still commented out)`, `test/two-factor-kill-switch.route.test.ts (the kill switch is tested)`
- Existing tests: test/two-factor-kill-switch.route.test.ts; test/two-factor.server.test.ts
- Done when: Decide whether 2FA should be on; If on, set TWO_FACTOR_ENABLED and verify the plugin registers
- Tracker: Keeps blocking #1316 until the state is decided.

### [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) Provision a CallCaster-qa Twilio account and point qa.callcaster.ca at it
- Verdict: **Needs decision** · Type: Task · Priority: Low · Effort: Low · Environment: unset · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-20
- Provisioning a dedicated CallCaster-qa Twilio account and pointing qa.callcaster.ca at it is an operations decision: it needs spend, credentials and a DNS change, not a code change.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The issue has no symptom body — it is an infrastructure provisioning task. The repo's own board records that it 'closed as not planned on 2026-10-17' (ISSUE_BOARD.md:865, scripts/issue-board-enrichment/blocked-epic.json:298), and the related #1828 QA acceptance suite was re-scoped because of it. The DNS/IaC half (#1357) did land (docs/qa-rehearsal-runbook.md, .railway/environments/qa.ts), but the Twilio-account half did not. manual: true because creating a Twilio account and repointing a live domain is a console/ops action a human performs, not something a code change or test can confirm.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `.railway/environments/qa.ts`, `ISSUE_BOARD.md`
- Existing tests: None. There is no test or check that asserts a QA-specific Twilio account; `git grep -n "qa.callcaster.ca" origin/master -- .` returns only .railway/environments/qa.ts and docs/qa-rehearsal-runbook.md.

### [#2036](https://github.com/chester-hill-solutions/callcaster/issues/2036) Decide the scope of flattening the call screen: the call screen only, or the shared workspace panel every page uses
- Verdict: **Needs decision** · Type: Change Request · Priority: Low · Effort: Low · Environment: prod · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-10-19
- The complaint is clear and both named surfaces are real, but the outer card is not owned by the call screen — it is the shared workspace panel, so 'remove the rounded edges and drop shadow' is a choice about blast radius, not a local edit. The top bar is local: app/components/call/CallScreen.Header.tsx:239 is a sticky header with rounded-xl, border, shadow-sm and a backdrop blur, and that is the campaign details/settings bar in the screenshot. The outer card is app/routes/workspaces+/$id.tsx:206, a single className string that gives every workspace page its panel: `min-w-0 flex-1 lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card/70 lg:p-6 lg:shadow-sm ...`, and the same file already branches on isChatsScreen (:204-207) so a call-screen branch is available. The issue's broader point is also a design-system one: cards are fine as containers, but their default treatment should be overridable per site.
- Current behavior: The live calling screen stacks three card treatments — the workspace panel, the sticky top bar, and inner section cards — and the invisible ones still cost padding.
- Root cause: The workspace panel treatment is a single shared className with no per-surface override, and the top bar re-states rounded/border/shadow locally. Two owners for the same visual concept, so the call screen cannot opt out.
- Resolution: Decide the scope, then it is a small edit either way. Option A (call screen only): add an isCallScreen branch next to the existing isChatsScreen branch at app/routes/workspaces+/$id.tsx:204-207 that drops rounded-2xl, border and shadow-sm and reduces p-6 for the call route, and flatten the sticky header at CallScreen.Header.tsx:239. Nothing else on the product changes; the risk is that the call screen now looks different from every page beside it. Option B (whole product): flatten the shared panel for all workspace routes, so the page is a flat canvas and cards mean something when they appear. Bigger visual diff, needs a pass over every workspace page to check what depended on the panel's padding, but it is the version that actually establishes 'a card is a deliberate container'. Option C (middle): keep the panel as-is and change the top bar only, which fixes the half the reporter named twice but leaves the outer card. Whichever is chosen, express it as a variant on the panel rather than a route-conditional className string, so the next surface can opt out without editing a ternary. Also decide the padding: the reporter asks to 'punch back' the padding the invisible cards were creating, which means auditing the space-* classes between the panel and the first inner card as part of the change, not just deleting rounded and shadow.
- Look in: `app/components/call/CallScreen.Header.tsx:239 (the sticky top bar: rounded-xl, border, shadow-sm, backdrop-blur)`, `app/routes/workspaces+/$id.tsx:202-208 (the shared workspace panel, with the isChatsScreen branch as the pattern for a call-screen branch)`, `app/components/call/CallScreen.Layout.tsx:191 (the call screen's own space-y-6, the padding the invisible cards create)`, `app/components/call/CallScreen.Coaching.tsx:53,73 and CallScreen.DTMFPhone.tsx:22 (inner cards, which the issue says to keep)`
- Existing tests: test/ui/call-screen-header.test.tsx (CampaignHeader only); test/ui/call-screen-callarea.test.tsx, call-screen-queuelist.test.tsx (inner cards)
- Missing tests: no test asserts the call screen's panel treatment, so a regression to the nested-card look passes silently; no visual or class-level test would catch a re-introduced rounded/shadow on the top bar
- Done when: The chosen scope is written down, and the panel treatment is a named variant rather than a route-conditional className string; The named surfaces (outer card, top bar) have no curved edges or drop shadow; The padding the removed cards were creating is punched back, verified by measuring the gap at the top of the call screen; Inner section cards keep their treatment — they are the containers that should still read as cards; No other workspace page changed unintentionally, or changed deliberately and listed
- Tracker: Needs decision, briefly, then fix. The implementation is an hour either way; what is unresolved is whether this is a call-screen change or a product-wide one, and picking wrong means either an inconsistent product or an unreviewable visual diff across every page. The reporter's phrasing ('the call screen has the page, an outer card, and inner cards') reads as a call-screen complaint, which points to Option A, but the outer card is shared and the reporter may not know that. Answer that one question and this becomes a fix-now.

### [#1723](https://github.com/chester-hill-solutions/callcaster/issues/1723) template tags should let you click the contact name it's rendering for and open a combo box to use someone else
- Verdict: **Needs decision** · Type: Feature · Priority: Low · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-10-19
- Feature request (template-tag → contact picker) whose scope depends on the tag UX decisions in 1724/1725; product decision first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1700](https://github.com/chester-hill-solutions/callcaster/issues/1700) Why have a distinction between recording step and spoken step if you can also change "Speak text" to "play a recording"
- Verdict: **Needs decision** · Type: Change Request · Priority: Low · Effort: Low · Environment: unset · Size: S · Risk: medium · Labels: ux · Assignee: @sai-sy · Updated: 2026-10-15
- Proposal to collapse Speak/recording block types into one 'Add block'. The editor already treats them as one block with a playback-mode toggle, so the change is a product/scope decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1848](https://github.com/chester-hill-solutions/callcaster/issues/1848) Decide the default mapping when a full-name and a last-name column both exist
- Verdict: **Needs decision** · Type: Feature · Priority: Low · Effort: Medium · Environment: unset · Size: S · Risk: low · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-25
- Suggestion to auto-map a full-name column to firstname instead of name when a separate populated surname column exists, so the pair is not blocked by the ambiguous-name rule. The reporter is unsure the heuristic is worth the overhead.
- Current behavior: suggestContactImportMapping maps a 'Name' header to 'name' and a 'Last name' header to 'surname'; validateContactImportMapping then raises a blocking ambiguous-name issue.
- Root cause: Auto-mapping has no cross-column heuristic; a full-name column and component-name columns cannot coexist because ambiguous-name is blocking.
- Resolution: Decide whether to add a heuristic: when one header resolves to 'name' and a different header resolves to 'surname' and the name column's values do not already contain the surname values, default the name column to 'firstname'. If approved, implement in shared/contact-import-headers.ts and cover it with tests.
- Look in: `shared/contact-import-headers.ts`, `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/AudienceUploader.tsx`
- Existing tests: test/contact-import-headers.test.ts
- Missing tests: Name + separate surname data maps to First name + Last name without a blocking issue; Negative case: a name column that already contains the surname keeps the full-name mapping
- Done when: Decision recorded on whether to add the heuristic; If added, a Name column plus a Last name column with data maps to First name + Last name and is not blocking; Name-only files keep name splitting
- Tracker: needs-decision: the reporter questions the overhead; confirm the heuristic is wanted before implementing.

### [#1129](https://github.com/chester-hill-solutions/callcaster/issues/1129) Define campaign draft/publish semantics and block dirty setup navigation
- Verdict: **Needs decision** · Type: Feature · Priority: Low · Effort: Medium · Environment: unset · Size: L · Risk: high · Labels: ux, needs-repro · Assignee: none · Updated: 2026-09-25
- Campaign edits offer Reset/Save and the launch rail blocks dirty navigation, but there is no save-as-draft vs publish split and no disabled Next while dirty.
- Current behavior: SaveBar Reset + Save Changes writes the row; footer Next always active; no persisted draft-vs-published revision model.
- Root cause: Draft/published semantics undefined; needs-repro against current UI per maintainer.
- Resolution: Decide semantics first (what 'Save as draft' vs 'Save and publish' change), then implement discard/draft/publish and disable footer Next while dirty. Surface existing drafts when a published version exists.
- Look in: `app/components/campaign/settings/CampaignSettings.tsx`, `app/components/shared/SaveBar.tsx`, `app/components/campaign/home/CampaignShellDirty.tsx`, `app/components/campaign/settings/useCampaignSettingsController.ts`
- Existing tests: SaveBar generic tests
- Missing tests: footer navigation while dirty; published/draft version semantics
- Done when: Product rules define draft/publish; Discard restores persisted version; Next blocked while dirty
- Tracker: Decision + needs-repro confirmation before scoping.

### [#1710](https://github.com/chester-hill-solutions/callcaster/issues/1710) Should surveys be separate from scripts instead of integrated?
- Verdict: **Needs decision** · Type: Change Request · Priority: Low · Effort: High · Environment: unset · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-09
- Architecture question whether surveys should merge into scripts. Surveys exist as a separate module with public & workspace routes; consolidation scope needs a decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2922](https://github.com/chester-hill-solutions/callcaster/issues/2922) Twilio webhook boundary verifies requests that name no tenant with the platform main-account auth token, so platform-signed callbacks reach routes that are not…
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- requireTwilioSignature has two credential paths
- Current behavior: requireTwilioSignature has two credential paths. When the caller supplies a workspace option (workspaceId, callSid, messageSid, phoneNumber), the request is verified against that tenant's own subaccount auth token and fails closed if the tenant cannot be resolved (app/lib/twilio-webhook.server.ts:217-266). When the caller supplies no workspace option, the request is verified against the platform main-account token env.TWILIO_AUTH_TOKEN() (app/lib/twilio-webhook.server.ts:251-253) and no tenant resolver runs at all. The Bun pre-handler decides which path a request takes from the request body alone: server/twilio-webhook.ts:26-52 produces a workspace option only when the body carries…
- Root cause: The webhook boundary selects between two credential worlds from the request body alone. When a workspace option is supplied, the request is verified against that tenant's subaccount token and fails closed if the tenant cannot be resolved (app/lib/twilio-webhook.server.ts:217-266). When no workspace option is supplied, which the Bun pre-handler decides purely from the body (server/twilio-webhook.ts:26-52, line 51), the request is verified against the platform main-account token env.TWILIO_AUTH_TOKEN() (app/lib/twilio-webhook.server.ts:251-253) with no tenant resolver consulted. Routes that always take that second path (/api/inbound-verification, and /api/call when the body omits…
- Resolution: Owner-observed checks only, no probing of a live target: (1) query the production database for workspace rows whose twilio_data->>'sid' equals the platform TWILIO_SID and count them; (2) in the Twilio console, list every phone number and TwiML App whose voice URL or status callback points at a tenant-less webhook path and record the owning account of each; (3) place one ordinary call from a second number to the active verification number and record the From value Twilio delivers to /api/inbound-verification, comparing it with the app logs; (4) count twilio.webhook.auth_failed events with reason missing_credentials and attemptedWorkspace=false in the app logs to size the population of…
- Look in: `app/lib/twilio-webhook.server.ts`, `server/twilio-webhook.ts`, `app/routes/api+/inbound-verification.action.server.ts`, `app/routes/api+/call.action.server.ts`, `app/lib/merge-workspace-twilio-data.server.ts`, `docs/adr/0038-verification-numbers-are-platform-data.md`, `app/routes/api+/verify-call-in-session.loader.server.ts`, `app/lib/database/workspace-twilio-subaccount.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2920](https://github.com/chester-hill-solutions/callcaster/issues/2920) Stripe webhook credits the tenant and the credit amount named in the event's session metadata, with no check against the money the session actually collected
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The only authentication on POST /api/stripe-webhook is the Stripe signature over the raw body (app/routes/api+/stripe-webhook.action.server.ts:42)
- Current behavior: The only authentication on POST /api/stripe-webhook is the Stripe signature over the raw body (app/routes/api+/stripe-webhook.action.server.ts:42). That check proves the bytes were signed by the holder of STRIPE_WEBHOOK_SECRET and says nothing about which Checkout Session the event describes, who paid, or how much was collected; it does hold, and a body mutated after signing is rejected with 400. The grant then takes the credited tenant from session.metadata.workspaceId (line 59) and the credited amount from Number(session.metadata.creditAmount) (line 60), and never compares the amount with session.amount_total or session.currency (session.amount_total occurs nowhere in app/, shared/,…
- Root cause: The webhook treats the event payload's session metadata as the source of truth for both the tenant that is credited and the number of credits granted, instead of resolving the event against a server-side record of the purchase it created (or at minimum validating the granted amount against session.amount_total / session.currency and the customer against workspace.stripe_id). Because the ledger's idempotency key stripe_session:<sessionId> is only unique within (workspace, type), a metadata-derived grant is also scoped per tenant, so one session yields one grant per tenant rather than one grant overall.
- Resolution: Owner-observed, no probing of the live target: in the Stripe Dashboard for the platform account, list every Webhook endpoint and its signing secret and confirm that STRIPE_WEBHOOK_SECRET for /api/stripe-webhook is used by that endpoint alone; list every source of Checkout Sessions in the account - this app, any other CHS product, Payment Links, Dashboard-created sessions - and confirm that none can set metadata.workspaceId / metadata.creditAmount or update the metadata of a completed cs_* session; record which Stripe account each environment (dev, qa, prod) points at and whether the signing secret is shared between them; and check the Stripe event log for whether one cs_* session can ever…
- Look in: `app/routes/api+/stripe-webhook.action.server.ts`, `app/lib/platform-billing.server.ts`, `shared/pricing.ts`, `drizzle/0000_baseline.sql`, `client/migrations/20260711000000_money_columns_integer_and_ledger_hardening.sql`, `docs/stripe-webhook.md`, `agents/v04-stripe-metadata-grant/artifacts/evidence.json`, `app/lib/transaction-history.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2919](https://github.com/chester-hill-solutions/callcaster/issues/2919) Boot-time secret validation is presence-only, so a deployment configured from .env.example runs on the repository's published dev secret literals
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The repository publishes three secret literals in .env.example: BETTER_AUTH_SECRET=dev-better-auth-secret-change-me (line 41), CRON_SECRET=dev-cron-secret-change-me (line 151) and MEDIA_STREAM_SECRET=dev-media-stream-secret-change-me (line…
- Current behavior: The repository publishes three secret literals in .env.example: BETTER_AUTH_SECRET=dev-better-auth-secret-change-me (line 41), CRON_SECRET=dev-cron-secret-change-me (line 151) and MEDIA_STREAM_SECRET=dev-media-stream-secret-change-me (line 169). Neither production configuration control rejects them. validateRequiredEnv (app/lib/required-env-keys.mjs:55) computes missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]) - presence only - so the published BETTER_AUTH_SECRET literal passes the boot gate that server/bun.ts:51 depends on (reproduced: accepted under NODE_ENV=production; only an absent key is rejected). env.MEDIA_STREAM_SECRET (app/lib/env.server.ts:218-229) refuses only the unset…
- Root cause: app/lib/required-env-keys.mjs#validateRequiredEnv (line 55) checks only that the required secret variables are present and non-empty, and app/lib/env.server.ts#MEDIA_STREAM_SECRET (lines 218-229) refuses only the unset case, so neither control rejects the dev/example secret literals that the repository itself publishes in .env.example. The production refusal of the dev fallback secret is value-blind: it fires when MEDIA_STREAM_SECRET is absent, and stays silent when MEDIA_STREAM_SECRET is set to the very literal the code treats as the dev fallback secret.
- Resolution: Owner-observed check of the production Railway environment, comparing values in place without printing or transmitting them. For the 'callcaster' application service: confirm BETTER_AUTH_SECRET differs from 'dev-better-auth-secret-change-me' and CRON_SECRET differs from 'dev-cron-secret-change-me'. For the media-stream service: confirm MEDIA_STREAM_SECRET is set and differs from 'dev-media-stream-secret-change-me', and confirm NODE_ENV is 'production' - if NODE_ENV is not 'production' and MEDIA_STREAM_SECRET is unset, app/lib/env.server.ts:228 returns the published literal and the service keys tokens with the published value; a configured MEDIA_STREAM_SECRET is returned unchanged…
- Look in: `.env.example`, `app/lib/required-env-keys.mjs`, `server/bun.ts`, `app/lib/env.server.ts`, `app/lib/media-stream-token.server.ts`, `services/media-stream/index.ts`, `services/media-stream/workspace-config.ts`, `services/media-stream/db-writer.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2918](https://github.com/chester-hill-solutions/callcaster/issues/2918) The media-stream process - token-authorized, unscoped writes and credit debits - has no infrastructure-as-code definition, and its only deploy runbook…
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Confirmed from source: the repository declares three deployable processes (docs/adr/0030-media-stream-bun-service-third-railway-process.md:3, CONTEXT.md:158, docs/media-stream-ops.md:3) and models two
- Current behavior: Confirmed from source: the repository declares three deployable processes (docs/adr/0030-media-stream-bun-service-third-railway-process.md:3, CONTEXT.md:158, docs/media-stream-ops.md:3) and models two. A read-only sandbox scan of the whole .railway/ tree found zero references to media-stream, MEDIA_STREAM_SECRET or MEDIA_STREAM_HOST; .railway/environments/production.ts:108, qa.ts:104 and dev.ts:118 return only the app, the worker, the database, the volume and the bucket, and .railway/config/shared.ts:10 emits preserve() only for the listed names, so MEDIA_STREAM_SECRET and MEDIA_STREAM_HOST sit outside every preservation list - including the app's, even though the app itself signs the…
- Root cause: The repository models only two of its three declared processes in .railway/environments/*.ts, so nothing about the media-stream service - its image, runtime configuration, secret provisioning, or even its existence - is covered by a plan, a preservation list or a review, and the only runbook that governs it (docs/media-stream-ops.md) still describes the service as having no database writes and no credit debits and as sharing one image with the worker. The half-applied 2026-08-03 remediation is the proximate origin: the image fix landed, the runbook correction and the IaC modelling did not.
- Resolution: Read-only and non-destructive, per environment, using the procedure in .agents/skills/railway-iac/SKILL.md. For each of dev, qa and production separately: (1) `railway status --project --environment <env>` and `railway service list --json` to enumerate the environment's services and check whether a media-stream service exists, and if so its build method (Dockerfile path or start command), source branch, and public domain; (2) `railway variable list --service <id> --environment <env> --json` for the app, the worker and any media-stream service, inspecting variable NAMES only - never `--show-values`, `--decrypt-variables`, or `config apply` - and record whether MEDIA_STREAM_SECRET and…
- Look in: `.railway/environments/production.ts`, `.railway/config/shared.ts`, `services/media-stream/index.ts`, `services/media-stream/db-writer.ts`, `services/media-stream/coaching-billing.ts`, `docs/media-stream-ops.md`, `Dockerfile.worker`, `Dockerfile`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2916](https://github.com/chester-hill-solutions/callcaster/issues/2916) Pull-request-controlled npm install lifecycle scripts run in CI jobs whose environment already exports repository and environment secrets
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Every pull-request-reachable dependency install in this repository runs `npm ci` against the pull request's own checkout, and npm executes the root package's install lifecycle scripts from that pull-request-controlled package.json while…
- Current behavior: Every pull-request-reachable dependency install in this repository runs `npm ci` against the pull request's own checkout, and npm executes the root package's install lifecycle scripts from that pull-request-controlled package.json while the install step's environment already holds secrets. In ci.yml the install step exports `NODE_AUTH_TOKEN: ${{ secrets.NODE_AUTH_TOKEN || github.token }}` (the same step shape at lines 78/92/110/127/144/193/214, secret at 80/94/112/129/146/195/216); e2e.yml:76/79 and schema-default-drift.yml:54/56 repeat the pattern; and in railway-iac.yml the same secret is exported on the install step (lines 49, 89, 128) while `RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}`…
- Root cause: The dependency-install step trusts the manifest it is handed: `npm ci` reads the pull-request-controlled root package.json and executes its install lifecycle hooks, while the workflow places secrets in the environment of that same step - step-scoped `NODE_AUTH_TOKEN` for the install step, and job-scoped `RAILWAY_TOKEN` in railway-iac.yml, inherited by every step of the job. The repository's own images show the opposite containment: Dockerfile:9-11 and Dockerfile.worker:6-8 copy only `package.json`, `bun.lock` and `vendor/` before installing, so the checked-in `prepare` hook is an inert no-op there (`test -f scripts/setup-githooks.sh` fails and the `|| true` swallows it) and CI is the only…
- Resolution: Owner-observed, non-destructive, no probing of a live target: (1) read Settings > Actions > General > Workflow permissions for the repository and the organization default, and note whether 'Send write tokens to workflows from pull requests' and 'Require approval for all outside collaborators' are enabled; (2) read the protection rules of the dev, qa and production GitHub environments (required reviewers, deployment branch rules, wait timer) and note whether the dev and qa jobs can start unattended; (3) list the repository's collaborators and their permissions to establish who can push a branch, and therefore open a secret-bearing pull request, and whether any of them is a lower-trust…
- Look in: `.github/workflows/ci.yml`, `.github/workflows/railway-iac.yml`, `.railway/README.md`, `.github/workflows/e2e.yml`, `.github/workflows/schema-default-drift.yml`, `package.json`, `package-lock.json`, `.npmrc`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2913](https://github.com/chester-hill-solutions/callcaster/issues/2913) Ownership transfer's MFA precondition is a stored-column check that is not bound to the platform's 2FA enforcement kill switch, so it disagrees with the…
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Workspace ownership transfer is the platform's trust-root operation: it is the only path that can grant the highest workspace role, and it is documented as requiring an MFA-enrolled incoming owner (openapi/public-api.json:10634, generated…
- Current behavior: Workspace ownership transfer is the platform's trust-root operation: it is the only path that can grant the highest workspace role, and it is documented as requiring an MFA-enrolled incoming owner (openapi/public-api.json:10634, generated from app/lib/openapi-platform.ts:643: 'The incoming owner must have MFA enrolled (SEC-08)'; docs/api-workspace-admin.md:17-24 'Ownership transfer'). Both reachable writers of that precondition - the route-level product function (app/lib/platform-workspace.server.ts:180) and the canonical writer (app/lib/workspace-members-db.server.ts:200), which the settings-form path also reaches (app/lib/workspace-settings/WorkspaceSettingUtils.server.ts:138) - implement…
- Root cause: The transfer's assurance gate calls isTwoFactorEnabled(userId) (app/lib/two-factor.server.ts:135) - a read of the stored auth_user.two_factor_enabled column - instead of the platform's enforcement kill switch isTwoFactorEnforcementDisabled() (app/lib/two-factor.server.ts:55) that every sibling privileged-role gate honours, so the precondition is satisfied by a leftover column value regardless of whether a second factor is registered, prompted or enforced on that user's sessions.
- Resolution: Owner-observed, read-only inspection only - no probing of any live endpoint: (1) 'railway variables --service <production web service>' to record whether TWO_FACTOR_ENABLED and DISABLE_2FA_ENFORCEMENT are set; this is the decisive fact, because with TWO_FACTOR_ENABLED=true|1 the transfer gate tracks live enrollment and the candidate does not apply. (2) 'select count(*) from auth_user where two_factor_enabled' on the production database to size the leftover-row population the stale-column gate would admit. (3) 'select id, email from auth_user where two_factor_enabled' to identify which accounts could be promoted to owner on a leftover row. (4) 'select count(*) from workspace_member wm left…
- Look in: `app/lib/workspace-members-db.server.ts`, `app/lib/platform-workspace.server.ts`, `app/lib/two-factor.server.ts`, `app/lib/platform-members.server.ts`, `app/server/auth-instance.ts`, `docs/release-test-guide-2026-09-07.md`, `docs/CHANGELOG.md`, `app/lib/env.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2912](https://github.com/chester-hill-solutions/callcaster/issues/2912) The JSON admin plane (/api/admin/*) applies no two-factor enrolment mandate to sudo operators, while the HTML admin panel does
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The HTML admin panel and the JSON admin plane apply different authentication bars to the same sudo operator
- Current behavior: The HTML admin panel and the JSON admin plane apply different authentication bars to the same sudo operator. The HTML panel (app/lib/admin-middleware.server.ts) requires two things: public.user.access_level === 'sudo' (line 25) and TOTP enrolment (requireTwoFactorEnrollmentForPrivilegedUser with isPrivileged: true, line 34). The JSON admin plane under app/routes/api+/admin+/ requires only the first: requireSudo (app/lib/api-auth.server.ts:201-220) checks access_level and returns the operator. It never reads auth_user.two_factor_enabled, it imports nothing from app/lib/two-factor.server, and it never calls blockUnenrolledPrivilegedSessionUser, the JSON guard the workspace data plane uses for…
- Root cause: requireSudo was written as a standalone JSON guard and never adopted blockUnenrolledPrivilegedSessionUser, the helper the data-plane middleware uses for the same privileged-session check (app/lib/data-plane-middleware.server.ts:27). The JSON admin plane sits outside the data-plane middleware tree (app/routes/api+/admin+/ exports no middleware), so the helper is never reached on that path.
- Resolution: Owner runs the read-only Railway listing for the CallCaster app service in the production environment (railway variables --service <app service> --environment production) and records whether TWO_FACTOR_ENABLED is present and set to 'true' or '1'; repeat for the review environment. If it is unset (the state recorded on 19 October 2026), requireSudo must still gain the enrolment gate before the flag is switched on, and the enable/disable decision itself should be closed under issue #1815 with the per-environment state written down in an ADR. If it is set, the JSON-plane gap is live now and requireSudo must gain the enrolment gate before the next deploy. The check is read-only: do not set,…
- Look in: `app/lib/admin-middleware.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/two-factor.server.ts`, `app/lib/env.server.ts`, `ISSUE_BOARD.md`, `app/routes/api+/admin+/users+/$userId.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2911](https://github.com/chester-hill-solutions/callcaster/issues/2911) GET /confirm-payment credits the tenant named by the Stripe session metadata, with no binding to the calling principal's workspace
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- GET /confirm-payment?session_id=<id> is the browser-facing credit-grant path
- Current behavior: GET /confirm-payment?session_id=<id> is the browser-facing credit-grant path. The route takes the Checkout Session id from the query string, requires only that some session exists (verifyAuth inside the handler: no workspace, no role), and then confirmStripeCheckoutSessionForRedirect retrieves that Checkout Session and credits the workspace named in the session's metadata, for the number of credits named in the same metadata. Nothing on this path compares the session's tenant with a workspace the calling principal belongs to, and nothing validates the metadata amount the way the two sibling grant paths do. pollBillingCheckoutSession compares session.metadata.workspaceId with the caller's…
- Root cause: The browser-facing credit-grant path treats the Stripe Checkout Session's metadata as the authority for both the target tenant and the credited amount, and applies neither of the two controls its sibling grant paths apply: no binding between the session's tenant and the requesting principal's workspace, and no finite-positive validation of the amount. The unscoped db client is a code-hygiene difference, not the missing control: createTenantDb(workspaceId).execute delegates to the raw client (app/server/tenant-db.ts:227), so the webhook path's tenant-scoped client passes the same metadata tenant to the RPC. The credits delta is whatever p_amount the metadata carried, applied by the RPC to…
- Resolution: Owner-observed checks only, no probing of a live target: (a) in the Stripe Dashboard for the platform account, list every Checkout Session and confirm that each one carries metadata.workspaceId equal to the tenant that created it and a creditAmount equal to the priced amount, and confirm that no Payment Link, Dashboard-created session, other CHS product, other CallCaster environment or stripe listen forwarder writes sessions to the same account; (b) confirm that no cs_... id belonging to one tenant is reachable by another tenant through transaction_history.idempotency_key, the ledger note, the workspace_events SSE payload, the admin Credits tab, the success_url or application logs; (c)…
- Look in: `app/lib/platform-billing.server.ts`, `app/routes/api+/stripe-webhook.action.server.ts`, `app/routes/confirm-payment.loader.server.ts`, `app/server/tenant-db.ts`, `shared/billing-keys.ts`, `app/lib/auth.server.ts`, `client/migrations/20260711000000_money_columns_integer_and_ledger_hardening.sql`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2903](https://github.com/chester-hill-solutions/callcaster/issues/2903) Two-factor authentication is opt-in and unset in every maintained deployment model: without TWO_FACTOR_ENABLED the Better Auth twoFactor plugin is never…
- Verdict: **Needs decision** · Type: Change Request · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The two-factor control is opt-in, and the maintained deployment models leave it unset, so a deployment that never sets the flag runs with no second factor
- Current behavior: The two-factor control is opt-in, and the maintained deployment models leave it unset, so a deployment that never sets the flag runs with no second factor. (1) The feature switch is opt-in: isTwoFactorFeatureEnabled (app/lib/env.server.ts:268-271) returns true only for the exact strings 'true' or '1'. Reproduced locally under NODE_ENV=production: unset -> false; '1' and 'true' -> true; '0', 'false' and 'yes' -> false. (2) The Better Auth plugin follows the flag: auth-instance.ts:61-67 registers the twoFactor plugin only when the flag is on. Reproduced locally by instantiating the repository's own Better Auth instance: with the flag unset the instance exposes zero plugins; with…
- Root cause: app/lib/env.server.ts:268-271 enables the two-factor feature only for the exact strings 'true'/'1', so an unset TWO_FACTOR_ENABLED means the feature is off; app/server/auth-instance.ts:61-67 registers the Better Auth twoFactor plugin only when that flag is on; and app/lib/two-factor.server.ts:55-61 returns 'enforcement disabled' on the feature-off branch before the production refusal at lines 67-85 can apply. No maintained Railway environment model sets TWO_FACTOR_ENABLED (.railway/environments/production.ts:4, .railway/environments/qa.ts:15; dev sets DISABLE_2FA_ENFORCEMENT instead at .railway/environments/dev.ts:10) and .env.example:159 ships it commented out, so a deployment that never…
- Resolution: Owner-observed, read-only and non-destructive. (1) Read the live value of the flag: `railway variables --service callcaster --environment production`, and the same read for the review/dev and QA app services. An absent or unset TWO_FACTOR_ENABLED confirms the deployed default is 'no second factor' on that environment; a value of 'true' or '1' refutes the finding for that environment. This is a read only; no variable is written. (2) Confirm the effect without mutating anything: sign in with a password-only privileged account on the review environment and observe whether a TOTP prompt appears, and open Account -> Security to see whether the feature is reported as unavailable…
- Look in: `app/lib/env.server.ts`, `app/server/auth-instance.ts`, `app/lib/two-factor.server.ts`, `.railway/environments/production.ts`, `.env.example`, `app/lib/workspace-members-db.server.ts`, `test/two-factor.server.test.ts`, `agents/h18-origins-and-env/artifacts/evidence.json`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2263](https://github.com/chester-hill-solutions/callcaster/issues/2263) Scope unknown-sender opt-out enforcement in the consent ledger rollout
- Verdict: **Needs decision** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- Unknown-sender opt-out messages are saved, but no contact flag or app phone-level suppression protects later imports and sends.
- Current behavior: The inbound route saves the message, then updates and dequeues only matching contacts. Zero matching IDs leave no app suppression record. The original claim that the message was discarded was incorrect.
- Root cause: ADR-0034 already adopts recipient consent and fail-closed automated sends. The unknown-sender path lacks that ledger; its rollout boundary and implementation slices need definition.
- Resolution: Scope the unknown-sender path in the adopted consent ledger rollout under #1268. Define recipient key, normalization, future imports, every send entry point, atomic pending-send suppression, recipient START and the legacy migration boundary. An operator warning can expose the interim legacy gap but cannot replace ADR-0034 enforcement or satisfy completion.
- Look in: `docs/adr/0034-recipient-messaging-consent-and-fail-closed-disclosure.md`, `docs/interactive-sms-delivery-plan.md`, `app/routes/api+/inbound-sms.action.server.ts`, `app/lib/inbound-sms-context.server.ts`, `app/lib/chat-sms-guards.server.ts`, `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: Inbound tests cover known contacts; this decision has no implementation yet.
- Missing tests: After the decision: unknown-sender opt-out followed by import and manual/campaign sends, another-workspace control and explicit opt-in.
- Done when: Rollout boundary and slices follow ADR-0034 and the delivery plan.; Authoritative consent, enforcement points, atomic suppression and recipient START are defined.; Implementation and real prerequisites are split after scoping.
- Tracker: Independent follow-up from #2090. Keep visible until the adopted ledger rollout is scoped; the keyword fix does not resolve it.

### [#2264](https://github.com/chester-hill-solutions/callcaster/issues/2264) Define operator guidance for Advanced Opt-Out
- Verdict: **Needs decision** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The saved Advanced Opt-Out request is not verified provider state. Decide how operators see the request, verification limits and Console action.
- Current behavior: The saved flag defaults false. Console guidance appears only for requested true with a Messaging Service SID. Standard long-code provider opt-out exists by default, so a false local flag does not establish absent STOP protection.
- Root cause: Operator guidance for requested state versus verified provider state is undefined.
- Resolution: Choose the operator flow and any warning or justified setup blocker. Define true/false requested state, missing/present Messaging Service SID and unverified provider state. Do not label an unverified provider setting as disabled.
- Look in: `app/lib/messaging-onboarding/normalize.server.ts`, `app/lib/database/workspace-twilio-recommendations.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.OperationalGuidancePanel.tsx`
- Missing tests: After the decision: UI coverage for requested true/false, SID missing/present and unverified provider state.
- Done when: Display-state meanings and operator flow are recorded.; Guidance does not imply the saved request verifies provider settings or that standard protection needs Advanced Opt-Out.; A small implementation issue with UI coverage follows the decision.
- Tracker: Independent follow-up from #2090. Keep in Needs decision; the keyword fix does not resolve operator guidance.

### [#2194](https://github.com/chester-hill-solutions/callcaster/issues/2194) Cull 111 empty legacy-named Twilio subaccounts (Console-only; 31 must be kept)
- Verdict: **Needs decision** · Type: unset · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- The old survey identified 111 apparent candidates and 31 live dev owners. Dev, staging and production share the account; current ownership and deletion safety have not been established.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The read-only evidence tooling exists and is now cross-environment aware: scripts/twilio-subaccount-inventory.mjs lists subaccounts, numbers and message counts, and scripts/twilio-resource-prune-policy.mjs turns 'not in this database' into UNKNOWN rather than stale, because the Twilio account is shared by every environment. What is not done: the list of 111 candidates and the 31 keepers is not checked in, and the Console cull has not happened. Twilio v5 has no remove for an account, so each deletion is a console action.
- Resolution: The evidence tooling is done. The cull itself is a Console task and needs the reconciled list: put the 31 keepers in scripts/twilio-resource-prune-keep-list.mjs so the report holds them, then delete the 111 by hand in the console. The prune report prints the owner of every subaccount, which is what tells a live dev subaccount from an orphaned one.
- Look in: `scripts/twilio-subaccount-inventory.mjs:33-38 (read-only by design; no API delete for a subaccount)`, `scripts/twilio-resource-prune-policy.mjs:227-246 (owner unknown is UNKNOWN, never stale)`, `scripts/twilio-resource-prune-keep-list.mjs (where the 31 keepers go)`
- Missing tests: Every candidate must have an evidenced absence of live ownership; no current deletion count can be inferred from the old survey.
- Tracker: Needs decision: a historical empty-resource count does not authorize shared-account deletion. Related PR evidence: #2193, #2195. A PR reference alone does not prove deployed behavior.

### [#2046](https://github.com/chester-hill-solutions/callcaster/issues/2046) Attribute inbound SMS replies to a campaign
- Verdict: **Needs decision** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Inbound rows still omit campaign_id. A latest-outbound correlation is only a heuristic when several campaigns address the same person; the ticket lists three different models without choosing one.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Inbound rows still omit campaign_id. A latest-outbound correlation is only a heuristic when several campaigns address the same person; the ticket lists three different models without choosing one.
- Root cause: The inbound write path knows only the contact (matched by From number); the outbound path knows its queue/campaign at dispatch. No conversation/thread link is written on the inbound row.
- Resolution: Choose and document attribution precedence, correlation window, sender matching and ambiguity behavior. Then implement one model with STOP behavior preserved.
- Look in: `app/routes/api+/inbound-sms.action.server.ts:178`, `app/lib/campaign-export-db.server.ts:73`, `app/routes/api+/inbound-sms.action.server.ts`, `app/lib/campaign-export.server.ts`, `app/lib/campaign-export-db.server.ts`, `app/db/schema.ts (message table)`
- Existing tests: test/inbound-sms.route.test.ts
- Missing tests: No source test proves single-blast attribution or deterministic ambiguous attribution.
- Done when: Single-blast reply attributed to exactly that campaign; Export lists replies with deterministic reply_to_campaign_ids + documented precedence; STOP/opt-out dequeue unaffected; Attribution covered by a test
- Tracker: Move to Needs decision. Choose reply attribution semantics before adding a historical heuristic as fact.

### [#2218](https://github.com/chester-hill-solutions/callcaster/issues/2218) No recurring revenue exists: there is no plan, subscription or invoice table, and the only pay path is a one-time credit top-up
- Verdict: **Needs decision** · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
- There is no plan, subscription or invoice table anywhere in the schema or in any migration. The only pay path is a one-time credit purchase with a $10 minimum (shared/pricing.ts:9) at $0.02 per credit (shared/pricing.ts:8). Half the plumbing already exists: createNewWorkspace creates a Stripe customer at provisioning (app/lib/database/workspace-provisioning.server.ts:138-145), workspace.stripe_id is stored (app/db/schema.ts:106), and a webhook is handled (app/routes/api+/stripe-webhook.action.server.ts). What is missing is the product: what a customer subscribes to, and what a lapse does.
- Current behavior: Revenue stops when a customer's credits run out and someone tops up manually. For the revealed buyer this is a structural problem rather than a pricing one: the contact schema is political campaign outreach (voter_list_source holds elections_canada and elections_ontario at app/db/schema.ts:89; contact carries voter_id and support_level at app/db/schema.ts:285-290), and a campaign runs a season then stops. A platform funded only by usage therefore earns less the better a customer does, and no customer can budget against it.
- Root cause: The credit ledger was built first and well — one idempotent plpgsql RPC for ledger insert plus balance update, a single shared rate card, shared idempotency-key builders per billing kind, and a reconciliation path using the same terminal-status set as the debit gate (shared/pricing.ts:84-99). That is a metered-billing foundation, and it was mistaken for a finished billing product. What is absent is the layer above it: a plan, a period, and a lapse behaviour. Note that a recurring charge already exists in everything but name — number rental bills on a cycle (app/lib/number-rental-billing.server.ts) with a suspension lifecycle (workspace_number.suspended_at, rental_warned_cycle; client/migrations/20260731160000_workspace_number_rental_lifecycle.sql). The gap is a plan that bundles that with metered usage, not the absence of recurring machinery.
- Resolution: This is a product decision before it is an engineering task. Answer these five before writing code, because each changes the schema rather than just the checkout: (1) WHAT IS SOLD — a plan with included minutes and credits, metered overage, or a hybrid. Number rental is the natural anchor because it already recurs. (2) PERIOD — monthly, and whether annual exists. (3) LAPSE BEHAVIOUR — suspend sending at zero credits as today, or something softer; the rental lifecycle above is a working precedent for the whole workspace. (4) CREDIT SEMANTICS — whether credits become a grant that refreshes each period or remain a prepaid balance drawn down by a subscription. This is the core modelling question and it changes the ledger, not just checkout. (5) CURRENCY — CAD or USD or both; CREDIT_PRICE_CAD and formatCadFromCredits are CAD-only today (shared/pricing.ts:8,144-149). Once 1-5 are answered the schema work is a subscription table with a Stripe id, status and period, plus a plan table if plans are configurable. Everything else reuses the existing ledger, which is the asset here.
- Look in: `shared/pricing.ts:8-10 (price per credit and minimum purchase — the whole current pay model)`, `shared/pricing.ts:84-99 (terminal billable status sets, shared by debit and reconciliation)`, `app/db/schema.ts:106 (workspace.stripe_id, currently the only billing identity on the tenant)`, `app/lib/database/workspace-provisioning.server.ts:138-145 (Stripe customer created at provisioning)`, `app/lib/number-rental-billing.server.ts (a recurring charge that already exists)`, `client/migrations/20260731160000_workspace_number_rental_lifecycle.sql (the suspension precedent for a lapse)`, `client/migrations/20260704000004_apply_ledger_entry_and_sync_credits.sql (the idempotent ledger RPC the subscription would reuse)`
- Blocked by: [#1521](https://github.com/chester-hill-solutions/callcaster/issues/1521)
- Missing tests: The subscription write path is idempotent, consistent with how transaction_history is written today; A lapsed subscription produces a defined and tested workspace state; A refresh-period grant does not double-credit on replay (kill-check: replay the grant webhook and confirm the balance is unchanged)
- Done when: The five questions above are answered in writing, in the repo; A subscription table exists with an idempotent write path; A lapsed subscription produces a defined, tested workspace state; Refunds and disputes are handled — #1521 is the open decision and it blocks this
- Tracker: Needs decision, and the five questions are the deliverable, not a preamble to them. The single most consequential answer is credit semantics: if a subscription grants credits that refresh, the existing ledger's meaning changes and the reconciliation logic that shares the debit gate has to be reworked rather than extended. Do not start implementation before that is settled. This issue is blocked by #1521 (whether refunds and disputes reverse credits), which is a narrower decision about the same ledger. Sequence it AFTER the open credit-ledger defects are fixed rather than before — a subscription layered onto a ledger that drops out-of-order rows or mis-bills MMS makes those bugs more expensive and harder to attribute, and it is worth saying plainly that the ledger is currently correct by design and only its callers and schema are not.

### [#2217](https://github.com/chester-hill-solutions/callcaster/issues/2217) No product analytics exists anywhere, so every product decision is an untested guess
- Verdict: **Needs decision** · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-29
- No product analytics in the codebase. A scan of app/, shared/, services/, worker/ and server/ for PostHog, Segment, Mixpanel, Amplitude, Google Analytics, gtag and Plausible returns nothing. Sentry is wired for errors only, at 8 call sites (app/entry.server.tsx:133, app/lib/errors.server.ts:118, app/lib/ops-alert.server.ts:141, app/lib/worker/poll-jobs.server.ts:365,390, server/bun.ts:449,471,536,543,622, worker/index.ts:28). The two tables that look like usage data are not: workspace_events (app/db/schema.ts:443) is an SSE feed whose rows are deleted past a retention window by app/lib/worker/job-retention.server.ts:67-90, and workspace_audit_event (app/db/schema.ts:451) is a security log gated behind the owner-only audit.read capability.
- Current behavior: Nothing about product usage is measurable. There is no funnel across the five steps a new workspace must pass (signup, workspace creation, first rented number, first campaign, first accepted send), no cohort or retention measure, and no acquisition attribution. The build is far wider than the revealed product — 53 tables, 542 route modules, and 90 days of commits at 355 fix against 134 feat — and nothing in the code indicates which parts anyone walks. NEW_WORKSPACE_WELCOME_CREDITS = 100 (app/lib/database/workspace-provisioning.server.ts:33) is an untested guess at whether $2 of free usage is enough to convert.
- Root cause: Analytics was never treated as a product surface. The codebase has an unusually deliberate answer for most other concerns — tenancy is enforced by a scoped client, billing by one idempotent RPC, compliance by one shared predicate table — and each of those was a decision. Instrumentation was left to default, and the default was none. There is also no team-time argument that resolves it: adding a vendor is a privacy and data-sharing decision on a product that holds Canadian political contact data, and that decision has not been made rather than been deferred.
- Resolution: Answer the sink question first, deliberately. Do not start by adding a vendor. A first-party event table behind the existing tenant client is more consistent with how everything else in this codebase works, costs no third-party data-sharing decision on a product holding voter and contact data, and inherits the tenancy enforcement that already exists. A vendor is faster to stand up and is the right answer if the team wants cohorts and funnels without building them. Either is defensible; picking by default is not. THEN, in order: (1) define the activation event and measure that alone — a workspace that has completed a first accepted send is the closest thing to a north-star metric this product has; (2) instrument the five-step funnel; (3) keep the data tenant-scoped and role-gated from day one, copying the audit.log model (workspace_audit_event plus the owner-only audit.read capability in app/lib/capabilities.ts:47-78), because looser access than that would be a regression in a codebase that deliberately went the other way; (4) keep the analytics client out of the session route's hot path and off check:client-bundle's denylist, sampling if volume requires it.
- Look in: `app/db/schema.ts:443 (workspace_events — an SSE feed, not usage analytics)`, `app/db/schema.ts:451 (workspace_audit_event — a security log, the access model to copy)`, `app/lib/workspace-events.server.ts:26 (the insert path a first-party event table would mirror)`, `app/lib/capabilities.ts:47-78 (audit.read is owner-only — the model to copy)`, `app/lib/worker/job-retention.server.ts:67-90 (workspace_events rows are pruned, so it is a feed and not a record)`, `app/lib/database/workspace-provisioning.server.ts:33 (the untested welcome-credit guess)`
- Missing tests: Each of the five funnel steps emits exactly one event, asserted per step (kill-check: break one emission and confirm the test goes red); A cohort query by activation state is reproducible from the database; Analytics routes are covered by check:route-authz and gated at least as tightly as the audit log
- Done when: A written decision exists in the repo on the sink, stating why — vendor or first-party; The activation event is defined in writing and is queryable; The five funnel steps emit one event each, each asserted; Analytics data sits behind the same or tighter role gate than the audit log
- Tracker: Needs decision, not fix-now, because the first task is a product and privacy choice rather than code: whether a product holding Canadian voter and contact data may send events to a third party. That choice changes the implementation substantially, so implementing before it is made risks doing the work twice. This is the largest gap between what the code does and what the business needs, and it is the reason the other open decisions in this batch are hard to answer — several of them (welcome-credit sizing, which features to keep, whether the product is one vertical or two) are product questions that measurement would settle and that currently rest on intuition. Not a duplicate of #1185, which was a narrower credit-variance cross-reference and is closed completed.

### [#2164](https://github.com/chester-hill-solutions/callcaster/issues/2164) workspace.disabled does not block sign-in or API access, so the platform suspension lever does not suspend
- Verdict: **Needs decision** · Type: unset · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-28
- Disabling a workspace stops money moving out (rental DEBITs, billing_reconcile, twilio_open_sync) but does not stop anyone using the product. `disabled` is read in only three places and no auth path reads it, so a suspended workspace's members still sign in and still use the API.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. No auth path reads the flag. app/lib/workspace-middleware.server.ts and app/lib/data-plane-middleware.server.ts both resolve the session and set their context without looking at workspace.disabled, and app/lib/cron-workspace-fanout.server.ts says so in prose: the lever does NOT block members from signing in, so skipping the billing is the whole of what it buys today. app/db/schema.ts:103 still declares disabled with no comment recording the intended meaning, and the admin panel still shows a bare Disabled badge. No test asserts any access behaviour for a disabled workspace.
- Root cause: `disabled` was specified and implemented as a billing lever only. It was never given an auth meaning, so the name implies a kill switch it does not provide. Not a missing check — a missing decision.
- Resolution: Two decisions. First, is workspace.disabled meant to be an access kill switch or only a billing lever? The current behaviour is the billing lever and the code says so. Second, if it is meant to suspend access, the suspension has to be enforced in the workspace middleware and the data-plane middleware, the schema column needs a comment recording the intended meaning, and the admin badge needs to stop over-promising. Decide before building, because a half-enforced suspension is worse than an honest billing lever.
- Look in: `app/db/schema.ts:103 (the disabled column, uncommented)`, `app/lib/workspace-middleware.server.ts:28-47 (no disabled read)`, `app/lib/data-plane-middleware.server.ts:22-33 (no disabled read)`, `app/lib/cron-workspace-fanout.server.ts:44-53 (the honest statement of what the flag does)`, `app/routes/admin+/panels/AdminWorkspacesPanel.tsx:265-271 (the bare Disabled badge)`
- Existing tests: none covering disabled-workspace sign-in or API access
- Missing tests: a disabled workspace's member cannot sign in; a disabled workspace's API token is rejected; number release still runs for a disabled workspace
- Done when: The disabled semantics are chosen and recorded, not assumed; If (a): sign-in and API access are blocked for a disabled workspace; The warn->suspend->release ladder still releases numbers for disabled workspaces; Existing disabled-workspace billing tests stay green
- Tracker: Needs a decision, not an implementation. Blocked only on the product call. Related to #2116, whose original single-guard proposal was already rejected in favour of splitting the billing lever from number release.

### [#2139](https://github.com/chester-hill-solutions/callcaster/issues/2139) Member-level role management is server-permitted but UI-invisible, so the Member floor on updateUser/deleteUser is dead code
- Verdict: **Needs decision** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- A workspace `member` who clicks the gear icon on a peer sees the manage sheet with their own name in the title and the text "You do not have permission to edit this user" — for an operation the server explicitly authorises and has unit tests for. The message actively tells the user the product forbids something it allows.
- Current behavior: One side of the permission model is implemented and the other is not, and the user-visible message is on the wrong side. A test that asserts the server permits it and a UI that asserts the user cannot do it are both green, which is why this survived.
- Resolution: Decide the policy and make one side match. Given that `assertNoRoleEscalation`, `requireActorOutranksTarget` and `requireSoleOwnerProtection` already exist, the smaller fix is to **render the form**: 1. `TeamMember.tsx:139-141` → `userRole !== MemberRole.Caller && memberRole !== MemberRole.Admin` (keep the existing `memberRole === "owner"` exclusion from the sheet wrapper at `:78`). 2. Filter the `updateUser` role select by `assertNoRoleEscalation(userRole, role)` so a `member` is never offered `admin`. 3. If admin-only is the intent instead, raise the floor in `settings.action.server.ts:46` to `MemberRole.Admin` and add a member-floor test asserting 403. 4. **Either way, add the e2e assertion.** There should be a test that a `member` sees (or does not see) the manage control, matching whichever policy is chosen. Right now neither side is asserted in the UI and the server test asserts th
- Look in: `app/components/workspace/TeamMember.tsx:78,139-141`, `app/routes/workspaces+/$id/settings.action.server.ts:44-53`, `app/lib/platform-members.server.ts:53-75`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts (`assertNoRoleEscalation`, `requireActorOutranksTarget`)`, `e2e/specs/rbac.spec.ts`
- Missing tests: The UI visibility matches the chosen policy (kill-check).; A `member` is not offered `admin`.; The e2e assertion.
- Done when: The UI and the server agree: a `member` either sees a working manage form, or is told the truth and the server agrees (kill-check: flip one side and confirm a test goes red).; A `member` is never offered a role they cannot grant.; The sole owner still cannot be removed or demoted.; An e2e assertion covers the visibility, matching the chosen policy.
- Tracker: Filed from the 2026-09-25 full vertical-slice sweep. Evidence was read and quoted from the code at dev@648f5e58; the high-severity claims were re-verified against the source before filing. Every missing test above is a specific assertion with an explicit kill-check, not a request to add coverage.

### [#2051](https://github.com/chester-hill-solutions/callcaster/issues/2051) Decide what happens to unsettled messages when a campaign expires
- Verdict: **Needs decision** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- The #2048 settled-message gate is bypassed on the expired-campaign path: app/lib/worker/handlers/campaign.server.ts writes status=complete directly via updateCampaignStatusInWorkspace and never calls try_complete_campaign_if_drained. An expired message campaign can therefore read complete while Twilio still holds unsettled messages. Worse, runSmsStatusSideEffects only calls cancelQueuedMessagesForCampaign AFTER the end date has passed, so the bypass fires before the cancellation is even attempted.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. app/lib/worker/handlers/campaign.server.ts still terminalizes an expired campaign straight to complete, and its comment names the known gap: the settled-message gate is bypassed, so an expired message campaign can read complete while Twilio holds unsettled messages. The comment says the decision is tracked on #2048, which is closed - the open decision is this issue. There is no expired or cancelled campaign status, no credit-refund path, and no operator warning.
- Root cause: Genuine rule conflict, not an oversight. The RPC also requires an empty queue, and this path exists so a campaign that expires mid-drain does not stay stuck 'running' (#1512). Routing it through the gate would re-break that.
- Resolution: Decide whether expired means complete, means cancel the remainder and then settle, or needs its own campaign status. The code cannot be changed before that, because routing it through try_complete_campaign_if_drained re-breaks the anti-stuck behaviour the expiry path exists to provide. When the decision is made, also fix the code comment: it points at #2048, which is closed, instead of this issue.
- Look in: `app/lib/worker/handlers/campaign.server.ts:267-300 (the expiry path and its known-gap comment)`, `client/migrations/20260925120000_gate_campaign_completion_on_settled_messages.sql:51 (the gate it bypasses)`, `app/lib/campaign-ivr.server.ts:189-218 (the compare-and-set pattern the expiry path would need)`
- Missing tests: expired campaign with unsettled messages does not read complete (under the chosen rule); expired campaign with an undrained queue still terminalizes (#1512 preserved)
- Done when: Decision recorded in the issue and in the relevant doc; Expired campaign with unsettled messages does not read complete under option 2 or 3; #1512 anti-stuck behaviour preserved; Option 1 also specifies credit treatment and an operator warning for abandoned messages; Real-Postgres test pins whichever rule is chosen
- Tracker: DECLINED by the maintainer on 2026-09-25 ('no 2051'). Do not pick this up and do not re-raise it. The gap is real and still worth knowing about: an expired message campaign writes status=complete directly, bypassing the #2048 settled-message gate, so a campaign whose end_date passed while Twilio still held messages can read complete. It is deliberately left as-is rather than fixed, and the code carries a comment marking it a known gap so nobody mistakes it for covered. The genuine rule conflict stands: routing it through the gate would re-break #1512, because the RPC also requires an empty queue and this path exists so a campaign that expires mid-drain does not stay stuck running.

### [#2043](https://github.com/chester-hill-solutions/callcaster/issues/2043) Decide how far to expand the campaign-split feature: promote it, widen its trigger, or automate the copy variation it asks for by hand
- Verdict: **Needs decision** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: @sai-sy · Updated: 2026-09-25
- This issue has no defect in it. The title is an instruction to a person ('sai expand on this') and the body is a screenshot of the campaign Launch page, so what 'expand' means has to come from the reporter. The screenshot is the split feature's own surface: a 11,636-contact draft on a Canadian local number, with 'Split into 24 campaigns' in the large-bulk-send warning. The feature itself is built and works — SplitCampaignPrompt (app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx) clones the campaign into evenly sized segments, distributes the queued contacts, warns on ca_local with a queue of 500 or more (app/lib/throughput-config.ts:102-108), and requires an acknowledgement that the operator will vary the copy. Three things a person could plausibly mean by 'expand', and they are different pieces of work. (1) Reach: the prompt renders in exactly one place, the Launch step of a message campaign (app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx:219-224), and only when isBulkSmsSenderMisaligned is true, so a campaign on a toll-free number with 50,000 queued contacts never sees it. (2) Automation: the copy-variation checklist is a checkbox acknowledgement and the clones get identical copy, so the operator is told to do manually the thing that defeats the carriers' duplicate-content detection. (3) Correctness: the split distributes queued contacts, and it is worth confirming what happens to the campaign's audit trail and to a send that is already in flight when the split is taken.
- Current behavior: A working but single-purpose warning-path tool: one entry point, one trigger condition, manual copy variation.
- Root cause: The feature was scoped as a safeguard inside the bulk-send warning rather than as a campaign operation, so its reach and its automation were never designed.
- Resolution: Ask the reporter which of these they mean, because they are unrelated in size. (a) Reach: move the split out of the warning path into a first-class campaign action reachable from the campaign list, and widen the trigger beyond ca_local/500 to any volume that would hit a sender limit, not just a Canadian local number. (b) Automation: make the copy actually vary per segment — a per-segment message variant, or a merge field carrying the segment index — instead of asking the operator to vary it by hand and hoping. This is the one with real value, because identical copy across segments is exactly what the warning claims to be avoiding. (c) Correctness: confirm the behaviour when a send is already in flight at split time, and whether each clone's results roll up to the parent or stand alone. Recommend (b) as the highest-value reading of 'expand', with (a) as a cheap follow-up, and (c) answered by whoever wrote the split before either lands. Do not start work before the reporter picks one: the three have nothing in common, and the issue as filed does not say which is wanted.
- Look in: `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx (the whole feature: the alert, the sheet, the checklist, the split submit)`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx:211-226 (the only render site)`, `app/lib/throughput-config.ts:102-108 (isBulkSmsSenderMisaligned: ca_local and >= 500)`, `test/ui/split-campaign-override.test.tsx (existing coverage of the override path)`, `app/lib/campaign-split.server.ts or splitMessageCampaign (the server side named in the component's doc comment — locate it before scoping any change)`
- Existing tests: test/ui/split-campaign-override.test.tsx (the bulk-on-local override and its acknowledgement)
- Missing tests: the split itself is not covered end to end: no test asserts the contacts are distributed across the clones or that the clones are created with the requested segment count; no test asserts the clones are reachable and correctly scoped to the workspace; if copy variation is automated, no test asserts the variants differ per segment; no test covers a split taken while a send is in flight
- Done when: The reporter has stated which expansion is wanted; The chosen scope is written into the issue before work starts; If the split is promoted, it is reachable outside the bulk-send warning and its trigger is documented; If copy variation is automated, the clones differ in the copy that reaches the carrier; The behaviour of a split during an in-flight send is documented
- Tracker: Needs decision. The issue as filed is a note to a person plus a screenshot, and the three plausible readings are unrelated in size and risk. Cheapest next step is a one-line question to the reporter. If the answer is copy automation, that is a real feature worth doing and should be specced properly; if the answer is reach, it is a small change on top of existing tests.

### [#1996](https://github.com/chester-hill-solutions/callcaster/issues/1996) Decide whether a daily full PII snapshot ships, into which bucket, with what retention and who can restore it
- Verdict: **Needs decision** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Canonical for the daily backup work; #1773 was folded in here as a duplicate. The code half is fully mapped and none of it is built, so the engineering risk is low and the open questions are product and data-protection ones. Every integration point the issue names exists: the job type constant file (app/lib/worker/job-types.server.ts), the params and registry (app/lib/worker/job-params.server.ts, app/lib/worker/handlers.server.ts), the cron handler pattern (app/lib/worker/handlers/cron.server.ts) with withReschedule from handlers/shared.server.ts, the per-workspace error isolation fanout (app/lib/cron-workspace-fanout.server.ts), the CSV serializer (app/lib/rpc-csv.server.ts rowsToCsv, app/lib/csv.ts escapeCsvCell), and the object-storage bucket union (app/lib/object-storage.server.ts ObjectStorageBucket, which today has no 'backups' member). ONE FACTUAL DRIFT to correct in the issue: it says 27 tenant tables and AGENTS.md says 26; WORKSPACE_SCOPED_TABLES in app/db/workspace-scoped-tables.ts currently has 28. Enumerate the table list from the constant rather than from either number, so the snapshot cannot silently miss a table. The unresolved decisions are below.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. Nothing is built. There is no backups bucket in the ObjectStorageBucket union, no backup job type in app/lib/worker/job-types.server.ts, no backup handler in the worker registry, and a repo-wide search for a backup job name, a backups bucket env var or a retention env var returns nothing. The four questions in the issue - scope, bucket, retention, restore - are all still unanswered.
- Root cause: The backup system was never ported; the gocanvass blueprint it copies is described in the issue and nothing in CallCaster implements it.
- Resolution: All four questions need an answer before any code: does a daily full PII snapshot ship at all, into which bucket, with what retention, and who can restore it. The bucket union, the job type registry and the worker handler registry are the three places the implementation would land, and none of them has a placeholder today. A PII snapshot is a compliance artifact, so decide the retention and the restore path with the same care as the snapshot itself.
- Look in: `app/lib/object-storage.server.ts:15-21 (the bucket union, no backups bucket)`, `app/lib/worker/job-types.server.ts (nine job types, no backup job)`, `app/lib/worker/handlers.server.ts:107-237 (the handler registry, no backup handler)`
- Existing tests: test/job-registry.test.ts (guards registry drift — a new job type must be registered here); test/worker-cron-handlers.server.test.ts (the pattern for handler tests); test/call-recording-storage.server.test.ts and test/object-storage-upsert.test.ts (the pattern for storage-adapter tests)
- Missing tests: no test asserts a snapshot contains every table in WORKSPACE_SCOPED_TABLES — a new tenant table would silently not be backed up; no test asserts the daily dedupe key prevents a second run on the same UTC day; no test asserts that one workspace failing does not error the whole job; no test asserts the manifest is written and lists the files it claims to; no test asserts pruning removes date keys older than the retention and leaves newer ones, including a partial run's directory; no test asserts a resumed or retried run is idempotent; no test asserts retention configuration is validated (a zero or negative BACKUP_RETENTION_DAYS must fail closed, not delete everything)
- Done when: The four decisions above are answered and recorded in the issue; A workspace gets a dated snapshot in object storage at most once per UTC day; The snapshot list is generated from WORKSPACE_SCOPED_TABLES, and a test fails when a tenant table is added without being handled; Per-workspace failures are isolated and reported, and any failure errors the job; A manifest lists what was written, and pruning removes only date keys older than the configured retention; An invalid retention configuration fails closed; The access and deletion story for the snapshot bucket is documented alongside whatever restore path is decided
- Tracker: Needs decision before implementation, then it is well-specified work. The engineering is a known pattern in this repo, but shipping a daily full copy of customer PII with a 30-day retention, no access story and no restore path is a decision with an owner, not an implementation detail. Ask the four questions in one go; do not start by writing the job handler, because the answers change which tables the handler walks and where it writes.

### [#1880](https://github.com/chester-hill-solutions/callcaster/issues/1880) Decide: adopt Jev (TypeSafe) or hand-roll IVR speech intent
- Verdict: **Needs decision** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Roadmap investigation to replace the vx-any catch-all with structured intent routing via Jev's Choice primitive. Open questions: round-trip latency, per-call/step cost, service boundary, transcript-only vs audio input, EN/FR calibration, failure mode, confidence threshold. Its answer decides #1862 and the deferred confidence slice of #1875.
- Current behavior: vx-any matches any speech longer than 2 characters; no intent classification and no confidence. #1875 slice B stores { value, raw, inputType } only; language defaults en-US.
- Root cause: No intent-classification layer exists; the choice is between a calibrated service and a local normalizer/matcher.
- Resolution: Run the evaluation as a spike: benchmark latency and cost per step, test EN/FR calibration, pick a service boundary and fallback, and record a decision with an ADR. Then either open the Jev integration ticket or unblock #1862 as a hand-rolled matcher.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/lib/ivr-gather.server.ts`, `app/lib/ivr-webhook-auth.server.ts`, `docs/adr/`
- Existing tests: test/ivr-gather.test.ts
- Done when: Latency, cost, bilingual calibration, and failure-mode answers recorded; A decision: adopt Jev or hand-roll, with a named service boundary; #1862 and the #1875 confidence slice unblocked or closed accordingly
- Tracker: needs-decision/roadmap spike. Keep vx-any as-is until answered; its outcome decides #1862.

### [#1659](https://github.com/chester-hill-solutions/callcaster/issues/1659) Admin: Twilio cost breakdown per workspace/account
- Verdict: **Needs decision** · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-09-25
- Twilio cost breakdown could mean workspace ranking, more detail within one workspace, or both.
- Resolution: Confirm the intended view before implementation. Reuse existing usage projection.
- Look in: `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.UsagePanel.tsx`

### [#1521](https://github.com/chester-hill-solutions/callcaster/issues/1521) decision(billing): should Stripe refunds/disputes reverse credits?
- Verdict: **Needs decision** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Refunds and disputes do not reverse credits under the current documented billing scope.
- Resolution: Choose automatic reversal or an explicit manual policy before changing ledger behavior.
- Look in: `app/routes/api+/stripe-webhook.action.server.ts`, `docs/billing-source-of-truth.md`

---

## Blocked / split first — 35

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

### [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) Receipts: state how many credits were bought
- **IN PROGRESS** · Verdict: **Blocked / split first** · Type: Change Request · Priority: Medium · Effort: Low · Environment: dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-19
- Receipts still show a package as one item. Native dependency #2700 is open; preserve the existing receipt-quantity branch until the Stripe environment is ready.
- Current behavior: At dev@0b73c943, Checkout uses quantity 1 and puts the credit count in the product name. This is the alternative rejected in the issue comments.
- Root cause: PR #1997 did not implement the requested quantity. The existing change-request/1981-credit-receipt-quantity branch remains at 8225f5ce77a47c631595c718a42ea7b570bf1843 and is not merged.
- Resolution: Complete #2700 first. Reuse and review the existing quantity branch against current dev, then verify the actual sandbox receipt and once-only credit fulfillment before promotion.
- Look in: `app/lib/platform-billing.server.ts`
- Blocked by: [#2700](https://github.com/chester-hill-solutions/callcaster/issues/2700)
- Existing tests: Current unit coverage checks the Checkout request payload, not the actual receipt. The saved branch and its current remote head were confirmed on 2026-11-01.
- Missing tests: A sandbox purchase must show Workspace credits with the number bought as quantity, preserve the package total, and credit the correct workspace exactly once. Include the largest 25,000-credit package.
- Done when: The receipt uses the purchased credit count as quantity.; The charge total and once-only workspace fulfillment remain correct.; The actual sandbox receipt is reviewed before the requirement is accepted.
- Tracker: Native Project Status is In progress, read on 2026-11-01. Type Change Request, Priority Medium, Effort Low, Enviornment dev, assigned to @sai-sy. Open blocker #2700 remains; historical #2699 and parent #1322 are closed. Preserve ownership and the existing branch; do not start a duplicate fix.

### [#1983](https://github.com/chester-hill-solutions/callcaster/issues/1983) Receipts and charges should include tax
- Verdict: **Blocked / split first** · Type: Change Request · Priority: High · Effort: Medium · Environment: unset · Size: M · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-15
- The owner already specified 13% Ontario tax. The open Stripe environment prerequisite #2700 blocks implementation and receipt acceptance.
- Current behavior: At dev@0b73c943, Checkout declares tax_behavior exclusive but supplies neither automatic_tax nor tax_rates. No tax is added by this request.
- Root cause: The Checkout flow does not calculate or attach tax. The native issue is explicitly blocked by #2700; the rate itself is not an unanswered decision.
- Resolution: Wait for the human owner to complete #2700. Then implement and verify the stated 13% Ontario tax requirement in the chosen sandbox, after checking tax registration and Stripe configuration. Preserve the purchased credit amount and once-only fulfillment.
- Look in: `app/lib/platform-billing.server.ts`, `test/platform-billing-checkout.test.ts`, `docs/stripe-environments.md`
- Blocked by: [#2700](https://github.com/chester-hill-solutions/callcaster/issues/2700)
- Existing tests: Source inspection confirms exclusive pricing without an enabled tax calculation. No real sandbox charge or receipt proves the requested tax.
- Missing tests: Verify the tax line, pretax amount and final total on the actual sandbox receipt, plus the purchased credits and once-only fulfillment.
- Done when: The supported Ontario purchase includes the stated 13% tax and shows it on the receipt.; The credit quantity and fulfillment remain correct.; The chosen account configuration and actual sandbox receipt are verified before release.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status Backlog. Native Type Change Request, Priority High, Effort Medium, Enviornment unset; assignee @wra-sol. Parent #1322 (closed). Children: none. Native open blockers: #2700. Human-only #2700 remains the open prerequisite. Do not ask for the tax rate again.

### [#2700](https://github.com/chester-hill-solutions/callcaster/issues/2700) Align Stripe workspaces across environments
- Verdict: **Blocked / split first** · Type: Task · Priority: High · Effort: unset · Environment: dev · Size: M · Risk: high · Labels: question · Assignee: @sai-sy · Updated: 2026-11-01
- Human-only task, as directed by the user. The audit records the current account map; sandbox setup, customer mapping and fulfillment acceptance remain with the human owner.
- Current behavior: On 2026-11-01, dev and QA use test account acct_1QRvDwFzTNqbqKww; production uses live account acct_1QxCXMCKD626kdKP. App and worker agree within each environment. The shared test account has zero webhook endpoints; production has one enabled Checkout-completed endpoint.
- Root cause: The required dedicated dev sandbox has not been established. Present webhook-secret variables do not prove a matching endpoint, and existing customer IDs belong to the current account.
- Resolution: Skip agent execution. The human owner must select and configure the sandbox, arrange account access, review customer-reference mapping, align app and worker, configure the webhook and verify once-only fulfillment. Do not request another account choice or CLI login. Keep #1981 and #1983 blocked until acceptance.
- Look in: `docs/stripe-environments.md`, `app/lib/platform-billing.server.ts`, `app/lib/database/stripe.server.ts`, `app/routes/api+/stripe-webhook.action.server.ts`
- Existing tests: Read-only Railway config and Stripe GET /v1/account checks confirm account/mode agreement. The full webhook endpoint inventory confirms zero test endpoints and one enabled live endpoint.; Read-only database and customer API checks: dev 35 real customer IDs resolve plus one synthetic fixture; QA 28 resolve plus one synthetic fixture; production all seven resolve. Most old customers have no workspace metadata, so complete ownership matching is not proven.
- Missing tests: The intended parent account and dedicated dev sandbox are not confirmed. Sandbox inventory requires an authorized live-account CLI profile.; Webhook signing-secret matching, Sai access and an actual sandbox purchase with one correct workspace fulfillment remain unverified.
- Done when: Production, QA and dev account or sandbox IDs and dashboard links are documented and confirmed.; Dev has a dedicated sandbox; app, worker, webhook and customer references match it.; A sandbox purchase credits the intended workspace exactly once and produces a reviewable receipt.; Sai can access the intended dashboard for the existing receipt work.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status Backlog. Native Type Task, Priority High, Effort unset, Enviornment dev; assignee @sai-sy. No parent. Children: none. Native open blockers: none. Human-only per the user. Keep @sai-sy as owner and #1981/#1983 blocked. The audit is not sandbox acceptance.

### [#1165](https://github.com/chester-hill-solutions/callcaster/issues/1165) Prune stale non-production Twilio resources safely
- **IN PROGRESS** · Verdict: **Blocked / split first** · Type: Feature · Priority: Urgent · Effort: Medium · Environment: unset · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-19
- Closed-preview TwiML App cleanup and the #2757 inventory repair are on dev. Broader resource cleanup still needs a complete readable inventory and the #2029 retention decision.
- Current behavior: PR #2758 uses subaccount Messaging Services credentials, reads all SDK pages and fails on unreadable inventories. Its recorded live scan stopped on a suspended subaccount with HTTP 401; that failure is not an empty resource list.
- Root cause: The report omission is repaired. Workspace-owned resource removal, unreadable-account handling and retention approval remain separate work; unknown ownership does not prove that a resource is unused.
- Resolution: Keep unreadable and unverified resources protected. Resolve inventory access and the #2029 retention policy before another cleanup. The existing closed-preview App deletion path does not cover workspace numbers, Messaging Services or subaccounts.
- Look in: `scripts/twilio-resource-prune-report.mjs`, `scripts/lib/twilio-resource-prune-policy.mjs`, `scripts/local/prune-environment-twiml-apps.mjs`, `scripts/lib/live-environments.mjs`
- Blocked by: [#2757](https://github.com/chester-hill-solutions/callcaster/issues/2757), [#2029](https://github.com/chester-hill-solutions/callcaster/issues/2029)
- Existing tests: PR #2758 records 38 focused cases, including the real SDK boundary, pagination and failed reads.; The policy suite covers environment, ownership and keep-list guards. No current evidence authorizes broader live deletion.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status In progress. Native Type Feature, Priority Urgent, Effort Medium, Enviornment unset; assignee @wra-sol. Parent #1158 (closed). Children: #2029 (open), #2757 (open). Native open blockers: #2029, #2757. Native open blockers #2757 and #2029 remain; #2757 code is on dev but broader cleanup is not accepted.

### [#2168](https://github.com/chester-hill-solutions/callcaster/issues/2168) Cull old dev numbers and workspaces: backfill subaccount names and record the keep-list in the repo
- Verdict: **Blocked / split first** · Type: unset · Priority: Urgent · Effort: Medium · Environment: unset · Size: S-M · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- The keep-list now lives in the repo and is enforced by PR #2536 on dev. Name backfill and the repeat-policy decision remain; workspace-row cleanup stays deferred.
- Current behavior: The confirmed keep-list is enforced by PR #2536 (7f2c2f9a). The issue records the historical 19-number cull. PR #2537 (41a1308d) only updated board evidence; it did not implement name backfill. Current scripts provide read-only reports and closed-preview App cleanup, but no legacy subaccount rename command.
- Root cause: No tooling existed to decide what could be culled, and no recorded rule to make the decision repeatable. The name-fragment junk exclusion is deliberately a --exclude flag rather than hardcoded, because it is a judgement call rather than a rule.
- Resolution: Implement a separate idempotent name-backfill plan from the existing naming helper and ownership evidence. Default to dry-run, require an explicit environment and owner match, and review the exact rename list before provider writes. Record the one-off versus recurring policy before scheduling cleanup. Workspace-row cleanup remains deferred.
- Look in: `scripts/cull-keep-list.mjs (the confirmed keep-list, shipped)`, `scripts/cull-report-policy.mjs:8-24 (the keep-list wins first)`, `app/lib/database/workspace-twilio-subaccount.server.ts:39-62 (workspaceResourceName, create path only)`, `scripts/twilio-resource-prune-report.mjs (resolves legacy names to their owner workspace)`
- Existing tests: cull-report.mjs handles 555-number test credentials, the E911 VERIFY line, cross-workspace-only blockers, and compares dates rather than strings; test/cull-report-policy.test.ts confirms the three recorded workspace IDs and proves 2608141501 survives the phone-name cull rule
- Missing tests: Name backfill must be idempotent.
- Done when: Subaccount display names are backfilled to the #2167 format; The keep-list lives in the repository, not a shell argument; 2608141501 survives, since it is on both the keep-list and the phone-number-named rule; The cull report remains read-only with no delete path
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status on-dev. Native Type unset, Priority Urgent, Effort Medium, Enviornment unset; assignee @wra-sol. Parent #2029 (open). Children: #2931 (open). Native open blockers: none. Native Type is unset. Backfill needs implementation and reviewed provider-write acceptance; keep-list is delivered. No cleanup was run in this refresh.

### [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157) epic(testing): controlled synthetic campaign audiences
- **IN PROGRESS** · Verdict: **Blocked / split first** · Type: Feature · Priority: High · Effort: High · Environment: unset · Size: L-XL · Risk: high · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-17
- The requested voice, SMS and IVR test outcomes are not all implemented. The approved SIM program is #2782; closed child counts do not prove acceptance.
- Current behavior: The current SIM flow covers explicitly requested real SMS. The voice/SIP scenarios and their run binding remain in later program stages. Historical children #1191, #1192 and #1193 have different closure reasons.
- Root cause: #1192 is NOT_PLANNED, #1193 is DUPLICATE, and #1191 was folded into #1329. A 3/3 child count is not delivery evidence.
- Resolution: Follow the existing #2782 sequence. Finish the Stage 1 profile and SMS prerequisites before voice/SIP work. Verify all eight requested outcomes; do not restart closed children or run paid traffic as part of a board review.
- Look in: `docs/synthetic-telephony-testing.md`, `e2e/sim/`, `app/components/audience/AudienceUploader.tsx`
- Existing tests: The current SMS flow has safety checks; it is not evidence that all requested voice and IVR outcomes exist.
- Missing tests: Acceptance for answer/talk, voicemail, SMS delivery/failure, invalid phone, complete IVR, unanswered IVR and partial IVR.
- Done when: All eight requested outcomes have evidence under the approved SIM program.; Real provider traffic requires explicit authorization and the program safety checks.; Record setup time, callback delay, completion and throughput for each supported scenario.
- Tracker: Selected snapshot, 2026-11-01 UTC: actual Project Status In progress. Native Type Feature, Priority High, Effort High, Enviornment unset; assignee @sai-sy. Parent #1155 (closed). Children: #1191 (closed), #1193 (closed), #1192 (closed). Native open blockers: none. Keep @sai-sy as owner. Closed children are not proof of delivery.

### [#2002](https://github.com/chester-hill-solutions/callcaster/issues/2002) epic(authz): permission-based authorization instead of role checks
- Verdict: **Blocked / split first** · Type: Feature · Priority: Medium · Effort: Medium · Environment: unset · Size: XL · Risk: high · Labels: ux, business-logic · Assignee: @wra-sol · Updated: 2026-10-15
- Parent of the authorization cluster. The product currently gates on three broad roles — Admin sees and edits everything, Coordinator sees and edits campaigns and agents, Agent can join campaigns — and the request is to move to permissions applied to people, with the existing roles kept as default groupings. Explicitly excludes UX around building grouped access policies: plan and implement the permission model first.
- Current behavior: Access is decided by comparing a role string. Route loaders and actions check the role, not whether the specific action is permitted.
- Root cause: Authorization was modelled as a role comparison from the start and every check since has followed that shape.
- Resolution: #2030 reported on 2026-10-19 (docs/adr/0039-role-checks-become-capability-checks.md): extend the capability layer that already exists in app/lib/capabilities.ts and the shared CHS auth packages, and do not adopt the better-auth admin or organization plugins. The vocabulary is therefore settled, so #2008 can be specified, #2009 builds on #2008, and #2031 is the codebase-wide consistency sweep that lands last because it depends on the model existing everywhere.
- Look in: `app/lib/admin-middleware.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/auth-layout.server.ts`, `eslint.config.mjs (no-restricted-imports, tenant boundary)`
- Missing tests: permission model exists; each permission has a test at the route that enforces it
- Done when: A permission model exists that roles map onto as default groupings; Authorization checks a permission rather than comparing a role string; Existing roles continue to work as groupings without a migration per user; No route is left checking a broad role where a specific permission is meant
- Tracker: Parent epic. Explicitly out of scope per the issue text: the UX for building grouped access policies. #2030 has reported (docs/adr/0039-role-checks-become-capability-checks.md), so specification can begin; do not re-run the options analysis.

### [#1873](https://github.com/chester-hill-solutions/callcaster/issues/1873) Call recording: workspace recording policy + campaign opt-in, wired into IVR/predictive/test dials
- Verdict: **Blocked / split first** · Type: Feature · Priority: Medium · Effort: Medium · Environment: unset · Size: L · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-02
- The recording pipeline exists, but workspace policy, campaign opt-in and IVR/predictive/test-call wiring are absent. The issue spans schema, dial paths and disclosure rules.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The recording pipeline exists, but workspace policy, campaign opt-in and IVR/predictive/test-call wiring are absent. The issue spans schema, dial paths and disclosure rules.
- Root cause: Recording was built for specific agent call paths. The workspace/campaign policy model and other dial families are not yet wired; the issue combines several release units.
- Resolution: Split policy/schema, dial-path recording and disclosure into separate changes. The optional disclosure model is stated in the issue; the jurisdiction gate and transcription scope still need exact requirements. #1989 is a separate, confirmed callback defect.
- Look in: `app/lib/campaign-test-call.server.ts:105`, `app/lib/twilio-ivr-runtime.server.ts:20`, `app/db/schema-campaign.ts:1`, `app/routes/api+/call.action.server.ts`, `app/routes/api+/recording.action.server.ts`, `app/lib/call-recording-storage.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/lib/auto-dial.server.ts`, `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`, `app/db/schema-campaign.ts`, `app/lib/coaching-schemas.ts`
- Existing tests: test/recording.route.test.ts; test/webhook-side-effects.test.ts:445-560; test/call-recording-storage.server.test.ts; test/batch-transcription-gating.test.ts; test/api-call.route.test.ts:106 (dial record attrs)
- Missing tests: Check policy disabled, campaign opt-out, each supported dial path, callback persistence and disclosure before enabling recording.
- Done when: Workspace recording policy and campaign opt-in gate every supported recording path.; Enabled IVR, predictive and test calls persist audio through the recording callback.; #1989 callback work is verified separately.; Optional disclosure behavior and jurisdiction gating requirements are recorded before rollout.
- Tracker: Blocked / split first: multiple dial families and policy requirements; keep #1989 available as a separate fix.

### [#2031](https://github.com/chester-hill-solutions/callcaster/issues/2031) Sweep: authorization checks a permission, not a broad role
- Verdict: **Blocked / split first** · Type: Task · Priority: Medium · Effort: Medium · Environment: dev · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The codebase-wide consistency pass: every authorization check should test the underlying permission rather than comparing a broad role. Thin on its own — it is a consequence of the model, not a design.
- Current behavior: Checks are inconsistent, comparing roles in some places and something narrower in others.
- Root cause: Each check was written locally against whatever was convenient at the time.
- Resolution: #2030 is done (docs/adr/0039-role-checks-become-capability-checks.md). The sweep still waits on the rest of the cluster: a sweep before the model exists would have nothing correct to sweep toward. Land it last. Use the existing structural gates rather than grep alone — check:route-authz is the natural home for an assertion that no route compares a raw role string, and a lint rule would keep it from regressing.
- Look in: `app/lib/**-middleware.server.ts`, `scripts/checks/check-route-authz.mjs`, `eslint.config.mjs`
- Blocked by: [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008)
- Existing tests: check:route-authz structural gate
- Missing tests: a gate that fails when a new route compares a role string directly
- Done when: No route or loader compares a broad role string where a permission check is meant; check:route-authz fails when a new role comparison is introduced; The sweep lands after the model, not before
- Tracker: #2030 reported (docs/adr/0039-role-checks-become-capability-checks.md); still deliberately last. Sweeping checks before the model exists is how you end up rewriting the same lines twice.

### [#2009](https://github.com/chester-hill-solutions/callcaster/issues/2009) Agent ABAC: adding an Agent to a campaign unlocks that campaign type for them
- Verdict: **Blocked / split first** · Type: Feature · Priority: Medium · Effort: Medium · Environment: dev · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- The attribute-based half of the cluster. Adding an Agent to a specific campaign should also unlock their broader ability to see and act on that campaign type: added to a live-call campaign, it appears on their list and is callable if open; added to an SMS campaign, its numbers become visible on the chats page.
- Current behavior: Campaign membership is a relation, but it does not appear to confer the broader capability, and the broader capability does not appear to be scoped back down to the campaigns they are actually on.
- Root cause: Two separate concerns — which campaign types you may touch, and which campaigns within a type — are not expressed in the same model, so membership cannot imply the first.
- Resolution: Blocked by #2008, which defines the type-level capability set this refines. Two distinct grants are needed and they must not be conflated: a type-level capability from the role defaults, and a campaign-level grant from membership. The test that matters is negative — an Agent with access to one SMS campaign must not see another campaign's numbers.
- Look in: `app/db/schema.ts (campaign membership relation)`, `app/lib/workspace-middleware.server.ts`, `app/routes/workspaces+/$id/**/chats`, `app/components/**/CampaignList`
- Blocked by: [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008)
- Missing tests: membership grants visibility of exactly that campaign; an Agent on one SMS campaign cannot see another campaign numbers
- Done when: Campaign membership confers a campaign-level grant; An Agent sees only the campaigns they are on, within the types they may touch; The negative case is tested: one campaign membership does not leak another campaign; Type-level and campaign-level grants are separate and both readable in the code
- Tracker: Blocked by #2008 on purpose — the two are easy to conflate and building this first would bake in the wrong model. The negative test is the one that proves it; without it a permissive implementation looks correct.

### [#1827](https://github.com/chester-hill-solutions/callcaster/issues/1827) Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it
- Verdict: **Blocked / split first** · Type: Task · Priority: Low · Effort: Low · Environment: dev · Size: M · Risk: medium · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-19
- Create a dedicated Twilio account for the dev environment (ideally via IaC) and update dev.callcaster.ca to use it.
- Current behavior: There is no dedicated CallCaster-dev Twilio account; dev falls back to shared or main-account credentials. #1356 is open.
- Root cause: Environment-level Twilio credential separation has not been provisioned; blocked by the DNS/IaC task #1356.
- Resolution: Create the CallCaster-dev Twilio account, store the credentials as dev environment secrets/vars, and update the dev.callcaster.ca config. Then unblock #1826.
- Look in: `.railway/environments/dev.ts`, `.railway/railway.ts`, `docs/twilio-runtime-inventory.md`, `docs/twilio-parent-ops-runbook.md`
- Missing tests: n/a (operations task)
- Done when: CallCaster-dev Twilio account exists and is documented; dev.callcaster.ca uses the dev account credentials; Credentials are stored as secrets/vars, not in the repo; IaC-vs-manual decision is recorded
- Tracker: blocked-epic: #1356 (dev DNS/IaC) first. Confirm the IaC-vs-manual decision when unblocked; this unblocks #1826.

### [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008) Agent role: define the permission surface for calling, messages and handset
- Verdict: **Blocked / split first** · Type: Feature · Priority: Low · Effort: Medium · Environment: dev · Size: M · Risk: high · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The broad policy question behind the cluster. Decide which capabilities an Agent has over live-call campaigns, IVR campaigns and SMS campaigns. The issue proposes defaults of all live-call campaigns, no IVR campaigns, no SMS campaigns, and states that without access those pages must be hidden from the sidebar AND return 403 on a direct attempt. The policy was deferred by the operator on 2026-10-19; the surface findings are filed here so the decision is the only thing left.
- Current behavior: Mapped on dev@24631cc0, 19 October 2026. Agent is the `caller` role (MemberRole.Caller, UI label Agent). The capability matrix in app/lib/capabilities.ts already grants caller `campaigns.read`, `calls.start` and `calls.control`; it also grants `messages.send` to member but not to caller. The catalog has NO per-campaign-type capability at all, so there is currently no way to express live-call versus IVR versus SMS. IVR (robocall, simple_ivr, complex_ivr) and SMS (message) campaigns are served by the SAME routes as live-call campaigns and differ only by campaign.type, so any denial has to be type-aware. Sidebar visibility is 100% hasMinRole; there is no capability check anywhere in the UI.
- Root cause: Authorization was modelled as a role comparison from the start and every check since has followed that shape. The capability layer grew beside it rather than replacing it, and the catalog was never extended to express campaign-type distinctions, so capability-by-capability policy is enforced ad hoc in whichever component happened to check it.
- Resolution: The vocabulary is settled: #2030 reported on 2026-10-19 (docs/adr/0039-role-checks-become-capability-checks.md) and says to grow PRODUCT_CAPABILITIES in app/lib/capabilities.ts rather than invent a second model, and to leave workspace-customized permissions to a later decision. Still needed before enforcement: (1) a confirmed policy - the issue defaults are a proposal, not a decision; (2) new per-campaign-type capability ids, which means adding them to CAPABILITY_CATEGORIES in app/lib/api-key-capabilities.shared.ts and the ProductCapabilityId enum in app/lib/openapi-platform-components.ts, both of which are exhaustive; (3) a workspace-route capability strategy, because app/lib/capability-guard.server.ts is data-plane only and has no workspace equivalent; (4) type-aware enforcement at the campaign list and the campaign detail route, because IVR and SMS share the campaign routes; (5) the sidebar and the route must read the same source, so the nav items and the route guard derive from one capability set; (6) scripts/check-route-authz.mjs must be taught about capabilities, because its regex only recognises hasMinRole and role equality, and the three routes it allowlists for callers (call, handset, chats) are exactly the surfaces in scope.
- Look in: `app/lib/capabilities.ts (PRODUCT_CAPABILITIES, CALLCASTER_ROLE_CAPABILITY_MATRIX, capabilityIdsForRole)`, `app/lib/member-role.ts (MemberRole enum, WORKSPACE_ROLE_RANK, hasMinRole)`, `app/lib/workspace-role-display.ts (Agent = caller, Coordinator = member, Administrator = admin/owner)`, `app/components/workspace/WorkspaceNav.tsx (the real sidebar; the board's WorkspaceSidebar.tsx path does not exist)`, `app/routes/workspaces+/$id.tsx (renders WorkspaceNav, defaults a null role to MemberRole.Member)`, `app/routes/workspaces+/$id/campaigns.route.tsx and campaigns/$selected_id.loader.server.ts (the shared campaign routes)`, `app/routes/workspaces+/$id/handset.loader.server.ts and chats.loader.server.ts (the handset and SMS surfaces)`, `app/lib/capability-guard.server.ts (data-plane only; no workspace-route capability strategy exists yet)`, `app/lib/workspace-route.server.ts and app/lib/workspace-middleware.server.ts (403 shape, membership versus capability)`, `app/lib/database/campaign.server.ts (CampaignType and IVR_CAMPAIGN_TYPES)`, `app/lib/api-key-capabilities.shared.ts and app/lib/openapi-platform-components.ts (exhaustive capability id maps)`, `scripts/check-route-authz.mjs and scripts/lib/route-read-role-floor.mjs (gates that only understand role checks)`
- Existing tests: test/ui/workspace-nav-campaign-caller-gating.test.tsx: asserts the Agent does not see New Campaign, and explicitly asserts the Agent STILL SEES Today, Campaigns, Messages, Call History, Voicemails, Analytics, Handset and Settings; test/capabilities.test.ts and test/capability-actor.test.ts: the role-to-capability matrix and deny-by-default behaviour; test/capability-gated-routes.test.ts and test/data-plane-role-gate.test.ts: data-plane 403 versus 404; e2e/specs/rbac.spec.ts: RBAC-01 asserts the caller nav shows Campaigns and Messages, RBAC-06 asserts the 403 page shape
- Missing tests: each capability has a route-level enforcement test; sidebar visibility and route enforcement agree; a caller denied an IVR campaign gets 403 on a direct URL to that campaign; a caller denied SMS campaigns does not see message-type campaigns in the list
- Done when: The Agent capability set is written down as data, not scattered conditionals; Every denied surface returns 403 on a direct URL attempt, not only when hidden; The 403-versus-404 boundary is decided and documented rather than incidental; Sidebar visibility and route enforcement read from the same source
- Tracker: Unblocked by #2030 (docs/adr/0039-role-checks-become-capability-checks.md). The surface was mapped on 2026-10-19 and the operator deferred the policy decision, so this is the only open question. Do not re-run the options analysis and do not re-map the surface; the findings above are current for dev@24631cc0. The two existing tests that assert the Agent sees Messages and Handset will have to change once the policy is decided, and that change is expected rather than a regression.

### [#1828](https://github.com/chester-hill-solutions/callcaster/issues/1828) QA-environment PR acceptance suite against the smart test audience
- Verdict: **Blocked / split first** · Type: Task · Priority: Low · Effort: Medium · Environment: unset · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Per-PR QA acceptance run: full sign-up through each of the 3 campaign types against the smart test audience, plus unit tests using CallCaster-qa test credentials.
- Current behavior: PRs run the compose E2E gate and a Twilio test-credential tier, but there is no QA-environment full-flow suite against a CallCaster-qa account.
- Root cause: There is no dedicated CallCaster-qa Twilio account or qa environment wiring yet, and #1829 (the account) closed as not planned on 2026-10-17 while #1357 (the qa DNS/IaC half) closed as completed.
- Resolution: Re-scope rather than wait: #1829 closed as not planned, so first decide the QA credential path, then add the QA acceptance workflow and specs — sign up, run the 3 campaign types against the smart test audience, and run the Twilio-tier unit tests with the QA test credentials. #1157 (smart test audiences) still gates the audience half.
- Look in: `.github/workflows/e2e.yml`, `.github/workflows/ci.yml`, `e2e/`, `test/integration-twilio/`, `vitest.integration-twilio.config.ts`
- Blocked by: [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157)
- Existing tests: e2e compose gate; .github/workflows/e2e.yml; test/integration-twilio/twilio-test-credentials.test.ts
- Missing tests: QA-environment full-flow acceptance over the 3 campaign types; Unit tier wired to CallCaster-qa credentials
- Done when: PRs run sign-up through the 3 campaign types against the smart test audience; Twilio unit tests use CallCaster-qa credentials; Failures are attributable to the PR
- Tracker: blocked-epic: #1157 (smart test audiences) still gates the audience half. #1829 closed as not planned on 2026-10-17, so the QA Twilio-account path needs a fresh decision instead of a wait; #1357 already landed.

### [#2213](https://github.com/chester-hill-solutions/callcaster/issues/2213) Correct the remaining temporal column types listed in the schema drift baseline
- Verdict: **Blocked / split first** · Type: unset · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-24
- The guard and campaign_queue/call/message slices are present. The committed baseline still holds 64 remaining temporal mismatches. This is a multi-table program requiring separate table changes, not one atomic fix.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The guard and three slices landed: the campaign_queue, call and message tables now declare their temporal columns as timestamps (3d951645, 6fca427d), and test/integration-db/schema-type-drift.test.ts asserts no column has started lying about being text and that no baselined column has stopped lying. The baseline scripts/baselines/schema-type-drift.txt still holds all 64 entries, so no further table has been sliced. app/db/schema.ts:323 still declares date_updated as text().
- Root cause: The remaining Drizzle declarations model database timestamps as text. The database types already are temporal; these slices normally change model and callers, not database column DDL. The original call/message/campaign_queue slices and tenant write-boundary repair are complete.
- Resolution: The guard and the first three slices are done. The remaining work is mechanical: correct the 64 baselined temporal columns in the same slice-at-a-time pattern, lowering the baseline with each slice, and remove the last text() temporal declaration. The existing guard test already refuses a stale baseline entry, so each slice is provable on its own.
- Look in: `scripts/baselines/schema-type-drift.txt:1`, `test/integration-db/schema-type-drift.test.ts:141`, `app/server/tenant-db.ts:121`, `scripts/baselines/schema-type-drift.txt`, `test/integration-db/schema-type-drift.test.ts`, `test/helpers/schema-drift.ts`, `app/db/schema.ts`, `app/db/schema-campaign.ts`
- Existing tests: test/integration-db/schema-type-drift.test.ts
- Missing tests: Guard exists. Each slice needs behavior tests at Date/write/wire boundaries plus real-Postgres verification; no fresh database count performed here.
- Done when: The temporal drift baseline reaches zero in small table-specific changes.; The existing guard rejects both new drift and stale baseline entries.
- Tracker: Move to Blocked / split first as a multi-table parent. Create table-specific tasks; do not re-implement the guard or completed slices. Related PR evidence: #2231, #2233, #2241, #2244. A PR reference alone does not prove deployed behavior.

### [#1938](https://github.com/chester-hill-solutions/callcaster/issues/1938) Epic: construct the scoped tenant client in middleware and enforce the boundary beyond routes
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Size: S-M · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- Epic: the middleware reuses the scoped tenant client, but the released import guard still skips part of the boundary. It needs splitting into the remaining enforcement slices before any one can be picked up.
- Current behavior: Verified against master@91c4409b and dev@e4bb8ac6 on 2026-10-21. A new app/lib JavaScript module importing @/server/admin-db passes the released guard; equivalent TypeScript probes fail. The old baseline stores file/module presence and cannot detect an extra import in an existing exception.
- Root cause: The guard scans only .ts and uses regular expressions plus a Set. It misses supported module forms and collapses repeated imports into one baseline key.
- Resolution: Parse supported JavaScript/TypeScript files with the existing TypeScript parser. Count static imports, re-exports, dynamic imports, require calls and type imports. Migrate only the pinned base debt and reject new, increased, reduced or stale counts.
- Look in: `scripts/check-unscoped-db-imports.mjs`, `scripts/baselines/unscoped-db-imports.txt`, `test/unscoped-db-imports-guard.test.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`
- Existing tests: test/unscoped-db-imports-guard.test.ts: 46 actual CLI cases; 39 fail and 7 controls pass on the original guard. All 46 pass with the fix.; Pinned dev baseline: the same 84 file/module keys, 85 syntax occurrences; no new source exceptions. Separate fault injections exercise extension coverage, module syntax, counts, stale debt and fixture-root safety.
- Missing tests: Review and merge the candidate, then verify the exact promoted guard before closing.
- Done when: Workspace and nested data-plane routes reuse middleware tdb for plain request-scoped access; documented flat and transaction routes keep their explicit client.; A new app/lib module cannot import an unscoped database client without a counted baseline exception.; Existing exceptions cannot grow; reduced or removed imports require a smaller baseline.; npm run ci:local is green.
- Tracker: Reopened after the JavaScript probe disproved the first closure. Native Type Epic; assigned wra-sol; organization fields unset; all three children closed, no blockers. Live Project Status In progress. Remaining work is code, manual false. Keep open until the complete guard reaches master and is verified.

### [#2887](https://github.com/chester-hill-solutions/callcaster/issues/2887) Dual-lockfile drift gate never compares the two lockfiles, so CI validates a dependency tree the production worker…
- Verdict: **Blocked / split first** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Dual-lockfile drift gate never compares the two lockfiles, so CI validates a dependency tree the production worker image does not install**
- Split first. The drift guard validates Bun against package.json, while CI and production still resolve different provider SDK versions.
- Current behavior: Current source at dev@03c3e15a still runs only bun install --frozen-lockfile --dry-run. Fresh installs confirm Twilio 5.13.1 in npm and 5.4.4 in Bun. The full gate passes despite that difference. .bun-version is 1.2.15, Docker uses 1.3.5, and Dockerfile.worker still omits --frozen-lockfile.
- Root cause: scripts/check-bun-lockfile.mjs implements the dual-lockfile drift gate as `bun install --frozen-lockfile --dry-run` (line 21), and that command compares bun.lock with package.json only: it never reads package-lock.json, even though the script's own header (lines 4-13) states the gate exists because 'Adding or changing a dependency with one package manager leaves the other lockfile stale' and that the failure surfaces 'inside the Railway image build', and its own line 12 claims it fails 'when the two lockfiles disagree'. The two lockfiles are resolved by two different resolvers - npm with `legacy-peer-deps=true` from .npmrc, which ignores peer dependencies, and bun with its own resolver,…
- Resolution: Split resolver-version/worker-freeze alignment, explicit peer/platform comparison rules, the comparison guard, and dependency-family alignment into atomic tasks. Preserve the current peer policy until its change has consumer proof. Do not put a global package upgrade into a targeted security patch.
- Look in: `.github/workflows/ci.yml`, `scripts/check-bun-lockfile.mjs`, `package.json`, `Dockerfile.worker`, `Dockerfile`, `package-lock.json`
- Existing tests: Fresh installed-consumer proofs confirm the live npm/Bun Twilio version difference; the current full CI passes because its Bun guard checks only manifest satisfaction.; The earlier audit measured broad version and package-set differences. Recompute the complete matrix after the targeted patches before defining a parity guard.
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: The drift gate should assert that the dependency tree CI installs and tests (package-lock.json, via `npm ci`) is the same tree the production images install (bun.lock, via `bun install`), so that the artifact which passed install, typecheck, lint and test is the artifact that is deployed. Any divergence between the two resolved trees - including a newer version of a credential-handling dependency landing in only one of them, and a package present in one tree but absent from the other - should fail the build before the image is produced.
- Tracker: 2026-10-28 source review changes the earlier S-sized Fix now verdict: this is a multi-step dependency and CI task. Keep #3071, #3072 and #3073 atomic and require their individual fresh-consumer proofs. General parity remains unresolved.

### [#1269](https://github.com/chester-hill-solutions/callcaster/issues/1269) feat(scriptkit): add provider-neutral interaction document v2 and deterministic reducer
- Verdict: **Blocked / split first** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- Create vendored @chester-hill-solutions/scriptkit-interaction-core: ScriptDocument v2 schemas (send/collect/action/wait/handoff/complete), typed transitions, strict publish validator, deterministic reducer/effects, exact classifier, explicit convertV1ToV2. Provider/framework neutral.
- Current behavior: Only v1 call-script packages exist under vendor/scriptkit; v2 exists only in ADR-0032.
- Root cause: Not implemented.
- Resolution: Build the package only (no persistence/Twilio/React/billing); ship golden fixtures, publish-validation positive/negative, reducer determinism, effect-ID stability, simulator parity.
- Look in: `vendor/scriptkit/`, `docs/adr/0032-interactive-sms-script-document-v2.md`, `docs/interactive-sms-delivery-plan.md`
- Existing tests: none
- Missing tests: v1->v2 golden; publish validation; reducer determinism; effect ID stability; simulator parity
- Done when: All six ops + transitions exported; convertV1ToV2 explicit with stable warnings; Stable error codes; Deterministic reducer for fixtures
- Tracker: Blocks #1272; independent of #1271; can start.

### [#1271](https://github.com/chester-hill-solutions/callcaster/issues/1271) feat(billing): add local message identity and atomic SMS credit reservations
- Verdict: **Blocked / split first** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- Give message a local domain-id PK with nullable indexed twilio_sid (rows before provider dispatch) and an atomic PL/pgSQL credit-reservation RPC with settle/reconcile.
- Current behavior: message.sid is the required PK; campaign messages created at Twilio before local persistence; no reservation schema/RPC; billing supports idempotent writes but not holds.
- Root cause: Not implemented.
- Resolution: Additive identity migration first, then reservation/settlement migration + service. Reuse apply_ledger_entry_and_sync_credits, shared/pricing.ts, shared/billing-keys.ts.
- Look in: `app/db/schema.ts`, `app/lib/sms-send.server.ts`, `app/lib/transaction-history.server.ts`, `shared/pricing.ts`, `shared/billing-keys.ts`, `client/migrations/`
- Existing tests: none
- Missing tests: message before SID; nullable unique SID; concurrent reservation affordability; idempotent settle/release/reconcile
- Done when: Message row exists before SID; SID nullable + unique when present; Concurrent reservations cannot overspend; Settle/release/reconcile idempotent
- Tracker: Blocks #1272; independent of the v2 editor.

### [#1272](https://github.com/chester-hill-solutions/callcaster/issues/1272) feat(interactive-sms): deliver a flagged exact-match opener-to-follow-up run slice
- Verdict: **Blocked / split first** · Type: User Story · Priority: unset · Effort: unset · Environment: unset · Size: XL · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- B1 vertical slice: publish immutable Revision, create immutable Run, Run-owned queue, claim + Interaction, dispatch coordinator, inbound reply correlation, exact classification, follow-up within windows, typed outcome.
- Current behavior: No script_revision/campaign_run/interaction/interaction_event/interaction_effect schema exists; message has no interaction references.
- Root cause: Not implemented; hard-blocked by A1/A2/A3.
- Resolution: Split into: revision/run schema; interaction persistence; opener dispatch + endpoint correlation; exact classification + follow-up; flagged API/editor/simulator/funnel. Do not assign as one task.
- Look in: `docs/adr/0033-immutable-revision-run-and-audited-interaction-state.md`, `app/db/schema.ts`, `docs/interactive-sms-delivery-plan.md`
- Blocked by: [#1269](https://github.com/chester-hill-solutions/callcaster/issues/1269), [#1271](https://github.com/chester-hill-solutions/callcaster/issues/1271)
- Existing tests: none
- Missing tests: flagged end-to-end slice; no duplicate effects/billing on retries; simulator parity
- Done when: Flagged workspace publishes + launches one run; One queue entry -> one interaction + idempotent opener; Exact reply advances reducer + one follow-up
- Tracker: Keep blocked until all Phase A gates pass.

### [#1268](https://github.com/chester-hill-solutions/callcaster/issues/1268) epic(interactive-sms): ship release-one audited SMS/MMS interactions
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Size: XL · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- Parent epic for interactive SMS/MMS. Milestone A (domain id, single dispatch coordinator, credit reservation, policy) and B (vertical slice). Sub-issues #1269-1272.
- Current behavior: A2 consolidation mostly landed; A1, A3, B1 absent; consent/disclosure tables, flags, and observability have no dedicated child issue; tracking docs stale.
- Root cause: Epic; not single-agent work.
- Resolution: Refresh milestone status in docs/interactive-sms-build-tracking.md; create missing child issues (consent, flags/observability, correlation); keep #1272 blocked until Phase A integrity gates pass.
- Look in: `docs/interactive-sms-delivery-plan.md`, `docs/interactive-sms-build-tracking.md`
- Existing tests: n/a
- Missing tests: release-level suite once implemented
- Done when: Every milestone has owned child issue + dependency; A1-A3 exit gates pass before B1; One flagged workspace completes the slice without duplicate effects/billing
- Tracker: Keep as epic; split before assignment.

### [#1885](https://github.com/chester-hill-solutions/callcaster/issues/1885) Retire the remaining auth schema after dependency verification
- **IN PROGRESS** · Verdict: **Blocked / split first** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: M-L · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- Partial fix only. Dead RPC removal and both actor rewrites are on dev; legacy auth shim remains and the fail-closed schema drop is absent. Issue discussion requires production dependency verification before the drop.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. Chunks 1 and 2 shipped: the dead get_outreach_attempts RPC is dropped and the two live auth.uid() RPCs read app.current_user_id. What is still missing in the current tree: the auth schema still exists (no DROP SCHEMA auth migration), drizzle/0001_auth_uid_shim.sql still creates auth.uid() and scripts/db/bootstrap-fresh-db.mjs still applies it, and there is no dependency guard - a repo-wide search for pg_depend finds nothing. Chunk 3 is written but NOT merged: commit cd00ada0 (fix(db): drop the legacy auth schema with a fail-closed guard (#1885)) on origin/fix/1885-chunk3-drop-auth adds client/migrations/20260922120000_drop_legacy_auth_schema.sql, test/legacy-auth-sql-guard.test.ts and retires the shim in both bootstrap scripts. It is not an ancestor of dev.
- Root cause: The live RPC actor rewrites and dead RPC removal shipped. The baseline shim still creates auth.uid(), and the final dependency guard and schema retirement remain unshipped.
- Resolution: Chunk 3 is already written on origin/fix/1885-chunk3-drop-auth (cd00ada0): a fail-closed DROP SCHEMA auth migration with a dependency guard, the shim retired in drizzle/0001_auth_uid_shim.sql and both bootstrap scripts, and test/legacy-auth-sql-guard.test.ts. It was never merged, so nothing needs to be written. Before it can land, the production dependency and data-retention verification the issue requires has to be recorded, and the schema drop has to ship as its own release step rather than inside a feature PR.
- Look in: `client/migrations/20260920120000_drop_get_outreach_attempts.sql (chunk 1, shipped)`, `client/migrations/20260920120100_rewrite_manual_dial_claim_actor.sql:23 (chunk 2, shipped)`, `client/migrations/20260920120200_rewrite_last_access_actor.sql:18 (chunk 2, shipped)`, `origin/fix/1885-chunk3-drop-auth commit cd00ada0 (chunk 3, written but never merged)`, `drizzle/0001_auth_uid_shim.sql:2 (the shim that chunk 3 retires)`, `scripts/db/bootstrap-fresh-db.mjs:120 (the bootstrap that still applies the shim)`
- Existing tests: test/queue-rpc-contract.test.ts; test/db-rpc-claim-queue-entry.test.ts; test/db-rpc-outreach-attempt.test.ts; test/atomic-manual-dial-claims.integration.test.ts
- Missing tests: test/legacy-auth-sql-guard.test.ts does not exist on dev; it exists only on the unmerged chunk 3 branch; The production dependency and data-retention verification the issue requires is not recorded anywhere
- Done when: A dependency guard fails before any destructive operation when non-auth functions, policies, views or other schema objects still depend on auth.; Production dependencies and data-retention requirements are verified before the schema drop.; Guard and schema drop follow the separate release steps recorded in the issue.; The two rewritten RPC flows retain actor and missing-actor behavior.; A fresh bootstrap does not recreate auth.uid() after retirement.
- Tracker: Lane is blocked-epic: the remaining work is a production verification plus a separate release step, and it touches client/migrations. The implementation is already written on origin/fix/1885-chunk3-drop-auth (cd00ada0) - start from that branch rather than writing it again. Do not merge the schema drop inside a feature PR.

### [#1802](https://github.com/chester-hill-solutions/callcaster/issues/1802) security(deps): remediate open runtime dependency alerts
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-07
- Runtime security is a native Epic with separate package Tasks. Six source fixes are merged: Axios #2336, csv-parse #2338, Scalar SDK #2339, ws #2343, Twilio JWS #2345 and PostCSS #2346. Deployed acceptance and release promotion remain open. At dev@befe20fa, npm production audit is clear and the independently resolved Bun runtime graph has zero affected nodes.
- Resolution: Complete each child’s applicable deployed acceptance and release promotion. Verify fresh audits and the live default-branch alert state before closing the Epic. Do not repeat completed package source work or treat package exposure as a proved app exploit.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Tracker: The Bun mandatory runtime trace resolves 594 nodes, zero missing required edges and zero affected nodes; it excludes vendor devDependencies and optional peer integrations. The most recent 2026-10-04 master snapshot has two runtime alerts (#220, #218) plus 37 development alerts, a separate release view. All six source PRs passed full local CI, exact-head remote gates and both deployments. Keep #1805 and closed #1809 as existing history; all applicable child QA/release requirements remain open.

### [#1878](https://github.com/chester-hill-solutions/callcaster/issues/1878) Surface and select the caller audio on the /call welcome dialog
- Verdict: **Blocked / split first** · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-05
- The session-selected audio feature remains unfinished. The prerequisite shipped: the separately confirmed AMD playback/continuation defect in #2396 was fixed in master (db0e1686) and its issue is closed, so nothing blocks this one now. Complete-query validation is implemented.
- Current behavior: Source audit: dev@eb7bc066, 2026-10-05. The dialog carries a voicemail boolean and no picker; predictive callbacks and agent drop still use campaign defaults. Machine and agent recording choices are session-only. Manual calling keeps its no-AMD policy. The shared verifier now authenticates complete queries, including GET/HEAD semantics. Actual-route follow-up at dev@9f33f3e7 confirmed enabled-drop callbacks request playback twice and next-turn continuation runs before the playback update acknowledgement. The existing drop-off concurrency control passes. The #2396 prerequisite is met; the picker itself is not built.
- Root cause: The call-loader and screen contract lose file identity. The start service and every predictive continuation lack a machine selection. Agent drop resolves a child SID, which does not cover independent predictive recipient legs, and reads the shared default.
- Resolution: The #2396 prerequisite is done. What remains is the feature itself: extend the workspace library and shared Select/FormField composition. Define omitted/default, explicit None and named selections. Keep screen state by workspace/campaign/agent through revalidation; freeze the machine choice at conference start and carry it through every signed callback edge. Keep the agent picker reachable in-call, including after None. Validate existing tenant-owned objects and actor/campaign/conference-bound active recipients before playback; await provider acknowledgement and retain the connected call on failure. Extend the public start OpenAPI contract before validation and generated clients. Do not write campaign or script configuration.
- Look in: `app/components/call/CallScreen.Dialogs.tsx`, `app/components/call/CallScreen.Layout.tsx`, `app/components/call/CallScreen.CallArea.tsx`, `app/hooks/call/useCallScreen.ts`, `app/routes/workspaces+/$id/campaigns/$campaign_id/call.loader.server.ts`, `app/lib/platform-media.server.ts`, `app/routes/api+/audiodrop.action.server.ts`, `app/lib/auto-dial-start.server.ts`, `app/lib/auto-dial.server.ts`, `app/routes/api+/auto-dial/$roomId.action.server.ts`, `app/routes/api+/auto-dial/status.action.server.ts`, `app/lib/openapi-platform-components.ts`, `app/lib/services/hooks-api.ts`
- Existing tests: test/ui/call-screen-dialogs.test.tsx; test/ui/call-screen-callarea.test.tsx; test/audiodrop.test.ts; test/auto-dial-start.server.test.ts; test/auto-dial.server.test.ts; test/auto-dial-room.route.test.ts; test/auto-dial-status.test.ts
- Missing tests: Session file identity/None through every continuation; loader revalidation and separate agents; no shared configuration writes; tenant/object/actor/session refusal before provider updates; provider delay/rejection and retry without ending the call; API schema parity; real shared Dialog/Select/Toaster and stable geometry. Existing AMD replay/acknowledgement findings must be tested explicitly before claiming robust playback.
- Done when: The welcome dialog surfaces the caller audio (name and a way to change it); What is surfaced matches what the dialer actually plays; The choice is session-only and does not write the campaign config
- Tracker: Keep OPEN in Blocked / split first, now for size rather than for a dependency: it is an L at high risk and it needs more than one agent. The #2396 prerequisite shipped, so do not re-do that work. Preserve the session-only selection and media/recipient ownership plan; the original feature criteria are unchanged.

### [#2356](https://github.com/chester-hill-solutions/callcaster/issues/2356) Reconcile audio objects left unattached after campaign update failure
- Verdict: **Blocked / split first** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-04
- Audio upload ownership and attachment reconciliation need a durable protocol before a safe cleanup implementation can ship.
- Current behavior: The audio action has no cleanup after an empty or failed campaign update. A thrown database error can leave commit status uncertain; immediate deletion can remove an attached object. Current source/test evidence does not establish physical orphan counts or crash recovery.
- Root cause: Object upload and campaign attachment have separate acknowledgement/failure boundaries and no durable lifecycle record or reference/deletion coordination.
- Resolution: Validate an upload ownership and attachment reconciliation protocol using existing media/storage/job patterns, then split implementation tasks as needed. Retain uncertain results until authoritative reconciliation and prevent attachment/deletion races. #2355 can proceed independently.
- Look in: `app/routes/api+/media.action.server.ts`, `app/lib/campaign-ivr.server.ts`, `app/lib/handler.server.ts`, `app/lib/object-storage.server.ts`
- Existing tests: Actual-route audit proves storage-call ordering before an empty scoped update; provider/database I/O is stubbed.
- Missing tests: Durable state-transition, uncertain commit, duplicate retry, restart, reference-read failure and reference/deletion race controls with suitable DB/storage integration.
- Done when: Define durable upload ownership and attachment state using existing media/storage and job patterns where they fit. Do not add a route-local garbage collector.; An upload that is known to be unattached can be reclaimed. A confirmed attachment is retained. An uncertain write result is retained until authoritative reconciliation resolves it.; The durable retry/reconciliation record survives a crash after upload or an uncertain database acknowledgement. Unresolved cases remain visible to operators and are retried.; Reconciliation cannot delete an existing or shared object. It verifies owned object identity and current attachment references; coordinate reference checks with supported attachment writes so a new attachment cannot race deletion.; Cleanup failures cannot replace the original user error or falsely report success. They retain actionable operator evidence and durable retry state.; Cover successful attachment, known rejection, uncertain commit, failed reference read, duplicate retries, process restart and a reference/deletion race with real state transitions and appropriate database/storage integration controls.; Verify deployed behavior and release promotion before closing the task. Do not claim physical orphan cleanup from mocked storage calls.
- Tracker: Validate an upload ownership and attachment reconciliation protocol using existing media/storage/job patterns, then split implementation tasks as needed. Retain uncertain results until authoritative reconciliation and prevent attachment/deletion races. #2355 can proceed independently.

### [#2099](https://github.com/chester-hill-solutions/callcaster/issues/2099) Harden public request rate limits
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-04
- Retention source is merged. Trusted public client identity and deployed verification remain separate child tasks.
- Current behavior: PR #2331 merged the indexed one-day retention repair at f877b636d963cf1154fbab81ef45ef1244bc61ec. The actual daily handler prunes bounded batches, protects reactivated rows, logs counts and preserves rescheduling after cleanup failure. #2329 remains open for deployed tick/retention acceptance. #2330 still owns client identity; current source reads leftmost X-Forwarded-For and falls back to unknown. The actual CallCaster ingress and header trust rule remain unverified.
- Resolution: #2329 deployed retention is complete (closed as completed on 2026-10-17). Complete and verify #2330 trusted client identity: test the actual ingress and forged-header controls before selecting a new trusted source, and do not reimplement the merged retention repair. Keep the parent open until #2330 is verified and promoted.
- Look in: `app/lib/platform-rate-limit.server.ts`, `app/lib/platform-rate-limit-db.server.ts`, `app/lib/worker/handlers/cron.server.ts`, `test/integration-db/rate-limit-retention.test.ts`
- Blocked by: [#2330](https://github.com/chester-hill-solutions/callcaster/issues/2330)
- Existing tests: test/integration-db/rate-limit-retention.test.ts; test/platform-api.test.ts; test/auth-catch-all-rate-limit.route.test.ts
- Missing tests: Actual deployed maintenance count/error and retained-row boundary; actual CallCaster ingress, direct/local peer identity, IPv4/IPv6 and forged-header controls in #2330.
- Done when: After the daily job, `rate_limit_bucket` contains no row with `reset_at` older than the retention window.; The prune is covered by a test with rows on both sides of the boundary (kill-check: make the prune a no-op and confirm the test goes red).; The job's row count is logged.; The credential rate limit is not bypassable by varying `X-Forwarded-For` (the related issue's acceptance criteria).
- Tracker: The parent tracks two independent child outcomes. #2329 closed as completed on 2026-10-17; #2330 trusted client identity remains open.

### [#2307](https://github.com/chester-hill-solutions/callcaster/issues/2307) Show onboarding name-save failure once
- Verdict: **Blocked / split first** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Onboarding hides the name form before save acceptance and duplicates returned action failure. Preserve the entered name, retry and genuine field validation.
- Current behavior: Source audit at dev@cb88df8b. The intro submits onContinue; the wizard force-hides it and starts step navigation before server acceptance. Actual route/wizard/hook/root-host tests fail retained pending form, retained name/retry after rejection and single returned result; native required validation, read-only access and the accepted path_selection redirect pass. Generic operation errors also mark the valid name invalid; blank/overlong server validation has no field discriminator.
- Root cause: Premature client intro-session advance races the server result. Generic actionError is rendered again and assigned to the name invalid state without a field contract.
- Resolution: After shared field-error adoption #2311, keep operation failures in one root toast, associate genuine name validation with its field, and let the existing server redirect advance on acceptance. Preserve server onboarding statuses, step targets, provider writes and native/server validation.
- Look in: `app/routes/workspaces+/$id/onboarding.route.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingIntroStep.tsx`, `app/lib/platform-onboarding-handlers.server.ts`, `app/components/ui/form-field.tsx`
- Blocked by: [#2311](https://github.com/chester-hill-solutions/callcaster/issues/2311)
- Existing tests: test/ui/onboarding-intro-step.test.tsx; test/onboarding-save-workspace-name.test.ts; Actual route source-audit reproduction: three regression failures and three passing native validation/permission/accepted-redirect controls.
- Missing tests: Retained input/disabled pending action, failed acknowledgement/retry, field-specific server validation versus operation failures, no replay, actual-browser appearance/update/clear geometry.
- Done when: One visible result for one failed action.; Preserve genuine field validation, permissions, hard gates, entered values and retry.; No page or scroll movement on appearance, update or removal.
- Tracker: Blocked by #2311 (native edge and audited issue body verified on 2026-10-03). Repair the premature client advance within this name-save failure/retry concern; preserve the server onboarding state machine.

### [#2311](https://github.com/chester-hill-solutions/callcaster/issues/2311) Keep validation errors from moving form controls
- Verdict: **Blocked / split first** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Adopt the canonical field-error presentation while preserving correct accessible field association.
- Current behavior: FormField inserts a conditional normal-flow error paragraph; AddAudioSheet also inserts one unassociated local validation row. Shared #125 now has reviewed local source at a4a07e5: owning IDs/ARIA, SSR description, retained drafts, keyboard remedies and modal access. Full workbench/CLI checks and four actual CallCaster shad-cc browser cases pass; original flow fails geometry. Shared merge and consumer implementation/browser acceptance remain pending.
- Root cause: Conditional error rows add layout height; some validation is not associated with the invalid control.
- Resolution: Implement the canonical shared contract in https://github.com/chester-hill-solutions/chester-hill-solutions/issues/125 first. Adopt its reviewed source through the existing vendor and thin FormField adapter; preserve labels, help, stable IDs, values, compound controls, hard validation and remedies. Do not make a second placement engine.
- Look in: `app/components/ui/form-field.tsx`, `app/components/campaign/settings/AddAudioSheet.tsx`, `docs/design-system.md`
- Existing tests: Existing FormField accessibility tests; canonical source audit at shared main@412bb1d.; Reviewed shared local source: 218 workbench tests, five CLI tests, nine focused cases with original/five faults failing and restored source passing. Four narrow/desktop light/dark actual shad-cc cases preserve 18 page/17 dialog landmarks.
- Missing tests: Fresh full shared CI and merge, then actual consumer FormField/AddAudioSheet adoption with input/textarea/compound-control multiple/long-error appearance/update/clear geometry and keyboard remedies.
- Done when: Canonical library owns generic placement and accessibility.; Appearance, update and clearing do not move page landmarks or scroll.; Retain domain validation, hard guards, field/control identity and required remedies.
- Tracker: Blocked by the native cross-repository prerequisite linked above. The local blockedBy array intentionally excludes foreign issue numbers; parent #2300.

### [#2305](https://github.com/chester-hill-solutions/callcaster/issues/2305) Show audio-upload failure once
- Verdict: **Blocked / split first** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Audio upload duplicates the server failure; removing its inline copy is held until the root toast stays accessible inside the open sheet.
- Current behavior: Source audit at dev@cb88df8b. A held local duplicate-removal patch has two actual UI failures because React Aria hides the root toaster ancestor while the sheet stays open; six component/validation/retry controls pass. No green PR or completed fix is claimed.
- Root cause: The same action failure reaches localError and the root toast. The root host is also outside the modal accessibility top layer.
- Resolution: Adopt the reviewed canonical modal-safe root host through #2312, then finish this atomic action-result repair with retained upload data, pending/retry and browser geometry. Local name/file validation is separate #2311 work; do not replace it with generic toasts.
- Look in: `app/components/campaign/settings/AddAudioSheet.tsx`, `docs/feedback-inventory.md`
- Blocked by: [#2312](https://github.com/chester-hill-solutions/callcaster/issues/2312)
- Existing tests: test/ui/audio-upload-feedback.test.tsx in held local commit 8c32e890: two modal accessibility regression failures and six passing controls.
- Missing tests: Consumer modal-safe host adoption in #2312, restored accessible single-result proof, actual-browser geometry and full local/remote green gates.
- Done when: One visible result for one failed action.; Preserve genuine field validation, permissions, hard gates, entered values and retry.; No page or scroll movement on appearance, update or removal.
- Tracker: Blocked by #2312 (native edge verified). Keep the held source and tests; do not push a patch whose only remaining failure result is inaccessible.

### [#2312](https://github.com/chester-hill-solutions/callcaster/issues/2312) Keep modal action feedback accessible through the root toaster
- Verdict: **Blocked / split first** · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Adopt the canonical modal-safe root toast before removing upload failure duplication.
- Current behavior: Actual AddAudioSheet/router/themed-root-toast tests fail two accessibility checks while six controls pass. Shared #126 has a reviewed local canonical fix with 12 generic built-catalog browser cases; it is not merged or adopted. Fresh shared CI remains blocked by shared #122 and #123.
- Root cause: The root toast host is hidden by React Aria modal isolation; removing its inline copy would remove accessible failure feedback.
- Resolution: Implement and merge https://github.com/chester-hill-solutions/chester-hill-solutions/issues/126 after its native CI prerequisites. Adopt its reviewed source with provenance and rebuilt vendor output, one root host, retained theme and actual modal accessibility/isolation/focus/geometry proof.
- Look in: `app/components/ui/sonner.tsx`, `app/components/ui/sheet.tsx`, `app/root.tsx`, `vendor/chester-hill-solutions/shad-cc/`, `docs/design-system.md`
- Existing tests: Held app integration reproduction: two failures and six controls. Canonical shared #126 source proof: six focused/203 workbench tests and 12 browser cases; local prerequisites are not fresh CI acceptance.
- Missing tests: Canonical green merge; consumer source/generated-output adoption; actual app Dialog/Sheet keyboard and narrow/desktop light/dark geometry with modal isolation, retained fields and retry.
- Done when: Canonical library owns generic placement and accessibility.; Appearance, update and clearing do not move page landmarks or scroll.; Retain domain validation, hard guards, field/control identity and required remedies.
- Tracker: Blocked by the native cross-repository prerequisite linked above. The local blockedBy array intentionally excludes foreign issue numbers; parent #2300.

### [#2300](https://github.com/chester-hill-solutions/callcaster/issues/2300) Consistent feedback without page movement
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Size: L · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Shared component ownership and a no-layout-movement rule for all dynamic feedback. Implement through the separate child tasks.
- Current behavior: Rule/inventory PR #2302 and reset-password PR #2310 are merged into dev. Canonical Notice #120, semantic Alert #121 and modal-safe Toaster #126 are reviewed local shared work, not merged/adopted. Notice source uses shared button styles; actual CallCaster shad-cc consumer proof passes four narrow/desktop light/dark cases with no page/scroll movement. Field-error #125 is reviewed local shared source at a4a07e5: 218 workbench tests, five CLI tests and four actual CallCaster shad-cc browser cases pass. Original flow adds 120px at narrow width. Shared source remains unmerged and not adopted. Native consumer children #2311/#2312 cover field placement/modal accessibility; #2305 and #2307 have real prerequisites, and #2306/#2308 remain separate defects.
- Root cause: Message tone, placement and lifecycle were selected independently at each call site.
- Resolution: Ship shared mechanics first, then migrate consumer groups in atomic PRs. Preserve page layout, field association, unresolved conditions, required remedies, confirmation safety and root-only transient feedback. Do not implement this Epic as one large PR.
- Look in: `docs/design-system.md`, `docs/feedback-inventory.md`, `app/components/ui/`, `app/root.tsx`
- Existing tests: PR #2302 full local/remote gates; PR #2310 full local/remote gates and four built-app geometry cases.; Canonical shared source proof is distinct from app adoption and fresh shared CI acceptance.
- Missing tests: Shared component merge and consumer adoption; actual narrow/desktop light/dark browser geometry for each changed dynamic group.
- Done when: Canonical component library owns generic feedback presentation.; No dynamic alert moves page content or scroll.; Consumer groups retain domain actions and hard guards.
- Tracker: Split work through the native child issues; preserve the existing #2032 parent under #2000.

### [#1862](https://github.com/chester-hill-solutions/callcaster/issues/1862) IVR: match spoken/DTMF input to the script's declared options (normalize + fuzzy)
- Verdict: **Blocked / split first** · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Wants caller input matched to a block's declared options in three tiers: exact value, normalized (digit words, yes/no, case/punctuation), then fuzzy against value+label. The issue comment defers intent matching to #1880 and says to keep this as the concrete spec only if #1880 chooses to hand-roll.
- Current behavior: findNextStep compares raw strings exactly: optionValue === input || (input.length > 2 && optionValue === 'vx-any'). A caller who says 'one' against '1' misses; no normalization or similarity layer exists.
- Root cause: The runtime only string-compares Twilio Digits/SpeechResult to option.value.
- Resolution: Wait for #1880's decision. If a service, this is superseded; if hand-rolled, add a pure matcher module (normalize, then fuzzy against value+label, accept one candidate above threshold, re-prompt on ties). Keep the exact fast path and vx-any.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/lib/ivr-gather.server.ts`, `app/lib/ivr-block-runtime.server.ts`
- Blocked by: [#1880](https://github.com/chester-hill-solutions/callcaster/issues/1880)
- Existing tests: test/ivr-block-response.route.test.ts
- Missing tests: one -> 1; press one -> 1; yeah -> yes; ambiguous utterance re-prompts; keypad-only step ignores speech
- Done when: On a keypad-only step, a spoken digit word maps to the matching option; Ambiguous input re-prompts and never invents an option; Speech / vx-any behaviour unchanged; Exact matches add no latency; Recorded raw userInput stays as-is
- Tracker: Blocked on #1880 (service vs hand-rolled). Keep as the spec; do not implement until that decision lands.

### [#268](https://github.com/chester-hill-solutions/callcaster/issues/268) i18n epic: fr-CA as the first locale (6 slices, one PR each)
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Size: XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Multi-PR epic reviving #268. Decisions recorded (React Aria I18nProvider + @react-aria/i18n; react-i18next + remix-i18next JSON catalogs; per-user locale with workspace default en-CA; per-campaign campaign.language; explicit /fr/* marketing routes; sign-in as slice 1). Nothing is implemented.
- Current behavior: English-only app with locale-naive formatting and no locale column on user, workspace or campaign.
- Root cause: No i18n framework or locale resolution was ever added.
- Resolution: Run the six published slices as separate PRs, starting with foundation + sign-in. Split them into child issues so each lands independently.
- Look in: `app/root.tsx`, `app/lib/types.ts`, `app/lib/tts-voices.ts`, `app/routes.ts`, `package.json`, `app/lib/low-credit-notify.server.ts`, `app/lib/billing-reconciliation-alert.server.ts`, `app/lib/send-reset-password-email.server.ts`
- Missing tests: catalog parity - every key present in every locale; locale resolution - user pref, then workspace default, then en-CA; /fr/* routes and hreflang; ICU plural handling for French
- Done when: A signed-in operator can switch to French and UI, dates and numbers render in fr-CA; Outbound voice, SMS and email can be French per campaign; A missing-translation check fails CI
- Tracker: Split first: open six child issues (one per slice) linked to this epic; slice 1 (foundation + sign-in) can start immediately. Do not attempt in one PR.

### [#1861](https://github.com/chester-hill-solutions/callcaster/issues/1861) Spike: replace Twilio AMD with a local, faster voicemail classifier
- Verdict: **Blocked / split first** · Type: Task · Priority: unset · Effort: unset · Environment: unset · Size: XL · Risk: high · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Investigation spike to keep, replace, or front-run Twilio AMD. Acceptance requires measured time-to-first-audio and accuracy on the same call set; both prerequisites (#1842 instrumentation, #1845 live AMD scope) landed on 2026-10-17.
- Current behavior: Every outbound path sends synchronous machineDetection: 'Enable'. No async AMD, no local classifier, no shadow mode.
- Root cause: Synchronous AMD adds seconds of dead air and caps accuracy at Twilio's engine; there is no measured baseline.
- Resolution: Both prerequisites landed on 2026-10-17 (#1842, #1845), so run the spike: measure Twilio async AMD and one local/managed option on the same call set, evaluate the media-stream fork limit, write the report and an ADR with the accuracy/latency threshold, then a phased shadow-mode plan.
- Look in: `app/lib/auto-dial.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/routes/api+/dial/status.action.server.ts`, `app/db/schema.ts`, `docs/adr/0030-media-stream-bun-service-third-railway-process.md`, `docs/live-transcription-coaching-plan.md`
- Missing tests: Measured time-to-first-audio for sync vs async AMD and a local classifier; Classifier accuracy on human/machine/screening/beep/silence/fax; Media-stream fork/concurrency budget at target volume
- Done when: Written report with measured latency and accuracy for Twilio async AMD and one local option on the same call set; Recommendation with an accuracy-latency threshold and reconciliation/fallback policy; If replacing: an ADR and a phased plan starting in shadow mode
- Tracker: #1842 and #1845 landed on 2026-10-17, so the spike is unblocked. Run it scoped; produce an ADR before any implementation.

### [#1498](https://github.com/chester-hill-solutions/callcaster/issues/1498) [Feature]: Add campaign export report with toplines and reply conversations
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The export report needs toplines, inbound replies, contact grouping, attribution and tenant-safe filtering. This is a feature program, not a release cleanup.
- Resolution: Split metrics and conversation projection from artifact presentation; establish scope and fixtures before implementation.
- Look in: `app/lib/campaign-export.server.ts`

### [#2057](https://github.com/chester-hill-solutions/callcaster/issues/2057) epic(auth-pages): sign-in and sign-up share one layout, copy and error treatment
- Verdict: **Blocked / split first** · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Size: M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Six filed sign-in/sign-up issues (#2010, #2011, #2012, #2013, #2014, #2015) are one piece of work on one pair of pages. Filed as loose tickets they guarantee a churn loop: fix alignment (#2013), the scrollbar returns (#2010), add the mural (#2011), and the box is off-centre again. Created 2026-09-25 during board triage, when all six sat unenriched in Needs triage.
- Current behavior: The two pages drift independently: different centring, different form width, different padding, one has a mural and the other does not, and two different copy treatments.
- Root cause: No shared form container between the pages, so every layout change is made twice and any one change can undo the other.
- Resolution: Land #2013 first as the shared baseline. Then treat #2010 as a probable symptom rather than a separate defect — a mis-sized container is the usual cause of a scrollbar on a page that should fit — and close it if it resolves instead of carrying a fix for a symptom that is gone. #2011 and #2012 land after #2013 so the final visual pass sees final copy. #2014 keeps the sign-in page fix; its codebase-wide half is #2058. #2015 is business logic, independent of all of it, and is the one with real diagnostic value.
- Look in: `app/routes/account.sign-in.*`, `app/routes/account.sign-up.*`, `app/components/shared/AuthCard.tsx`, `app/routes.ts`
- Missing tests: both pages share one form container; no scrollbar at 1x viewport height
- Done when: Both pages share one form container with identical width, padding and centring; Sign-up carries the same mural treatment as sign-in; Copy is consistent across the two pages; The sign-in page surfaces the real error through a toast; The inline-error sweep ships as its own issue with a rule and an inventory, not a blanket change; #2010 is closed as resolved by #2013, or reopened with the specific remaining cause
- Tracker: Parent epic. Sequencing lives here, not in the children. #2015 can proceed in parallel with the whole thing.

---

## Duplicates — 1

Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.

### [#1720](https://github.com/chester-hill-solutions/callcaster/issues/1720) Contacts that have opted out should be marked as such in the queue instead of completed
- Verdict: **Duplicates** · Type: Feature · Priority: Medium · Effort: Medium · Environment: unset · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Same root cause as 1732: queue_status enum only has queued/dequeued and opted-out entries display as 'completed'. 1732's outreach-status model is the canonical ticket; 1720 is one of its observable symptoms.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

---

## Needs triage — 222

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#2501](https://github.com/chester-hill-solutions/callcaster/issues/2501) SMS campaigns should have the same sendnidefault as other campaigns
- Status: on-dev · Type: Change Request · Priority: Medium · Effort: Low · Environment: prod · Labels: ux · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2942](https://github.com/chester-hill-solutions/callcaster/issues/2942) User Story: complete a first guided outreach session without human help
- Status: Backlog · Type: User Story · Priority: Medium · Effort: Medium · Environment: prod · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2778](https://github.com/chester-hill-solutions/callcaster/issues/2778) Why are twilio subaccounts named after workspace names instead of UUID?
- Status: Backlog · Type: Task · Priority: Medium · Effort: unset · Environment: unset · Labels: question · Assignee: @wra-sol · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2775](https://github.com/chester-hill-solutions/callcaster/issues/2775) Start campaign vs Schedule?
- Status: Backlog · Type: Task · Priority: Medium · Effort: unset · Environment: prod · Labels: question, design, ux · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2734](https://github.com/chester-hill-solutions/callcaster/issues/2734) Delete every workspace on dev.callcaster.ca
- Status: Backlog · Type: Task · Priority: Medium · Effort: nothing-burger · Environment: dev · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2701](https://github.com/chester-hill-solutions/callcaster/issues/2701) Destroy all stale stripe environments and sandboxes
- Status: Backlog · Type: Task · Priority: Medium · Effort: unset · Environment: prod · Labels: devops/admin · Assignee: none · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2696](https://github.com/chester-hill-solutions/callcaster/issues/2696) Railway IaC fails on dev: the plan proposes deleting CallCaster.STRIPE_API_KEY
- Status: Backlog · Type: Task · Priority: Medium · Effort: Low · Environment: dev · Labels: none · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2676](https://github.com/chester-hill-solutions/callcaster/issues/2676) Feature: make phone-number release action discoverable
- Status: Backlog · Type: Feature · Priority: Medium · Effort: Low · Environment: unset · Labels: ux · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2594](https://github.com/chester-hill-solutions/callcaster/issues/2594) Unify IVR and live-call multi-select blocks
- Status: Backlog · Type: Feature · Priority: Medium · Effort: Medium · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2520](https://github.com/chester-hill-solutions/callcaster/issues/2520) call interface button spacing is messy
- Status: Backlog · Type: Task · Priority: Medium · Effort: nothing-burger · Environment: prod · Labels: design · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2521](https://github.com/chester-hill-solutions/callcaster/issues/2521) call interface doesn't need the background card
- Status: Backlog · Type: Task · Priority: Medium · Effort: nothing-burger · Environment: prod · Labels: design · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2516](https://github.com/chester-hill-solutions/callcaster/issues/2516) Users with "Agent" role shouldn't see compliance status info on the today page
- Status: Backlog · Type: Change Request · Priority: Medium · Effort: unset · Environment: unset · Labels: ux · Assignee: none · Updated: 2026-10-09
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2518](https://github.com/chester-hill-solutions/callcaster/issues/2518) call settings: When I use the dropdown for calling device the modal closes
- Status: In progress · Type: Bug · Priority: Low · Effort: Low · Environment: prod · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2777](https://github.com/chester-hill-solutions/callcaster/issues/2777) Rename workspaces
- Status: Backlog · Type: Feature · Priority: Low · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2595](https://github.com/chester-hill-solutions/callcaster/issues/2595) Add IVR stop-key handling
- Status: Backlog · Type: Feature · Priority: Low · Effort: Medium · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2597](https://github.com/chester-hill-solutions/callcaster/issues/2597) change(script-builder): rename "Radio" to Single Select and "Select" to "Dropdown"
- Status: Backlog · Type: Feature · Priority: Low · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2506](https://github.com/chester-hill-solutions/callcaster/issues/2506) CSV Upload split name confirmation on final step is weird since it gets set on the previous step
- Status: Backlog · Type: Change Request · Priority: Low · Effort: nothing-burger · Environment: prod · Labels: ux · Assignee: none · Updated: 2026-10-09
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2502](https://github.com/chester-hill-solutions/callcaster/issues/2502) Toasts being persistent is probably a misuse of the design pattern
- Status: Backlog · Type: Change Request · Priority: Low · Effort: Low · Environment: prod · Labels: none · Assignee: none · Updated: 2026-10-09
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2827](https://github.com/chester-hill-solutions/callcaster/issues/2827) Task: add profile status and access checks
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-27
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2826](https://github.com/chester-hill-solutions/callcaster/issues/2826) Task: implement idempotent profile and workspace reconciliation
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-27
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2825](https://github.com/chester-hill-solutions/callcaster/issues/2825) Task: implement ResolvedSimProfile
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-27
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2824](https://github.com/chester-hill-solutions/callcaster/issues/2824) Task: add SIM catalog validation
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-27
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2823](https://github.com/chester-hill-solutions/callcaster/issues/2823) Task: define the three initial SIM personas
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-27
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2815](https://github.com/chester-hill-solutions/callcaster/issues/2815) Feature: SIM persona catalog and profile POC
- Status: tested-on-dev · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-27
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3043](https://github.com/chester-hill-solutions/callcaster/issues/3043) Predictive dialing: call N numbers at a time
- Status: Backlog · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3052](https://github.com/chester-hill-solutions/callcaster/issues/3052) Complete API integration workflow coverage
- Status: Backlog · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3062](https://github.com/chester-hill-solutions/callcaster/issues/3062) Define the execution contract for agent write tools
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3061](https://github.com/chester-hill-solutions/callcaster/issues/3061) Verify public API client recovery from transient failures
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3060](https://github.com/chester-hill-solutions/callcaster/issues/3060) Gate breaking public API changes in CI
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3059](https://github.com/chester-hill-solutions/callcaster/issues/3059) Verify API credential lifecycle across active clients
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3058](https://github.com/chester-hill-solutions/callcaster/issues/3058) Verify the export API job lifecycle
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3057](https://github.com/chester-hill-solutions/callcaster/issues/3057) Verify bulk audience import recovery through HTTP
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3056](https://github.com/chester-hill-solutions/callcaster/issues/3056) Verify workspace event replay through a real connection
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3055](https://github.com/chester-hill-solutions/callcaster/issues/3055) Complete customer webhook recovery behavior
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3054](https://github.com/chester-hill-solutions/callcaster/issues/3054) Add a verifiable customer webhook envelope
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3053](https://github.com/chester-hill-solutions/callcaster/issues/3053) Verify Adagio provisioning against the supported API
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3040](https://github.com/chester-hill-solutions/callcaster/issues/3040) Publish MCP connection and agent discovery guidance
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3038](https://github.com/chester-hill-solutions/callcaster/issues/3038) Expose workspace read operations through MCP
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3036](https://github.com/chester-hill-solutions/callcaster/issues/3036) Define the supported MCP connection contract
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3035](https://github.com/chester-hill-solutions/callcaster/issues/3035) Add a supported MCP integration for CallCaster
- Status: Backlog · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3051](https://github.com/chester-hill-solutions/callcaster/issues/3051) Enforce predictive abandonment controls for each calling profile
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3050](https://github.com/chester-hill-solutions/callcaster/issues/3050) Show parallel predictive activity without changing the active contact
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3049](https://github.com/chester-hill-solutions/callcaster/issues/3049) Stop all recipient legs owned by a predictive session
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3048](https://github.com/chester-hill-solutions/callcaster/issues/3048) Wait for the greeting to end before predictive voicemail playback
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3047](https://github.com/chester-hill-solutions/callcaster/issues/3047) Apply the predictive no-caller fallback
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3046](https://github.com/chester-hill-solutions/callcaster/issues/3046) Reserve one caller for each predictive live answer
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3045](https://github.com/chester-hill-solutions/callcaster/issues/3045) Dispatch predictive calls within durable capacity limits
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3044](https://github.com/chester-hill-solutions/callcaster/issues/3044) Define the predictive parallel-dial settings contract
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3042](https://github.com/chester-hill-solutions/callcaster/issues/3042) Expose campaign readiness as a read operation for agents
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3041](https://github.com/chester-hill-solutions/callcaster/issues/3041) Make direct SMS API retries reuse one durable intent
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3039](https://github.com/chester-hill-solutions/callcaster/issues/3039) Add MCP protocol and authorization contract checks
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3037](https://github.com/chester-hill-solutions/callcaster/issues/3037) Expose authenticated workspace capability context to agents
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3033](https://github.com/chester-hill-solutions/callcaster/issues/3033) Generate SDK support for the documented conversation workflow
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3032](https://github.com/chester-hill-solutions/callcaster/issues/3032) Agent quickstart incorrectly says API keys can use export routes
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3031](https://github.com/chester-hill-solutions/callcaster/issues/3031) Campaign operation docs omit the required operation query selector
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3030](https://github.com/chester-hill-solutions/callcaster/issues/3030) OpenAPI omits supported user bearer-token authentication
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3029](https://github.com/chester-hill-solutions/callcaster/issues/3029) Remove the Scalar docs dependency after native cutover
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3028](https://github.com/chester-hill-solutions/callcaster/issues/3028) Add first-request help beside workspace API keys
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3027](https://github.com/chester-hill-solutions/callcaster/issues/3027) Publish task-based API guides on the CallCaster site
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3026](https://github.com/chester-hill-solutions/callcaster/issues/3026) Build a native API request console
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3025](https://github.com/chester-hill-solutions/callcaster/issues/3025) Build a native API reference view
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3024](https://github.com/chester-hill-solutions/callcaster/issues/3024) Replace Scalar with native CallCaster API docs
- Status: Backlog · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3022](https://github.com/chester-hill-solutions/callcaster/issues/3022) Audience API contract omits supported workspace API-key authentication
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3021](https://github.com/chester-hill-solutions/callcaster/issues/3021) Create-workspace OpenAPI override drops the session auth requirement
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3020](https://github.com/chester-hill-solutions/callcaster/issues/3020) Survey API docs advertise JSON to handlers that require form data
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3019](https://github.com/chester-hill-solutions/callcaster/issues/3019) Public API docs omit inputs required by DELETE handlers
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3018](https://github.com/chester-hill-solutions/callcaster/issues/3018) Public OpenAPI omits required path parameters for 73 operations
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3017](https://github.com/chester-hill-solutions/callcaster/issues/3017) Campaign reset API lets callers erase campaign outreach history
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3016](https://github.com/chester-hill-solutions/callcaster/issues/3016) Audience removal APIs let callers bypass audience write permissions
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3015](https://github.com/chester-hill-solutions/callcaster/issues/3015) Legacy campaign queue API lets callers change queue membership
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3014](https://github.com/chester-hill-solutions/callcaster/issues/3014) Legacy script save API bypasses the member role floor
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3013](https://github.com/chester-hill-solutions/callcaster/issues/3013) Legacy campaign API lets the caller role change campaigns
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3012](https://github.com/chester-hill-solutions/callcaster/issues/3012) Paste CSV text into audience imports
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3011](https://github.com/chester-hill-solutions/callcaster/issues/3011) Workspace API requests return 403 with workspace-scoped API keys
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3008](https://github.com/chester-hill-solutions/callcaster/issues/3008) Quick Dequeue: dequeue CSV-matched numbers from one campaign queue
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#3004](https://github.com/chester-hill-solutions/callcaster/issues/3004) Make failed original uploads terminal and diagnose storage authorization errors
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-26
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2816](https://github.com/chester-hill-solutions/callcaster/issues/2816) Feature: SIM task protocol and SMS flows
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2787](https://github.com/chester-hill-solutions/callcaster/issues/2787) Feature: ADR-0040 service-adoption framework
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2789](https://github.com/chester-hill-solutions/callcaster/issues/2789) Feature: SIM configuration and secret-provider adoption
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2965](https://github.com/chester-hill-solutions/callcaster/issues/2965) Task: deploy hosted SIP persona service on a durable host
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2835](https://github.com/chester-hill-solutions/callcaster/issues/2835) Task: develop local Asterisk SIP persona host
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2973](https://github.com/chester-hill-solutions/callcaster/issues/2973) Task: migrate scripts and browser-suite SecretProvider boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2972](https://github.com/chester-hill-solutions/callcaster/issues/2972) Task: migrate scripts and browser-suite typed non-secret configuration
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2971](https://github.com/chester-hill-solutions/callcaster/issues/2971) Task: migrate media-stream SecretProvider boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2970](https://github.com/chester-hill-solutions/callcaster/issues/2970) Task: migrate media-stream typed non-secret configuration
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2969](https://github.com/chester-hill-solutions/callcaster/issues/2969) Task: migrate worker SecretProvider boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2968](https://github.com/chester-hill-solutions/callcaster/issues/2968) Task: migrate worker typed non-secret configuration
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2967](https://github.com/chester-hill-solutions/callcaster/issues/2967) Task: migrate app SecretProvider boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2966](https://github.com/chester-hill-solutions/callcaster/issues/2966) Task: migrate app typed non-secret configuration
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2838](https://github.com/chester-hill-solutions/callcaster/issues/2838) Task: verify direct SIP hello-hangup smoke
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2836](https://github.com/chester-hill-solutions/callcaster/issues/2836) Task: implement Asterisk persona service
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2790](https://github.com/chester-hill-solutions/callcaster/issues/2790) Feature: ADR-0040 Phase 6 compatibility removal and ratchet
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2812](https://github.com/chester-hill-solutions/callcaster/issues/2812) Task: remove SIM compatibility variables
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2811](https://github.com/chester-hill-solutions/callcaster/issues/2811) Task: verify SIM through dotenv and password manager
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2810](https://github.com/chester-hill-solutions/callcaster/issues/2810) Task: make SIM the first dotenv-backed service boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2801](https://github.com/chester-hill-solutions/callcaster/issues/2801) Task: add required-secret dry-run command
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2800](https://github.com/chester-hill-solutions/callcaster/issues/2800) Task: implement password-manager secret provider
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2799](https://github.com/chester-hill-solutions/callcaster/issues/2799) Task: implement local dotenv secret provider
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2798](https://github.com/chester-hill-solutions/callcaster/issues/2798) Task: define secret catalog and service allowlists
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2786](https://github.com/chester-hill-solutions/callcaster/issues/2786) Feature: ADR-0040 Phase 2 secret provider foundation
- Status: tested-on-dev · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2652](https://github.com/chester-hill-solutions/callcaster/issues/2652) Give the campaign message editor an accessible field name
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2658](https://github.com/chester-hill-solutions/callcaster/issues/2658) Name each weekly campaign start/end time control
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2642](https://github.com/chester-hill-solutions/callcaster/issues/2642) Return from the audio editor to the existing library route
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2654](https://github.com/chester-hill-solutions/callcaster/issues/2654) Connect the Send using label to its campaign control
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2647](https://github.com/chester-hill-solutions/callcaster/issues/2647) Name the Call list index row actions
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2656](https://github.com/chester-hill-solutions/callcaster/issues/2656) Make campaign message attachments usable without hover
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2641](https://github.com/chester-hill-solutions/callcaster/issues/2641) Identify each campaign queue selection checkbox by contact
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2661](https://github.com/chester-hill-solutions/callcaster/issues/2661) Offer password recovery before entry when the reset token is missing
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2239](https://github.com/chester-hill-solutions/callcaster/issues/2239) e2e toolchain step times out on a 62.8 MB ffmpeg apt download
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2797](https://github.com/chester-hill-solutions/callcaster/issues/2797) Task: compare resolved config with current runtime
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2796](https://github.com/chester-hill-solutions/callcaster/issues/2796) Task: add redacted config resolution command
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2795](https://github.com/chester-hill-solutions/callcaster/issues/2795) Task: add inherited environment configuration
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2794](https://github.com/chester-hill-solutions/callcaster/issues/2794) Task: define ProjectConfig schema and secret names
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2785](https://github.com/chester-hill-solutions/callcaster/issues/2785) Feature: ADR-0040 Phase 1 typed inherited config
- Status: tested-on-dev · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2784](https://github.com/chester-hill-solutions/callcaster/issues/2784) Feature: ADR-0040 Phase 0 inventory and guardrails
- Status: tested-on-dev · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @sai-sy · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2493](https://github.com/chester-hill-solutions/callcaster/issues/2493) Stow bootstrap fails on macOS when sha256sum is absent
- Status: on-dev · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2937](https://github.com/chester-hill-solutions/callcaster/issues/2937) A rented number released directly at Twilio stays billable: the sweep never reconciles against the provider
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2899](https://github.com/chester-hill-solutions/callcaster/issues/2899) Railway IaC plan check fails on every PR that touches package.json: the dev and qa RAILWAY_TOKEN environment secrets are invalid
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2859](https://github.com/chester-hill-solutions/callcaster/issues/2859) Task: collect and compare SIP load reports
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2858](https://github.com/chester-hill-solutions/callcaster/issues/2858) Task: define versioned SIP load profiles
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2857](https://github.com/chester-hill-solutions/callcaster/issues/2857) Task: provision disposable SIPp load workers
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2856](https://github.com/chester-hill-solutions/callcaster/issues/2856) Task: verify scheduled smoke and alerting
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2855](https://github.com/chester-hill-solutions/callcaster/issues/2855) Task: add bounded scheduled SIM smoke
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2854](https://github.com/chester-hill-solutions/callcaster/issues/2854) Task: deploy isolated inbound email Worker and run API
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2853](https://github.com/chester-hill-solutions/callcaster/issues/2853) Task: verify voice checkpoints and evidence
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2852](https://github.com/chester-hill-solutions/callcaster/issues/2852) Task: add browser speech audio flow
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2851](https://github.com/chester-hill-solutions/callcaster/issues/2851) Task: add deterministic IVR and recorded-audio flows
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2850](https://github.com/chester-hill-solutions/callcaster/issues/2850) Task: add durable persona checkpoints
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2849](https://github.com/chester-hill-solutions/callcaster/issues/2849) Task: add voice task contracts and access metadata
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2848](https://github.com/chester-hill-solutions/callcaster/issues/2848) Task: verify resolver safety and first Twilio-to-SIP call
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2847](https://github.com/chester-hill-solutions/callcaster/issues/2847) Task: provision isolated synthetic provider environment
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2846](https://github.com/chester-hill-solutions/callcaster/issues/2846) Task: add SIP authentication and run headers
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2845](https://github.com/chester-hill-solutions/callcaster/issues/2845) Task: implement fail-closed telephony destination resolver
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2844](https://github.com/chester-hill-solutions/callcaster/issues/2844) Task: inventory and guard Twilio call paths
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2843](https://github.com/chester-hill-solutions/callcaster/issues/2843) Task: verify audience reuse and versioning
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2842](https://github.com/chester-hill-solutions/callcaster/issues/2842) Task: enforce mixed-audience safety
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2841](https://github.com/chester-hill-solutions/callcaster/issues/2841) Task: add run-scoped CSV audience fixtures
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2840](https://github.com/chester-hill-solutions/callcaster/issues/2840) Task: add simulation resource registry
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2839](https://github.com/chester-hill-solutions/callcaster/issues/2839) Task: add simulation run and event data model
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2837](https://github.com/chester-hill-solutions/callcaster/issues/2837) Task: implement persona controller and signed events
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2834](https://github.com/chester-hill-solutions/callcaster/issues/2834) Task: verify repeated SMS flows and access failures
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2833](https://github.com/chester-hill-solutions/callcaster/issues/2833) Task: add registered SMS SIM flows
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2832](https://github.com/chester-hill-solutions/callcaster/issues/2832) Task: make SIM resources logically idempotent
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2831](https://github.com/chester-hill-solutions/callcaster/issues/2831) Task: make current SIM tasks composable
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2830](https://github.com/chester-hill-solutions/callcaster/issues/2830) Task: add task permission metadata and persona selection
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2829](https://github.com/chester-hill-solutions/callcaster/issues/2829) Task: define SIM task result envelope
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2822](https://github.com/chester-hill-solutions/callcaster/issues/2822) Feature: SIP load testing
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2821](https://github.com/chester-hill-solutions/callcaster/issues/2821) Feature: Remote email checks and scheduled QA smoke
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2820](https://github.com/chester-hill-solutions/callcaster/issues/2820) Feature: Voice SIM tasks and predefined flows
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2819](https://github.com/chester-hill-solutions/callcaster/issues/2819) Feature: Synthetic telephony destination resolver and isolated provider path
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2818](https://github.com/chester-hill-solutions/callcaster/issues/2818) Feature: Simulation runs and audience persona binding
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2817](https://github.com/chester-hill-solutions/callcaster/issues/2817) Feature: SIP persona service POC
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2814](https://github.com/chester-hill-solutions/callcaster/issues/2814) Task: ratchet undocumented configuration reads to CI failure
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2813](https://github.com/chester-hill-solutions/callcaster/issues/2813) Task: remove legacy environment readers
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2809](https://github.com/chester-hill-solutions/callcaster/issues/2809) Task: apply mappings to dev and QA
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2808](https://github.com/chester-hill-solutions/callcaster/issues/2808) Task: add configuration and deployment drift checks
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2807](https://github.com/chester-hill-solutions/callcaster/issues/2807) Task: generate GitHub environment secret manifest
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2806](https://github.com/chester-hill-solutions/callcaster/issues/2806) Task: generate Railway variable mappings
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2805](https://github.com/chester-hill-solutions/callcaster/issues/2805) Task: migrate scripts and browser-suite config boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2804](https://github.com/chester-hill-solutions/callcaster/issues/2804) Task: migrate media-stream config boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2803](https://github.com/chester-hill-solutions/callcaster/issues/2803) Task: migrate worker config boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2802](https://github.com/chester-hill-solutions/callcaster/issues/2802) Task: migrate app config boundary
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2793](https://github.com/chester-hill-solutions/callcaster/issues/2793) Task: add report-only configuration drift guard
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2792](https://github.com/chester-hill-solutions/callcaster/issues/2792) Task: classify configuration ownership and sensitivity
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2791](https://github.com/chester-hill-solutions/callcaster/issues/2791) Task: inventory environment and secret inputs
- Status: tested-on-dev · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2788](https://github.com/chester-hill-solutions/callcaster/issues/2788) Feature: ADR-0040 Phase 4 deployment mappings and drift control
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2782](https://github.com/chester-hill-solutions/callcaster/issues/2782) Epic: Agent-friendly synthetic telephony testing
- Status: Backlog · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2781](https://github.com/chester-hill-solutions/callcaster/issues/2781) Epic: Inherited configuration as code and pluggable secret providers
- Status: Backlog · Type: Epic · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2716](https://github.com/chester-hill-solutions/callcaster/issues/2716) Decide the next scoped Effect adoption
- Status: In progress · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2667](https://github.com/chester-hill-solutions/callcaster/issues/2667) Flatten the shared workspace shell to use page space
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: design · Assignee: @wra-sol · Updated: 2026-10-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2662](https://github.com/chester-hill-solutions/callcaster/issues/2662) Keep Text content details readable in dark theme
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2660](https://github.com/chester-hill-solutions/callcaster/issues/2660) Offer a clear recovery step for an invalid invitation
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2659](https://github.com/chester-hill-solutions/callcaster/issues/2659) Keep campaign section scrolling inside the mobile navigation rail
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2657](https://github.com/chester-hill-solutions/callcaster/issues/2657) Name the date-picker time parts for assistive technology
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2653](https://github.com/chester-hill-solutions/callcaster/issues/2653) Give Text campaign editing useful desktop space
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2651](https://github.com/chester-hill-solutions/callcaster/issues/2651) Explain campaign SMS windows without contradicting recipient quiet hours
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2650](https://github.com/chester-hill-solutions/callcaster/issues/2650) Use one persistent opt-out notice in the conversation view
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2649](https://github.com/chester-hill-solutions/callcaster/issues/2649) Show a recoverable error when a selected CSV cannot be parsed
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2646](https://github.com/chester-hill-solutions/callcaster/issues/2646) Show contact unsaved status only after a draft value changes
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2645](https://github.com/chester-hill-solutions/callcaster/issues/2645) Use the CallCaster field contract for the new clip name
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2644](https://github.com/chester-hill-solutions/callcaster/issues/2644) Show duration and size for newly uploaded workspace audio
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2643](https://github.com/chester-hill-solutions/callcaster/issues/2643) Load newly uploaded workspace audio in the clip editor
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2640](https://github.com/chester-hill-solutions/callcaster/issues/2640) Use compact rows in the queue contact picker
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2639](https://github.com/chester-hill-solutions/callcaster/issues/2639) Show stored opt-out status in contact details
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2637](https://github.com/chester-hill-solutions/callcaster/issues/2637) Bound long values in the populated campaign queue
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2636](https://github.com/chester-hill-solutions/callcaster/issues/2636) Use compact CallCaster field layout for CSV column mapping
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2635](https://github.com/chester-hill-solutions/callcaster/issues/2635) Keep populated People tables usable with long contact values
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2633](https://github.com/chester-hill-solutions/callcaster/issues/2633) Keep the DTMF keypad in a compact surface near call controls
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2632](https://github.com/chester-hill-solutions/callcaster/issues/2632) Keep the selected Credits navigation count readable in dark mode
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2631](https://github.com/chester-hill-solutions/callcaster/issues/2631) Show a focused empty state for an empty campaign queue
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2630](https://github.com/chester-hill-solutions/callcaster/issues/2630) Complete the handset offline message when no presence status exists
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2629](https://github.com/chester-hill-solutions/callcaster/issues/2629) Keep Back and Cancel available before a call list import starts
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2628](https://github.com/chester-hill-solutions/callcaster/issues/2628) Use a compact shared selection control for credit amounts
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2627](https://github.com/chester-hill-solutions/callcaster/issues/2627) Use route-navigation semantics for campaign sections
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2625](https://github.com/chester-hill-solutions/callcaster/issues/2625) Show successful script validation without a full-height sheet
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2624](https://github.com/chester-hill-solutions/callcaster/issues/2624) Upload campaign audio inline beside the audio selector
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2623](https://github.com/chester-hill-solutions/callcaster/issues/2623) Use the shared resource empty state for Surveys
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2622](https://github.com/chester-hill-solutions/callcaster/issues/2622) Align the account menu with the CHS dropdown menu contract
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2621](https://github.com/chester-hill-solutions/callcaster/issues/2621) Connect survey question controls to labels and name their actions
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2620](https://github.com/chester-hill-solutions/callcaster/issues/2620) Give Call History filters persistent labels and shared field layout
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2619](https://github.com/chester-hill-solutions/callcaster/issues/2619) Show one empty state when searching an empty Contacts list
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2618](https://github.com/chester-hill-solutions/callcaster/issues/2618) Use the shared field validation contract for a new chat recipient
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2617](https://github.com/chester-hill-solutions/callcaster/issues/2617) Use CHS action variants for contact custom fields
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2615](https://github.com/chester-hill-solutions/callcaster/issues/2615) Use the shared flat page composition for inbound queue settings
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2613](https://github.com/chester-hill-solutions/callcaster/issues/2613) Use a responsive single-number editor in the advanced settings sheet
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2612](https://github.com/chester-hill-solutions/callcaster/issues/2612) Reduce the team role indicator and keep member rows within the available width
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2611](https://github.com/chester-hill-solutions/callcaster/issues/2611) Close workspace navigation after selecting a page on mobile
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2610](https://github.com/chester-hill-solutions/callcaster/issues/2610) Respect the number-only setup goal on workspace home
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2609](https://github.com/chester-hill-solutions/callcaster/issues/2609) Show the verified caller ID in onboarding number review
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2608](https://github.com/chester-hill-solutions/callcaster/issues/2608) Align onboarding country selection with the CallCaster Select control
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2607](https://github.com/chester-hill-solutions/callcaster/issues/2607) Use CallCaster radio controls for onboarding goal selection
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2569](https://github.com/chester-hill-solutions/callcaster/issues/2569) Evaluate shadcn AI Elements for Chats
- Status: Backlog · Type: Task · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2599](https://github.com/chester-hill-solutions/callcaster/issues/2599) Use Text to speech wording for IVR playback
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2598](https://github.com/chester-hill-solutions/callcaster/issues/2598) Unify page order and start-page selection
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2591](https://github.com/chester-hill-solutions/callcaster/issues/2591) Add input blocks to IVR scripts
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2590](https://github.com/chester-hill-solutions/callcaster/issues/2590) Unify IVR and live-call script blocks
- Status: Backlog · Type: Feature · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2497](https://github.com/chester-hill-solutions/callcaster/issues/2497) Investigate Add audio hit-target failures in touch-emulated Chrome
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2496](https://github.com/chester-hill-solutions/callcaster/issues/2496) Browser smoke tests assume desktop navigation and script controls
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2495](https://github.com/chester-hill-solutions/callcaster/issues/2495) API docs show two notices for one Copy link click
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2494](https://github.com/chester-hill-solutions/callcaster/issues/2494) Empty sign-in fields produce a temporary-failure message
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2472](https://github.com/chester-hill-solutions/callcaster/issues/2472) Limit public docs to supported public API surfaces
- Status: Backlog · Type: Bug · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-07
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2303](https://github.com/chester-hill-solutions/callcaster/issues/2303) Extract safe-outbound-url to a shared package — three repos now need it, and two have written their own half
- Status: Backlog · Type: unset · Priority: unset · Effort: unset · Environment: unset · Labels: none · Assignee: none · Updated: 2026-10-03
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
