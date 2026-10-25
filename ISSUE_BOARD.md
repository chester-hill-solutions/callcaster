# CallCaster — Open Issue Board for Agents

Reviewed at `dev@a8b517ff` · 339 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

## How to use this board

1. Pick from **Fix now** first (confirmed, with an exact resolution path).
2. Read the full issue before starting: `gh issue view <number>`.
3. Claim it: `gh issue edit <number> --add-assignee @me`.
4. Branch from `dev` via `gh issue develop --base dev`. Follow branch/PR rules in `AGENTS.md`.
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

## Fix now — 31

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#2860](https://github.com/chester-hill-solutions/callcaster/issues/2860) A webhook credential for one workspace releases or accepts another tenant's live inbound call offer
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-24
- The ACD router authenticates a request against a workspace resolved from the queue named in the URL, then mutates the inbound queue entry named by a second, independent id (entry_id)
- Current behavior: The ACD router authenticates a request against a workspace resolved from the queue named in the URL, then mutates the inbound queue entry named by a second, independent id (entry_id). The four inbound-offer plpgsql functions (release_inbound_offer, accept_inbound_offer, complete_inbound_queue_entry, abandon_inbound_queue_entry) take only that entry id and carry no workspace predicate, so the workspace whose credential was validated and the workspace that owns the mutated row are never bound together. Independently reproduced locally against a Postgres 18 bootstrapped from the repository migration chain, with two dummy tenants: a request signed with tenant A's own Twilio subaccount auth…
- Root cause: app/lib/acd/acd-router.server.ts resolves the authenticating workspace from queue_id (resolveWorkspaceId, lines 263-296) and the route-level check resolves it from the CallSid's call row or, when that row is unknown, from the AccountSid in the body (app/lib/twilio-webhook.server.ts:75-95, 223-232), but the resource it mutates is chosen by an unbound entry_id query parameter that is never compared with either resolved workspace (handleAgentStatus lines 514 and 543, handleAgentBridge lines 474 and 496-502, handleComplete lines 573 and 585-595). The wrappers in app/lib/db-rpc.server.ts (rpcReleaseInboundOffer:656, rpcAcceptInboundOffer:669, rpcCompleteInboundQueueEntry:676,…
- Resolution: Bind the mutated resource to the authenticated workspace in two places: (1) in the router, refuse an entry whose workspace_id differs from the workspace whose credential was validated, and (2) in SQL, give the four inbound-offer RPCs a required workspace parameter and filter inbound_queue_entry by it - the pattern already used by claim_inbound_queue_entry/next_inbound_queue_offer in the same migration and by dequeue_contact/create_outreach_attempt in client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql. The same change must update the two remaining callers or the new signature breaks them: the workspace-agnostic sweep in…
- Look in: `client/migrations/20260731130000_create_acd_inbound_queue_functions.sql`, `app/lib/db-rpc.server.ts`, `app/lib/acd/acd-router.server.ts`, `app/routes/api+/acd-router/agent-status.action.server.ts`, `app/lib/twilio-webhook.server.ts`, `app/lib/workspace-client-projection.server.ts`
- Existing tests: Route-level signature check: 'passed' (requireTwilioSignature returned null) with tenant A's token and 'rejected 403' (reason invalid_signature) with tenant B's token. The router answered 200 {"ok":true}. Tenant B's inbound_queue_entry went from status 'offered' to 'timed_out' with completed_at set and workspace_id…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A credential belonging to workspace A may only mutate workspace A's inbound queue entries. The entry named by entry_id must be verified to belong to the workspace whose credential was validated, and the RPC should filter inbound_queue_entry by that workspace, the way client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql added a required workspace parameter to dequeue_contact and create_outreach_attempt after finding the same class of cross-tenant write.

### [#2895](https://github.com/chester-hill-solutions/callcaster/issues/2895) Workspace-UI recording path stores the take before it measures its duration, and no maximum duration exists…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Workspace-UI recording path stores the take before it measures its duration, and no maximum duration exists anywhere to compare against**
- POST /workspaces/:id/audios/record normalises the uploaded take with ffmpeg and writes it to the tenant bucket (uploadObject, app/routes/workspaces+/$id/audios/record.action.server.ts:72-81), and only then measures its length with…
- Current behavior: POST /workspaces/:id/audios/record normalises the uploaded take with ffmpeg and writes it to the tenant bucket (uploadObject, app/routes/workspaces+/$id/audios/record.action.server.ts:72-81), and only then measures its length with probeAudioDurationMs (line 84). The measured value is written to workspace_audio.duration_ms and is never compared against a maximum. No maximum-duration constant exists anywhere in the tracked source: a scan of 2525 files across app, shared, server, worker, services, client, scripts, e2e and test found only unrelated string-length caps (Twilio friendly name, IVR hint, audit metadata string, log line, contact message, name, workspace name) and no duration ceiling…
- Root cause: The record action's duration handling is a measurement, not a limit: probeAudioDurationMs runs after uploadObject and its return value is only persisted, and no maximum duration is defined or enforced anywhere on the upload/record path, so an arbitrarily long recording is written to durable storage and to the metadata table before anything could reject it.
- Resolution: Define one maximum recording duration as a shared constant and enforce it before the take is transcoded and before it is stored. Probe the uploaded container with the server's own tool (probeAudioDurationMs) on the raw upload, so an over-long take is rejected with 413 without ever spending ffmpeg time on it and without writing anything to storage; keep the post-transcode measurement for the stored metadata. Have the browser recorder stop at the same maximum, and keep the ffmpeg wall-clock guard consistent with the maximum rather than relying on it as the policy.
- Look in: `app/lib/audio-upload.ts`, `app/lib/audio.server.ts`, `app/lib/audio-process.server.ts`, `app/components/file-assets/AudioRecorder.tsx`, `app/lib/audio-clip.server.ts`, `app/db/schema.ts`
- Existing tests: The request returned 302 with Location /workspaces/<workspaceId>/audios/recorded-<stamp>.mp3/edit, the normalised object was PUT to the bucket (8279 bytes), and workspace_audio held a row with file_name 'recorded-<stamp>.mp3', origin 'recording', duration_ms 14266340 (3.96 hours), size_bytes 8279, content_type…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A recording is bounded in duration before it is transcoded and before it is stored. The server already measures every recording with its own probe (probeAudioDurationMs), specifically so the recorded length is the server's own measurement rather than the client's timer, and the client already sends a durationMs field; that measured length is expected to be checked against a maximum, with the request rejected before the object is written, and the browser recorder expected to stop at the same maximum.

### [#2892](https://github.com/chester-hill-solutions/callcaster/issues/2892) Workspace SSE stream re-checks membership only, so a demoted owner or a revoked API key keeps the owner-only event…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Workspace SSE stream re-checks membership only, so a demoted owner or a revoked API key keeps the owner-only event stream**
- GET /api/workspaces/:workspaceId/events is gated at connect time on the owner-only `audit.read` capability (`dataPlaneCapabilityAuth("audit.read")`, events.loader.server.ts:61), but the only periodic re-authorization of the already-open…
- Current behavior: GET /api/workspaces/:workspaceId/events is gated at connect time on the owner-only `audit.read` capability (`dataPlaneCapabilityAuth("audit.read")`, events.loader.server.ts:61), but the only periodic re-authorization of the already-open connection asks one question - "is this user still a member of this workspace?" - and never re-applies the capability, the session, or the API key. `stillHasWorkspaceAccess` (events.loader.server.ts:89) returns `true` unconditionally for API-key actors (line 92, `if (!auth.userId) return true;`) and otherwise evaluates only `getUserRole({ user: { id: auth.userId }, workspaceId }) != null` (line 94), i.e. "does a `workspace_member` row still exist". An owner…
- Root cause: The stream's revocation hook only enforces workspace membership, not the authorization decision that opened the stream. In `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts`, `stillHasWorkspaceAccess` (line 89) returns `true` unconditionally for API-key actors (`if (!auth.userId) return true;`, line 92) and otherwise evaluates only `getUserRole({ user: { id: auth.userId }, workspaceId }) != null` (line 94) - i.e. "is there still a `workspace_member` row". It never re-derives the actor's capabilities from the current role, never re-reads the API key row (existence/expiry/scopes), and never re-validates the session. The 15s heartbeat (lines 174-186) is the only place a…
- Resolution: Make the stream's periodic re-check re-apply the SAME authorization decision that opened it, instead of a weaker membership test: (a) for session actors, re-derive the capabilities from the CURRENT workspace role and require `audit.read`, and re-validate the session so a password reset ends the stream; (b) for API-key actors, re-read the key row (existence, expiry, current scopes) and require `audit.read` in the current scopes; (c) close the stream with the existing `workspace_access_revoked` frame whenever the re-authorization fails. Keep the existing fail-open-on-DB-error behaviour for the *lookup* itself (a database blip must not drop every open stream), but make the capability…
- Look in: `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts`, `app/lib/capabilities.ts`, `app/lib/workspace-members-db.server.ts`, `app/server/auth-instance.ts`, `services/media-stream/db-writer.ts`, `app/lib/workspace-events.server.ts`
- Existing tests: test/workspace-api-key-scope-cap.test.ts covers the neighbouring behaviour on this path.; 5/5 assertions passed, all of them landing in the insecure direction, and they reproduce the source reading exactly. (1) The production matrix confirms `audit.read` is owner-only: `capabilityIdsForRole("owner")` contains it, `admin`/`member`/`caller` do not. (2) Demotion: the stream opens (HTTP 200,…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: The stream's own doc comment states that it outlives the connect-time check by design, and its gate is deliberately the owner-only `audit.read` capability - the same capability the sibling `/api/workspaces/:workspaceId/audit-events` endpoint enforces (audit-events.loader.server.ts:7). A stream that outlives its connect check must therefore be re-authorized with the same authority on every tick: re-derive the actor's current capabilities from the CURRENT workspace role and require `audit.read`; for API-key actors re-read the key row and require the current scopes to contain `audit.read`; for cookie actors re-validate the session. When the re-authorization fails the stream must emit `workspace_access_revoked` and close - exactly as it already does today for a removed member.

### [#2890](https://github.com/chester-hill-solutions/callcaster/issues/2890) Media upload API routes let the `caller` workspace role rewrite campaign media that `campaigns.write` reserves for…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Media upload API routes let the `caller` workspace role rewrite campaign media that `campaigns.write` reserves for member and above**
- POST /api/media and POST/DELETE /api/message_media authorise their campaign mutation with workspace membership alone (`requireWorkspaceAccess` without `minRole`), so a workspace member whose `role_id` is `caller` - the lowest role, which…
- Current behavior: POST /api/media and POST/DELETE /api/message_media authorise their campaign mutation with workspace membership alone (`requireWorkspaceAccess` without `minRole`), so a workspace member whose `role_id` is `caller` - the lowest role, which the platform's own role-to-capability matrix deliberately denies `campaigns.write` - can overwrite `campaign.voicedrop_audio` (the audio a live campaign plays on a voicemail drop) and attach or delete `campaign.message_media` (the MMS a campaign sends). Every sibling control on the same media family refuses that same actor: the workspace library upload (`uploadWorkspaceAudioApi`), the clip editor (`createWorkspaceAudioClip`), the workspace audio routes and…
- Root cause: app/routes/api+/media.action.server.ts line 46 and app/routes/api+/message_media.action.server.ts line 36 both call `requireWorkspaceAccess({ user, workspaceId })` with no `minRole`. `requireWorkspaceAccess` only consults `hasMinRole` when `minRole` is supplied (app/lib/workspace-membership.server.ts line 183), and `hasMinRole` returns true for an omitted gate (app/lib/member-role.ts line 28), so any membership role, including `caller`, passes. The routes then mutate a campaign through `updateCampaignVoicedropAudio` / `updateCampaignMessageMedia`, which are `campaigns.write` operations, without ever consulting the actor's role or capability. The guard that expresses the policy exists and…
- Resolution: Gate the campaign-mutating branches of both media routes on the capability the platform already states for campaign writes instead of on membership alone, and put the gate where the workspace id and the campaign id are known. In `POST /api/media`, require at least `MemberRole.Member` for the workspace (the rule `uploadWorkspaceAudioApi` applies) after the multipart body is parsed and before touching storage. In `/api/message_media`, require the same role for the campaign branches - POST with a `campaignId`, and DELETE - while leaving the campaign-less chat image upload (POST without `campaignId`, used by app/hooks/chats/useImageHandling.ts and reachable by every workspace member because the…
- Look in: `app/routes/api+/media.action.server.ts`, `app/routes/api+/message_media.action.server.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/member-role.ts`, `app/lib/capabilities.ts`, `app/routes/api+/campaigns/$campaignId.action.server.ts`
- Existing tests: Independently reproduced by the verifier in the parent-approved sandbox against real Postgres 18 (vitest integration tier, real workspace_member rows with role_id 'caller', real route action modules loaded from the target, object storage stubbed): POST /api/media returned 201 with body…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A campaign mutation requires the `campaigns.write` capability and at least the `member` role. `CALLCASTER_ROLE_CAPABILITY_MATRIX` (app/lib/capabilities.ts lines 47-78) grants `campaigns.write` to `owner`, `admin` and `member` and gives `caller` only `campaigns.read`, `calls.start` and `calls.control`. app/routes/api+/campaigns/$campaignId.action.server.ts lines 29-33 states the rule in words: 'Both branches below (duplicate, status transition) are destructive mutations: require at least `member`, blocking the `caller` role.' The same rule is applied across the sibling media surface: `uploadWorkspaceAudioApi` (app/lib/platform-media.server.ts line 116) and `createWorkspaceAudioClip` (app/lib/audio-clip.server.ts line 56) return 403 'Not authorized' for `caller`, the workspace audio routes require `MemberRole.Member` (app/routes/workspaces+/$id/audios/new.action.server.ts line 17, .../record.action.server.ts line 36, .../$fileName.edit.action.server.ts line 29), the product's own campaign-configuration writes are member-gated (app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.action.server.ts line 21 and .../queue.action.server.ts line 47 require `MemberRole.Member`; .../settings.action.server.ts line 91 requires `MemberRole.Admin`), and app/routes/api+/inbound-queue.action.server.ts line 35 rejects `caller` outright.

### [#2887](https://github.com/chester-hill-solutions/callcaster/issues/2887) Dual-lockfile drift gate never compares the two lockfiles, so CI validates a dependency tree the production worker…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Dual-lockfile drift gate never compares the two lockfiles, so CI validates a dependency tree the production worker image does not install**
- The repository keeps two lockfiles because the two halves of the pipeline use different package managers
- Current behavior: The repository keeps two lockfiles because the two halves of the pipeline use different package managers. Every CI job installs with `npm ci` (.github/workflows/ci.yml:78, 92, 110, 127, 144, 193, 214), so typecheck, lint, the node and UI test suites and the static checks all run against the package-lock.json (npm) tree, while the deployed worker image installs the bun.lock (bun) tree (`bun install --production` at Dockerfile.worker:8; the Dockerfile web image installs the same tree at Dockerfile:11). The repository's only control for keeping those trees aligned is `npm run check:bun-lock` -> scripts/check-bun-lockfile.mjs, and that script implements the check as `bun install…
- Root cause: scripts/check-bun-lockfile.mjs implements the dual-lockfile drift gate as `bun install --frozen-lockfile --dry-run` (line 21), and that command compares bun.lock with package.json only: it never reads package-lock.json, even though the script's own header (lines 4-13) states the gate exists because 'Adding or changing a dependency with one package manager leaves the other lockfile stale' and that the failure surfaces 'inside the Railway image build', and its own line 12 claims it fails 'when the two lockfiles disagree'. The two lockfiles are resolved by two different resolvers - npm with `legacy-peer-deps=true` from .npmrc, which ignores peer dependencies, and bun with its own resolver,…
- Resolution: Make the drift gate compare the two lockfiles instead of only bun.lock against package.json, make the worker image fail loudly on any future drift, and pin the resolver so the gate validates the same lockfile the image installs. Three steps, in order: (1) align the resolver configuration first - .npmrc legacy-peer-deps=true makes npm ignore peer dependencies while bun installs them, which is why the trees differ in package content and not only in versions; either drop legacy-peer-deps (and regenerate package-lock.json) or record the peer difference as accepted and scope the comparison accordingly; (2) regenerate both lockfiles from the same package.json so the resolved trees agree, and…
- Look in: `.github/workflows/ci.yml`, `scripts/check-bun-lockfile.mjs`, `package.json`, `Dockerfile.worker`, `Dockerfile`, `package-lock.json`
- Existing tests: The gate's only assertion holds: bun.lock satisfies every package.json range, so `bun install --frozen-lockfile --dry-run` has nothing to change in bun.lock and the gate is green, while the two lockfiles disagree. The comparison of the two lockfiles shows 250 package names resolving to different version sets (31…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: The drift gate should assert that the dependency tree CI installs and tests (package-lock.json, via `npm ci`) is the same tree the production images install (bun.lock, via `bun install`), so that the artifact which passed install, typecheck, lint and test is the artifact that is deployed. Any divergence between the two resolved trees - including a newer version of a credential-handling dependency landing in only one of them, and a package present in one tree but absent from the other - should fail the build before the image is produced.

### [#2882](https://github.com/chester-hill-solutions/callcaster/issues/2882) Campaign export hands the lowest-trust workspace role every agent's attempts and contact PII
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- A workspace member with the `caller` ("Agent") role can trigger a campaign results export and receive a CSV that contains every outreach attempt of that campaign, including the attempts made by other agents
- Current behavior: A workspace member with the `caller` ("Agent") role can trigger a campaign results export and receive a CSV that contains every outreach attempt of that campaign, including the attempts made by other agents. Each row carries the contact's first name, surname, phone, email, street address and city, the attempt disposition, the call SID and the attempt's complete IVR answer set. The product's own scoped read path deliberately denies the same principal that view: getWorkspaceAnalyticsApi computes canViewAllUsers as owner/admin/member only (app/lib/platform-analytics.server.ts:57) and loadWorkspaceAnalytics then filters the outreach_attempt rows with outreach_attempt.user_id = currentUserId…
- Root cause: The campaign export selects outreach attempts by campaign_id alone and is gated on workspace membership alone. It omits both the per-agent (outreach_attempt.user_id) scope the platform applies to the same rows on its analytics path and the role floor the sibling artifact on the same export surface enforces (the sms-report export is admin-gated because it carries contact names, phone numbers and message text - the same data class the campaign CSV carries, ungated). So the export emits every agent's rows, and hands back a 24 hour pre-signed download URL, to a requester the product otherwise scopes to their own attempts.
- Resolution: Apply the platform's own scope rule to the export surface instead of re-deriving one: raise every export-surface gate to the `member` floor the sibling write surfaces use (leaving the sms-report artifact on its stricter admin gate), including the two listing loaders that publish stored downloadUrl values, and pass the requester's identity into the export pipeline so the attempt selection can be narrowed to outreach_attempt.user_id = requester whenever the requester may not view all users, matching the canViewAllUsers rule the analytics path applies. Gating the listing loaders matters as much as gating the trigger: a `caller` that cannot start an export can still read a member's stored…
- Look in: `app/lib/platform-analytics.server.ts`, `app/lib/workspace-analytics.server.ts`, `app/components/analytics/WorkspaceAnalyticsPanel.tsx`, `app/lib/campaign-export-db.server.ts`, `app/lib/campaign-export.server.ts`, `app/lib/campaign-export-helpers.server.ts`
- Existing tests: 8 of 8 assertions passed against the private Postgres 18. The real export route action, invoked with the `caller` member's session, returned an exportId (no error), i.e. the membership-only gate admitted the lowest-trust role. The artifact it produced (captured at the object-storage boundary) contained BOTH attempts:…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: An export must not contain data above the requester's access level. The platform's scope rule is source-visible: app/lib/platform-analytics.server.ts:57 excludes the `caller` role from canViewAllUsers and app/lib/workspace-analytics.server.ts:41-49 then filters attempts to outreach_attempt.user_id = currentUserId. Sibling surfaces that act on the same records gate on role or capability: app/routes/api+/campaign_audience.action.server.ts:76 and app/routes/api+/contacts/$contactId.action.server.ts:25 both require the `member` role, and app/routes/api+/campaigns/$campaignId.action.server.ts:32 likewise. The same export surface already gates the sibling sms-report artifact behind `admin` for carrying contact names, phone numbers and message text (app/routes/api+/campaign-export-status.loader.server.ts:60-62). A `caller` should therefore not be able to bulk-read other agents' call results.

### [#2881](https://github.com/chester-hill-solutions/callcaster/issues/2881) A tenant workspace delete is aborted by the job table's NO ACTION foreign key, so the delete removes nothing and…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **A tenant workspace delete is aborted by the job table's NO ACTION foreign key, so the delete removes nothing and the tenant's data survives**
- deleteWorkspaceById (app/lib/workspace-members-db.server.ts:375-381) issues a single 'DELETE FROM workspace WHERE id = $1 RETURNING *' through the unscoped adminDb and relies entirely on database cascade for the tenant's rows
- Current behavior: deleteWorkspaceById (app/lib/workspace-members-db.server.ts:375-381) issues a single 'DELETE FROM workspace WHERE id = $1 RETURNING *' through the unscoped adminDb and relies entirely on database cascade for the tenant's rows. The job table is the one tenant table that does not cascade: drizzle/0003_job.sql:8 declares 'workspace_id uuid REFERENCES workspace(id)' with the default NO ACTION referential action, and no migration in client/migrations/ changes it. As long as any job row references the workspace, Postgres rejects the whole DELETE with 'update or delete on table "workspace" violates foreign key constraint "job_workspace_id_fkey" on table "job"' (SQLSTATE 23503).…
- Root cause: The job table's workspace foreign key was created without ON DELETE CASCADE (drizzle/0003_job.sql:8, the only place in the repo that creates public.job), and the workspace delete path (app/lib/workspace-members-db.server.ts:375) performs a bare row delete with no teardown of the job rows (or of any other non-cascading residue) that reference the workspace. Postgres therefore refuses the DELETE instead of cascading, and the application treats the refusal as an ordinary error rather than as a lifecycle contract failure.
- Resolution: Make the tenant delete a real teardown instead of a bare row delete. (1) Give job.workspace_id the same ON DELETE CASCADE every other tenant table has. On a database that already has the constraint this needs a NEW migration that drops and recreates job_workspace_id_fkey with ON DELETE CASCADE - editing drizzle/0003_job.sql alone is a no-op for any database that was already bootstrapped - and drizzle/0003_job.sql must be updated too so a fresh bootstrap gets the cascading constraint. (2) Remove the workspace's job rows inside the same transaction immediately before the workspace row, so the delete cannot be blocked by a row the tenant no longer controls. (3) Run the whole teardown in one…
- Look in: `drizzle/0003_job.sql`, `client/migrations/20261007000001_uuid_workspace_references.sql`, `app/lib/workspace-members-db.server.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/worker/enqueue-job.server.ts`, `app/routes/api+/audience-upload.action.server.ts`
- Existing tests: deleteWorkspaceById THREW: 'Failed query: delete from "workspace" where "workspace"."id" = $1 returning "created_at", "credits", ...' with cause 'PostgresError: update or delete on table "workspace" violates foreign key constraint "job_workspace_id_fkey" on table "job"' (SQLSTATE 23503). handleDeleteWorkspace returned…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A workspace owner deleting their workspace (or a platform operator deleting a tenant on request) expects the delete to succeed and to remove the tenant's data, including its queued work. Either the job rows must be removed with the workspace, or the job table's workspace reference must cascade like every other tenant table, so the delete cannot be blocked by a row the tenant no longer controls.

### [#2879](https://github.com/chester-hill-solutions/callcaster/issues/2879) Outbound credit gate reserves nothing, so concurrent voice dispatches overshoot the funded balance and drive…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Outbound credit gate reserves nothing, so concurrent voice dispatches overshoot the funded balance and drive workspace.credits negative**
- Every outbound dispatch entry point gates on requireOutboundCredits (app/lib/outbound-credit-gate.server.ts:44-55), which reads workspace.credits once and compares it against OUTBOUND_CREDIT_FLOOR (0)
- Current behavior: Every outbound dispatch entry point gates on requireOutboundCredits (app/lib/outbound-credit-gate.server.ts:44-55), which reads workspace.credits once and compares it against OUTBOUND_CREDIT_FLOOR (0). The comparison reserves nothing, and the floor sits below the price of the cheapest outbound unit (2 credits for an IVR first minute, 4 for a staffed first minute), so a workspace holding 1 credit passes the gate for a call it cannot pay for. The debit for a voice dispatch is written when the call reaches a terminal billable status (app/lib/twilio-call-status.server.ts:193), not when the call is placed, so workspace.credits does not fall until after the calls have run. The number of outbound…
- Root cause: requireOutboundCredits is a balance read plus a floor comparison with no reservation of the amount the dispatch is about to spend, and the floor it compares against (0) is below the cost of the smallest outbound unit. Because the voice debit is written only when the call reaches a terminal billable status, the check-then-act window covers every call that is in flight rather than a single call, and the ledger RPC applies the delta with no floor (credits = coalesce(credits, 0) + p_amount) so nothing downstream repairs the result. The SMS dispatch path holds a per-batch per-dispatch budget and the number-purchase path holds credits with a workspace-row lock; no voice dispatch path reserves…
- Resolution: Reserve the cost of the outbound dispatch in the same atomic statement that reads the balance, the way the number-purchase path already holds credits with a workspace-row lock and the way the SMS batch path holds a per-dispatch budget, and compare the balance against that cost rather than against zero. The hold must be released when the dispatch never reaches the provider and settled when the completion debit is written, so the workspace is not left over-reserved; the hold is set to the per-call first-minute price, and a per-call reservation record (the shape app/server/number-purchase-reservation.server.ts already uses) is the form that lets the hold be set to the per-call maximum and…
- Look in: `app/lib/outbound-credit-gate.server.ts`, `app/lib/workspace-credits.server.ts`, `shared/credit-floor.ts`, `shared/pricing.ts`, `app/routes/api+/dial.action.server.ts`, `app/lib/campaign-sms-dispatch-primitives.server.ts`
- Existing tests: 5/5 tests passed against real Postgres 18 with the repository's own migration chain. requireOutboundCredits admitted a 1-credit workspace ({ ok: true, balance: 1 }) although the cheapest outbound voice unit costs 2 credits, the effective floor refuses a 0-credit workspace, and the sibling SMS budget refuses that same…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: docs/credit-floor-policy.md defines app/lib/outbound-credit-gate.server.ts as 'the single gate every outbound entry point calls' and the block tier as 'block when balance cannot fund new outbound usage', with 'no negative-balance grace for new outbound'; it records that the campaign SMS batch path 'reserves each message's estimated cost before its send starts' so a batch cannot spend the same stale balance. The gate protects two principals: the workspace owner, whose funded credit balance is the money being spent, and the operator, whose Twilio account pays for every call before the workspace's balance is settled. The gate is therefore expected to admit only outbound the balance can fund, at the moment of admission.

### [#2870](https://github.com/chester-hill-solutions/callcaster/issues/2870) POST /api/ivr places a machine-dialed IVR campaign call without reading the recipient's opt-out state or the…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
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
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Audience CSV upload reads an unbounded request body, then persists the whole file (base64) into the shared job queue and the shared object-storage bucket**
- Independently re-verified at commit 67d40abb (branch dev)
- Current behavior: Independently re-verified at commit 67d40abb (branch dev). POST /api/audience-upload reads the multipart body with a bare `await request.formData()` (app/routes/api+/audience-upload.action.server.ts:93) - no byte cap, no Content-Length pre-check, no streaming bound - so the whole upload is buffered in the request handler before anything else happens. The file is then copied into a second full-size ArrayBuffer (line 150), decoded (line 153), fully parsed by parseCSV() (line 157) although only `parsedFile.headers` is used (line 158), base64-encoded (line 202), written whole to the shared 'audience-uploads' bucket (line 221) and queued verbatim as `params.fileContent` (line 256) into the…
- Root cause: The route reads the multipart body with `await request.formData()` (app/routes/api+/audience-upload.action.server.ts:93) instead of the repository's bounded reader `readBoundedFormData(request, MAX_MEDIA_BODY_BYTES)` that the sibling media upload routes use (app/routes/api+/media.action.server.ts:28, app/routes/api+/message_media.action.server.ts:53). Nothing downstream bounds the size either: the file is copied whole into an ArrayBuffer (line 150), decoded (line 153), fully parsed by parseCSV (line 157) although only the headers are used (line 158), base64-encoded (line 202), written to object storage (line 221) and queued verbatim as `params.fileContent` (line 256). The queued payload is…
- Resolution: Apply the repository's existing bounded-body control to this route instead of writing a new one, bound the file itself, stop materialising every row in the request path, and stop copying the whole file into the queue payload. Concretely: (1) read the body with `readBoundedFormData(request, MAX_AUDIENCE_BODY_BYTES)` and map FormBodyError to 413, the way app/routes/api+/media.action.server.ts does; (2) add an explicit file-size check on the `contacts` part before arrayBuffer(); (3) read only the header row for the mapped-column validation instead of parseCSV() over the whole file; (4) drop `fileContent` from the queued params and change the worker to read the already-stored object by key, so…
- Look in: `app/routes/api+/audience-upload.action.server.ts`, `app/lib/bounded-form-data.server.ts`, `app/lib/media-upload.server.ts`, `app/routes/api+/media.action.server.ts`, `app/routes/api+/message_media.action.server.ts`, `docs/api-data-management.md`
- Existing tests: Check 1: the route accepted the payload - HTTP 200 with {success:true, audience_id 22, upload_id 99}; uploadObject received bucket 'audience-uploads', key <workspaceId>/99/original.csv and storedObjectBytes equal to the accepted CSV bytes (25,165,832); the queued 'audience_upload' job carried params.fileContent of…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: The request body is bounded before it is buffered, using the control the repository already ships and documents for uploads: `readBoundedFormData(request, MAX_AUDIENCE_BODY_BYTES)` returns 413 above the cap and cancels the stream, the way app/routes/api+/media.action.server.ts does, so an upload above the platform's declared upload ceiling is rejected instead of being buffered, parsed and persisted. The uploaded file is additionally size-checked (the media routes do this with `validateMediaFile`), the header validation reads only the header row instead of materialising every row, the queue payload carries a reference to the stored object rather than a base64 copy of the whole file, and the stored original is deleted once the import completes so the shared bucket does not retain every upload forever.

### [#2866](https://github.com/chester-hill-solutions/callcaster/issues/2866) Failed credential-bearing workspace writes copy the tenant's Twilio API key secret and subaccount auth token into…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Failed credential-bearing workspace writes copy the tenant's Twilio API key secret and subaccount auth token into the log stream and into the error response**
- CallCaster stores each tenant's Twilio provider credentials in three columns of public.workspace: `key` (Twilio API key SID), `token` (Twilio API key secret) and `twilio_data` (a JSON blob whose `authToken` is the live Twilio subaccount…
- Current behavior: CallCaster stores each tenant's Twilio provider credentials in three columns of public.workspace: `key` (Twilio API key SID), `token` (Twilio API key secret) and `twilio_data` (a JSON blob whose `authToken` is the live Twilio subaccount auth token). Every write that persists those columns binds them as SQL parameters of an UPDATE. Under the pinned drizzle-orm 0.45.2 a failed statement is wrapped in `DrizzleQueryError` (node_modules/drizzle-orm/pg-core/session.js:41) whose message is `Failed query: <sql>` plus a `params: <bound values>` line (node_modules/drizzle-orm/errors.js:12), so the credential is rendered into the error text. The repository's logger copies `error.message` into the…
- Root cause: app/lib/logger-core.ts#serializeError treats the error text as safe: it copies `error.message` (line 66), up to three `cause` messages (line 60) and the stack (line 69, whose first line repeats the message) verbatim into the log entry, and the module contains no redaction, scrubbing or allowlist layer at all. Because Drizzle renders bound parameter values into `DrizzleQueryError.message`, any failed statement that binds a credential as a parameter carries that credential into the emitted log line - and, because app/lib/errors.server.ts#createErrorResponse attaches the raw error object to the `http.error_response` entry, into that line's `err.params` array as well, which survives any fix…
- Resolution: Scrub bound SQL parameter values out of driver error text before it reaches any sink, and stop returning raw error messages to clients - but scrub every copy of the text, not only the message. Three changes close the class: (1) in app/lib/logger-core.ts, strip the `params:` segment from the message, the cause chain AND the stack, because the stack's first line repeats the message and a message-only scrub still leaks the credential into the log line; (2) in app/lib/errors.server.ts, render the client-visible field with the repository's own toUserMessage(error, defaultMessage) and keep the raw error server-side only, as docs/pg-error-strictness.md:38 already requires; (3) in…
- Look in: `app/lib/logger-core.ts`, `app/lib/logger.server.ts`, `node_modules/drizzle-orm/errors.js`, `node_modules/drizzle-orm/pg-core/session.js`, `app/db/schema.ts`, `app/lib/twilio-workspace-credentials.ts`
- Existing tests: The caught error's constructor is DrizzleQueryError and its message is: 'Failed query: update "workspace" set "key" = $1, "token" = $2, "twilio_data" = $3 where "workspace"."id" = $4\nparams: SKdummy00000000000000000000000000,DUMMY_TWILIO_API_KEY_SECRET_0123456789,{"sid":"ACdummy00000000000000000000000000","authToken":…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A workspace's Twilio provider credentials must never leave the server process into a log line, an alert email, a third-party error tracker, or an HTTP response body. The repository states this policy for the audit trail (app/lib/audit-event.server.ts#redactAuditEventMetadata drops password/secret/token/authorization/body/credential keys) and for user-facing errors (docs/pg-error-strictness.md:38 - 'Never return a raw caught error object in action/loader data ... serialize a { message } built with toUserMessage(error, fallback) and log the original server-side'; app/lib/user-message.ts:20 denies the phrase 'failed query' precisely to redact Drizzle messages). The logger and the shared error responder are the two sinks that bypass both controls.

### [#2862](https://github.com/chester-hill-solutions/callcaster/issues/2862) Public api+ multipart routes buffer the whole request body with no byte cap
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- POST /api/contact-form is a public, unauthenticated multipart route: the route module re-exports the action (app/routes/api+/contact-form.tsx:1), the path is in scripts/baselines/route-tree.txt:68, and the repository's own API surface…
- Current behavior: POST /api/contact-form is a public, unauthenticated multipart route: the route module re-exports the action (app/routes/api+/contact-form.tsx:1), the path is in scripts/baselines/route-tree.txt:68, and the repository's own API surface inventory lists it as publicUnauthenticated (docs/api-surface-inventory.md:64). The action reads the body with await request.formData() at app/routes/api+/contact-form.action.server.ts:36 - no byte cap - before any of its own field limits run. An anonymous multipart POST carrying a 32 MiB body made the shared web process grow by 64.5 MiB of resident memory inside the request (measured: 202.4 MiB -> 270.1 MiB peak RSS, still 269.5 MiB after a forced GC), and…
- Root cause: The request-body size check this codebase already implements as app/lib/bounded-form-data.server.ts#readBoundedFormData was applied only to the media upload surfaces. Every other multipart route under app/routes/api+ calls the platform's request.formData() directly, which reads the entire body into process memory before any field validation runs, so the bytes one caller can make the shared web process hold are bounded only by the transport's own per-request default (Bun's 128 MB, node_modules/bun-types/serve.d.ts:676, not overridden at server/bun.ts:357) and by nothing at all in aggregate.
- Resolution: Read every request body through the reader this codebase already has. Replace each direct request.formData() in app/routes/api+ with readBoundedFormData(request, cap) and map FormBodyError to its 413 status, choosing a cap from the route's own field limits (a few tens of KiB for the contact form, a few hundred KiB for survey submissions). Apply the same to the authenticated variants (audiodrop, surveys). As defence in depth, set an explicit maxRequestBodySize on Bun.serve so the transport, not just the handler, bounds a request body; keep it above the largest legitimate body (the media upload cap is 10 MiB + 64 KiB).
- Look in: `app/routes/api+/contact-form.tsx`, `app/routes/api+/contact-form.action.server.ts`, `app/lib/handler.server.ts`, `app/lib/platform-rate-limit.server.ts`, `client/migrations/20260714120000_rate_limit_bucket.sql`, `app/lib/bounded-form-data.server.ts`
- Existing tests: Bun 1.3.14 in the sandbox (the production Docker image pins oven/bun:1.3.5 and package.json allows bun >=1.2.15). request.formData() over a streamed 32 MiB multipart body: +67.8 MB resident (2.02x body). Real POST /api/contact-form action, 32 MiB body with the honeypot filled: peak RSS 202.4 -> 270.1 MiB (+64.5 MiB,…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A route should read a request body only through a reader that caps the bytes it will consume and rejects an oversized body with 413, so that a field-level limit (MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH, a honeypot) bounds the work rather than being validated after the fact. readBoundedFormData(request, maxBytes) already does exactly this and is used by the media surfaces for a ~10 MiB body, with the repository's own test suite (test/bounded-form-data.test.ts) asserting the 413 and the early stream cancellation. The public and authenticated multipart routes should use the same reader with a cap sized for their own fields, and the transport should carry an explicit maxRequestBodySize as a backstop.

### [#2861](https://github.com/chester-hill-solutions/callcaster/issues/2861) Legacy flat PATCH /api/contacts authorizes on membership alone, so a `caller` can rewrite any contact in its…
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Legacy flat PATCH /api/contacts authorizes on membership alone, so a `caller` can rewrite any contact in its workspace and clear the opt_out consent flag the…**
- The legacy flat contact route under app/routes/api+ authorizes POST and PATCH /api/contacts on workspace MEMBERSHIP alone: the body workspace_id is taken from the request, requireWorkspaceAccess is called with no minRole, and no product…
- Current behavior: The legacy flat contact route under app/routes/api+ authorizes POST and PATCH /api/contacts on workspace MEMBERSHIP alone: the body workspace_id is taken from the request, requireWorkspaceAccess is called with no minRole, and no product capability is ever checked (app/routes/api+/contacts.action.server.ts:41). requireWorkspaceAccess admits every role in WORKSPACE_MEMBERSHIP_ROLES - including `caller` - whenever minRole is omitted, because hasMinRole returns true for an undefined floor (app/lib/workspace-membership.server.ts:183). Because updateContact builds its UPDATE column set from every request-body entry except audience_id (app/lib/database/contact.server.ts:266), a `caller` can…
- Root cause: app/routes/api+/contacts.action.server.ts performs the authorization decision with a bare membership check (requireWorkspaceAccess({ user, workspaceId }) at line 41) and never calls a capability or role guard, while the canonical contact create/update route gates the same state change on the `member` role (app/routes/workspaces+/$id/contacts/$contactId.action.server.ts:37). The legacy route then hands the whole request body to updateContact, which uses it verbatim as the UPDATE column set (app/lib/database/contact.server.ts:266), so a column the product deliberately excludes from its own editor - opt_out, the consent flag - becomes caller-controlled.
- Resolution: Close the legacy flat contact UPDATE path behind the same rule the product already applies to its canonical contact editor: the `member` role floor and the campaigns.write capability, and stop treating the raw request body as the column set. Gate PATCH /api/contacts on campaigns.write plus a `member` role floor, and replace the blanket body-to-column mapping in updateContact with an explicit allowlist of the fields the contact editor is allowed to change (dropping opt_out, created_by and id from caller input entirely). Leave POST /api/contacts membership-only, because contact CREATION by callers is deliberate product behaviour (chat composer, queue picker); the same allowlist should be…
- Look in: `app/routes/api+/contacts.action.server.ts`, `app/routes/workspaces+/$id/contacts/$contactId.action.server.ts`, `app/server/contact-editor.server.ts`, `app/lib/database/contact.server.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/capabilities.ts`
- Existing tests: All 5 local checks passed in the audit sandbox (private Postgres 18 with the full migration chain bootstrapped inside the same command; no network egress). PATCH /api/contacts with a `caller` membership returned HTTP 200, and re-reading the row from the database showed opt_out flipped from true to false and phone…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A workspace member holding the lowest role (`caller`) must not be able to mutate an existing contact record, and no role may set the opt_out consent flag through the generic contact-update endpoint. The product already enforces both rules on its canonical contact editor route: the write action requires the `member` role and answers 403 to a `caller` (app/routes/workspaces+/$id/contacts/$contactId.action.server.ts:37), and it writes a fixed field set that excludes opt_out (app/server/contact-editor.server.ts:8). Contact deletion is `campaigns.write` plus a `member` floor (app/routes/api+/contacts/$contactId.action.server.ts:24), and `caller` does not hold campaigns.write (app/lib/capabilities.ts:76). The legacy flat route should apply the same capability and role floor to PATCH /api/contacts and accept a fixed column set rather than the raw request body. Contact CREATION via POST /api/contacts must stay membership-only, because the chat composer and the queue picker legitimately create contacts as a `caller` (app/routes/api+/contacts.loader.server.ts:33).

### [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) Provision a CallCaster-qa Twilio account and point qa.callcaster.ca at it
- Verdict: **Fix now** · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-20
- No dedicated CallCaster-qa Twilio account exists and qa.callcaster.ca is not pointed at one: the QA Railway environment still copies the dev/shared Twilio credentials and there is no Twilio account provisioning in the IaC model or in any script.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The issue has no symptom body — it is an infrastructure provisioning task. The repo's own board records that it 'closed as not planned on 2026-10-17' (ISSUE_BOARD.md:865, scripts/issue-board-enrichment/blocked-epic.json:298), and the related #1828 QA acceptance suite was re-scoped because of it. The DNS/IaC half (#1357) did land (docs/qa-rehearsal-runbook.md, .railway/environments/qa.ts), but the Twilio-account half did not. manual: true because creating a Twilio account and repointing a live domain is a console/ops action a human performs, not something a code change or test can confirm.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `.railway/environments/qa.ts`, `ISSUE_BOARD.md`
- Existing tests: None. There is no test or check that asserts a QA-specific Twilio account; `git grep -n "qa.callcaster.ca" origin/master -- .` returns only .railway/environments/qa.ts and docs/qa-rehearsal-runbook.md.

### [#100](https://github.com/chester-hill-solutions/callcaster/issues/100) "Theme" value from ThemeProvider is undefined by default
- Verdict: **Fix now** · Labels: none · Assignee: @manstephen, @wra-sol · Updated: 2026-10-20
- Browser verification confirms that both workspace member icons use black in system-dark mode. The candidate fix uses the themed button foreground, including before the theme is resolved.
- Current behavior: Confirmed on the dev source in an isolated browser fixture with real components and app CSS; the live dev workspace had no eligible member rows. PR #2753 (https://github.com/chester-hill-solutions/callcaster/pull/2753) is awaiting review and merge.
- Root cause: TeamMember compares the raw next-themes theme with dark and supplies black otherwise. System mode keeps theme equal to system even when resolvedTheme is dark. An undefined value before hydration is expected from next-themes, so changing the provider default would conceal the wrong dependency. CSS currentColor and the existing theme tokens remove that dependency. The default button variant also supplies a dark primary background despite bg-transparent; the ghost variant supplies the intended transparent icon control and readable hover colours.
- Resolution: Use the compact icon-xs ghost buttons and inherit their themed foreground for both icons. Browser measurements confirm 12 px icons in 28 px buttons and 8 px role dots; preserve the next-themes provider and system default.
- Look in: `app/components/shared/theme-provider.tsx`, `app/components/workspace/TeamMember.tsx`, `app/components/shared/mode-toggle.tsx`, `app/root.tsx`
- Existing tests: test/ui/team-member-theme.test.tsx — both icons inherit light and dark button foregrounds without a theme provider; all four cases fail against the original component; test/ui/team-member-a11y.test.tsx, test/ui/platform-member-controls.test.tsx and test/ui/mode-toggle.test.tsx — accessible names, member permissions and theme switching; Isolated browser verification — explicit light/dark, system-light/system-dark, a system preference change, and opening the member sheet with the keyboard; both icons measure 12 px in 28 px buttons and match the app foreground. Role dots measure 8 px and align with the member names in every mode.
- Done when: Manage-member and cancel-invite icons use the correct foreground in light, dark and system modes.; Icons render without waiting for a JavaScript theme value; theme switching and member actions remain available.

### [#2684](https://github.com/chester-hill-solutions/callcaster/issues/2684) Decide the CORS policy for the public API
- Verdict: **Fix now** · Labels: wayfinder:grilling · Assignee: @wra-sol · Updated: 2026-10-20
- This change states the existing server-to-server CORS policy in both quickstarts and the public error reference, and replaces the overview's stale Express wording. Review and merge remain.
- Current behavior: Production documentation has the policy only in the overview's final CORS section. The candidate puts the backend requirement before the examples and explains browser preflight failures separately from API HTTP errors.
- Root cause: The earlier closure recorded the policy decision but left its promised quickstart and error-reference guidance unwritten. Only the overview's final CORS section mentioned the constraint, and it still named the retired Express layer.
- Resolution: Review and merge the documentation completion. Keep CORS disabled and retain the decision; no API runtime or schema change is required.
- Look in: `docs/api-overview.md`, `docs/api-agent-quickstart.md`
- Existing tests: Manual documentation check: all six added local links resolve to their target headings; Source review: the Bun server and public API auth add no CORS allow headers; the MDN CORS guide confirms the distinction between a blocked preflight request and a blocked response
- Done when: The overview, quickstarts and error reference state that public integrator calls are server-to-server and workspace API keys stay on the backend; The error reference explains that failed preflight blocks the intended request, while a request without preflight can reach the server but its response remains blocked in browser JavaScript; Same-origin browser session access remains documented and CORS remains disabled
- Tracker: Live inspection on 2026-10-20: Task; Priority, Effort and Enviornment unset; Project Status In progress; assigned to wra-sol. Parent #2677; no children, dependency links or active fixing PR at the start. Keep the issue open until the documentation reaches master.

### [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) IVR: store speech answers as { value, raw, inputType } (slice B)
- **IN PROGRESS** · Verdict: **Fix now** · Labels: none · Assignee: none · Updated: 2026-10-19
- Slice A and slice B items 4-5 shipped: a vx-any step sends hints with a valid speechModel/speechTimeout pairing, a single-key menu sends numDigits, and every recorded speech answer is stored as `{ value, raw, confidence, inputType }` — but slice B item 6 (normalised intent matching, per-option spoken aliases, a confidence threshold and a re-prompt) is not implemented and is deferred to the #1880 decision.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: Two commits are in origin/master: 642f4ee7 'feat(ivr): improve speech capture with hints, valid model, and numDigits (#1875) (#1876)' (slice A) and 9dcab08b 'feat(ivr): store structured speech answers (#2160)' (slice B items 4-5). The brief's candidate list only names the slice A commit, which by itself would not satisfy the slice B title; the slice B shape landed later under PR #2160 and is what the master tree contains. The remaining slice B item 6 is knowingly deferred: the repo's own triage record for #1880 ('Decide: adopt Jev (TypeSafe) or hand-roll IVR speech intent', scripts/issue-board-enrichment/needs-decision.json:311-328) says its decision 'decides #1862 and the deferred confidence slice of #1875', and the board still lists #1880 in the 'Needs decision' lane. Because the issue's own acceptance criteria (hints + valid model/timeout pairing, numDigits, and a confidence value on each recorded speech answer) are all met but the slice-B scope named in the title is not complete, the verdict is PARTIAL rather than VERIFIED. manual: false — everything that is implemented is machine-checkable.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/lib/ivr-gather.server.ts`, `app/lib/ivr-webhook-auth.server.ts`, `app/lib/ivr-results.ts`
- Existing tests: test/ivr-webhook-auth.server.test.ts — 'captures speech text and a valid Twilio confidence score' (Confidence "0.87" → `answer.confidence === 0.87`), 'keeps confidence null when Twilio sends an invalid or missing value', 'records DTMF as structured input without speech confidence'; test/ivr-results.test.ts — the `IvrRecordedAnswer` aggregation; test/campaign-export-voice-credits.test.ts — the export carries the structured answer and its confidence; test/ivr-gather.test.ts — the gather attributes (hints / speechTimeout / speechModel / numDigits / input). Ran green: test/ivr-webhook-auth.server.test.ts, test/ivr-results.test.ts and test/campaign-export-voice-credits.test.ts all passed.

### [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) Dev-environment PR acceptance suite
- Verdict: **Fix now** · Labels: devops/admin · Assignee: none · Updated: 2026-10-19
- Nothing in origin/master provides a dev-environment PR acceptance suite: the only PR-level end-to-end gate is the local docker-compose Playwright run, and the Twilio tier uses Twilio's free test credentials, not a CallCaster-dev account.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: This issue is an acceptance-suite work item, not a code defect, so nothing in the tree can 'fix' it in the usual sense. The upstream dependency is #1827 'Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it', which the board still lists in the 'Blocked / split first' lane (ISSUE_BOARD.md:565-574) with #1356 (dev DNS/IaC) ahead of it. manual: true because the missing artefact is a dev-environment acceptance run that only a person with the dev Twilio account and dev environment credentials can execute.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `test/integration-twilio/twilio-test-credentials.test.ts`
- Existing tests: None. `git ls-tree -r origin/master --name-only | grep -i acceptance` returns nothing, and there is no dev-environment Playwright project (e2e/playwright.config.ts and e2e/playwright.sim.config.ts both target the local compose/sim stack).

### [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) Receipts: state how many credits were bought
- **IN PROGRESS** · Verdict: **Fix now** · Labels: none · Assignee: @sai-sy · Updated: 2026-10-19
- Nothing in origin/master changes the Stripe receipt to say how many credits were bought: the Checkout Session still creates ONE line item with `quantity: 1` and the whole package price in `unit_amount`, with the credit count folded into the product name — so the receipt still reads '500 workspace credits x 1', not 'Workspace credits x 500'.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The claimed fix (070f04f4 'fix(billing): receipts state credit count + contact@callcaster.ca ... (#1997)', PR #1997) IS an ancestor of origin/master (merged by 61594cdf on 2026-09-24) — but it does not implement the requested behaviour, it implements the rejected alternative. What is missing from origin/master: a Checkout Session whose line item is `name: 'Workspace credits'` with `quantity: <credits bought>` and a per-credit `unit_amount`, so the receipt states the count. The fix for that lives only on `origin/change-request/1981-credit-receipt-quantity` (8225f5ce) and has not been promoted. manual: true — the symptom is a real Stripe receipt (or a real credit balance on the account) that a person has to read; the unit test only inspects the request payload.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/lib/platform-billing.server.ts`
- Existing tests: None that proves the receipt text. test/platform-billing-checkout.test.ts asserts the Checkout request SHAPE (`quantity === 1`, name contains the formatted count) rather than the rendered receipt, so it passes while the reported symptom remains. There is no Stripe test-mode session, no receipt assertion and no screenshot of a real receipt in the repo.

### [#1938](https://github.com/chester-hill-solutions/callcaster/issues/1938) Epic: construct the scoped tenant client in middleware and enforce the boundary beyond routes
- Verdict: **Fix now** · Size: S-M · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- PARTIAL: middleware reuses the scoped tenant client, but the released import guard skips JavaScript modules. The candidate guard covers supported JavaScript/TypeScript extensions and counts every statically named import.
- Current behavior: Verified against master@91c4409b and dev@e4bb8ac6 on 2026-10-21. A new app/lib JavaScript module importing @/server/admin-db passes the released guard; equivalent TypeScript probes fail. The old baseline stores file/module presence and cannot detect an extra import in an existing exception.
- Root cause: The guard scans only .ts and uses regular expressions plus a Set. It misses supported module forms and collapses repeated imports into one baseline key.
- Resolution: Parse supported JavaScript/TypeScript files with the existing TypeScript parser. Count static imports, re-exports, dynamic imports, require calls and type imports. Migrate only the pinned base debt and reject new, increased, reduced or stale counts.
- Look in: `scripts/check-unscoped-db-imports.mjs`, `scripts/baselines/unscoped-db-imports.txt`, `test/unscoped-db-imports-guard.test.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`
- Existing tests: test/unscoped-db-imports-guard.test.ts: 46 actual CLI cases; 39 fail and 7 controls pass on the original guard. All 46 pass with the fix.; Pinned dev baseline: the same 84 file/module keys, 85 syntax occurrences; no new source exceptions. Separate fault injections exercise extension coverage, module syntax, counts, stale debt and fixture-root safety.
- Missing tests: Review and merge the candidate, then verify the exact promoted guard before closing.
- Done when: Workspace and nested data-plane routes reuse middleware tdb for plain request-scoped access; documented flat and transaction routes keep their explicit client.; A new app/lib module cannot import an unscoped database client without a counted baseline exception.; Existing exceptions cannot grow; reduced or removed imports require a smaller baseline.; npm run ci:local is green.
- Tracker: Reopened after the JavaScript probe disproved the first closure. Native Type Epic; assigned wra-sol; organization fields unset; all three children closed, no blockers. Live Project Status In progress. Remaining work is code, manual false. Keep open until the complete guard reaches master and is verified.

### [#2896](https://github.com/chester-hill-solutions/callcaster/issues/2896) POST /api/jobs/twilio-open-sync stores unbounded sweep limits: a negative limit silently removes the sweep's LIMIT…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **POST /api/jobs/twilio-open-sync stores unbounded sweep limits: a negative limit silently removes the sweep's LIMIT and a non-positive maxAgeMinutes collapses…**
- POST /api/jobs/twilio-open-sync narrows callLimit, messageLimit and maxAgeMinutes with a bare `typeof body.X === "number"` check, and the job's params schema (legacyNumericParam) keeps any finite number, negative and zero included
- Current behavior: POST /api/jobs/twilio-open-sync narrows callLimit, messageLimit and maxAgeMinutes with a bare `typeof body.X === "number"` check, and the job's params schema (legacyNumericParam) keeps any finite number, negative and zero included. A negative limit is neither rejected nor clamped: Drizzle 0.45.2 emits the LIMIT clause only when the limit is an object or a number greater than or equal to zero (node_modules/drizzle-orm/pg-core/dialect.js:286), so the sweep's 'bounded' SELECT silently becomes an unbounded read of every open call/message row of that tenant (Postgres itself would have answered 'LIMIT must not be negative'), and the same negative value is forwarded verbatim to the provider call…
- Root cause: The per-route body narrowing (app/routes/api+/jobs+/twilio-open-sync.action.server.ts:15) accepts any number and the registered params schema (app/lib/worker/job-params.server.ts:68 -> legacyNumericParam, app/lib/worker/job-registry.server.ts:124-132) has no lower bound, so an out-of-range value is stored as job.params and later used both as a SQL row bound and as a provider page size. withReschedule (app/lib/worker/handlers/cron.server.ts:91) then copies the parsed params verbatim into the chain successor, so whenever a workspace-less job carries such a value it becomes the chain's permanent configuration instead of one run's parameter.
- Resolution: Bound the three numbers at the route so a negative or zero value can never be stored: a limit must be a positive integer and maxAgeMinutes must be at least 1, so the 404 grace window can never collapse. Add the same lower bound to the registered params schema as defence in depth, and stop the chain from inheriting an unvalidated parameter: have the handler pass the sweep's own defaults to withReschedule rather than the job's parsed params, so one bad row cannot reconfigure the chain. Note the ordering hazard when adding the schema bound: the params are parsed in the registry wrapper (app/lib/worker/job-registry.server.ts:106) BEFORE the handler's withReschedule runs, so a schema that…
- Look in: `app/routes/api+/jobs+/twilio-open-sync.action.server.ts`, `app/lib/worker/job-registry.server.ts`, `app/lib/worker/job-params.server.ts`, `app/lib/worker/handlers/cron.server.ts`, `app/lib/worker/handlers/shared.server.ts`, `app/lib/worker/cron-job-enqueue-route.server.ts`
- Existing tests: Route: the workspace-scoped POST returned {"ok":true,"enqueued":true,"deduped":false,"jobId":5} and the stored row read back as params {"callLimit":-1,"messageLimit":-1,"maxAgeMinutes":-1} with workspace_id set to the named tenant -- the negative limits were stored unchanged. The workspace-less POST against the live…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: The three numbers are the sweep's budgets, not free-form input: callLimit/messageLimit bound how many open rows one run may touch, and maxAgeMinutes is the grace window that decides when a call the provider does not know yet may be terminalized ('Terminalize it as failed once it is old enough that a race with call creation is impossible', app/lib/twilio-open-sync.server.ts:234). A limit must be a positive integer and maxAgeMinutes must be at least 1, so a negative or zero value can never be stored; and the chain successor must not inherit an unvalidated parameter, because the successor is the platform's only scheduler for this job ('These chains are the only scheduler: there is no pg_cron and no external trigger', app/lib/worker/handlers/shared.server.ts:8), so a bad value there is permanent.

### [#2888](https://github.com/chester-hill-solutions/callcaster/issues/2888) API error responses return raw database error text, disclosing the failed statement's internal table and column…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **API error responses return raw database error text, disclosing the failed statement's internal table and column names**
- app/lib/errors.server.ts#handleDatabaseError (line 160) builds an AppError whose message is the raw driver error text prefixed with a context string, and app/lib/errors.server.ts#createErrorResponse (lines 80 and 87) puts that message into…
- Current behavior: app/lib/errors.server.ts#handleDatabaseError (line 160) builds an AppError whose message is the raw driver error text prefixed with a context string, and app/lib/errors.server.ts#createErrorResponse (lines 80 and 87) puts that message into the response body together with the Postgres SQLSTATE; createErrorResponse returns the payload unmodified at line 125. The defineAction/defineLoader wrapper (app/lib/handler.server.ts:118) routes any uncaught error into createErrorResponse, and the traced route's own catch (app/routes/api+/surveys.action.server.ts:175) does the same, so any route handler that lets a database error escape returns database error text to the caller. Independently reproduced…
- Root cause: app/lib/errors.server.ts#createErrorResponse uses the raw Error message as the client-facing error text for both AppError (line 80) and plain Error (line 87), and app/lib/errors.server.ts#handleDatabaseError copies the driver error text into the AppError message (line 160). There is no production-only redaction step between the database error and the HTTP response body, so the failed statement's SQL, its table and column names, the bound values and the SQLSTATE reach the caller verbatim.
- Resolution: Keep the database error text on the server and return a stable, generic code to the client. In app/lib/errors.server.ts, make handleDatabaseError log the raw driver message and the SQLSTATE to the server log and give the AppError a caller-safe message that names the operation and the failure class only. The raw driver message must NOT be parked on the AppError: `details` is serialized into the response body by createErrorResponse (app/lib/errors.server.ts:83), so a raw message kept under `details.cause` still reaches the caller verbatim - the originally proposed fix did exactly that and reproduced the same disclosure (the failed statement's SQL, table name, column names and bound parameter…
- Look in: `app/lib/errors.server.ts`, `app/lib/handler.server.ts`, `app/routes/api+/surveys.action.server.ts`, `app/lib/api-auth.server.ts`, `app/server/db.ts`, `app/lib/parse-utils.server.ts`
- Existing tests: The error the repository's own driver raises for the failing survey insert is a DrizzleQueryError (class DrizzleQueryError), NOT the raw postgres.js PostgresError the hunter assumed. Its cause is the driver's PostgresError with code 23505 and detail 'Key (survey_id, workspace)=(dup-survey-id, ...) already exists.',…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A 4xx/5xx API response should carry a stable, caller-actionable error code and a generic message, and keep the database's own error text (SQL, table, column and constraint names, SQLSTATE, driver detail lines) in the server log only. The repository already applies that discipline on a neighbouring path - app/routes/api+/contact-form.action.server.ts:73-74 logs the underlying error and returns 'Failed to process message'.

### [#2884](https://github.com/chester-hill-solutions/callcaster/issues/2884) The structural-review merge gate classifies only four path prefixes as high-risk, so changes to the webhook, auth,…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
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
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- `release-close-issues.yml` exists so that a `dev -> master` release PR closes the issues it promotes (#1956): GitHub closes one issue per closing keyword, a bare `(#1234)` mention closes nothing, and the workflow header records release PR…
- Current behavior: `release-close-issues.yml` exists so that a `dev -> master` release PR closes the issues it promotes (#1956): GitHub closes one issue per closing keyword, a bare `(#1234)` mention closes nothing, and the workflow header records release PR #2668 listing seventeen issues behind a single keyword with only #2655 closing. The workflow checks the repository out with `actions/checkout@v4` and no `ref:` (line 68), so for a `pull_request` event the tree on disk is the pull request's merge commit, which carries the pull request's own copy of `scripts/check-release-closing-references.mjs`. The gate then runs that file twice (lines 77 and 78) and records the file's own self-reported `closes.length` as…
- Root cause: The gate sources its decision logic from the artifact it constrains. `actions/checkout@v4` is used without `ref:`, so for a `pull_request` event the checked-out tree is the pull request's merge commit and the checker at `scripts/check-release-closing-references.mjs` is whatever the pull request contains. The sibling workflow in the same repository already shows the intended pattern: `ledger-drift-check.yml` pins its checkout to a trusted ref (`ref: dev` at line 100, `ref: master` at lines 133 and 162) before running repository scripts with an environment's DATABASE_URL. Because the workflow file itself is also taken from the pull request's merge ref for a `pull_request` event, pinning the…
- Resolution: Decide the gate from trusted content, in two parts, because a `pull_request` event takes both the checked-out tree and the workflow file from the pull request's merge ref. (1) Pin the checkout to the base branch so the checker that judges the body is the repository's own copy: `ref: ${{ github.event.pull_request.base.sha }}` - the pattern ledger-drift-check.yml already uses with `ref:`. (2) Require an independent approver for the gate definitions themselves: add a CODEOWNERS entry for `/.github/workflows/` and `scripts/check-release-closing-references.mjs` plus a branch-protection rule on `master` requiring that approval, so a pull request cannot merge a change to the gate that judges it.…
- Look in: `.github/workflows/release-close-issues.yml`, `.github/workflows/ledger-drift-check.yml`, `.github/workflows/ci.yml`, `scripts/check-release-closing-references.mjs`, `test/check-release-closing-references.test.ts`, `.github/workflows/issue-on-dev.yml`
- Existing tests: test/**/*.test.ts covers the neighbouring behaviour on this path.; Trusted checker: line-77 step exit code 0, numbers=0, GATE VERDICT FAIL (the release PR is rejected). Pull-request-modified checker (CLI-only edit): line-77 step exit code 0, numbers=1, GATE VERDICT PASS - the release PR is allowed to merge with zero issues closed, the exact condition the workflow was written to…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A merge gate must decide from trusted content. The checker that validates a release PR's body should be the base branch's copy, and the gate's own definition must not be editable by the pull request it judges.

### [#2880](https://github.com/chester-hill-solutions/callcaster/issues/2880) A successful workspace deletion leaves no audit record: the workspace.delete audit insert targets the row the…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **A successful workspace deletion leaves no audit record: the workspace.delete audit insert targets the row the delete already removed**
- deleteWorkspaceApi calls handleDeleteWorkspace first (app/lib/platform-workspace.server.ts:139) and only afterwards calls safeRecordWorkspaceAuditEvent({action: 'workspace.delete'}) (app/lib/platform-workspace.server.ts:148)
- Current behavior: deleteWorkspaceApi calls handleDeleteWorkspace first (app/lib/platform-workspace.server.ts:139) and only afterwards calls safeRecordWorkspaceAuditEvent({action: 'workspace.delete'}) (app/lib/platform-workspace.server.ts:148). handleDeleteWorkspace issues a single DELETE against public.workspace (app/lib/workspace-members-db.server.ts:375), so by the time the deletion event is written the workspace row is gone, and workspace_audit_event.workspace_id carries a validated, non-deferrable ON DELETE CASCADE foreign key to public.workspace (client/migrations/20261007000003_workspace_audit_event_workspace_reference.sql:37). The insert is therefore rejected with SQLSTATE 23503 - 'insert or update on…
- Root cause: The workspace audit trail is keyed to the workspace row with ON DELETE CASCADE, and the deletion event is recorded only after the delete has already removed both the workspace row and the audit table's parent. The event can therefore never be written, the wrapper that records it treats the failure as non-fatal, and no durable platform-level record of the deletion exists anywhere else. Reordering the write alone does not fix it: an audit row written before the delete carries the same cascading workspace foreign key and is destroyed by the same cascade, which the reproduction confirmed (a control row written before the delete was gone afterwards).
- Resolution: Land the deletion record in a sink that does not cascade with the tenant, and write it in the same transaction as the delete. Reordering the write alone is NOT sufficient: the audit row carries the same cascading workspace foreign key, so a 'workspace.delete' event written into workspace_audit_event before the delete is destroyed by the same cascade (reproduced: a control row written before the delete was gone afterwards). Either give the audit table a durable, non-cascading owner (workspace_id nullable with ON DELETE SET NULL and the workspace id kept in target_id, or a separate platform-level table with no workspace foreign key) and write the event there, or write a platform-level…
- Look in: `app/lib/platform-workspace.server.ts`, `client/migrations/20261007000003_workspace_audit_event_workspace_reference.sql`, `app/lib/audit-event.server.ts`, `app/db/workspace-scoped-tables.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/workspace-members-db.server.ts`
- Existing tests: Control: the exact 'workspace.delete' payload written while the workspace existed succeeded (audit rows 3 -> 4). Production deleteWorkspaceApi() returned {ok:true}; during that same call the wrapper logged one error - 'Failed to record workspace audit event', action workspace.delete, PostgresError code 23503, detail…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A tenant deletion is an accountable platform action: it should leave a durable, attributable record (an audit event and/or a platform-level tombstone with the workspace id, the actor and the timestamp) that survives the deletion of the tenant's own data.

### [#2877](https://github.com/chester-hill-solutions/callcaster/issues/2877) Cron enqueue route's body workspaceId bypasses the workspace.disabled suspension gate for billing_reconcile and…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Cron enqueue route's body workspaceId bypasses the workspace.disabled suspension gate for billing_reconcile and twilio_open_sync**
- POST /api/jobs/billing-reconcile and POST /api/jobs/twilio-open-sync read the tenant selector from the request body (workspaceId) and write it onto the job row's workspace_id column
- Current behavior: POST /api/jobs/billing-reconcile and POST /api/jobs/twilio-open-sync read the tenant selector from the request body (workspaceId) and write it onto the job row's workspace_id column. A job row that carries a workspace_id makes the worker take the per-workspace branch of withOptionalWorkspaceFanout, and that branch calls the money operation directly - it never consults workspace.disabled. The all-workspaces branch, which is the path the legitimate pg_cron caller takes, does apply the platform's suspension lever: a workspace with disabled = true is skipped, because 'a job that moves money or reconciles a live Twilio account must not run for a workspace the platform has suspended'. The…
- Root cause: withOptionalWorkspaceFanout (app/lib/worker/handlers/cron.server.ts:62) splits into two branches, and the tenant-eligibility policy (the workspace.disabled skip) lives only inside runCronWorkspaceFanout, which the per-workspace branch bypasses. The cron enqueue route (app/lib/worker/cron-job-enqueue-route.server.ts:26,66) takes the tenant selector from the untrusted body and writes it to job.workspace_id, so a body-controlled selector picks the branch that has no gate. The route is the only producer of a workspace-scoped billing_reconcile job and one of two producers of a workspace-scoped twilio_open_sync job (the other is app/server/predictive-machine-continuation.server.ts:277), so the…
- Resolution: Make the per-workspace branch apply the same tenant-eligibility policy the fanout branch applies, so a body-supplied workspaceId cannot select an unguarded path. The smallest change is to re-check workspace.disabled in withOptionalWorkspaceFanout before calling runOne (skipping, not failing, when the job has not opted in); this also protects the other producer of a workspace-scoped twilio_open_sync job (app/server/predictive-machine-continuation.server.ts:277). An equally valid alternative is to reject the enqueue in the cron route when the named workspace is disabled, so the job is never created. The patch needs the getWorkspaceById import (cron.server.ts already imports…
- Look in: `app/lib/cron-workspace-fanout.server.ts`, `app/lib/worker/handlers/cron.server.ts`, `app/lib/worker/cron-job-enqueue-route.server.ts`, `app/lib/worker/enqueue-job.server.ts`, `app/lib/number-rental-billing.server.ts`, `app/lib/twilio-call-status.server.ts`
- Existing tests: Route (node tier, real action, enqueue layer captured): POST /api/jobs/billing-reconcile with body {"workspaceId":"11111111-1111-4111-8111-111111111111"} and the correct x-cron-secret produced unsafeEnqueueJob args…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A suspended workspace's money must not move. app/lib/cron-workspace-fanout.server.ts:44 states the rule - 'A job that moves money or reconciles a live Twilio account must not run for a workspace the platform has suspended: it keeps debiting a balance nobody will pay and keeps reconciling an account that should be frozen' - and line 92 implements it by skipping a disabled workspace unless the job opts in. billing_reconcile and twilio_open_sync deliberately do not opt in (the includeDisabled field is absent at app/lib/worker/handlers/cron.server.ts:141 and :99), and the repo's own test asserts that (test/worker-cron-handlers.server.test.ts:213, :222, and :228-238, which pins number_rental_billing as the only job that opts in). The intended behaviour is therefore that a suspended tenant is skipped on BOTH branches of withOptionalWorkspaceFanout.

### [#2872](https://github.com/chester-hill-solutions/callcaster/issues/2872) Audience import creates and mutates audience records and links audiences to campaigns under a membership-only gate…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Audience import creates and mutates audience records and links audiences to campaigns under a membership-only gate that the sibling audience surfaces refuse**
- POST /api/audience-upload authorizes with requireWorkspaceAccess({ user, workspaceId }) and nothing else (app/routes/api+/audience-upload.action.server.ts:120), so any workspace member, including the lowest `caller` role, passes
- Current behavior: POST /api/audience-upload authorizes with requireWorkspaceAccess({ user, workspaceId }) and nothing else (app/routes/api+/audience-upload.action.server.ts:120), so any workspace member, including the lowest `caller` role, passes. On that admission the route itself creates an audience row (createAudienceForUpload, :193), flips an existing audience's status to processing (markAudienceUpdating, :245), inserts a campaign_audience link for a campaign in the workspace (linkAudienceToCampaign, :234-243) and enqueues an audience_upload job attributed to the caller (:247) whose durable run then inserts contact rows into the workspace's contact table and links them to the audience…
- Root cause: The import route's authorization was written as a bare membership check and never adopted the capability or role floor that the sibling audience surfaces enforce. Because the route itself creates the audience, mutates an existing audience, links the audience to a campaign and enqueues the import that writes the contact rows, the missing floor is the whole authorization boundary for the import path.
- Resolution: Gate the audience-import route with the same floor the sibling audience surfaces use, in the call that proves workspace access, so the request is refused before createAudienceForUpload, linkAudienceToCampaign, markAudienceUpdating or the job enqueue run. Require the member role (equivalent to campaigns.write for session actors) or resolve a capability actor and require campaigns.write explicitly if the route is migrated to the capability strategies.
- Look in: `app/routes/api+/audience-upload.action.server.ts`, `app/routes/api+/audiences.action.server.ts`, `app/lib/audience-api-auth.server.ts`, `app/lib/capability-guard.server.ts`, `app/lib/capabilities.ts`, `app/routes/api+/campaign_audience.action.server.ts`
- Existing tests: 4 of 4 assertions passed against a private Postgres 18 inside the OS-enforced sandbox, with no network access and no external service touched. (1) requireWorkspaceAccess with no minRole resolved for the caller-role member; the same call with minRole 'member' threw an AppError with statusCode 403;…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: Audience creation and audience mutation belong to the campaigns.write capability (app/lib/capabilities.ts:12, :75), which the caller role does not hold, and the product enforces that model in app/lib/audience-api-auth.server.ts (requireAudienceWorkspaceAccess, :30) and with a member role floor in app/routes/api+/campaign_audience.action.server.ts:76 and app/routes/api+/campaigns/$campaignId/queue.action.server.ts:60. The import route should apply the same floor before it creates an audience, mutates one, links one to a campaign, or enqueues the import.

### [#2871](https://github.com/chester-hill-solutions/callcaster/issues/2871) Tenant-facing GET /api/numbers falls back to the platform parent-account Twilio credential when workspace_id is…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **Tenant-facing GET /api/numbers falls back to the platform parent-account Twilio credential when workspace_id is omitted**
- GET /api/numbers (app/routes/api+/numbers.loader.server.ts) is declared exposure sessionOnly / authClass session / workspaceScoped true (app/lib/api-surface-annotations.ts:87), and its published OpenAPI operation declares the workspace_id…
- Current behavior: GET /api/numbers (app/routes/api+/numbers.loader.server.ts) is declared exposure sessionOnly / authClass session / workspaceScoped true (app/lib/api-surface-annotations.ts:87), and its published OpenAPI operation declares the workspace_id query parameter as "Workspace scope (required for session auth)" (openapi/complete-api.json:6631-6637). The loader nevertheless treats the absence of that caller-supplied parameter as "platform-admin context": on the else branch it builds a Twilio REST client from the platform's own parent-account credentials (env.TWILIO_SID() / env.TWILIO_AUTH_TOKEN(), app/twilio.server.ts:131) and lists that account's purchasable Canadian numbers, returning the listing…
- Root cause: The loader treats the absence of the caller-supplied workspace_id query parameter as 'platform-admin context' and, on that branch, constructs a Twilio REST client from the platform parent-account credentials via createParentTwilioInstance(). The only control applied to the request is requireDualAuth(request), which performs authentication and (only when a capability is passed) a capability check - it never checks workspace membership, a workspace role, or platform-admin/sudo status. The workspace branch of the same handler does call requireWorkspaceAccess, so the two branches of one resource have inconsistent authorization: the membership gate lives only on the branch where the caller…
- Resolution: Make the workspace context mandatory for the number search so a tenant-level request can never select the platform parent-account identity, and remove the silent parent fallback. Require workspace_id, run the existing membership gate, and build the client from that workspace's subaccount. If platform operators still need a parent-account search, expose it on the admin surface behind requireSudo rather than as the default branch of a tenant route, and drop the now-unused createParentTwilioInstance import from the loader (app/twilio.server.ts:130 stays for other callers). The repository's committed test at test/numbers.route.test.ts:185 asserts the current parent behaviour, so it must be…
- Look in: `app/routes/api+/numbers.loader.server.ts`, `app/twilio.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/api-surface-annotations.ts`, `openapi/complete-api.json`
- Existing tests: 1 test file passed, 7 tests passed (exit status 0) in the sandbox (docker --network none, read-only /target, scratch-only writes, empty environment, 2 CPUs / 2g memory / 512 pids / 300s wall clock; bun + vitest 4.1.11; dummy credentials only). The DECISIVE case 'a plain session user with no workspace context reaches…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A number search must run under the identity of the tenant that owns it. GET /api/numbers should require a workspace_id, verify the caller is a member of that workspace, and use that workspace's Twilio subaccount - which is what the declared surface (exposure sessionOnly, authClass session, workspaceScoped true, app/lib/api-surface-annotations.ts:87) and the published OpenAPI operation (workspace_id 'required for session auth', openapi/complete-api.json:6631) describe. A request with no workspace context must be rejected; if parent-account search is genuinely required for platform operators, it must sit behind platform-admin authority (requireSudo / the admin surface) and must never be the silent fallback of a tenant-facing route.

### [#2867](https://github.com/chester-hill-solutions/callcaster/issues/2867) The strict 10/min credential bucket is not applied to every credential surface: POST /api/auth/token performs the…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **The strict 10/min credential bucket is not applied to every credential surface: POST /api/auth/token performs the same email+password sign-in under the 30/min…**
- The authentication scope table (app/lib/platform-auth-rate-limit.server.ts:18-33) documents 'auth:sign-in' (10/min) as the bucket for 'Credential + TOTP guesses via the Better Auth handler' and 'auth:catch-all' (30/min) as the bucket for…
- Current behavior: The authentication scope table (app/lib/platform-auth-rate-limit.server.ts:18-33) documents 'auth:sign-in' (10/min) as the bucket for 'Credential + TOTP guesses via the Better Auth handler' and 'auth:catch-all' (30/min) as the bucket for 'Remaining Better Auth POSTs (sign-out, session revoke, ...)'. Two live credential surfaces do not match that mapping, so the per-client credential budget depends on which URL the caller uses. First, POST /api/auth/token is bound to 'auth:token' (30/min, app/lib/platform-auth-rate-limit.server.ts:23) although its handler performs the identical email+password check as POST /signin ('auth:sign-in', 10/min) and POST /api/auth/sign-in/email ('auth:sign-in',…
- Root cause: The scope a surface receives is bound to the route module that declares it, and for the Better Auth catch-all to a substring match on the request path, instead of to the credential or operation the surface actually performs. Two surfaces that perform the same check therefore run with different guessing budgets, and the guard that is meant to keep credential surfaces covered only recognises direct calls in application route modules and only checks that some limiter is present.
- Resolution: Bind the bucket to the operation rather than to the route module. Give POST /api/auth/token the strict credential scope so the email+password check it performs shares the 10/min budget of the other sign-in surfaces. If integrator sign-in volume genuinely needs a higher ceiling, add a per-account dimension to the credential bucket instead of leaving one check at two budgets. Make the Better Auth catch-all choose a strict scope for the credential-bearing endpoints it forwards instead of the loose 'auth:catch-all', and treat the Better Auth endpoint map as part of the coverage gate: scripts/check-auth-rate-limits.mjs must check the scope a credential surface declares, not only that some…
- Look in: `app/lib/platform-auth-rate-limit.server.ts`, `app/routes/api+/auth/token.action.server.ts`, `app/lib/platform-auth.server.ts`, `app/routes/signin.action.server.ts`, `app/routes/api+/auth/$.loader.server.ts`, `app/routes/api+/auth/register.action.server.ts`
- Existing tests: Application-level buckets (node tier, one client address per surface): POST /api/auth/sign-in/email admits 10 requests and answers 429 on request 11; POST /signin admits 10 and answers 429 on request 11; POST /api/auth/token admits 30, answers 401 (not limited) on requests 1 to 30 while auth.api.signInEmail is reached…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: Every surface that performs an email+password credential check is bounded by the strict 'auth:sign-in' bucket (10/min), and every surface that performs a password-reset request or an account creation is bounded by the 10/min scope documented for that operation, so the per-client budget for the same operation does not depend on which URL the caller uses.

### [#2864](https://github.com/chester-hill-solutions/callcaster/issues/2864) POST /api/survey-responses stores a contact id from another tenant: the no-auth-strategy handler's inline gate…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **POST /api/survey-responses stores a contact id from another tenant: the no-auth-strategy handler's inline gate never binds responseData.contact_id**
- POST /api/survey-responses is one of the twenty API-surface entries whose derived authVia mentions "no-auth-strategy" (12 with authVia exactly "action:no-auth-strategy", 3 with "action:no-auth-strategy + loader:no-auth-strategy")
- Current behavior: POST /api/survey-responses is one of the twenty API-surface entries whose derived authVia mentions "no-auth-strategy" (12 with authVia exactly "action:no-auth-strategy", 3 with "action:no-auth-strategy + loader:no-auth-strategy"). The handler declares no `auth:` strategy, so the factory's optional auth slot is empty and app/lib/handler.server.ts:100-112 runs the handler body with no factory-level authentication: the inline gate inside the handler body is the entire authorization story. That gate resolves the SURVEY's workspace and checks the caller against it (API-key branch: `workspaceId !== auth.workspaceId`; session branch: `requireWorkspaceAccess({ user, workspaceId })` with no…
- Root cause: app/routes/api+/survey-responses.action.server.ts:64-103 - the handler is defined with `defineAction({ sideEffects, handler })` and no `auth:` key, so `withGuards` (app/lib/handler.server.ts:100-112) runs the body with no factory-level authentication. The inline gate at lines 71-101 authorizes only the survey: the API-key branch (81-84) compares `workspaceId !== auth.workspaceId` and the session branch (94) calls `requireWorkspaceAccess({ user, workspaceId })` with no role floor. `responseData.contact_id` is parsed at line 30 and passed through untouched at lines 45-48, and app/lib/survey-db.server.ts:398 writes it into `survey_response.contact_id` with no workspace check. The deployed…
- Resolution: Bind the caller-supplied contact id to the survey's workspace at the sink, so every caller of submitSurveyResponse inherits the check the public path already has. The survey is loaded inside submitSurveyResponse, so its `workspace` is available there: resolve the contact through the workspace-scoped loader (import loadSurveyRespondentContact from @/lib/survey-respondent.server) and reject a foreign or non-existent id with 400. As defence in depth, also scope the contact lookup in loadRecentSurveyResponses by workspace, and correct the Drizzle model for survey_response.contact_id so it matches the deployed bigint column (or migrate the column to int4 and drop the typeof filter).
- Look in: `app/lib/api-surface-generated.ts`, `app/lib/handler.server.ts`, `app/routes/api+/survey-responses.action.server.ts`, `app/lib/survey-db.server.ts`, `app/db/schema-survey.ts`, `drizzle/0000_baseline.sql`
- Existing tests: Independently reproduced in the sandbox against a private PostgreSQL 18 (schema applied by scripts/e2e/bootstrap-compose-db.mjs), with locally generated dummy fixtures only. (1) With the scope-less workspace API key the action returned HTTP 200 {success:true, response_id:"1", result_id:"6244b8ea-..."} and the inserted…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A contact id supplied by a caller must resolve to a contact in the survey's own workspace before it is stored, exactly as the public survey path does: app/lib/survey-public-action.server.ts:142-167 routes the id through app/lib/survey-respondent.server.ts:27-46, which applies `eq(contactTable.workspace, workspaceId)` so a foreign id simply does not resolve and the request is refused with 400.

### [#2863](https://github.com/chester-hill-solutions/callcaster/issues/2863) POST /api/survey-responses accepts a workspace API key with an empty scope allowlist although the published…
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **POST /api/survey-responses accepts a workspace API key with an empty scope allowlist although the published contract is session-only**
- POST /api/survey-responses is a `no-auth-strategy` handler: the derived inventory records authVia "action:no-auth-strategy" (app/lib/api-surface-generated.ts:117) and the declared auth class comes only from a hand-written annotation that…
- Current behavior: POST /api/survey-responses is a `no-auth-strategy` handler: the derived inventory records authVia "action:no-auth-strategy" (app/lib/api-surface-generated.ts:117) and the declared auth class comes only from a hand-written annotation that no gate constrains, because scripts/check-api-surface-coverage.ts compares the declared class against the code only when the derivation produced an `authAllows` set (line 118), and an unresolved handler produces none (scripts/lib/api-surface-derive.mjs:499-505). The annotation declares authClass "session" and exposure "sessionOnly" (app/lib/api-surface-annotations.ts:100), and the published OpenAPI entry for this path carries x-callcaster-auth-class…
- Root cause: app/routes/api+/survey-responses.action.server.ts:64-84 - the handler declares no `auth:` strategy, and the inline gate it does declare is `requireDualAuth(request)` (line 71) with no `capability` option, so app/lib/api-auth.server.ts:175-190 never evaluates the API key's scope allowlist. The api_key branch (81-84) checks only the workspace binding. The sibling pattern is not unique: app/routes/api+/message_media.action.server.ts:25-30 admits an API key the same way. Every other requireDualAuth route in app/routes either rejects key actors with getDualAuthUser (app/routes/api+/surveys.action.server.ts:158-161, app/routes/api+/campaign_audience.action.server.ts:38-41,…
- Resolution: Make the route's auth class a mechanical fact instead of free text. The published spec already says session-only, so the smallest behaviour-correct fix is to require a user session (bearer or cookie) and drop the api_key branch; if API-key access is wanted instead, declare it as apiKeyOrSession and add an explicit capability check so the key's scope allowlist is consulted (app/lib/api-auth.server.ts:175-190). Either way, reject key actors in the handler the way the sibling route does (app/routes/api+/campaign_audience.action.server.ts:38-41) so the declared session-only exposure is actually true. Note the surface gate will not police this on its own:…
- Look in: `app/lib/api-surface-generated.ts`, `app/lib/api-surface-annotations.ts`, `app/routes/api+/survey-responses.action.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/capabilities.ts`, `app/routes/api+/campaign_audience.action.server.ts`
- Existing tests: All four assertions passed inside the parent-approved sandbox against a private PostgreSQL 18. (1) An API key whose scopes array was EMPTY returned HTTP 200 {success:true, response_id:"1", result_id:"e58565fd-8a3c-4fc4-ba6a-052fb360a65d"} and a survey_response row was created for that key's own survey. (2) A key whose…
- Missing tests: A regression test for this behaviour fails on the current source and passes with the fix (kill-check: revert the fix and confirm the test goes red).; A negative control for the same path keeps passing, so the fix does not silently widen access.
- Done when: A route the inventory and the published OpenAPI spec declare session-only must reject workspace API keys, and a key that reaches a write path must have the capability that write requires. The platform's documented rule is that an empty scope allowlist denies (app/lib/capabilities.ts:45).

---

## Verify and close — 35

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#2893](https://github.com/chester-hill-solutions/callcaster/issues/2893) Worker's affected-row count is always zero, so dead-letter and crash-recovery alerts never fire
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- The worker decides whether a write did anything by counting the rows it affected, but it reads that count from the wrong field of the wrong shape
- Current behavior: Fixed on dev. The worker reads the affected-row count from the database driver's `count` before the array length, so a write that changed rows is no longer read as a write that changed nothing. The stale-claim reset signal and the dead-letter and crash-recovery alerts that depend on it fire again.
- Root cause: affectedRowCount() in app/lib/worker/poll-jobs.server.ts:79-86 tests Array.isArray(result) before the driver's count property. Under the postgres-js driver the application uses (app/server/db.ts:1,63,72; drizzle-orm 0.45.2 and postgres 3.4.9 pinned in bun.lock), db.execute() resolves to a postgres.js Result object, which extends Array (node_modules/postgres/src/result.js:1) and is empty (length 0) for an UPDATE without RETURNING while carrying the affected-row count on .count. Drizzle's raw execute path returns the driver object unchanged (node_modules/drizzle-orm/postgres-js/session.js:30-33, 'return await client.unsafe(query, params)'). The array branch returns first, so the helper…
- Resolution: Fixed in #2983: `affectedRowCount` in `app/lib/worker/poll-jobs.server.ts` reads `count` first (postgres.js resolves `db.execute()` to an Array that carries it) and keeps the array length as the fallback for plain rows.
- Look in: `app/lib/worker/poll-jobs.server.ts`, `app/server/db.ts`, `node_modules/postgres/src/result.js`, `node_modules/drizzle-orm/postgres-js/session.js`, `app/lib/worker/handlers.server.ts`, `app/lib/ops-alert.server.ts`
- Existing tests: test/affected-row-count.test.ts
- Done when: failJob should log worker.job.dead_letter and page on-call through notifyOps when a job permanently fails, resetStaleClaims should log worker.stale_claims_reset when it reclaims a row from a dead worker, deadLetterExhaustedJobs should log worker.exhausted_jobs_dead_lettered when it buries an exhausted row, and worker.claim_lost should be logged only when a post-claim write was actually rejected by the claim fence.

### [#2876](https://github.com/chester-hill-solutions/callcaster/issues/2876) The Better Auth mount exposes /api/auth/two-factor/disable, bypassing the rule that privileged accounts cannot…
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **The Better Auth mount exposes /api/auth/two-factor/disable, bypassing the rule that privileged accounts cannot disable 2FA**
- The application's rule 'privileged accounts cannot disable two-factor authentication' is implemented in exactly one place - the intent=disable branch of the POST /account/security action…
- Current behavior: Fixed on dev. The Better Auth mount refuses every endpoint that changes 2FA enrolment state — `two-factor/enable`, `two-factor/disable` and `two-factor/generate-backup-codes` — and answers 403 pointing at the account security page, which enforces the prior-state and protected-account rules. The sign-in challenge endpoints (`verify-totp`, `verify-backup-code`) stay reachable.
- Root cause: app/routes/api+/auth/$.loader.server.ts:18-30 forwards every Better Auth request to auth.handler(request) after only a rate limit (lines 19-25) and the signup-closed check (lines 26-28); it applies no application-level policy to the /api/auth/two-factor/* endpoints. Better Auth's disableTwoFactor (node_modules/better-auth/dist/plugins/two-factor/index.mjs:138-187) therefore runs with only its own session check (use: [sensitiveSessionMiddleware], line 141) plus password validation (lines 156-162), sets twoFactorEnabled=false (line 163) and deletes the auth_two_factor row (line 164). The protected-user rule (app/lib/two-factor.server.ts:121) lives solely in the application route's action and…
- Resolution: Fixed in #2901 (enable/disable) and #2982 (backup-code generation): `isAppManagedTwoFactorPath` in `app/routes/api+/auth/$.loader.server.ts` blocks the three state-changing endpoints before `auth.handler` runs.
- Look in: `app/routes/api+/auth/$.loader.server.ts`, `app/routes/account.security.loader.server.ts`, `node_modules/better-auth/dist/plugins/two-factor/index.mjs`, `app/server/auth-instance.ts`, `app/lib/two-factor.server.ts`, `scripts/baselines/route-tree.txt`
- Existing tests: test/auth-catch-all-rate-limit.route.test.ts
- Done when: The application's 2FA policy must be the effective policy on every door that changes 2FA state. The /api/auth/* mount should either refuse the raw two-factor state-changing endpoints (POST /api/auth/two-factor/enable and POST /api/auth/two-factor/disable) so that all 2FA changes go through the POST /account/security action, which enforces userIsTwoFactorProtected and the per-user setup rate limit, or apply the same protected-user rule inside handleAuthRequest before delegating to auth.handler for those paths. The sign-in challenge endpoint POST /api/auth/two-factor/verify-totp must stay reachable, because the 2FA sign-in flow posts there.

### [#2891](https://github.com/chester-hill-solutions/callcaster/issues/2891) Changing the account password leaves every other session of that account usable
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- PATCH /api/me is the product's only password-change path
- Current behavior: Fixed on dev. Changing the account password revokes every other session of the account, including bearer tokens from `POST /api/auth/token`, and returns a replacement session in the body and as a cookie so the caller is not logged out by its own change.
- Root cause: app/lib/platform-auth.server.ts:468 invokes auth.api.changePassword without revokeOtherSessions, so the password rotation updates the credential hash and leaves the account's other auth_session rows (and therefore every other session cookie and bearer token) valid; the session invalidation the app performs for the reset path (app/server/auth-instance.ts:30, revokeSessionsOnPasswordReset) has no equivalent on the change path, and no other control in app/ revokes sessions on a password change.
- Resolution: Fixed in #2979: `changePassword` is called with `revokeOtherSessions: true` and `returnHeaders: true` (`app/lib/platform-auth.server.ts`), and `PATCH /api/me` returns `session_token` (`app/routes/api+/me.action.server.ts`).
- Look in: `app/lib/platform-auth.server.ts`, `app/server/auth-instance.ts`, `app/routes/api+/me.action.server.ts`, `app/lib/schemas/api/platform-auth.ts`, `app/lib/auth.server.ts`, `node_modules/better-auth/dist/api/routes/update-user.mjs`
- Existing tests: test/platform-auth.test.ts
- Done when: Changing the account password invalidates the account's other sessions, so a password rotation is an effective response to suspected session compromise. The app already states this intent for the sibling path: app/server/auth-instance.ts:28-30 sets revokeSessionsOnPasswordReset with the comment that the sessions which already exist are exactly the ones that must stop working.

### [#2874](https://github.com/chester-hill-solutions/callcaster/issues/2874) Platform-admin 'Disable user' writes access_level='disabled', a value no authorization path enforces: the disabled…
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **Platform-admin 'Disable user' writes access_level='disabled', a value no authorization path enforces: the disabled user keeps a live session and full workspace…**
- The admin panel offers a 'Disable user' control on every user row (POST /admin with _action=toggle_user_status) and the JSON admin plane exposes the same operation (POST /api/admin/dashboard with {"action":"toggle_user_status"}); PATCH…
- Current behavior: Fixed on dev. Disabling an account revokes its sessions, and both session-resolution paths treat `access_level = 'disabled'` as unauthenticated, so a disabled account can neither keep using a live cookie or bearer token nor obtain a working session again. Workspace membership is kept, so restoring a level restores access.
- Root cause: disableUser treats the string 'disabled' as an account state, but 'disabled' is only a free-text column value on public.user (plain `text DEFAULT 'standard'`, no CHECK constraint, no enum) with no consumer. The disable operation is written as a single-column UPDATE and never revokes the target's Better Auth sessions (auth_session rows) and never touches workspace_member - the two things that actually grant the user authority - so both remain in force. The enforcement that does exist for access_level ('sudo' only) is read in four TypeScript sites and one plpgsql function, none of which is on the disabled path, so the disable control cannot fail closed: it can only fail open. The codebase…
- Resolution: Fixed in #2978: `disableUser` revokes the account's sessions (`app/lib/platform-admin.server.ts`), `getSession` and `resolveBearerSessionUser` reject a disabled account (`app/lib/auth.server.ts`), and the admin console states what the level means (`admin+/users/$userId/edit.route.tsx`).
- Look in: `app/lib/workspace-members-db.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/admin-middleware.server.ts`, `app/lib/two-factor.server.ts`, `app/routes/admin+/requireSudoAdmin.server.ts`, `app/lib/workspace-middleware.server.ts`
- Existing tests: test/disabled-user-enforcement.test.ts
- Done when: Pressing 'Disable user' in the admin panel, or setting access_level='disabled' through PATCH /api/admin/users/:userId, must stop the target account from acting: its live sessions must stop working, it must not be able to sign in again, and it must no longer be admitted to its workspaces, so an administrator who offboards or contains a user is not told 'User disabled successfully' while the account keeps working.

### [#2875](https://github.com/chester-hill-solutions/callcaster/issues/2875) PATCH /api/admin/users/:userId silently rewrites access_level to 'standard' when the field is omitted, stripping…
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-25
- Recommended title: **PATCH /api/admin/users/:userId silently rewrites access_level to 'standard' when the field is omitted, stripping sudo (and the 2FA mandate) from the target**
- The JSON admin API documents PATCH /api/admin/users/:userId as 'User detail / edit profile & access level' (docs/api-admin.md:18)
- Current behavior: Fixed on dev. `PATCH /api/admin/users/:userId` writes only the fields the caller supplied, so a rename no longer blanks names or demotes an account from sudo to standard, and `access_level` is constrained to the four values the console offers.
- Root cause: updateUserProfile treats an absent optional field as 'standard' instead of leaving the column untouched, so a partial update is a full overwrite of the access level. The request schema (access_level: z.string().optional()) and the write helper (args.access_level ?? 'standard') disagree about what 'omitted' means, and nothing reconciles them.
- Resolution: Fixed in #2977: `updateUserProfile` builds a partial set (`app/lib/workspace-members-db.server.ts`), the route constrains the value with `z.enum(ACCESS_LEVELS)` (`app/routes/api+/admin+/users+/$userId.action.server.ts`), and the levels live once in `shared/access-levels.ts`.
- Look in: `app/lib/workspace-members-db.server.ts`, `app/routes/api+/admin+/users+/$userId.action.server.ts`, `docs/api-admin.md`, `app/lib/two-factor.server.ts`, `app/routes/admin+/users/$userId/edit.action.server.ts`, `app/lib/platform-admin.server.ts`
- Existing tests: test/admin-user-partial-update.test.ts
- Done when: A PATCH that does not mention access_level must leave the target's access_level unchanged, exactly as the HTML admin form and updateOwnUserProfile do. An administrator renaming a user must not silently change that user's platform role or drop their 2FA mandate.

### [#2886](https://github.com/chester-hill-solutions/callcaster/issues/2886) Public contact form writes unescaped caller text into the ops-inbox email HTML body
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-25
- The public, unauthenticated contact form POST /api/contact-form copies the caller-supplied `name` and `message` form fields into the `html` part of the email sent to the CallCaster operations inbox
- Current behavior: Fixed on dev. The public contact form escapes the visitor's name and message in the HTML body of the operations-inbox email, so an anonymous submission cannot inject links, images or markup; the plain-text body still carries their words verbatim.
- Root cause: app/routes/api+/contact-form.action.server.ts builds the outbound email HTML body with a raw template literal (`html: `<p>From: ${name}.</p><br/>${message}``) and never routes the two caller-controlled fields through the repository's own `escapeHtml()` helper from app/lib/email-html.ts, which the module does not import.
- Resolution: Fixed in #2976: `escapeHtml` from `app/lib/email-html.ts` at the sink in `app/routes/api+/contact-form.action.server.ts`.
- Look in: `app/routes/api+/contact-form.action.server.ts`, `app/lib/email-html.ts`, `app/lib/number-rental-billing.server.ts`, `app/lib/low-credit-notify.server.ts`, `app/lib/billing-reconciliation-alert.server.ts`, `node_modules/resend/dist/index.mjs`
- Existing tests: test/contact-form.route.test.ts
- Done when: The visitor's `name` and `message` must reach the operations inbox as literal text, not as markup. The sibling outbound emails that carry caller text escape it first, so the contact form should render `<p>From: ${escapeHtml(name)}.</p><br/>${escapeHtml(message)}` and still deliver the visitor's words in the unchanged plain-text part of the same email.

### [#2868](https://github.com/chester-hill-solutions/callcaster/issues/2868) Public survey answer/complete accept a contact-derived respondent token, letting an anonymous caller overwrite…
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-24
- Recommended title: **Public survey answer/complete accept a contact-derived respondent token, letting an anonymous caller overwrite another respondent's answers and completion state**
- POST /api/survey-answer and POST /api/survey-complete treat the signed respondent token as the sole authority for which survey_response row a submission may touch, and the token's result_id - the identity of that row - is minted by the…
- Current behavior: Fixed on dev. The survey loader only reuses an existing response's `result_id` when the request carries a signed proof for that survey and contact; a bare `?contact=` id can start a new response but cannot mint a credential for someone else's.
- Root cause: app/routes/survey+/$surveyId.loader.server.ts:87-96 resolves an existing response row from the caller-supplied `?contact=` integer and reuses that row's result_id when minting the respondent token, so the minted credential carries the authority to mutate a response the caller never owned. app/lib/survey-public-action.server.ts:36-46 then accepts that credential as sufficient: verifyRespondentToken binds it to survey_id and workspace only, and result_id is copied out of the payload with no check that the caller controls the contact the response belongs to. resolvePublicSurveyContactId (app/lib/survey-public-action.server.ts:142-167) repeats the pattern on the write path by taking the…
- Resolution: Fixed in #2930 (`5dd77b56`): `verifySurveyContactProof` (app/lib/survey-contact-proof.server.ts:72) checks a signature over survey, contact and expiry; the loader gates on it at app/routes/survey+/$surveyId.loader.server.ts:39,66.
- Look in: `app/lib/survey-public-action.server.ts`, `app/routes/survey+/$surveyId.loader.server.ts`, `app/lib/survey-db.server.ts`, `app/server/survey-completion.ts`, `app/lib/survey-respondent.server.ts`, `drizzle/0000_baseline.sql`
- Existing tests: test/survey-contact-proof.test.ts
- Done when: Only the respondent who owns a response row may answer for it or change its completion state. The respondent token is the designed proof of that ownership ('Signed respondent token bound to survey id, workspace, result id, and expiry'), the contact lookup is a workspace-scoped read whose stated job is to make a cross-tenant read impossible (app/lib/survey-respondent.server.ts:14-26), and the loader states that the contact id is a bare legacy integer whose only protection is a rate limit (app/routes/survey+/$surveyId.loader.server.ts:25-31). A guessable identifier that is not proof of possession must not select another respondent's response row or another respondent's identity on a write.

### [#2865](https://github.com/chester-hill-solutions/callcaster/issues/2865) The optional workspaceId on the campaign_queue write helpers is never applied to the WHERE clause, so POST…
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-24
- Recommended title: **The optional workspaceId on the campaign_queue write helpers is never applied to the WHERE clause, so POST /api/ivr lets a member of one workspace dequeue…**
- app/lib/campaign-queue-db.server.ts performs its campaign_queue UPDATEs on the unscoped `db` client from `@/server/db` and builds the WHERE clause entirely from a caller-assembled `conditions` array, so the tenant predicate is an *optional…
- Current behavior: Fixed on dev. `dequeueCampaignQueueById` always adds `eq(campaignQueueTable.workspace, workspaceId)` and refuses a workspace-less call, `recordQueueAttemptFailure` takes a required `workspaceId` and puts it in the predicate, and `POST /api/ivr` passes the workspace it authorised.
- Root cause: The tenancy of a `campaign_queue` write is delegated to the caller as an optional `workspaceId` argument instead of being enforced by the helper. `updateCampaignQueueAndEmit` runs on the unscoped `db` client (`const exec = args.exec ?? db`, campaign-queue-db.server.ts:106) and applies exactly the predicates the caller assembled. `dequeueCampaignQueueById` adds the workspace term only `if (args.workspaceId)` (lines 404-407), and `recordQueueAttemptFailure` never adds it (lines 605-613) even though it takes the argument. `campaign_queue` is a registered workspace-scoped table (app/db/workspace-scoped-tables.ts:50), so ADR-0004's `createTenantDb(workspaceId)` (app/server/tenant-db.ts:32-35)…
- Resolution: Fixed in #2925 (`b5a4dc18`): the tenant predicate is a property of the helper, not an optional argument. `app/lib/campaign-queue-db.server.ts:235` (by-id dequeue), `:604` (failed-attempt counter), `app/routes/api+/ivr.action.server.ts:80`.
- Look in: `app/lib/campaign-queue-db.server.ts`, `app/routes/api+/ivr.action.server.ts`, `app/lib/api-surface-generated.ts`, `test/ivr.route.test.ts`, `client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql`, `app/server/tenant-db.ts`
- Existing tests: test/campaign-queue-workspace-scope.test.ts
- Done when: A write to a workspace-scoped table must be bound to the authenticated workspace before it is issued. ADR-0004 (`app/server/tenant-db.ts:32-35`, `app/db/workspace-scoped-tables.ts`) makes `createTenantDb(workspaceId)` the only tenant-data accessor for route code precisely because the base `db` client bypasses tenancy, and the audit's architecture summary names `createTenantDb` as the strongest source-visible control on the tenant-to-tenant boundary with no RLS behind it. The repository already applied exactly this discipline to the plpgsql equivalents in client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql, which added a mandatory workspace parameter to `dequeue_contact` and `create_outreach_attempt` and named /api/dial, /api/hangup and /api/questions as the exposed callers. The TypeScript by-id dequeue path was not covered by that fix, and /api/ivr is not among the callers it named.

### [#2292](https://github.com/chester-hill-solutions/callcaster/issues/2292) Assess fragmented public survey responses
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-24
- The read-only production assessment is complete: zero surveys, responses and answers. No stored rows are available for repair in the inspected database.
- Current behavior: Production app and Postgres-jAO4 database identities matched. The repeatable-read, read-only snapshot at 2026-10-21T06:04:48Z returned zero in each anonymous, contact-backed and unlinked-contact population; RLS does not hide rows.
- Root cause: The confirmed tokenless identity defect occurs in retained production source from the August 21 deployment until the fixed October 8 replacement. Missing-row completions leave no stored response and cannot be reconstructed from an empty table.
- Resolution: Review and land docs/assessments/2292-survey-response-history.md and its aggregate-only SQL. Do not repair or merge rows in this empty target database. A separate legacy data source needs its own scoped read and identity evidence.
- Look in: `docs/assessments/2292-survey-response-history.md`, `docs/assessments/2292-survey-response-history.sql`
- Existing tests: The aggregate SQL executed in a server-enforced read-only production transaction with a 15-second statement limit.; All three synthetic controls passed through the same aggregation: legitimate same-contact repeats, separate anonymous visits and ambiguous partial attempts stay distinct.; Released source and retained deployment metadata establish pre-fix and fixed boundaries; exact traffic switch times remain unavailable.
- Done when: Record the inspected environment, revision/deployment interval and aggregate counts.; Separate anonymous, contact-backed and unlinked-contact populations; distinguish missing evidence from zero stored rows.; Keep legitimate repeated-attempt controls and explain limits of attribution.; State a repair/no-repair recommendation without changing or exporting respondent rows.
- Tracker: Native Task; assigned wra-sol; organization fields unset; no hierarchy or dependency links. Live Project Status In progress. The assessment is complete and awaits review; keep open until the report is accepted and reaches master. The separate source fix is already released.

### [#2757](https://github.com/chester-hill-solutions/callcaster/issues/2757) Include all subaccount resources in the Twilio prune report
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-24
- The report repair uses the Messaging Services API with subaccount credentials, scans all SDK pages and stops on unreadable lists. The keep-list and deletion policy stay unchanged.
- Current behavior: Fixed on dev. The prune report walks the subaccount's resources rather than only the parent account's, so resources held under the subaccount are included in the report.
- Root cause: The subaccount lookup used /2010-04-01/Accounts/{sid}/Messaging/Services.json, ignored the raw response shape and caught every error as an empty list. SDK limit options capped the total inventory instead of setting a page size.
- Resolution: Fixed in #2758 (`860b344f`): `scripts/lib/twilio-prune-resources.mjs` and `scripts/twilio-resource-prune-report.mjs`.
- Look in: `scripts/twilio-resource-prune-report.mjs`, `scripts/lib/twilio-prune-resources.mjs`, `test/twilio-prune-resources.test.ts`
- Existing tests: test/twilio-prune-resources.test.ts
- Done when: Include Messaging Services with the subaccount’s own credentials.; Enumerate all account and resource pages.; Fail unreadable lists with account context instead of reporting an empty successful scan.; Keep the report read-only and preserve all keep-list and environment/owner decisions.
- Tracker: Bug; Priority High; Effort Low; environment prod; assigned to wra-sol. Project Status Backlog verified in the browser. Parent #1165. Review https://github.com/chester-hill-solutions/callcaster/pull/2758; the parent full audit and retention decisions remain blocked.

### [#2052](https://github.com/chester-hill-solutions/callcaster/issues/2052) Give the completion RPC one best-effort owner
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-24
- The dispatch worker still propagates a completion RPC error after a successful batch. The dialer now catches this error, but queue, dialer, IVR and settlement paths have separate logging and catch policies.
- Current behavior: Fixed on dev. Campaign completion has one best-effort owner: `recheckCampaignCompletion` calls the SQL gate `rpcTryCompleteCampaignIfDrained` with the caller's executor and treats a failure as "not complete yet".
- Root cause: Completion error handling was repeated at call sites. The dispatch tail had no guard, so a label update failure could retry finished work.
- Resolution: Fixed in #2759 (`2b879007`): `app/lib/campaign-completion.server.ts`, with the queue, settlement, recovery, worker and IVR-status callers routed through it.
- Look in: `app/lib/campaign-completion.server.ts`, `app/lib/campaign-queue-completion.server.ts`, `app/lib/campaign-settle-recheck.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/lib/auto-dial.server.ts`, `app/routes/api+/ivr/status.action.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`
- Existing tests: test/campaign-completion*.test.ts
- Done when: Exactly one code path owns the best-effort completion call; All five call sites use it with no local try/catch; A completion RPC failure never propagates into a dispatch job, dial drain, webhook or sweep; One log event name and field set from every surface; Failure path tested at each call site, not only at the owner
- Tracker: Task; unassigned; Priority, Effort and environment unset at the audit. Project Status Backlog verified in the browser. Review https://github.com/chester-hill-solutions/callcaster/pull/2759; keep open through delivery verification.

### [#2531](https://github.com/chester-hill-solutions/callcaster/issues/2531) Add a Notes field for all callers
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-24
- PR #2755 adds a Notes field for all callers in Power and Predictive modes, with saved-result restoration, contact-safe autosave and equal-height desktop panels. Review and deployed acceptance remain.
- Current behavior: Fixed on dev. Every caller role has a Notes field on the call screen, edited like the other questionnaire fields.
- Root cause: The call screen only renders script questions. Saved outreach results do not initialize the draft, contact changes can retain the preceding draft, and the debounce does not retain the original save target across a handoff. Contact selection also discards results when no provider call row exists.
- Resolution: Fixed in #2755 (`b7904d8a`): the Notes control in `app/components/call/CallScreen.Questionnaire.tsx` and the debounced save path in `app/hooks/utils/useDebouncedSave.ts`.
- Look in: `app/components/call/CallScreen.Questionnaire.tsx`, `app/hooks/call/useCallScreen.ts`, `app/hooks/utils/useDebouncedSave.ts`, `app/routes/api+/questions.action.server.ts`, `app/lib/callscreenActions.ts`
- Existing tests: test/ui/call-screen-questionnaire.test.tsx; test/ui/hooks-call-screen.test.tsx
- Done when: All callers can edit Notes in Power and Predictive modes.; Notes save with the selected outreach attempt and return after reload or contact selection.; Questionnaire answers, notes and disposition edits preserve one another.; Notes do not carry over when the selected contact changes.; The field uses the shared accessible controls and works at phone and desktop widths.; Desktop queue, questionnaire and call-control frames have equal heights; long scripts retain reachable call controls and phone layouts remain stacked.
- Tracker: User clarified the requirement on 2026-10-20: a Notes field available to all callers. Native Type Feature; Priority High; Effort Medium; environment prod; assigned to wra-sol. Project Status Backlog at the start; no parent, children or dependencies. PR #2755 targets dev and has a verified Development link. Keep open through default-branch promotion and release acceptance.

### [#1333](https://github.com/chester-hill-solutions/callcaster/issues/1333) STOP and START text remains visible to operators but no system information messages
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: none · Updated: 2026-10-24
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

### [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) Restore the password recovery email journey
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-24
- The password recovery journey is wired end to end again: the request is pinned to the configured BASE_URL with /reset-password as the callback, Better Auth emails a link that keeps its token, the reset page reads that token and posts it to the reset action, and the action hands it to the installed Better Auth `resetPassword` implementation; the success copy now describes a password change, and both verification-callback failure paths land on a real route without a token.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The fix is commit 9aa2025e 'Restore the password recovery email journey (#2279)', an ancestor of origin/master (first merged by release 268c2692 on 2026-10-08), with two later touches in master: cb88df8b 'Show reset-password action failures once (#2310)' and ca652b9e 'fix: return to sign in after password reset (#2606)'. IMPORTANT — the operator's 2026-10-17 comment ('I get "This reset link is invalid or has expired. Request a new one from the sign-in page." when attempting to reset password') was NOT a broken journey: the deployed dev log for that minute shows exactly one entry, `reset-password: reset rejected` with `error: "Password too short"` (Railway dev env 18ef9173-4b33-4a62-9b94-9dfc7a36eb05, service CallCaster, 2026-10-17T09:58:21Z). That error is raised by Better Auth AFTER the token was accepted, so the emailed link did reach the reset form with a valid token; the submitted new password was simply shorter than Better Auth's minimum (8 characters, node_modules/better-auth/dist/context/create-context.mjs:185). One residual defect is worth a follow-up ticket but is outside this issue's acceptance criteria: the reset form has no `minLength={8}` on its password inputs (app/routes/reset-password.tsx:35-46), unlike sign-up (app/routes/signup.tsx:121), and the too-short error is reported through the generic catch in app/routes/reset-password.action.server.ts:58-70 with the misleading 'This reset link is invalid or has expired' text. manual: true — the final proof is a real reset email landing in a real inbox, a real link, a real password change and a real sign-in with the new password.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/routes/remember.action.server.ts`, `app/routes/reset-password.loader.server.ts`, `app/routes/reset-password.action.server.ts`, `app/routes/reset-password.tsx`, `/auth/callback.loader.server.ts`, `app/routes/remember.tsx`
- Existing tests: test/password-recovery-journey.test.ts — walks the ACTUAL issued email through the installed Better Auth (memory adapter): it reads the reset link out of the sent mail, drives the real `api+/auth/$.loader.server` callback (expects 302 to /reset-password?token=<issued token>), loads the reset page (expects `{ token }`), submits the new password, asserts the password changed (the old password no longer signs in, the new one does) and that the link cannot be replayed (the second submit returns 400). It also covers identical generic feedback for known and unknown emails, the caller-selected-host resistance, the expired-link path, and the request rate limit. Ran green on this tree: `npx vitest run -c vitest.node.config.ts test/password-recovery-journey.test.ts ...` -> 4 files passed, 34 tests passed. test/ui/reset-password-feedback.test.tsx and e2e/specs/password-reset-feedback.spec.ts cover the failure feedback (one toast, retained fields, no layout shift) but the UI suite could not be executed in this checkout (every UI test fails with 'Cannot read properties of null (reading useContext)' from the vendored shad-cc copy of next-themes/react; an unrelated control test fails identically — a local install artifact, not a code defect).
- Done when: A person confirms the reported symptom is gone on master.

### [#2760](https://github.com/chester-hill-solutions/callcaster/issues/2760) Detect dev-only fixes correctly in the issue verification planner
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- The planner treated Git ancestry stdout as a boolean, so a candidate present on dev but absent from master was classified as requiring implementation. The source fix uses confirmed exit results for both refs.
- Current behavior: Fixed on dev. The verification planner detects a dev-only fix with `git merge-base --is-ancestor` against the release line instead of assuming a commit on dev has shipped.
- Root cause: git merge-base --is-ancestor reports through its exit code and produces empty stdout. A normal non-ancestor result also throws from execFileSync and skips the second predicate in the shared try block.
- Resolution: Fixed in #2762 (`b4c8f8fe`): `.opencode/tools/lib/issue-verdict-git.mjs` and `.opencode/tools/apply-issue-verdicts.mjs`.
- Look in: `.opencode/tools/apply-issue-verdicts.mjs`, `.opencode/tools/lib/issue-verdict-git.mjs`, `test/apply-issue-verdicts.test.ts`
- Existing tests: test/apply-issue-verdicts.test.ts
- Done when: PARTIAL and NOT_FIXED code verdicts with a confirmed dev-only candidate plan on-dev.; A candidate in master or outside dev, invalid data and unavailable refs retain the conservative path.; Remaining operator actions still plan on-qa.; The real dry-run CLI runs with a temporary Git graph and rejects GitHub writes during tests.
- Tracker: Bug; assigned to wra-sol; Priority, Effort and environment unset. Project Status Backlog verified in the browser. No parent, children, blockers or linked fixing PR at the start. The internal tooling fix is ready for comprehensive checks.

### [#2060](https://github.com/chester-hill-solutions/callcaster/issues/2060) Verify welcome-credit classification through the display and reconciliation adapters
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- Both public adapters already classify welcome and manual CREDIT grants as purchase. Focused adapter tests now cover the displayed Purchase label, reconciliation category and unchanged prefix-only grant buckets.
- Current behavior: At dev@e4bb8ac6, getBillingEventSource maps other+CREDIT to purchase, and categorizeLedgerRow maps CREDIT to purchase before reading the shared prefix classifier. Grant prefixes intentionally remain other.
- Root cause: The original report mistook the prefix-only bucket for the final credit reporting category. No application behavior change is needed.
- Resolution: Verify the public display and reconciliation adapters with real helpers and debit controls. Keep the grant prefix classifier unchanged. Review the regression tests, then close the verified report.
- Look in: `app/lib/transaction-history-display.ts`, `shared/billing-reconciliation.ts`, `shared/billing-keys.ts`, `test/billing-grant-classification.test.ts`
- Existing tests: test/billing-keys.test.ts verifies the intentional other bucket for grant prefixes.; test/billing-grant-classification.test.ts verifies both public CREDIT adapters, the Purchase label and DEBIT controls using the real implementations.; 17 focused cases pass. Wrong display classification fails two new cases; inverted reconciliation type handling fails all four. Source faults were restored before the passing run.
- Done when: A welcome CREDIT displays as Purchase and reconciles as purchase through the public adapters.; The intentional prefix-only grant bucket remains other unless product semantics change.; Any change to distinguish paid purchases and grants has its own decision and task.
- Tracker: Bug; unassigned; Priority, Effort and environment unset. Project Status Backlog verified in the browser. No parent, children, blockers or linked PR at the start. Regression tests verify the existing behavior; no billing-rule change is proposed.

### [#2894](https://github.com/chester-hill-solutions/callcaster/issues/2894) Workspace API keys keep their full scope set after the member who minted them is removed or demoted
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- A workspace API key is a bearer credential whose authority comes exclusively from the `scopes` array on the key row
- Current behavior: Fixed on dev. An API key's scopes are re-derived from its creator's current role on every request, so removing or demoting the creator narrows or revokes the key; a key with no recorded creator fails closed with the same 401.
- Root cause: The API-key principal model records the creator (`created_by`) but never binds the key to a live workspace principal, and no cascade exists between a membership change and the key rows. `created_by` has no surviving foreign key (dropped in client/migrations/20260919120000_drop_legacy_auth_users_fks.sql:16) and is read by no runtime path; the scope ceiling `assertScopesWithinActorRole` (app/lib/platform-members.server.ts:120) is applied once at mint time against the creator's then-current role and, as the code comment at app/lib/platform-members.server.ts:80-89 states, is never re-derived. The session path re-resolves the role on every request (app/lib/capability-guard.server.ts:54,…
- Resolution: Fixed in #2928 (`13e1a6c4`): `app/lib/api-auth.server.ts:108-118` re-checks the creator's current role, with the ceiling in `app/lib/capabilities.ts` and the lookup in `app/lib/workspace-members-db.server.ts`.
- Look in: `app/lib/platform-members.server.ts`, `app/lib/capability-actor.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/capability-guard.server.ts`, `app/lib/workspace-members-db.server.ts`, `app/db/schema.ts`
- Existing tests: test/api-auth.test.ts
- Done when: Removing or demoting a workspace member ends that member's effective authority over the workspace, including through credentials the member issued. The platform already implements that for sessions: the membership lookup in `requireWorkspaceAccess` / `getUserRole` yields 404 'Workspace not found' for a non-member, so the session dies with the membership. A key should either be bound to a live membership - with its capability set re-checked against the creator's current role - or be revoked automatically when that membership is removed or reduced. The platform's chosen compensations for key durability are admin-only minting, a mint-time role cap and mandatory expiry; a membership-driven cascade is the missing one. (Note: the platform does NOT fail closed on workspace suspension either - `workspace.disabled` is read only by cron fan-out, number-rental billing and the admin console - so the asymmetry is specifically between the session path and the API-key path on membership change.)

### [#2885](https://github.com/chester-hill-solutions/callcaster/issues/2885) create_outreach_attempt stores an unchecked foreign contact id and get_campaign_attempts renders that contact…
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **create_outreach_attempt stores an unchecked foreign contact id and get_campaign_attempts renders that contact inside the caller's own campaign export**
- public.create_outreach_attempt(con_id, cam_id, usr_id, wks_id, queue_id) inserts the caller-supplied contact id and campaign id into an outreach_attempt row and stamps that row with the caller's own wks_id, without checking that the…
- Current behavior: Fixed on dev. `create_outreach_attempt` proves the contact and the campaign belong to the caller's workspace before it stores the row, and `get_campaign_attempts` joins with a workspace predicate, so a foreign contact id can no longer be stored or rendered.
- Root cause: The outreach_attempt INSERT accepts a contact id and a campaign id that are never compared with the workspace the row is tagged with, and the export RPC that renders those rows re-joins contact on id alone. Nothing in the SQL binds the contact or the campaign to the workspace, and the route that calls the wrapper validates only the workspace it was given - the attacker's own workspace - never the contact id it was given. The 2026-08-07 hardening in client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql scoped only the campaign_queue attempts-counter UPDATE to workspace = wks_id; its own header records the attempt INSERT as 'correctly tagged with wks_id',…
- Resolution: Fixed in #2927 (`386a2042`): `client/migrations/20261020000000_scope_outreach_attempt_contact_and_campaign_by_workspace.sql` adds the proof to both RPCs, reached through `app/lib/db-rpc.server.ts` and the campaign action.
- Look in: `app/routes/api+/questions.action.server.ts`, `client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql`, `client/migrations/20260722110000_contact_other_data_jsonb.sql`, `app/routes/workspaces+/$id/campaigns/$selected_id.action.server.ts`, `app/lib/db-rpc.server.ts`
- Existing tests: test/integration-db/scope-outreach-attempt-by-workspace.test.ts
- Done when: An outreach attempt, and any export that renders it, must only contain contacts and campaigns owned by the workspace the attempt was recorded for.

### [#2889](https://github.com/chester-hill-solutions/callcaster/issues/2889) Media-stream token without a call SID lets a WebSocket peer overwrite another tenant's coaching rows
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- The media-stream service authenticates a session with an HMAC token that binds the workspace and only optionally the call
- Current behavior: Fixed on dev. A media-stream token cannot be minted without a call SID — `createMediaStreamToken` throws when `callSid` is absent — and the DB writer resolves coaching rows through that call rather than a peer-supplied identity.
- Root cause: The call SID is an optional claim in the signed media-stream token, and the service's call-binding check is conditional on that claim being present (`tokenCallSid && msg.start.callSid && msg.start.callSid !== tokenCallSid`). When the token carries no call SID the check is skipped and the row key of the unscoped admin-DB writes is taken from a client-supplied frame field, so the token authorizes writes for a resource it never named. The fix that introduced the check (commit 55e6477b, 'fix(media-stream): bind transcript/coaching writes to the token's callSid (#1530)') hardened only the mint paths that happen to know the call SID at TwiML-generation time and left the predictive auto-dial path…
- Resolution: Fixed in #2926 (`1cb8dad0`): `app/lib/media-stream-token.server.ts:41` requires the call SID, `app/lib/media-stream-twiml.server.ts` and `app/routes/api+/auto-dial/$roomId.action.server.ts` pass it.
- Look in: `services/media-stream/twilio-handler.ts`, `app/lib/media-stream-token.server.ts`, `app/lib/media-stream-twiml.server.ts`, `app/routes/api+/auto-dial/$roomId.action.server.ts`, `services/media-stream/db-writer.ts`, `app/db/schema-transcription.ts`
- Existing tests: test/media-stream-token.test.ts; test/media-stream-db-writer.test.ts
- Done when: A media-stream token must authorize writes only for the workspace and the call it was minted for, and a `start` frame that names any other call must be refused. Commit 55e6477b states the intent explicitly: 'A token holder for their own workspace could send another workspace's live Call SID and inject rows the victim later sees as genuine.' For that to hold, every minted token must carry the call SID it authorizes (the field must not be optional), and the stream handler must refuse any `start` frame whose call SID is missing or different from the token's, rather than falling back to the frame's value.

### [#2873](https://github.com/chester-hill-solutions/callcaster/issues/2873) POST /account/security intent=enable replaces an already-enrolled second factor with only the password, bypassing…
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- Recommended title: **POST /account/security intent=enable replaces an already-enrolled second factor with only the password, bypassing the protected-user rule**
- The two-factor enrolment state machine at POST /account/security has no prior-state check on its `enable` transition and no protected-user check, while the sibling `disable` transition has both
- Current behavior: Fixed on dev. `intent=enable` refuses with `Two-factor authentication is already enabled.` when the account is enrolled, so a password alone can no longer replace an existing factor.
- Root cause: app/routes/account.security.loader.server.ts:61-100 handles `intent=enable` as a stateless operation: it reads the password from the form and calls Better Auth's enableTwoFactor without checking whether the account already has an enrolled second factor (isTwoFactorEnabled / the auth_two_factor row) and without applying userIsTwoFactorProtected, which the `disable` branch does apply at line 151. Better Auth's enableTwoFactor is a replacement operation (node_modules/better-auth/dist/plugins/two-factor/index.mjs:113 deletes the existing auth_two_factor row and line 126 recreates it with `verified` inherited from the previous verified row), so the missing server-side state check turns an…
- Resolution: Fixed in #2901 (`69587240`): the enable branch checks `isTwoFactorEnabled(user.id)` before calling Better Auth's `enableTwoFactor`, which replaces the factor. `app/routes/account.security.loader.server.ts`, `app/routes/api+/auth/$.loader.server.ts`.
- Look in: `app/routes/account.security.loader.server.ts`, `app/routes/account.security.tsx`, `app/routes/account.tsx`, `node_modules/better-auth/dist/plugins/two-factor/index.mjs`, `app/lib/two-factor.server.ts`, `app/server/auth-instance.ts`
- Existing tests: test/account-security.route.test.ts
- Done when: Replacing or removing an enrolled account's second factor must require assurance beyond the first factor, and a privileged account's 2FA state must be governed by the same rule that already blocks intent=disable. Concretely: the server must reject `intent=enable` when the account already has an enrolled second factor (mirroring the client-side guards at app/routes/account.security.tsx:107 and app/routes/account.tsx:229), and any deliberate re-enrolment must first prove possession of the current factor (the existing TOTP code or a backup code) and must satisfy userIsTwoFactorProtected for privileged accounts, so that the effective policy on both transitions is the same.

### [#2878](https://github.com/chester-hill-solutions/callcaster/issues/2878) Workspace settings member-role update accepts the legacy `field_director` alias and grants the `admin` role
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-22
- POST /workspaces/:id/settings (formName=updateUser) takes the target role straight from the request body and never validates it against the current workspace role vocabulary
- Current behavior: Fixed on dev. The member-role update validates the submitted role with `isMemberRole` before it is ranked or written, the escalation guard fails closed on an unknown role, and `memberRoleToRoleId` no longer maps the legacy `field_director` alias onto `admin`.
- Root cause: The role string that reaches the membership write is cast rather than validated, and the two components that reason about it disagree about the same string: assertNoRoleEscalation ranks an unknown role name as 0 (fails open), while memberRoleToRoleId recognises the legacy alias `field_director` and maps it to `admin` (fails open into a privileged role). Both are needed for the escalation: the rank guard alone is harmless, and the writer's alias alone is unreachable, because the only unvalidated producer of `field_director` is this form branch. The privileged-role 2FA gate is keyed on the same unvalidated string, so the alias also skips requireTwoFactorForPrivilegedRoleAssignment, whose…
- Resolution: Fixed in #2898 (`948b200e`): `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts:79`, `app/lib/platform-members.server.ts:151-160`, `app/lib/workspace-membership.server.ts:34-48`. The alias mapping now lives only in the one-off backfill SQL.
- Look in: `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/platform-members.server.ts`, `app/lib/member-role.ts`, `app/lib/workspace-membership.server.ts`, `app/lib/workspace-members-db.server.ts`, `app/lib/two-factor.server.ts`
- Existing tests: test/workspace-role-alias.test.ts; test/workspace-setting-utils.test.ts
- Done when: The workspace settings role-update action must accept only one of the four current workspace roles (owner, admin, member, caller), and no actor may ever grant a role that outranks their own. The sibling addUser branch on the same form enforces this with isMemberRole, and PATCH /api/workspaces/:workspaceId/members enforces it with z.enum(['owner','admin','member','caller']). A member asking for admin must be refused; only an owner/admin may grant admin, and a privileged grant must satisfy the 2FA enrolment requirement.

### [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) IVR estimates are too low. projected CPS is too high
- **IN PROGRESS** · Verdict: **Verify and close** · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-22
- The IVR launch estimate no longer projects the queue at the dial-start rate: it now computes a completion rate bounded by the concurrent-call limit over the average in-flight call time and uses THAT for the ETA, so a campaign that cannot finish in the promised time says so before it starts.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The fix is commit e833d955 'fix(ivr): bound the completion estimate by the concurrent call limit (#1874) (#1934)', an ancestor of origin/master (first merged by e3a1f002 on 2026-09-21). It matches the issue's own diagnosis comment (wra-sol, 2026-09-20) proposal-for-exactly, including the ~75s default and the concurrent-call bound, and the reporter's worked example (5000 calls, 25 concurrent, ~90s in flight -> ~5 hours) is now the shape the estimate produces. manual: true — the protocol names this case explicitly ('a number a human reads and judges: IVR estimates are too low'); the unit test proves the arithmetic, not that 75s is the right in-flight constant for the operator's actual calls (ring time, answer rate and voicemail differ per campaign), so a person has to judge whether the new number is believable against a real run.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/campaign-outbound-estimate.ts`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`
- Existing tests: test/campaign-outbound-estimate.test.ts:93-131 — 'IVR completion rate is bounded by the concurrent call limit over avg call time (#1874)' (100 concurrent -> `effectiveCompletionPerSecond` = 100/75 and < the dial-start rate, `avgCallDurationSeconds` = 75, warning contains 'bound by the concurrent call limit'), 'IVR completion rate equals the dial-start rate when concurrency is not the bound' (10,000 concurrent) and 'a low concurrent call limit caps completion well below the dial-start rate' (10 concurrent -> 10/75). Ran green on this tree: `npx vitest run -c vitest.node.config.ts test/campaign-outbound-estimate.test.ts ...` -> 4 files passed, 34 tests passed.
- Done when: A person confirms the reported symptom is gone on master.

### [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396) Make predictive machine playback and continuation retry-safe
- Verdict: **Verify and close** · Labels: none · Assignee: @wra-sol · Updated: 2026-10-22
- Predictive-machine playback is now a durable, leased operation row bound to workspace/call/attempt/campaign/actor/conference, so a signed replay polls the journal instead of issuing a second Play, the continuation job refuses to run until the post-Play acknowledgement commits, and uncertain or rejected outcomes are recorded as a recoverable state with a reconciliation job rather than silently advancing.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Change is commit db0e1686 (PR #2424, 'Make predictive machine recovery retry-safe'), confirmed in origin/master; the mechanism is still present at master head 91c4409b. manual: true because the acceptance criteria end at a real provider call — a person must hear the voicemail and confirm the continuation actually happens; the code and the 85+ real-Postgres cases stop short of that. The issue's own note (migration and registered worker verified on the release candidate, provider acceptance for playback, acknowledgement, callback retries and recovery) is a release-QA step, not a code gap. Durable-object reconciliation and uncertain attachment outcomes for audio uploads remain in their own issues (#2356); this verdict covers the predictive machine only.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/predictive-machine.server.ts`, `app/server/predictive-machine-operation.server.ts`, `app/server/predictive-successor-callback.server.ts`, `app/lib/worker/job-types.server.ts`
- Existing tests: test/integration-db/predictive-machine-operation.test.ts (real Postgres, real TwiML builder, real signature helper, real tenant-scoped claim state) — 'concurrent callbacks emit one Play and no early continuation'; 'sequential redelivery polls without replaying audio'; 'post-Play acknowledgement commits one continuation for concurrent replays'; 'failed audio preparation is recorded and a signed retry can issue once'; 'lost issued response cannot claim voicemail or replay on retry'; 'continuation is refused before the post-Play callback'; 'a waiting callback cannot issue another Play'; 'a foreign signed room cannot acknowledge an issued operation'; 'acknowledgement and disposition roll back when the outbox fails'; 'provider history with the exact post-Play request recovers lost local acknowledgement'; 'a saved successor and journal share a transaction and recovery cannot dial again'; 'unknown successor acknowledgement remains fenced after a process lease expires'. test/integration-db/predictive-machine-continuation.test.ts — the continuation/recovery cases. docs/predictive-machine-recovery.md — the recorded recovery policy.
- Done when: A person confirms the reported symptom is gone on master.

### [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) Prepare a valid A2P Messaging Profile before brand registration
- Verdict: **Verify and close** · Labels: none · Assignee: @wra-sol · Updated: 2026-10-22
- Brand registration is now gated on a prepared, submitted A2P Messaging Profile: `prepareA2pMessagingProfile` creates or recovers the `us_a2p_messaging_profile_information` EndUser, assigns it and the Secondary Customer Profile to the Trust Product, evaluates the product (requiring a `compliant` result), submits it, and only then does `provisionA2pRegistration` proceed to brand registration — with any failure thrown and surfaced instead of suppressed.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix landed in PR #2450 (commit d1f5664e), confirmed an ancestor of origin/master. This replaces the old behaviour the issue documented, where `provisionA2pRegistration` created a Trust Product, assigned the Secondary Customer Profile, had no `us_a2p_messaging_profile_information` EndUser, suppressed Trust Product submission failure and continued to brand registration anyway. manual: true — the deliverable is Twilio accepting a real A2P registration, and the tests use a synthetic provider transport (test/fixtures/a2p-profile-provider.ts) rather than the live TrustHub API, so they prove the sequence, the error surfacing and the idempotency but not that Twilio's real evaluation returns `compliant` for a real business. The issue's own note agrees: "Provider transport in tests is synthetic. Actual deployed provider verification, accepted-product repair, Authentication+, historic registration review, release QA and default-branch promotion remain. A prepared profile is not brand or campaign approval." A person still has to run a real registration against Twilio's TrustHub to confirm the profile is accepted. The manual A2P setup path through the canonical compliance jobs is the separate PR #2283.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/twilio-a2p-messaging-profile.server.ts`, `app/lib/twilio-a2p-provision.server.ts`, `app/lib/a2p-messaging-profile.server.ts`
- Existing tests: test/twilio-a2p-provision.server.test.ts — I ran it plus test/a2p-messaging-profile.test.ts and test/twilio-a2p-status-sync.test.ts against origin/master: 113 tests passed, 3 files green. The cases that carry the mechanism: "public company sends stock and representative email on EndUser, not BrandRegistration"; "submission failure retains IDs and assignment evidence for a single-resource retry"; "existing approved profile with complete actual attributes can be read without inventing local company data"; "incomplete legacy public profile is repaired before brand reuse without duplicate EndUser"; "unrecorded owned provider product and EndUser are recovered instead of duplicated"; "a preparation failure during polling is retained by the fresh-row status update"; "a concurrent business change prevents old preparation from marking the new inputs ready"; "all assignment pages are read before deciding to create a duplicate". test/integration-db/a2p-messaging-profile.test.ts — 13 real-Postgres storage and callback cases, which I also ran green against a live Postgres 18.
- Done when: A person confirms the reported symptom is gone on master.

### [#2698](https://github.com/chester-hill-solutions/callcaster/issues/2698) call interface in "Predictive Dialer" campaign says "power dialer" and in "power dialer" says "manual dialing"
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design, ux · Assignee: @wra-sol · Updated: 2026-10-20
- Recommended title: **Show the correct dialing mode on the call screen**
- PR #2754 contains the correct call-screen mode labels and regression coverage. Deployed acceptance remains after merge.
- Current behavior: Fixed on dev. The call screen labels the campaign's own dialing mode: a predictive campaign reads "Predictive dialing" and a power campaign reads "Power dialing".
- Root cause: TopChrome assigns the wrong user-facing name to both values of the predictive flag.
- Resolution: Fixed in #2754 (`e4bb8ac6`): `app/components/call/CallScreen.Header.tsx:250`.
- Look in: `app/components/call/CallScreen.Header.tsx`, `app/components/call/CallScreen.Layout.tsx`, `test/ui/call-screen-leave.test.tsx`
- Existing tests: test/ui/call-screen-leave.test.tsx; test/auto-dial.server.test.ts
- Done when: Predictive Dialer campaigns show Predictive dialing; Power Dialer campaigns show Power dialing; Existing campaign call and leave behavior stays covered
- Tracker: Review [PR #2754](https://github.com/chester-hill-solutions/callcaster/pull/2754), then verify on dev. Keep the issue open until default-branch promotion and release acceptance.

### [#2507](https://github.com/chester-hill-solutions/callcaster/issues/2507) CSV Upload success should not have a toast (or be a simple success toast that goes away).
- Verdict: **Verify and close** · Labels: ux · Assignee: @sai-sy, @wra-sol · Updated: 2026-10-20
- PR #2749 removes the persistent CSV upload success toast and keeps the inline completion message and saved report link. Full local CI passes; merge and deployed verification remain.
- Current behavior: Fixed on dev. A successful CSV upload no longer raises a persistent success toast; progress is shown in the upload panel and the notice clears.
- Root cause: The completion hook created an infinite-duration root success toast with a report download action, duplicating the upload panel's feedback and report action.
- Resolution: Fixed in #2749 (`5d453f5c`): `app/components/audience/use-audience-upload-progress.ts` no longer imports sonner or emits a success toast.
- Look in: `app/components/audience/use-audience-upload-progress.ts`, `app/components/audience/AudienceUploadProgressPanel.tsx`
- Existing tests: test/ui/audience-import-report-handoff.test.tsx
- Done when: CSV upload success does not create a root toast or a toast download prompt.; Inline completion feedback and the saved row report link remain available.; Embedded and standalone completion callbacks still run once.
- Tracker: Live inspection on 2026-10-20: Change Request; Priority Low; Effort nothing-burger; Enviornment prod; Project Status In progress; no parent, children or dependency links. PR #2749 targets dev and has the verified Development link. The old PR #2576 is closed and unmerged. Keep the issue open until the fix reaches production and the reported symptom is verified.

### [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) Pass the live caller-ID verification status to the onboarding verification sheet
- Verdict: **Verify and close** · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-20
- PR #2750 refreshes the onboarding loader from workspace_number events, so an open verification sheet changes from pending to success or failure without a reload. Merge and deployed verification remain.
- Current behavior: Fixed on dev. Number events revalidate the onboarding verification sheet, so the live caller-ID verification status appears without a reload.
- Root cause: PR #1971 added the sheet status prop, but the workspace revalidation hook listened only for campaign, campaign_queue and transaction_history events. The callback already saves and emits the workspace_number update.
- Resolution: Fixed in #2750 (`33d43c1b`): `app/hooks/realtime/useWorkspaceRealtimeRevalidation.ts` revalidates on `workspace_number` events.
- Look in: `app/hooks/realtime/useWorkspaceRealtimeRevalidation.ts`, `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/onboarding.loader.server.ts`
- Existing tests: test/ui/workspace-realtime-revalidation.test.tsx; test/ui/onboarding-first-number-flow.test.tsx
- Done when: An open pending verification sheet displays the success or failure returned by the callback without a page reload; Number events use the existing batched refresh scheduler; navigation, event filtering and cleanup controls keep passing; Complete deployed caller-ID verification acceptance before closing
- Tracker: Live inspection on 2026-10-20: Bug; Priority Low; Effort Low; Enviornment dev; Project Status In progress. Assigned to wra-sol; no parent, children or dependency links. PR #2750 is open into dev with a verified Development link; PR #1971 is the earlier incomplete fix. Keep the issue open for release and deployed acceptance.

### [#2512](https://github.com/chester-hill-solutions/callcaster/issues/2512) SMS Message page is super slow when sending out a campaign
- Verdict: **Verify and close** · Labels: ux, business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- The chats list defaults to the hasReplied filter and renders a virtual row window: the loader and the hook both default the sort to hasReplied, the SQL and the JS filter drop conversations the contact never replied to, ConversationList draws a fixed-height spacer with absolutely positioned rows, and the accumulated pages are cached under a fetcher key built from the campaign, sort and search filters.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Both asks are implemented in master: the list defaults to conversations where the other user replied, and the list is virtualised with a page cache so the page does not freeze as the list grows. manual: true because the reported symptom is perceived slowness under a real campaign load; the virtualisation is structural but no test measures frame cost, so only a person on a large campaign can confirm the page stays responsive.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/hooks/chats/useChatsPage.ts`, `id/chats.loader.server.ts`, `app/lib/database/workspace-conversations.server.ts`, `app/lib/chat-conversation-sort.ts`, `id/chats/ConversationList.tsx`, `app/lib/chats/conversation-utils.ts`
- Existing tests: test/chat-conversation-sort.test.ts:31 — 'filters out unreplied conversations for hasReplied' and the getChatSortOption default cases (lines 189-196); test/ui/use-chats-page-pagination.test.tsx:185 — 'defaults to conversations with a reply' plus the page-cache key cases; test/conversation-utils.test.ts — the phone-key merge cases. Added by 4ea8f3ba (PR #2535).
- Done when: A person confirms the reported symptom is gone on master.

### [#2519](https://github.com/chester-hill-solutions/callcaster/issues/2519) call settings: call in verification not conigured
- Verdict: **Verify and close** · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- The call-in verification number is now platform data instead of an environment variable: a verification_number table holds the numbers, getActiveVerificationNumber reads the one active row, the Admin System Settings panel registers, activates and removes a number, and the session route answers 503 'Call-in verification is not configured' when no row is active.
- Current behavior: The code is in master. What is left is a person's action on master, so the issue stays open until they finish it and confirm it.
- Root cause: PARTIAL, and manual. What is covered: the number is no longer an invisible, redeploy-only environment variable. It is a database row, it is visible and changeable in Admin, the decision is written in docs/adr/0038, and the route answers a clean 503 instead of failing. What is not covered: the number itself. The issue's screenshot is the Call settings modal showing 'Call-in verification is not configured', and that is exactly what production still shows after this release, because no row is active. The release guide for the same release says so in plain words. The remaining work is an operator action, not a code change: register and activate a number in Admin (or run scripts/configure-verification-number.mjs), then place a real verification call. manual: true because that last step is a real phone call to a real handset. The candidate commit 6c7c361a (PR #2726) is not an ancestor of origin/master by SHA, but its content is in master through the release merge 91c4409b.
- Resolution: No new code. Register and activate the number (or run the operator script), then make the real call and confirm it.
- Look in: `app/lib/verification-number.server.ts`, `/verify-call-in-session.loader.server.ts`, `/route.action.server.ts`, `/panels/AdminSystemSettingsPanel.tsx`, `docs/release-test-guide-2026-10-19.md`
- Existing tests: No automated test for this change. scripts/configure-verification-number.mjs registers and activates a number in one transaction and is the operator path, and docs/release-test-guide-2026-10-19.md:13-21 lists the manual checks.
- Done when: A person confirms the reported symptom is gone on master.

### [#2268](https://github.com/chester-hill-solutions/callcaster/issues/2268) Deliver inbound IVR voicemail to the script recipient
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- An IVR `voicemail:{email}` target is now bound to the call before the recording TwiML is emitted — the first valid recipient wins and is stored in a workspace-scoped `inbound_voicemail_recipient` row keyed by (call, phone, workspace) — and the recording callback reads that bound recipient (falling back to the number's `inbound_action` only when there is no binding), so the script's inbox receives the voicemail and a callback field cannot replace it.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix landed in PR #2446 (commit 63c80142), confirmed an ancestor of origin/master. manual: true — the deliverable is a real email landing in a real inbox. The 31 integration cases stub the Resend transport and the S3 copy, so they prove the routing, the binding, the idempotency and the retry semantics (the provider call is asserted to carry `to: ["script@example.test"]`), but they do not prove that a real Resend message actually arrives in the script recipient's inbox. The issue's own verification note agrees: "Provider boundaries are stubbed in tests; no live provider message or account change was made" and "Deployed-dev recording delivery ... remain open." A person still has to place a real inbound call, let it reach the voicemail target and confirm the message arrives in the script's inbox. Storage and playback of the recording itself are #2088 (verified separately).
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `blockId/response.action.server.ts`, `app/server/inbound-voicemail-store.server.ts`, `/email-vm.action.server.ts`, `app/lib/ivr-script-validation.ts`, `docs/contact-center-platform-plan.md`
- Existing tests: test/integration-db/inbound-voicemail-recipient.test.ts — 31 real-Postgres cases, all passing when I ran them against origin/master with a live Postgres 18. The ones that carry the mechanism: "the IVR script inbox receives the recording instead of a different number default" (the provider send is addressed to `script@example.test`, not the number's `default@example.test`); "legacy recording delivery retains the number default when there is no IVR binding"; "the bound recipient survives an old workspace row for the same phone"; "script edits and duplicate menu responses cannot replace the bound inbox"; "callback email fields cannot override the stored recipient" (a forged `Email`/`recipient`/`To` form field is ignored); "a cross-workspace menu response cannot record or bind an inbox"; "a general recording URL write cannot suppress bound IVR delivery"; "a completed callback replay does not resend or rebuild the email"; "provider retry preserves the exact payload and key after settings change"; "an uncertain retry outside the provider key window does not send again or choose another inbox"; "concurrent callbacks cannot own two email attempts".
- Done when: A person confirms the reported symptom is gone on master.

### [#2148](https://github.com/chester-hill-solutions/callcaster/issues/2148) The inbound IVR renderer has no speech-text fallback and no WAV sidecar lookup, so a documented-format block emits an empty Say
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- The inbound IVR block route no longer renders audio with its own local handler: it delegates to the shared `renderIvrBlock`, which falls back through audioFile → content → prompt → title for the spoken words (so a documented content-only block speaks instead of emitting an empty `<Say></Say>`), keeps the editor-selected voice, and resolves the WAV sidecar for recorded blocks with the stored MP3 as fallback.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix commit 4d9bbde2 (PR #2456) is an ancestor of origin/master and the master copy of the inbound route still calls `renderIvrBlock` (line 46). manual: true because the reported symptom is what a caller hears on a live inbound call ('the caller hears nothing at that step and the call appears to hang'), and only a person on a real line can confirm the prompt is audible — the same treatment the sibling IVR prompt verdicts (#1841, #1856, #1857) received in this sweep. The TwiML itself is provably non-empty and the source-side repair is complete; the follow-on workspace-binding defect (#2455) is a separate issue. No live Twilio call was made. Run note: test/inbound-ivr-block.route.test.ts was run green in this checkout (node config).
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `blockId.action.server.ts`, `app/lib/ivr-block-render.server.ts`, `app/lib/ivr-wav.server.ts`
- Existing tests: test/inbound-ivr-block.route.test.ts — "content speech stays inside the inbound Gather with its response URL" asserts `<Gather action="…/response" …><Say voice="Polly.Salli-Neural">Press one</Say></Gather>` and no `<Say/>`/`<Say></Say>`; "keeps editor speech and its selected allowed voice" asserts `<Say voice="Polly.Matthew-Neural">Editor words</Say>`; "signs the existing WAV sidecar in the number's workspace" asserts the signed key `ivr-wav/w1/a.wav`; "a failed sidecar lookup still plays the canonical MP3" asserts `workspaceAudio`, `w1/a.mp3`. test/integration-db/inbound-ivr-prompt.test.ts covers the persisted inbound prompt cases.
- Done when: A person confirms the reported symptom is gone on master.

### [#2061](https://github.com/chester-hill-solutions/callcaster/issues/2061) Dark mode: a neutral Alert reads as an error because --brand-wash goes dark maroon while --brand-tertiary stays pale
- Verdict: **Verify and close** · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- Option B shipped: the shared Alert's default variant is now the neutral card surface (`bg-card text-card-foreground border-border`) instead of `border-brand-tertiary bg-brand-wash`, so a neutral Alert no longer inherits the dark-maroon `--brand-wash` and reads as an error in dark mode; warning-toned sites now select an explicit `variant="warning"`, and every unvarianted Alert site is listed in the inventory with a tone decision.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Change is commit f9b9670c (PR #2561, 'Use neutral alerts and explicit warning tones (#2061)'), confirmed an ancestor of origin/master. The mechanism that fixes the reported defect is code-level and machine-readable: the default Alert no longer uses `--brand-wash`/`--brand-tertiary` at all, so the dark-mode maroon wash cannot apply to a neutral Alert. manual: true, however, because the issue's stated remaining verification is 'Actual light/dark rendered tone and contrast, including default/explicit warning sites; browser geometry for any migrated dynamic notices' — the test asserts class names in jsdom, which cannot prove the perceived dark-mode contrast or that the migrated dynamic notices do not shift layout. A human must look at the rendered light/dark result. Note also that the global `brand-wash` / `brand-tertiary` tokens were deliberately left unchanged, as the issue's Option B decision required.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx`, `app/components/ui/alert.tsx`, `app/routes/account.tsx`, `workspaceId/twilio/AdminTwilioPortal.HealthPanel.tsx`, `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx`, `docs/feedback-inventory.md`
- Existing tests: test/ui/alert-tones.test.tsx — 'omitted and explicit neutral variants use the agreed card surface' asserts the neutral Alert has `bg-card text-card-foreground border-border` and NOT `bg-brand-wash border-brand-tertiary`; 'bulk-send safeguards use the warning surface' asserts `bg-warning/` and not `bg-brand-wash`; 'stored webhook drift is a warning rather than a neutral summary' asserts `bg-warning/`; 'the actual MFA setup form uses the warning tone after its fetcher result' asserts `observeTone` was last called with "warning"; 'insufficient rental credits retain the existing error surface and billing remedy' keeps `bg-destructive/` and the Buy-credits link.
- Done when: A person confirms the reported symptom is gone on master.

### [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) Dead Twilio recording callbacks on dial/:number and connect-campaign-conference
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- The manual-dial path now sends Twilio's `recordingStatusCallback` to the canonical signed `/api/recording` endpoint with the `completed` event, and the campaign-conference path no longer sets `record` at all, so no outbound path captures audio that CallCaster never downloads.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Change is commit bc74dd45 (PR #2439, 'Route manual recordings and remove unsupported conference capture (#2439)'), confirmed an ancestor of origin/master. manual: true — the evidence stops at the code: the tests use the real SDK TwiML builder but mock provider IO and the auth boundary, so they do not prove that a real Twilio call actually delivers the `completed` recording callback, that the MP3 is downloaded, or that it is stored and playable in Call History. The issue's own scope explicitly allowed the conference removal option, and that option is what shipped. Conference-aware recording/storage remains a separate open decision under #1873.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `number.action.server.ts`, `campaignId.loader.server.ts`, `/recording.action.server.ts`, `/call.action.server.ts`
- Existing tests: test/dial-number.route.test.ts:78-80 — asserts the rendered TwiML matches `<Dial[^>]*record="record-from-answer"`, `<Dial[^>]*recordingStatusCallback="https://base.example/api/recording"` and `<Dial[^>]*recordingStatusCallbackEvent="completed"`. test/connect-campaign-conference.route.test.ts:63 — asserts `expect(body).not.toMatch(/<Conference[^>]*\brecord=/)` while the join settings (`endConferenceOnExit`, `startConferenceOnEnter`, `beep`, `waitUrl`) are retained.
- Done when: A person confirms the reported symptom is gone on master.

### [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) auth pages: sign-in hides the real error behind "We couldn't sign you in, Try again shortly"
- Verdict: **Verify and close** · Labels: business-logic · Assignee: none · Updated: 2026-10-19
- Sign-in failures are no longer collapsed into one generic message: the shared login helper maps Better Auth's known credential codes (and their expected status) to safe user-facing text, gives provider rate limits their own retry message, and only falls back to the generic string for unknown codes, mismatched statuses, database or network failures — and the browser surfaces that text through the root toast.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The fix is commit 81aebcbb 'Show safe sign-in errors for known provider failures (#2361)', an ancestor of origin/master (first merged by release 268c2692 on 2026-10-08). The issue's own 'Deployed QA — 8 October 2026' section already records browser evidence for the known-credential case on staging, and it explicitly separates the empty-form validation defect into #2494 (out of scope here). manual: true — the issue's remaining acceptance is explicitly a deployed one: 'Check rate-limit feedback and a temporary provider failure on the deployed sign-in page', plus desktop and approved-account checks and two-factor routing. A 429 and a genuine provider outage cannot be produced by a local test, so a person has to sign in on the deployed page and observe the toast.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/platform-auth.server.ts`, `app/routes/signin.action.server.ts`, `app/routes/signin.tsx`
- Existing tests: test/platform-auth.test.ts — the provider-code and status mapping cases for `loginWithPassword` (known 401 invalid-credentials, 403 email-not-verified, 429 rate limit, unknown code, mismatched status, and a thrown DB/network failure that must keep the generic text). test/ui/signin-feedback.test.tsx — 'shows <message> once through the root toaster and retains the form' for 'Invalid email or password.', 'Too many sign-in attempts. Wait a minute and try again.' and "We couldn't sign you in. Try again shortly."; it asserts the toast appears once, the message is NOT inside `<main>` (i.e. not inline text), and the password field keeps its value. The node suite ran green on this tree (`npx vitest run -c vitest.node.config.ts ... test/platform-auth.test.ts` -> 4 files passed, 34 tests passed). The UI suite could NOT be run in this checkout: every UI test fails with 'Cannot read properties of null (reading useContext)' from the vendored shad-cc copy of next-themes/react, and an unrelated control UI test (test/ui/debounce-owner-unmount.test.tsx) fails identically — a local install artifact, not a code defect. The UI test is part of CI.
- Done when: A person confirms the reported symptom is gone on master.

### [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) IVR key press does not interrupt the current audio block (prompt sits outside the Gather)
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- The IVR prompt is now emitted inside the `<Gather>` element instead of as its sibling, so Twilio listens for DTMF while the prompt plays and a key press stops the audio and takes the mapped branch; both the outbound campaign IVR and the inbound IVR route render through the same shared block renderer that does this.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix commit 51240b0b 'fix(ivr): nest prompts inside Gather so key presses interrupt audio (#1841) (#1851)' — `git merge-base --is-ancestor 51240b0b origin/master` confirms it is in master. The TwiML snapshot tests prove the structural change (prompt inside Gather) but the barge-in itself is a Twilio platform behaviour heard on a live PSTN call, so manual: true: a person still has to place a call and press a key mid-prompt to confirm the audio actually stops. The issue's note about `speechTimeout`/`timeout` still behaving with a nested prompt is covered — the gather attributes are unchanged except for the DTMF-only/speech split (see #1856) and `numDigits` for single-key menus.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-block-render.server.ts`, `blockId.action.server.ts`, `test/ivr-block.route.test.ts`, `test/inbound-ivr-block.route.test.ts`
- Existing tests: test/ivr-block.route.test.ts (outbound) and test/inbound-ivr-block.route.test.ts (inbound) — both assert the nested `<Gather><Play/></Gather>` TwiML. Ran green: `DATABASE_URL=... npx vitest run test/inbound-ivr-block.route.test.ts test/ivr-page.route.test.ts` → 2 files / 24 tests passed; test/ivr-block.route.test.ts also passed in the earlier run.
- Done when: A person confirms the reported symptom is gone on master.

---

## Needs reproduction — 16

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

### [#2902](https://github.com/chester-hill-solutions/callcaster/issues/2902) Caller-supplied forwarded host/proto widen the per-request Better Auth trusted-origin list; a wildcard host becomes a catch-all glob that switches off the CSRF…
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-24
- resolveAuthTrustedOrigins() adds one entry per request to the trusted-origin set, derived entirely from the request's own forwarding headers, with no allowlist against the configured origins and no check of the header value
- Current behavior: resolveAuthTrustedOrigins() adds one entry per request to the trusted-origin set, derived entirely from the request's own forwarding headers, with no allowlist against the configured origins and no check of the header value. app/server/auth-instance.ts:20 passes that resolver to Better Auth as `trustedOrigins`, and better-auth 1.6.23 matches the Origin header (the CSRF check) and the callbackURL/redirectTo (the post-authentication redirect allow-list) against the merged list with matchesOriginPattern, which compares http/https origins exactly BUT expands any pattern containing `*` or `?` into a glob. Verified locally against the application's own auth instance (drizzle + Postgres) and the…
- Root cause: app/lib/auth-trusted-origins.server.ts:84-87 reads `x-forwarded-host` (first comma-separated element) with the `host` header as fallback, and `x-forwarded-proto` for the scheme, from the request itself; lines 100-109 then add `${proto}://${host}` to the trusted-origin set with no allowlist against the configured origins, no hostname validation and no rejection of wildcard characters. app/server/auth-instance.ts:20 passes that resolver to Better Auth as the `trustedOrigins` option, and Better Auth's matcher (node_modules/better-auth/dist/auth/trusted-origins.mjs:18-22) expands any pattern containing `*` or `?` into a glob, so a caller-chosen host of `*` becomes a catch-all pattern. Both…
- Resolution: Owner-observed check against the application's own public auth endpoint, non-destructive and creating no account and no session for a real user. Use a non-existent address and a made-up password: POST https://<app-host>/api/auth/sign-in/email with Content-Type: application/json, body {"email":"v40-probe@example.invalid","password":"not-a-real-password"}, header `Origin: https://probe-host.invalid` and header `X-Forwarded-Host: probe-host.invalid`; repeat once with `X-Forwarded-Host: *` and `X-Forwarded-Proto: https`; repeat once with no X-Forwarded-* header at all as the control. Send at most three requests and space them more than 10 seconds apart so Better Auth's own per-path rate limit…
- Look in: `app/lib/auth-trusted-origins.server.ts`, `app/server/auth-instance.ts`, `node_modules/better-auth/dist/auth/trusted-origins.mjs`, `node_modules/better-auth/dist/api/middlewares/origin-check.mjs`, `node_modules/better-auth/dist/cookies/index.mjs`, `server/bun.ts`, `app/lib/safe-redirect.ts`, `app/routes/remember.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2924](https://github.com/chester-hill-solutions/callcaster/issues/2924) Unsanitised media name reaches the workspaceAudio S3 object key and the signed URL, bypassing the repository's own traversal check; the cross-tenant effect is…
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Source-confirmed defect: a workspace member controls the media name supplied as the form field `name` (or `media-name`) on POST /api/workspaces/$workspaceId/audios
- Current behavior: Source-confirmed defect: a workspace member controls the media name supplied as the form field `name` (or `media-name`) on POST /api/workspaces/$workspaceId/audios. That name reaches the workspaceAudio object key with `..` and `/` intact - `uploadWorkspaceAudioApi` builds `${workspaceId}/${getSafeMediaBaseName(name)}.${ext}` (app/lib/platform-media.server.ts line 127), `getSafeMediaBaseName` (app/lib/audio-upload.ts line 53) only strips a trailing allowed audio extension, and `uploadObject` (app/lib/object-storage.server.ts line 202) validates nothing about the path it is handed. The repository ships the rule for exactly this job - `isSafeObjectName` (app/lib/audio-upload.ts line 36), whose…
- Root cause: `getSafeMediaBaseName` is used as the object-name sanitiser for the workspace audio library, but it only removes a known trailing audio extension and never rejects path separators or dot segments, so it is not the control the repository states for this job. The repository already ships two controls for exactly this job - `isSafeObjectName` (app/lib/audio-upload.ts line 36, applied to every route parameter that is concatenated into an object key) and `sanitizeFilename` (app/lib/media-upload.server.ts line 44, used by /api/media and /api/message_media). `uploadWorkspaceAudioApi` uses neither, and `uploadObject` in app/lib/object-storage.server.ts performs no validation of the object path, so…
- Resolution: Owner-observed, non-destructive, on the deployed bucket only. (1) Create two throwaway non-production workspaces P (the uploader) and T (the target) and record their UUIDs. (2) From P, POST /api/workspaces/<P>/audios with a small throwaway audio file and the form field name='../<T-uuid>/probe.mp3'; record the response status (201 versus 4xx/5xx). (3) List the bucket keys (Railway dashboard or `aws s3api list-objects-v2` against the same bucket) and record whether a key appears as the literal '<P-uuid>/../<T-uuid>/probe.mp3' or as the cleaned '<T-uuid>/probe.mp3'. (4) GET the signed_url from the response twice - once exactly as a browser would (the path normalises) and once with the raw path…
- Look in: `app/lib/audio-upload.ts`, `app/lib/media-upload.server.ts`, `app/lib/platform-media.server.ts`, `app/lib/object-storage.server.ts`, `app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts`, `app/routes/workspaces+/$id/audios/new.action.server.ts`, `app/lib/audio-clip.server.ts`, `app/routes/api+/audio-upload.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2923](https://github.com/chester-hill-solutions/callcaster/issues/2923) Job claim fence binds only the lane id, not the per-claim attempt number
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The worker's post-claim fence is `id + status='running' + claimed_by = workerId` (poll-jobs.server.ts:228-230, 253-256, 354-357)
- Current behavior: The worker's post-claim fence is `id + status='running' + claimed_by = workerId` (poll-jobs.server.ts:228-230, 253-256, 354-357). The identity it stores is not per claim: `claimed_by` is a process-scoped lane id, `bun-worker-${process.pid}-${Date.now()}` (poll-jobs.server.ts:70-72), reused for every claim that process makes, while the per-claim discriminator `attempt_count` is written by the claim UPDATE (poll-jobs.server.ts:188-190) and never used by the fence. Two claims of the same row that share a `claimed_by` value are therefore indistinguishable: the earlier attempt's completeJob, failJob and heartbeat satisfy the fence and overwrite the newer owner's state. This was reproduced…
- Root cause: The claim identity stored on the row is not unique per claim. `claimed_by` is set to a process-scoped lane id (`bun-worker-${process.pid}-${Date.now()}`, poll-jobs.server.ts:70-72) that is reused for every claim that process makes (poll-jobs.server.ts:188), and the post-claim UPDATEs fence on `claimed_by` alone (poll-jobs.server.ts:228-230, 253-256, 354-357) without binding the attempt number that claimNextJob increments (poll-jobs.server.ts:190). Two claims of the same row that share a claimed_by value are therefore indistinguishable, so an earlier attempt's completeJob, failJob or heartbeat passes the fence and overwrites the newer owner's state.
- Resolution: Read-only, with no queue writes: (1) in the Railway console for the worker service, read the replica count and the container and pid model, because the repository states the console rather than railway.worker.toml is authoritative; (2) collect the `worker.start` banner line, which prints the workerId (worker/index.ts:168), from every live worker process and check whether two concurrently live processes ever report the SAME workerId, since that is the only way two claim-holders of one row can share a claimed_by value; (3) establish the lease-expiry precondition from the rows themselves through the operator's own admin jobs view (app/lib/admin-jobs.server.ts), looking for rows with…
- Look in: `app/lib/worker/poll-jobs.server.ts`, `app/lib/worker/run-worker.server.ts`, `app/server/audience-import-recovery.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `test/worker.test.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2921](https://github.com/chester-hill-solutions/callcaster/issues/2921) Tenant-scoped Drizzle facade hands out an unscoped raw-SQL executor, so TenantDb.execute applies no workspace predicate
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- createTenantDb implements tenancy as a per-table workspaceFilter (app/server/tenant-db.ts:187) that is merged into each table method's where clause (lines 191-223), and the facade's own doc comment promises exactly that (lines 33-35):…
- Current behavior: createTenantDb implements tenancy as a per-table workspaceFilter (app/server/tenant-db.ts:187) that is merged into each table method's where clause (lines 191-223), and the facade's own doc comment promises exactly that (lines 33-35): 'Auto-scoped Drizzle facade for a single workspace. Every table in WORKSPACE_SCOPED_TABLES is filtered by its tenancy column on every query.' The facade also attaches execute (line 227), which forwards the caller's SQL straight to the shared Drizzle client with no tenancy predicate of any kind, and execute is part of the exported TenantDb type (line 40), so the tenant-scoped facade structurally satisfies RpcExecutor (app/lib/db-rpc.server.ts:9) and can be…
- Root cause: app/server/tenant-db.ts#createTenantDb builds a per-workspace facade whose tenancy guarantee is implemented solely as a per-table workspaceFilter merged into findMany/findFirst/insert/insertMany/update/delete/count (app/server/tenant-db.ts:187-223), while the same facade attaches execute, defined as (query: SQL) => dbInstance.execute(query) at app/server/tenant-db.ts:227 and declared on the exported TenantDb type at app/server/tenant-db.ts:40. Because execute bypasses the per-table facade entirely, none of the workspaceScopedFilter predicates apply to it, so the one method that can reach any table, column or plpgsql function is the one method the filter never reaches. The type is part of…
- Resolution: Owner-observed inspection only, no probing of a live target and no writes: (1) read the deployed definition with SELECT pg_get_functiondef('public.claim_next_queue_contact(integer,uuid)'::regprocedure) and compare it with client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql, confirming whether it still selects only on ca.id = campaign_id_variable, still takes no workspace argument, and is SECURITY DEFINER; (2) compare the deployed application build against commit 67d40abb for the set of call sites that pass a TenantDb to an RpcExecutor or call TenantDb.execute, and identify any caller that binds a campaign id without first proving it belongs to the caller's workspace;…
- Look in: `app/server/tenant-db.ts`, `app/lib/campaign-queue-db.server.ts`, `client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql`, `app/lib/auto-dial-start.server.ts`, `app/routes/api+/auto-dial/status.action.server.ts`, `app/lib/contacts/tenant-scope.server.ts`, `app/routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2917](https://github.com/chester-hill-solutions/callcaster/issues/2917) public.claim_next_queue_contact has no workspace predicate and the tenant-scoped executor adds no filter to raw SQL
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- public.claim_next_queue_contact(campaign_id_variable integer, user_id_variable uuid) is SECURITY DEFINER and its deployed body never mentions a workspace column: the row set is selected from campaign_queue JOIN contact JOIN campaign WHERE…
- Current behavior: public.claim_next_queue_contact(campaign_id_variable integer, user_id_variable uuid) is SECURITY DEFINER and its deployed body never mentions a workspace column: the row set is selected from campaign_queue JOIN contact JOIN campaign WHERE ca.id = campaign_id_variable, and the UPDATE that follows writes that row with no workspace predicate either. The application reaches it through createTenantDb(workspaceId).execute(), whose execute is a straight pass-through to the underlying client, so the 'tenant-scoped' executor contributes no isolation to the raw SQL. Independently reproduced in the parent-approved sandbox against a private Postgres 18 booted from the repository migration chain, with…
- Root cause: public.claim_next_queue_contact(campaign_id_variable integer, user_id_variable uuid) is SECURITY DEFINER and filters only on `ca.id = campaign_id_variable`, with no workspace comparison on campaign_queue, contact or campaign (client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql:20-46, 52-71; pg_get_functiondef of the deployed body on the sandbox database returns a 2488-character body with no occurrence of the word 'workspace' at all). The application calls it as `select * from claim_next_queue_contact(campaignId, userId::uuid)` through the caller-supplied executor (app/lib/campaign-queue-db.server.ts:163-165), and createTenantDb's execute is a straight pass-through to…
- Resolution: Owner-observed checks on a database copy (no live traffic, read-only): (1) select cq.id, cq.workspace, cq.campaign_id, c.workspace as contact_workspace from campaign_queue cq join contact c on c.id = cq.contact_id where cq.workspace <> c.workspace - any row proves the foreign-contact precondition of the second blocker; (2) select c.id, c.workspace, c.campaign_id from call c where c.campaign_id is not null and not exists (select 1 from campaign cm where cm.id = c.campaign_id and cm.workspace = c.workspace) - any row proves a call row already carries another workspace's campaign; (3) select ca.contact_id, c.workspace as contact_workspace, a.workspace as audience_workspace from…
- Look in: `client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql`, `app/server/tenant-db.ts`, `app/lib/campaign-queue-db.server.ts`, `app/lib/auto-dial.server.ts`, `client/migrations/20260705000200_add_campaign_queue_workspace.sql`, `client/migrations/20260930150000_dequeue_paths_clear_inflight_claim.sql`, `app/routes/api+/auto-dial/$roomId.action.server.ts`, `app/routes/api+/auto-dial/status.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2915](https://github.com/chester-hill-solutions/callcaster/issues/2915) e2e.yml is the only workflow with no workflow-level permissions block, and its changes job runs the pull request's own script with an unpinned GITHUB_TOKEN
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Verified in source: of the nine workflow files in .github/workflows, eight declare a workflow-level `permissions:` block (ci.yml:32, issue-on-dev.yml:48, ledger-drift-check.yml:77, pr-issue-reference.yml:18, railway-iac.yml:25,…
- Current behavior: Verified in source: of the nine workflow files in .github/workflows, eight declare a workflow-level `permissions:` block (ci.yml:32, issue-on-dev.yml:48, ledger-drift-check.yml:77, pr-issue-reference.yml:18, railway-iac.yml:25, release-close-issues.yml:44, review-coverage.yml:24, schema-default-drift.yml:34) and e2e.yml does not. Inside e2e.yml the sibling `e2e` job pins `contents: read` and `packages: read` at job level (e2e.yml:59-61), but the `changes` job (e2e.yml:41-52) declares no `permissions:` at either level, so its GITHUB_TOKEN is never pinned by this repository. That job checks out the pull request's merge ref (e2e.yml:46, `actions/checkout@v4` with `fetch-depth: 0` and no `ref:`…
- Root cause: The token-permission narrowing that the repository applies at workflow level was not applied to .github/workflows/e2e.yml, and the one job left without a pinned token is the job that executes unmerged pull-request code.
- Resolution: Owner-observed, read-only checks; no probe of a deployed target and no workflow edit required. (1) Read the default token permission setting: repository Settings > Actions > General > 'Default Workflow permissions', plus the organisation default under Organization Settings > Actions > Policies if the organisation sets one. If the effective default is the read-only default, the unpinned job's token is equivalent to the pinned {contents: read, packages: read} and the finding is a hardening and consistency gap with no privilege difference. (2) Read the effective scope of the `changes` job's token on a recent pull-request run of e2e.yml, using the sibling `e2e` job as the control; the job log…
- Look in: `.github/workflows/e2e.yml`, `.github/workflows/ci.yml`, `scripts/ci-changes.mjs`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2914](https://github.com/chester-hill-solutions/callcaster/issues/2914) Workspace deletion performs no teardown: it purges no stored objects and releases no provider resources, and the cascade destroys the only database records of…
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Both server-side workspace-delete paths end in the same five-line function
- Current behavior: Both server-side workspace-delete paths end in the same five-line function. handleDeleteWorkspace calls deleteWorkspaceById(workspaceId) and nothing else: it issues no object-storage request and no provider request, so the tenant's stored objects are never purged and the tenant's Twilio subaccount and rented numbers are never released. At the same moment the workspace row goes, the FK cascade destroys every database record that identifies those provider assets, leaving the platform holding objects it will never clean up and provider resources it can no longer map to a tenant. Reproduced in the sandbox against the application's own modules on a private Postgres 18: with S3 pointed at a local…
- Root cause: The workspace teardown is a bare row delete. deleteWorkspaceById (app/lib/workspace-members-db.server.ts:375-381) issues a single DELETE on the workspace row through the unscoped admin client and adds no teardown step: it does not list or delete the tenant's objects under the workspaceAudio, messageMedia, campaign-exports and audience-uploads prefixes, and it makes no call to release the tenant's Twilio subaccount or rented numbers. The FK cascade then removes the rows that hold the Twilio number SIDs and, with the workspace row, the subaccount auth token - the only records the platform has of those provider assets.
- Resolution: Owner-observed, on a scratch tenant in a staging environment, with no real customer data and no destructive action beyond the tenant itself: (a) pick a tenant with no job rows (or delete its job rows first) so the delete is not rejected by job_workspace_id_fkey, and record before the delete its workspace uuid, its subaccount SID and auth token (workspace.twilio_data), the SIDs of its rented numbers (workspace_number.twilio_phone_number_sid, workspace_number_purchase.provider_sid) and the exact object keys under the workspaceAudio/<ws>/, messageMedia/<ws>/, campaign-exports/<ws>/ and audience-uploads/<ws>/ prefixes; (b) delete the workspace with DELETE /api/workspaces/{id} as the owner…
- Look in: `app/lib/workspace-members-db.server.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/object-storage.server.ts`, `app/db/schema.ts`, `drizzle/0000_baseline.sql`, `docs/remediation/workspace-billing.md`, `scripts/lib/twilio-resource-prune-policy.mjs`, `app/lib/worker/handlers/cron.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2910](https://github.com/chester-hill-solutions/callcaster/issues/2910) The Stripe Checkout return URLs are built from the incoming request origin instead of the configured canonical origin env.BASE_URL(), and the payment-return…
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- When a workspace Admin starts a credit purchase, app/lib/platform-billing.server.ts:146 computes `const baseUrl = new URL(requestUrl).origin` from the URL of the incoming request, and lines 170-171 send `success_url =…
- Current behavior: When a workspace Admin starts a credit purchase, app/lib/platform-billing.server.ts:146 computes `const baseUrl = new URL(requestUrl).origin` from the URL of the incoming request, and lines 170-171 send `success_url = ${baseUrl}/confirm-payment?session_id={CHECKOUT_SESSION_ID}` and `cancel_url = ${baseUrl}/workspaces/<workspaceId>/billing?payment_status=canceled` to Stripe. The configured canonical public origin, env.BASE_URL() (app/lib/env.server.ts:196), is never consulted: the string 'BASE_URL' does not occur anywhere in app/lib/platform-billing.server.ts, although the file already imports `env` for the Stripe key. I reproduced the app-side behaviour independently in the approved sandbox…
- Root cause: app/lib/platform-billing.server.ts:146 derives the Stripe Checkout return-URL origin from the incoming request URL (its host and scheme) instead of from the configured canonical origin env.BASE_URL(). The host and scheme of a request are a deployment-level trust decision that the application is expected to normalise, and it does not: server/bun.ts hands the raw request to the React Router handler without rewriting the URL from X-Forwarded-Host or X-Forwarded-Proto (the only reader of those headers in the tree is app/lib/auth-trusted-origins.server.ts:85-87, for Better Auth's origin set), and Bun derives the request origin from the Host header or the absolute-form request target.
- Resolution: Owner-observed, read-only checks. (a) Read BASE_URL (and BETTER_AUTH_URL) from the app service's environment variables in the Railway dashboard - no changes. (b) In the Stripe dashboard, open the most recent Checkout Sessions for the platform account and read their success_url: record the host and whether the scheme is https - read-only inspection, do not create, complete or refund a session. (c) Determine what the edge sends to the app: whether the request that reaches the app carries the canonical Host header and whether X-Forwarded-Proto is set, and whether the edge answers http with an https redirect (if it does, note that the cleartext first hop still exposes the session id). (d) If…
- Look in: `app/lib/platform-billing.server.ts`, `app/routes/api+/workspaces+/$workspaceId/billing/checkout-session.action.server.ts`, `app/routes/workspaces+/$id/billing.action.server.ts`, `server/bun.ts`, `app/lib/twilio-webhook.server.ts`, `app/lib/low-credit-notify.server.ts`, `app/lib/env.server.ts`, `app/lib/safe-redirect.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2909](https://github.com/chester-hill-solutions/callcaster/issues/2909) Workspace audio upload buffers the whole multipart body with no application-level byte cap and enforces no file-size limit
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- POST /api/workspaces/:workspaceId/audios (app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts:36), POST /api/audio-upload (app/routes/api+/audio-upload.action.server.ts:17) and the workspace-UI form action POST…
- Current behavior: POST /api/workspaces/:workspaceId/audios (app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts:36), POST /api/audio-upload (app/routes/api+/audio-upload.action.server.ts:17) and the workspace-UI form action POST /workspaces/:workspaceId/audios/new (app/routes/workspaces+/$id/audios/new.action.server.ts:30, a third audio upload entrypoint the candidate did not cite) read their multipart body with `await request.formData()` and pass the file to uploadWorkspaceAudioApi -> normalizeUploadedAudio -> assertValidAudioUpload (app/lib/audio.server.ts:88), which checks only the file extension and the MIME type and has no size check. The repository's own bounded-body control is applied to…
- Root cause: The audio upload path never applies the repository's existing bounded-body control. `app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts:36`, `app/routes/api+/audio-upload.action.server.ts:17` and `app/routes/workspaces+/$id/audios/new.action.server.ts:30` call `await request.formData()` instead of `readBoundedFormData(request, MAX_MEDIA_BODY_BYTES)` (`app/lib/bounded-form-data.server.ts:11`), and the shared validator `assertValidAudioUpload` (`app/lib/audio.server.ts:88`) omits the `file.size > MAX_MEDIA_FILE_BYTES` check that its sibling `validateMediaFile` (`app/lib/media-upload.server.ts:79`) performs.
- Resolution: Owner-observed on the production service, non-destructive and with no load generation: (1) confirm the effective maxRequestBodySize of the production Bun server, since server/bun.ts:357 sets none; (2) confirm the memory limit configured for the `callcaster` Railway service, which has one replica (.railway/environments/production.ts:80); (3) confirm whether any edge proxy in front of the application caps request bodies below 134,217,728 bytes; (4) as a single-request check only (one request, no concurrency), observe that POST /api/audio-upload, POST /api/workspaces/:workspaceId/audios or POST /workspaces/:workspaceId/audios/new today accepts a body larger than 10,551,296 bytes and does not…
- Look in: `app/lib/media-upload.server.ts`, `app/lib/bounded-form-data.server.ts`, `app/routes/api+/media.action.server.ts`, `app/routes/api+/message_media.action.server.ts`, `app/lib/api-surface-annotations.ts`, `app/lib/openapi-build.ts`, `app/lib/api-write-rate-limit.server.ts`, `app/lib/platform-media.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2908](https://github.com/chester-hill-solutions/callcaster/issues/2908) Transcoded audio output has no byte ceiling: the ffmpeg child's whole stdout is buffered in the shared web process and the only limit is a 10-minute wall clock
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Every accepted workspace-audio upload runs ffmpeg twice: once to normalise the file to MP3 (app/lib/audio.server.ts:155) and once to write the 8 kHz mono PCM WAV sidecar (app/lib/audio.server.ts:185)
- Current behavior: Every accepted workspace-audio upload runs ffmpeg twice: once to normalise the file to MP3 (app/lib/audio.server.ts:155) and once to write the 8 kHz mono PCM WAV sidecar (app/lib/audio.server.ts:185). `runAudioProcess` pushes every stdout chunk into an array and concatenates it (app/lib/audio-process.server.ts:36 and :49), so the whole transcoded output is resident in the one web process that serves every workspace. The sidecar encoder is fixed at 8 kHz, 1 channel, pcm_s16le (app/lib/audio.server.ts:72), which emits 16,000 bytes of uncompressed PCM per second of source audio however small the uploaded file was, and the upload path never bounds the source duration: `assertValidAudioUpload`…
- Root cause: `runAudioProcess` (app/lib/audio-process.server.ts:78) collects the child's whole stdout into an in-memory chunk list and concatenates it at lines 36 and 49, with no output-size ceiling on the collector and no `-t`, `-fs` or `-frames:a` limit on the encoder argv; `transcodeToWavBuffer` (app/lib/audio.server.ts:185) encodes with `WAV_ENCODE_ARGS` (app/lib/audio.server.ts:72: -vn -acodec pcm_s16le -ac 1 -ar 8000 -f wav), which produces 16,000 bytes of uncompressed output per second of source audio however small the uploaded file was. Nothing in the upload path bounds the source duration or the produced output, and the AbortSignal that `runAudioProcess` accepts…
- Resolution: Owner-observed, read-only, on the owner's own deployment; no customer traffic, no workspace data and no deployed endpoint is contacted by this audit. (1) Confirm from the production build log that the app image contains ffmpeg (`ffmpeg -version`), because .railway/environments/production.ts:77 selects the Nixpacks builder for the app service while the ffmpeg install lives in the Dockerfile that production.ts:100-101 wires only to the worker. (2) Read the container memory allocation for the `callcaster` service (one replica, .railway/environments/production.ts:80) from the Railway dashboard, so the resident-buffer blast radius has a denominator. (3) Transcode one 60-minute silent source once…
- Look in: `app/lib/audio.server.ts`, `app/lib/audio-process.server.ts`, `app/routes/workspaces+/$id/audios/record.action.server.ts`, `server/bun.ts`, `app/lib/api-write-rate-limit.server.ts`, `app/lib/platform-media.server.ts`, `.railway/environments/production.ts`, `app/routes/api+/workspaces+/$workspaceId/audios.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2907](https://github.com/chester-hill-solutions/callcaster/issues/2907) Caller-supplied webhook custom headers are forwarded unfiltered, so the outbound request's Host can be decoupled from the validated destination
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The webhook custom-header map is copied verbatim from the request body and spread over the outbound request headers, with no allowlist, denylist, case normalisation or length limit on header names
- Current behavior: The webhook custom-header map is copied verbatim from the request body and spread over the outbound request headers, with no allowlist, denylist, case normalisation or length limit on header names. safeOutboundFetch hands the map unchanged to http.request/https.request, so a caller-supplied Host key replaces the URL host in the emitted request while the socket stays pinned to the DNS-validated address, and a caller-supplied Transfer-Encoding key produces a request that carries both Transfer-Encoding: chunked and the runtime's Content-Length over a body that is not chunk-framed. I reproduced this independently in the approved sandbox with the production runtime (bun 1.3.14), driving the real…
- Root cause: app/lib/platform-members.server.ts:240-252 normalizeCustomHeaders copies every caller-supplied [key, value] pair into a Record with no header-name constraint, and app/lib/schemas/api/platform-workspace-admin.ts:63-82 accepts any record of string to string (or an array of string tuples) for custom_headers. app/lib/workspace-webhooks.server.ts:59-69 and app/lib/webhook-test-delivery.server.ts:14-31 spread that map after the 'Content-Type: application/json' default and pass it to safeOutboundFetch, which forwards init.headers unchanged as the `headers` option of the request (app/lib/safe-outbound-url.server.ts:267). No layer inspects the header names between the request body and the socket.
- Resolution: Owner-observed configuration review only - no request is made to any live or third-party system. (1) From the deployment configuration, record the egress source addresses of the callcaster app and callcaster-worker processes, and whether the platform is registered with, or allowlisted by, any destination that fronts more than one virtual host from one public address. (2) For each such front-end, ask its owner - do not probe it - whether an access rule is keyed to the source address of the platform and whether that rule applies to virtual hosts other than the one named in destination_url. (3) For each candidate front-end/origin pair, obtain the owner-documented framing behaviour,…
- Look in: `app/lib/platform-members.server.ts`, `app/lib/schemas/api/platform-workspace-admin.ts`, `app/lib/workspace-webhooks.server.ts`, `app/lib/webhook-test-delivery.server.ts`, `app/lib/safe-outbound-url.server.ts`, `docs/remediation/critical-review-orchestration-plan-2026-07-12.md`, `app/routes/api+/workspaces+/$workspaceId/webhook.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2906](https://github.com/chester-hill-solutions/callcaster/issues/2906) Outbound webhook guard accepts IETF special-purpose address ranges, including 100.100.100.200 (Alibaba Cloud instance metadata)
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The SSRF guard that every user-configured outbound webhook passes through classifies any parseable address it does not explicitly list as a public destination
- Current behavior: The SSRF guard that every user-configured outbound webhook passes through classifies any parseable address it does not explicitly list as a public destination. Its IPv4 list (app/lib/safe-outbound-url.server.ts:49-62) covers 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12 and 192.168.0.0/16 and nothing else. RFC 6598 shared address space (100.64.0.0/10), RFC 2544 benchmarking (198.18.0.0/15), RFC 6890 protocol assignments (192.0.0.0/24), multicast (224.0.0.0/4), reserved (240.0.0.0/4) and the broadcast address are therefore accepted as webhook destinations, and 100.64.0.0/10 contains 100.100.100.200, the Alibaba Cloud instance-metadata endpoint that returns workload…
- Root cause: app/lib/safe-outbound-url.server.ts:49-62 isPrivateIpv4 enumerates only six IPv4 prefixes (0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16) and returns false for every other parseable address. app/lib/safe-outbound-url.server.ts:99-109 isPrivateOrMetadataIp special-cases 169.254.169.254, unwraps IPv4-mapped IPv6 and then defers to isPrivateIpv4/isPrivateIpv6, failing closed only for unparseable addresses, so every other special-purpose address inherits the 'public' verdict. app/lib/safe-outbound-url.server.ts:85-97 isPrivateIpv6 rejects only ::1, ::, fc00::/7 and fe80::/10, so fec0::/10, 64:ff9b::/96 and 2002::/16 are classified public. Both resolveSafeOutboundTarget (lines 146-151 for…
- Resolution: Owner-observed, read-only check inside a production container, without contacting any endpoint and without sending traffic to any candidate address: (a) record the cloud provider and region the workload runs in, and the private-network peer addressing Railway assigns to the app, the worker and the PostgreSQL service; (b) read the workload's route table (ip route / route -n) and the platform's own instance-metadata configuration (the address that cloud provider documents for that workload) and write both down; (c) compare those two lists against the omitted ranges - 100.64.0.0/10, 198.18.0.0/15, 192.0.0.0/24, 224.0.0.0/4, 240.0.0.0/4, 255.255.255.255 and, for IPv6, fec0::/10, 64:ff9b::/96,…
- Look in: `app/lib/safe-outbound-url.server.ts`, `app/lib/webhook-test-delivery.server.ts`, `app/lib/schemas/api/platform-workspace-admin.ts`, `.railway/environments/dev.ts`, `app/routes/api+/workspaces+/$workspaceId/webhook.action.server.ts`, `app/lib/platform-members.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2905](https://github.com/chester-hill-solutions/callcaster/issues/2905) Outbound voicemail, ops-alert and Twilio-compliance email bodies interpolate caller- and provider-originated text into HTML without escapeHtml
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Three outbound email builders build their HTML body by raw template-literal interpolation, without the HTML-escaping helper the repository already owns (app/lib/email-html.ts#escapeHtml), while the same codebase applies that helper in the…
- Current behavior: Three outbound email builders build their HTML body by raw template-literal interpolation, without the HTML-escaping helper the repository already owns (app/lib/email-html.ts#escapeHtml), while the same codebase applies that helper in the sibling builders (app/lib/low-credit-notify.server.ts:50, app/lib/billing-reconciliation-alert.server.ts:40, app/lib/number-rental-billing.server.ts:124 and :330). The omission is real and I reproduced it independently in the approved sandbox: calling the PRODUCTION builders with only the provider boundaries stubbed and parsing the resulting html field with parse5, the payload <a href="https://attacker.invalid/verify-callcaster">Verify your CallCaster…
- Root cause: The three ops-email HTML bodies are built with template-literal interpolation of values that are not passed through escapeHtml (app/lib/email-html.ts), so caller- or provider-originated text is inserted into the HTML body (and, for the voicemail subject, into the subject line) as markup instead of as text. The same codebase applies escapeHtml to the equivalent interpolations in app/lib/low-credit-notify.server.ts:50, app/lib/billing-reconciliation-alert.server.ts:40 and app/lib/number-rental-billing.server.ts:124 and :330, so the omission is inconsistent rather than a deliberate design. Verified: none of app/lib/inbound-voicemail-email.server.ts, app/lib/ops-alert.server.ts or…
- Resolution: Owner-observed checks, non-production tenant only, with no mail sent to any uninvolved recipient. (a) Sink 1: on a non-production tenant whose voicemail notification address is a mailbox the owner controls, place a real inbound call from a carrier or VoIP provider that permits a non-numeric or alphanumeric caller id, and record byte-for-byte what Twilio delivers in the From parameter of the inbound-call webhook (app/routes/api+/inbound.action.server.ts:163) together with the value stored in call.from. If From is always E.164, sink 1 collapses to tenant self-injection only and the candidate must be re-scoped to the provider-echo sinks with severity reassessed. (b) Sink 3: on the same…
- Look in: `app/lib/email-html.ts`, `app/lib/inbound-voicemail-email.server.ts`, `app/lib/ops-alert.server.ts`, `app/lib/twilio-compliance-notify.server.ts`, `app/lib/env.server.ts`, `app/routes/api+/email-vm.action.server.ts`, `app/routes/api+/inbound.action.server.ts`, `app/lib/twilio-webhook.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#1718](https://github.com/chester-hill-solutions/callcaster/issues/1718) contact has opted out message should be dynamic
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-10-19
- Screenshot only, no repro or expected copy; generic opt-out banner is intentional per #1333 evidence. Needs the specific scenario before coding.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2330](https://github.com/chester-hill-solutions/callcaster/issues/2330) Use verified client identity for public rate limits
- Verdict: **Needs reproduction** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-06
- The current rate key uses leftmost X-Forwarded-For. Actual ingress and spoof resistance must be verified before changing the trusted identity boundary.
- Current behavior: clientRateLimitKey still reads the leftmost forwarded address and falls back to unknown. Official Railway employee guidance states its HTTP proxy sets and overwrites X-Real-IP and prevents direct access through that arrangement; stable peer CIDRs are not published. This is provider guidance, not proof of the actual CallCaster ingress. An additional proxy, direct/local request identity and forged-header controls remain unverified.
- Root cause: The rate-limit helper receives a Request without a verified transport identity and trusts forwarded input without an established CallCaster proxy boundary.
- Resolution: Inspect the real CallCaster public ingress and direct/local server arrangement. Prove overwrite or append behavior using actual forged-header and valid-client controls, then implement the verified transport rule. Preserve PostgreSQL windows and authenticated-user limits. Do not infer trust from X-Railway-Edge or an undocumented private CIDR.
- Look in: `app/lib/platform-rate-limit.server.ts`, `app/lib/platform-auth-rate-limit.server.ts`, `server/bun.ts`, `.railway/`
- Existing tests: test/platform-api.test.ts; test/auth-catch-all-rate-limit.route.test.ts
- Missing tests: Actual transport/proxy arrangement with client-supplied X-Forwarded-For/X-Real-IP, valid clients, IPv4/IPv6, missing/malformed headers and stable local peer identity.
- Done when: Derive public auth rate-limit identity from a verified transport/proxy boundary. A client cannot obtain a fresh bucket by varying the leftmost X-Forwarded-For or any other untrusted identity header.; Document the actual public ingress and trusted-hop rule, including direct/local requests and additional proxies where present.; Keep a real permitted-client control, IPv4/IPv6 controls and missing/malformed-header controls. Headerless local requests must not all share one unknown identity, and a fresh random key per request is not an acceptable fallback.; Test the actual production request arrangement, not only Request fixtures that set the supposed trusted header. Record what overwrites or appends each address field.; Preserve the existing distributed PostgreSQL window contract and authenticated user-based write limits.; Full npm run ci:local and final remote gates pass; deployed forged-header controls prove the rule before release promotion.
- Tracker: Unassigned native child of #2099. Required CallCaster ingress proof remains; primary provider guidance was added to the issue without claiming acceptance.

### [#1670](https://github.com/chester-hill-solutions/callcaster/issues/1670) phone number search is too strict
- Verdict: **Needs reproduction** · Labels: ux · Assignee: none · Updated: 2026-09-23
- Searching Pickering does not find South Pickering. PR #1675 changed rate-centre display names; it did not prove search matching.
- Resolution: Compare the submitted locality with provider results and determine whether the provider supports partial matching before changing the search contract.
- Look in: `app/components/phone-numbers/NumberPurchase.tsx`, `app/lib/number-locality.ts`

---

## Needs decision — 42

Product, security, or operations decision required before implementation can be scoped.

### [#1815](https://github.com/chester-hill-solutions/callcaster/issues/1815) Implement TWO_FACTOR_ENABLED kill-switch state per environment
- Verdict: **Needs decision** · Size: XS · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-24
- Recommended title: **Decide TWO_FACTOR_ENABLED kill-switch state per environment**
- Screenshot-only report from Sai. Env check resolves it: MFA is off BECAUSE TWO_FACTOR_ENABLED is unset on the review (dev) env AND on production app services (Railway list-variables; only DISABLE_2FA_ENFORCEMENT + NODE_ENV present on review, and neither 2FA var on production). isTwoFactorFeatureEnabled() (env.server.ts:270) is false unless TWO_FACTOR_ENABLED=true|1 — the #1569 kill-switch default.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The code half shipped: commit 27277319 (feat(auth): turn two-factor authentication off behind a TWO_FACTOR_ENABLED kill switch (#1569)) registers the Better Auth twoFactor plugin only when the flag is true, and every privileged-role mandate is off with it. test/two-factor-kill-switch.route.test.ts, test/two-factor.server.test.ts and test/auth-instance.server.test.ts cover it. What is missing is the state, not the code: .env.example:159 still has TWO_FACTOR_ENABLED commented out, no Railway environment model sets it, and no ADR records whether 2FA is meant to be off.
- Root cause: None — MFA is off by the intended kill-switch default because the optional env flag is unset everywhere.
- Resolution: Decide and record the per-environment state, then set the flag to match. The code is done and tested, so this is a decision plus configuration, not an implementation. A short ADR next to the existing ones is the right record, because the current position - 2FA off everywhere by default - is only correct if it is intended.
- Look in: `app/lib/env.server.ts:262-271 (isTwoFactorFeatureEnabled)`, `app/server/auth-instance.ts:59-67 (the plugin is registered only when the flag is on)`, `.env.example:159 (the flag, still commented out)`, `test/two-factor-kill-switch.route.test.ts (the kill switch is tested)`
- Existing tests: test/two-factor-kill-switch.route.test.ts; test/two-factor.server.test.ts
- Done when: Decide whether 2FA should be on; If on, set TWO_FACTOR_ENABLED and verify the plugin registers
- Tracker: Keeps blocking #1316 until the state is decided.

### [#2216](https://github.com/chester-hill-solutions/callcaster/issues/2216) Email verification is half-wired: a verify-email route and a "verify your email" prompt both exist, but no verification email is ever sent
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-24
- Email verification remains half-wired: auth has reset email callback but no verification callback/requirement; register fallback claims verification and a verify handler survives. The live issue explicitly leaves mandatory verification versus removal undecided.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. Still half-wired. There is no sendVerificationEmail and no requireEmailVerification anywhere in app/. The signup response still says 'Verify your email before signing in' and the error map still maps EMAIL_NOT_VERIFIED to 403, so the promise is made and nothing delivers it. app/routes/api+/auth/verify-email.action.server.ts still exists with its rate limit and writes nothing, and auth_user.email_verified is never set by app code. No test registers a user and asserts either outcome.
- Root cause: Auth configuration enables password signup and reset delivery but has no email-verification delivery or enforcement configuration. Verification handlers and a verification message remain without a configured issuance flow. Source does not establish that the feature was deliberately removed.
- Resolution: Decide between sending the email and removing the prompt, or making verification mandatory and wiring the send. The half-wired state is the worst of the three: a user is told to verify an email that will never arrive. Whichever way it goes, the verify-email route, the signup message, the EMAIL_NOT_VERIFIED error and the emailVerified column all have to move together, and a test has to register a user and assert the outcome.
- Look in: `app/server/auth-instance.ts:21-31 (emailAndPassword, no verification callback)`, `app/lib/platform-auth.server.ts:208-217 (the signup message that lies)`, `app/lib/platform-auth.server.ts:112 (the EMAIL_NOT_VERIFIED error map)`, `app/routes/api+/auth/verify-email.action.server.ts (the dead route, still rate limited)`, `app/db/auth-schema.ts:16 (emailVerified, never written by app code)`
- Missing tests: No test exercises real registration to assert verification issuance and session policy. Account-address occupancy is established; automatic account takeover by the first registrant is not, since reset goes to the actual mailbox owner.
- Done when: A test registers a user and asserts one of the two outcomes, so the half-wired state cannot return; No user-visible string references verification unless verification happens; The dead route and its rate limit are either live or removed; A test covers the chosen path end to end
- Tracker: Needs decision. The issue explicitly requires Option A/B product policy and states funnel cost is unknown; do not select cheaper removal as a bug fix. Then implement/test the chosen policy. Related PR evidence: #2223, #2222. A PR reference alone does not prove deployed behavior.

### [#2922](https://github.com/chester-hill-solutions/callcaster/issues/2922) Twilio webhook boundary verifies requests that name no tenant with the platform main-account auth token, so platform-signed callbacks reach routes that are not…
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- requireTwilioSignature has two credential paths
- Current behavior: requireTwilioSignature has two credential paths. When the caller supplies a workspace option (workspaceId, callSid, messageSid, phoneNumber), the request is verified against that tenant's own subaccount auth token and fails closed if the tenant cannot be resolved (app/lib/twilio-webhook.server.ts:217-266). When the caller supplies no workspace option, the request is verified against the platform main-account token env.TWILIO_AUTH_TOKEN() (app/lib/twilio-webhook.server.ts:251-253) and no tenant resolver runs at all. The Bun pre-handler decides which path a request takes from the request body alone: server/twilio-webhook.ts:26-52 produces a workspace option only when the body carries…
- Root cause: The webhook boundary selects between two credential worlds from the request body alone. When a workspace option is supplied, the request is verified against that tenant's subaccount token and fails closed if the tenant cannot be resolved (app/lib/twilio-webhook.server.ts:217-266). When no workspace option is supplied, which the Bun pre-handler decides purely from the body (server/twilio-webhook.ts:26-52, line 51), the request is verified against the platform main-account token env.TWILIO_AUTH_TOKEN() (app/lib/twilio-webhook.server.ts:251-253) with no tenant resolver consulted. Routes that always take that second path (/api/inbound-verification, and /api/call when the body omits…
- Resolution: Owner-observed checks only, no probing of a live target: (1) query the production database for workspace rows whose twilio_data->>'sid' equals the platform TWILIO_SID and count them; (2) in the Twilio console, list every phone number and TwiML App whose voice URL or status callback points at a tenant-less webhook path and record the owning account of each; (3) place one ordinary call from a second number to the active verification number and record the From value Twilio delivers to /api/inbound-verification, comparing it with the app logs; (4) count twilio.webhook.auth_failed events with reason missing_credentials and attemptedWorkspace=false in the app logs to size the population of…
- Look in: `app/lib/twilio-webhook.server.ts`, `server/twilio-webhook.ts`, `app/routes/api+/inbound-verification.action.server.ts`, `app/routes/api+/call.action.server.ts`, `app/lib/merge-workspace-twilio-data.server.ts`, `docs/adr/0038-verification-numbers-are-platform-data.md`, `app/routes/api+/verify-call-in-session.loader.server.ts`, `app/lib/database/workspace-twilio-subaccount.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2920](https://github.com/chester-hill-solutions/callcaster/issues/2920) Stripe webhook credits the tenant and the credit amount named in the event's session metadata, with no check against the money the session actually collected
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The only authentication on POST /api/stripe-webhook is the Stripe signature over the raw body (app/routes/api+/stripe-webhook.action.server.ts:42)
- Current behavior: The only authentication on POST /api/stripe-webhook is the Stripe signature over the raw body (app/routes/api+/stripe-webhook.action.server.ts:42). That check proves the bytes were signed by the holder of STRIPE_WEBHOOK_SECRET and says nothing about which Checkout Session the event describes, who paid, or how much was collected; it does hold, and a body mutated after signing is rejected with 400. The grant then takes the credited tenant from session.metadata.workspaceId (line 59) and the credited amount from Number(session.metadata.creditAmount) (line 60), and never compares the amount with session.amount_total or session.currency (session.amount_total occurs nowhere in app/, shared/,…
- Root cause: The webhook treats the event payload's session metadata as the source of truth for both the tenant that is credited and the number of credits granted, instead of resolving the event against a server-side record of the purchase it created (or at minimum validating the granted amount against session.amount_total / session.currency and the customer against workspace.stripe_id). Because the ledger's idempotency key stripe_session:<sessionId> is only unique within (workspace, type), a metadata-derived grant is also scoped per tenant, so one session yields one grant per tenant rather than one grant overall.
- Resolution: Owner-observed, no probing of the live target: in the Stripe Dashboard for the platform account, list every Webhook endpoint and its signing secret and confirm that STRIPE_WEBHOOK_SECRET for /api/stripe-webhook is used by that endpoint alone; list every source of Checkout Sessions in the account - this app, any other CHS product, Payment Links, Dashboard-created sessions - and confirm that none can set metadata.workspaceId / metadata.creditAmount or update the metadata of a completed cs_* session; record which Stripe account each environment (dev, qa, prod) points at and whether the signing secret is shared between them; and check the Stripe event log for whether one cs_* session can ever…
- Look in: `app/routes/api+/stripe-webhook.action.server.ts`, `app/lib/platform-billing.server.ts`, `shared/pricing.ts`, `drizzle/0000_baseline.sql`, `client/migrations/20260711000000_money_columns_integer_and_ledger_hardening.sql`, `docs/stripe-webhook.md`, `agents/v04-stripe-metadata-grant/artifacts/evidence.json`, `app/lib/transaction-history.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2919](https://github.com/chester-hill-solutions/callcaster/issues/2919) Boot-time secret validation is presence-only, so a deployment configured from .env.example runs on the repository's published dev secret literals
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The repository publishes three secret literals in .env.example: BETTER_AUTH_SECRET=dev-better-auth-secret-change-me (line 41), CRON_SECRET=dev-cron-secret-change-me (line 151) and MEDIA_STREAM_SECRET=dev-media-stream-secret-change-me (line…
- Current behavior: The repository publishes three secret literals in .env.example: BETTER_AUTH_SECRET=dev-better-auth-secret-change-me (line 41), CRON_SECRET=dev-cron-secret-change-me (line 151) and MEDIA_STREAM_SECRET=dev-media-stream-secret-change-me (line 169). Neither production configuration control rejects them. validateRequiredEnv (app/lib/required-env-keys.mjs:55) computes missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]) - presence only - so the published BETTER_AUTH_SECRET literal passes the boot gate that server/bun.ts:51 depends on (reproduced: accepted under NODE_ENV=production; only an absent key is rejected). env.MEDIA_STREAM_SECRET (app/lib/env.server.ts:218-229) refuses only the unset…
- Root cause: app/lib/required-env-keys.mjs#validateRequiredEnv (line 55) checks only that the required secret variables are present and non-empty, and app/lib/env.server.ts#MEDIA_STREAM_SECRET (lines 218-229) refuses only the unset case, so neither control rejects the dev/example secret literals that the repository itself publishes in .env.example. The production refusal of the dev fallback secret is value-blind: it fires when MEDIA_STREAM_SECRET is absent, and stays silent when MEDIA_STREAM_SECRET is set to the very literal the code treats as the dev fallback secret.
- Resolution: Owner-observed check of the production Railway environment, comparing values in place without printing or transmitting them. For the 'callcaster' application service: confirm BETTER_AUTH_SECRET differs from 'dev-better-auth-secret-change-me' and CRON_SECRET differs from 'dev-cron-secret-change-me'. For the media-stream service: confirm MEDIA_STREAM_SECRET is set and differs from 'dev-media-stream-secret-change-me', and confirm NODE_ENV is 'production' - if NODE_ENV is not 'production' and MEDIA_STREAM_SECRET is unset, app/lib/env.server.ts:228 returns the published literal and the service keys tokens with the published value; a configured MEDIA_STREAM_SECRET is returned unchanged…
- Look in: `.env.example`, `app/lib/required-env-keys.mjs`, `server/bun.ts`, `app/lib/env.server.ts`, `app/lib/media-stream-token.server.ts`, `services/media-stream/index.ts`, `services/media-stream/workspace-config.ts`, `services/media-stream/db-writer.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2918](https://github.com/chester-hill-solutions/callcaster/issues/2918) The media-stream process - token-authorized, unscoped writes and credit debits - has no infrastructure-as-code definition, and its only deploy runbook…
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Confirmed from source: the repository declares three deployable processes (docs/adr/0030-media-stream-bun-service-third-railway-process.md:3, CONTEXT.md:158, docs/media-stream-ops.md:3) and models two
- Current behavior: Confirmed from source: the repository declares three deployable processes (docs/adr/0030-media-stream-bun-service-third-railway-process.md:3, CONTEXT.md:158, docs/media-stream-ops.md:3) and models two. A read-only sandbox scan of the whole .railway/ tree found zero references to media-stream, MEDIA_STREAM_SECRET or MEDIA_STREAM_HOST; .railway/environments/production.ts:108, qa.ts:104 and dev.ts:118 return only the app, the worker, the database, the volume and the bucket, and .railway/config/shared.ts:10 emits preserve() only for the listed names, so MEDIA_STREAM_SECRET and MEDIA_STREAM_HOST sit outside every preservation list - including the app's, even though the app itself signs the…
- Root cause: The repository models only two of its three declared processes in .railway/environments/*.ts, so nothing about the media-stream service - its image, runtime configuration, secret provisioning, or even its existence - is covered by a plan, a preservation list or a review, and the only runbook that governs it (docs/media-stream-ops.md) still describes the service as having no database writes and no credit debits and as sharing one image with the worker. The half-applied 2026-08-03 remediation is the proximate origin: the image fix landed, the runbook correction and the IaC modelling did not.
- Resolution: Read-only and non-destructive, per environment, using the procedure in .agents/skills/railway-iac/SKILL.md. For each of dev, qa and production separately: (1) `railway status --project --environment <env>` and `railway service list --json` to enumerate the environment's services and check whether a media-stream service exists, and if so its build method (Dockerfile path or start command), source branch, and public domain; (2) `railway variable list --service <id> --environment <env> --json` for the app, the worker and any media-stream service, inspecting variable NAMES only - never `--show-values`, `--decrypt-variables`, or `config apply` - and record whether MEDIA_STREAM_SECRET and…
- Look in: `.railway/environments/production.ts`, `.railway/config/shared.ts`, `services/media-stream/index.ts`, `services/media-stream/db-writer.ts`, `services/media-stream/coaching-billing.ts`, `docs/media-stream-ops.md`, `Dockerfile.worker`, `Dockerfile`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2916](https://github.com/chester-hill-solutions/callcaster/issues/2916) Pull-request-controlled npm install lifecycle scripts run in CI jobs whose environment already exports repository and environment secrets
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Every pull-request-reachable dependency install in this repository runs `npm ci` against the pull request's own checkout, and npm executes the root package's install lifecycle scripts from that pull-request-controlled package.json while…
- Current behavior: Every pull-request-reachable dependency install in this repository runs `npm ci` against the pull request's own checkout, and npm executes the root package's install lifecycle scripts from that pull-request-controlled package.json while the install step's environment already holds secrets. In ci.yml the install step exports `NODE_AUTH_TOKEN: ${{ secrets.NODE_AUTH_TOKEN || github.token }}` (the same step shape at lines 78/92/110/127/144/193/214, secret at 80/94/112/129/146/195/216); e2e.yml:76/79 and schema-default-drift.yml:54/56 repeat the pattern; and in railway-iac.yml the same secret is exported on the install step (lines 49, 89, 128) while `RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}`…
- Root cause: The dependency-install step trusts the manifest it is handed: `npm ci` reads the pull-request-controlled root package.json and executes its install lifecycle hooks, while the workflow places secrets in the environment of that same step - step-scoped `NODE_AUTH_TOKEN` for the install step, and job-scoped `RAILWAY_TOKEN` in railway-iac.yml, inherited by every step of the job. The repository's own images show the opposite containment: Dockerfile:9-11 and Dockerfile.worker:6-8 copy only `package.json`, `bun.lock` and `vendor/` before installing, so the checked-in `prepare` hook is an inert no-op there (`test -f scripts/setup-githooks.sh` fails and the `|| true` swallows it) and CI is the only…
- Resolution: Owner-observed, non-destructive, no probing of a live target: (1) read Settings > Actions > General > Workflow permissions for the repository and the organization default, and note whether 'Send write tokens to workflows from pull requests' and 'Require approval for all outside collaborators' are enabled; (2) read the protection rules of the dev, qa and production GitHub environments (required reviewers, deployment branch rules, wait timer) and note whether the dev and qa jobs can start unattended; (3) list the repository's collaborators and their permissions to establish who can push a branch, and therefore open a secret-bearing pull request, and whether any of them is a lower-trust…
- Look in: `.github/workflows/ci.yml`, `.github/workflows/railway-iac.yml`, `.railway/README.md`, `.github/workflows/e2e.yml`, `.github/workflows/schema-default-drift.yml`, `package.json`, `package-lock.json`, `.npmrc`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2913](https://github.com/chester-hill-solutions/callcaster/issues/2913) Ownership transfer's MFA precondition is a stored-column check that is not bound to the platform's 2FA enforcement kill switch, so it disagrees with the…
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- Workspace ownership transfer is the platform's trust-root operation: it is the only path that can grant the highest workspace role, and it is documented as requiring an MFA-enrolled incoming owner (openapi/public-api.json:10634, generated…
- Current behavior: Workspace ownership transfer is the platform's trust-root operation: it is the only path that can grant the highest workspace role, and it is documented as requiring an MFA-enrolled incoming owner (openapi/public-api.json:10634, generated from app/lib/openapi-platform.ts:643: 'The incoming owner must have MFA enrolled (SEC-08)'; docs/api-workspace-admin.md:17-24 'Ownership transfer'). Both reachable writers of that precondition - the route-level product function (app/lib/platform-workspace.server.ts:180) and the canonical writer (app/lib/workspace-members-db.server.ts:200), which the settings-form path also reaches (app/lib/workspace-settings/WorkspaceSettingUtils.server.ts:138) - implement…
- Root cause: The transfer's assurance gate calls isTwoFactorEnabled(userId) (app/lib/two-factor.server.ts:135) - a read of the stored auth_user.two_factor_enabled column - instead of the platform's enforcement kill switch isTwoFactorEnforcementDisabled() (app/lib/two-factor.server.ts:55) that every sibling privileged-role gate honours, so the precondition is satisfied by a leftover column value regardless of whether a second factor is registered, prompted or enforced on that user's sessions.
- Resolution: Owner-observed, read-only inspection only - no probing of any live endpoint: (1) 'railway variables --service <production web service>' to record whether TWO_FACTOR_ENABLED and DISABLE_2FA_ENFORCEMENT are set; this is the decisive fact, because with TWO_FACTOR_ENABLED=true|1 the transfer gate tracks live enrollment and the candidate does not apply. (2) 'select count(*) from auth_user where two_factor_enabled' on the production database to size the leftover-row population the stale-column gate would admit. (3) 'select id, email from auth_user where two_factor_enabled' to identify which accounts could be promoted to owner on a leftover row. (4) 'select count(*) from workspace_member wm left…
- Look in: `app/lib/workspace-members-db.server.ts`, `app/lib/platform-workspace.server.ts`, `app/lib/two-factor.server.ts`, `app/lib/platform-members.server.ts`, `app/server/auth-instance.ts`, `docs/release-test-guide-2026-09-07.md`, `docs/CHANGELOG.md`, `app/lib/env.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2912](https://github.com/chester-hill-solutions/callcaster/issues/2912) The JSON admin plane (/api/admin/*) applies no two-factor enrolment mandate to sudo operators, while the HTML admin panel does
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The HTML admin panel and the JSON admin plane apply different authentication bars to the same sudo operator
- Current behavior: The HTML admin panel and the JSON admin plane apply different authentication bars to the same sudo operator. The HTML panel (app/lib/admin-middleware.server.ts) requires two things: public.user.access_level === 'sudo' (line 25) and TOTP enrolment (requireTwoFactorEnrollmentForPrivilegedUser with isPrivileged: true, line 34). The JSON admin plane under app/routes/api+/admin+/ requires only the first: requireSudo (app/lib/api-auth.server.ts:201-220) checks access_level and returns the operator. It never reads auth_user.two_factor_enabled, it imports nothing from app/lib/two-factor.server, and it never calls blockUnenrolledPrivilegedSessionUser, the JSON guard the workspace data plane uses for…
- Root cause: requireSudo was written as a standalone JSON guard and never adopted blockUnenrolledPrivilegedSessionUser, the helper the data-plane middleware uses for the same privileged-session check (app/lib/data-plane-middleware.server.ts:27). The JSON admin plane sits outside the data-plane middleware tree (app/routes/api+/admin+/ exports no middleware), so the helper is never reached on that path.
- Resolution: Owner runs the read-only Railway listing for the CallCaster app service in the production environment (railway variables --service <app service> --environment production) and records whether TWO_FACTOR_ENABLED is present and set to 'true' or '1'; repeat for the review environment. If it is unset (the state recorded on 19 October 2026), requireSudo must still gain the enrolment gate before the flag is switched on, and the enable/disable decision itself should be closed under issue #1815 with the per-environment state written down in an ADR. If it is set, the JSON-plane gap is live now and requireSudo must gain the enrolment gate before the next deploy. The check is read-only: do not set,…
- Look in: `app/lib/admin-middleware.server.ts`, `app/lib/api-auth.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/two-factor.server.ts`, `app/lib/env.server.ts`, `ISSUE_BOARD.md`, `app/routes/api+/admin+/users+/$userId.action.server.ts`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2911](https://github.com/chester-hill-solutions/callcaster/issues/2911) GET /confirm-payment credits the tenant named by the Stripe session metadata, with no binding to the calling principal's workspace
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- GET /confirm-payment?session_id=<id> is the browser-facing credit-grant path
- Current behavior: GET /confirm-payment?session_id=<id> is the browser-facing credit-grant path. The route takes the Checkout Session id from the query string, requires only that some session exists (verifyAuth inside the handler: no workspace, no role), and then confirmStripeCheckoutSessionForRedirect retrieves that Checkout Session and credits the workspace named in the session's metadata, for the number of credits named in the same metadata. Nothing on this path compares the session's tenant with a workspace the calling principal belongs to, and nothing validates the metadata amount the way the two sibling grant paths do. pollBillingCheckoutSession compares session.metadata.workspaceId with the caller's…
- Root cause: The browser-facing credit-grant path treats the Stripe Checkout Session's metadata as the authority for both the target tenant and the credited amount, and applies neither of the two controls its sibling grant paths apply: no binding between the session's tenant and the requesting principal's workspace, and no finite-positive validation of the amount. The unscoped db client is a code-hygiene difference, not the missing control: createTenantDb(workspaceId).execute delegates to the raw client (app/server/tenant-db.ts:227), so the webhook path's tenant-scoped client passes the same metadata tenant to the RPC. The credits delta is whatever p_amount the metadata carried, applied by the RPC to…
- Resolution: Owner-observed checks only, no probing of a live target: (a) in the Stripe Dashboard for the platform account, list every Checkout Session and confirm that each one carries metadata.workspaceId equal to the tenant that created it and a creditAmount equal to the priced amount, and confirm that no Payment Link, Dashboard-created session, other CHS product, other CallCaster environment or stripe listen forwarder writes sessions to the same account; (b) confirm that no cs_... id belonging to one tenant is reachable by another tenant through transaction_history.idempotency_key, the ledger note, the workspace_events SSE payload, the admin Credits tab, the success_url or application logs; (c)…
- Look in: `app/lib/platform-billing.server.ts`, `app/routes/api+/stripe-webhook.action.server.ts`, `app/routes/confirm-payment.loader.server.ts`, `app/server/tenant-db.ts`, `shared/billing-keys.ts`, `app/lib/auth.server.ts`, `client/migrations/20260711000000_money_columns_integer_and_ledger_hardening.sql`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#2903](https://github.com/chester-hill-solutions/callcaster/issues/2903) Two-factor authentication is opt-in and unset in every maintained deployment model: without TWO_FACTOR_ENABLED the Better Auth twoFactor plugin is never…
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-22
- The two-factor control is opt-in, and the maintained deployment models leave it unset, so a deployment that never sets the flag runs with no second factor
- Current behavior: The two-factor control is opt-in, and the maintained deployment models leave it unset, so a deployment that never sets the flag runs with no second factor. (1) The feature switch is opt-in: isTwoFactorFeatureEnabled (app/lib/env.server.ts:268-271) returns true only for the exact strings 'true' or '1'. Reproduced locally under NODE_ENV=production: unset -> false; '1' and 'true' -> true; '0', 'false' and 'yes' -> false. (2) The Better Auth plugin follows the flag: auth-instance.ts:61-67 registers the twoFactor plugin only when the flag is on. Reproduced locally by instantiating the repository's own Better Auth instance: with the flag unset the instance exposes zero plugins; with…
- Root cause: app/lib/env.server.ts:268-271 enables the two-factor feature only for the exact strings 'true'/'1', so an unset TWO_FACTOR_ENABLED means the feature is off; app/server/auth-instance.ts:61-67 registers the Better Auth twoFactor plugin only when that flag is on; and app/lib/two-factor.server.ts:55-61 returns 'enforcement disabled' on the feature-off branch before the production refusal at lines 67-85 can apply. No maintained Railway environment model sets TWO_FACTOR_ENABLED (.railway/environments/production.ts:4, .railway/environments/qa.ts:15; dev sets DISABLE_2FA_ENFORCEMENT instead at .railway/environments/dev.ts:10) and .env.example:159 ships it commented out, so a deployment that never…
- Resolution: Owner-observed, read-only and non-destructive. (1) Read the live value of the flag: `railway variables --service callcaster --environment production`, and the same read for the review/dev and QA app services. An absent or unset TWO_FACTOR_ENABLED confirms the deployed default is 'no second factor' on that environment; a value of 'true' or '1' refutes the finding for that environment. This is a read only; no variable is written. (2) Confirm the effect without mutating anything: sign in with a password-only privileged account on the review environment and observe whether a TOTP prompt appears, and open Account -> Security to see whether the feature is reported as unavailable…
- Look in: `app/lib/env.server.ts`, `app/server/auth-instance.ts`, `app/lib/two-factor.server.ts`, `.railway/environments/production.ts`, `.env.example`, `app/lib/workspace-members-db.server.ts`, `test/two-factor.server.test.ts`, `agents/h18-origins-and-env/artifacts/evidence.json`
- Existing tests: The source-visible half was reproduced in an OS-enforced sandbox with no external network.
- Missing tests: Run the recorded deployment observation; the verdict depends on it, not on more code.

### [#1709](https://github.com/chester-hill-solutions/callcaster/issues/1709) Workspace Sidebar
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design, ux · Assignee: @sai-sy · Updated: 2026-10-21
- Major UX redesign of the workspace/campaign sidebar; interaction model (per-campaign sidebar with status/completion/quick controls) needs a product decision before scoping.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2036](https://github.com/chester-hill-solutions/callcaster/issues/2036) Decide the scope of flattening the call screen: the call screen only, or the shared workspace panel every page uses
- Verdict: **Needs decision** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-10-19
- The complaint is clear and both named surfaces are real, but the outer card is not owned by the call screen — it is the shared workspace panel, so 'remove the rounded edges and drop shadow' is a choice about blast radius, not a local edit. The top bar is local: app/components/call/CallScreen.Header.tsx:239 is a sticky header with rounded-xl, border, shadow-sm and a backdrop blur, and that is the campaign details/settings bar in the screenshot. The outer card is app/routes/workspaces+/$id.tsx:206, a single className string that gives every workspace page its panel: `min-w-0 flex-1 lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card/70 lg:p-6 lg:shadow-sm ...`, and the same file already branches on isChatsScreen (:204-207) so a call-screen branch is available. The issue's broader point is also a design-system one: cards are fine as containers, but their default treatment should be overridable per site.
- Current behavior: The live calling screen stacks three card treatments — the workspace panel, the sticky top bar, and inner section cards — and the invisible ones still cost padding.
- Root cause: The workspace panel treatment is a single shared className with no per-surface override, and the top bar re-states rounded/border/shadow locally. Two owners for the same visual concept, so the call screen cannot opt out.
- Resolution: Decide the scope, then it is a small edit either way. Option A (call screen only): add an isCallScreen branch next to the existing isChatsScreen branch at app/routes/workspaces+/$id.tsx:204-207 that drops rounded-2xl, border and shadow-sm and reduces p-6 for the call route, and flatten the sticky header at CallScreen.Header.tsx:239. Nothing else on the product changes; the risk is that the call screen now looks different from every page beside it. Option B (whole product): flatten the shared panel for all workspace routes, so the page is a flat canvas and cards mean something when they appear. Bigger visual diff, needs a pass over every workspace page to check what depended on the panel's padding, but it is the version that actually establishes 'a card is a deliberate container'. Option C (middle): keep the panel as-is and change the top bar only, which fixes the half the reporter named twice but leaves the outer card. Whichever is chosen, express it as a variant on the panel rather than a route-conditional className string, so the next surface can opt out without editing a ternary. Also decide the padding: the reporter asks to 'punch back' the padding the invisible cards were creating, which means auditing the space-* classes between the panel and the first inner card as part of the change, not just deleting rounded and shadow.
- Look in: `app/components/call/CallScreen.Header.tsx:239 (the sticky top bar: rounded-xl, border, shadow-sm, backdrop-blur)`, `app/routes/workspaces+/$id.tsx:202-208 (the shared workspace panel, with the isChatsScreen branch as the pattern for a call-screen branch)`, `app/components/call/CallScreen.Layout.tsx:191 (the call screen's own space-y-6, the padding the invisible cards create)`, `app/components/call/CallScreen.Coaching.tsx:53,73 and CallScreen.DTMFPhone.tsx:22 (inner cards, which the issue says to keep)`
- Existing tests: test/ui/call-screen-header.test.tsx (CampaignHeader only); test/ui/call-screen-callarea.test.tsx, call-screen-queuelist.test.tsx (inner cards)
- Missing tests: no test asserts the call screen's panel treatment, so a regression to the nested-card look passes silently; no visual or class-level test would catch a re-introduced rounded/shadow on the top bar
- Done when: The chosen scope is written down, and the panel treatment is a named variant rather than a route-conditional className string; The named surfaces (outer card, top bar) have no curved edges or drop shadow; The padding the removed cards were creating is punched back, verified by measuring the gap at the top of the call screen; Inner section cards keep their treatment — they are the containers that should still read as cards; No other workspace page changed unintentionally, or changed deliberately and listed
- Tracker: Needs decision, briefly, then fix. The implementation is an hour either way; what is unresolved is whether this is a call-screen change or a product-wide one, and picking wrong means either an inconsistent product or an unreviewable visual diff across every page. The reporter's phrasing ('the call screen has the page, an outer card, and inner cards') reads as a call-screen complaint, which points to Option A, but the outer card is shared and the reporter may not know that. Answer that one question and this becomes a fix-now.

### [#1852](https://github.com/chester-hill-solutions/callcaster/issues/1852) cleanup .env: document Twilio env vars and define config-as-code vs layered secrets
- Verdict: **Needs decision** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-10-19
- Audit and rationalize environment variables. Both TWILIO_APP_SID and TWILIO_AUTH_TOKEN in .env.example are used, but there is no documented policy for config-as-code vs secrets and no layered secret resolution.
- Current behavior: TWILIO_APP_SID is the TwiML App SID for Voice SDK outbound and is auto-assigned per non-protected environment; TWILIO_AUTH_TOKEN is used for REST calls. Some paths use TWILIO_API_KEY/TWILIO_API_SECRET. No ENVIRONMENT singleton and no .secrets/env.<environment> layering.
- Root cause: No documented owner/purpose per variable and no agreed boundary between config and secrets.
- Resolution: Decide the env schema and secret precedence (.env -> .secrets/env.<environment> -> secrets manager), document each variable's purpose and which are secrets, then prune unused/duplicated variables. Prefer an ENVIRONMENT selector over per-value env config.
- Look in: `.env.example`, `app/lib/env.server.ts`, `app/lib/required-env-keys.mjs`, `app/server/environment-twiml-app.server.ts`, `docs/twilio-runtime-inventory.md`, `docs/local-development.md`, `scripts/railway/`
- Existing tests: test/env.server.test.ts
- Missing tests: Env validation / precedence for layered secrets; A guard that fails on an undocumented or unused required key
- Done when: Every env var has a documented purpose and secret/config classification; Unused or duplicated variables removed; Secret precedence defined and easy to swap to a secrets manager; Non-sensitive config handled as config, not env values
- Tracker: Decision (secrets/config policy) before edits. Coordinate with #1329. Do not touch the user's live .env.

### [#1724](https://github.com/chester-hill-solutions/callcaster/issues/1724) What happens if we use template tags on a contact that doesn't have that piece of information?
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question · Assignee: none · Updated: 2026-10-19
- Current behavior: missing contact fields render empty string or the fallback (code answers the question). Product decides the desired UX (placeholder/flagging).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1723](https://github.com/chester-hill-solutions/callcaster/issues/1723) template tags should let you click the contact name it's rendering for and open a combo box to use someone else
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-10-19
- Feature request (template-tag → contact picker) whose scope depends on the tag UX decisions in 1724/1725; product decision first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2263](https://github.com/chester-hill-solutions/callcaster/issues/2263) Scope unknown-sender opt-out enforcement in the consent ledger rollout
- Verdict: **Needs decision** · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- Unknown-sender opt-out messages are saved, but no contact flag or app phone-level suppression protects later imports and sends.
- Current behavior: The inbound route saves the message, then updates and dequeues only matching contacts. Zero matching IDs leave no app suppression record. The original claim that the message was discarded was incorrect.
- Root cause: ADR-0034 already adopts recipient consent and fail-closed automated sends. The unknown-sender path lacks that ledger; its rollout boundary and implementation slices need definition.
- Resolution: Scope the unknown-sender path in the adopted consent ledger rollout under #1268. Define recipient key, normalization, future imports, every send entry point, atomic pending-send suppression, recipient START and the legacy migration boundary. An operator warning can expose the interim legacy gap but cannot replace ADR-0034 enforcement or satisfy completion.
- Look in: `docs/adr/0034-recipient-messaging-consent-and-fail-closed-disclosure.md`, `docs/interactive-sms-delivery-plan.md`, `app/routes/api+/inbound-sms.action.server.ts`, `app/lib/inbound-sms-context.server.ts`, `app/lib/chat-sms-guards.server.ts`, `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: Inbound tests cover known contacts; this decision has no implementation yet.
- Missing tests: After the decision: unknown-sender opt-out followed by import and manual/campaign sends, another-workspace control and explicit opt-in.
- Done when: Rollout boundary and slices follow ADR-0034 and the delivery plan.; Authoritative consent, enforcement points, atomic suppression and recipient START are defined.; Implementation and real prerequisites are split after scoping.
- Tracker: Independent follow-up from #2090. Keep visible until the adopted ledger rollout is scoped; the keyword fix does not resolve it.

### [#2029](https://github.com/chester-hill-solutions/callcaster/issues/2029) Decide the release list and the retention policy for unused dev-environment Twilio numbers
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- An operations task, not a code change, and it is waiting on two things rather than on engineering. The screenshot shows 76 numbers in the dev account at $86.20/month, plus 4 number-setups at $0. The body names the three numbers Sai uses (2608141501, a 2026 Municipal Ward 19 NES campaign, a HESC Phone Bank) and asks @wra-sol to say which workspaces Arfin wants kept; everything else is proposed for release. Two decisions are open. First, the list: Arfin's workspaces are not in the issue, so the release set is undefined. Second, and more important, there is no stated rule for what makes a dev number safe to release, and no automated check — a number that is still referenced by a workspace_number row, a campaign sender, a messaging service, a caller ID, or a verification in progress will break on release, and in a dev environment that breakage is discovered by the next person who uses it. There is a number lifecycle in the app (app/lib/number-rental-billing.server.ts handles suspension and release and notifies the workspace), but nothing there enumerates what a number is still referenced by.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The read-only tooling now exists: scripts/twilio-resource-prune-report.mjs scans the account for TwiML Apps, Messaging Services, phone numbers and subaccounts, classifies each one, and prints the accounts it found with their last activity. The keep-list scripts/twilio-resource-prune-keep-list.mjs holds the Chester Hill Solutions business line. The three numbers this issue names are NOT in that keep-list, and the keep-list is the place a decision like this belongs.
- Root cause: Dev numbers accumulate because renting is cheap and there is no reaper. The list of what is safe to release is held in people's heads and in Slack, not in the repo or the database.
- Resolution: The tooling to make the decision is in place. Two decisions remain and both are human: which of the unused dev numbers are released, and what the retention rule is. Put the survivors in scripts/twilio-resource-prune-keep-list.mjs, then release the rest. Twilio has no API delete for a subaccount, so each release is a console action; a rented phone number is released through the workspace number release path.
- Look in: `scripts/twilio-resource-prune-report.mjs (the read-only report, with the accounts section)`, `scripts/twilio-resource-prune-keep-list.mjs (where the survivors go)`, `app/lib/number-release.server.ts:152 (the number release path and its E911 blocker)`
- Missing tests: no check reports which numbers in an account are referenced by a live workspace record, which is the check that would make this repeatable; no test covers a release that is refused because a reference exists; no test asserts that a released number cannot still be selected as a campaign sender
- Done when: Arfin's keep-list is recorded in the issue, with the workspace each kept number belongs to; Every number released is confirmed to have no live workspace reference, checked by query and not by eye; The kept numbers are confirmed still working after the release run; The rule for 'in use' is written down, with the chosen option; A decision is recorded on whether the clean-up repeats on a schedule or stays a one-off
- Tracker: Needs decision, and it is a short one. The engineering is a console exercise; what is genuinely unresolved is the safety rule, and getting that wrong breaks a dev workspace in a way nobody notices until later. If the answer is 'a reference check first', that is worth filing as its own small issue, because it makes every future clean-up safe and is more valuable than this particular release.

### [#1742](https://github.com/chester-hill-solutions/callcaster/issues/1742) feature(ivr): preview Speak (TTS) steps in the script editor
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-10-17
- Spoken IVR steps have no in-editor preview; recorded steps do. Add a Preview control that plays the text in the selected Polly voice.
- Current behavior: No TTS preview endpoint; text+voice only materialise when Twilio runs the call.
- Root cause: Feature gap.
- Resolution: Add a workspace-gated route using AWS Polly SynthesizeSpeech (voices are Polly ids) + a preview control in SpokenStepFields; AWS creds need polly:SynthesizeSpeech.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/lib/tts-voices.ts`, `app/routes/workspaces+/$id/audios/$fileName.preview.loader.server.ts`
- Missing tests: preview plays selected voice text; membership enforced
- Done when: Speak step previews audibly; voice matches the block; workspace-gated
- Tracker: Confirm provider (Polly vs ElevenLabs) then implement.

### [#1729](https://github.com/chester-hill-solutions/callcaster/issues/1729) Auto selected disposition
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-10-17
- Auto-disposition mapping needs a spec (which outcome → which disposition, when overridable). Relevant machinery already exists (#1458 hold-screen, debounced auto-save).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1722](https://github.com/chester-hill-solutions/callcaster/issues/1722) What does "kick off" on campaign launch pane do
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question, business-logic · Assignee: @wra-sol · Updated: 2026-10-17
- 'Kick off' button (running/paused) has no explanation and Sai 2026-09-09 confirms confusion; product decides label/tooltip/placement.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1320](https://github.com/chester-hill-solutions/callcaster/issues/1320) ops(twilio): migrate one CHS number with callback and database reconciliation
- Verdict: **Needs decision** · Size: S-M · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-15
- Transfer a Twilio number from the old CHS workspace to the new one. This is an operational migration (Twilio-side), not a product feature; no number-transfer action exists.
- Current behavior: Settings support routing/release/purchase/caller-id only; no transfer workflow.
- Root cause: Not a product gap; one-off infra task.
- Resolution: Run a one-off runbook: confirm ownership, transfer in Twilio, insert/update destination workspace row, repoint callbacks/messaging service, verify inbound/outbound, remove old row, record rollback + evidence.
- Look in: `app/routes/workspaces+/$id/settings/numbers.action.server.ts`, `app/lib/platform-workspace-numbers.server.ts`
- Existing tests: n/a — operational
- Missing tests: before/after evidence, rollback steps
- Done when: Ownership confirmed before transfer; Voice/SMS/callbacks work in new workspace; Single owner after migration
- Tracker: Ops task with a rollback plan. The possible dependency on #1329 was dropped when #1329 closed as not planned on 2026-10-17; re-check current account ownership before the transfer.

### [#1700](https://github.com/chester-hill-solutions/callcaster/issues/1700) Why have a distinction between recording step and spoken step if you can also change "Speak text" to "play a recording"
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: @sai-sy · Updated: 2026-10-15
- Proposal to collapse Speak/recording block types into one 'Add block'. The editor already treats them as one block with a playback-mode toggle, so the change is a product/scope decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1983](https://github.com/chester-hill-solutions/callcaster/issues/1983) Receipts and charges should include tax
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-15
- Product/legal decision: receipts currently show untaxed charges. Adding tax display (and taxing charges) needs a jurisdiction/tax-configuration decision (rates, exemptions, remittance) before implementation.
- Current behavior: Billing shows amounts without tax; receipts have no tax line; ledgers store pretax totals.
- Resolution: Decide: (1) tax on CallCaster charges scope (which products, jurisdictions, rate config), (2) display-only receipts vs taxed ledger amounts. Then implement in the receipt builder + pricing path.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`, `shared/pricing.ts`
- Done when: No implementation until the tax decision is recorded

### [#2264](https://github.com/chester-hill-solutions/callcaster/issues/2264) Define operator guidance for Advanced Opt-Out
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The saved Advanced Opt-Out request is not verified provider state. Decide how operators see the request, verification limits and Console action.
- Current behavior: The saved flag defaults false. Console guidance appears only for requested true with a Messaging Service SID. Standard long-code provider opt-out exists by default, so a false local flag does not establish absent STOP protection.
- Root cause: Operator guidance for requested state versus verified provider state is undefined.
- Resolution: Choose the operator flow and any warning or justified setup blocker. Define true/false requested state, missing/present Messaging Service SID and unverified provider state. Do not label an unverified provider setting as disabled.
- Look in: `app/lib/messaging-onboarding/normalize.server.ts`, `app/lib/database/workspace-twilio-recommendations.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.OperationalGuidancePanel.tsx`
- Missing tests: After the decision: UI coverage for requested true/false, SID missing/present and unverified provider state.
- Done when: Display-state meanings and operator flow are recorded.; Guidance does not imply the saved request verifies provider settings or that standard protection needs Advanced Opt-Out.; A small implementation issue with UI coverage follows the decision.
- Tracker: Independent follow-up from #2090. Keep in Needs decision; the keyword fix does not resolve operator guidance.

### [#2194](https://github.com/chester-hill-solutions/callcaster/issues/2194) Cull 111 empty legacy-named Twilio subaccounts (Console-only; 31 must be kept)
- Verdict: **Needs decision** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- The old survey identified 111 apparent candidates and 31 live dev owners. Dev, staging and production share the account; current ownership and deletion safety have not been established.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The read-only evidence tooling exists and is now cross-environment aware: scripts/twilio-subaccount-inventory.mjs lists subaccounts, numbers and message counts, and scripts/twilio-resource-prune-policy.mjs turns 'not in this database' into UNKNOWN rather than stale, because the Twilio account is shared by every environment. What is not done: the list of 111 candidates and the 31 keepers is not checked in, and the Console cull has not happened. Twilio v5 has no remove for an account, so each deletion is a console action.
- Resolution: The evidence tooling is done. The cull itself is a Console task and needs the reconciled list: put the 31 keepers in scripts/twilio-resource-prune-keep-list.mjs so the report holds them, then delete the 111 by hand in the console. The prune report prints the owner of every subaccount, which is what tells a live dev subaccount from an orphaned one.
- Look in: `scripts/twilio-subaccount-inventory.mjs:33-38 (read-only by design; no API delete for a subaccount)`, `scripts/twilio-resource-prune-policy.mjs:227-246 (owner unknown is UNKNOWN, never stale)`, `scripts/twilio-resource-prune-keep-list.mjs (where the 31 keepers go)`
- Missing tests: Every candidate must have an evidenced absence of live ownership; no current deletion count can be inferred from the old survey.
- Tracker: Needs decision: a historical empty-resource count does not authorize shared-account deletion. Related PR evidence: #2193, #2195. A PR reference alone does not prove deployed behavior.

### [#2046](https://github.com/chester-hill-solutions/callcaster/issues/2046) Attribute inbound SMS replies to a campaign
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
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
- Verdict: **Needs decision** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
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
- Verdict: **Needs decision** · Size: M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-29
- No product analytics in the codebase. A scan of app/, shared/, services/, worker/ and server/ for PostHog, Segment, Mixpanel, Amplitude, Google Analytics, gtag and Plausible returns nothing. Sentry is wired for errors only, at 8 call sites (app/entry.server.tsx:133, app/lib/errors.server.ts:118, app/lib/ops-alert.server.ts:141, app/lib/worker/poll-jobs.server.ts:365,390, server/bun.ts:449,471,536,543,622, worker/index.ts:28). The two tables that look like usage data are not: workspace_events (app/db/schema.ts:443) is an SSE feed whose rows are deleted past a retention window by app/lib/worker/job-retention.server.ts:67-90, and workspace_audit_event (app/db/schema.ts:451) is a security log gated behind the owner-only audit.read capability.
- Current behavior: Nothing about product usage is measurable. There is no funnel across the five steps a new workspace must pass (signup, workspace creation, first rented number, first campaign, first accepted send), no cohort or retention measure, and no acquisition attribution. The build is far wider than the revealed product — 53 tables, 542 route modules, and 90 days of commits at 355 fix against 134 feat — and nothing in the code indicates which parts anyone walks. NEW_WORKSPACE_WELCOME_CREDITS = 100 (app/lib/database/workspace-provisioning.server.ts:33) is an untested guess at whether $2 of free usage is enough to convert.
- Root cause: Analytics was never treated as a product surface. The codebase has an unusually deliberate answer for most other concerns — tenancy is enforced by a scoped client, billing by one idempotent RPC, compliance by one shared predicate table — and each of those was a decision. Instrumentation was left to default, and the default was none. There is also no team-time argument that resolves it: adding a vendor is a privacy and data-sharing decision on a product that holds Canadian political contact data, and that decision has not been made rather than been deferred.
- Resolution: Answer the sink question first, deliberately. Do not start by adding a vendor. A first-party event table behind the existing tenant client is more consistent with how everything else in this codebase works, costs no third-party data-sharing decision on a product holding voter and contact data, and inherits the tenancy enforcement that already exists. A vendor is faster to stand up and is the right answer if the team wants cohorts and funnels without building them. Either is defensible; picking by default is not. THEN, in order: (1) define the activation event and measure that alone — a workspace that has completed a first accepted send is the closest thing to a north-star metric this product has; (2) instrument the five-step funnel; (3) keep the data tenant-scoped and role-gated from day one, copying the audit.log model (workspace_audit_event plus the owner-only audit.read capability in app/lib/capabilities.ts:47-78), because looser access than that would be a regression in a codebase that deliberately went the other way; (4) keep the analytics client out of the session route's hot path and off check:client-bundle's denylist, sampling if volume requires it.
- Look in: `app/db/schema.ts:443 (workspace_events — an SSE feed, not usage analytics)`, `app/db/schema.ts:451 (workspace_audit_event — a security log, the access model to copy)`, `app/lib/workspace-events.server.ts:26 (the insert path a first-party event table would mirror)`, `app/lib/capabilities.ts:47-78 (audit.read is owner-only — the model to copy)`, `app/lib/worker/job-retention.server.ts:67-90 (workspace_events rows are pruned, so it is a feed and not a record)`, `app/lib/database/workspace-provisioning.server.ts:33 (the untested welcome-credit guess)`
- Missing tests: Each of the five funnel steps emits exactly one event, asserted per step (kill-check: break one emission and confirm the test goes red); A cohort query by activation state is reproducible from the database; Analytics routes are covered by check:route-authz and gated at least as tightly as the audit log
- Done when: A written decision exists in the repo on the sink, stating why — vendor or first-party; The activation event is defined in writing and is queryable; The five funnel steps emit one event each, each asserted; Analytics data sits behind the same or tighter role gate than the audit log
- Tracker: Needs decision, not fix-now, because the first task is a product and privacy choice rather than code: whether a product holding Canadian voter and contact data may send events to a third party. That choice changes the implementation substantially, so implementing before it is made risks doing the work twice. This is the largest gap between what the code does and what the business needs, and it is the reason the other open decisions in this batch are hard to answer — several of them (welcome-credit sizing, which features to keep, whether the product is one vertical or two) are product questions that measurement would settle and that currently rest on intuition. Not a duplicate of #1185, which was a narrower credit-variance cross-reference and is closed completed.

### [#2164](https://github.com/chester-hill-solutions/callcaster/issues/2164) workspace.disabled does not block sign-in or API access, so the platform suspension lever does not suspend
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-28
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
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- A workspace `member` who clicks the gear icon on a peer sees the manage sheet with their own name in the title and the text "You do not have permission to edit this user" — for an operation the server explicitly authorises and has unit tests for. The message actively tells the user the product forbids something it allows.
- Current behavior: One side of the permission model is implemented and the other is not, and the user-visible message is on the wrong side. A test that asserts the server permits it and a UI that asserts the user cannot do it are both green, which is why this survived.
- Resolution: Decide the policy and make one side match. Given that `assertNoRoleEscalation`, `requireActorOutranksTarget` and `requireSoleOwnerProtection` already exist, the smaller fix is to **render the form**: 1. `TeamMember.tsx:139-141` → `userRole !== MemberRole.Caller && memberRole !== MemberRole.Admin` (keep the existing `memberRole === "owner"` exclusion from the sheet wrapper at `:78`). 2. Filter the `updateUser` role select by `assertNoRoleEscalation(userRole, role)` so a `member` is never offered `admin`. 3. If admin-only is the intent instead, raise the floor in `settings.action.server.ts:46` to `MemberRole.Admin` and add a member-floor test asserting 403. 4. **Either way, add the e2e assertion.** There should be a test that a `member` sees (or does not see) the manage control, matching whichever policy is chosen. Right now neither side is asserted in the UI and the server test asserts th
- Look in: `app/components/workspace/TeamMember.tsx:78,139-141`, `app/routes/workspaces+/$id/settings.action.server.ts:44-53`, `app/lib/platform-members.server.ts:53-75`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts (`assertNoRoleEscalation`, `requireActorOutranksTarget`)`, `e2e/specs/rbac.spec.ts`
- Missing tests: The UI visibility matches the chosen policy (kill-check).; A `member` is not offered `admin`.; The e2e assertion.
- Done when: The UI and the server agree: a `member` either sees a working manage form, or is told the truth and the server agrees (kill-check: flip one side and confirm a test goes red).; A `member` is never offered a role they cannot grant.; The sole owner still cannot be removed or demoted.; An e2e assertion covers the visibility, matching the chosen policy.
- Tracker: Filed from the 2026-09-25 full vertical-slice sweep. Evidence was read and quoted from the code at dev@648f5e58; the high-severity claims were re-verified against the source before filing. Every missing test above is a specific assertion with an explicit kill-check, not a request to add coverage.

### [#2051](https://github.com/chester-hill-solutions/callcaster/issues/2051) Decide what happens to unsettled messages when a campaign expires
- Verdict: **Needs decision** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- The #2048 settled-message gate is bypassed on the expired-campaign path: app/lib/worker/handlers/campaign.server.ts writes status=complete directly via updateCampaignStatusInWorkspace and never calls try_complete_campaign_if_drained. An expired message campaign can therefore read complete while Twilio still holds unsettled messages. Worse, runSmsStatusSideEffects only calls cancelQueuedMessagesForCampaign AFTER the end date has passed, so the bypass fires before the cancellation is even attempted.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. app/lib/worker/handlers/campaign.server.ts still terminalizes an expired campaign straight to complete, and its comment names the known gap: the settled-message gate is bypassed, so an expired message campaign can read complete while Twilio holds unsettled messages. The comment says the decision is tracked on #2048, which is closed - the open decision is this issue. There is no expired or cancelled campaign status, no credit-refund path, and no operator warning.
- Root cause: Genuine rule conflict, not an oversight. The RPC also requires an empty queue, and this path exists so a campaign that expires mid-drain does not stay stuck 'running' (#1512). Routing it through the gate would re-break that.
- Resolution: Decide whether expired means complete, means cancel the remainder and then settle, or needs its own campaign status. The code cannot be changed before that, because routing it through try_complete_campaign_if_drained re-breaks the anti-stuck behaviour the expiry path exists to provide. When the decision is made, also fix the code comment: it points at #2048, which is closed, instead of this issue.
- Look in: `app/lib/worker/handlers/campaign.server.ts:267-300 (the expiry path and its known-gap comment)`, `client/migrations/20260925120000_gate_campaign_completion_on_settled_messages.sql:51 (the gate it bypasses)`, `app/lib/campaign-ivr.server.ts:189-218 (the compare-and-set pattern the expiry path would need)`
- Missing tests: expired campaign with unsettled messages does not read complete (under the chosen rule); expired campaign with an undrained queue still terminalizes (#1512 preserved)
- Done when: Decision recorded in the issue and in the relevant doc; Expired campaign with unsettled messages does not read complete under option 2 or 3; #1512 anti-stuck behaviour preserved; Option 1 also specifies credit treatment and an operator warning for abandoned messages; Real-Postgres test pins whichever rule is chosen
- Tracker: DECLINED by the maintainer on 2026-09-25 ('no 2051'). Do not pick this up and do not re-raise it. The gap is real and still worth knowing about: an expired message campaign writes status=complete directly, bypassing the #2048 settled-message gate, so a campaign whose end_date passed while Twilio still held messages can read complete. It is deliberately left as-is rather than fixed, and the code carries a comment marking it a known gap so nobody mistakes it for covered. The genuine rule conflict stands: routing it through the gate would re-break #1512, because the RPC also requires an empty queue and this path exists so a campaign that expires mid-drain does not stay stuck running.

### [#2043](https://github.com/chester-hill-solutions/callcaster/issues/2043) Decide how far to expand the campaign-split feature: promote it, widen its trigger, or automate the copy variation it asks for by hand
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: @sai-sy · Updated: 2026-09-25
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
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
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
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Roadmap investigation to replace the vx-any catch-all with structured intent routing via Jev's Choice primitive. Open questions: round-trip latency, per-call/step cost, service boundary, transcript-only vs audio input, EN/FR calibration, failure mode, confidence threshold. Its answer decides #1862 and the deferred confidence slice of #1875.
- Current behavior: vx-any matches any speech longer than 2 characters; no intent classification and no confidence. #1875 slice B stores { value, raw, inputType } only; language defaults en-US.
- Root cause: No intent-classification layer exists; the choice is between a calibrated service and a local normalizer/matcher.
- Resolution: Run the evaluation as a spike: benchmark latency and cost per step, test EN/FR calibration, pick a service boundary and fallback, and record a decision with an ADR. Then either open the Jev integration ticket or unblock #1862 as a hand-rolled matcher.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/lib/ivr-gather.server.ts`, `app/lib/ivr-webhook-auth.server.ts`, `docs/adr/`
- Existing tests: test/ivr-gather.test.ts
- Done when: Latency, cost, bilingual calibration, and failure-mode answers recorded; A decision: adopt Jev or hand-roll, with a named service boundary; #1862 and the #1875 confidence slice unblocked or closed accordingly
- Tracker: needs-decision/roadmap spike. Keep vx-any as-is until answered; its outcome decides #1862.

### [#1848](https://github.com/chester-hill-solutions/callcaster/issues/1848) Decide the default mapping when a full-name and a last-name column both exist
- Verdict: **Needs decision** · Size: S · Risk: low · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-25
- Suggestion to auto-map a full-name column to firstname instead of name when a separate populated surname column exists, so the pair is not blocked by the ambiguous-name rule. The reporter is unsure the heuristic is worth the overhead.
- Current behavior: suggestContactImportMapping maps a 'Name' header to 'name' and a 'Last name' header to 'surname'; validateContactImportMapping then raises a blocking ambiguous-name issue.
- Root cause: Auto-mapping has no cross-column heuristic; a full-name column and component-name columns cannot coexist because ambiguous-name is blocking.
- Resolution: Decide whether to add a heuristic: when one header resolves to 'name' and a different header resolves to 'surname' and the name column's values do not already contain the surname values, default the name column to 'firstname'. If approved, implement in shared/contact-import-headers.ts and cover it with tests.
- Look in: `shared/contact-import-headers.ts`, `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/AudienceUploader.tsx`
- Existing tests: test/contact-import-headers.test.ts
- Missing tests: Name + separate surname data maps to First name + Last name without a blocking issue; Negative case: a name column that already contains the surname keeps the full-name mapping
- Done when: Decision recorded on whether to add the heuristic; If added, a Name column plus a Last name column with data maps to First name + Last name and is not blocking; Name-only files keep name splitting
- Tracker: needs-decision: the reporter questions the overhead; confirm the heuristic is wanted before implementing.

### [#1345](https://github.com/chester-hill-solutions/callcaster/issues/1345) Decide and add a CHS-managed toll-free SMS verification path
- Verdict: **Needs decision** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Political campaigns have no business number, so toll-free SMS (which requires a BN) does not serve them. Offer a CHS-managed path — but only after a compliance/ownership decision.
- Current behavior: Goal step offers toll-free (requires customer BN) or local (no BN); readiness requires businessRegistrationNumber for toll-free; twilio-toll-free-provision uses workspace business identity.
- Root cause: No managed-sponsorship model; CHS BN must not be stored as customer identity.
- Resolution: Decide if CHS can sponsor customer traffic; if yes, add a support-request flow with clear ownership/review status and local-number alternative.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingGoalStep.tsx`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/twilio-toll-free-provision.server.ts`
- Existing tests: test/ui/onboarding-goal-step.test.tsx
- Missing tests: managed-service request path (once approved)
- Done when: Compliance approves/rejects sponsorship; Users without BN can request support; CHS BN not stored as customer identity
- Tracker: Blocked on product/compliance decision; issue title says 'calls' but scope is SMS.

### [#1129](https://github.com/chester-hill-solutions/callcaster/issues/1129) Define campaign draft/publish semantics and block dirty setup navigation
- Verdict: **Needs decision** · Size: L · Risk: high · Labels: ux, needs-repro · Assignee: none · Updated: 2026-09-25
- Campaign edits offer Reset/Save and the launch rail blocks dirty navigation, but there is no save-as-draft vs publish split and no disabled Next while dirty.
- Current behavior: SaveBar Reset + Save Changes writes the row; footer Next always active; no persisted draft-vs-published revision model.
- Root cause: Draft/published semantics undefined; needs-repro against current UI per maintainer.
- Resolution: Decide semantics first (what 'Save as draft' vs 'Save and publish' change), then implement discard/draft/publish and disable footer Next while dirty. Surface existing drafts when a published version exists.
- Look in: `app/components/campaign/settings/CampaignSettings.tsx`, `app/components/shared/SaveBar.tsx`, `app/components/campaign/home/CampaignShellDirty.tsx`, `app/components/campaign/settings/useCampaignSettingsController.ts`
- Existing tests: SaveBar generic tests
- Missing tests: footer navigation while dirty; published/draft version semantics
- Done when: Product rules define draft/publish; Discard restores persisted version; Next blocked while dirty
- Tracker: Decision + needs-repro confirmation before scoping.

### [#1659](https://github.com/chester-hill-solutions/callcaster/issues/1659) Admin: Twilio cost breakdown per workspace/account
- Verdict: **Needs decision** · Labels: none · Assignee: none · Updated: 2026-09-25
- Twilio cost breakdown could mean workspace ranking, more detail within one workspace, or both.
- Resolution: Confirm the intended view before implementation. Reuse existing usage projection.
- Look in: `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.UsagePanel.tsx`

### [#1521](https://github.com/chester-hill-solutions/callcaster/issues/1521) decision(billing): should Stripe refunds/disputes reverse credits?
- Verdict: **Needs decision** · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Refunds and disputes do not reverse credits under the current documented billing scope.
- Resolution: Choose automatic reversal or an explicit manual policy before changing ledger behavior.
- Look in: `app/routes/api+/stripe-webhook.action.server.ts`, `docs/billing-source-of-truth.md`

### [#1732](https://github.com/chester-hill-solutions/callcaster/issues/1732) Campaign queue statuses
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-09
- Umbrella queue status-model redesign (completion vs outreach status; missing opted-out/dialing/failed states). Big product decision; 1720 is a subset.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1710](https://github.com/chester-hill-solutions/callcaster/issues/1710) Should surveys be separate from scripts instead of integrated?
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-09
- Architecture question whether surveys should merge into scripts. Surveys exist as a separate module with public & workspace routes; consolidation scope needs a decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

---

## Blocked / split first — 30

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

### [#2213](https://github.com/chester-hill-solutions/callcaster/issues/2213) Correct the remaining temporal column types listed in the schema drift baseline
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-24
- The guard and campaign_queue/call/message slices are present. The committed baseline still holds 64 remaining temporal mismatches. This is a multi-table program requiring separate table changes, not one atomic fix.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The guard and three slices landed: the campaign_queue, call and message tables now declare their temporal columns as timestamps (3d951645, 6fca427d), and test/integration-db/schema-type-drift.test.ts asserts no column has started lying about being text and that no baselined column has stopped lying. The baseline scripts/baselines/schema-type-drift.txt still holds all 64 entries, so no further table has been sliced. app/db/schema.ts:323 still declares date_updated as text().
- Root cause: The remaining Drizzle declarations model database timestamps as text. The database types already are temporal; these slices normally change model and callers, not database column DDL. The original call/message/campaign_queue slices and tenant write-boundary repair are complete.
- Resolution: The guard and the first three slices are done. The remaining work is mechanical: correct the 64 baselined temporal columns in the same slice-at-a-time pattern, lowering the baseline with each slice, and remove the last text() temporal declaration. The existing guard test already refuses a stale baseline entry, so each slice is provable on its own.
- Look in: `scripts/baselines/schema-type-drift.txt:1`, `test/integration-db/schema-type-drift.test.ts:141`, `app/server/tenant-db.ts:121`, `scripts/baselines/schema-type-drift.txt`, `test/integration-db/schema-type-drift.test.ts`, `test/helpers/schema-drift.ts`, `app/db/schema.ts`, `app/db/schema-campaign.ts`
- Existing tests: test/integration-db/schema-type-drift.test.ts
- Missing tests: Guard exists. Each slice needs behavior tests at Date/write/wire boundaries plus real-Postgres verification; no fresh database count performed here.
- Done when: The temporal drift baseline reaches zero in small table-specific changes.; The existing guard rejects both new drift and stale baseline entries.
- Tracker: Move to Blocked / split first as a multi-table parent. Create table-specific tasks; do not re-implement the guard or completed slices. Related PR evidence: #2231, #2233, #2241, #2244. A PR reference alone does not prove deployed behavior.

### [#1165](https://github.com/chester-hill-solutions/callcaster/issues/1165) Prune stale non-production Twilio resources safely
- **IN PROGRESS** · Verdict: **Blocked / split first** · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-19
- The preview-app cleanup shipped in PR #2733. Remaining cleanup needs the accurate inventory in #2757 and the retention decision in #2029; a suspended subaccount currently rejects Messaging Services reads.
- Current behavior: A live read-only check finds a suspended subaccount whose Messaging Services API returns HTTP 401 with both listed and fetched credentials. The existing report hid those failures as empty service lists and capped account enumeration at 200.
- Root cause: The collector used a nonexistent v2010 Messaging Services path and suppressed read errors. Resource release also needs the existing policy decision; a missing database owner or an unreadable subaccount does not prove that a resource is unused.
- Resolution: Complete the report repair in #2757. Keep unreadable or unverified resources protected, then apply the approved retention rule from #2029 before further cleanup.
- Look in: `scripts/twilio-resource-prune-report.mjs`, `scripts/lib/twilio-resource-prune-policy.mjs`, `scripts/local/prune-environment-twiml-apps.mjs`, `scripts/lib/live-environments.mjs`
- Blocked by: [#2757](https://github.com/chester-hill-solutions/callcaster/issues/2757), [#2029](https://github.com/chester-hill-solutions/callcaster/issues/2029)
- Existing tests: test/twilio-resource-prune-policy.test.ts — 31 policy cases (environment check, owner check, keep list, assertPrunable guard); no test exercises a real delete (there is no delete path for workspace-owned resources); Parent-only live audit: 206 inventory entries, 12 KEEP, 0 STALE and 194 UNKNOWN. This includes 192 subaccount metadata rows but excludes their resource lists; it is not a complete account audit. An active subaccount probe reads a Messaging Service successfully, while the full scan identifies a suspended subaccount and exits with failure.
- Tracker: Feature; Priority Urgent; Effort Medium; environment unset; assigned to wra-sol. Project Status In progress was read in the issue sidebar. Parent #1158 is closed; existing closed dependencies #1164 and #1212 remain. Open dependencies #2757 and #2029 are now linked natively. Do not change a suspended account or release numbers as part of the report repair.

### [#1827](https://github.com/chester-hill-solutions/callcaster/issues/1827) Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-19
- Create a dedicated Twilio account for the dev environment (ideally via IaC) and update dev.callcaster.ca to use it.
- Current behavior: There is no dedicated CallCaster-dev Twilio account; dev falls back to shared or main-account credentials. #1356 is open.
- Root cause: Environment-level Twilio credential separation has not been provisioned; blocked by the DNS/IaC task #1356.
- Resolution: Create the CallCaster-dev Twilio account, store the credentials as dev environment secrets/vars, and update the dev.callcaster.ca config. Then unblock #1826.
- Look in: `.railway/environments/dev.ts`, `.railway/railway.ts`, `docs/twilio-runtime-inventory.md`, `docs/twilio-parent-ops-runbook.md`
- Missing tests: n/a (operations task)
- Done when: CallCaster-dev Twilio account exists and is documented; dev.callcaster.ca uses the dev account credentials; Credentials are stored as secrets/vars, not in the repo; IaC-vs-manual decision is recorded
- Tracker: blocked-epic: #1356 (dev DNS/IaC) first. Confirm the IaC-vs-manual decision when unblocked; this unblocks #1826.

### [#1269](https://github.com/chester-hill-solutions/callcaster/issues/1269) feat(scriptkit): add provider-neutral interaction document v2 and deterministic reducer
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
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
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
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
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
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
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
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
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: M-L · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- Partial fix only. Dead RPC removal and both actor rewrites are on dev; legacy auth shim remains and the fail-closed schema drop is absent. Issue discussion requires production dependency verification before the drop.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. Chunks 1 and 2 shipped: the dead get_outreach_attempts RPC is dropped and the two live auth.uid() RPCs read app.current_user_id. What is still missing in the current tree: the auth schema still exists (no DROP SCHEMA auth migration), drizzle/0001_auth_uid_shim.sql still creates auth.uid() and scripts/db/bootstrap-fresh-db.mjs still applies it, and there is no dependency guard - a repo-wide search for pg_depend finds nothing. Chunk 3 is written but NOT merged: commit cd00ada0 (fix(db): drop the legacy auth schema with a fail-closed guard (#1885)) on origin/fix/1885-chunk3-drop-auth adds client/migrations/20260922120000_drop_legacy_auth_schema.sql, test/legacy-auth-sql-guard.test.ts and retires the shim in both bootstrap scripts. It is not an ancestor of dev.
- Root cause: The live RPC actor rewrites and dead RPC removal shipped. The baseline shim still creates auth.uid(), and the final dependency guard and schema retirement remain unshipped.
- Resolution: Chunk 3 is already written on origin/fix/1885-chunk3-drop-auth (cd00ada0): a fail-closed DROP SCHEMA auth migration with a dependency guard, the shim retired in drizzle/0001_auth_uid_shim.sql and both bootstrap scripts, and test/legacy-auth-sql-guard.test.ts. It was never merged, so nothing needs to be written. Before it can land, the production dependency and data-retention verification the issue requires has to be recorded, and the schema drop has to ship as its own release step rather than inside a feature PR.
- Look in: `client/migrations/20260920120000_drop_get_outreach_attempts.sql (chunk 1, shipped)`, `client/migrations/20260920120100_rewrite_manual_dial_claim_actor.sql:23 (chunk 2, shipped)`, `client/migrations/20260920120200_rewrite_last_access_actor.sql:18 (chunk 2, shipped)`, `origin/fix/1885-chunk3-drop-auth commit cd00ada0 (chunk 3, written but never merged)`, `drizzle/0001_auth_uid_shim.sql:2 (the shim that chunk 3 retires)`, `scripts/db/bootstrap-fresh-db.mjs:120 (the bootstrap that still applies the shim)`
- Existing tests: test/queue-rpc-contract.test.ts; test/db-rpc-claim-queue-entry.test.ts; test/db-rpc-outreach-attempt.test.ts; test/atomic-manual-dial-claims.integration.test.ts
- Missing tests: test/legacy-auth-sql-guard.test.ts does not exist on dev; it exists only on the unmerged chunk 3 branch; The production dependency and data-retention verification the issue requires is not recorded anywhere
- Done when: A dependency guard fails before any destructive operation when non-auth functions, policies, views or other schema objects still depend on auth.; Production dependencies and data-retention requirements are verified before the schema drop.; Guard and schema drop follow the separate release steps recorded in the issue.; The two rewritten RPC flows retain actor and missing-actor behavior.; A fresh bootstrap does not recreate auth.uid() after retirement.
- Tracker: Lane is blocked-epic: the remaining work is a production verification plus a separate release step, and it touches client/migrations. The implementation is already written on origin/fix/1885-chunk3-drop-auth (cd00ada0) - start from that branch rather than writing it again. Do not merge the schema drop inside a feature PR.

### [#2168](https://github.com/chester-hill-solutions/callcaster/issues/2168) Cull old dev numbers and workspaces: backfill subaccount names and record the keep-list in the repo
- Verdict: **Blocked / split first** · Size: S-M · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- The keep-list now lives in the repo and is enforced by PR #2536 on dev. Name backfill and the repeat-policy decision remain; workspace-row cleanup stays deferred.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The keep-list slice is done and proven: scripts/cull-keep-list.mjs holds the three confirmed workspace ids, it wins before every cull rule, and test/cull-report-policy.test.ts asserts that 2608141501 survives the phone-name rule. The report is still read-only with no delete path. What is not done: nothing renames the legacy UUID-named Twilio subaccounts - workspaceResourceName is used only on the create path - and the repeat-versus-one-off policy is unrecorded.
- Root cause: No tooling existed to decide what could be culled, and no recorded rule to make the decision repeatable. The name-fragment junk exclusion is deliberately a --exclude flag rather than hardcoded, because it is a judgement call rather than a rule.
- Resolution: The keep-list is done. What remains is a backfill that renames the legacy UUID-named Twilio subaccounts to the workspaceResourceName form, plus the decision on whether the cull is repeatable or a one-off. The naming helper already exists in app/lib/twilio-resource-name.ts, and the prune report from PR #2733 now resolves those legacy names to their owner workspace, so the backfill has a source of truth to work from.
- Look in: `scripts/cull-keep-list.mjs (the confirmed keep-list, shipped)`, `scripts/cull-report-policy.mjs:8-24 (the keep-list wins first)`, `app/lib/database/workspace-twilio-subaccount.server.ts:39-62 (workspaceResourceName, create path only)`, `scripts/twilio-resource-prune-report.mjs (resolves legacy names to their owner workspace)`
- Existing tests: cull-report.mjs handles 555-number test credentials, the E911 VERIFY line, cross-workspace-only blockers, and compares dates rather than strings; test/cull-report-policy.test.ts confirms the three recorded workspace IDs and proves 2608141501 survives the phone-name cull rule
- Missing tests: Name backfill must be idempotent.
- Done when: Subaccount display names are backfilled to the #2167 format; The keep-list lives in the repository, not a shell argument; 2608141501 survives, since it is on both the keep-list and the phone-number-named rule; The cull report remains read-only with no delete path
- Tracker: Blocked / split first: durable keep-list is on dev in PR #2536. Name backfill is a separate Twilio-write task and needs idempotence. Record the repeat/retention decision before scheduling cleanup. Workspace-row cleanup remains deferred. #2170 (stale subaccount credentials) closed as completed on 2026-10-17, so that credential block is gone. Related PRs: #2536, #2171, #2167. PR #2536 passed full CI, E2E, schema, and Railway preview checks; issue #2168 is on-dev.

### [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157) epic(testing): controlled synthetic campaign audiences
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: L-XL · Risk: high · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-17
- Let testers upload controlled test audiences for voice/SMS/AI scenarios; in simulator mode data stays synthetic and never contacts real recipients; measure setup time, callback delay, completion, throughput. Parent of #1191/#1192/#1193.
- Current behavior: Seed has one generic audience; upload maps contact fields only; no scenario registry; mock returns fixed successes.
- Root cause: Not implemented. It depended on the synthetic provider (#1328), which closed as completed on 2026-10-17 together with the three asks it consolidated (#1156, #1194, #1161).
- Resolution: Keep as parent epic; the synthetic provider dependency is satisfied, so #1192 (server-owned scenario profiles) can start; #1193 is the final acceptance journey.
- Look in: `e2e/fixtures/seed.ts`, `app/components/audience/AudienceUploader.tsx`, `app/components/audience/AudienceUploadMapStep.tsx`
- Existing tests: seed fixture only
- Missing tests: scenario safety and telemetry
- Done when: Test audiences reference server-owned scenario ids; Simulator rejects real recipient numbers; Runs report timing metrics; No billable traffic
- Tracker: Parent epic; #1328 landed, so the block is gone. Split before assignment — this is not single-agent work.

### [#2002](https://github.com/chester-hill-solutions/callcaster/issues/2002) epic(authz): permission-based authorization instead of role checks
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: ux, business-logic · Assignee: @wra-sol · Updated: 2026-10-15
- Parent of the authorization cluster. The product currently gates on three broad roles — Admin sees and edits everything, Coordinator sees and edits campaigns and agents, Agent can join campaigns — and the request is to move to permissions applied to people, with the existing roles kept as default groupings. Explicitly excludes UX around building grouped access policies: plan and implement the permission model first.
- Current behavior: Access is decided by comparing a role string. Route loaders and actions check the role, not whether the specific action is permitted.
- Root cause: Authorization was modelled as a role comparison from the start and every check since has followed that shape.
- Resolution: #2030 reported on 2026-10-19 (docs/adr/0039-role-checks-become-capability-checks.md): extend the capability layer that already exists in app/lib/capabilities.ts and the shared CHS auth packages, and do not adopt the better-auth admin or organization plugins. The vocabulary is therefore settled, so #2008 can be specified, #2009 builds on #2008, and #2031 is the codebase-wide consistency sweep that lands last because it depends on the model existing everywhere.
- Look in: `app/lib/admin-middleware.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/auth-layout.server.ts`, `eslint.config.mjs (no-restricted-imports, tenant boundary)`
- Missing tests: permission model exists; each permission has a test at the route that enforces it
- Done when: A permission model exists that roles map onto as default groupings; Authorization checks a permission rather than comparing a role string; Existing roles continue to work as groupings without a migration per user; No route is left checking a broad role where a specific permission is meant
- Tracker: Parent epic. Explicitly out of scope per the issue text: the UX for building grouped access policies. #2030 has reported (docs/adr/0039-role-checks-become-capability-checks.md), so specification can begin; do not re-run the options analysis.

### [#1802](https://github.com/chester-hill-solutions/callcaster/issues/1802) security(deps): remediate open runtime dependency alerts
- Verdict: **Blocked / split first** · Labels: none · Assignee: none · Updated: 2026-10-07
- Runtime security is a native Epic with separate package Tasks. Six source fixes are merged: Axios #2336, csv-parse #2338, Scalar SDK #2339, ws #2343, Twilio JWS #2345 and PostCSS #2346. Deployed acceptance and release promotion remain open. At dev@befe20fa, npm production audit is clear and the independently resolved Bun runtime graph has zero affected nodes.
- Resolution: Complete each child’s applicable deployed acceptance and release promotion. Verify fresh audits and the live default-branch alert state before closing the Epic. Do not repeat completed package source work or treat package exposure as a proved app exploit.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Tracker: The Bun mandatory runtime trace resolves 594 nodes, zero missing required edges and zero affected nodes; it excludes vendor devDependencies and optional peer integrations. The most recent 2026-10-04 master snapshot has two runtime alerts (#220, #218) plus 37 development alerts, a separate release view. All six source PRs passed full local CI, exact-head remote gates and both deployments. Keep #1805 and closed #1809 as existing history; all applicable child QA/release requirements remain open.

### [#1878](https://github.com/chester-hill-solutions/callcaster/issues/1878) Surface and select the caller audio on the /call welcome dialog
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-05
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
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-04
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
- Verdict: **Blocked / split first** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-04
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
- Verdict: **Blocked / split first** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
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
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
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
- Verdict: **Blocked / split first** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
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
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
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
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Shared component ownership and a no-layout-movement rule for all dynamic feedback. Implement through the separate child tasks.
- Current behavior: Rule/inventory PR #2302 and reset-password PR #2310 are merged into dev. Canonical Notice #120, semantic Alert #121 and modal-safe Toaster #126 are reviewed local shared work, not merged/adopted. Notice source uses shared button styles; actual CallCaster shad-cc consumer proof passes four narrow/desktop light/dark cases with no page/scroll movement. Field-error #125 is reviewed local shared source at a4a07e5: 218 workbench tests, five CLI tests and four actual CallCaster shad-cc browser cases pass. Original flow adds 120px at narrow width. Shared source remains unmerged and not adopted. Native consumer children #2311/#2312 cover field placement/modal accessibility; #2305 and #2307 have real prerequisites, and #2306/#2308 remain separate defects.
- Root cause: Message tone, placement and lifecycle were selected independently at each call site.
- Resolution: Ship shared mechanics first, then migrate consumer groups in atomic PRs. Preserve page layout, field association, unresolved conditions, required remedies, confirmation safety and root-only transient feedback. Do not implement this Epic as one large PR.
- Look in: `docs/design-system.md`, `docs/feedback-inventory.md`, `app/components/ui/`, `app/root.tsx`
- Existing tests: PR #2302 full local/remote gates; PR #2310 full local/remote gates and four built-app geometry cases.; Canonical shared source proof is distinct from app adoption and fresh shared CI acceptance.
- Missing tests: Shared component merge and consumer adoption; actual narrow/desktop light/dark browser geometry for each changed dynamic group.
- Done when: Canonical component library owns generic feedback presentation.; No dynamic alert moves page content or scroll.; Consumer groups retain domain actions and hard guards.
- Tracker: Split work through the native child issues; preserve the existing #2032 parent under #2000.

### [#1873](https://github.com/chester-hill-solutions/callcaster/issues/1873) Call recording: workspace recording policy + campaign opt-in, wired into IVR/predictive/test dials
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-02
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
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
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
- Verdict: **Blocked / split first** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- The attribute-based half of the cluster. Adding an Agent to a specific campaign should also unlock their broader ability to see and act on that campaign type: added to a live-call campaign, it appears on their list and is callable if open; added to an SMS campaign, its numbers become visible on the chats page.
- Current behavior: Campaign membership is a relation, but it does not appear to confer the broader capability, and the broader capability does not appear to be scoped back down to the campaigns they are actually on.
- Root cause: Two separate concerns — which campaign types you may touch, and which campaigns within a type — are not expressed in the same model, so membership cannot imply the first.
- Resolution: Blocked by #2008, which defines the type-level capability set this refines. Two distinct grants are needed and they must not be conflated: a type-level capability from the role defaults, and a campaign-level grant from membership. The test that matters is negative — an Agent with access to one SMS campaign must not see another campaign's numbers.
- Look in: `app/db/schema.ts (campaign membership relation)`, `app/lib/workspace-middleware.server.ts`, `app/routes/workspaces+/$id/**/chats`, `app/components/**/CampaignList`
- Blocked by: [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008)
- Missing tests: membership grants visibility of exactly that campaign; an Agent on one SMS campaign cannot see another campaign numbers
- Done when: Campaign membership confers a campaign-level grant; An Agent sees only the campaigns they are on, within the types they may touch; The negative case is tested: one campaign membership does not leak another campaign; Type-level and campaign-level grants are separate and both readable in the code
- Tracker: Blocked by #2008 on purpose — the two are easy to conflate and building this first would bake in the wrong model. The negative test is the one that proves it; without it a permissive implementation looks correct.

### [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008) Agent role: define the permission surface for calling, messages and handset
- Verdict: **Blocked / split first** · Size: M · Risk: high · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The broad policy question behind the cluster. Decide which capabilities an Agent has over live-call campaigns, IVR campaigns and SMS campaigns. The issue proposes defaults of all live-call campaigns, no IVR campaigns, no SMS campaigns, and states that without access those pages must be hidden from the sidebar AND return 403 on a direct attempt. The policy was deferred by the operator on 2026-10-19; the surface findings are filed here so the decision is the only thing left.
- Current behavior: Mapped on dev@24631cc0, 19 October 2026. Agent is the `caller` role (MemberRole.Caller, UI label Agent). The capability matrix in app/lib/capabilities.ts already grants caller `campaigns.read`, `calls.start` and `calls.control`; it also grants `messages.send` to member but not to caller. The catalog has NO per-campaign-type capability at all, so there is currently no way to express live-call versus IVR versus SMS. IVR (robocall, simple_ivr, complex_ivr) and SMS (message) campaigns are served by the SAME routes as live-call campaigns and differ only by campaign.type, so any denial has to be type-aware. Sidebar visibility is 100% hasMinRole; there is no capability check anywhere in the UI.
- Root cause: Authorization was modelled as a role comparison from the start and every check since has followed that shape. The capability layer grew beside it rather than replacing it, and the catalog was never extended to express campaign-type distinctions, so capability-by-capability policy is enforced ad hoc in whichever component happened to check it.
- Resolution: The vocabulary is settled: #2030 reported on 2026-10-19 (docs/adr/0039-role-checks-become-capability-checks.md) and says to grow PRODUCT_CAPABILITIES in app/lib/capabilities.ts rather than invent a second model, and to leave workspace-customized permissions to a later decision. Still needed before enforcement: (1) a confirmed policy - the issue defaults are a proposal, not a decision; (2) new per-campaign-type capability ids, which means adding them to CAPABILITY_CATEGORIES in app/lib/api-key-capabilities.shared.ts and the ProductCapabilityId enum in app/lib/openapi-platform-components.ts, both of which are exhaustive; (3) a workspace-route capability strategy, because app/lib/capability-guard.server.ts is data-plane only and has no workspace equivalent; (4) type-aware enforcement at the campaign list and the campaign detail route, because IVR and SMS share the campaign routes; (5) the sidebar and the route must read the same source, so the nav items and the route guard derive from one capability set; (6) scripts/check-route-authz.mjs must be taught about capabilities, because its regex only recognises hasMinRole and role equality, and the three routes it allowlists for callers (call, handset, chats) are exactly the surfaces in scope.
- Look in: `app/lib/capabilities.ts (PRODUCT_CAPABILITIES, CALLCASTER_ROLE_CAPABILITY_MATRIX, capabilityIdsForRole)`, `app/lib/member-role.ts (MemberRole enum, WORKSPACE_ROLE_RANK, hasMinRole)`, `app/lib/workspace-role-display.ts (Agent = caller, Coordinator = member, Administrator = admin/owner)`, `app/components/workspace/WorkspaceNav.tsx (the real sidebar; the board's WorkspaceSidebar.tsx path does not exist)`, `app/routes/workspaces+/$id.tsx (renders WorkspaceNav, defaults a null role to MemberRole.Member)`, `app/routes/workspaces+/$id/campaigns.route.tsx and campaigns/$selected_id.loader.server.ts (the shared campaign routes)`, `app/routes/workspaces+/$id/handset.loader.server.ts and chats.loader.server.ts (the handset and SMS surfaces)`, `app/lib/capability-guard.server.ts (data-plane only; no workspace-route capability strategy exists yet)`, `app/lib/workspace-route.server.ts and app/lib/workspace-middleware.server.ts (403 shape, membership versus capability)`, `app/lib/database/campaign.server.ts (CampaignType and IVR_CAMPAIGN_TYPES)`, `app/lib/api-key-capabilities.shared.ts and app/lib/openapi-platform-components.ts (exhaustive capability id maps)`, `scripts/check-route-authz.mjs and scripts/lib/route-read-role-floor.mjs (gates that only understand role checks)`
- Existing tests: test/ui/workspace-nav-campaign-caller-gating.test.tsx: asserts the Agent does not see New Campaign, and explicitly asserts the Agent STILL SEES Today, Campaigns, Messages, Call History, Voicemails, Analytics, Handset and Settings; test/capabilities.test.ts and test/capability-actor.test.ts: the role-to-capability matrix and deny-by-default behaviour; test/capability-gated-routes.test.ts and test/data-plane-role-gate.test.ts: data-plane 403 versus 404; e2e/specs/rbac.spec.ts: RBAC-01 asserts the caller nav shows Campaigns and Messages, RBAC-06 asserts the 403 page shape
- Missing tests: each capability has a route-level enforcement test; sidebar visibility and route enforcement agree; a caller denied an IVR campaign gets 403 on a direct URL to that campaign; a caller denied SMS campaigns does not see message-type campaigns in the list
- Done when: The Agent capability set is written down as data, not scattered conditionals; Every denied surface returns 403 on a direct URL attempt, not only when hidden; The 403-versus-404 boundary is decided and documented rather than incidental; Sidebar visibility and route enforcement read from the same source
- Tracker: Unblocked by #2030 (docs/adr/0039-role-checks-become-capability-checks.md). The surface was mapped on 2026-10-19 and the operator deferred the policy decision, so this is the only open question. Do not re-run the options analysis and do not re-map the surface; the findings above are current for dev@24631cc0. The two existing tests that assert the Agent sees Messages and Handset will have to change once the policy is decided, and that change is expected rather than a regression.

### [#1862](https://github.com/chester-hill-solutions/callcaster/issues/1862) IVR: match spoken/DTMF input to the script's declared options (normalize + fuzzy)
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
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

### [#1828](https://github.com/chester-hill-solutions/callcaster/issues/1828) QA-environment PR acceptance suite against the smart test audience
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
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

### [#268](https://github.com/chester-hill-solutions/callcaster/issues/268) i18n epic: fr-CA as the first locale (6 slices, one PR each)
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Multi-PR epic reviving #268. Decisions recorded (React Aria I18nProvider + @react-aria/i18n; react-i18next + remix-i18next JSON catalogs; per-user locale with workspace default en-CA; per-campaign campaign.language; explicit /fr/* marketing routes; sign-in as slice 1). Nothing is implemented.
- Current behavior: English-only app with locale-naive formatting and no locale column on user, workspace or campaign.
- Root cause: No i18n framework or locale resolution was ever added.
- Resolution: Run the six published slices as separate PRs, starting with foundation + sign-in. Split them into child issues so each lands independently.
- Look in: `app/root.tsx`, `app/lib/types.ts`, `app/lib/tts-voices.ts`, `app/routes.ts`, `package.json`, `app/lib/low-credit-notify.server.ts`, `app/lib/billing-reconciliation-alert.server.ts`, `app/lib/send-reset-password-email.server.ts`
- Missing tests: catalog parity - every key present in every locale; locale resolution - user pref, then workspace default, then en-CA; /fr/* routes and hreflang; ICU plural handling for French
- Done when: A signed-in operator can switch to French and UI, dates and numbers render in fr-CA; Outbound voice, SMS and email can be French per campaign; A missing-translation check fails CI
- Tracker: Split first: open six child issues (one per slice) linked to this epic; slice 1 (foundation + sign-in) can start immediately. Do not attempt in one PR.

### [#1861](https://github.com/chester-hill-solutions/callcaster/issues/1861) Spike: replace Twilio AMD with a local, faster voicemail classifier
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Investigation spike to keep, replace, or front-run Twilio AMD. Acceptance requires measured time-to-first-audio and accuracy on the same call set; both prerequisites (#1842 instrumentation, #1845 live AMD scope) landed on 2026-10-17.
- Current behavior: Every outbound path sends synchronous machineDetection: 'Enable'. No async AMD, no local classifier, no shadow mode.
- Root cause: Synchronous AMD adds seconds of dead air and caps accuracy at Twilio's engine; there is no measured baseline.
- Resolution: Both prerequisites landed on 2026-10-17 (#1842, #1845), so run the spike: measure Twilio async AMD and one local/managed option on the same call set, evaluate the media-stream fork limit, write the report and an ADR with the accuracy/latency threshold, then a phased shadow-mode plan.
- Look in: `app/lib/auto-dial.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/routes/api+/dial/status.action.server.ts`, `app/db/schema.ts`, `docs/adr/0030-media-stream-bun-service-third-railway-process.md`, `docs/live-transcription-coaching-plan.md`
- Missing tests: Measured time-to-first-audio for sync vs async AMD and a local classifier; Classifier accuracy on human/machine/screening/beep/silence/fax; Media-stream fork/concurrency budget at target volume
- Done when: Written report with measured latency and accuracy for Twilio async AMD and one local option on the same call set; Recommendation with an accuracy-latency threshold and reconciliation/fallback policy; If replacing: an ADR and a phased plan starting in shadow mode
- Tracker: #1842 and #1845 landed on 2026-10-17, so the spike is unblocked. Run it scoped; produce an ADR before any implementation.

### [#1498](https://github.com/chester-hill-solutions/callcaster/issues/1498) [Feature]: Add campaign export report with toplines and reply conversations
- Verdict: **Blocked / split first** · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The export report needs toplines, inbound replies, contact grouping, attribution and tenant-safe filtering. This is a feature program, not a release cleanup.
- Resolution: Split metrics and conversation projection from artifact presentation; establish scope and fixtures before implementation.
- Look in: `app/lib/campaign-export.server.ts`

### [#2057](https://github.com/chester-hill-solutions/callcaster/issues/2057) epic(auth-pages): sign-in and sign-up share one layout, copy and error treatment
- Verdict: **Blocked / split first** · Size: M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
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
- Verdict: **Duplicates** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Same root cause as 1732: queue_status enum only has queued/dequeued and opted-out entries display as 'completed'. 1732's outreach-status model is the canonical ticket; 1720 is one of its observable symptoms.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

---

## Needs triage — 184

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#2816](https://github.com/chester-hill-solutions/callcaster/issues/2816) Feature: SIM task protocol and SMS flows
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2787](https://github.com/chester-hill-solutions/callcaster/issues/2787) Feature: ADR-0040 service-adoption framework
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2789](https://github.com/chester-hill-solutions/callcaster/issues/2789) Feature: SIM configuration and secret-provider adoption
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2965](https://github.com/chester-hill-solutions/callcaster/issues/2965) Task: deploy hosted SIP persona service on a durable host
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2835](https://github.com/chester-hill-solutions/callcaster/issues/2835) Task: develop local Asterisk SIP persona host
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2973](https://github.com/chester-hill-solutions/callcaster/issues/2973) Task: migrate scripts and browser-suite SecretProvider boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2972](https://github.com/chester-hill-solutions/callcaster/issues/2972) Task: migrate scripts and browser-suite typed non-secret configuration
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2971](https://github.com/chester-hill-solutions/callcaster/issues/2971) Task: migrate media-stream SecretProvider boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2970](https://github.com/chester-hill-solutions/callcaster/issues/2970) Task: migrate media-stream typed non-secret configuration
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2969](https://github.com/chester-hill-solutions/callcaster/issues/2969) Task: migrate worker SecretProvider boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2968](https://github.com/chester-hill-solutions/callcaster/issues/2968) Task: migrate worker typed non-secret configuration
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2967](https://github.com/chester-hill-solutions/callcaster/issues/2967) Task: migrate app SecretProvider boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2966](https://github.com/chester-hill-solutions/callcaster/issues/2966) Task: migrate app typed non-secret configuration
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2838](https://github.com/chester-hill-solutions/callcaster/issues/2838) Task: verify direct SIP hello-hangup smoke
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2836](https://github.com/chester-hill-solutions/callcaster/issues/2836) Task: implement Asterisk persona service
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2815](https://github.com/chester-hill-solutions/callcaster/issues/2815) Feature: SIM persona catalog and profile POC
- Status: In progress · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2790](https://github.com/chester-hill-solutions/callcaster/issues/2790) Feature: ADR-0040 Phase 6 compatibility removal and ratchet
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2828](https://github.com/chester-hill-solutions/callcaster/issues/2828) Task: migrate existing SIM SMS setup to personas
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2827](https://github.com/chester-hill-solutions/callcaster/issues/2827) Task: add profile status and access checks
- Status: In progress · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2826](https://github.com/chester-hill-solutions/callcaster/issues/2826) Task: implement idempotent profile and workspace reconciliation
- Status: In progress · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2825](https://github.com/chester-hill-solutions/callcaster/issues/2825) Task: implement ResolvedSimProfile
- Status: In progress · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2824](https://github.com/chester-hill-solutions/callcaster/issues/2824) Task: add SIM catalog validation
- Status: In progress · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2823](https://github.com/chester-hill-solutions/callcaster/issues/2823) Task: define the three initial SIM personas
- Status: In progress · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2812](https://github.com/chester-hill-solutions/callcaster/issues/2812) Task: remove SIM compatibility variables
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2811](https://github.com/chester-hill-solutions/callcaster/issues/2811) Task: verify SIM through dotenv and password manager
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2810](https://github.com/chester-hill-solutions/callcaster/issues/2810) Task: make SIM the first dotenv-backed service boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2732](https://github.com/chester-hill-solutions/callcaster/issues/2732) Delete Workspace Option
- Status: on-dev · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2801](https://github.com/chester-hill-solutions/callcaster/issues/2801) Task: add required-secret dry-run command
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2800](https://github.com/chester-hill-solutions/callcaster/issues/2800) Task: implement password-manager secret provider
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2799](https://github.com/chester-hill-solutions/callcaster/issues/2799) Task: implement local dotenv secret provider
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2798](https://github.com/chester-hill-solutions/callcaster/issues/2798) Task: define secret catalog and service allowlists
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2786](https://github.com/chester-hill-solutions/callcaster/issues/2786) Feature: ADR-0040 Phase 2 secret provider foundation
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2652](https://github.com/chester-hill-solutions/callcaster/issues/2652) Give the campaign message editor an accessible field name
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2658](https://github.com/chester-hill-solutions/callcaster/issues/2658) Name each weekly campaign start/end time control
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2943](https://github.com/chester-hill-solutions/callcaster/issues/2943) Reset password email styling is off
- Status: on-dev · Labels: design · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2642](https://github.com/chester-hill-solutions/callcaster/issues/2642) Return from the audio editor to the existing library route
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2654](https://github.com/chester-hill-solutions/callcaster/issues/2654) Connect the Send using label to its campaign control
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2647](https://github.com/chester-hill-solutions/callcaster/issues/2647) Name the Call list index row actions
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2656](https://github.com/chester-hill-solutions/callcaster/issues/2656) Make campaign message attachments usable without hover
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2641](https://github.com/chester-hill-solutions/callcaster/issues/2641) Identify each campaign queue selection checkbox by contact
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2501](https://github.com/chester-hill-solutions/callcaster/issues/2501) SMS campaigns should have the same sendnidefault as other campaigns
- Status: on-dev · Labels: ux · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2661](https://github.com/chester-hill-solutions/callcaster/issues/2661) Offer password recovery before entry when the reset token is missing
- Status: on-dev · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2239](https://github.com/chester-hill-solutions/callcaster/issues/2239) e2e toolchain step times out on a 62.8 MB ffmpeg apt download
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-10-24
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2797](https://github.com/chester-hill-solutions/callcaster/issues/2797) Task: compare resolved config with current runtime
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2796](https://github.com/chester-hill-solutions/callcaster/issues/2796) Task: add redacted config resolution command
- Status: tested-on-dev · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2795](https://github.com/chester-hill-solutions/callcaster/issues/2795) Task: add inherited environment configuration
- Status: tested-on-dev · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2794](https://github.com/chester-hill-solutions/callcaster/issues/2794) Task: define ProjectConfig schema and secret names
- Status: tested-on-dev · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2785](https://github.com/chester-hill-solutions/callcaster/issues/2785) Feature: ADR-0040 Phase 1 typed inherited config
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2784](https://github.com/chester-hill-solutions/callcaster/issues/2784) Feature: ADR-0040 Phase 0 inventory and guardrails
- Status: tested-on-dev · Labels: none · Assignee: @sai-sy · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2942](https://github.com/chester-hill-solutions/callcaster/issues/2942) User Story: complete a first guided outreach session without human help
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2941](https://github.com/chester-hill-solutions/callcaster/issues/2941) Enable self-serve signup in production deliberately
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2493](https://github.com/chester-hill-solutions/callcaster/issues/2493) Stow bootstrap fails on macOS when sha256sum is absent
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2931](https://github.com/chester-hill-solutions/callcaster/issues/2931) workspace number renewal reminder even though worksapce is in weird limbo state without a number
- Status: on-dev · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-23
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2518](https://github.com/chester-hill-solutions/callcaster/issues/2518) call settings: When I use the dropdown for calling device the modal closes
- Status: In progress · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2937](https://github.com/chester-hill-solutions/callcaster/issues/2937) A rented number released directly at Twilio stays billable: the sweep never reconciles against the provider
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2899](https://github.com/chester-hill-solutions/callcaster/issues/2899) Railway IaC plan check fails on every PR that touches package.json: the dev and qa RAILWAY_TOKEN environment secrets are invalid
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2859](https://github.com/chester-hill-solutions/callcaster/issues/2859) Task: collect and compare SIP load reports
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2858](https://github.com/chester-hill-solutions/callcaster/issues/2858) Task: define versioned SIP load profiles
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2857](https://github.com/chester-hill-solutions/callcaster/issues/2857) Task: provision disposable SIPp load workers
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2856](https://github.com/chester-hill-solutions/callcaster/issues/2856) Task: verify scheduled smoke and alerting
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2855](https://github.com/chester-hill-solutions/callcaster/issues/2855) Task: add bounded scheduled SIM smoke
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2854](https://github.com/chester-hill-solutions/callcaster/issues/2854) Task: deploy isolated inbound email Worker and run API
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2853](https://github.com/chester-hill-solutions/callcaster/issues/2853) Task: verify voice checkpoints and evidence
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2852](https://github.com/chester-hill-solutions/callcaster/issues/2852) Task: add browser speech audio flow
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2851](https://github.com/chester-hill-solutions/callcaster/issues/2851) Task: add deterministic IVR and recorded-audio flows
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2850](https://github.com/chester-hill-solutions/callcaster/issues/2850) Task: add durable persona checkpoints
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2849](https://github.com/chester-hill-solutions/callcaster/issues/2849) Task: add voice task contracts and access metadata
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2848](https://github.com/chester-hill-solutions/callcaster/issues/2848) Task: verify resolver safety and first Twilio-to-SIP call
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2847](https://github.com/chester-hill-solutions/callcaster/issues/2847) Task: provision isolated synthetic provider environment
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2846](https://github.com/chester-hill-solutions/callcaster/issues/2846) Task: add SIP authentication and run headers
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2845](https://github.com/chester-hill-solutions/callcaster/issues/2845) Task: implement fail-closed telephony destination resolver
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2844](https://github.com/chester-hill-solutions/callcaster/issues/2844) Task: inventory and guard Twilio call paths
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2843](https://github.com/chester-hill-solutions/callcaster/issues/2843) Task: verify audience reuse and versioning
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2842](https://github.com/chester-hill-solutions/callcaster/issues/2842) Task: enforce mixed-audience safety
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2841](https://github.com/chester-hill-solutions/callcaster/issues/2841) Task: add run-scoped CSV audience fixtures
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2840](https://github.com/chester-hill-solutions/callcaster/issues/2840) Task: add simulation resource registry
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2839](https://github.com/chester-hill-solutions/callcaster/issues/2839) Task: add simulation run and event data model
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2837](https://github.com/chester-hill-solutions/callcaster/issues/2837) Task: implement persona controller and signed events
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2834](https://github.com/chester-hill-solutions/callcaster/issues/2834) Task: verify repeated SMS flows and access failures
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2833](https://github.com/chester-hill-solutions/callcaster/issues/2833) Task: add registered SMS SIM flows
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2832](https://github.com/chester-hill-solutions/callcaster/issues/2832) Task: make SIM resources logically idempotent
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2831](https://github.com/chester-hill-solutions/callcaster/issues/2831) Task: make current SIM tasks composable
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2830](https://github.com/chester-hill-solutions/callcaster/issues/2830) Task: add task permission metadata and persona selection
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2829](https://github.com/chester-hill-solutions/callcaster/issues/2829) Task: define SIM task result envelope
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2822](https://github.com/chester-hill-solutions/callcaster/issues/2822) Feature: SIP load testing
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2821](https://github.com/chester-hill-solutions/callcaster/issues/2821) Feature: Remote email checks and scheduled QA smoke
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2820](https://github.com/chester-hill-solutions/callcaster/issues/2820) Feature: Voice SIM tasks and predefined flows
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2819](https://github.com/chester-hill-solutions/callcaster/issues/2819) Feature: Synthetic telephony destination resolver and isolated provider path
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2818](https://github.com/chester-hill-solutions/callcaster/issues/2818) Feature: Simulation runs and audience persona binding
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2817](https://github.com/chester-hill-solutions/callcaster/issues/2817) Feature: SIP persona service POC
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2814](https://github.com/chester-hill-solutions/callcaster/issues/2814) Task: ratchet undocumented configuration reads to CI failure
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2813](https://github.com/chester-hill-solutions/callcaster/issues/2813) Task: remove legacy environment readers
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2809](https://github.com/chester-hill-solutions/callcaster/issues/2809) Task: apply mappings to dev and QA
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2808](https://github.com/chester-hill-solutions/callcaster/issues/2808) Task: add configuration and deployment drift checks
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2807](https://github.com/chester-hill-solutions/callcaster/issues/2807) Task: generate GitHub environment secret manifest
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2806](https://github.com/chester-hill-solutions/callcaster/issues/2806) Task: generate Railway variable mappings
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2805](https://github.com/chester-hill-solutions/callcaster/issues/2805) Task: migrate scripts and browser-suite config boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2804](https://github.com/chester-hill-solutions/callcaster/issues/2804) Task: migrate media-stream config boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2803](https://github.com/chester-hill-solutions/callcaster/issues/2803) Task: migrate worker config boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2802](https://github.com/chester-hill-solutions/callcaster/issues/2802) Task: migrate app config boundary
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2793](https://github.com/chester-hill-solutions/callcaster/issues/2793) Task: add report-only configuration drift guard
- Status: tested-on-dev · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2792](https://github.com/chester-hill-solutions/callcaster/issues/2792) Task: classify configuration ownership and sensitivity
- Status: tested-on-dev · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2791](https://github.com/chester-hill-solutions/callcaster/issues/2791) Task: inventory environment and secret inputs
- Status: tested-on-dev · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2788](https://github.com/chester-hill-solutions/callcaster/issues/2788) Feature: ADR-0040 Phase 4 deployment mappings and drift control
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2782](https://github.com/chester-hill-solutions/callcaster/issues/2782) Epic: Agent-friendly synthetic telephony testing
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2781](https://github.com/chester-hill-solutions/callcaster/issues/2781) Epic: Inherited configuration as code and pluggable secret providers
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2778](https://github.com/chester-hill-solutions/callcaster/issues/2778) Why are twilio subaccounts named after workspace names instead of UUID?
- Status: Backlog · Labels: question · Assignee: @wra-sol · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2777](https://github.com/chester-hill-solutions/callcaster/issues/2777) Rename workspaces
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2776](https://github.com/chester-hill-solutions/callcaster/issues/2776) Script validation error doesn't use human readable block names
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2775](https://github.com/chester-hill-solutions/callcaster/issues/2775) Start campaign vs Schedule?
- Status: Backlog · Labels: question, design, ux · Assignee: none · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2774](https://github.com/chester-hill-solutions/callcaster/issues/2774) IVR Voicemails Drops aren't smart and get cut off
- Status: Backlog · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-21
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2700](https://github.com/chester-hill-solutions/callcaster/issues/2700) Align Stripe workspaces across environments
- Status: Backlog · Labels: question · Assignee: @sai-sy · Updated: 2026-10-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2734](https://github.com/chester-hill-solutions/callcaster/issues/2734) Delete every workspace on dev.callcaster.ca
- Status: Backlog · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2716](https://github.com/chester-hill-solutions/callcaster/issues/2716) Decide the next scoped Effect adoption
- Status: In progress · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2701](https://github.com/chester-hill-solutions/callcaster/issues/2701) Destroy all stale stripe environments and sandboxes
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2696](https://github.com/chester-hill-solutions/callcaster/issues/2696) Railway IaC fails on dev: the plan proposes deleting CallCaster.STRIPE_API_KEY
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2676](https://github.com/chester-hill-solutions/callcaster/issues/2676) Feature: make phone-number release action discoverable
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2594](https://github.com/chester-hill-solutions/callcaster/issues/2594) Unify IVR and live-call multi-select blocks
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2595](https://github.com/chester-hill-solutions/callcaster/issues/2595) Add IVR stop-key handling
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2667](https://github.com/chester-hill-solutions/callcaster/issues/2667) Flatten the shared workspace shell to use page space
- Status: Backlog · Labels: design · Assignee: @wra-sol · Updated: 2026-10-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2662](https://github.com/chester-hill-solutions/callcaster/issues/2662) Keep Text content details readable in dark theme
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2660](https://github.com/chester-hill-solutions/callcaster/issues/2660) Offer a clear recovery step for an invalid invitation
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2659](https://github.com/chester-hill-solutions/callcaster/issues/2659) Keep campaign section scrolling inside the mobile navigation rail
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2657](https://github.com/chester-hill-solutions/callcaster/issues/2657) Name the date-picker time parts for assistive technology
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2653](https://github.com/chester-hill-solutions/callcaster/issues/2653) Give Text campaign editing useful desktop space
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2651](https://github.com/chester-hill-solutions/callcaster/issues/2651) Explain campaign SMS windows without contradicting recipient quiet hours
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2650](https://github.com/chester-hill-solutions/callcaster/issues/2650) Use one persistent opt-out notice in the conversation view
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2649](https://github.com/chester-hill-solutions/callcaster/issues/2649) Show a recoverable error when a selected CSV cannot be parsed
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2646](https://github.com/chester-hill-solutions/callcaster/issues/2646) Show contact unsaved status only after a draft value changes
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2645](https://github.com/chester-hill-solutions/callcaster/issues/2645) Use the CallCaster field contract for the new clip name
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2644](https://github.com/chester-hill-solutions/callcaster/issues/2644) Show duration and size for newly uploaded workspace audio
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2643](https://github.com/chester-hill-solutions/callcaster/issues/2643) Load newly uploaded workspace audio in the clip editor
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2640](https://github.com/chester-hill-solutions/callcaster/issues/2640) Use compact rows in the queue contact picker
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2639](https://github.com/chester-hill-solutions/callcaster/issues/2639) Show stored opt-out status in contact details
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2638](https://github.com/chester-hill-solutions/callcaster/issues/2638) Give Call list selection controls accessible names
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2637](https://github.com/chester-hill-solutions/callcaster/issues/2637) Bound long values in the populated campaign queue
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2636](https://github.com/chester-hill-solutions/callcaster/issues/2636) Use compact CallCaster field layout for CSV column mapping
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2635](https://github.com/chester-hill-solutions/callcaster/issues/2635) Keep populated People tables usable with long contact values
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2633](https://github.com/chester-hill-solutions/callcaster/issues/2633) Keep the DTMF keypad in a compact surface near call controls
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2632](https://github.com/chester-hill-solutions/callcaster/issues/2632) Keep the selected Credits navigation count readable in dark mode
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2631](https://github.com/chester-hill-solutions/callcaster/issues/2631) Show a focused empty state for an empty campaign queue
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2630](https://github.com/chester-hill-solutions/callcaster/issues/2630) Complete the handset offline message when no presence status exists
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2629](https://github.com/chester-hill-solutions/callcaster/issues/2629) Keep Back and Cancel available before a call list import starts
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2628](https://github.com/chester-hill-solutions/callcaster/issues/2628) Use a compact shared selection control for credit amounts
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2627](https://github.com/chester-hill-solutions/callcaster/issues/2627) Use route-navigation semantics for campaign sections
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2626](https://github.com/chester-hill-solutions/callcaster/issues/2626) Group identical calling hours in the collapsed campaign summary
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2625](https://github.com/chester-hill-solutions/callcaster/issues/2625) Show successful script validation without a full-height sheet
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2624](https://github.com/chester-hill-solutions/callcaster/issues/2624) Upload campaign audio inline beside the audio selector
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2623](https://github.com/chester-hill-solutions/callcaster/issues/2623) Use the shared resource empty state for Surveys
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2622](https://github.com/chester-hill-solutions/callcaster/issues/2622) Align the account menu with the CHS dropdown menu contract
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2621](https://github.com/chester-hill-solutions/callcaster/issues/2621) Connect survey question controls to labels and name their actions
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2620](https://github.com/chester-hill-solutions/callcaster/issues/2620) Give Call History filters persistent labels and shared field layout
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2619](https://github.com/chester-hill-solutions/callcaster/issues/2619) Show one empty state when searching an empty Contacts list
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2618](https://github.com/chester-hill-solutions/callcaster/issues/2618) Use the shared field validation contract for a new chat recipient
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2617](https://github.com/chester-hill-solutions/callcaster/issues/2617) Use CHS action variants for contact custom fields
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2616](https://github.com/chester-hill-solutions/callcaster/issues/2616) Give contact search and its clear button explicit accessible names
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2615](https://github.com/chester-hill-solutions/callcaster/issues/2615) Use the shared flat page composition for inbound queue settings
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2613](https://github.com/chester-hill-solutions/callcaster/issues/2613) Use a responsive single-number editor in the advanced settings sheet
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2612](https://github.com/chester-hill-solutions/callcaster/issues/2612) Reduce the team role indicator and keep member rows within the available width
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2611](https://github.com/chester-hill-solutions/callcaster/issues/2611) Close workspace navigation after selecting a page on mobile
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2610](https://github.com/chester-hill-solutions/callcaster/issues/2610) Respect the number-only setup goal on workspace home
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2609](https://github.com/chester-hill-solutions/callcaster/issues/2609) Show the verified caller ID in onboarding number review
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2608](https://github.com/chester-hill-solutions/callcaster/issues/2608) Align onboarding country selection with the CallCaster Select control
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2607](https://github.com/chester-hill-solutions/callcaster/issues/2607) Use CallCaster radio controls for onboarding goal selection
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2569](https://github.com/chester-hill-solutions/callcaster/issues/2569) Evaluate shadcn AI Elements for Chats
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2603](https://github.com/chester-hill-solutions/callcaster/issues/2603) SMS Exports should have "external_id" and/or all contact fields not just contact name
- Status: Backlog · Labels: ux, business-logic · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2599](https://github.com/chester-hill-solutions/callcaster/issues/2599) Use Text to speech wording for IVR playback
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2598](https://github.com/chester-hill-solutions/callcaster/issues/2598) Unify page order and start-page selection
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2597](https://github.com/chester-hill-solutions/callcaster/issues/2597) change(script-builder): rename "Radio" to Single Select and "Select" to "Dropdown"
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2591](https://github.com/chester-hill-solutions/callcaster/issues/2591) Add input blocks to IVR scripts
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2590](https://github.com/chester-hill-solutions/callcaster/issues/2590) Unify IVR and live-call script blocks
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2520](https://github.com/chester-hill-solutions/callcaster/issues/2520) call interface button spacing is messy
- Status: Backlog · Labels: design · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2521](https://github.com/chester-hill-solutions/callcaster/issues/2521) call interface doesn't need the background card
- Status: Backlog · Labels: design · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2533](https://github.com/chester-hill-solutions/callcaster/issues/2533) show caller how long theyve been calling for somewhere (agent request)
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2546](https://github.com/chester-hill-solutions/callcaster/issues/2546) Audience imports create duplicate workspace contacts and block or duplicate SMS
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2516](https://github.com/chester-hill-solutions/callcaster/issues/2516) Users with "Agent" role shouldn't see compliance status info on the today page
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-10-09
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2506](https://github.com/chester-hill-solutions/callcaster/issues/2506) CSV Upload split name confirmation on final step is weird since it gets set on the previous step
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-10-09
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2502](https://github.com/chester-hill-solutions/callcaster/issues/2502) Toasts being persistent is probably a misuse of the design pattern
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-09
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2497](https://github.com/chester-hill-solutions/callcaster/issues/2497) Investigate Add audio hit-target failures in touch-emulated Chrome
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2496](https://github.com/chester-hill-solutions/callcaster/issues/2496) Browser smoke tests assume desktop navigation and script controls
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2495](https://github.com/chester-hill-solutions/callcaster/issues/2495) API docs show two notices for one Copy link click
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2494](https://github.com/chester-hill-solutions/callcaster/issues/2494) Empty sign-in fields produce a temporary-failure message
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2472](https://github.com/chester-hill-solutions/callcaster/issues/2472) Limit public docs to supported public API surfaces
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-07
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2303](https://github.com/chester-hill-solutions/callcaster/issues/2303) Extract safe-outbound-url to a shared package — three repos now need it, and two have written their own half
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-03
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
