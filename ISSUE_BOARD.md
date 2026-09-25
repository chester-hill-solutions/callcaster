# CallCaster — Open Issue Board for Agents

Reviewed at `dev@94da47f5` · 187 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

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

## Fix now — 26

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#1885](https://github.com/chester-hill-solutions/callcaster/issues/1885) Rewrite Supabase-auth RPCs, then drop the legacy auth schema
- Verdict: **Fix now** · Size: M-L · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-21
- Recommended title: **Rewrite the two live auth.uid() RPCs, drop get_outreach_attempts, then drop schema auth**
- Not a Supabase dependency: the only auth survivors are our own shim. auth.uid() is defined by drizzle/0001_auth_uid_shim.sql; auth.jwt() has no shim, so get_outreach_attempts is dead. The only live RPCs using auth.uid() are select_and_update_campaign_contacts and update_user_workspace_last_access_time, both called inside withAppCurrentUser. Chunks 1-2 shipped on dev (PR #1966 16445ca1): get_outreach_attempts dropped, the two live auth.uid() RPCs rewritten to app.current_user_id. Chunk 3 (fail-closed guard + DROP SCHEMA auth) remains.
- Current behavior: Public RPCs still reference auth.uid()/auth.jwt(); schema auth cannot be dropped. get_outreach_attempts is dead.
- Root cause: Legacy Supabase-era definitions survive in the Drizzle baseline and the auth.uid() shim was never rewritten onto the v2 app.current_user_id identity.
- Resolution: Chunk 1: migration dropping public.get_outreach_attempts, remove its KEEP entry, wire into both bootstrap step lists. Chunk 2: rewrite the two RPCs to nullif(current_setting('app.current_user_id', true), '')::uuid. Chunk 3: fail-closed guard raising while any non-auth function or public policy still matches auth., then DROP SCHEMA IF EXISTS auth CASCADE. Retire or guard drizzle/0001_auth_uid_shim.sql.
- Look in: `app/lib/db-rpc.server.ts`, `drizzle/0001_auth_uid_shim.sql`, `drizzle/0000_baseline.sql`, `client/migrations/20260807130000_manual_dial_claim_attempt_count.sql`, `client/migrations/20260715140000_drop_legacy_rls.sql`, `scripts/db/check-db-orphans.mjs`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`
- Existing tests: test/queue-rpc-contract.test.ts; test/db-rpc-claim-queue-entry.test.ts; test/db-rpc-outreach-attempt.test.ts; test/atomic-manual-dial-claims.integration.test.ts
- Missing tests: test/legacy-auth-sql-guard.test.ts - latest CREATE OR REPLACE per public function has no auth.uid()/auth.jwt(); test/integration-db/manual-dial-claim-actor.test.ts - claim RPC assigns the withAppCurrentUser actor; test/queue-rpc-contract.test.ts latest-definition resolver must pick the new migration
- Done when: No public function or policy references auth.*; The two RPC flows still pass their tests; DROP SCHEMA auth succeeds on dev, then prod; A fresh bootstrap does not recreate auth.uid()
- Tracker: Keep in Fix now, split into the three PR-sized chunks. Run the zero-auth.* dependency query on prod before the drop and keep the rewrite and the drop in separate releases.

### [#2048](https://github.com/chester-hill-solutions/callcaster/issues/2048) campaign complete is judged from local queue state, not Twilio send status — unsettled SMS must block completion
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **Block SMS campaign completion while messages are unsettled at Twilio**
- try_complete_campaign_if_drained gates completion on campaign_queue_has_pending_work + campaign_has_unsettled_calls — calls only. Message campaigns complete the instant the last queue row is dequeued, even with thousands of message rows still queued/sending at Twilio. Dequeue == handed-to-Twilio, not delivered. Lombardi (2026-09-24): 23,504 sends, 6,904 with provider error codes; export needed status reconciliation. Twilio open-sync already reconciles OPEN_MESSAGE_STATUSES (accepted/scheduled/queued/sending) — completion must run it and only then complete.
- Current behavior: SMS campaign flips to 'complete' when campaign_queue has no pending rows, regardless of unsettled message rows at the provider.
- Root cause: campaign_has_unsettled_calls (added #1728/#2028 for IVR) has no message counterpart; campaign_queue_has_pending_work considers a row done at dequeue time.
- Resolution: Add campaign_has_unsettled_messages(campaign_id) gating completion on non-terminal message statuses (OPEN_MESSAGE_STATUSES). Run twilio-open-sync before re-checking so no-terminal-callback messages are resolved/failed, not silently counted done. Keep IVR path unchanged. Route the dequeue-completion helpers through the settled gate.
- Look in: `client/migrations/20260922120000_gate_campaign_completion_on_settled_calls.sql`, `app/lib/twilio-open-sync.server.ts`, `app/lib/sms-status.ts`, `app/lib/campaign-queue-completion.server.ts`, `app/lib/worker/handlers/campaign.server.ts`
- Missing tests: integration: message row still queued => campaign not complete; integration: all settled (delivered/failed/undelivered) => complete; open-sync resolves a no-callback message to failed, then completion proceeds
- Done when: SMS campaign with queued/sending messages is not complete; Settled campaign completes normally; No-callback messages resolved by open-sync, don't block forever; IVR completion unchanged
- Tracker: Fix now; direct corollary of #1728's call gate, evidenced by the Lombardi blast statuses.

### [#1873](https://github.com/chester-hill-solutions/callcaster/issues/1873) record every call and IVR
- Verdict: **Fix now** · Size: L · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-19
- Recommended title: **Call recording: workspace recording policy + campaign opt-in, wired into IVR/predictive/test dials**
- Recording pipeline EXISTS for agent/handset calls: Twilio <Dial record='record-from-answer'> + recordingStatusCallback=/api/recording (call.action.server.ts:100-105), webhook persists recording_url (recording.action.server.ts:27-85), worker downloads MP3 to Railway Bucket workspaceAudio/{ws}/recording-{sid}.mp3 (call-recording-storage.server.ts) and optionally (flag batchTranscription, default OFF) transcribes via ElevenLabs Scribe (ADR-0029, 1 credit/call). IVR (ivr-dispatch/ivr-initiate), test calls, predictive (auto-dial), and ACD inbound are NEVER recorded. No workspace or campaign recording column/toggle exists; no disclosure text anywhere.
- Current behavior: Only manual/agent dials record+PERSIST. dial/$number and connect-campaign-conference set Twilio record WITHOUT the /api/recording callback -> orphaned recordings (see filed bug). All calls.create dials (IVR dispatch 237-244, test call 101-108, ivr-initiate 66-73, ivr.action 78-85, auto-dial 59-66, auto-dial-start 122-126, acd-router 215-223) never set record.
- Root cause: Recording was built bespoke for agent calls only; the policy/opt-in model and the other dial families were never wired.
- Resolution: Phase 1 (policy+opt-in): add workspace flag `callRecordingPolicy` (feature_flags, zero-migration, mirrors batchTranscription) + `campaign.record_audio boolean default false` (schema-campaign.ts + migration + Tables<campaign>). CampaignVoiceSettings toggle beside voicemail-drop (45-59), disabled unless policy on. Save path auto-flows new columns (settings.action -> updateCampaign). Phase 2 (wiring): set record-from-answer + /api/recording + completed events on IVR dispatch/test-call/ivr-initiate/ivr.action and predictive callee leg (auto-dial server.ts:59-66); worker resolves call by CallSid (auto-dial row created 397-424). Conference-level recording needs conference-SID -> call resolution (findCallsByConferenceId) + dedupe vs recording_side_effects key. Fix the 2 dead-recording sites. Phase 3 (disclosure, decision): add spoken 'call may be recorded' disclosure at IVR page top, conference join, and live-dial TwiML; optional reuse of unused disclosureEnabled coaching config; jurisdiction gate decision - hooks: recipientCallingWindowStatus (TCPA/CRTC), voice_compliance/emergencyVoice, contact.country; NO DID-country exists yet (would need Twilio isoCountry persisted). Batch transcription: if shipping with this, flip/repurpose batchTranscription gate (UNDECIDED policy, default-off).
- Look in: `app/routes/api+/call.action.server.ts`, `app/routes/api+/recording.action.server.ts`, `app/lib/call-recording-storage.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/lib/auto-dial.server.ts`, `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`, `app/db/schema-campaign.ts`, `app/lib/coaching-schemas.ts`
- Existing tests: test/recording.route.test.ts; test/webhook-side-effects.test.ts:445-560; test/call-recording-storage.server.test.ts; test/batch-transcription-gating.test.ts; test/api-call.route.test.ts:106 (dial record attrs)
- Missing tests: dial sites emit record+callback only when policy+opt-in on; call rows for IVR/predictive/test calls have audio_url after runRecordingSideEffects; conference recording resolves call + dedupes; disclosure spoken on gated paths
- Done when: Workspace policy + per-campaign opt-in exist and gate recording; IVR/predictive/test calls record and persist (audio_url) when opted; Dead recording sites fixed; One-party-consent disclosure decision recorded before default-on
- Tracker: Fix now. Split into: (1) policy + campaign opt-in + agent-dial wiring, (2) IVR/predictive/test wiring + dead-site fixes, (3) disclosure + jurisdiction decision before default-on. #1844 UI playback already exists.

### [#2058](https://github.com/chester-hill-solutions/callcaster/issues/2058) Rule and inventory: inline error text used where a toast belongs
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Split out of #2014. The sign-in page fix is small and stayed there; the codebase-wide sweep is a different size and risk. Inline error text is not a bug by default: it is correct when the error is about the field the user is looking at, and wrong when it is about something that happened elsewhere. Deciding that per site is a rule plus an inventory, not a find-and-replace.
- Current behavior: The codebase mixes both patterns. AGENTS.md names toast() from sonner as the single pattern, but inline error text is still used in places where the failure is page-level rather than field-level.
- Root cause: No written rule distinguishing field-level from page-level error presentation, so each site was decided locally.
- Resolution: Deliver three things, in order. (1) A rule, stated once, in a place a contributor will actually find it: an error about the value in a specific input belongs next to that input; an error about a page-level action — submitting, saving, loading — belongs in a toast. (2) An inventory of every site that renders an error inline, each marked keep-or-change with a one-line reason. (3) A separate list of pages that show the same failure twice, once inline and once as a toast, which is a distinct defect from either alone. Land the inventory before any changes, so a later diff is reviewable.
- Look in: `AGENTS.md (design-system section)`, `app/components/ui/`, `app/components/**/Form*.tsx`, `app/routes/**`
- Missing tests: no test asserts the error-presentation rule, which is itself a finding
- Done when: A written rule exists where a contributor will find it; Every inline error site is listed with a keep-or-change verdict and a reason; Pages rendering the same failure twice are identified; Changes, if any, land in reviewable batches after the inventory, not mixed into it; No form validation is removed in the name of consistency
- Tracker: Do the rule and the inventory first, and stop there if that is all the time there is. The inventory is the deliverable; without it, any change is unreviewable because a reviewer cannot tell whether a removed inline error was deliberate.

### [#2049](https://github.com/chester-hill-solutions/callcaster/issues/2049) Twilio's send time is fetched by the recovery sweep and thrown away — message.date_sent is NULL for every outbound message
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **Persist Twilio's send time: the recovery sweep fetches dateSent and discards it**
- The only automated source of the provider send time is the Twilio Message Resource, and the recovery sweep already reads it. app/lib/twilio-open-sync.server.ts:44 declares dateSent on ProviderMessage, :49 uses it only as a sort fallback, and the row write at :312-317 persists status/date_updated/error_code while omitting date_sent. Result: message.date_sent is NULL for all 23,503 outbound rows of the Lombardi blast. Joining a raw Twilio log export showed a gap of 378.6-464.7 minutes between our date_created and Twilio SentDate, median 439.8. CORRECTED PREMISE: the Twilio status callback does NOT carry a send timestamp (docs: 'MessageSid along with the other standard request parameters as well as MessageStatus and ErrorCode'), and the create response is null because a new message is still queued, so neither webhook nor send path can supply it.
- Current behavior: A campaign message row never carries the provider-reported send time. The value is in memory at the moment of the sweep's row write and is discarded.
- Root cause: The sweep's write was built to drive status, date_updated and billing side effects. date_sent was never added to it, and OPEN_MESSAGE_STATUSES (accepted/scheduled/queued/sending) excludes every settled state, so a message that settles before the sweep observes it is never re-selected.
- Resolution: Add date_sent to the existing updateMessageBySid call in twilio-open-sync.server.ts, writing remote.dateSent when present. Because the open-row sweep can never revisit a message that already settled, add a second bounded selection for rows with date_sent IS NULL in a settled status, oldest first, self-limiting once filled, and age-bounded so a message with no provider dateSent is abandoned instead of re-selected forever. Reuse the existing list prefetch and the canonical updateMessageBySid path. Never overwrite an existing date_sent and never infer it from date_created. Then surface send time separately from request time in the export (#1752).
- Look in: `app/lib/twilio-open-sync.server.ts:44,49,233-319`, `app/lib/message-db.server.ts:202-249`, `app/lib/worker/job-params.server.ts:52-56`, `app/lib/worker/handlers/cron.server.ts:73-107`, `app/db/schema.ts:390-420`, `app/lib/campaign-export.server.ts`
- Existing tests: test/twilio-open-sync.server.test.ts; test/message-db.server.test.ts; test/sms-status-webhook.test.ts
- Missing tests: the open-row path writes date_sent; the settled-row backfill writes date_sent; a filled row is not re-selected; an existing date_sent is not overwritten; a message with no provider dateSent is abandoned after the age bound
- Done when: Message row carries the provider-reported date_sent after the sweep runs; Messages that settle before any sweep observed them still receive a date_sent; A message with no provider dateSent is abandoned after the age bound, not re-selected forever; date_sent is never overwritten once written and never inferred from date_created; Backfill selection is bounded, self-limiting, and its cost is measured; Export can show send time separately from request time
- Tracker: Fix now. Audit trail for the #2048 settlement gate: that gate knows a message settled but not when. The one-line write is NOT sufficient on its own — verified that the open-row sweep can never revisit an already-settled message, so without the backfill selection the fix would appear to work while leaving the Lombardi data unfixed.

### [#2046](https://github.com/chester-hill-solutions/callcaster/issues/2046) inbound SMS replies cannot be attributed to a campaign
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **Attribute inbound SMS replies to a campaign**
- Inbound message rows store only contact_id — campaign_id is always NULL (app/routes/api+/inbound-sms.action.server.ts inserts the row without it, lines 164-186). Production evidence: Eric Lombardi workspace, 1,273 inbound replies all campaign_id=NULL, attributed at query time via contact overlap (reply_to_campaign_ids). Works for single-blast campaigns but is a heuristic: a contact blasted by 2 campaigns same day is assigned to both.
- Current behavior: Inbound SMS webhook resolves workspace + contact by caller number but never sets campaign_id; exports/lookup reconstruct attribution by contact-vs-outbound joins.
- Root cause: The inbound write path knows only the contact (matched by From number); the outbound path knows its queue/campaign at dispatch. No conversation/thread link is written on the inbound row.
- Resolution: Option 1 (recommended): in the inbound handler, after contact match, look up the most recent outbound message for that contact + same messaging_service_sid within a short window and copy campaign_id (latest-send-wins, expose ambiguity). Option 2: formalize the contact-overlap join in campaign-export-db.server with documented precedence. Option 3: thread via outreach_attempt_id. Export must list reply_to_campaign_ids + document precedence; STOP dequeues must not regress.
- Look in: `app/routes/api+/inbound-sms.action.server.ts`, `app/lib/campaign-export.server.ts`, `app/lib/campaign-export-db.server.ts`, `app/db/schema.ts (message table)`
- Missing tests: Inbound handler unit test: reply after a single-blast campaign attributes exactly that campaign; Export test: reply_to_campaign_ids deterministic for multi-blast contacts; precedence documented
- Done when: Single-blast reply attributed to exactly that campaign; Export lists replies with deterministic reply_to_campaign_ids + documented precedence; STOP/opt-out dequeue unaffected; Attribution covered by a test
- Tracker: Fix now. Needed by #1498 reply-conversation sections; v2 (#1272/#1268) will replace via interaction_endpoint correlation.

### [#2032](https://github.com/chester-hill-solutions/callcaster/issues/2032) Replace invite-accepted query banner with a session flash toast
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-23
- Recommended title: **Invite acceptance shows a persistent, replayable inline banner instead of a one-time success toast**
- The issue is fully specified and its premise checks out. Accepting an invite redirects to /workspaces?invite=accepted at two sites (app/routes/accept-invite.action.server.ts:58 and :183) and app/routes/workspaces+/index.tsx:272-280 renders that parameter with QueryParamBanner, which draws a dismissible <Alert> (app/components/shared/QueryParamBanner.tsx:43-56). Two consequences: the success state replays on every refresh or revisit because it lives in the URL, and this one redirect-only success uses a different feedback surface from the toast.success paths the rest of the app uses. One extra finding: the banner is an Alert, so it carries role="alert" and is picked up by app/lib/flash-telemetry.client.ts, which beacons every role=alert surface to /api/workspaces/:id/client-flash as an error-flash event. A successful invite acceptance is currently logged as an error flash.
- Current behavior: A dismissible inline banner on the workspaces page, backed by a shareable URL that reproduces it indefinitely.
- Root cause: One-time state is being carried in a shareable URL because there is no server-owned flash mechanism to carry it instead. AGENTS.md names toast() from sonner as the single feedback pattern and a single root Toaster already exists (app/root.tsx:123), so the app has the right tool and the wrong transport.
- Resolution: Implement the five steps in the issue body; they are sound. Add a small server-only flash helper: a signed, HttpOnly, SameSite=Lax cookie scoped to /workspaces whose payload is an allow-listed identifier (invite_accepted), never arbitrary text. In accept-invite.action.server.ts set it in BOTH redemption paths and redirect to the clean /workspaces, APPENDING the Set-Cookie to the existing Better Auth headers rather than replacing them (replacing them drops the session cookie created during sign-up). In app/routes/workspaces+/index.loader.server.ts read and validate the flash, return a typed flash value, and append a clearing Set-Cookie whether the workspace load succeeds or fails, so it is one-time even on error. In index.tsx consume it with toast.success in an effect guarded against a double render. Update the assertion at test/accept-invite.route.test.ts:172, which currently expects Location /workspaces?invite=accepted. Leave QueryParamBanner itself unchanged — other routes use it.
- Look in: `app/routes/accept-invite.action.server.ts:58 and :183 (the two redirects to /workspaces?invite=accepted)`, `app/routes/workspaces+/index.tsx:272-280 (the QueryParamBanner invite configuration)`, `app/components/shared/QueryParamBanner.tsx:16-57 (unchanged by this issue; note the Alert inside it)`, `app/routes/workspaces+/index.loader.server.ts:32-72 (where the flash is read and cleared)`, `app/lib/flash-telemetry.client.ts (beacons role=alert surfaces, so the success banner is logged as an error flash today)`, `app/root.tsx:123 (the single root Toaster, so no infrastructure change is needed)`
- Existing tests: test/accept-invite.route.test.ts:172 (asserts the current redirect URL and must be updated)
- Missing tests: both redemption paths redirect to /workspaces with no invite parameter; both redemption paths set the allow-listed flash cookie AND preserve the Better Auth Set-Cookie headers (the regression that would silently break sign-up); the loader returns the flash once and the response clears the cookie; the cookie is cleared even when the workspace load throws; a malformed, expired or unknown flash payload is ignored, the cookie is cleared, and no user content reaches the client; the client effect calls toast.success exactly once for one loader payload (guards a revalidation double-fire); no inline invitation banner remains on /workspaces; the flash identifier and its message stay server-owned allow-listed values
- Done when: Invite acceptance shows a one-time success toast, not an inline banner; The redirect URL no longer carries invite=accepted, and refreshing it does not reproduce the message; The Better Auth session cookie survives the redirect in both redemption paths; An unknown, malformed or expired flash payload produces no client-visible output and is still cleared; A loader revalidation does not fire the toast twice; The success banner stops being reported to client-flash as an error flash; No support, analytics or e2e flow still depends on ?invite=accepted (checked before removal)
- Tracker: Fix now — the issue is a complete spec that survives review. Medium risk for one reason: the Set-Cookie merge on the sign-up path, where getting it wrong logs the new user out silently. The two-tab flash duplication the issue lists is an accepted cookie-flash limitation; record it in the test as a known bound rather than trying to solve it.

### [#1728](https://github.com/chester-hill-solutions/callcaster/issues/1728) IVR was marked as complete before the recipient actually received their dial
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- Recommended title: **IVR: don't mark a campaign complete while calls are still in flight**
- Confirmed defect. IVR dispatch dequeues each queue row right after Twilio calls.create (campaign-ivr-dispatch.server.ts:260-264) and completion fires whenever campaign_queue_has_pending_work is false, so the campaign flips to 'complete' while calls are still ringing. Product decision (2026-09-20): 'complete' means all calls settled, not all dials attempted.
- Current behavior: Campaign status turns 'complete' seconds after launch; the recipient's phone rings / the call arrives afterwards. The dequeue reason string 'IVR call completed' is factually wrong.
- Root cause: dequeued_at is written at dial time, not at call completion, while completion keys only off pending queue rows and never checks in-flight (non-terminal) calls.
- Resolution: Gate completion on no pending queue rows AND no non-terminal calls: teach try_complete_campaign_if_drained / continueOrCompleteDispatch to check for in-flight campaign calls, or defer the IVR dequeue to the terminal status callback in api+/ivr/status.action.server.ts (larger; needs a timeout sweep for missing callbacks). Update the existing 'dequeues on success' test that encodes the current behaviour.
- Look in: `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/lib/campaign-queue-completion.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/routes/api+/ivr/status.action.server.ts`, `drizzle/0000_baseline.sql`
- Existing tests: test/campaign-ivr-dispatch.test.ts; test/campaign-dispatch-worker.test.ts; test/ivr-status.route.test.ts; test/campaign-queue-throughput.integration.test.ts
- Missing tests: Campaign is not marked complete while it has a non-terminal call; A terminal status callback completes the campaign only after all calls settle; Replace the 'dequeues on success' assertion with acknowledgment-on-completion semantics
- Done when: Campaign status does not read 'complete' while any campaign call is still in flight; Completion happens after the last call reaches a terminal status; No stalled campaign when a status callback never arrives
- Tracker: Product decided complete = all calls settled. Fix now via the completion gate.

### [#2047](https://github.com/chester-hill-solutions/callcaster/issues/2047) warn when a message campaign has no end time on its send window (unrestricted sending)
- Verdict: **Fix now** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **Warn when a message campaign has no end time on its send window**
- A message campaign with sms_send_window = null dispatches unrestricted (smsSendPolicy allowedWithoutSchedule: true) — the readiness gate comments 'null = unrestricted (send anytime) — no issue' (campaign-readiness.ts:479), so there is zero warning before an overnight blast. Proven in production: all Eric Lombardi message campaigns had sms_send_window = null yet carried a voice schedule (13:00-01:00) that SMS dispatch ignores; sends ran 18:30-22:29 UTC and replies/STOPs continued overnight.
- Current behavior: Message campaign with null sms_send_window launches with no warning and sends at any hour; a set-but-ignored voice `schedule` gives false confidence it is restricted.
- Root cause: The readiness gate deliberately treats null send windows as a non-issue, and SMS dispatch never consults `campaign.schedule` (voice field). Interval end-times that are missing/malformed are silently dropped by parseSendWindow.
- Resolution: Emit an unrestricted-send warning issue in campaign-readiness.ts when type=message and sms_send_window is null/empty (warn, not block). When sms_send_window is null but `schedule` is set, state the voice schedule does not gate SMS. Flag active days with start but missing/malformed end via getScheduleValidation (don't silently drop). Optionally reuse sendWindowQuietHoursOverlap for an inline overnight warning in Schedule editor.
- Look in: `app/lib/campaign-readiness.ts`, `app/lib/campaign-dispatch-policy.ts`, `app/lib/campaign-send-window.ts`, `app/components/campaign/settings/basic/CampaignBasicInfo.Schedule.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`
- Missing tests: campaign-readiness: null sms_send_window → unrestricted-send warning; campaign-readiness: null sms_send_window + voice schedule set → same warning; getScheduleValidation: active day with start but missing end flagged
- Done when: No sms_send_window → visible unrestricted-send warning at launch; Voice schedule with null sms_send_window → same warning; Missing/malformed interval end flagged, not dropped; Warning only, no new blocker for legitimately 24/7 campaigns
- Tracker: Fix now; caused night-time sends on the Eric Lombardi blast (2026-09-24).

### [#2041](https://github.com/chester-hill-solutions/callcaster/issues/2041) Feature: admins can manually load credits into a workspace
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-09-24
- Recommended title: **Admins can only grant credits by direct database write; add an audited manual credit load on the admin workspace page**
- A missing feature with a complete design in the issue body, and the named integration points all exist. Today the only way to add credits outside Stripe is a hand-written UPDATE, which bypasses the ledger, the idempotency key and the audit trail. The canonical path is insertTransactionHistoryIdempotent (app/lib/transaction-history.server.ts:70-122), which calls the atomic apply_ledger_entry_and_sync_credits RPC and emits the insert event; the closest existing grant is the workspace welcome bonus at app/lib/database/workspace-provisioning.server.ts:228-244, which is the template to copy. The admin workspace page already uses a tab-per-concern pattern (app/routes/admin+/$workspaceId.route.tsx:47-53 maps URL suffix to tab, with campaigns/invite/twilio/users as index routes), and adminRouteAuth from @/lib/admin-route.server is the auth helper its child actions use (app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts:11). ONE FACTUAL ERROR IN THE ISSUE: it says the grant 'is not attributed to Stripe/SMS/voice buckets in reconciliation (CREDIT rows already bucket as purchase, same as welcome credits)'. bucketFromIdempotencyKey in shared/billing-keys.ts only recognises the stripe and welcome prefixes, and it does NOT include WELCOME_CREDITS_PREFIX at all — welcome credits bucket as 'other', not 'purchase'. A new manual-credit prefix will also bucket as 'other' unless added.
- Current behavior: An admin who needs to goodwill-grant credits or cover an invoice-paid customer has no in-product path; the only recourse is an un-audited direct database write.
- Root cause: The billing ledger was designed around automated, provider-keyed writes. There is no human-initiated grant concept, no key namespace for one, and no UI for one — and the guard that would catch an unsafe write (check:credit-writes, scripts/check-credit-write-paths.mjs) treats any direct workspace.credits write as a violation, which is the correct default and the reason a supported path is needed rather than a bypass.
- Resolution: Implement the three scope items in the issue, with the correction above. (1) shared/billing-keys.ts: add manualCreditLoadKey(workspaceId, nonce) producing a manual-credit:<workspace>:<nonce> key, and add the prefix to bucketFromIdempotencyKey with a deliberate bucket — 'other' is the safe choice since these grants are not a provider charge and must not be reconciled against Twilio usage, and 'purchase' would be wrong for both this key and the existing welcome-credits key. Decide in the same PR whether to fix the welcome-credits prefix while there; it is a one-line classifier addition, and leaving it is how the next reader repeats this error. (2) Admin UI: a Credits index route under app/routes/admin+/workspaces/$workspaceId/ following the existing tab pattern, with adminRouteAuth on the action, amount validated as a positive integer in 1..100000, a required reason, and the insert via insertTransactionHistoryIdempotent with a note naming the admin and the reason. The nonce must be generated per rendered form and carried in a hidden field so a retried submit credits exactly once — generate it server-side in the loader, never client-side, or a double-click produces two grants with two keys. (3) Tests: action validation (0, negative, non-numeric, over the cap), idempotency on a repeated nonce, and the audit note content. The nonce test is the one that matters: without it, the idempotency requirement is unverified.
- Look in: `shared/billing-keys.ts (add manualCreditLoadKey; bucketFromIdempotencyKey is missing WELCOME_CREDITS_PREFIX, so 'already bucket as purchase' is wrong)`, `app/lib/transaction-history.server.ts:70-122 (insertTransactionHistoryIdempotent — the only approved write path)`, `app/lib/database/workspace-provisioning.server.ts:228-244 (the welcome-credit grant to copy)`, `app/routes/admin+/workspaces/$workspaceId.route.tsx:47-53 (tab pattern) and app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts:11-13 (adminRouteAuth + defineAction model)`, `app/lib/admin-route.server.ts (adminRouteAuth) and app/routes/admin+/requireSudoAdmin.server.ts (sudo check)`, `scripts/check-credit-write-paths.mjs (the guard a correct implementation must satisfy; a direct credits write fails CI)`
- Existing tests: test/ledger.test.ts (ledger and idempotency coverage); test/billing-keys*.test.ts if present (run the shared billing-keys unit test the issue asks for alongside these)
- Missing tests: amount 0, negative, non-numeric and over 100000 are each rejected with a distinct, clear message; a repeated submit with the same nonce credits exactly once (this is the idempotency requirement and currently has no test); two different nonces for the same admin and workspace each credit, so the key is not accidentally constant; the ledger note names the acting admin and the reason; the grant appears in the workspace transaction history and in the admin credits list; a non-sudo admin is refused; the resulting row is not picked up as a provider charge by the billing reconciliation mapper (the classification correction)
- Done when: A sudo admin can grant credits to any workspace from the admin page, and the balance updates on refresh; The grant is written through insertTransactionHistoryAndSyncCredits-equivalent RPC path only; no direct workspace.credits write and check:credit-writes stays green; A retried submit with the same nonce credits exactly once; Invalid amounts are rejected with a clear message and nothing is written; The ledger row shows type CREDIT, a positive amount, and a note naming the admin and the reason; The grant's bucket is decided deliberately and documented, and the welcome-credits prefix classification is corrected in the same change; npm run ci:local is green, including the codegen and surface checks
- Tracker: Fix now. It is a small, well-specified gap with a real operational need and no live defect to reproduce. Risk is medium because it moves money: the nonce must be server-generated (a client-generated nonce makes a double-click grant twice and the idempotency test will not catch it if the test also uses a client-style nonce), and the bucket decision in the issue is wrong as written. Split the bucket-classifier correction into its own line of the PR so it is reviewable, and do not bundle invoice or offline-payment flows.

### [#2005](https://github.com/chester-hill-solutions/callcaster/issues/2005) Quit this workspace button doesn't work. Remove the button entirely it's not needed
- **IN PROGRESS** · Verdict: **Fix now** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **Quit This Workspace posts a self-leave that always 403s for the role it is shown to; remove the button and the self-leave path behind it**
- Confirmed and already investigated in detail by sai-sy in the issue comments. The two visible forms (app/routes/workspaces+/$id/settings.route.tsx:167-183 and app/components/workspace/TeamMember.tsx:220-228) both post formName=deleteSelf with user_id set to the actor's own id, which routes through app/routes/workspaces+/$id/settings.action.server.ts:104-106 to handleDeleteSelf (app/lib/workspace-settings/WorkspaceSettingUtils.server.ts:125-156) and on to removeWorkspaceMember(actor, workspaceId, actor). requireMemberManager returns { ok:false, error:'Not authorized', status:403 } for a `caller` (app/lib/platform-members.server.ts:71), and the settings loader only shows the button to callers (hasAccess = userRole !== MemberRole.Caller, app/lib/workspace-settings-db.server.ts:69). So the button is offered to exactly the one role for which it can never work.
- Current behavior: A caller sees a red 'Quit This Workspace' button on the settings page; pressing it fails with a 403 that the page renders as an error.
- Root cause: deleteSelf was never a domain operation — it is a thin adapter over member removal — and member removal is a management-of-others operation. Because it exists as a named intent, the UI could offer it to a role the underlying service forbids, and the same intent is reachable through the public member-delete endpoint, where a same-rank actor can currently target their own user_id.
- Resolution: Follow the six steps in the issue comment, which are correct and complete. Remove both forms and the `deleteSelf` cases (settings.action.server.ts:76 and :104, and admin invite.action.server.ts:35) and delete handleDeleteSelf. Then close the undocumented API self-leave hole: make removeWorkspaceMember reject actorId === targetId with a clear 403 in app/lib/platform-members.server.ts, so the operation is unambiguously about managing other members. Update the member-delete description in app/lib/openapi-platform.ts:406+ to say self-removal is unsupported and regenerate openapi/public-api.json (ci:codegen:verify will fail otherwise). Do NOT add a migration and do NOT touch owner transfer, invite cancellation, or platform-admin removal — the comment identifies each as a separate operation and they must stay separate. The comment's named follow-up (member-side invite cancellation not verifying the invite belongs to the workspace) is out of scope here; file it separately rather than folding it in.
- Look in: `app/routes/workspaces+/$id/settings.route.tsx:167-183 and app/components/workspace/TeamMember.tsx:220-228 (the two forms)`, `app/routes/workspaces+/$id/settings.action.server.ts:76,104-106 and app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts:35-36 (the three deleteSelf dispatch sites)`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts:125-156 (handleDeleteSelf)`, `app/lib/platform-members.server.ts:53-75 (requireMemberManager, the 403 at :71) and :440-475 (removeWorkspaceMember, where the self-target guard belongs)`, `app/lib/workspace-settings-db.server.ts:67-75 (hasAccess, why only callers see the button)`, `app/routes/api+/workspaces+/$workspaceId/members.action.server.ts:161-194 and app/lib/openapi-platform.ts:406+ (the API self-leave path and its description)`
- Existing tests: e2e/specs/rbac.spec.ts:24-28 (RBAC-03 asserts the button IS visible for callers — this assertion must be inverted or removed); test/workspace-setting-utils.test.ts:214-233 (handleDeleteSelf coverage — remove with the function)
- Missing tests: removeWorkspaceMember returns 403 when actorId === targetId, for caller, member, admin and owner; an owner with another owner present still cannot self-remove through the member endpoint; a manager can still remove a different member (the permitted path must stay green); owner transfer still works after the guard is added; invite cancellation still works after handleDeleteSelf is deleted; platform-admin member removal still works; the OpenAPI description states self-removal is unsupported, and the generated openapi/public-api.json matches (ci:codegen:verify)
- Done when: No Quit This Workspace form renders anywhere; The deleteSelf intent is gone from all three actions and handleDeleteSelf no longer exists; Member removal refuses a self-target with a clear 403 for every role; Removing a different member, owner transfer, invite cancellation and platform-admin removal are unchanged; The OpenAPI description and the generated spec state that self-removal is unsupported; The e2e RBAC-03 assertion that the button is visible is removed, and the invite-authorization follow-up is filed as its own issue
- Tracker: Fix now. The investigation is already done and the plan is exact, so this is a small implementation with a known test surface. Risk is medium because it deliberately breaks an undocumented API behaviour — that is the intent of the issue, but say so in the PR so a reviewer does not read it as a regression. The invite-authorization gap the comment found should be filed as a separate issue now, while the context is fresh.

### [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) sign in page error says "We couldn't sign you in, Try again shortly" when it could/should just bubble up the internal error
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- Recommended title: **auth pages: sign-in hides the real error behind "We couldn't sign you in, Try again shortly"**
- A failed sign-in shows generic reassurance instead of the actual failure. The logged error is specific and actionable — loginWithPassword failed [APIError: Invalid email or password] { status: UNAUTHORIZED, body: { message: Invalid email or password, code: INVALID_EMAIL_OR_PASSWORD } } — so the operator loses the one thing that distinguishes a typo from an outage. Grouped under the auth-pages epic (#2057) but independent of the layout work.
- Current behavior: Every sign-in failure renders the same message regardless of cause.
- Root cause: The route catches the auth error and substitutes a fixed string, discarding the code and message the provider returned.
- Resolution: Surface the underlying error through the toast pattern, mapped to something a person can act on: a wrong password or unknown email reads as a credentials problem, an outage or a rate limit reads as a temporary failure worth retrying. Keep the distinction the provider already makes — INVALID_EMAIL_OR_PASSWORD and UNAUTHORIZED are different situations and collapsing them is what made this confusing. Do not leak the raw provider payload to the UI; map it.
- Look in: `app/routes/account.sign-in.action.server.ts`, `app/routes/account.sign-in.*`, `app/lib/auth-layout.server.ts`
- Missing tests: invalid credentials render a credentials-specific message; a provider outage renders a retryable message, not a credentials one
- Done when: The UI distinguishes invalid credentials from a provider outage or rate limit; A wrong password no longer reads as a generic temporary failure; The raw provider payload is mapped, not passed through to the user; The error is surfaced through the toast pattern, not inline text
- Tracker: Independent of the layout work in #2057, so it can go in parallel. The lowest-risk high-value item in the cluster, because it is pure diagnosis and needs no design decision. Watch the security review angle: this is the one item where a wrong fix leaks information.

### [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) Improve IVR speech capture: hints, valid speech model, confidence, intent matching
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-19
- Recommended title: **IVR: store speech answers as { value, raw, inputType } (slice B)**
- Slice A shipped on dev in PR #1876 (642f4ee7, not in master). Slice B has not shipped: ivr-webhook-auth.server.ts returns only a bare userInput and never reads Confidence; ivr-results.ts normalizeAnswer returns a bare string. Confidence is deferred to #1880, so slice B is the { value, raw, inputType } shape only.
- Current behavior: outreach_attempt.result stores a bare transcript string; readers unwrap only strings; Twilio Confidence is discarded.
- Root cause: The response parser collapses Digits/SpeechResult into one string and drops Confidence.
- Resolution: Add IvrStoredAnswer + isIvrStoredAnswer + ivrAnswerValue to app/lib/ivr-results.ts; parse Confidence in ivr-webhook-auth.server.ts; store answer in the outbound response route; unwrap to .value in outreach-typed-fields.server.ts and campaign-export.server.ts; keep readers accepting the legacy bare string.
- Look in: `app/lib/ivr-results.ts`, `app/lib/ivr-webhook-auth.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`, `app/lib/outreach-typed-fields.server.ts`, `app/lib/campaign-export.server.ts`, `app/components/campaign/home/CampaignHomeScreen/ResultsScreen.IvrResponses.tsx`
- Existing tests: test/ivr-gather.test.ts; test/ivr-block-response.route.test.ts; test/inbound-ivr-block-response.route.test.ts; test/ivr-results.test.ts
- Missing tests: ivr-webhook-auth: digits yields DTMF with no confidence; speech yields the transcript; ivr-results aggregation over the object shape and mixed legacy/new merge; outreach-typed-fields unwraps the object shape; campaign export CSV cell is the value, not [object Object]
- Done when: A vx-any step stores { value, raw, inputType }; Legacy bare strings and new objects both aggregate; Typed fields and CSV export resolve the value; Confidence capture is deferred to #1880
- Tracker: Fix now as slice B in one PR. Keep confidence, intent matching and per-campaign language with #1880 and the #268 epic.

### [#1878](https://github.com/chester-hill-solutions/callcaster/issues/1878) Surface the caller audio selection on the /call welcome dialog (on join)
- Verdict: **Fix now** · Size: M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-19
- Recommended title: **Surface and select the caller audio on the /call welcome dialog**
- The welcome dialog receives voicemail_file as a boolean and only describes the drop in prose. Wants the dialog to show the actual caller audio (machine drop campaign.voicemail_file and agent voice drop campaign.voicedrop_audio) and let the agent change it. Grilling decision: session-only, no campaign write.
- Current behavior: CallScreen.Dialogs.tsx renders prose keyed on a voicemail_file boolean; CallScreen.Layout.tsx:495 passes Boolean(campaign.voicemail_file). Audio Drop posts to /api/audiodrop, which loads campaign.voicedrop_audio server-side; no session override.
- Root cause: The call-loader/Dialogs contract carries booleans and prose only; /api/audiodrop has no override parameter.
- Resolution: Pass campaign voicemail_file and voicedrop_audio strings plus the workspace audio library into the call loader and Dialogs; render the caller audio with a picker; hold the choice in call-screen session state and send it with /api/audiodrop (validate against the workspace library); keep the Setup default.
- Look in: `app/components/call/CallScreen.Dialogs.tsx`, `app/components/call/CallScreen.Layout.tsx`, `app/components/call/CallScreen.CallArea.tsx`, `app/hooks/call/useCallScreen.ts`, `app/routes/workspaces+/$id/campaigns/$campaign_id/call.loader.server.ts`, `app/routes/api+/audiodrop.action.server.ts`
- Existing tests: test/ui/call-screen-dialogs.test.tsx; test/ui/call-screen-callarea.test.tsx; test/audiodrop.test.ts
- Missing tests: dialog shows the configured caller audio name; changing it updates the session value; audiodrop POST carries the session override; default matches the campaign config and no campaign row is written
- Done when: The welcome dialog surfaces the caller audio (name and a way to change it); What is surfaced matches what the dialer actually plays; The choice is session-only and does not write the campaign config
- Tracker: Fix now; session-only per the recorded decision. Relates to #1839 and #1708.

### [#2054](https://github.com/chester-hill-solutions/callcaster/issues/2054) test:ui worker OOMs on test/ui/hooks-chats.test.tsx intermittently, on every branch including master
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- The quality job fails with 'Error: [vitest-pool]: Worker forks emitted error' / 'Worker exited unexpectedly', always on test/ui/hooks-chats.test.tsx. That file never reports: 148 passed (149) and 907 passed (910). test:node passes 431/431 in the same job, so the node tier is unaffected. PROVEN environmental, not either diff: #2048 (PR 2050) and #2049 (PR 2055) are branches off the same origin/dev sharing ZERO application code (2048 rewrites a Postgres completion function; 2049 adds a message write guard), and both fail quality with a byte-identical signature — 148/149 files, 907/910 tests, worker exited unexpectedly. A transitive import walk from hooks-chats.test.tsx reaches none of the changed modules: the file is 163 lines with no application imports at all, only @testing-library/react, vitest, and four vi.mock() calls (logger.client, chats/messaging-client, hooks/utils, react-router).
- Current behavior: A red quality check on unrelated PRs, with a non-deterministic result: bug/2010-auth-page-scrollbar failed at 15:12 and passed at 15:21; bug/2013-auth-form-alignment failed at 15:40 and passed at 15:57, with no code change in between. #2048 failed three times in a row, which looked like a real regression until an unrelated branch failed identically.
- Root cause: Runner memory pressure on the largest file in the UI suite, not a code regression. Two independent controls: (1) master run 36104746387 on 2026-09-25T06:51 passed 149/149 UI files at the base commit these branches are cut from, so the file is passable, and the failures cluster in the 16:00-18:00 window; (2) the same file OOMs reproducibly on a developer laptop at 4.41GB resident with the working tree stashed, i.e. on clean dev with no diff. vitest.ui.config.ts uses pool forks, maxWorkers 2, isolate true; forks isolate address spaces but nothing caps a single worker's heap, and the default ceiling on a 7GB runner is reached before the OS intervenes.
- Resolution: Preferred: set poolOptions.forks.execArgv ['--max-old-space-size=3072'] for the UI config. A deterministic ceiling turns a worker OOM into a readable heap error and keeps the file inside the runner's 7GB; test it against hooks-chats specifically. Better still: find why hooks-chats retains ~4GB (unremoved listeners, unmocked module graph, render loops that never unmount) and get it under its neighbours, since a bigger box hides the cause. Raising the runner is the bluntext option. Triage technique worth reusing: when a red gate might be yours, push any other server-only branch off the same base — if it fails the same way, the environment is the cause. That costs one CI run and settles it.
- Look in: `vitest.ui.config.ts (pool, maxWorkers, isolate)`, `test/ui/hooks-chats.test.tsx`, `test/setup.ui.ts`
- Missing tests: npm run test:ui completes 149/149 on a GitHub-hosted runner; hooks-chats does not kill its worker under memory pressure; stable result on a clean dev checkout with no rerun
- Done when: test:ui completes 149/149 on a GitHub-hosted runner; hooks-chats no longer kills its worker under memory pressure; No rerun needed for a stable result on a clean dev checkout; Any new heap ceiling is documented in vitest.ui.config.ts beside the setting with its reason
- Tracker: Fix now. Repo rule is to rerun before diffing, which is right, but a rerun is not conclusive when the same commit is not deterministic — the auth-form-alignment pair is the proof. The check that settles it is running the BASE commit: master at 149/149. Risk of leaving it is the worst property a gate can have: a red check indistinguishable from a real regression, which trains reviewers to rerun until green. Found while triaging #2050.

### [#2040](https://github.com/chester-hill-solutions/callcaster/issues/2040) Add contact from SMS page doesn't work
- Verdict: **Fix now** · Size: S · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Recommended title: **Add contact from the Messages page silently fails: the form posts workspace, the endpoint reads workspace_id**
- Confirmed defect, three independent causes stacked in one click. (1) Field-name mismatch: app/components/contact/ContactForm.tsx:107 posts a hidden input named `workspace`, but app/routes/api+/contacts.action.server.ts:35 reads `String(data.workspace_id ?? "")` and returns 400 'Workspace ID is required' when it is empty. Every other caller uses the correct name (app/components/queue/ContactSearchDialog.tsx:65 `formData.set("workspace_id", workspaceId)`), so the endpoint contract is `workspace_id` and the shared form is the odd one out. (2) The response is thrown away: ChatAddContactDialog.tsx:67 submits with `navigate: false` and never reads the fetcher result, then calls `setDialog(false)` on line 68 immediately, so a 400 is indistinguishable from success and the sheet just closes. (3) Double submit: the form is a react-router <Form> (ContactForm.tsx:45-51, onSubmit=handleSaveContact, navigate=false) and React Router submits it itself; handleSaveContact then submits the same FormData again by hand, so a successful save POSTs twice.
- Current behavior: The sheet accepts the input, closes, and nothing is created. No toast, no error, no row in the contact list afterwards.
- Root cause: A shared form component and its endpoint disagree on the tenancy field name, and the caller has no feedback path: `navigate: false` with no response handling plus an unconditional close. The route test does not catch it because test/contacts.route.test.ts mocks parseRequestData with an object that already has `workspace_id`, so no test ever exercises the real form field name.
- Resolution: Three changes, one PR. (1) Align the field name: rename the hidden input in ContactForm.tsx:107 to `workspace_id` (and keep `workspace` only if another caller needs it — the two other ContactForm call sites are sign-up forms that do not use this component's hidden field). Audit for any consumer reading `data.workspace` before deleting the old name. (2) Replace the manual `useSubmit` in ChatAddContactDialog with a `useFetcher`, keep the sheet open while the fetcher is submitting, and on settle toast the outcome: success closes the sheet, failure toasts the message the action returned and keeps the sheet open with the typed values intact. Delete the duplicate manual submit so exactly one POST happens per click. (3) Add a route test that posts the real FormData shape the form produces (no parseRequestData mock) and asserts the workspace is resolved, plus a UI test that a failed save keeps the sheet open and toasts.
- Look in: `app/components/contact/ContactForm.tsx:45-51 (Form action/method/navigate) and :107 (hidden input name)`, `app/components/sms-ui/ChatAddContactDialog.tsx:62-69 (submit, navigate:false, unconditional setDialog(false))`, `app/routes/api+/contacts.action.server.ts:35-40 (reads data.workspace_id, 400 on empty)`, `app/lib/request-utils.server.ts:10-20 (parseRequestData does no field-name mapping)`, `app/components/queue/ContactSearchDialog.tsx:65 (the correct workspace_id caller, and the working pattern to copy)`
- Existing tests: test/contacts.route.test.ts (mocks parseRequestData, so it never exercises the real form field name); test/ui/chat-header.test.tsx (nearby chats UI coverage to extend)
- Missing tests: a route test that posts the actual field names the form produces and asserts the contact is created (no parseRequestData mock); a UI test that a failed save keeps the sheet open and surfaces the error instead of closing silently; a UI test that exactly one POST is issued per save click (catches the double submit); a UI test that the sheet closes and the contact appears after a successful save
- Done when: Saving a contact from the Messages sheet creates exactly one contact row; The POST carries the tenancy field the endpoint reads, agreed in one place rather than two; A rejected save keeps the sheet open with the typed values and shows the reason; A successful save closes the sheet and toasts; One click produces one request, verified by a test that counts requests
- Tracker: Fix now. A user-visible feature that has never worked, with a one-line field-name cause and a fully identified cause for the silence. Small, and the fix is testable end to end without a database.

### [#2035](https://github.com/chester-hill-solutions/callcaster/issues/2035) live calling dashboard leave campaign option shouldn't be behind a menu and should have a confirmation modal
- Verdict: **Fix now** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-25
- Recommended title: **Leave Campaign is hidden in the call-screen kebab menu and fires immediately, with no confirmation for an action that hangs up and requeues contacts**
- Both halves confirmed. (1) Visibility: on the live calling dashboard, Leave Campaign lives in the 'Campaign actions' kebab (app/components/call/CallScreen.Header.tsx:282-288, inside the DropdownMenu at :266-290), while the settings-only variant of the same header renders it as a visible destructive button (:143-150). The same action is therefore prominent in one header and buried in the other. (2) No confirmation: app/components/call/CallScreen.Layout.tsx:167-172 wires handleLeaveCampaign straight to hangUp() + device.destroy() + requeueContacts() + navigate(-1), and no confirmation is requested anywhere on the path.
- Current behavior: The only way off a live campaign is two clicks into an overflow menu, and the second click takes effect immediately — ending the call, tearing down the Twilio device, and requeueing the contacts the agent is standing in the middle of.
- Root cause: The top chrome treats Leave Campaign as a low-frequency action (menu item) even though it is the single destructive action available mid-call, and the one sanctioned exit path (#1313) was centralised as a function without a guard at the call site.
- Resolution: Two changes. (1) Surface the action: render a visible destructive Leave Campaign button in the TopChrome action row (app/components/call/CallScreen.Header.tsx, the flex row at :264) instead of only as a DropdownMenuItem, and keep Report Issue in the menu. The row is already `flex shrink-0 items-center gap-1` with a child slot for the queue-sheet trigger, so a labelled destructive button fits; if the width at small breakpoints is tight, collapse to an icon with an aria-label rather than hiding it behind the menu. (2) Add a confirmation: a Dialog owned by the call screen that names what leaving does (ends the active call, disconnects the device, returns the current contact to the queue) and has an explicit confirm action calling the existing handleLeaveCampaign. One dialog, shared by the TopChrome button, the settings-only header button, and the two existing leave actions in CallScreen.Dialogs.tsx:142 and :177, so the copy and the behaviour cannot drift. Keep handleLeaveCampaign as the single implementation; the dialog only gates it.
- Look in: `app/components/call/CallScreen.Header.tsx:239 (TopChrome header), :264-291 (the kebab menu holding Leave Campaign), :143-150 (the settings-only visible button)`, `app/components/call/CallScreen.Layout.tsx:164-172 (handleLeaveCampaign: hangUp, device.destroy, requeueContacts, navigate(-1)) and :238, :315, :504 (the three call sites)`, `app/components/call/CallScreen.Dialogs.tsx:142 and :177 (the existing leave actions), and the Dialog imports at :4-11 for the pattern to copy`
- Existing tests: test/ui/call-screen-header.test.tsx (covers CampaignHeader only; TopChrome is not rendered by any test)
- Missing tests: Leave Campaign is reachable without opening the overflow menu on the live call screen; clicking Leave Campaign opens a confirmation and performs no hangup, device teardown or requeue until confirm; cancelling the confirmation leaves the call and the queue untouched; the confirm path performs exactly one hangup, one device destroy and one requeue; every leave entry point (top chrome, settings header, both dialogs) is gated by the same confirmation
- Done when: Leave Campaign is visible on the live call screen, not only inside the kebab menu; Leaving the campaign requires an explicit confirmation that states what it does; No hangup, device teardown or requeue happens before the confirmation is accepted; All leave entry points share one confirmation and one implementation; The confirmation is keyboard accessible and has a focus-visible cancel action
- Tracker: Fix now. The destructive-action half is the important one and is not a taste question; the visibility half is a small placement call the record already bounds (icon-with-label rather than menu). Do it with #2036, since both change the call screen chrome.

### [#2053](https://github.com/chester-hill-solutions/callcaster/issues/2053) E2E gate is red on master and every branch: anonymous image pulls are rate-limited (MinIO already on Quay; Stow will remove it)
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **E2E gate is red on master and every branch: docker compose pull hits Docker Hub anonymous rate limiting**
- The E2E gate fails within ~1s of starting, at the image-pull step, before any app code runs. Log from master run 36103098899: 'postgres Pulling / inbucket Pulling / minio Pulling / minio Error unauthorized: access to the requested resource is not authorized / postgres Interrupted / inbucket Interrupted / Error response from daemon: unauthorized'. The two 'Interrupted' lines are compose aborting the other pulls once one fails. All ten most recent E2E runs are failures, including master, and it reproduced on #2055 too. Zero storage/minio/s3/presign content in any recent diff, so no branch change can be the cause. CORRECTION (my first version of this record was wrong): the three images are NOT all from Docker Hub. postgres is postgres:18-alpine (Docker Hub), inbucket is inbucket/inbucket:latest (Docker Hub), but minio is quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1 (QUAY), pinned on purpose with the in-file comment 'Pin a published Quay image; Docker Hub's moving latest tag is unavailable in CI.' So the original suggested fix of logging in to Docker Hub would NOT have fixed the MinIO pull.
- Current behavior: The gate measures nothing. A red E2E check carries no information and is indistinguishable from a real regression.
- Root cause: 'Error response from daemon: unauthorized' is the DOCKER DAEMON, not MinIO — the MinIO service never starts, so no MinIO credential can be wrong. Credentials are in fact consistent (docker-compose.dev.yml:43-44 and scripts/e2e/ensure-minio-bucket.mjs:25-26 both use callcaster/callcaster-dev-secret), and the runner is GitHub-hosted so there is no stale volume. What remains is anonymous image-pull rate limiting on the shared GitHub-hosted runner IP pool. The failure names minio on every run, consistent with the QUAY pull being refused, since Quay enforces its own anonymous quota. It depends on shared runner IP reputation, not on the commit, which is why master and every branch fail identically. Note a prior fix attempt already moved MinIO off Docker Hub to Quay to dodge a moving-latest problem; that fixed the tag but not the rate limit.
- Resolution: Do NOT spend effort on the MinIO pull: #1800 replaces MinIO with Stow, a Docker-free S3-compatible service, which removes that image pull from the compose step entirely, and that work is in progress. Scope this ticket to what Stow leaves behind — postgres and inbucket, both Docker Hub. Preferred: mirror both to GHCR (ghcr.io/chester-hill-solutions/postgres-18-alpine and .../inbucket) and repoint docker-compose.dev.yml, because GHCR has no anonymous per-IP limit so it removes the class of failure and needs no CI credentials. Interim alternative: docker/login-action with secrets.DOCKERHUB_USERNAME plus a read-scoped DOCKERHUB_TOKEN in the job running npm run test:e2e:compose — but that only helps postgres/inbucket and must be paired with Quay credentials or the MinIO pull stays broken until Stow lands. The retry loop in run-compose-e2e.mjs cannot help: rate limiting is a quota, not a transient fault.
- Look in: `.github/workflows/e2e.yml:40,55 (runs-on) and the test:e2e:compose step`, `docker-compose.dev.yml:12,36,49 (the three image sources — note line 36 is quay.io)`, `scripts/e2e/run-compose-e2e.mjs:20,57-58,84 (composeFile, up -d, ensure-minio-bucket)`, `scripts/e2e/ensure-minio-bucket.mjs:12-13,25-26 (endpoint and credentials)`
- Missing tests: E2E gate passes on master from a GitHub-hosted runner; ten consecutive PRs with no image-pull failure
- Done when: npm run test:e2e:compose passes on master from a GitHub-hosted runner; No image in docker-compose.dev.yml is pulled anonymously from a rate-limited registry; No image-pull failure across ten consecutive PR runs; If the gate is not required, that is recorded deliberately
- Tracker: Fix now. Smallest change in the repo that restores a real signal from a gate that currently carries none. The quality job in ci.yml is unaffected because it does not pull these images, so E2E is the only broken gate. Found while triaging #2050.

### [#2045](https://github.com/chester-hill-solutions/callcaster/issues/2045) message history and message count reset after a while
- Verdict: **Fix now** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-24
- Recommended title: **Unread message badge counts only the newest 100 conversations, so it undercounts and drifts down as volume grows**
- The count half is confirmed by the code, and the code already documents the defect. The sidebar badge and the server-rendered Today number both come from a bounded page: app/hooks/chats/useUnreadConversationsCount.ts:15-22 fetches one page of conversations at page_size=100 and sums unread_count client-side, with the comment 'Workspaces with more than 100 distinct conversations will undercount unread messages sitting in conversations beyond the first page'. The server side is the same shortcut: app/lib/database/workspace-conversations.server.ts:490-505 getWorkspaceUnreadConversationCount calls fetchConversationSummary with limit=UNREAD_CONVERSATION_PAGE_SIZE and sums, and its own comment says it exists 'so the server-rendered Today action and client badge agree'. Two consequences beyond the flat undercount: the summed page is ordered by conversation_last_update DESC (workspace-conversations.server.ts:259), so a new conversation pushes an unread one off the page and the badge goes DOWN, which matches 'resets after a while'; and every inbound INSERT bumps the count optimistically (useUnreadConversationsCount.ts:86-90) until the next 30s poll reconciles it downward. Production scale confirms the page is too small: the Eric Lombardi workspace has 1,273 inbound replies from one campaign. NOT CONFIRMED: the second half of the report, that the conversation LIST itself resets. The list has working pagination (handleLoadMore at app/hooks/chats/useChatsPage.ts:303-325 accumulating pages through mergeConversationPages), but the sync effect at :153-164 calls setLoadedChats(chats) — replacing the accumulated list with the loader's first page — whenever the loader data changes and no newer fetcher page is in hand. That is a plausible reset path, and it is exactly the kind of thing that must be observed before it is 'fixed'.
- Current behavior: The Messages badge and the Today number report a count that stops growing at the newest 100 conversations, and can decrease between polls while unread messages exist.
- Root cause: A workspace-wide total is being computed client-side from one page of a paginated endpoint, because the conversations API exposes no aggregate. Two code paths then had to be kept in agreement, and the optimistic realtime bump guarantees visible drift until the next poll corrects it.
- Resolution: Replace the page-sum with a real aggregate, which is cheap here because the grouping does not change the number. unread_count is COUNT(*) FILTER (WHERE direction='inbound' AND status='received') grouped by conv_key (workspace-conversations.server.ts:234), and every inbound row has a non-null conv_key (the CASE at :203-208 resolves inbound rows to from_key), so the workspace total is exactly COUNT(*) over inbound+received messages — no grouping needed. Add that as a dedicated query in workspace-conversations.server.ts, have getWorkspaceUnreadConversationCount call it, and have the client hook read the aggregate from the loader/endpoint instead of summing a page. Keep the per-row unread_count on the list itself, which is correct and already used for the per-conversation pill. While in the file, update the two comments that assert the 100-conversation window is intentional so the next reader does not restore it. Do NOT touch the conversation list's reset behaviour in this change: it is a separate, unconfirmed hypothesis (see missingTests) and bundling a speculative UI change with a correct server fix makes both hard to review and hard to revert.
- Look in: `app/hooks/chats/useUnreadConversationsCount.ts:15-22 (the documented 100-conversation limit), :39-61 (page fetch and sum), :78-91 (optimistic inbound bump), :13 (30s poll)`, `app/lib/database/workspace-conversations.server.ts:486-505 (getWorkspaceUnreadConversationCount and its 'agree with the badge' comment)`, `app/lib/database/workspace-conversations.server.ts:223-241 (the agg CTE: unread_count definition and conv_key grouping)`, `app/lib/chats/unread-count.ts:1-11 (UNREAD_CONVERSATION_PAGE_SIZE = 100)`, `app/routes/workspaces+/$id.loader.server.ts:73 (the server-rendered unread count, workspace root only)`, `app/hooks/chats/useChatsPage.ts:153-164 (the setLoadedChats reset path — the unconfirmed list symptom)`
- Existing tests: test/workspace-conversations-sql-parity.test.ts (real-Postgres parity harness for the conversation SQL — the right place to prove the aggregate equals the sum of per-group counts); test/ui/hooks-chats.test.tsx (badge and list hook coverage)
- Missing tests: the workspace unread count is a plain aggregate and equals the sum of per-conversation unread_count over ALL conversations, proven in the Postgres parity test with more than 100 conversations; the count does not decrease when a new conversation pushes an older unread one out of a page (this is the regression the fix exists to prevent); a marked-as-read message reduces the aggregate; the aggregate is scoped to the workspace and does not leak another workspace's unread messages; the badge no longer drifts after an optimistic realtime bump followed by a poll; LIST RESET, NOT YET REPRODUCED: after scrolling to load several pages, a loader revalidation (navigate into a conversation, or a change to the campaign/sort/search filter) drops the user back to page 1; LIST RESET: the same does not happen when the realtime message subscription fires, which is the other path that touches the list
- Done when: The badge and the Today number report the true workspace-wide unread total for workspaces with more than 100 conversations; The count never decreases while unread messages exist and no message is marked read; A Postgres test proves the aggregate equals the per-conversation sum beyond the first page; Per-conversation unread pills are unchanged; The comments asserting the 100-conversation window is by design are corrected; The list-reset symptom is either reproduced and filed as its own issue, or explicitly closed as not reproducible, with evidence
- Tracker: Fix now, scoped to the count only. The count defect is confirmed, cheap to fix, and the code has been carrying a comment admitting it. The list-reset half is a real but unreproduced hypothesis and is deliberately excluded — file it separately if the repro below confirms it, rather than guessing at a UI fix inside a server change.

### [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013) login page and sign up page should be better aligned style wise
- Verdict: **Fix now** · Size: S · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-24
- Recommended title: **auth pages: one shared form container — same width, padding, centring**
- Login and sign-up are aligned inconsistently: not centred vertically or horizontally, the form boxes are different widths, and the padding differs. This is the baseline for the whole auth-pages cluster (#2057) — it is the first thing to land and it unblocks #2010, #2011, #2012 and #2014.
- Current behavior: The two pages were laid out independently, so neither the centring, the form width, nor the padding matches between them.
- Root cause: No shared container component; each page sets its own geometry.
- Resolution: Introduce or fix one AuthCard-style container used by both routes, with width, padding and centring defined once. Then check #2010 first — a scrollbar on a page that should fit in the viewport is very often a symptom of an over-sized container rather than a separate bug, so close it if it resolves rather than fixing the symptom independently.
- Look in: `app/routes/account.sign-in.*`, `app/routes/account.sign-up.*`, `app/components/shared/AuthCard.tsx`, `AGENTS.md (AuthCard named as the page-structure primitive)`
- Missing tests: both pages render identical geometry; no scrollbar at viewport height
- Done when: Identical form width on both pages; Identical padding on both pages; Centred vertically and horizontally on both pages; Geometry defined in one place, not per page; #2010 re-checked against this change
- Tracker: Do this one first. It is small, it is the unblocking work for four sibling issues in #2057, and #2010 may close as a side effect.

### [#2004](https://github.com/chester-hill-solutions/callcaster/issues/2004) 403 Forbidden UI UX
- Verdict: **Fix now** · Size: S · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **A 403 renders as "Something went wrong" with a Reload Page button and the raw status text**
- Confirmed. app/components/shared/RouteErrorBoundary.tsx has a dedicated branch for 404 (:13-32) and no branch for 401 or 403, so a 403 falls through to the generic block at :38-56: the heading is 'Something went wrong', the Alert shows `${error.status} ${error.statusText}` — literally '403 Forbidden', the action is a destructive 'Reload Page' button, and the server's actual message is discarded. 403s are a normal, expected outcome in this app: app/lib/workspace-middleware.server.ts:68-72 returns one for every min-role-gated route, and app/lib/workspace-membership.server.ts:181 and :184 throw `AppError('Access denied to workspace', 403, ErrorCode.FORBIDDEN)` from requireWorkspaceAccess, which has 81 call sites. The message is already written ('You don't have permission to perform this action') and never reaches the user.
- Current behavior: A signed-in member who lacks the role for a page sees a generic crash card with '403 Forbidden' and a Reload Page button that reloads the same forbidden page.
- Root cause: The boundary was written around 404 and 500 and treats every other status as an unexpected crash. There is no map from status to user-facing meaning, so a deliberate authorization decision is presented as a system fault.
- Resolution: Add a status-to-meaning branch to RouteErrorBoundary, following the shape of the existing 404 branch: for 403, a heading that says the signed-in account does not have access, the server's message where one exists (the thrown AppError message, or the middleware's 'You don't have permission to perform this action'), and a useful next action — go back, or contact a workspace admin — never Reload Page. Add the same treatment for 401. Keep the generic block for 5xx. Also check how `routeData(..., { status: 403 })` from middleware surfaces: if it becomes a route error response the branch is enough; if it renders as data instead, the min-role middleware should redirect or the boundary will not see it, so verify with a real min-role-gated route before declaring it done. This is independent of the permission-model work in the authz cluster — 403-versus-404 is already decided in AGENTS.md (non-member gets 404 to avoid workspace-id inference; a known member lacking a capability gets 403).
- Look in: `app/components/shared/RouteErrorBoundary.tsx:13-32 (the 404 branch to copy), :34-56 (the generic 403 fallthrough)`, `app/lib/workspace-middleware.server.ts:62-75 (createWorkspaceMiddlewareWithMinRole returning 403 with a real message)`, `app/lib/workspace-membership.server.ts:158-187 (requireWorkspaceAccess, 403 AppError, 81 call sites)`, `app/routes/workspaces+/$id.tsx:303 (the workspace layout re-exports this boundary, so every workspace page inherits it)`
- Existing tests: test/ui/ components assert 404 handling on some routes (none assert 403 copy)
- Missing tests: a 403 renders an access-denied message, not "Something went wrong"; a 403 never renders a Reload Page action; the server's message is shown for 403 rather than the raw status text; 404 still renders its existing not-found copy (guard against regressing the branch next door); a 5xx still renders the generic block; an end-to-end check on a real min-role-gated route that an under-privileged member sees the new copy, which is the only way to prove the middleware response actually reaches the boundary
- Done when: A 403 tells the user they lack access, in the app's voice, with the server's message where one exists; No 403 renders the generic crash heading or a Reload Page action; The boundary offers a next step the user can actually take; 401 gets the same treatment; 404 and 5xx behaviour is unchanged; A test covers each status branch, including one on a real min-role-gated route
- Tracker: Fix now. Small, entirely local to one component, and it makes every authorization decision in the product legible instead of looking like a crash. Independent of the authz cluster, so it can land before or after that model work.

### [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) Two dial paths record at Twilio but never persist: dial/:number and connect-campaign-conference
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **Dead Twilio recording callbacks on dial/:number and connect-campaign-conference**
- Two outbound paths set record on Twilio but never send recordingStatusCallback, so audio is orphaned and never appears in Call History. Fix or remove record on both (part of the #1873 recording surface).
- Current behavior: dial/$number.action.server.ts:68 record-from-answer with [in-progress] and no callback URL; connect-campaign-conference loader:58 record-from-start with no callback. Working reference: call.action.server.ts:100-105 wires /api/recording + completed.
- Resolution: Wire recordingStatusCallback: ${BASE_URL}/api/recording + event completed on both sites (or drop record), so runRecordingSideEffects persists audio_url. Fold into #1873's wiring pass or land standalone.
- Look in: `app/routes/api+/dial/$number.action.server.ts`, `app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.loader.server.ts`, `app/routes/api+/recording.action.server.ts`
- Blocked by: [#1873](https://github.com/chester-hill-solutions/callcaster/issues/1873)
- Existing tests: test/api-call.route.test.ts:106
- Missing tests: dial/:number and conference include the callback URL when recording
- Done when: No dial path records without a persisted callback; Conference recordings persist (or record is removed)
- Tracker: Fix now. Small; can ride the #1873 wiring PR or land independently.

### [#1833](https://github.com/chester-hill-solutions/callcaster/issues/1833) Primary button hover needs the hover mouse
- Verdict: **Fix now** · Size: S · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-21
- Recommended title: **fix(ui): pointer cursor on shared Button + guard raw <button> usage**
- Primary buttons show the arrow cursor because neither shad-cc's buttonVariants nor the local wrapper declares a cursor. The fix already exists on branch origin/bug/1833-primary-button-cursor (1a99dc44): default cursor-pointer with disabled/aria-disabled cursor-default plus test updates.
- Current behavior: app/components/ui/button.tsx sets no cursor; the underlying shad-cc buttonVariants base class also has none. The reported onboarding 'Save & continue' uses the shared Button. A large raw-<button> inventory bypasses the shared component.
- Root cause: Base button styles never declared a cursor; some controls bypass the shared Button.
- Resolution: Land the existing branch/PR (cursor-pointer default + disabled/aria-disabled handling + button.smoke assertions). Then migrate the raw-<button> call sites from the issue inventory in focused groups and add a guard. Treat the inventory as follow-up tickets.
- Look in: `app/components/ui/button.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`, `test/ui/button.smoke.test.tsx`
- Existing tests: test/ui/button.smoke.test.tsx
- Missing tests: default class includes cursor-pointer; disabled and aria-disabled use cursor-default; guard against new raw <button> usages
- Done when: Interactive shared buttons show the pointer cursor by default; Disabled buttons show the default cursor; The reported onboarding save/continue instance is fixed; A guard prevents recurrence
- Tracker: Branch origin/bug/1833-primary-button-cursor (1a99dc44) is ready but unmerged; open a PR. File the raw-button inventory migration as follow-up tickets.

### [#2039](https://github.com/chester-hill-solutions/callcaster/issues/2039) onboarding rent a number alert is red when it should be green and too much gap underneath the component
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-25
- Recommended title: **Onboarding 'you have N rented numbers' uses the default Alert, whose dark-mode wash is crimson and reads as an error**
- Confirmed in the tokens. app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx:388 renders `<Alert>` with no variant for a success statement ('You have 1 rented number on this workspace... Continue when you are ready'). The Alert default variant is `border-brand-tertiary bg-brand-wash` (vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx, defaultVariants variant:'default'), and in dark mode `--brand-wash` is hsl(340 28% 18%) — a maroon. So the neutral default reads as a red error banner in dark mode, which is what the screenshot shows. The second half of the report is layout: the step wraps its blocks in `space-y-6` (line 270) and the section that follows the alert adds `border-t ... pt-6` (line 485), so the gap under the banner is 24px + 24px.
- Current behavior: A green-meaning message is rendered in the destructive-looking tone, and it sits in a 48px hole before the next section.
- Root cause: The tone is left to the primitive default instead of being stated, and the default happens to be a brand-tinted wash that reads as crimson in dark mode. Spacing is set by two independent containers that both own vertical rhythm, so the gap is additive rather than deliberate.
- Resolution: State the tone: pass `variant="success"` on that Alert (the primitive has a success variant) so a completed rental reads as a success, and give it an AlertTitle if the copy needs the hierarchy. Collapse the double gap: pick one owner for the vertical rhythm in this step — either drop `pt-6` from the following section (line 485) and keep the parent's `space-y-6`, or drop the parent's gap for this transition. Do not change the Alert primitive's default variant to fix this: many call sites rely on it, and this is one mis-toned call site. While here, check the other <Alert> usages in the onboarding wizard for the same missing variant, since they share the same default-wash problem in dark mode.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx:387-400 (the Alert), :270 (space-y-6), :485 (border-t pt-6)`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx (default variant = border-brand-tertiary bg-brand-wash; success/destructive/warning/info exist)`, `vendor/chester-hill-solutions/shad-cc/src/styles/theme.css:161 (--brand-wash dark = hsl(340 28% 18%))`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx (sibling steps to sweep for the same missing variant)`
- Existing tests: test/ui/onboarding-first-number-flow.test.tsx; test/ui/onboarding-first-number-groups.test.tsx
- Missing tests: the rented-number confirmation renders the success variant, not the default (assert the variant class or the alert role's tone attribute); a caller with zero rented numbers and zero verified caller IDs does not render an empty alert; the reviewed step has exactly one owner for its vertical rhythm, asserted at a documented gap value; no test anywhere asserts an Alert's tone, which is why a red success banner shipped
- Done when: The rented-number confirmation reads as a success, not an error, in both light and dark themes; The gap under the banner matches the rest of the step's rhythm; The Alert primitive's default variant is unchanged; Every Alert in the onboarding wizard states its tone explicitly; A test fails if a success-state Alert renders with the default variant
- Tracker: Fix now, and pair it with the #2036 spacing pass since both are the same onboarding/call-screen geometry complaint from the same reporter. Toggling the theme is the fastest way to confirm the tone claim before changing anything.

### [#2042](https://github.com/chester-hill-solutions/callcaster/issues/2042) Sidebar modal needs sensible padding defaults
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-24
- Recommended title: **Side Sheet has no default padding, so any body between header and footer renders flush to the edge**
- Confirmed at the primitive. vendor/chester-hill-solutions/shad-cc/src/components/ui/sheet.tsx puts `p-6` on SheetHeader (line 132) and SheetFooter (line 142) but NOT on SheetContent (the className list at line 81 has no padding). Every child placed directly under SheetContent is therefore flush to the panel edge, which is exactly the screenshot: the title and description are inset, the 'Number of segments' label, its input and the checklist start at x=0. There are 11 SheetContent call sites; 9 of them rely on the primitive for their body padding, 2 deliberately opt out with `p-0` (app/routes/workspaces+/$id/chats.route.tsx:122 and app/components/workspace/WorkspaceNav.tsx:411).
- Current behavior: Body content in a side Sheet is flush against the left edge while the header and footer are inset, so the panel reads as broken rather than dense.
- Root cause: The padding defaults live on the header and footer slots instead of on the content slot, so a caller adding a body has to remember to add its own padding. Every one of the 9 call sites either forgot it or compensated with a vertical-only class (CampaignDetailed.SplitCampaign.tsx:262 uses `space-y-4 py-4`).
- Resolution: One change at the primitive: give the local SheetContent wrapper in app/components/ui/sheet.tsx a default of `p-6` merged through `cn`, so a call site's own `p-0` / `px-*` still wins via tailwind-merge. That fixes all 9 un-padded bodies at once and keeps the 2 full-bleed sheets full-bleed. Then drop the now-redundant `py-4` on the SplitCampaign body (CampaignDetailed.SplitCampaign.tsx:262) so the spacing is defined once. Do NOT edit the vendored shad-cc package to get this: the repo's convention is that app/components/ui/ is the local adaptation layer, and changing vendor/ changes every consumer including other projects. After the change, walk the 9 call sites and delete any padding that was added by hand to compensate.
- Look in: `app/components/ui/sheet.tsx:50-54 (the local SheetContent wrapper, where the default belongs)`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/sheet.tsx:81 (no padding on the content slot), :132 and :142 (p-6 on header and footer only)`, `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx:262-263 (the sheet in the screenshot)`, `the 9 other SheetContent call sites: CallScreen.Layout.tsx:253,274,302; NumberSummaryList.tsx:467; CallerIdVerificationDialog.tsx:44; ChatAddContactDialog.tsx:72; TeamMember.tsx:128; Navbar.MobileMenu.tsx:44; AddAudioSheet.tsx:125`
- Existing tests: test/ui/add-audio-sheet.test.tsx (one sheet's behaviour, not its padding)
- Missing tests: a smoke test asserting the SheetContent primitive ships a default horizontal padding; a smoke test asserting a call site that passes p-0 still renders with no padding (the opt-out must survive the default); a smoke test asserting a body rendered under SheetContent is not flush to the panel edge; no test currently asserts any of the 9 un-padded bodies, which is why this is invisible to CI
- Done when: Body content in a side Sheet has the same horizontal inset as its header and footer; The two full-bleed sheets (chats mobile list, workspace nav) still render edge to edge; Padding is defined in one place, and hand-compensating padding at call sites is removed; A test fails if a new SheetContent call site reintroduces flush body content; The vendored shad-cc package is unchanged
- Tracker: Fix now. Smallest item in this batch and the only one that fixes nine call sites with one line. Do it before #2036, which changes spacing on the same call screen, so the two do not fight.

### [#1896](https://github.com/chester-hill-solutions/callcaster/issues/1896) Design-system linting: ESLint 9 + @shadcn/lint
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **Design-system linting: retire the hand-rolled SaveBar token test**
- Both linter PRs shipped on dev: ESLint 9 flat config in PR #1907 (c5ac39e2) and @shadcn/lint in PR #1908 (f561396f), neither in master. One acceptance item is unmet: the hand-rolled token test test/ui/components-shared-smoke.test.tsx:286 is still present.
- Current behavior: eslint.config.mjs registers @shadcn/lint; the SaveBar token smoke test still asserts bg-background / not bg-white.
- Root cause: The migration PRs covered the linter config but did not remove the now-redundant hand-rolled test.
- Resolution: Delete the 'uses design tokens rather than hardcoded colors' test from test/ui/components-shared-smoke.test.tsx and confirm check:lint-ratchet and the ratchet baseline are unchanged. Keep the component-variant tests.
- Look in: `test/ui/components-shared-smoke.test.tsx`, `eslint.config.mjs`, `scripts/check-lint-ratchet.mjs`, `scripts/baselines/lint-ratchet.json`
- Existing tests: test/ui/components-shared-smoke.test.tsx (remove line 286)
- Done when: ESLint 9 runs the same rule set with the ratchet baseline unchanged or lower (done on dev); @shadcn/lint rules enabled and ratcheted (done on dev); The hand-rolled token test is removed (outstanding)
- Tracker: Fix now (delete the obsolete test), then close. The linter migration reaches master on the next release.

---

## Verify and close — 71

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#1982](https://github.com/chester-hill-solutions/callcaster/issues/1982) Receipts should say info@callcaster.ca
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **Receipts: support email should be contact@callcaster.ca**
- Receipts currently carry a wrong/absent support contact; use contact@callcaster.ca.
- Current behavior: Receipt builder contact line differs from the canonical support address.
- Resolution: Swap the contact line to contact@callcaster.ca on the receipt.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts contact@callcaster.ca
- Done when: Receipts say contact@callcaster.ca

### [#1794](https://github.com/chester-hill-solutions/callcaster/issues/1794) Campaign schedule sync can overwrite a concurrent pause or completion
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-09-25
- PR #1797 (88f73343) made schedule writes conditional on the status read by the sweep. The requested real database interleaving check is still missing.
- Current behavior: A concurrent status change causes the guarded update to return no transition; events follow successful updates only.
- Resolution: Verify pause/completion interleaving against a real database. The existing sweep test mocks the status helper, so it does not prove the SQL concurrency behavior.
- Look in: `app/lib/campaign-schedule-sync.server.ts`, `app/lib/campaign-ivr.server.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts (sweep orchestration with mocked status helper)
- Missing tests: Real database pause/completion after candidate selection; confirm state and emitted events.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#2052](https://github.com/chester-hill-solutions/callcaster/issues/2052) One owner for the best-effort completion RPC call: five call sites, three error policies
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **Give the completion RPC one best-effort owner**
- Five call sites invoke try_complete_campaign_if_drained and only two guard it. campaign-queue-completion.server.ts:51-68 and ivr/status.action.server.ts:130-153 catch and log; the #2048 campaign-settle-recheck.server.ts catches and logs under a third event name; campaign.server.ts continueOrCompleteDispatch and auto-dial.server.ts:437-444 do not catch at all, so an RPC failure propagates and fails the dispatch job or dial drain. An RPC failure only means 'not complete yet', which must never fail unrelated work.
- Current behavior: Completion failures are reported three different ways depending on surface, and on two surfaces they fail the surrounding job instead of being absorbed.
- Root cause: Each call site invented its own try/catch and log message. The #2048 wrapper was created for the same reason, so there are now two wrappers and three policies.
- Resolution: One internal helper owns 'ask the gate, log, never throw', with a comment stating why. All five call sites use it and lose their own try/catch. Collapse campaign-settle-recheck.server.ts into the same owner rather than keeping two wrappers. Normalise the log event name and fields so a completion failure reads the same from every surface.
- Look in: `app/lib/campaign-queue-completion.server.ts:51-68`, `app/routes/api+/ivr/status.action.server.ts:130-153`, `app/lib/campaign-settle-recheck.server.ts`, `app/lib/worker/handlers/campaign.server.ts (continueOrCompleteDispatch)`, `app/lib/auto-dial.server.ts:437-444`, `app/lib/db-rpc.server.ts:176-184`
- Existing tests: test/webhook-side-effects.test.ts; test/campaign-settle-recheck.server.test.ts
- Missing tests: completion RPC failure does not propagate out of a dispatch job; completion RPC failure does not propagate out of a dial drain; completion RPC failure does not fail a Twilio webhook; completion RPC failure does not fail an open-sync sweep; one log event name is used from every surface
- Done when: Exactly one code path owns the best-effort completion call; All five call sites use it with no local try/catch; A completion RPC failure never propagates into a dispatch job, dial drain, webhook or sweep; One log event name and field set from every surface; Failure path tested at each call site, not only at the owner
- Tracker: Small cleanup, no live defect. Raised by the #2048 structural review and deliberately deferred there to keep that PR atomic. Lane is verify-close because the work is a de-duplication with no behavioural change to specify.

### [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) Receipts should say how many credits were bought
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-24
- Recommended title: **Receipts: state how many credits were bought**
- Receipt (billing/receipt.route.tsx) should say how many credits the purchase covered, not just the amount.
- Current behavior: Receipt builder shows amount/line items; no credit quantity line.
- Resolution: Add a credit-quantity line to the receipt render (from the ledger row / stripe session metadata). Contact #1982/#1983 for the same receipts surface.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts credit-quantity line
- Done when: Receipt states how many credits were bought

### [#2001](https://github.com/chester-hill-solutions/callcaster/issues/2001) Phone numbers should be it's own page
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: @sai-sy · Updated: 2026-09-24
- Recommended title: **Phone Numbers promoted to its own top-level page at /phone-numbers and removed from Settings**
- Shipped. PR #2018 (0ee4766a) merged to dev and the automation comment says this closes when it reaches master. Verified in the working tree: the route module exists (app/routes/workspaces+/$id/phone-numbers.route.tsx and phone-numbers.loader.server.ts, both dated 2026-09-24), the sidebar links to it (app/components/workspace/WorkspaceNav.tsx:140, path 'phone-numbers'), the URL is in the verified route-tree baseline (scripts/baselines/route-tree.txt:153), and the purchase sub-route is split out (app/routes/workspaces+/$id/phone-numbers/purchase.route.tsx).
- Current behavior: Phone Numbers is its own sidebar page; the settings page no longer carries a Phone Numbers section.
- Root cause: It was a section inside Settings rather than a top-level destination, which put a daily-use surface three clicks deep.
- Resolution: No code. Verify on the review environment that /phone-numbers loads with numbers listed, that the Settings page has no Phone Numbers section, and that the e2e RBAC-04 assertion (e2e/specs/rbac.spec.ts:29-32, a caller is redirected away from /phone-numbers) still holds — that test is the only thing guarding the role gate on the new page. Then close when the fix is promoted to master.
- Look in: `app/routes/workspaces+/$id/phone-numbers.route.tsx and phone-numbers.loader.server.ts`, `app/components/workspace/WorkspaceNav.tsx:140`, `scripts/baselines/route-tree.txt:153`, `e2e/specs/rbac.spec.ts:29-32 (the caller role gate on the new page)`
- Existing tests: e2e/specs/rbac.spec.ts (RBAC-04 gates the caller role off /phone-numbers); npm run tools:routes:verify (route tree baseline includes the new path)
- Missing tests: no test asserts the Settings page no longer renders a Phone Numbers section, so a re-add would pass silently; the sidebar link and the route path are asserted in the same place, so a rename cannot half-land
- Done when: /phone-numbers loads and lists the workspace numbers; The Settings page has no Phone Numbers section; A caller role is still refused on /phone-numbers; No dead links point at the old settings anchor
- Tracker: Verify and close. The work is merged to dev and the route tree baseline proves the path exists. The only open item is promotion to master.

### [#2012](https://github.com/chester-hill-solutions/callcaster/issues/2012) sign page doesn't need "Sign Up" and "Create an Account"
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-24
- Recommended title: **auth pages: remove the top "Sign Up" link and rename "Create an Account" to "Sign Up"**
- The sign-in page shows a "Sign Up" link at the top as well as a "Create an Account" button, so the same destination is offered twice under two different labels. Grouped under the auth-pages epic (#2057).
- Current behavior: Two distinct labels both lead to sign-up.
- Root cause: Copy was added over time without a single naming decision.
- Resolution: Remove the top "Sign Up" link and change the button to read "Sign Up". Verify the result against the live routes before closing — this may already be fixed in which case it closes with a link to the current code.
- Look in: `app/routes/account.sign-in.*`, `app/components/shared/AuthCard.tsx`
- Done when: One label, one destination; No duplicate link to the same page from the same screen
- Tracker: Smallest item in the cluster. Check the live route first — if it already reads this way, close it as already done rather than writing a change.

### [#1847](https://github.com/chester-hill-solutions/callcaster/issues/1847) Call list mapping should allow you to drop columns if you don't want the clutter instead of just custom fields
- Verdict: **Verify and close** · Size: S-M · Risk: low · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **Add a 'Do not import' mapping option so columns can be dropped**
- The CSV mapping forces every column to a target and defaults unknown columns to Custom field; users want to drop unwanted columns instead of importing them as custom fields.
- Current behavior: Every CSV header maps to a ContactImportTarget (unknown headers default to other_data / Custom field). The Map CSV Headers select offers no ignore/drop option.
- Root cause: CONTACT_IMPORT_TARGETS has no ignore/drop target, and the mapping, validation, and import paths assume every column is imported.
- Resolution: Add an 'ignore' / 'Do not import' option: offer it in the Map CSV Headers select, exclude it from other_data, exclude it from duplicate-target validation, and skip it in processAudienceUpload. Leave the Data Preview unchanged.
- Look in: `shared/contact-import-headers.ts`, `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/audience-upload-csv.ts`, `app/components/audience/AudienceUploader.tsx`, `app/lib/audience-upload-process.server.ts`
- Existing tests: test/contact-import-headers.test.ts; test/ui/audience-uploader.test.tsx; test/audience-upload-parsing.test.ts
- Missing tests: A column mapped to ignore passes validation and is absent from imported contacts; Ignore is not counted as a duplicate target
- Done when: A mapping option drops a column; Dropped columns are not written to other_data; Dropped columns do not create duplicate-target errors; Phone and name validation behaviour is unchanged
- Tracker: Implemented on dev (PR #1973 41d45f6d): shared/contact-import-headers.ts includes a drop-column option with tests (test/contact-import-headers.test.ts) + CHANGELOG entry. Verify the mapping UI and close.

### [#1849](https://github.com/chester-hill-solutions/callcaster/issues/1849) what happens when multiple columns map to the same column in call list upload
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: question, business-logic · Assignee: @wra-sol · Updated: 2026-09-23
- Working as designed. Duplicate mappings are a blocking validation: validateContactImportMapping flags duplicate-target, AudienceUploadMapStep shows a destructive 'Mapping needs attention' alert, Continue is blocked, and the upload action re-validates server-side. The guard shipped in PR #1063 (7824c824) and is on master.
- Current behavior: Mapping both 'phone' and 'cell phone' to Phone number shows 'Phone number is assigned to more than one CSV column' and prevents continuing. The server rejects the same mapping independently.
- Root cause: Not a defect. The issue is a question about intentional designed behaviour.
- Resolution: Answer the question and confirm the blocking behaviour is intended, then close. If the desired behaviour is to merge two phone columns, that is a new feature.
- Look in: `shared/contact-import-headers.ts`, `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/AudienceUploader.tsx`, `app/routes/api+/audience-upload.action.server.ts`, `app/lib/audience-upload-process.server.ts`
- Existing tests: test/contact-import-headers.test.ts
- Done when: Question answered with the current blocking behaviour; Blocking validation confirmed on master
- Tracker: Answer and close as working-as-designed (validation from PR #1063 is on master). Open a separate feature ticket only if merging multiple phone columns is wanted.

### [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) IVR estimates are too low. projected CPS is too high
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-23
- The IVR completion estimate is now bounded by voiceConcurrentCallLimit / average in-flight call duration and labelled as completion time. Shipped on dev in PR #1934 (e833d955).
- Current behavior: campaign-outbound-estimate.ts computes the effective IVR rate as min(configured dispatcher CPS, voiceConcurrentCallLimit / IVR_AVG_CALL_DURATION_SECONDS) and footnote-annotates the concurrent-call bound.
- Root cause: The projection treated CPS (dial-start rate) as a completion rate while IVR rows are dequeued only at call completion.
- Resolution: No code work left. Verify a 5000-call IVR projection against the concurrency bound on the review env, then close when dev is promoted to master.
- Look in: `app/lib/campaign-outbound-estimate.ts`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`, `app/lib/campaign-ivr-dispatch.server.ts`
- Existing tests: test/campaign-outbound-estimate.test.ts
- Done when: IVR projection accounts for the concurrent-call bound; Projection is labelled as completion time, not dial time
- Tracker: Verify and close. Dev-only (e833d955 not in master); close when dev promotes to master.

### [#1338](https://github.com/chester-hill-solutions/callcaster/issues/1338) Call Settings buttons are all over the place needs better alignment and padding
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-23
- Recommended title: **verify-close: call settings sheet laid out by device, no redundant labels**
- #1680 laid the sheet out by device (single label per field, buttons say what they do, flex gap), removing the redundant headings flagged in the issue. UI green; visual eyeball pending.
- Current behavior: Microphone/Speaker/Output fields each carry one label with their controls beneath.
- Root cause: Original layout clipped/misaligned; #1680 restructured.
- Resolution: No new code; eyeball on dev.
- Look in: `app/components/call/CallScreen.DeviceSettings.tsx`, `app/components/call/CallScreen.Layout.tsx`
- Existing tests: test/ui/audio-device-lifecycle.test.tsx; test/ui/call-screen-header.test.tsx
- Done when: no clipping left/right; no redundant labels
- Tracker: Close after the eyeball.

### [#1292](https://github.com/chester-hill-solutions/callcaster/issues/1292) if the call recipient hangs up, I get call completed but still the option to hang up
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-23
- Recommended title: **verify-close: call screen shows Hang Up in-call, Dial (with confirm) after**
- Dial control (#1408) flips to Dial and requires a second click after a call ends; Hang Up has its own two-step confirm. CallControls state machine verified by code + call-screen UI tests.
- Current behavior: in-call -> Hang Up (two-step); after end -> armed Dial ('Click again to call back') that disarms on first click.
- Root cause: Errors not reproduced; #1408 implemented the guard.
- Resolution: No new code; run the idle-state eyeball on dev.
- Look in: `app/components/call/CallScreen.CallArea.tsx`
- Existing tests: test/ui/call-screen-callarea.test.tsx
- Done when: active call -> Hang Up; ended call -> Dial with confirm; no hang-up confirm loop
- Tracker: Close after the eyeball.

### [#1333](https://github.com/chester-hill-solutions/callcaster/issues/1333) I don't think it's helpful to obfuscate the unsubscribe and resubscribe SMS message from the CC side
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-23
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

### [#1713](https://github.com/chester-hill-solutions/callcaster/issues/1713) Needing a user to have an account before invite makes no sense.
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-23
- Recommended title: **Workspace invites: email-first (invite by email without requiring an account)**
- IMPLEMENTED on dev (#1985, merged 2026-09-21): email-first invites (SEC-03) landed end-to-end — invite writers no longer require a pre-existing account, pending invites live on workspace_invitation by email, acceptance is token-gated through the emailed link, email sent via Resend, members API / settings / admin lists and cancel/resend moved to the new table. Verify the invitee flow on the review env (invite unknown email -> accept link -> signup -> workspace membership), then close.
- Current behavior: Invites are account-keyed: workspace_invite.user_id is uuid NOT NULL (schema.ts:214). app/lib/invite-user-by-email.server.ts:26-31 returns 'User not found. They must sign up before being invited to a workspace.' when no auth user matches, and the module comment says email delivery is TBD - no invitation email is ever sent; the invitee only sees the invite after logging in. The /accept-invite signup branch admits the gap ('invites are keyed by an existing user id, so nothing here proves an invite exists', accept-invite.action.server.ts:26-28).
- Root cause: Legacy invite model (workspace_invite) has no email column and no delivery; invites were created only for existing user ids. The email-first replacement (workspace_invitation / SEC-03) was scaffolded in 2026-07 but never adopted by the writers/readers.
- Resolution: Shipped in PR #1985. Follow-ups (tracked separately, do not block this close): Phase D drop of legacy workspace_invite; #1714 same-'User not found'-error verify-and-close against the new writer.
- Look in: `app/lib/invite-user-by-email.server.ts`, `app/lib/platform-members.server.ts`, `app/routes/api+/workspaces+/$workspaceId/members.action.server.ts`, `app/routes/accept-invite.action.server.ts`, `app/routes/accept-invite.loader.server.ts`, `app/routes/accept-invite.tsx`, `app/routes/workspaces+/$id/settings.route.tsx`, `app/db/schema.ts:180`, `app/lib/schemas/api/platform-workspace-admin.ts`, `app/lib/send-reset-password-email.server.ts`, `docs/remediation/wave1-membership-migration-2026-07-13.md`
- Existing tests: test/accept-invite* (accept/redeem; see test/ for invite coverage); members API invite tests (POST /members)
- Missing tests: createInvitation writer: unknown email creates pending email-keyed invite; existing user creates user-keyed invite; duplicate pending email rejected; redeemInvitation: wrong token, expired, wrong email vs verified email, concurrent redeem CAS; signup-claim: new account with invited email lands in the workspace on /accept-invite; email sent carries id + raw token; token never persisted; members list renders pending email invitations; cancel/resend
- Done when: Inviting an unknown email succeeds: the email is attached to the workspace and pending; the invitee gets a prompt (email + signup landing) to create an account; Inviting a known email behaves as today (user-keyed invite, no duplicate pending); After signup/sign-in with the invited email, the invite redeems atomically (verified-email match, CAS) and a workspace_member row is inserted; Raw invitation tokens are never stored; token_hash only; members.invite capability gate and role policy (owner never invitational) unchanged; Legacy workspace_invite rows migrated or abandoned before the table is dropped
- Tracker: Verify on the review env after the 2026-09-21 release: invite an email with no account, receive the Resend link, sign up, land in the workspace; ensure token-less accept is not reachable. Then close.

### [#1844](https://github.com/chester-hill-solutions/callcaster/issues/1844) Call History LIsten In feature sends you to twilio
- Verdict: **Verify and close** · Size: S-M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **Play call recordings in-app instead of linking to the Twilio recording URL**
- The Call History 'Listen' link opens call.recording_url, a Twilio API mp3 URL that sends the user to Twilio; recordings are already copied to object storage as call.audio_url.
- Current behavior: CallLogTable renders an <a href={recordingUrl}>Listen when recording_url is set. app/lib/call-log.server.ts selects call.recording_url. runRecordingSideEffects already persists recordings to object storage (call.audio_url).
- Root cause: Call History reads the raw Twilio recording_url and links out to it instead of serving the stored call.audio_url.
- Resolution: Select call.audio_url in app/lib/call-log.server.ts and mint a signed object-storage URL (createSignedObjectUrls, as the voicemails loader does), preferring it for the Listen action; render an in-app player and keep a clear fallback when no persisted copy exists.
- Look in: `app/lib/call-log.server.ts`, `app/components/calls/CallLogTable.tsx`, `app/lib/call-recording-storage.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/platform-media.server.ts`, `app/lib/object-storage.server.ts`
- Existing tests: test/call-log.test.ts
- Missing tests: Loader returns a non-Twilio playback URL for a call with audio_url; CallLogTable renders the in-app player and no external Twilio link
- Done when: Listen plays the recording without leaving CallCaster or opening Twilio; Works for a call whose recording was persisted to storage; A clear message when no recording copy exists; Tenant scoping is preserved
- Tracker: Implemented on dev (PR #1972 d1c6049d): Call History plays the stored object-storage copy in-app via signed URL; raw Twilio link remains only as the no-copy fallback. Verify on the review env and close.

### [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) Phone number verification pending doesn't switch to verified from onboarding steps
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-23
- Recommended title: **Pass the live caller-ID verification status to the onboarding verification sheet**
- From onboarding the verification sheet keeps showing 'Verification pending' after the number is verified; Settings shows 'Number verified' because it passes the live status.
- Current behavior: OnboardingFirstNumberStep renders CallerIdVerificationDialog without a status prop, so the sheet defaults to pending. Settings passes status derived from capabilities.verification_status.
- Root cause: The live-status wiring added for Settings (#1740) was never added to the onboarding render.
- Resolution: Compute the live verification status from callerIdNumbers and pass it to CallerIdVerificationDialog in OnboardingFirstNumberStep, mirroring settings/numbers.route.tsx.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/settings/numbers.route.tsx`, `app/components/phone-numbers/CallerIdVerificationDialog.tsx`
- Existing tests: test/ui/caller-id-verification-dialog.test.tsx; test/ui/onboarding-first-number-flow.test.tsx
- Missing tests: Onboarding dialog shows 'Number verified' after the number's verification_status flips to success
- Done when: Completing verification from onboarding flips the sheet to 'Number verified' with no reload; A failed verification still shows 'Verification failed'; Settings behaviour is unchanged
- Tracker: Exact fix: pass the live status the way Settings already does.

### [#2019](https://github.com/chester-hill-solutions/callcaster/issues/2019) Task: document corrected project-9 Status flow and repair enrichment lanes
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **Corrected project-9 Status flow documented and the enrichment lanes repaired**
- Shipped in PR #2026 (3d091ce5), which is an ancestor of the current dev HEAD, and every acceptance criterion in the issue body is satisfied in the working tree. .github/projects.yaml lists on-prod (2f691958) alongside the other six options. The board how-to in scripts/issue-board-lib.mjs:353-365 describes the corrected flow, including 'Never move a CLOSED issue by hand' and the not_planned/duplicate-is-the-one-manual-move rule. .agents/skills/project-on-dev-status/SKILL.md:114-140 carries the same rule and the option ids. The lane repair is done: verify-close.json holds #1883, #1884, #1846, #1980, #1981, #1982, #1830, #1844, #1845, #1886, #1936, and fix-now.json holds none of them. The validation error the issue quoted (#780 blockedBy unknown issue 1884) cannot occur now, because #1884 is present.
- Current behavior: The Status flow is documented in the three places an agent will actually read, and the lanes match what has shipped.
- Root cause: The 2026-09-21 release session bulk-archived 260+ closed items, which exposed that the documented flow described a hand-move process the automation had replaced, and that PR #1995 had dropped two enrichment records.
- Resolution: No code. Confirm the fix reaches master and close. If the board is regenerated and any lane claim here turns out to be stale, correct the enrichment files rather than reopening this issue — the repair itself is done.
- Look in: `.github/projects.yaml (on-prod option present)`, `scripts/issue-board-lib.mjs:353-365 (corrected Status-flow how-to)`, `.agents/skills/project-on-dev-status/SKILL.md:114-140 (Related section and option ids)`, `scripts/issue-board-enrichment/verify-close.json and fix-now.json (the lane moves)`
- Existing tests: scripts/issue-board-lib.mjs validateEnrichmentFiles (fails on a duplicate issueNumber, an unknown blockedBy target, or a cycle — this is what caught the dropped #1883/#1884 records)
- Missing tests: no test asserts that an on-prod option exists in .github/projects.yaml, so removing it again would not fail any check; no test asserts that no lane record claims a verdict its filename contradicts (the issue notes lanes come from the verdict field, which is a drift trap)
- Done when: npm run tools:issues:board exits 0 with no blockedBy, duplicateOf or cycle error; The corrected Status flow is documented in the board how-to, the skill and AGENTS.md where an agent will find it; .github/projects.yaml lists on-prod; Every record moved between lanes carries the verdict matching its lane file
- Tracker: Verify and close. The work is committed on dev and the acceptance criteria are individually checkable in the working tree. Close on promotion to master.

### [#2006](https://github.com/chester-hill-solutions/callcaster/issues/2006) Some bot is moving issues project status from on-qa to "archive"
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-09-22
- Recommended title: **Bulk Status moves to archive on the shared CHS backlog: incident fixed, prevention documented, no repo automation involved**
- Diagnosed and remediated by wra-sol in the issue comments, and the repo-side half is done. The mover was never this repository: nothing under .github/workflows/ writes project Status at all (a grep for 'archive' across the workflows returns nothing), and the board scripts never touch GitHub Projects. It was agent tooling doing a bulk sweep on the shared board, which overreached and put 48 OPEN issues into the terminal lane; all 48 were restored to Backlog and verified. The durable prevention is now written into the two places an agent will read: scripts/issue-board-lib.mjs:353-365 (the board how-to states the corrected flow, that closed items go to on-qa by automation, and that archive is only the one manual move for not_planned/duplicate) and .agents/skills/project-on-dev-status/SKILL.md:114-140 (never set a terminal lane, with the option ids). The bulk-sweep warning that was added to session memory is now in the repo instead of in one person's memory.
- Current behavior: No repo automation can move a project item. The rule that prevents a repeat is documented in the board generator and the skill.
- Root cause: A terminal Status option named archive exists on a project shared by several CHS products, and a bulk 'archive the closed items' cleanup ran without checking item state. Open items in a terminal lane is a contradiction that nothing detected.
- Resolution: No code. Verify on the shared board that no OPEN issue sits in a terminal lane (the check the fix claimed, re-run it), and that the corrected flow is still in the two documented places. Then close. If a repeat happens, the missing piece is an out-of-repo guard, not a repo change — a script that lists open items in a terminal lane would be worth its own issue if this recurs.
- Look in: `.github/workflows/ (no project Status writes — the negative result is the evidence)`, `scripts/issue-board-lib.mjs:353-365 (the corrected Status-flow section, including the never-hand-move-a-closed-item rule)`, `.agents/skills/project-on-dev-status/SKILL.md:114-140 (the same rule plus the option ids)`, `.github/projects.yaml (the terminal option is literally named archive)`
- Existing tests: scripts/issue-board-lib.mjs validateEnrichmentFiles (structural validation of the enrichment, not of the project board)
- Missing tests: no check anywhere fails when an OPEN item is left in a terminal lane — the failure mode that produced this incident is still undetectable; no script lists project items in a terminal lane on demand, so the verification is manual
- Done when: No open issue on the CHS backlog sits in archive or any other terminal lane; Nothing in this repository moves project Status to a terminal lane; The corrected Status flow is documented where an agent will read it, not only in session memory; The not_planned/duplicate exception is the only documented manual terminal move
- Tracker: Verify and close. The incident was fixed and the prevention is in the repo, so there is no code work here. The one thing worth carrying forward is the gap named above: nothing detects an open item in a terminal lane, and that is what allowed a sweep to go unnoticed until a human looked.

### [#1998](https://github.com/chester-hill-solutions/callcaster/issues/1998) Ensure workspace audio and inbound call audio are never mixed
- Verdict: **Verify and close** · Size: XS · Risk: medium · Labels: enhancement · Assignee: none · Updated: 2026-09-22
- Recommended title: **Workspace audio library and caller/call audio split into separate key prefixes; migration tool shipped**
- Shipped in PR #1999 (27601c58), which is in the dev history. The split is real: app/lib/platform-media.server.ts:79-80 documents that caller voicemails live under voicemail/<ws>/ and Twilio recordings under call-recordings/<ws>/, outside the library prefix, and the migration tool exists at scripts/migrate-media-namespaces.ts with the npm script tools:media-namespace-migrate (dry-run by default, --apply to move). Tests were added alongside: test/media-namespace-migrate.server.test.ts, test/voicemail-media.server.test.ts, and test/call-recording-storage.server.test.ts was extended.
- Current behavior: Library audio, caller voicemails and call recordings live in three different key prefixes, so the filename-prefix heuristics the issue listed are gone.
- Root cause: One bucket and one key prefix for three different kinds of media, which forced every consumer to guess from a filename and produced junk like voicemail-undefined.
- Resolution: No code. The one remaining step is operational and is what makes this verifiable: run tools:media-namespace-migrate in dry-run on the review environment, check the counts, then --apply, then confirm the voicemails page and call-history playback still resolve their objects. Then repeat on prod. If the dry-run reports objects it cannot classify, that is a real gap — file it rather than forcing them across. Close when the review environment passes, since the code half is already merged.
- Look in: `app/lib/platform-media.server.ts:75-85 (the prefix split and the comment replacing the heuristics)`, `scripts/migrate-media-namespaces.ts and package.json tools:media-namespace-migrate (dry-run default, --apply)`, `app/lib/object-storage.server.ts (bucket + key layout for workspaceAudio)`, `app/routes/api+/email-vm.action.server.ts (the voicemail writer, now writing voicemail/<ws>/)`
- Existing tests: test/media-namespace-migrate.server.test.ts; test/voicemail-media.server.test.ts; test/call-recording-storage.server.test.ts
- Missing tests: no test asserts that a voicemail object and a call recording are invisible to listWorkspaceAudiosApi, which is the whole point of the change; no test asserts the migrator is idempotent, so running it twice is unproven safe; no test covers an unclassifiable pre-split object, which is the case most likely to strand history
- Done when: The review environment runs the migration dry-run, applies it, and the voicemails page and call-history playback still work; The audio library no longer lists voicemails or call recordings; No voicemail- or recording- filename heuristics remain in the code; The migration is idempotent and reports anything it cannot classify; The prod run happens after the review run and is recorded
- Tracker: Verify and close, after the migration dry-run on the review environment. The code and the tests are merged; the only thing outstanding is running the tool, and that run is the verification rather than new work. Risk is medium only because the tool moves objects — which is why the dry-run default exists and why it should be run on review first.

### [#1980](https://github.com/chester-hill-solutions/callcaster/issues/1980) Remove "From the workspace audio library" from IVR Script add a recording step
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-22
- Recommended title: **Trim IVR add-a-recording help copy: drop 'From the workspace audio library'**
- Design nit: the add-a-recording step's recording select shows helper text 'From the workspace audio library.' (ScriptBlockEditor.IvrStep.tsx:304). Remove it (the picker already frames the library context) and any now-redundant spacing.
- Current behavior: ScriptBlockEditor.IvrStep.tsx:304 renders 'From the workspace audio library.' under the recording control.
- Resolution: Remove the helper text line; verify the RecordingStepFields block still reads clean with the Select only.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx:304`
- Missing tests: UI smoke renders recording step without the label
- Done when: No 'From the workspace audio library' text in the IVR recording step

### [#1842](https://github.com/chester-hill-solutions/callcaster/issues/1842) IVR audio takes ~7s to start after answer (synchronous AMD suspected)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **WAV sidecar backfill for existing prompts (gen-wav-sidecars)**
- PR #1968 wires WAV sidecar creation only on NEW audio (upload: platform-media.server.ts:135-139; clip save: audio-clip.server.ts:87). The in-browser recording path (audios/record.action.server.ts:76) never writes a sidecar either. Backfill needed so EXISTING prompts (incl. recorded-*) stop being re-encoded by Twilio.
- Current behavior: Sidecar logic lives in app/lib/ivr-wav.server.ts: ivrWavObjectKey (ivr-wav/<workspace>/<base>.wav), writeIvrWavSidecar (skips .wav, transcodeToWavBuffer, putMediaObject upsert), resolveIvrPromptObjectKey prefers the sidecar via objectExists. Transcode: app/lib/audio.server.ts transcodeToWavBuffer (mono 8kHz 16-bit PCM, WAV_ENCODE_ARGS:74-84) via raw ffmpeg spawn (runAudioTool:143-186); ffmpeg is a runtime dep (Dockerfile:33-38). Storage is S3 (MinIO local / Railway Bucket prod) with workspaceAudio/ prefix; workspace_audio is metadata-only. Prompt filter isWorkspaceAudioFile excludes voicemail-+/voicemail-undefined/recording- (platform-media.server.ts:30-35).
- Root cause: Sidecar generation is opportunistic (only at write time); thousands of pre-existing MP3 prompts and recorded-* files never got one.
- Resolution: Add scripts/gen-wav-sidecars.ts (bun-resolved @/ aliases; package.json tools:gen-wav-sidecars) modeled on scripts/db/reconcile-stuck-calls.ts (env placeholder bootstrap BEFORE app imports 28-50; dry-run default, --apply, per-workspace error isolation, non-zero exit on residual). Loop: select workspaces; listMediaObjects('workspaceAudio', ws) prefix ws/; filter to prompts (isWorkspaceAudioFile, skip existing .wav); dedupe gate objectExists(ivrWavObjectKey) unless --force; downloadObject -> transcodeToWavBuffer -> putMediaObject(upsert:true). Factor a pure core with injectable Deps (DI style of audio.server.ts:42-52) for unit tests mocking listObjects/objectExists/transcode/upload (ivr-wav.server.test.ts pattern). Include recorded-* library recordings (the record path never sidecared them); keep the voicemail- exclusion. Never pipe:0 input (seekable temp file required for mp4/m4a moov), skip empty transcode output.
- Look in: `app/lib/ivr-wav.server.ts`, `app/lib/audio.server.ts`, `app/lib/object-storage.server.ts`, `scripts/db/reconcile-stuck-calls.ts`, `app/routes/workspaces+/$id/audios/record.action.server.ts`
- Existing tests: test/ivr-wav.server.test.ts (key/sidecar/resolve); test/audio.server.test.ts (transcode)
- Missing tests: Backfill core: lists prompts, skips existing sidecars + .wav, dedupes/--force, records per-workspace failures
- Done when: All prompts incl. recorded-* have a sidecar after a apply run (idempotent re-runs); No new deps; reuses ivrWavObjectKey/transcodeToWavBuffer/putMediaObject
- Tracker: Implemented on dev (PR #1994, merged). Run `npm run tools:gen-wav-sidecars -- --apply` against the review env first, then prod; verify sidecars appear (\`ivr-wav/<ws>/…\`) and IVR playback uses them, then close.

### [#1883](https://github.com/chester-hill-solutions/callcaster/issues/1883) IVR step: configurable no-input handling (wait length + reroute/replay)
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **IVR no-input editor panel + inbound mirror**
- IMPLEMENTED on dev (#1992 merged 2026-09-22). Runtime+outbound half of #1937 shipped: ...
- Current behavior: Editor: ScriptBlockEditor.IvrStep.tsx has mode/speech/recording/voice controls but no no-input panel; the response rows (IvrResponses.tsx) only set option.next/label. Inbound: inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts:50-69 findNextStep ignores noInput; null userInput falls through to linear next/hangup; renderTerminalTarget (:71-123) has no noInput branch.
- Root cause: PR #1937 kept the editor panel and inbound twin out to stay atomic; the wire fields have no producer.
- Resolution: Editor: add per-step controls in ScriptBlockEditor.IvrStep.tsx writing block.noInput {action,pageId,blockId,maxReplays} + gatherTimeoutSeconds (defaults unchanged when unset). Inbound: mirror the outbound no-input branching into the inbound response route with a CALL-scoped replay store (no outreach attempt exists inbound; key by call/recurring session) and reuse resolveNoInputTarget + DEFAULT_NO_INPUT_MAX_REPLAYS. Fold #1843 or close it as duplicate.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-gather.server.ts`
- Existing tests: test/ivr-block-runtime.test.ts (resolveNoInputTarget); test/ivr-gather.test.ts (timeout attrs); test/inbound-ivr-block-response.route.test.ts:144-161 (null-input falls through)
- Missing tests: Editor emits wait/no-input controls; Inbound no-input branches (hangup/route/replay) + per-call replay cap
- Done when: A step can wait longer than the default and, on no input, replay or route instead of just advancing; Defaults unchanged for steps that do not configure it; Inbound mirrors outbound behavior with its own replay store
- Tracker: Implemented on dev (PR #1992, merged). Verify on the review env: #1883 editor no-input panel writes the fields + inbound mirrors the cap; #1884 dangling/cycle scripts block launch with script_routing_invalid and the editor shows the errors. Then close.

### [#1884](https://github.com/chester-hill-solutions/callcaster/issues/1884) IVR editor: expose an explicit Hang up routing target and a guaranteed terminal hangup
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **IVR editor routing validation + terminal-hangup guarantee**
- IMPLEMENTED on dev (#1991 merged 2026-09-22). Runtime half largely shipped (#1975): ou...
- Current behavior: Dangling option.next targets redirect to the block route which plays 'There was an error in the IVR flow. Goodbye.' then hangs up (outbound + inbound); routing cycles are undetected; no editor warning. Editor structural validation is scriptkit validateDocument only (parse.ts:22-40): startPageId exists + page/block refs — no next-target/cycle checks. clearDanglingRouting (use-script-editor-state.js:427-440) only clears when an id is deleted, not for malformed imports.
- Root cause: The runtime parses next as an opaque string with no terminal/validation contract.
- Resolution: Add app/lib/ivr-script-validation.ts: build an edge graph (page/block -> option.next targets) and run a DFS for (a) dangling targets (next refers to a nonexistent page/block), (b) reachable cycles (A->B->A), (c) terminal guarantee (every reachable path ends at hangup/end). Surface errors in ScriptEditorShell.tsx alongside editor.validation. Wire into validateScriptSteps (call-script-service.ts) and add a script_routing_invalid CampaignReadinessCode + readiness-action entry (campaign-readiness.ts:14-35 + campaign-readiness-actions.ts:35-144) so launch blocks (launchCampaign readiness gate campaign-execution.server.ts:86-95 surfaces it automatically). Inbound: make renderTerminalTarget treat 'end' explicitly and render <Hangup/> for dangling/terminal.
- Look in: `app/lib/ivr-script-validation.ts (new)`, `app/lib/call-script-service.ts`, `app/components/campaign/settings/script/ScriptEditorShell.tsx`, `app/lib/campaign-readiness.ts`, `app/lib/campaign-readiness-actions.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`
- Existing tests: test/ivr-block-response.route.test.ts:226-247 (end terminal outbound)
- Missing tests: ivr-script-routing-validation: dangling target, A->B->A cycle, hangup/end ok, linear end ok; inbound route: next:'end' renders <Hangup/>, dangling renders <Hangup/>; editor shell test shows the cyclic-script validation error
- Done when: An author can choose Hang up as an option's next step (already true); A published script always has a terminal hangup; next:'end' and 'hangup' are both terminal at runtime (inbound too); Dangling targets and reachable cycles fail validation and block launch
- Tracker: Implemented on dev (PR #1991, merged). Verify on the review env: #1883 editor no-input panel writes the fields + inbound mirrors the cap; #1884 dangling/cycle scripts block launch with script_routing_invalid and the editor shows the errors. Then close.

### [#1976](https://github.com/chester-hill-solutions/callcaster/issues/1976) IVR results and export show the raw DTMF code instead of the option label
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-21
- Recommended title: **IVR results/export show the option label (not raw DTMF)**
- Shipped in #1977 via resolveIvrAnswerLabel (app/lib/ivr-results.ts): results screen and CSV export render the option label for known keys; unknown values fall back to the raw value. Verify on the review env and close.
- Current behavior: Before fix: IvrOption labels ignored; raw DTMF was shown.
- Resolution: Verify on dev: a script with keypad options displays the chosen label in Results + export; a key with no matching option still shows the raw value.
- Look in: `app/lib/ivr-results.ts`
- Existing tests: test/ivr-results* and route tests for label resolution
- Done when: Results + export show the label the caller chose (or raw when unmatched)

### [#1936](https://github.com/chester-hill-solutions/callcaster/issues/1936) Comment policy: comments must carry information (no-useless-comments rule)
- Verdict: **Verify and close** · Size: S-M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-21
- Add a local ESLint rule callcaster/no-useless-comments (error) rejecting issue/PR-number-only and punctuation-only comments, sweep the ~20 existing offenders, and document the rule. Not implemented.
- Current behavior: eslint.config.mjs only wires upstream plugins; there is no local rule infrastructure and no no-useless-comments rule.
- Root cause: Comment hygiene is unenforced; a number or a punctuation banner passes lint.
- Resolution: Define the rule (inline plugin object in eslint.config.mjs, or a small local-rules module), set it to error, fix the offenders, add rule unit tests, and document the intent.
- Look in: `eslint.config.mjs`, `package.json`, `app/`, `test/`
- Missing tests: Rule unit tests: number-only comment fails, punctuation-only comment fails, informative comment passes
- Done when: Issue/PR-number-only comments are lint errors; Punctuation-only comments are lint errors; Existing offenders are zero; Rule intent is documented
- Tracker: Implemented on dev (PR #1974 5fd10f49 + sweep/docs PR #1979 356e3efe): callcaster/no-useless-comments is error with unit tests (test/no-useless-comments-rule.test.ts), zero offenders, intent documented. Verify eslint passes and close.

### [#1859](https://github.com/chester-hill-solutions/callcaster/issues/1859) Show campaign costs un-collapsed on the Launch page
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-21
- The campaign cost panel is still wrapped in a collapsed <details> labelled 'Campaign cost' in CampaignLaunch.tsx. Remove the fold and render CampaignCostPanel directly.
- Current behavior: CampaignLaunch.tsx (~449-462) renders <details><summary>Campaign cost</summary><CampaignCostPanel .../></details> when campaignBilling is present.
- Root cause: The cost panel was placed inside a disclosure widget split out from the #1839 review.
- Resolution: Render CampaignCostPanel directly (guarded by the existing campaignBilling ternary) and delete the <details>/<summary> wrapper and its inner mt-3 div. Keep the null/absent behaviour when campaignBilling is null.
- Look in: `app/components/campaign/settings/CampaignLaunch.tsx`
- Existing tests: test/ui/campaign-launch-review.test.tsx
- Missing tests: Cost panel is visible on Launch without expanding any disclosure; No cost panel renders when campaignBilling is null
- Done when: Campaign costs are visible on the Launch page without expanding anything; No 'Campaign cost' details/summary remains; Absent behaviour unchanged when campaignBilling is null
- Tracker: Implemented on dev (PR #1970 829e3b9e): CampaignLaunch renders CampaignCostPanel directly; the <details><summary>Campaign cost</summary> wrapper is gone; campaign-launch-review.test.tsx asserts no disclosure remains. Verify and close.

### [#1845](https://github.com/chester-hill-solutions/callcaster/issues/1845) Live campaign calls keep synchronous AMD latency when voicemail drop is off
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-21
- Recommended title: **fix(dial): drop synchronous AMD from manual/power dials; keep it predictive-only**
- Manual call-creation paths still send machineDetection:'Enable', so an answered manual call waits for the AMD verdict. Decision couples AMD to dial mode: predictive keeps it, manual/power turns it off and uses the agent's Audio Drop button. IVR keeps AMD (see #1842/#1864).
- Current behavior: machineDetection:'Enable' at call.action.server.ts:108 and dial/$number.action.server.ts:73; auto-dial.server.ts:63 keeps it. test/api-call.route.test.ts:180 asserts machineDetection="Enable".
- Root cause: AMD was added unconditionally to support auto voicemail drop; on manual/power calls an agent is already on the line.
- Resolution: Remove machineDetection (and any AMD-callback wiring) from call.action.server.ts and dial/$number.action.server.ts; keep it in auto-dial.server.ts. Confirm the Audio Drop control stays visible when voicedrop_audio is set. Update the api-call test and add a regression that auto-dial still sets it.
- Look in: `app/routes/api+/call.action.server.ts`, `app/routes/api+/dial/$number.action.server.ts`, `app/lib/auto-dial.server.ts`, `app/routes/api+/dial/status.action.server.ts`, `app/components/call/CallScreen.CallArea.tsx`
- Existing tests: test/api-call.route.test.ts; test/dial-number.route.test.ts; test/dial-status.route.test.ts; test/auto-dial.server.test.ts
- Missing tests: manual routes emit no machineDetection; auto-dial still emits machineDetection; Audio Drop still works on manual/power calls
- Done when: A manual/power call reaches audio immediately with no AMD wait; Predictive dialing still drops or hangs up on a detected machine; A drop-enabled campaign still plays the voicemail when an agent drops it
- Tracker: Implemented on dev (PR #1969 86794a3d): manual/power dials no longer send machineDetection (call.action.server.ts, dial/$number), auto-dial keeps it; tests assert both. Verify on the review env and close.

### [#1830](https://github.com/chester-hill-solutions/callcaster/issues/1830) Tasks for other devs that are blocking movement on an issue should be new tickets, that are set to "blocking" the other issue and correctly assigned. GH agent skills should reflect
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: devops/admin · Assignee: none · Updated: 2026-09-21
- Recommended title: **Codify blocking cross-developer tasks as assigned tickets in the GitHub agent skills**
- Request that work another developer must do to unblock an issue becomes a separate ticket, set to block that issue and assigned to the right person, and that the agent skills say so.
- Current behavior: github-issues/SKILL.md covers issue types, parent/child decomposition, and the --blocked-by / --blocking flags, but does not require creating a separate assigned ticket when another dev's task blocks an issue.
- Root cause: The skill documents the mechanics of blocking links but not the policy that blocking work is its own assigned ticket.
- Resolution: Add a section to .agents/skills/github-issues/SKILL.md stating that blocking cross-developer work is created as a new Task, linked with --blocking <blocked issue> (or --blocked-by on the blocked issue), and assigned with --assignee; include a worked example.
- Look in: `.agents/skills/github-issues/SKILL.md`, `.agents/skills/github-cli/SKILL.md`, `.agents/skills/github-pull-request/SKILL.md`
- Done when: The skill states blocking work becomes a separate ticket; The skill shows the blocking link direction and assignment; The example uses --blocking and --assignee correctly
- Tracker: Implemented on dev (PR #1965 ac6aaef6): github-issues SKILL.md documents cross-developer blockers as assigned, one-direction blocking tickets. Verify and close.

### [#1961](https://github.com/chester-hill-solutions/callcaster/issues/1961) issue-on-dev aborts the Status move when a PR body references a non-issue number
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-21
- Recommended title: **issue-on-dev abort when PR bodies reference non-issue numbers**
- Fixed by #1964: issue-on-dev.yml now parses closing keywords and 'Issues:' lines with PR-number robustness, and the parser ignores bare PR-number references. Verify a merge with a body containing issue numbers doesn't abort the loop, then close.
- Current behavior: Before: 'gh issue view' on a PR number returned MERGED and the GraphQL move loop aborted.
- Resolution: Verify with a reference PR whose body names issues + a PR number; confirm Status moves complete. #1961 is docs/automation only.
- Look in: `.github/workflows/issue-on-dev.yml`
- Done when: The move loop completes when a PR body references issue numbers

### [#1957](https://github.com/chester-hill-solutions/callcaster/issues/1957) Exempt docs/data-only PRs from the review-coverage gate
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-21
- The review-coverage gate now skips docs/data-only PRs, i.e. when every changed file is ISSUE_BOARD.md or under scripts/issue-board-enrichment/.
- Resolution: Verify on dev that a board-only PR over ~500 lines passes without a Structural review marker, and a code PR does not. Close on master promotion.
- Look in: `.github/workflows/review-coverage.yml`
- Done when: A docs/data-only PR over 500 lines passes without the marker; Any code path keeps the marker requirement
- Tracker: Merged on dev in PR #1959; closes on master promotion.

### [#1886](https://github.com/chester-hill-solutions/callcaster/issues/1886) Run db:schema:check per deployed environment (DB-backed gate)
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-09-21
- scripts/db/check-schema-drift.mjs (db:schema:check) compares app-required tables/columns/functions/enum values against the live DB, but nothing invokes it: absent from ci:local and from .github/workflows/ledger-drift-check.yml. It also lacks --require-db. No PR exists.
- Current behavior: Running the script with no DATABASE_URL prints a message and exits 2; no workflow runs it. A deployed environment missing a required object is not caught.
- Root cause: The checker was added as a tool but never connected to a DB-backed per-environment gate.
- Resolution: Add --require-db (or SCHEMA_CHECK_REQUIRE_DB=1) to scripts/db/check-schema-drift.mjs mirroring check-migration-ledger.mjs so a missing URL exits 1; add a --require-db step after each ledger step in ledger-drift-check.yml; extend push paths; factor flag/URL resolution into a pure helper in scripts/lib/app-db-objects.mjs and unit-test it. Type parity is a follow-up.
- Look in: `scripts/db/check-schema-drift.mjs`, `scripts/db/check-migration-ledger.mjs`, `.github/workflows/ledger-drift-check.yml`, `scripts/lib/app-db-objects.mjs`, `test/schema-drift-enums.test.ts`
- Existing tests: test/schema-drift-enums.test.ts
- Missing tests: Shared arg/URL resolver: flag + no URL => exit 1; no flag + no URL => exit 2; URL present => the URL
- Done when: A deployed environment missing a required object fails the workflow.; A missing DATABASE_URL fails the workflow rather than no-op passing.; Push path filters include the schema files and the checker.
- Tracker: Implemented on dev (PR #1958 d8d5639e): ledger-drift-check.yml runs db:schema:check --require-db per environment; resolver tests in test/schema-drift-enums.test.ts. Verify the workflow gates a missing object and close.

### [#1956](https://github.com/chester-hill-solutions/callcaster/issues/1956) Release PRs must close the issues they promote (Closes #N)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-21
- release-close-issues.yml requires a closing keyword (Closes #N) in a dev to master release PR body, with a no-issue override; the local-development skill documents it.
- Resolution: Verify on dev that a master PR without a closing reference fails the gate unless labelled no-issue. Close on master promotion.
- Look in: `.github/workflows/release-close-issues.yml`, `.agents/skills/local-development/SKILL.md`
- Done when: A release PR carrying Closes #N closes those issues on merge; A master PR with no closing reference fails unless labelled no-issue
- Tracker: Merged on dev in PR #1960; closes on master promotion.

### [#1716](https://github.com/chester-hill-solutions/callcaster/issues/1716) workspace drop down shouldn't move
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-20
- Navbar credit count removed on desktop and mobile so the workspace dropdown no longer shifts; the count stays in the workspace sidebar (WorkspaceNav).
- Resolution: Verify on the review environment that no Credits readout appears in the navbar and the workspace dropdown holds its position; the sidebar still shows credits. Close on master promotion.
- Look in: `app/components/layout/Navbar.tsx`, `app/components/layout/Navbar.MobileMenu.tsx`, `app/components/workspace/WorkspaceNav.tsx`
- Existing tests: test/ui/navbar-credits.test.tsx; test/ui/components-shared-invite-layout.test.tsx
- Done when: No navbar-credits testid and no 'Credits:' link in the nav shell; sidebar credits unchanged.
- Tracker: Merged on dev in PR #1950 (2180c94d); closes on master promotion.

### [#1805](https://github.com/chester-hill-solutions/callcaster/issues/1805) security(deps): patch nanoid 3.x lockfile resolutions
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-20
- PR #1807 (814d804f) shipped Nano ID 3.3.19 in both lockfiles. Unaffected 5.1.16 consumers remain unchanged.
- Resolution: Verify default-branch promotion and Dependabot alert #209 after release. No further Nano ID change is expected unless a new affected version is found.
- Look in: `package-lock.json`, `bun.lock`
- Existing tests: PR #1807: both package-manager installs, frozen Bun check, full ci:local
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1715](https://github.com/chester-hill-solutions/callcaster/issues/1715) Profile drop down changes
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: @wra-sol · Updated: 2026-09-20
- Profile dropdown trimmed to username, Account, Invitations: N (with an open-mail icon), and Log Out; profile-info heading, first name, and Workspace settings link removed.
- Resolution: Verify on the review environment that the account menu shows only username / Account / Invitations: N / Log Out. Close on master promotion.
- Look in: `app/components/layout/Navbar.tsx`
- Existing tests: test/ui/navbar-user-menu.test.tsx
- Done when: No profile-info heading, first name, padding, or Workspace settings link; invitations labelled 'Invitations: N' with a mail-open icon.
- Tracker: Merged on dev in PR #1949 (7bf76e25); closes on master promotion.

### [#1854](https://github.com/chester-hill-solutions/callcaster/issues/1854) Public API: reject simple_ivr / complex_ivr with a steering error (#1741 follow-up)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-20
- The public campaign-creation API now rejects legacy simple_ivr/complex_ivr with a steering error to robocall, and OpenAPI plus docs advertise only the supported types. Shipped on dev in PR #1904 (078c797f).
- Current behavior: A create request with type simple_ivr/complex_ivr fails validation with '"<value>" is no longer supported; use "robocall" instead'. OpenAPI enums, generated clients and docs list only live_call/robocall.
- Root cause: The create-with-script schema advertised simple_ivr/complex_ivr and mapped them to the ivr script kind.
- Resolution: No code work left. Verify the rejection message and docs on the review env, then close when dev is promoted to master.
- Look in: `app/lib/schemas/api/create-with-script.ts`, `app/lib/create-with-script.server.ts`, `app/lib/campaign-settings.ts`, `app/lib/openapi-integrator.ts`, `docs/api-create-campaign-with-script.md`
- Existing tests: test/campaigns-create-with-script.route.test.ts; test/openapi.test.ts
- Done when: A simple_ivr/complex_ivr create request fails with a message directing the caller to robocall; OpenAPI and the public docs list only the supported types
- Tracker: Verify and close. Dev-only: 078c797f is in origin/dev but not origin/master; close when dev promotes to master.

### [#1940](https://github.com/chester-hill-solutions/callcaster/issues/1940) Task: construct the workspace-scoped tenant client in middleware
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-20
- Merged to dev in PR #1941 (58bea105): workspace and data-plane middleware build the scoped Drizzle client once and expose it as tdb on the context; 14 workspaces+/$id routes read it.
- Resolution: Verify typecheck, test:node, test:ui, and that no createTenantDb remains under app/routes/workspaces+. Close on master promotion.
- Look in: `app/lib/route-context.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/workspace-route.server.ts`
- Existing tests: test/tenant-db.test.ts
- Done when: No createTenantDb under app/routes/workspaces+; tdb built once per workspace request
- Tracker: PR #1941 merge 58bea105 is on dev, not yet master.

### [#1938](https://github.com/chester-hill-solutions/callcaster/issues/1938) Epic: construct the scoped tenant client in middleware and enforce the boundary beyond routes
- Verdict: **Verify and close** · Size: L-XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-20
- All three children shipped on dev: middleware builds the scoped tdb once (#1940/PR #1941), the unscoped admin client is banned in app/lib with a ratchet baseline (#1939/PR #1943), and the base db client is ratcheted too (#1942/PR #1944). The epic's acceptance is met on dev.
- Current behavior: workspaceMiddleware and dataPlaneMiddleware build createTenantDb(workspaceId) once and expose tdb on the route context; workspaces+ routes read context.tdb. scripts/check-unscoped-db-imports.mjs bans @/server/admin-db and @/server/db in app/lib against an 81-entry baseline.
- Root cause: The scoped-client rule was enforced only in app/routes; app/lib was honor-system.
- Resolution: No code work left. Verify on the review env that no workspaces+ route constructs createTenantDb and that the unscoped-import guard fails on a probe import, then close when dev is promoted to master.
- Look in: `app/lib/route-context.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/workspace-route.server.ts`, `scripts/check-unscoped-db-imports.mjs`, `scripts/baselines/unscoped-db-imports.txt`, `eslint.config.mjs`
- Existing tests: test/helpers/route-context-mock.ts; test/ci-guard-scripts.test.ts
- Missing tests: A guard probe that a new app/lib module importing @/server/admin-db fails the run
- Done when: No route file under app/routes constructs createTenantDb for a plain request-scoped read or write; tdb is built once per workspace request, in middleware; A new app/lib module cannot import @/server/admin-db without adding itself to a ratchet allowlist; npm run ci:local is green
- Tracker: Verify and close. Children #1939/#1940/#1942 merged to dev (PRs #1943/#1941/#1944) but not master; close the epic when dev promotes to master.

### [#1932](https://github.com/chester-hill-solutions/callcaster/issues/1932) Systemic structural review: PR risk template + coverage gate
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- PR #1935 (93def136) added .github/pull_request_template.md and the review-coverage workflow gate: high-risk paths or a ~500-line diff require a Structural review: marker. Shipped on dev only.
- Current behavior: Every PR body declares Files touched / Risk class / Structural review; the review-coverage workflow fails a PR that touches app/lib/worker/, app/server/, app/db/ or client/migrations/, or crosses the line cap, without the marker.
- Root cause: Structural review was an end-of-batch habit, so problems were caught after merge.
- Resolution: No code work left in-repo. Verify the gate fails an unmarked high-risk PR on the review env, then close when dev is promoted to master.
- Look in: `.github/pull_request_template.md`, `.github/workflows/review-coverage.yml`, `.github/workflows/pr-issue-reference.yml`
- Existing tests: Workflow self-validates on its own PR
- Done when: PR template declares risk surface; Gate fails high-risk PRs without a Structural review: marker; ci:local green
- Tracker: Verify and close. Dev-only (93def136 not in master); confirm the marker is enforced, then close on promotion.

### [#1931](https://github.com/chester-hill-solutions/callcaster/issues/1931) Ratchet the test echo-shape: expectations that reuse SUT exports
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- PR #1933 (3bfd5210) added scripts/check-test-echo.mjs plus an empty baseline, wired check:test-echo into ci:local, and converted the remaining echo candidates. Shipped on dev only.
- Current behavior: check:test-echo scans test/ for toBe/toEqual/toContain whose expected argument is an identifier imported from app/ or shared/; scripts/test-echo-baseline.json is {}.
- Root cause: Assertions could echo SUT exports, so any value the SUT chose would pass.
- Resolution: No code work left. Re-run npm run check:test-echo on the review env, then close when dev is promoted to master.
- Look in: `scripts/check-test-echo.mjs`, `scripts/test-echo-baseline.json`, `package.json`, `.github/workflows/ci.yml`
- Existing tests: test/test-echo-checker.test.ts
- Done when: check:test-echo reports echo-shaped expectations; Existing occurrences are zero; the count only ratchets down; Both suites stay green
- Tracker: Verify and close. Dev-only (3bfd5210 not in master); baseline is empty.

### [#1925](https://github.com/chester-hill-solutions/callcaster/issues/1925) Prune tautological tests (echo tests) with kill-verification
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- First tautological-test prune pass shipped on dev in PR #1929 (5ab94de6), pinning echoed constants as literals across five tests with kill-verification. The remaining sweep is tracked by #1931.
- Current behavior: audience-upload-chunk-delay, campaign-terminology, number-rental, throughput-config, and tts-voices tests now assert literal expectations instead of SUT-derived values.
- Root cause: Tests whose expectations echoed the implementation stayed green while the behaviour could rot.
- Resolution: No code work left for this pass. Verify the five converted tests are kill-verified, then close when dev is promoted to master; the wider sweep continues in #1931.
- Look in: `test/audience-upload-chunk-delay.test.ts`, `test/campaign-terminology.test.ts`, `test/number-rental.test.ts`, `test/throughput-config.server.test.ts`, `test/tts-voices.test.ts`
- Existing tests: The five converted test files themselves
- Done when: Each rewritten test is listed with its kill-check outcome in the PR; Both suites stay green; no behaviour coverage is lost
- Tracker: Verify and close. Dev-only (5ab94de6 not in master); follow-on sweep is #1931.

### [#1924](https://github.com/chester-hill-solutions/callcaster/issues/1924) Effects gate: require @effect-why-not-loader and flag 'none' side-effects
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- PR #1928 (e15dda5b) made @effect-why-not-loader a required tag (or a CANDIDATE-REMOVE marker), extracted the compliance predicate to scripts/lib/effects-lib.mjs, and unit-tested it. Shipped on dev only.
- Current behavior: scripts/check-effects.mjs fails an effect without @effect-why-not-loader unless it carries the CANDIDATE-REMOVE purpose marker; the 'side-effects: none => CANDIDATE-REMOVE' half was deliberately dropped as overbroad.
- Root cause: The why-not-loader tag was optional.
- Resolution: No code work left. Verify check:effects on the review env, then close when dev is promoted to master; docs/effects-strictness.md records why 'none' is not auto-flagged.
- Look in: `scripts/check-effects.mjs`, `scripts/lib/effects-lib.mjs`, `docs/effects-strictness.md`, `docs/effects-inventory.md`
- Existing tests: test/effects-compliance.test.ts
- Done when: Every effect requires a non-empty @effect-why-not-loader or the CANDIDATE-REMOVE marker; Existing effects backfilled; weak ones marked CANDIDATE-REMOVE; docs/effects-strictness.md documents the requirement
- Tracker: Verify and close. Dev-only (e15dda5b not in master).

### [#1910](https://github.com/chester-hill-solutions/callcaster/issues/1910) Issue board: render unenriched issues in a Needs triage lane
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- PR #1927 (87ecef16) made the board generator render unenriched open issues in a Needs triage lane instead of refusing to write, while still validating existing records. Shipped on dev only.
- Current behavior: npm run tools:issues:board exits 0 and writes a board that includes every open issue; unenriched issues land in Needs triage. A malformed enriched record still fails the run.
- Root cause: The generator required an enrichment record for every open issue, so the board could not refresh.
- Resolution: No code work left. Verify the generator exits 0 and a malformed record still fails on the review env, then close when dev is promoted to master.
- Look in: `scripts/issue-board-generate.mjs`, `scripts/issue-board-lib.mjs`, `scripts/issue-board-enrichment/`
- Existing tests: test/issue-board-generator.test.ts
- Done when: tools:issues:board exits 0 and includes every open issue, unenriched ones in Needs triage; A malformed enriched record still fails the run; The board header reports the Needs-triage count
- Tracker: Verify and close. Dev-only (87ecef16 not in master).

### [#1897](https://github.com/chester-hill-solutions/callcaster/issues/1897) Guardrails: git hooks + PR issue-reference gate
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: git hooks + PR issue-reference gate (shipped to dev in #1921/#1926)**
- Both halves shipped to dev: a checked-in pre-commit hook wired via core.hooksPath, and a PR-into-dev issue-reference gate. Merged in PR #1921 (23700b0f) and PR #1926 (f416f037). Both are ancestors of origin/dev but NOT of origin/master.
- Root cause: The repo had no git hooks and no requirement that a PR body reference an issue.
- Resolution: Verify on dev only: stage a lint error and confirm the pre-commit hook blocks the human commit; open a dev PR without an issue reference and confirm the check is red, then add no-issue and confirm it clears. No new code expected.
- Look in: `.githooks/pre-commit`, `scripts/setup-githooks.sh`, `package.json`, `.github/workflows/pr-issue-reference.yml`, `.github/workflows/issue-on-dev.yml`
- Done when: A commit with a lint error is blocked by the pre-commit hook.; A PR into dev with no issue reference fails a check unless labelled no-issue.
- Tracker: Verify and close after dev verification; promote #1921/#1926 to master first.

### [#1919](https://github.com/chester-hill-solutions/callcaster/issues/1919) Hooks: drop global-barrel exports for single-consumer hooks
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: single-consumer hooks dropped from the global barrel (#1920)**
- app/hooks/index.ts no longer exports useSurveyForm or useCampaignExport; the hooks stay reachable through their sub-barrels. Shipped to dev in PR #1920 (95f084c9); ancestor of origin/dev, NOT of origin/master.
- Root cause: The #1892 DRY pass widened the global barrel with hooks that have one consumer each.
- Resolution: Verify on dev: rg the two hook names in app/hooks/index.ts finds no export, and the survey/export tests stay green. No new code expected.
- Look in: `app/hooks/index.ts`, `app/hooks/surveys/index.ts`, `app/hooks/campaign/index.ts`
- Existing tests: test/ui/use-survey-form.test.tsx; test/ui/campaign-export-button.test.tsx
- Done when: The global-barrel exports are dropped; the sub-barrels keep the hooks.; No import breaks.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1918](https://github.com/chester-hill-solutions/callcaster/issues/1918) Queue item relations: return grouped contact maps
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: loadQueueItemRelations returns grouped contact maps (#1920)**
- loadQueueItemRelations in app/lib/campaign-queue-search.server.ts now returns { contactById, attemptsByContactId, audiencesByContactId } and both fetchers consume the same maps. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The helper returned raw arrays, so the page fetcher grouped them while the item fetcher re-filtered them.
- Resolution: Verify on dev: queue route suites green and both fetchers use the maps. No new code expected.
- Look in: `app/lib/campaign-queue-search.server.ts`
- Existing tests: test/campaign-queue.route.test.ts; test/campaign-queue-db.claim.test.ts; test/campaign-settings-queue.route.test.ts
- Done when: The helper returns grouped-by-contact maps used by both consumers.; The queue suites stay green.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1917](https://github.com/chester-hill-solutions/callcaster/issues/1917) Public survey guard: type the extra required fields
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: type the public survey guard's extra required fields (#1920)**
- extraRequiredFields is typed as PublicSurveyRequiredField[] in app/lib/survey-public-action.server.ts. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The shared guard encoded one route's requirement as an untyped string list.
- Resolution: Verify on dev: survey route suites stay green and the type alias is used. No new code expected.
- Look in: `app/lib/survey-public-action.server.ts`
- Existing tests: test/survey-answer.route.test.ts; test/survey-complete.route.test.ts
- Done when: extraRequiredFields is typed or the required-field check stays route-local.; Survey route suites stay green.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1916](https://github.com/chester-hill-solutions/callcaster/issues/1916) Campaign export hook: stop recreating the poll interval every tick
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: campaign export poll keyed on ids only, stops on terminal status (#1920)**
- useCampaignExport's poll effect depends on [exportId, workspaceIdStr] only and clears its interval on terminal status. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: Keying the interval on exportStatus tore down and restarted the 2s timer on every status change.
- Resolution: Verify on dev: test/ui/campaign-export-button.test.tsx covers start -> poll -> completed with fake timers. No new code expected.
- Look in: `app/hooks/campaign/useCampaignExport.ts`, `app/components/campaign/CampaignExportButton.tsx`
- Existing tests: test/ui/campaign-export-button.test.tsx
- Done when: The interval is keyed on exportId / workspaceIdStr only; terminal status stops polling.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1915](https://github.com/chester-hill-solutions/callcaster/issues/1915) Admin pagination: consolidate onto the canonical TablePagination
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: admin pagination consolidated onto TablePagination (#1920)**
- TablePagination gained optional pageSizeOptions + onPageSizeChange; AdminPagination is deleted and the three admin panels use TablePagination. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The DRY pass extracted a near-duplicate AdminPagination instead of extending the canonical component.
- Resolution: Verify on dev: rg AdminPagination finds no imports; test/ui/table-pagination-page-size.test.tsx green. Eyeball the three admin panels' pagination. No new code expected.
- Look in: `app/components/shared/TablePagination.tsx`, `app/components/admin/`, `app/components/queue/QueueTablePagination.tsx`
- Existing tests: test/ui/table-pagination-page-size.test.tsx
- Done when: TablePagination gains the page-size select.; AdminPagination is deleted; the three admin panels use TablePagination.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1914](https://github.com/chester-hill-solutions/callcaster/issues/1914) Survey routes: share the fetcher-redirect and error extraction
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: survey routes share the fetcher redirect and error extraction (#1920)**
- app/lib/survey-submit.ts owns SurveySubmitResult, surveySubmitError, and surveySuccessPath; both survey routes import it and render <Navigate>. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The two routes carried ~40 duplicated lines.
- Resolution: Verify on dev: test/ui/survey-create-edit-redirect.test.tsx green and both routes import from @/lib/survey-submit. No new code expected.
- Look in: `app/lib/survey-submit.ts`, `app/routes/workspaces+/$id/surveys/new.route.tsx`, `app/routes/workspaces+/$id/surveys/$surveyId/edit.route.tsx`
- Existing tests: test/ui/survey-create-edit-redirect.test.tsx
- Done when: A shared helper owns the redirect and error extraction.; Both routes use it.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1913](https://github.com/chester-hill-solutions/callcaster/issues/1913) Decompose SurveyForm into page and question subcomponents
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: SurveyForm decomposed into page and question subcomponents (#1920)**
- SurveyForm.tsx defines SurveyQuestionCard and SurveyPageSection; the top-level SurveyForm function is under the 200-line threshold. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The file held a 265-line function with everything inline.
- Resolution: Verify on dev: lint reports no max-lines-per-function warning and survey tests stay green. No new code expected.
- Look in: `app/components/surveys/SurveyForm.tsx`
- Existing tests: test/ui/survey-create-edit-redirect.test.tsx; test/ui/use-survey-form.test.tsx
- Done when: SurveyPageSection and SurveyQuestionCard are extracted.; The top-level function drops under the threshold.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1912](https://github.com/chester-hill-solutions/callcaster/issues/1912) Survey form hook: duplicate page/question ids after a removal
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Recommended title: **verify-close: survey ids derive from the highest suffix, unique after removal (#1920)**
- useSurveyForm derives new page/question ids from nextSuffix() (highest existing suffix + 1) and a regression test asserts ids stay unique after a middle removal. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: Ids were derived from array.length + 1, which collides after a middle removal.
- Resolution: Verify on dev: test/ui/use-survey-form.test.tsx includes the uniqueness regression. No new code expected.
- Look in: `app/hooks/surveys/useSurveyForm.ts`, `test/ui/use-survey-form.test.tsx`
- Existing tests: test/ui/use-survey-form.test.tsx
- Done when: New ids derive from the max existing numeric suffix.; A test adds three, removes the middle, adds another, asserts unique ids.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1739](https://github.com/chester-hill-solutions/callcaster/issues/1739) Workspace notification emails should mention the workspace name in the email
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-19
- Fixed on dev in PR #1902 (f081cee8): the low-credit notification email names the workspace in its subject and body from the notify context. The open state does not prove the fix is absent.
- Resolution: Verify on the review environment that the low-credit email subject and body name the workspace. Close on master promotion. Do not reimplement the template change.
- Look in: `app/lib/low-credit-notify.server.ts`
- Existing tests: test/low-credit-notify.server.test.ts
- Done when: Low-credit email subject and body name the workspace
- Tracker: PR #1902 merge f081cee8 is on dev, not yet master. Closes on master promotion.

### [#1889](https://github.com/chester-hill-solutions/callcaster/issues/1889) Predictive auto-dial drops a voicemail even when the voicemail drop switch is off
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-19
- Recommended title: **Verify: predictive auto-dial honours the voicemail-drop switch**
- Fixed on dev in PR #1901 (16a7abdd, merged 2026-09-19, base dev). NOT in master (origin/master 807cea82), so dev-only until the next release.
- Current behavior: On dev, the predictive AMD branch reads voicemail_drop_enabled and calls machineAnswerDisposition.
- Root cause: The AMD branch read campaign.voicemail_file but never campaign.voicemail_drop_enabled.
- Resolution: No new code. Verify on the review environment, then close when promoted to master.
- Look in: `app/routes/api+/auto-dial/$roomId.action.server.ts`, `app/lib/telephony-db.server.ts`, `app/lib/ivr-machine.server.ts`
- Existing tests: test/auto-dial-room.route.test.ts; test/integration-db/call-status-guard.test.ts; test/telephony-db-call-status-guard.test.ts
- Done when: Predictive + machine + drop off yields No Answer with no audio; Predictive + machine + drop on yields Voicemail with the drop played
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#1869](https://github.com/chester-hill-solutions/callcaster/issues/1869) Test calls must not change the campaign queue
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-19
- Recommended title: **Verify: test calls leave the campaign queue untouched**
- Fixed on dev in PR #1900 (2a2eb281, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, the dequeue block in webhook-side-effects.server.ts is gated on outreachAttemptId != null.
- Root cause: The contact-keyed dequeue had no guard on the resolved outreach attempt, so any terminal callback with a contact_id could mutate the queue.
- Resolution: No new code. Verify on the review environment, then close when promoted to master.
- Look in: `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/routes/api+/call-status.action.server.ts`
- Existing tests: test/webhook-side-effects.test.ts
- Done when: A test call to a queued number leaves queue_state queued, queue_order unchanged, attempts unchanged and dequeued_at null
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#1727](https://github.com/chester-hill-solutions/callcaster/issues/1727) Campaign List should be sorted
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-19
- Fixed on dev in PR #1899 (9a82cbce): the campaigns list sorts by status group then newest first, via app/lib/campaign-list-order.ts. The open state does not prove the fix is absent.
- Resolution: Verify on the review environment that the list orders running, then waiting, then draft, then complete, newest first within each group. Close on master promotion. Do not reimplement the sort.
- Look in: `app/lib/campaign-list-order.ts`
- Existing tests: test/campaign-list-order.test.ts
- Done when: Campaign list orders running, waiting, draft, complete, newest first within each group
- Tracker: PR #1899 merge 9a82cbce is on dev, not yet master. Closes on master promotion.

### [#1894](https://github.com/chester-hill-solutions/callcaster/issues/1894) Pin the test suite to UTC
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-19
- Recommended title: **Verify: the test suite is pinned to UTC**
- Fixed on dev in PR #1898 (4079b7ae, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, vitest.shared.config.ts:16 sets test env { TZ: "UTC" } for both projects.
- Root cause: Neither vitest.shared.config.ts nor the setup files set TZ.
- Resolution: No new code. Verify on the review environment and a non-UTC machine, then close when promoted to master.
- Look in: `vitest.shared.config.ts`, `test/ui/campaign-launch-eta.test.tsx`, `test/setup.node.ts`, `test/setup.ui.ts`
- Existing tests: test/ui/campaign-launch-eta.test.tsx
- Missing tests: optional guard that process.env.TZ === "UTC" inside a test
- Done when: process.env.TZ === "UTC" in node and ui tests without any per-file pin; The suite passes unchanged on a non-UTC machine
- Tracker: Verify on the review env; close when promoted to master (dev-only today). Update the AGENTS.md per-file TZ pitfall once confirmed.

### [#1891](https://github.com/chester-hill-solutions/callcaster/issues/1891) Mobile nav sheet lays its links out horizontally instead of stacking them
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-19
- Recommended title: **Verify: mobile nav sheet stacks its links vertically**
- Fixed on dev in PR #1893 (c83ad822, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, navLinkClass in Navbar.MobileMenu.tsx:37 includes block.
- Root cause: navLinkClass lacked block, so <NavLink> stayed inline.
- Resolution: No new code. Verify on the review environment at a narrow viewport, then close when promoted to master.
- Look in: `app/components/layout/Navbar.MobileMenu.tsx`
- Existing tests: e2e/specs/marketing-mobile-nav.spec.ts
- Done when: On a narrow viewport, Home, Docs, Sign In and Sign Up stack one per row; Signed-in account links and the Log Out button stack the same way
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#1888](https://github.com/chester-hill-solutions/callcaster/issues/1888) IVR: a machine answer with the voicemail drop off should record No Answer, not Voicemail
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-19
- Recommended title: **Verify: IVR machine answer with the drop off records No Answer**
- Fixed on dev in PR #1890 (d07e26b1, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, machineAnswerDisposition(campaign) returns voicemail only when voicemail_drop_enabled && voicemail_file, otherwise no-answer.
- Root cause: recordVoicemailAnswer wrote disposition voicemail for every machine answer before deciding whether the drop would play.
- Resolution: No new code. Verify on the review environment, then close when promoted to master.
- Look in: `app/lib/ivr-machine.server.ts`, `app/routes/api+/ivr/status.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId.action.server.ts`
- Existing tests: test/ivr-page.route.test.ts; test/ivr-status.route.test.ts
- Done when: Drop on + audio records disposition voicemail; Drop off or no audio records disposition no-answer; Results, metrics and exports show No Answer in the second case
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#1877](https://github.com/chester-hill-solutions/callcaster/issues/1877) De-duplicate the IVR runtime (machine policy, block runtime, option type, Setup sections)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-19
- PR #1879 (5435f694) landed the behaviour-preserving dedup on dev: one machine policy, one block runtime (ivr-block-runtime.server.ts), one runtime option type (IvrOption), and one Setup voice section. Master does not have it yet.
- Current behavior: Outbound and inbound block routes are thin adapters over appendBlockResponse; the flow entry and status callback share the machine predicate. Legacy UI types remain only in the Result path.
- Root cause: Duplicated IVR runtime and Setup shells from the #1855/#1860/#1864/#1856/#1863/#1875 batch.
- Resolution: Verify IVR keypad and speech flows and the Setup voice settings on the review environment, then close on promotion to master. No new code.
- Look in: `app/lib/ivr-machine.server.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-gather.server.ts`, `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`
- Existing tests: test/ivr-block-runtime.test.ts; test/ivr-block.route.test.ts; test/inbound-ivr-block.route.test.ts; test/ivr-page.route.test.ts; test/ivr-status.route.test.ts; test/ui/campaign-voice-settings.test.tsx
- Done when: One isMachineAnswered predicate and one machine-disposition write; One shared block-runtime module; routes are thin adapters; One option shape used by the runtime and gather helper; Setup renders one voice-settings section; All existing tests green; no behaviour change
- Tracker: Merged on dev in PR #1879 (5435f694); closes on master promotion.

### [#1863](https://github.com/chester-hill-solutions/callcaster/issues/1863) Move the remaining dial options (household, dial type) to campaign Setup
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-18
- Household grouping and dial type were moved to campaign Setup by PR #1870 (2bb79c83, dev only); a later dev refactor (#1879/5435f694) folded the controls into CampaignVoiceSettings on Setup.
- Current behavior: Setup's CampaignVoiceSettings shows Group by household and Dial Type. CampaignLaunch/CampaignLaunchExtras no longer render a Calling options block.
- Root cause: Launch held campaign configuration that belongs on Setup.
- Resolution: Verify on the review env that Setup shows household grouping and dial type and Launch has no Calling options section. Close on master promotion. Do not reimplement; #1879 already merged the duplicate setup sections.
- Look in: `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`, `app/components/campaign/settings/CampaignLaunch.tsx`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`
- Existing tests: test/ui/campaign-voice-settings.test.tsx; e2e/specs/dial-modes.spec.ts
- Done when: Household grouping and dial type are set on Setup; Launch no longer shows a Calling options section; No behaviour change to the stored values
- Tracker: PR #1870 merge 2bb79c83 is on dev, not yet master. Closes on master promotion.

### [#1856](https://github.com/chester-hill-solutions/callcaster/issues/1856) IVR advances when the caller speaks on a keypad-only step
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-18
- Shipped on dev in PR #1872 (725d77df). The shared gather builder now gathers DTMF only unless the block declares a vx-any spoken option (ivrStepGathersSpeech).
- Current behavior: Keypad-only steps build <Gather input=['dtmf']> (numDigits=1 for single-key menus). Speech is collected only for a vx-any option.
- Root cause: Every option block gathered input ['dtmf','speech']; any speech longer than two characters advanced the call.
- Resolution: Verify on the review env that speaking at a DTMF menu waits for a keypress/timeout and an explicit speech step still routes speech. Close on master promotion. Do not reimplement; #1862 is a separate open follow-up.
- Look in: `app/lib/ivr-gather.server.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server.ts`
- Existing tests: test/ivr-block.route.test.ts; test/inbound-ivr-block.route.test.ts; test/ivr-gather.test.ts
- Done when: Speaking at a DTMF menu does not advance the call; An explicit speech / vx-any step still captures and routes speech
- Tracker: PR #1872 merge 725d77df is on dev, not yet master. Closes on master promotion.

### [#1864](https://github.com/chester-hill-solutions/callcaster/issues/1864) Review env: IVR still drops voicemail with the drop off (campaign 109)
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-18
- Shipped on dev in PR #1867 (5132c4ed). The IVR flow-entry route acts on the synchronous AMD verdict before any IVR audio plays, and the status callback records the same disposition via app/lib/ivr-machine.server.ts.
- Current behavior: A detected machine is dropped or hung up immediately, never routed into the IVR script. Drop off records no-answer (#1888); drop on records voicemail.
- Root cause: The IVR flow began serving prompts before Twilio's AMD status callback was processed.
- Resolution: Verify on the review env that a machine answer with the drop off hangs up and records No Answer, and that the review service runs a commit including #1860/#1867. Close on master promotion. Do not reimplement.
- Look in: `app/lib/ivr-machine.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId.action.server.ts`, `app/routes/api+/ivr/status.action.server.ts`
- Existing tests: test/ivr-page.route.test.ts; test/ivr-status.route.test.ts; test/ivr-block-runtime.test.ts
- Done when: With the drop off and saved, a machine answer hangs up with no voicemail; The review environment runs a commit that includes #1860
- Tracker: PR #1867 merge 5132c4ed is on dev, not yet master. Closes on master promotion.

### [#1839](https://github.com/chester-hill-solutions/callcaster/issues/1839) Voice campaigns need a voicemail-drop toggle and dedicated voicemail audio on Setup (IVR and live)
- Verdict: **Verify and close** · Size: L · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-09-18
- Shipped on dev in PR #1860 (e1339d3d). Added campaign.voicemail_drop_enabled, backfilled true where voicemail_file existed; Setup owns the toggle and Voicemail audio picker; both runtimes gate on the switch; readiness blocks drop-on without audio.
- Current behavior: Setup's CampaignVoiceSettings shows Voicemail drop plus dedicated voicemail audio. dial/status and ivr-machine only prepare/play the drop when voicemail_drop_enabled && voicemail_file; readiness raises voicemail_audio_required otherwise.
- Root cause: No explicit voicemail-drop boolean existed and IVR depended on a magic script page titled 'voicemail'.
- Resolution: Verify on the review env that the toggle and dedicated audio appear on Setup for IVR and live, toggle-off never plays voicemail, and launch is blocked when the toggle is on with no audio. Close on master promotion. Caller-side controls stay in #1708; AMD latency is #1842/#1845.
- Look in: `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`, `app/lib/ivr-machine.server.ts`, `app/routes/api+/dial/status.action.server.ts`, `app/lib/campaign-readiness.ts`, `client/migrations/20260918120000_campaign_voicemail_drop_enabled.sql`
- Existing tests: test/ui/campaign-voice-settings.test.tsx; test/ui/voicemail-setup.test.tsx; test/dial-status.route.test.ts; test/ivr-status.route.test.ts; test/campaign-readiness.test.ts; test/campaign-readiness-actions.test.ts
- Done when: Setup shows a voicemail-drop toggle and dedicated voicemail audio for IVR and live; Toggle off: a detected machine never plays the voicemail; Toggle on + audio: both campaign types play the chosen audio on a machine; IVR plays the dedicated audio without a script page named voicemail
- Tracker: PR #1860 merge e1339d3d is on dev, not yet master. Closes on master promotion. #1863 is also on dev.

### [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) IVR key press does not interrupt the current audio block (prompt sits outside the Gather)
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-18
- Shipped on dev in PR #1851 (51240b0b). The prompt now renders inside <Gather> via the shared appendBlockResponse seam, so a keypad press interrupts playback.
- Current behavior: When a block maps options, the gather is built first and the prompt is rendered into it; a DTMF press follows the mapped branch immediately.
- Root cause: handleAudio wrote the prompt as a sibling before the sibling <Gather>.
- Resolution: Verify on the review env that pressing a key during a block prompt stops the prompt and navigates, for outbound and inbound IVR. Close on master promotion. Do not reimplement.
- Look in: `app/lib/ivr-block-runtime.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server.ts`
- Existing tests: test/ivr-block.route.test.ts; test/inbound-ivr-block.route.test.ts; test/ivr-block-runtime.test.ts
- Done when: Pressing a key while a block prompt is playing stops the prompt and navigates; Applies to outbound campaign IVR and inbound IVR
- Tracker: PR #1851 merge 51240b0b is on dev, not yet master. Closes on master promotion.

### [#1840](https://github.com/chester-hill-solutions/callcaster/issues/1840) IVR test call key press speaks the generic error: response route requires an outreach attempt
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-18
- Shipped on dev in PR #1850 (2df51d56). The IVR response route now resolves the branch and persists nothing when outreach_attempt_id is null, matching the test-call design from #1653.
- Current behavior: A key press on a test call with outreach_attempt_id null navigates to the mapped branch and records no result, typed fields, or support-level sync.
- Root cause: The response handler required an outreach attempt and threw when the id was absent.
- Resolution: Verify on the review env that pressing a key on an IVR test call navigates and never speaks the generic error. Close on master promotion. Do not reimplement.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`, `app/lib/campaign-test-call.server.ts`
- Existing tests: test/ivr-block-response.route.test.ts; test/inbound-ivr-block-response.route.test.ts
- Done when: Pressing a key on an IVR test call navigates to the mapped branch; The generic error is never spoken for a test call with no outreach attempt
- Tracker: PR #1850 merge 2df51d56 is on dev, not yet master. Closes on master promotion.

### [#1788](https://github.com/chester-hill-solutions/callcaster/issues/1788) SMS export adds a false skipped row for each sent contact
- Verdict: **Verify and close** · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1798 (a80b3f9c) shipped the filter that removes synthetic SMS skipped rows for sent contacts.
- Current behavior: Successful-send dequeues do not add a second skipped CSV row; genuine suppression reasons remain eligible for skip rows.
- Resolution: Verify delivered and genuine skipped contact rows on a dev export.
- Look in: `app/lib/campaign-export.server.ts`, `app/lib/campaign-queue-db.server.ts`
- Existing tests: test/campaign-export-sms-dequeued.test.ts
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1792](https://github.com/chester-hill-solutions/callcaster/issues/1792) SMS rate pacing is skipped between batches, including all waits at one MPS
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1796 (0188cea8) preserves the configured SMS send-start interval across dispatch batches.
- Current behavior: A one-MPS target retains its delay between one-row batches.
- Resolution: Verify configured pacing across batch boundaries on dev.
- Look in: `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: test/campaign-sms-dispatch-pacing.test.ts
- Missing tests: Deployed pacing verification.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1791](https://github.com/chester-hill-solutions/callcaster/issues/1791) SMS dispatch continues sending after the campaign window closes mid-batch
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1796 (0188cea8) added campaign-window checks before provider requests, including after asynchronous preparation.
- Current behavior: When the campaign window closes mid-batch, new sends stop and unsent contacts remain queued.
- Resolution: Verify the closing-boundary behavior on dev without sending outside the test window.
- Look in: `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: test/campaign-sms-dispatch-window.test.ts
- Missing tests: Deployed closing-boundary verification.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1782](https://github.com/chester-hill-solutions/callcaster/issues/1782) Verify send-window boundary timing for voice campaigns on dev (#1351/#1352)
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1796 (0188cea8) now wakes waiting voice work at the next calling-hours boundary. The four deployed boundary checks requested by this issue remain pending.
- Current behavior: The waiting voice successor uses the next window opening; schedule-sweep ownership of waiting-to-running remains intact.
- Resolution: Collect deployed evidence for future start, exact open, mid-run close, and no premature completion. Preserve #1351/#1352 until that evidence is assessed.
- Look in: `app/lib/worker/handlers/campaign.server.ts`, `app/lib/campaign-schedule-sync.server.ts`
- Existing tests: test/campaign-dispatch-worker.test.ts
- Missing tests: DB rows plus screenshots or API results for all four deployed boundary cases.
- Tracker: Verification work remains; do not repeat the next-window scheduling patch from PR #1796.

### [#1790](https://github.com/chester-hill-solutions/callcaster/issues/1790) Campaign exports reject simple_ivr and complex_ivr campaigns
- Verdict: **Verify and close** · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1798 (a80b3f9c) added supported machine-dispatched IVR types to the HTTP, workspace API, and durable export paths.
- Current behavior: simple_ivr and complex_ivr reach the voice CSV exporter through the shared campaign-type predicate.
- Resolution: Verify an export for each IVR type on dev.
- Look in: `app/routes/api+/campaign-export.action.server.ts`, `app/lib/platform-analytics.server.ts`, `app/lib/worker/handlers/campaign.server.ts`
- Existing tests: test/campaign-export-ivr-adapters.test.ts
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1664](https://github.com/chester-hill-solutions/callcaster/issues/1664) AI agents interacting with GH should properly mark items as duplicate or not planned
- Verdict: **Verify and close** · Labels: devops/admin · Assignee: none · Updated: 2026-09-08
- The GitHub issue skill distinguishes COMPLETED, NOT_PLANNED and DUPLICATE. API verification on 2026-09-09 still reports #1314 as closed/not_planned.
- Resolution: Verify the canonical duplicate timeline, then correct the closed reason for #1314. Keep the existing closed state and avoid a false completed classification.
- Look in: `.agents/skills/github-issues/SKILL.md`

---

## Needs reproduction — 10

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

### [#1765](https://github.com/chester-hill-solutions/callcaster/issues/1765) Onboarding steps shouldn't have the credit warning after renting a number
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-25
- The specific 'credit warning after renting' could not be located in the onboarding source; screenshot unverifiable here. Needs the step + exact warning text to pin the component.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1719](https://github.com/chester-hill-solutions/callcaster/issues/1719) messages page should fit within VH
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: design, ux · Assignee: @sai-sy · Updated: 2026-09-24
- Visual layout complaint that cannot be verified from code; sidebar already uses min-h-0 flex-1 overflow so a screenshot/steps on dev are required to identify the overflow.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1718](https://github.com/chester-hill-solutions/callcaster/issues/1718) contact has opted out messager should be dynamic
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-23
- Screenshot only, no repro or expected copy; generic opt-out banner is intentional per #1333 evidence. Needs the specific scenario before coding.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2034](https://github.com/chester-hill-solutions/callcaster/issues/2034) Campaign results get messed up if the recipient hangs up
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **Campaign results disagree with themselves: 0 of 1 contacts completed while the disposition breakdown reports 2 completed**
- The inconsistency is real and the two numbers are computed from different tables, but I could not confirm which write produces the extra rows, so I am not specifying a fix. 'Contacts Completed' is queueRows, not attempts: ResultsScreen.tsx:53-57 passes queueCounts.completedCount, which is countDialableCompletedCampaignQueueRows (app/lib/campaign-queue-search.server.ts:338-342) counting campaign_queue rows where queue_state='dequeued' OR dequeued_at IS NOT NULL (the predicate is right, verified at :59-67). The disposition breakdown is attempts: it comes from the get_campaign_stats RPC (drizzle/0000_baseline.sql:2565, `COUNT(*) as count ... FROM outreach_attempt oa`) for non-message campaigns. So the screen compares a count of queue rows with a count of attempt rows, and they can only agree if there is exactly one attempt per contact. The report says the agent pressed hang up several times, and the breakdown says 2, so something produced two attempt rows — or one attempt plus a duplicate. I could not find it: the repeated-hangup guard in app/hooks/call/useCallHandling.ts:408-426 returns early without a server call when there is no active call, and the server-side /api/hangup is guarded (Twilio error 21220 is swallowed at app/routes/api+/hangup.action.server.ts:43-47, and the disposition update is scoped to the attempt and described as terminal-guarded at :67-80). Also unexplained: completedCount is 0, meaning the queue row was never dequeued, yet a disposition of completed exists. The remote-hangup button symptom is separately known and already guarded (the #1292 comment at useCallHandling.ts:409-412), so the visible half may already be fixed while the numbers half is not.
- Current behavior: One contact, one call, the contact hangs up remotely, the agent presses hang up repeatedly: the headline reads 'Contacts Completed: 0 of 1' with a 100.0% completion rate, and the disposition bar reads 'Completed 2 (100.0%)'.
- Root cause: Not established. Two candidate causes, and the repro distinguishes them. (a) A write-side duplication: something creates a second outreach_attempt row for the same contact in the same campaign, so the row count is 2 while the contact count is 1. (b) An aggregate-unit mismatch only: the queue row was never marked dequeued (so completedCount is 0) while one or more attempts carry a completed disposition, and the 2 comes from two attempts created by the dial, not by the hang-up presses. (b) is the more likely reading of completedCount=0, and it would mean the real defect is a dequeue that never happens, not a hang-up that happens twice.
- Resolution: Reproduce first, then choose. Steps: (1) create a 1-contact call campaign, launch it, dial, let the contact answer, then hang up remotely from a second handset; (2) press hang up in the agent UI two or three times and note whether the button is still enabled and what the network tab shows for each press; (3) open the Results tab and record both numbers. Then, for that campaign id, query campaign_queue for the row (queue_state, dequeued_at), outreach_attempt for every row (id, contact_id, disposition, created_at) and call for every row (outreach_attempt_id, duration). The reading decides the fix: two attempt rows for one contact means a write-side duplication to find in the dial/hangup path and the aggregate is right; one attempt plus queue_state still 'queued' means the dequeue never ran, which points at dequeueQueueEntry in /api/hangup (app/routes/api+/hangup.action.server.ts:59-66) failing silently for this path — note it dequeues by contactId with a household-fanout branch, and an early return or a swallowed error there would produce exactly completedCount=0. If the numbers are right and only the units differ, the fix is in the presentation: state the unit ('contacts' versus 'attempts') or make the breakdown count distinct contacts. Do not change get_campaign_stats on the strength of a screenshot.
- Look in: `app/components/campaign/home/CampaignHomeScreen/ResultsScreen.tsx:51-64 (the two numbers side by side)`, `app/lib/campaign-queue-search.server.ts:265-267 and :338-342 (completedCount = dequeued queue rows)`, `drizzle/0000_baseline.sql:2495-2571 (get_campaign_stats, COUNT(*) over outreach_attempt rows for non-message campaigns)`, `app/routes/api+/hangup.action.server.ts:49-81 (dequeueQueueEntry by contactId, then the attempt disposition update)`, `app/hooks/call/useCallHandling.ts:404-426 (the #1292 stale-hangup guard) and app/hooks/call/useCallScreen.ts:178`, `app/lib/dequeueQueueEntry in app/lib/campaign-queue-db.server.ts (the fanout branch that could fail silently)`
- Existing tests: test/integration-db/campaign-completion-gate.test.ts; test/integration-db/dequeue-contact-assigned.test.ts; test/integration-db/call-status-guard.test.ts; test/ui/call-lifecycle-regression.test.tsx
- Missing tests: no test asserts that a remote hangup followed by repeated agent hang-up presses leaves exactly one attempt row and one dequeued queue row; no test asserts that the results headline and the disposition breakdown agree for a 1-contact campaign — this is the assertion that would have caught the report; no test covers a /api/hangup for an already-ended call, which is the exact path the repro exercises; no test asserts that a failed dequeueQueueEntry surfaces rather than resolving quietly; no test pins the unit of the disposition breakdown (attempts versus contacts), so the two numbers can drift apart freely
- Done when: The exact reproduction is recorded with the campaign_queue, outreach_attempt and call rows for the campaign; A 1-contact campaign whose contact hangs up remotely shows the same contact count in the headline and in the disposition breakdown; Repeated hang-up presses after a remote hangup do not create additional attempt or queue rows; The disposition breakdown's unit is stated in the UI or in code, and the headline and the breakdown cannot contradict each other; The fix lands with a test that fails against the current behaviour
- Tracker: Needs reproduction, not fix now. The inconsistency is confirmed but the cause is not, and there are two candidate causes whose fixes are opposites: one is a duplicated write, the other is a write that never happens. Guessing here would change either a write path or an aggregate on the strength of a screenshot. The repro is three queries and about ten minutes. Also file the remote-hangup button symptom separately if the repro shows it still reproduces, since the existing #1292 guard suggests that half may already be fixed.

### [#1110](https://github.com/chester-hill-solutions/callcaster/issues/1110) Onboarding Rent A Number Issues
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: needs-repro · Assignee: none · Updated: 2026-09-23
- Recommended title: **Reproduce and split the onboarding number-step defects**
- Parent for number-step issues; the body has no current defect details and children #1111/#1112/#1114 are closed.
- Current behavior: OnboardingFirstNumberStep is a large combined flow (service address, rental, verification, routing); no component UI test exists.
- Root cause: Cannot be determined from the open issue; needs reproduction.
- Resolution: Record viewport/role/goal/browser/steps for each observed defect, split unrelated defects into separate issues, and add a regression test per confirmed behavior.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`
- Existing tests: wizard step ordering only
- Missing tests: component render for the step
- Done when: Each defect recorded with steps; Unrelated defects split; Regression test per defect
- Tracker: Reproduce and split; overlaps #1205/#1113/#1318.

### [#1670](https://github.com/chester-hill-solutions/callcaster/issues/1670) phone number search is too strict
- Verdict: **Needs reproduction** · Labels: ux · Assignee: none · Updated: 2026-09-23
- Searching Pickering does not find South Pickering. PR #1675 changed rate-centre display names; it did not prove search matching.
- Resolution: Compare the submitted locality with provider results and determine whether the provider supports partial matching before changing the search contract.
- Look in: `app/components/phone-numbers/NumberPurchase.tsx`, `app/lib/number-locality.ts`

### [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) gap between pressing an IVR option and it moving on to the next block is very long ~4 seconds
- Verdict: **Needs reproduction** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-23
- Recommended title: **Instrument and attribute the ~4s IVR option-press to next-block gap**
- No issue body. The one comment attributes the gap to the flow-entry redirect hop or per-request media render in #1842, but this is the response->block hop after a key press, a path #1842 does not measure.
- Current behavior: Pressing an option POSTs to response.action (outreach read/write, findNextStep), which redirects; Twilio then calls the block route, which re-fetches call and campaign in series and renders audio.
- Root cause: Not confirmed. Candidates: the response->block double round-trip, serial findCallBySid + fetchCampaignWithScript, and MP3 transcoding.
- Resolution: Add structured timing logs at option received, response TwiML returned, next-block request, and first audio. Attribute the gap from real review-env calls, then either fold into #1842 or open a scoped PR. Do not close on the likely-cause comment alone.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId.action.server.ts`, `app/lib/ivr-block-runtime.server.ts`
- Existing tests: test/ivr-block-response.route.test.ts; test/ivr-block.route.test.ts; test/ivr-page.route.test.ts
- Missing tests: latency attribution from option-press to next-block first audio
- Done when: Measured option-press -> next-block first-audio, before and after; Chosen fix under 2s without regressing #1842/#1864; Root cause recorded, or folded into #1842 with evidence
- Tracker: needs-repro: likely shares the per-request render root cause with #1842 but different hop. Measure before merging the tickets.

### [#1750](https://github.com/chester-hill-solutions/callcaster/issues/1750) Fix the existing sign-in page hydration mismatch
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-16
- Confirmed symptom (React #418 args=[HTML] on every /signin load per the 4-case protocol) but root cause unproven. Fastest check: the pre-hydration theme script mutating <html> vs React 19 singleton hydration (issue itself hints at the theme bootstrap).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1707](https://github.com/chester-hill-solutions/callcaster/issues/1707) Audo > Add Audio > Upload button doesn't have the on mouse hover
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-09
- The Upload Audio submit is a standard primary Button that has hover:bg-primary/90, so the claimed missing hover cannot be confirmed from code; needs on-dev repro. May share the too-subtle-hover root cause with 1705, which the issue's investigation directive implies.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1615](https://github.com/chester-hill-solutions/callcaster/issues/1615) shad-cc tsup build is not deterministic, so its vendored dist cannot be drift-checked
- Verdict: **Needs reproduction** · Labels: none · Assignee: none · Updated: 2026-09-07
- PR #1621 added a warn-only shad-cc rebuild check. The latest report found 12 identical builds, but enforcement is still disabled.
- Resolution: Gather clean CI build evidence, then make enforcement its own PR. Do not close based only on the diagnostic PR.
- Look in: `scripts/check-vendor-dist-drift.mjs`

---

## Needs decision — 38

Product, security, or operations decision required before implementation can be scoped.

### [#1699](https://github.com/chester-hill-solutions/callcaster/issues/1699) IVR script refers to the recipient as the "caller" in "caller response"
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-25
- Terminology question: in the IVR Gather semantics the interacting party is the 'caller' on the keypad, so 'caller response' is defensible. Product must pick the canonical term and the sweep scope before any rename.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1355](https://github.com/chester-hill-solutions/callcaster/issues/1355) Rename the Railway staging environment to "qa" (still tracking master)
- **IN PROGRESS** · Verdict: **Needs decision** · Labels: devops/admin · Assignee: @sai-sy, @wra-sol · Updated: 2026-09-25
- The current topology is dev→dev and master→staging/production. The request only renames staging to qa; there is no qa branch.
- Resolution: Verify a safe in-place rename before changing IaC. Do not recreate the environment.
- Look in: `.railway/environments/staging.ts`

### [#2051](https://github.com/chester-hill-solutions/callcaster/issues/2051) Expired message campaign still completes with unsettled messages — decide: abandon, cancel-then-settle, or a distinct status
- Verdict: **Needs decision** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Recommended title: **Decide what happens to unsettled messages when a campaign expires**
- The #2048 settled-message gate is bypassed on the expired-campaign path: app/lib/worker/handlers/campaign.server.ts writes status=complete directly via updateCampaignStatusInWorkspace and never calls try_complete_campaign_if_drained. An expired message campaign can therefore read complete while Twilio still holds unsettled messages. Worse, runSmsStatusSideEffects only calls cancelQueuedMessagesForCampaign AFTER the end date has passed, so the bypass fires before the cancellation is even attempted.
- Current behavior: Expired campaign terminalizes to 'complete' regardless of unsettled provider messages; the #2048 gate does not apply.
- Root cause: Genuine rule conflict, not an oversight. The RPC also requires an empty queue, and this path exists so a campaign that expires mid-drain does not stay stuck 'running' (#1512). Routing it through the gate would re-break that.
- Resolution: Decide between: (1) complete anyway and accept abandoned messages, specifying credit treatment and operator warning; (2) cancel everything still unsettled at the provider, wait, then let the normal gate complete it; (3) terminalize to a distinct status such as expired/cancelled so 'complete' always means settled, which keeps the #2048 promise intact but needs a campaign_status enum value plus UI handling. Option 3 is the one that preserves the new invariant.
- Look in: `app/lib/worker/handlers/campaign.server.ts (expired-campaign branch of campaignDispatchHandler)`, `app/lib/worker/webhook-side-effects.server.ts (cancelQueuedMessagesForCampaign, only after end_date)`, `client/migrations/20260925120000_gate_campaign_completion_on_settled_messages.sql`
- Missing tests: expired campaign with unsettled messages does not read complete (under the chosen rule); expired campaign with an undrained queue still terminalizes (#1512 preserved)
- Done when: Decision recorded in the issue and in the relevant doc; Expired campaign with unsettled messages does not read complete under option 2 or 3; #1512 anti-stuck behaviour preserved; Option 1 also specifies credit treatment and an operator warning for abandoned messages; Real-Postgres test pins whichever rule is chosen
- Tracker: DECLINED by the maintainer on 2026-09-25 ('no 2051'). Do not pick this up and do not re-raise it. The gap is real and still worth knowing about: an expired message campaign writes status=complete directly, bypassing the #2048 settled-message gate, so a campaign whose end_date passed while Twilio still held messages can read complete. It is deliberately left as-is rather than fixed, and the code carries a comment marking it a known gap so nobody mistakes it for covered. The genuine rule conflict stands: routing it through the gate would re-break #1512, because the RPC also requires an empty queue and this path exists so a campaign that expires mid-drain does not stay stuck running.

### [#2043](https://github.com/chester-hill-solutions/callcaster/issues/2043) sai expand on this
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: @sai-sy · Updated: 2026-09-24
- Recommended title: **Decide how far to expand the campaign-split feature: promote it, widen its trigger, or automate the copy variation it asks for by hand**
- This issue has no defect in it. The title is an instruction to a person ('sai expand on this') and the body is a screenshot of the campaign Launch page, so what 'expand' means has to come from the reporter. The screenshot is the split feature's own surface: a 11,636-contact draft on a Canadian local number, with 'Split into 24 campaigns' in the large-bulk-send warning. The feature itself is built and works — SplitCampaignPrompt (app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx) clones the campaign into evenly sized segments, distributes the queued contacts, warns on ca_local with a queue of 500 or more (app/lib/throughput-config.ts:102-108), and requires an acknowledgement that the operator will vary the copy. Three things a person could plausibly mean by 'expand', and they are different pieces of work. (1) Reach: the prompt renders in exactly one place, the Launch step of a message campaign (app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx:219-224), and only when isBulkSmsSenderMisaligned is true, so a campaign on a toll-free number with 50,000 queued contacts never sees it. (2) Automation: the copy-variation checklist is a checkbox acknowledgement and the clones get identical copy, so the operator is told to do manually the thing that defeats the carriers' duplicate-content detection. (3) Correctness: the split distributes queued contacts, and it is worth confirming what happens to the campaign's audit trail and to a send that is already in flight when the split is taken.
- Current behavior: A working but single-purpose warning-path tool: one entry point, one trigger condition, manual copy variation.
- Root cause: The feature was scoped as a safeguard inside the bulk-send warning rather than as a campaign operation, so its reach and its automation were never designed.
- Resolution: Ask the reporter which of these they mean, because they are unrelated in size. (a) Reach: move the split out of the warning path into a first-class campaign action reachable from the campaign list, and widen the trigger beyond ca_local/500 to any volume that would hit a sender limit, not just a Canadian local number. (b) Automation: make the copy actually vary per segment — a per-segment message variant, or a merge field carrying the segment index — instead of asking the operator to vary it by hand and hoping. This is the one with real value, because identical copy across segments is exactly what the warning claims to be avoiding. (c) Correctness: confirm the behaviour when a send is already in flight at split time, and whether each clone's results roll up to the parent or stand alone. Recommend (b) as the highest-value reading of 'expand', with (a) as a cheap follow-up, and (c) answered by whoever wrote the split before either lands. Do not start work before the reporter picks one: the three have nothing in common, and the issue as filed does not say which is wanted.
- Look in: `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx (the whole feature: the alert, the sheet, the checklist, the split submit)`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx:211-226 (the only render site)`, `app/lib/throughput-config.ts:102-108 (isBulkSmsSenderMisaligned: ca_local and >= 500)`, `test/ui/split-campaign-override.test.tsx (existing coverage of the override path)`, `app/lib/campaign-split.server.ts or splitMessageCampaign (the server side named in the component's doc comment — locate it before scoping any change)`
- Existing tests: test/ui/split-campaign-override.test.tsx (the bulk-on-local override and its acknowledgement)
- Missing tests: the split itself is not covered end to end: no test asserts the contacts are distributed across the clones or that the clones are created with the requested segment count; no test asserts the clones are reachable and correctly scoped to the workspace; if copy variation is automated, no test asserts the variants differ per segment; no test covers a split taken while a send is in flight
- Done when: The reporter has stated which expansion is wanted; The chosen scope is written into the issue before work starts; If the split is promoted, it is reachable outside the bulk-send warning and its trigger is documented; If copy variation is automated, the clones differ in the copy that reaches the carrier; The behaviour of a split during an in-flight send is documented
- Tracker: Needs decision. The issue as filed is a note to a person plus a screenshot, and the three plausible readings are unrelated in size and risk. Cheapest next step is a one-line question to the reporter. If the answer is copy automation, that is a real feature worth doing and should be specced properly; if the answer is reach, it is a small change on top of existing tests.

### [#1763](https://github.com/chester-hill-solutions/callcaster/issues/1763) "Number" onboarding sub breadcrumbs don't work
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: @sai-sy · Updated: 2026-09-24
- Verify path never advances past sub-step 2 (caller-ID sets no hasFirstNumber so numberStep stays 'verify' and crumb 3 is unreachable for caller-ID). What progression means on the verify path is a product decision; overlaps #1205 (already Fix now).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1705](https://github.com/chester-hill-solutions/callcaster/issues/1705) Primary button hover darkening isn't strong enough. should be a bit darker
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: @sai-sy · Updated: 2026-09-24
- Default primary hover is hover:bg-primary/90 (shad-cc); the exact darker token/shade is a design-system decision the issue does not specify.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1725](https://github.com/chester-hill-solutions/callcaster/issues/1725) should template tags allow for no closing bracket? the preview renderer and the parser seems to think so
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question · Assignee: @wra-sol · Updated: 2026-09-23
- Parser tolerance of missing braces is intentional legacy support (single-brace bodies) — product decides whether to keep it or lint strict double-brace tags.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1858](https://github.com/chester-hill-solutions/callcaster/issues/1858) IVR Script Builder Options
- Verdict: **Needs decision** · Size: XL · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-23
- Recommended title: **Unify IVR and live script blocks and define prompt, multi-select, input, and end-call semantics**
- Umbrella request to align the IVR script model with the live-call script model and add block kinds: prompt-only, multi-select with an explicit 'do nothing' default, free input with a stop key, end-call options, and a per-block default go-to.
- Current behavior: IVR scripts use IvrBlock; live scripts use a separate instruction/multi-select model. There is no prompt-only block, no stop-key input block, no end-call block, and no general per-block default destination beyond noInput.
- Root cause: Two parallel script models and undefined block semantics.
- Resolution: Decide the unified block model, the default 'do nothing' behaviour, and stop-key/end-call semantics first; record the decision, then split into tracer-sized tickets (one block kind each).
- Look in: `app/components/campaign/settings/script/`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-gather.server.ts`, `app/lib/campaign-ivr.server.ts`, `app/db/schema-campaign.ts`
- Existing tests: test/ivr-block-runtime.test.ts; test/ivr-gather.test.ts; test/ui/script-block-editor-ivr.test.tsx
- Missing tests: Default go-to when the caller gives no input; Input block stop-key handling; End-call block routes/hangs up as authored
- Done when: Product decision recorded for the unified block model and defaults; Blocks split into ticket-sized units before implementation; Prompt, multi-select, input, and end-call semantics specified with a default do-nothing path
- Tracker: Decision first, then split. Related: #1862, #1741. #1856 and #1841 are already fixed on dev and should not be re-done.

### [#2036](https://github.com/chester-hill-solutions/callcaster/issues/2036) calling dashboard is card component slop hell
- Verdict: **Needs decision** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-23
- Recommended title: **Decide the scope of flattening the call screen: the call screen only, or the shared workspace panel every page uses**
- The complaint is clear and both named surfaces are real, but the outer card is not owned by the call screen — it is the shared workspace panel, so 'remove the rounded edges and drop shadow' is a choice about blast radius, not a local edit. The top bar is local: app/components/call/CallScreen.Header.tsx:239 is a sticky header with rounded-xl, border, shadow-sm and a backdrop blur, and that is the campaign details/settings bar in the screenshot. The outer card is app/routes/workspaces+/$id.tsx:206, a single className string that gives every workspace page its panel: `min-w-0 flex-1 lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card/70 lg:p-6 lg:shadow-sm ...`, and the same file already branches on isChatsScreen (:204-207) so a call-screen branch is available. The issue's broader point is also a design-system one: cards are fine as containers, but their default treatment should be overridable per site.
- Current behavior: The live calling screen stacks three card treatments — the workspace panel, the sticky top bar, and inner section cards — and the invisible ones still cost padding.
- Root cause: The workspace panel treatment is a single shared className with no per-surface override, and the top bar re-states rounded/border/shadow locally. Two owners for the same visual concept, so the call screen cannot opt out.
- Resolution: Decide the scope, then it is a small edit either way. Option A (call screen only): add an isCallScreen branch next to the existing isChatsScreen branch at app/routes/workspaces+/$id.tsx:204-207 that drops rounded-2xl, border and shadow-sm and reduces p-6 for the call route, and flatten the sticky header at CallScreen.Header.tsx:239. Nothing else on the product changes; the risk is that the call screen now looks different from every page beside it. Option B (whole product): flatten the shared panel for all workspace routes, so the page is a flat canvas and cards mean something when they appear. Bigger visual diff, needs a pass over every workspace page to check what depended on the panel's padding, but it is the version that actually establishes 'a card is a deliberate container'. Option C (middle): keep the panel as-is and change the top bar only, which fixes the half the reporter named twice but leaves the outer card. Whichever is chosen, express it as a variant on the panel rather than a route-conditional className string, so the next surface can opt out without editing a ternary. Also decide the padding: the reporter asks to 'punch back' the padding the invisible cards were creating, which means auditing the space-* classes between the panel and the first inner card as part of the change, not just deleting rounded and shadow.
- Look in: `app/components/call/CallScreen.Header.tsx:239 (the sticky top bar: rounded-xl, border, shadow-sm, backdrop-blur)`, `app/routes/workspaces+/$id.tsx:202-208 (the shared workspace panel, with the isChatsScreen branch as the pattern for a call-screen branch)`, `app/components/call/CallScreen.Layout.tsx:191 (the call screen's own space-y-6, the padding the invisible cards create)`, `app/components/call/CallScreen.Coaching.tsx:53,73 and CallScreen.DTMFPhone.tsx:22 (inner cards, which the issue says to keep)`
- Existing tests: test/ui/call-screen-header.test.tsx (CampaignHeader only); test/ui/call-screen-callarea.test.tsx, call-screen-queuelist.test.tsx (inner cards)
- Missing tests: no test asserts the call screen's panel treatment, so a regression to the nested-card look passes silently; no visual or class-level test would catch a re-introduced rounded/shadow on the top bar
- Done when: The chosen scope is written down, and the panel treatment is a named variant rather than a route-conditional className string; The named surfaces (outer card, top bar) have no curved edges or drop shadow; The padding the removed cards were creating is punched back, verified by measuring the gap at the top of the call screen; Inner section cards keep their treatment — they are the containers that should still read as cards; No other workspace page changed unintentionally, or changed deliberately and listed
- Tracker: Needs decision, briefly, then fix. The implementation is an hour either way; what is unresolved is whether this is a call-screen change or a product-wide one, and picking wrong means either an inconsistent product or an unreviewable visual diff across every page. The reporter's phrasing ('the call screen has the page, an outer card, and inner cards') reads as a call-screen complaint, which points to Option A, but the outer card is shared and the reporter may not know that. Answer that one question and this becomes a fix-now.

### [#1347](https://github.com/chester-hill-solutions/callcaster/issues/1347) need to verify consistency for Robocall vs IVR vs Automated Phone Menu
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-23
- Recommended title: **Robocall vs IVR vs Automated Phone Menu — terminology consistency**
- Consistency audit for customer-facing naming. #1854 (API type robocall) and #1741 (one automated phone menu) set the direction, but UI still mixes terms: 'Robocall' appears in CampaignLaunch.tsx, CampaignLaunchExtras.tsx, CampaignVoiceSettings.tsx, SelectType.tsx, while the product language moved to 'automated phone menu'. Decide the canonical customer term + sweep scope.
- Current behavior: Mixed labels (Robocall/IVR/automated phone menu) across campaign setup surfaces.
- Resolution: Decide the canonical term (suggestion: 'Automated phone menu' in UI; 'robocall' stays the API value), then a copy sweep replacing IVR/Robocall labels.
- Look in: `app/components/campaign/settings/CampaignLaunch.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`, `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`
- Done when: One customer-facing term; API values unaffected

### [#1345](https://github.com/chester-hill-solutions/callcaster/issues/1345) Use CHS BN for Toll-Free calls?
- Verdict: **Needs decision** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-23
- Recommended title: **Decide and add a CHS-managed toll-free SMS verification path**
- Political campaigns have no business number, so toll-free SMS (which requires a BN) does not serve them. Offer a CHS-managed path — but only after a compliance/ownership decision.
- Current behavior: Goal step offers toll-free (requires customer BN) or local (no BN); readiness requires businessRegistrationNumber for toll-free; twilio-toll-free-provision uses workspace business identity.
- Root cause: No managed-sponsorship model; CHS BN must not be stored as customer identity.
- Resolution: Decide if CHS can sponsor customer traffic; if yes, add a support-request flow with clear ownership/review status and local-number alternative.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingGoalStep.tsx`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/twilio-toll-free-provision.server.ts`
- Existing tests: test/ui/onboarding-goal-step.test.tsx
- Missing tests: managed-service request path (once approved)
- Done when: Compliance approves/rejects sponsorship; Users without BN can request support; CHS BN not stored as customer identity
- Tracker: Blocked on product/compliance decision; issue title says 'calls' but scope is SMS.

### [#1129](https://github.com/chester-hill-solutions/callcaster/issues/1129) Options for campaign changes should be discard, save as draft, save as publish, with the next button unavailable if changes to be actioned
- Verdict: **Needs decision** · Size: L · Risk: high · Labels: ux, needs-repro · Assignee: none · Updated: 2026-09-23
- Recommended title: **Define campaign draft/publish semantics and block dirty setup navigation**
- Campaign edits offer Reset/Save and the launch rail blocks dirty navigation, but there is no save-as-draft vs publish split and no disabled Next while dirty.
- Current behavior: SaveBar Reset + Save Changes writes the row; footer Next always active; no persisted draft-vs-published revision model.
- Root cause: Draft/published semantics undefined; needs-repro against current UI per maintainer.
- Resolution: Decide semantics first (what 'Save as draft' vs 'Save and publish' change), then implement discard/draft/publish and disable footer Next while dirty. Surface existing drafts when a published version exists.
- Look in: `app/components/campaign/settings/CampaignSettings.tsx`, `app/components/shared/SaveBar.tsx`, `app/components/campaign/home/CampaignShellDirty.tsx`, `app/components/campaign/settings/useCampaignSettingsController.ts`
- Existing tests: SaveBar generic tests
- Missing tests: footer navigation while dirty; published/draft version semantics
- Done when: Product rules define draft/publish; Discard restores persisted version; Next blocked while dirty
- Tracker: Decision + needs-repro confirmation before scoping.

### [#1717](https://github.com/chester-hill-solutions/callcaster/issues/1717) Page not found should take you to workspace not home
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-23
- 404 'Go back' is context-free history.back(); issue proposes URL-shape-dependent targets. Behavior policy decision first, then a small change.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1700](https://github.com/chester-hill-solutions/callcaster/issues/1700) Why have a distinction between recording step and spoken step if you can also change "Speak text" to "play a recording"
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-23
- Proposal to collapse Speak/recording block types into one 'Add block'. The editor already treats them as one block with a playback-mode toggle, so the change is a product/scope decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2029](https://github.com/chester-hill-solutions/callcaster/issues/2029) Axe as many not necessary dev env phone numbers as possible
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-23
- Recommended title: **Decide the release list and the retention policy for unused dev-environment Twilio numbers**
- An operations task, not a code change, and it is waiting on two things rather than on engineering. The screenshot shows 76 numbers in the dev account at $86.20/month, plus 4 number-setups at $0. The body names the three numbers Sai uses (2608141501, a 2026 Municipal Ward 19 NES campaign, a HESC Phone Bank) and asks @wra-sol to say which workspaces Arfin wants kept; everything else is proposed for release. Two decisions are open. First, the list: Arfin's workspaces are not in the issue, so the release set is undefined. Second, and more important, there is no stated rule for what makes a dev number safe to release, and no automated check — a number that is still referenced by a workspace_number row, a campaign sender, a messaging service, a caller ID, or a verification in progress will break on release, and in a dev environment that breakage is discovered by the next person who uses it. There is a number lifecycle in the app (app/lib/number-rental-billing.server.ts handles suspension and release and notifies the workspace), but nothing there enumerates what a number is still referenced by.
- Current behavior: 76 numbers are held in the dev Twilio account; an unspecified subset is unused, and nobody can say which.
- Root cause: Dev numbers accumulate because renting is cheap and there is no reaper. The list of what is safe to release is held in people's heads and in Slack, not in the repo or the database.
- Resolution: Answer two questions and it becomes a 30-minute console task. (1) The release list: get Arfin's workspaces, then release every number not on the combined keep-list. (2) The safety rule, and this is the part worth writing down: what counts as 'in use'. The concrete options are (a) query the app for references — any workspace_number row not in a released state, any campaign using it as sender or caller ID, any messaging service with it attached, any caller-ID verification pending — and refuse to release a number with a live reference; (b) a time-based rule, release anything not rented in the last N days, accepting that a dormant campaign sender breaks; (c) purely manual, the operator eyeballs the console, which is what happens today and is how 76 accumulated. (a) is the only one that cannot break a workspace, and it is cheap because the reference check is a handful of queries over tables that already exist. Also decide whether dev numbers get a periodic reaper on the same rule, or whether this stays a one-off clean-up. Note the numbers in the keep-list are per-workspace, so record the mapping (number -> workspace) before releasing, otherwise the next clean-up starts from zero knowledge again.
- Look in: `app/lib/number-rental-billing.server.ts:170-200 (existing suspend/release lifecycle and its workspace notification)`, `app/lib/platform-workspace-numbers.server.ts (the workspace_number accessor to build the reference check on)`, `app/db/workspace-scoped-tables.ts (workspace_number, campaign, workspace_audio — the tables a reference check must cover)`, `app/routes/admin+/workspaces/$workspaceId/twilio/ (the admin Twilio panels; no release action exists there today)`
- Missing tests: no check reports which numbers in an account are referenced by a live workspace record, which is the check that would make this repeatable; no test covers a release that is refused because a reference exists; no test asserts that a released number cannot still be selected as a campaign sender
- Done when: Arfin's keep-list is recorded in the issue, with the workspace each kept number belongs to; Every number released is confirmed to have no live workspace reference, checked by query and not by eye; The kept numbers are confirmed still working after the release run; The rule for 'in use' is written down, with the chosen option; A decision is recorded on whether the clean-up repeats on a schedule or stays a one-off
- Tracker: Needs decision, and it is a short one. The engineering is a console exercise; what is genuinely unresolved is the safety rule, and getting that wrong breaks a dev workspace in a way nobody notices until later. If the answer is 'a reference check first', that is worth filing as its own small issue, because it makes every future clean-up safe and is more valuable than this particular release.

### [#1996](https://github.com/chester-hill-solutions/callcaster/issues/1996) Daily workspace CSV backups — port gocanvass's backup system
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: enhancement · Assignee: none · Updated: 2026-09-22
- Recommended title: **Decide whether a daily full PII snapshot ships, into which bucket, with what retention and who can restore it**
- The code half is fully mapped and none of it is built, so the engineering risk is low and the open questions are product and data-protection ones. Every integration point the issue names exists: the job type constant file (app/lib/worker/job-types.server.ts), the params and registry (app/lib/worker/job-params.server.ts, app/lib/worker/handlers.server.ts), the cron handler pattern (app/lib/worker/handlers/cron.server.ts) with withReschedule from handlers/shared.server.ts, the per-workspace error isolation fanout (app/lib/cron-workspace-fanout.server.ts), the CSV serializer (app/lib/rpc-csv.server.ts rowsToCsv, app/lib/csv.ts escapeCsvCell), and the object-storage bucket union (app/lib/object-storage.server.ts ObjectStorageBucket, which today has no 'backups' member). ONE FACTUAL DRIFT to correct in the issue: it says 27 tenant tables and AGENTS.md says 26; WORKSPACE_SCOPED_TABLES in app/db/workspace-scoped-tables.ts currently has 28. Enumerate the table list from the constant rather than from either number, so the snapshot cannot silently miss a table. The unresolved decisions are below.
- Current behavior: No scheduled backup exists. A workspace's data exists only in the live database.
- Root cause: The backup system was never ported; the gocanvass blueprint it copies is described in the issue and nothing in CallCaster implements it.
- Resolution: Answer the four questions, then implement. (1) What is in the snapshot: the issue proposes every tenant table, which includes contact PII (names, phones, emails, street addresses) and the full billing ledger. Options: everything (maximum recoverability, maximum exposure), or contacts and the ledger excluded (a schema-and-reference backup that cannot restore customer records), or a middle option that includes contact identifiers without free-text fields. This is the decision that has to be made by someone accountable for the data, not by the implementer. (2) Where it lands: a dedicated backups bucket with its own retention, or the existing S3_BUCKET under a backups/ prefix. A dedicated bucket is the better answer on isolation grounds and the issue already designs for it; the prefix is cheaper and needs no new env var. Pick one and say why, because the object-storage bucket union has to grow either way. (3) Retention and deletion: BACKUP_RETENTION_DAYS defaults to 30 and pruning deletes objects. Confirm the default and confirm the retention is long enough to be useful for the incident it is insurance against. (4) Who can restore: the issue explicitly puts restore tooling out of scope, which means the snapshots are written and never read. Decide whether that is acceptable as phase one, or whether a restore runbook is part of the deliverable — an unread backup is a liability, since it is a full copy of customer data with no access control beyond the bucket. Once those are answered the implementation is the issue's own step list: job type and registry entry, daily dedupe via an idempotency key of backups:<YYYY-MM-DD> (or a self-scheduling chain seeded by ensure-scheduled-jobs), per-workspace fanout so one failure does not error the job, one CSV per table from createTenantDb over the 28 tables, a manifest.json, and a prune pass over the date segments.
- Look in: `app/db/workspace-scoped-tables.ts:41-95 (WORKSPACE_SCOPED_TABLES — 28 tables today, the single source of truth for the snapshot list)`, `app/lib/object-storage.server.ts:8-13 (ObjectStorageBucket, no backups member) and :57-62 (BUCKET_ENV_VARS)`, `app/lib/worker/job-types.server.ts, app/lib/worker/job-params.server.ts:206-222, app/lib/worker/handlers.server.ts:89-178 (job type, params, registry)`, `app/lib/worker/handlers/cron.server.ts:176-230 (handler pattern) and app/lib/worker/handlers/shared.server.ts:19-42 (withReschedule)`, `app/lib/cron-workspace-fanout.server.ts:42-89 (per-workspace error isolation)`, `app/lib/rpc-csv.server.ts and app/lib/csv.ts:55-75 (rowsToCsv, escapeCsvCell)`, `~/Documents/gocanvass/app/server/backup-schedule.server.ts and workspace-csv-backup.server.ts (the blueprint being ported)`
- Existing tests: test/job-registry.test.ts (guards registry drift — a new job type must be registered here); test/worker-cron-handlers.server.test.ts (the pattern for handler tests); test/call-recording-storage.server.test.ts and test/object-storage-upsert.test.ts (the pattern for storage-adapter tests)
- Missing tests: no test asserts a snapshot contains every table in WORKSPACE_SCOPED_TABLES — a new tenant table would silently not be backed up; no test asserts the daily dedupe key prevents a second run on the same UTC day; no test asserts that one workspace failing does not error the whole job; no test asserts the manifest is written and lists the files it claims to; no test asserts pruning removes date keys older than the retention and leaves newer ones, including a partial run's directory; no test asserts a resumed or retried run is idempotent; no test asserts retention configuration is validated (a zero or negative BACKUP_RETENTION_DAYS must fail closed, not delete everything)
- Done when: The four decisions above are answered and recorded in the issue; A workspace gets a dated snapshot in object storage at most once per UTC day; The snapshot list is generated from WORKSPACE_SCOPED_TABLES, and a test fails when a tenant table is added without being handled; Per-workspace failures are isolated and reported, and any failure errors the job; A manifest lists what was written, and pruning removes only date keys older than the configured retention; An invalid retention configuration fails closed; The access and deletion story for the snapshot bucket is documented alongside whatever restore path is decided
- Tracker: Needs decision before implementation, then it is well-specified work. The engineering is a known pattern in this repo, but shipping a daily full copy of customer PII with a 30-day retention, no access story and no restore path is a decision with an owner, not an implementation detail. Ask the four questions in one go; do not start by writing the job handler, because the answers change which tables the handler walks and where it writes.

### [#1983](https://github.com/chester-hill-solutions/callcaster/issues/1983) Receipts should have tax (and the charges themselves should be taxed)
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-21
- Recommended title: **Receipts and charges should include tax**
- Product/legal decision: receipts currently show untaxed charges. Adding tax display (and taxing charges) needs a jurisdiction/tax-configuration decision (rates, exemptions, remittance) before implementation.
- Current behavior: Billing shows amounts without tax; receipts have no tax line; ledgers store pretax totals.
- Resolution: Decide: (1) tax on CallCaster charges scope (which products, jurisdictions, rate config), (2) display-only receipts vs taxed ledger amounts. Then implement in the receipt builder + pricing path.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`, `shared/pricing.ts`
- Done when: No implementation until the tax decision is recorded

### [#1880](https://github.com/chester-hill-solutions/callcaster/issues/1880) Roadmap: evaluate Jev (TypeSafe) as the IVR speech-intent service
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-19
- Recommended title: **Decide: adopt Jev (TypeSafe) or hand-roll IVR speech intent**
- Roadmap investigation to replace the vx-any catch-all with structured intent routing via Jev's Choice primitive. Open questions: round-trip latency, per-call/step cost, service boundary, transcript-only vs audio input, EN/FR calibration, failure mode, confidence threshold. Its answer decides #1862 and the deferred confidence slice of #1875.
- Current behavior: vx-any matches any speech longer than 2 characters; no intent classification and no confidence. #1875 slice B stores { value, raw, inputType } only; language defaults en-US.
- Root cause: No intent-classification layer exists; the choice is between a calibrated service and a local normalizer/matcher.
- Resolution: Run the evaluation as a spike: benchmark latency and cost per step, test EN/FR calibration, pick a service boundary and fallback, and record a decision with an ADR. Then either open the Jev integration ticket or unblock #1862 as a hand-rolled matcher.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/lib/ivr-gather.server.ts`, `app/lib/ivr-webhook-auth.server.ts`, `docs/adr/`
- Existing tests: test/ivr-gather.test.ts
- Done when: Latency, cost, bilingual calibration, and failure-mode answers recorded; A decision: adopt Jev or hand-roll, with a named service boundary; #1862 and the #1875 confidence slice unblocked or closed accordingly
- Tracker: needs-decision/roadmap spike. Keep vx-any as-is until answered; its outcome decides #1862.

### [#1741](https://github.com/chester-hill-solutions/callcaster/issues/1741) IVR simple vs complex should be a script-side concern, not a campaign type choice
- Verdict: **Needs decision** · Size: S-M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-18
- Recommended title: **change(ivr): make simple/complex a script property, not a campaign type**
- Campaign setup offers Simple IVR vs Complex IVR, but the runtime treats both identically; complexity belongs to the script (one page vs menus).
- Current behavior: CampaignBasicInfo.SelectType exposes simple_ivr/complex_ivr; dispatch/execution treat them the same.
- Root cause: Design decision.
- Resolution: Decide: single IVR option at campaign setup; campaign_type simple_ivr/complex_ivr kept for existing rows and possibly derived from the script.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`, `app/lib/campaign-execution.server.ts`, `app/db/schema.ts`
- Existing tests: test/ui/campaign-* type selection
- Done when: campaign setup asks IVR once; no behavioural difference to lose
- Tracker: Product decision first; storage/UI change after.

### [#1852](https://github.com/chester-hill-solutions/callcaster/issues/1852) cleanup .env
- Verdict: **Needs decision** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-18
- Recommended title: **cleanup .env: document Twilio env vars and define config-as-code vs layered secrets**
- Audit and rationalize environment variables. Both TWILIO_APP_SID and TWILIO_AUTH_TOKEN in .env.example are used, but there is no documented policy for config-as-code vs secrets and no layered secret resolution.
- Current behavior: TWILIO_APP_SID is the TwiML App SID for Voice SDK outbound and is auto-assigned per non-protected environment; TWILIO_AUTH_TOKEN is used for REST calls. Some paths use TWILIO_API_KEY/TWILIO_API_SECRET. No ENVIRONMENT singleton and no .secrets/env.<environment> layering.
- Root cause: No documented owner/purpose per variable and no agreed boundary between config and secrets.
- Resolution: Decide the env schema and secret precedence (.env -> .secrets/env.<environment> -> secrets manager), document each variable's purpose and which are secrets, then prune unused/duplicated variables. Prefer an ENVIRONMENT selector over per-value env config.
- Look in: `.env.example`, `app/lib/env.server.ts`, `app/lib/required-env-keys.mjs`, `app/server/environment-twiml-app.server.ts`, `docs/twilio-runtime-inventory.md`, `docs/local-development.md`, `scripts/railway/`
- Existing tests: test/env.server.test.ts
- Missing tests: Env validation / precedence for layered secrets; A guard that fails on an undocumented or unused required key
- Done when: Every env var has a documented purpose and secret/config classification; Unused or duplicated variables removed; Secret precedence defined and easy to swap to a secrets manager; Non-sensitive config handled as config, not env values
- Tracker: Decision (secrets/config policy) before edits. Coordinate with #1329. Do not touch the user's live .env.

### [#1848](https://github.com/chester-hill-solutions/callcaster/issues/1848) call list mapping
- Verdict: **Needs decision** · Size: S · Risk: low · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-18
- Recommended title: **Decide the default mapping when a full-name and a last-name column both exist**
- Suggestion to auto-map a full-name column to firstname instead of name when a separate populated surname column exists, so the pair is not blocked by the ambiguous-name rule. The reporter is unsure the heuristic is worth the overhead.
- Current behavior: suggestContactImportMapping maps a 'Name' header to 'name' and a 'Last name' header to 'surname'; validateContactImportMapping then raises a blocking ambiguous-name issue.
- Root cause: Auto-mapping has no cross-column heuristic; a full-name column and component-name columns cannot coexist because ambiguous-name is blocking.
- Resolution: Decide whether to add a heuristic: when one header resolves to 'name' and a different header resolves to 'surname' and the name column's values do not already contain the surname values, default the name column to 'firstname'. If approved, implement in shared/contact-import-headers.ts and cover it with tests.
- Look in: `shared/contact-import-headers.ts`, `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/AudienceUploader.tsx`
- Existing tests: test/contact-import-headers.test.ts
- Missing tests: Name + separate surname data maps to First name + Last name without a blocking issue; Negative case: a name column that already contains the surname keeps the full-name mapping
- Done when: Decision recorded on whether to add the heuristic; If added, a Name column plus a Last name column with data maps to First name + Last name and is not blocking; Name-only files keep name splitting
- Tracker: needs-decision: the reporter questions the overhead; confirm the heuristic is wanted before implementing.

### [#1815](https://github.com/chester-hill-solutions/callcaster/issues/1815) MFA is turned off?
- Verdict: **Needs decision** · Size: XS · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-13
- Recommended title: **Decide TWO_FACTOR_ENABLED kill-switch state per environment**
- Screenshot-only report from Sai. Env check resolves it: MFA is off BECAUSE TWO_FACTOR_ENABLED is unset on the review (dev) env AND on production app services (Railway list-variables; only DISABLE_2FA_ENFORCEMENT + NODE_ENV present on review, and neither 2FA var on production). isTwoFactorFeatureEnabled() (env.server.ts:270) is false unless TWO_FACTOR_ENABLED=true|1 — the #1569 kill-switch default.
- Current behavior: Better Auth twoFactor plugin is not registered; no code prompt at sign-in for enrolled users. Enrollment rows are kept (two-factor.server.ts:59) so setting the flag turns it all back on.
- Root cause: None — MFA is off by the intended kill-switch default because the optional env flag is unset everywhere.
- Resolution: Decide the intended state. To enable 2FA, set TWO_FACTOR_ENABLED=true|1 on dev + production and retest. Otherwise keep the kill switch and close with the explanation.
- Look in: `app/lib/env.server.ts`, `app/lib/two-factor.server.ts`
- Existing tests: test/two-factor-kill-switch.route.test.ts; test/two-factor.server.test.ts
- Done when: Decide whether 2FA should be on; If on, set TWO_FACTOR_ENABLED and verify the plugin registers
- Tracker: Keeps blocking #1316 until the state is decided.

### [#1789](https://github.com/chester-hill-solutions/callcaster/issues/1789) Voice campaign exports calculate credits with the retired one-credit-per-minute rate
- Verdict: **Needs decision** · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1798 (a80b3f9c) fixed voice export rate math and zero-duration gating: exports now use voiceCreditsFromDurationSeconds (shared/pricing.ts:122; IVR 2+3, staffed 4+5) and gate zero-duration attempts to 0 (campaign-export.server.ts:436-447). CONFIRMED in current dev; test/campaign-export-voice-credits.test.ts pins it. The only open item is the estimate-versus-ledger contract and the credits_used label.
- Current behavior: The CSV credits_used value is calculated from duration and shared pricing, not read from ledger debits. The column remains named credits_used.
- Root cause: The arithmetic fix does not establish whether the field promises actual debits or an estimate.
- Resolution: Decide the credits_used contract. If it remains an estimate, label it clearly; if actual debits are required, source it from the ledger. Preserve the corrected rates.
- Look in: `app/lib/campaign-export.server.ts`, `shared/pricing.ts`
- Existing tests: test/campaign-export-voice-credits.test.ts
- Missing tests: Acceptance check for the selected actual-versus-estimated contract.
- Done when: Define actual ledger debits versus estimated credits.; Label an estimate clearly, or source actual debits from the ledger.
- Tracker: Keep this contract decision open. Do not repeat the rate calculation fix from PR #1798.

### [#1773](https://github.com/chester-hill-solutions/callcaster/issues/1773) Daily lossless data backup per workspace (CSV snapshots + manifest + retention)
- Verdict: **Needs decision** · Size: L · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-11
- Recommended title: **feature(backup): daily lossless per-workspace CSV snapshots + manifest + retention**
- No data backup today. Adopt quick-canvass backup.workspace_csv pattern: daily self-scheduling job snapshots workspace-scoped core tables to a backup bucket with manifest.json, date-keyed retention pruning (BACKUP_RETENTION_DAYS, default 30), per-workspace failure isolation.
- Current behavior: No daily data backup exists; worker only does job-row retention.
- Root cause: Gap — no snapshot job.
- Resolution: Register a schedule:true worker job; reuse uploadObject/listObjects/deleteObject; phase-1 coverage from app/db/workspace-scoped-tables.ts; BACKUP_S3_BUCKET/BACKUP_RETENTION_DAYS env; docs restore procedure.
- Look in: `app/lib/worker/handlers.server.ts`, `app/lib/object-storage.server.ts`, `app/db/workspace-scoped-tables.ts`, `app/lib/env.server.ts`
- Missing tests: daily snapshot + manifest appear; retention pruned; one failing workspace does not stop others
- Done when: per-workspace snapshot + manifest daily; older-than-retention pruned; failure isolation + errored job; restore documented
- Tracker: Phase-1: core tables; document coverage in the manifest format.

### [#1771](https://github.com/chester-hill-solutions/callcaster/issues/1771) Audience import: per-row error report + retain the original CSV artifact
- Verdict: **Needs decision** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-11
- Recommended title: **feature(audience): per-row import error report + original CSV artifact**
- Persist per-row failures (rowNumber + field + reason) during the audience import job and expose a reviewable list; store the original CSV at a workspace-scoped artifact path.
- Current behavior: Only aggregate counts (skipped invalid/duplicate) are surfaced; original file not retained.
- Root cause: No per-row capture or artifact retention, unlike gocanvass.
- Resolution: Record per-row errors in the job; surface in the progress/completion panel; upload original.csv under {ws}/{importId}/ with existing guards.
- Look in: `app/lib/audience-upload-process.server.ts`, `app/components/audience/AudienceUploader.tsx`, `app/lib/object-storage.server.ts`
- Missing tests: per-row errors persisted + listed; original retained under workspace prefix
- Done when: reviewable per-row failure list or download; original CSV retained safely; aggregate counts unchanged
- Tracker: Co-ordinate with #1770.

### [#1770](https://github.com/chester-hill-solutions/callcaster/issues/1770) Audience CSV import: client-side preview + column-mapping step (gocanvass parity)
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-11
- Recommended title: **feature(audience): client-side preview + column-mapping step (gocanvass parity)**
- Add a preview/map step to the audience uploader: parse client-side, show headers + rows, guess and edit the mapping, then start. Server validation stays the gate.
- Current behavior: AudienceUploader is fire-and-forget: server parses + validates, job starts.
- Root cause: UX gap vs gocanvass's import wizard.
- Resolution: Wizard: file -> preview/map -> start; browser-safe CSV parser; reuse shared/contact-import-headers types.
- Look in: `app/components/audience/AudienceUploader.tsx`, `app/lib/csv.ts`, `shared/contact-import-headers.ts`, `app/routes/api+/audience-upload.action.server.ts`
- Existing tests: test/ui/audience-uploader.test.tsx
- Missing tests: preview renders parsed headers/rows; mapping submitted with upload
- Done when: parsed preview before start; columns mappable; server validation still gates
- Tracker: Scope with #1771 (can ship together or split).

### [#1742](https://github.com/chester-hill-solutions/callcaster/issues/1742) IVR script editor: preview Speak (TTS) steps
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-09
- Recommended title: **feature(ivr): preview Speak (TTS) steps in the script editor**
- Spoken IVR steps have no in-editor preview; recorded steps do. Add a Preview control that plays the text in the selected Polly voice.
- Current behavior: No TTS preview endpoint; text+voice only materialise when Twilio runs the call.
- Root cause: Feature gap.
- Resolution: Add a workspace-gated route using AWS Polly SynthesizeSpeech (voices are Polly ids) + a preview control in SpokenStepFields; AWS creds need polly:SynthesizeSpeech.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/lib/tts-voices.ts`, `app/routes/workspaces+/$id/audios/$fileName.preview.loader.server.ts`
- Missing tests: preview plays selected voice text; membership enforced
- Done when: Speak step previews audibly; voice matches the block; workspace-gated
- Tracker: Confirm provider (Polly vs ElevenLabs) then implement.

### [#1729](https://github.com/chester-hill-solutions/callcaster/issues/1729) Auto selected disposition
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-09
- Auto-disposition mapping needs a spec (which outcome → which disposition, when overridable). Relevant machinery already exists (#1458 hold-screen, debounced auto-save).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1732](https://github.com/chester-hill-solutions/callcaster/issues/1732) Campaign queue statuses
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-09
- Umbrella queue status-model redesign (completion vs outreach status; missing opted-out/dialing/failed states). Big product decision; 1720 is a subset.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1722](https://github.com/chester-hill-solutions/callcaster/issues/1722) What does "kick off" on campaign launch pane do
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- 'Kick off' button (running/paused) has no explanation and Sai 2026-09-09 confirms confusion; product decides label/tooltip/placement.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1724](https://github.com/chester-hill-solutions/callcaster/issues/1724) What happens if we use template tags on a contact that doesn't have that piece of information?
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question · Assignee: none · Updated: 2026-09-09
- Current behavior: missing contact fields render empty string or the fallback (code answers the question). Product decides the desired UX (placeholder/flagging).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1723](https://github.com/chester-hill-solutions/callcaster/issues/1723) template tags should let you click the contact name it's rendering for and open a combo box to use someone else
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Feature request (template-tag → contact picker) whose scope depends on the tag UX decisions in 1724/1725; product decision first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1710](https://github.com/chester-hill-solutions/callcaster/issues/1710) Should surveys be separate from scripts instead of integrated?
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-09
- Architecture question whether surveys should merge into scripts. Surveys exist as a separate module with public & workspace routes; consolidation scope needs a decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1709](https://github.com/chester-hill-solutions/callcaster/issues/1709) Workspace Sidebar
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-09-09
- Major UX redesign of the workspace/campaign sidebar; interaction model (per-campaign sidebar with status/completion/quick controls) needs a product decision before scoping.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1659](https://github.com/chester-hill-solutions/callcaster/issues/1659) Admin: Twilio cost breakdown per workspace/account
- Verdict: **Needs decision** · Labels: none · Assignee: none · Updated: 2026-09-08
- Twilio cost breakdown could mean workspace ranking, more detail within one workspace, or both.
- Resolution: Confirm the intended view before implementation. Reuse existing usage projection.
- Look in: `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.UsagePanel.tsx`

### [#1657](https://github.com/chester-hill-solutions/callcaster/issues/1657) Admin Twilio portal page is overwhelming — group into sections/tabs
- Verdict: **Needs decision** · Labels: none · Assignee: none · Updated: 2026-09-08
- The admin Twilio page needs grouping. The issue explicitly requests confirmation of panel priorities before implementation.
- Resolution: Confirm the default tab and grouping, then ship a presentation-only PR.
- Look in: `app/routes/admin+/workspaces/$workspaceId/twilio`

### [#1521](https://github.com/chester-hill-solutions/callcaster/issues/1521) decision(billing): should Stripe refunds/disputes reverse credits?
- Verdict: **Needs decision** · Labels: business-logic · Assignee: none · Updated: 2026-09-03
- Refunds and disputes do not reverse credits under the current documented billing scope.
- Resolution: Choose automatic reversal or an explicit manual policy before changing ledger behavior.
- Look in: `app/routes/api+/stripe-webhook.action.server.ts`, `docs/billing-source-of-truth.md`

### [#1320](https://github.com/chester-hill-solutions/callcaster/issues/1320) Transfer phone number from old CHS workspace to new CHS workspace if possible
- Verdict: **Needs decision** · Size: S-M · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-08-25
- Recommended title: **ops(twilio): migrate one CHS number with callback and database reconciliation**
- Transfer a Twilio number from the old CHS workspace to the new one. This is an operational migration (Twilio-side), not a product feature; no number-transfer action exists.
- Current behavior: Settings support routing/release/purchase/caller-id only; no transfer workflow.
- Root cause: Not a product gap; one-off infra task.
- Resolution: Run a one-off runbook: confirm ownership, transfer in Twilio, insert/update destination workspace row, repoint callbacks/messaging service, verify inbound/outbound, remove old row, record rollback + evidence.
- Look in: `app/routes/workspaces+/$id/settings/numbers.action.server.ts`, `app/lib/platform-workspace-numbers.server.ts`
- Blocked by: [#1329](https://github.com/chester-hill-solutions/callcaster/issues/1329)
- Existing tests: n/a — operational
- Missing tests: before/after evidence, rollback steps
- Done when: Ownership confirmed before transfer; Voice/SMS/callbacks work in new workspace; Single owner after migration
- Tracker: Ops task with rollback plan; may depend on #1329 account ownership.

---

## Blocked / split first — 33

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

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

### [#1356](https://github.com/chester-hill-solutions/callcaster/issues/1356) Point dev.callcaster.ca at the dev environment (DNS + IaC)
- **IN PROGRESS** · Verdict: **Blocked / split first** · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-09-25
- The dev custom domain was attached in Railway; DNS and IaC ownership were still missing at the last verified report.
- Resolution: Inspect current DNS and the Railway target. DNS changes need access to the domain zone, then codify the live mapping.
- Look in: `.railway/environments/dev.ts`

### [#2031](https://github.com/chester-hill-solutions/callcaster/issues/2031) Ensure authorization checks are correctly checking underlying permissions not the broad role
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Recommended title: **Sweep: authorization checks a permission, not a broad role**
- The codebase-wide consistency pass: every authorization check should test the underlying permission rather than comparing a broad role. Thin on its own — it is a consequence of the model, not a design.
- Current behavior: Checks are inconsistent, comparing roles in some places and something narrower in others.
- Root cause: Each check was written locally against whatever was convenient at the time.
- Resolution: Blocked by #2030 and, in practice, by the rest of the cluster: a sweep before the model exists would have nothing correct to sweep toward. Land it last. Use the existing structural gates rather than grep alone — check:route-authz is the natural home for an assertion that no route compares a raw role string, and a lint rule would keep it from regressing.
- Look in: `app/lib/**-middleware.server.ts`, `scripts/checks/check-route-authz.mjs`, `eslint.config.mjs`
- Blocked by: [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030), [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008)
- Existing tests: check:route-authz structural gate
- Missing tests: a gate that fails when a new route compares a role string directly
- Done when: No route or loader compares a broad role string where a permission check is meant; check:route-authz fails when a new role comparison is introduced; The sweep lands after the model, not before
- Tracker: Deliberately last. Sweeping checks before the model exists is how you end up rewriting the same lines twice.

### [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030) Ensure roles are correctly wrappers around sensible permissions.
- Verdict: **Blocked / split first** · Size: M · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- Recommended title: **Spike: weigh permission models against what the auth system already provides**
- The root of the authorization cluster and the first thing that must land. The issue text is explicit: before making implementation and architecture decisions, weigh the options and investigate what systems the codebase already has in place, and what the tools being used — better-auth — can provide. Everything else in the cluster is unspecified until this reports.
- Current behavior: Unknown until investigated. The risk is building a hand-rolled permission layer over an auth system that already has an administration/permission plugin, which is the most expensive possible outcome here because it doubles the model and leaves two sources of truth.
- Root cause: Roles were adopted as the model without first checking whether a permission primitive was available.
- Resolution: Produce a written recommendation, not code. Cover: what better-auth already provides for roles and permissions, including its admin plugin, and whether it is already installed or only nominally a dependency; what the codebase already has, since the tenant-scoped client and the middleware boundary are a de facto authorization layer; the realistic options with their migration cost; and a recommendation with the reason. State explicitly what was ruled out and why, so the next person does not re-derive it.
- Look in: `package.json (better-auth version and plugins in use)`, `app/lib/admin-middleware.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/server/tenant-db.ts`, `app/lib/data-plane-middleware.server.ts`
- Done when: A written recommendation exists, reviewed before any implementation begins; better-auth permission capabilities are established from the installed version, not from documentation memory; Existing in-repo authorization is inventoried so it is extended rather than duplicated; Ruled-out options are recorded with reasons
- Tracker: Highest value-per-size item in the entire board, and it blocks five others. Do this before writing any authorization code anywhere. Sizing is M because it is investigation, not implementation — the implementation is the XL.

### [#1752](https://github.com/chester-hill-solutions/callcaster/issues/1752) Standardize campaign completion exports (SMS report format)
- Verdict: **Blocked / split first** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Large multi-part export feature (PDF report with appendices + CSV + run/aggregation + inbound detail) referencing the Lee Fairclough format. Too large for one ticket — split PDF pipeline, CSV, and aggregation layers first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2010](https://github.com/chester-hill-solutions/callcaster/issues/2010) sign in and sign up page has a scrollbar even though it fits in VH?
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-24
- Recommended title: **auth pages: scrollbar appears even though the page fits the viewport**
- The sign-in and sign-up pages show a scrollbar even though the content fits within the viewport height. Grouped under the auth-pages epic (#2057).
- Current behavior: A vertical scrollbar renders on pages whose content should fit.
- Root cause: Most likely an over-sized form container rather than genuinely long content.
- Resolution: Blocked by #2013. Fix the shared container geometry first, then re-check. If the scrollbar is gone, close this as resolved-by rather than carrying a separate fix for a symptom that no longer exists. If it persists, reopen with the specific remaining cause rather than assuming it is the same issue.
- Look in: `app/routes/account.sign-in.*`, `app/routes/account.sign-up.*`, `app/components/shared/AuthCard.tsx`
- Blocked by: [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013)
- Missing tests: no scrollbar at 1x viewport height; regression guard once the container is fixed
- Done when: No scrollbar at the supported viewport range; Either closed as resolved by #2013, or reopened with the specific remaining cause
- Tracker: Suspect this closes for free with #2013. Do not fix it first — a scrollbar fix that is really a layout fix will be undone by the next alignment change.

### [#1357](https://github.com/chester-hill-solutions/callcaster/issues/1357) Point qa.callcaster.ca at the staging/qa environment (DNS + IaC)
- Verdict: **Blocked / split first** · Labels: devops/admin · Assignee: none · Updated: 2026-09-23
- The qa custom domain depends on the environment naming decision and DNS access. Staging continues to track master.
- Resolution: Resolve the naming decision, attach the domain through IaC, set DNS, and verify readyz externally.
- Look in: `.railway/environments/staging.ts`
- Blocked by: [#1355](https://github.com/chester-hill-solutions/callcaster/issues/1355)

### [#2014](https://github.com/chester-hill-solutions/callcaster/issues/2014) sign in page error should be correctly styled as a snackbar not just inline text
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-23
- Recommended title: **auth pages: sign-in errors should be a toast, not inline text (sweep split to #2058)**
- The sign-in page renders errors as inline text under the form instead of a toast. The issue also asked for a codebase-wide sweep of the same mistake; that half is too large and too risky to bundle with a one-page fix, so it was split into #2058. This issue keeps the sign-in page instance only.
- Current behavior: A failed sign-in renders inline error text under the form.
- Root cause: The page renders the error in place rather than through the app-wide toast pattern.
- Resolution: Blocked by #2013 so the change sees the finished layout. Render the sign-in failure through toast() from sonner, against the single root Toaster named in AGENTS.md. Do NOT widen the scope here — the codebase-wide inventory and the keep/change judgement live in #2058, and a blanket find-and-replace would delete legitimate form validation.
- Look in: `app/routes/account.sign-in.*`, `app/components/ui/sonner.tsx`, `AGENTS.md (design-system section)`
- Blocked by: [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013), [#2058](https://github.com/chester-hill-solutions/callcaster/issues/2058)
- Missing tests: a failed sign-in raises a toast
- Done when: A failed sign-in surfaces through a toast, not inline text; No inline error text remains on the sign-in page; The change is scoped to this page; the sweep ships separately as #2058
- Tracker: Small fix, but deliberately not where the codebase-wide question gets answered. Doing both at once is how form validation gets deleted.

### [#780](https://github.com/chester-hill-solutions/callcaster/issues/780) Hang up controls/block in IVR script
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-23
- Recommended title: **Hang up controls/block in IVR script (parent of #1883 + #1884)**
- Bundles four asks. Split into #1883 (per-step configurable no-input wait + action; dev, PR #1937) and #1884 (explicit Hang up routing target + guaranteed terminal hangup; open). The runtime already understands next:'hangup' and ends the script with a hangup, so #1884 is editor exposure plus validation.
- Current behavior: No-input handling exists on dev (#1883). 'Hang up' is selectable in the editor via scriptkit and maps to <Hangup/>; gaps are next:'end' unhandled, dangling targets unvalidated, no guaranteed terminal/cycle check (#1884).
- Root cause: Parent tracking ticket; the only remaining work is the explicit/validated terminal owned by #1884.
- Resolution: Keep open until #1884 lands, then close. Do not rebuild the shipped #1883 no-input handling or the working hangup routing.
- Look in: `app/lib/ivr-block-runtime.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/components/campaign/settings/script/ScriptBlockEditor.routing.ts`
- Blocked by: [#1884](https://github.com/chester-hill-solutions/callcaster/issues/1884)
- Existing tests: test/ivr-block-response.route.test.ts; test/ui/script-block-editor-ivr.test.tsx
- Missing tests: next:'end' is terminal at runtime; dangling page/block target hangs up instead of redirecting; reachable routing cycle is reported/blocked at launch
- Done when: Hang up is selectable as an option's next step; A published script always ends in a terminal hangup; Configurable no-input wait and reroute (delivered by #1883)
- Tracker: Parent. #1883 shipped on dev (PR #1937 e79644b9); #1884 open. Close when #1884 lands.

### [#2009](https://github.com/chester-hill-solutions/callcaster/issues/2009) "Agent" role needs ABAC around what specific campaigns they can see/action
- Verdict: **Blocked / split first** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-23
- Recommended title: **Agent ABAC: adding an Agent to a campaign unlocks that campaign type for them**
- The attribute-based half of the cluster. Adding an Agent to a specific campaign should also unlock their broader ability to see and act on that campaign type: added to a live-call campaign, it appears on their list and is callable if open; added to an SMS campaign, its numbers become visible on the chats page.
- Current behavior: Campaign membership is a relation, but it does not appear to confer the broader capability, and the broader capability does not appear to be scoped back down to the campaigns they are actually on.
- Root cause: Two separate concerns — which campaign types you may touch, and which campaigns within a type — are not expressed in the same model, so membership cannot imply the first.
- Resolution: Blocked by #2008, which defines the type-level capability set this refines. Two distinct grants are needed and they must not be conflated: a type-level capability from the role defaults, and a campaign-level grant from membership. The test that matters is negative — an Agent with access to one SMS campaign must not see another campaign's numbers.
- Look in: `app/db/schema.ts (campaign membership relation)`, `app/lib/workspace-middleware.server.ts`, `app/routes/workspaces+/$id/**/chats`, `app/components/**/CampaignList`
- Blocked by: [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008)
- Missing tests: membership grants visibility of exactly that campaign; an Agent on one SMS campaign cannot see another campaign numbers
- Done when: Campaign membership confers a campaign-level grant; An Agent sees only the campaigns they are on, within the types they may touch; The negative case is tested: one campaign membership does not leak another campaign; Type-level and campaign-level grants are separate and both readable in the code
- Tracker: Blocked by #2008 on purpose — the two are easy to conflate and building this first would bake in the wrong model. The negative test is the one that proves it; without it a permissive implementation looks correct.

### [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008) "Agent" roles need better defined permissions around top level live call campaign calling, messages, and handset usage
- Verdict: **Blocked / split first** · Size: M · Risk: high · Labels: business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **Agent role: define the permission surface for calling, messages and handset**
- The broad policy question behind the cluster. Decide which capabilities an Agent has over live-call campaigns, IVR campaigns and SMS campaigns. The issue proposes defaults of all live-call campaigns, no IVR campaigns, no SMS campaigns, and states that without access those pages must be hidden from the sidebar AND return 403 on a direct attempt.
- Current behavior: Partly implicit. The sidebar is the main gate, so a denied user can often still reach a page by URL.
- Root cause: Capability-by-capability policy was never written down, so it is enforced ad hoc in whichever component happened to check it.
- Resolution: Blocked by #2030, which supplies the permission vocabulary. Then: write the default capability set down as data, not as scattered conditionals; enforce at the route for every surface in the set, so hiding the sidebar and refusing the URL are the same rule applied twice; and confirm the 403 requirement, noting it differs from the 404-for-non-members convention in AGENTS.md — that convention is about workspace membership, whereas this is about a known member lacking a capability, so 403 is defensible here. Worth deciding that boundary explicitly rather than by accident.
- Look in: `app/components/layout/WorkspaceSidebar.tsx`, `app/lib/workspace-middleware.server.ts`, `app/routes/workspaces+/$id/**`, `app/db/workspace-scoped-tables.ts`
- Blocked by: [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030)
- Missing tests: each capability has a route-level enforcement test; sidebar visibility and route enforcement agree
- Done when: The Agent capability set is written down as data, not scattered conditionals; Every denied surface returns 403 on a direct URL attempt, not only when hidden; The 403-versus-404 boundary is decided and documented rather than incidental; Sidebar visibility and route enforcement read from the same source
- Tracker: This is the product decision the cluster is really waiting on. The defaults in the issue are a proposal, not a decision — get them confirmed before building enforcement, or the enforcement work gets thrown away when the policy changes.

### [#2002](https://github.com/chester-hill-solutions/callcaster/issues/2002) Comprehensive permission based authorization
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **epic(authz): permission-based authorization instead of role checks**
- Parent of the authorization cluster. The product currently gates on three broad roles — Admin sees and edits everything, Coordinator sees and edits campaigns and agents, Agent can join campaigns — and the request is to move to permissions applied to people, with the existing roles kept as default groupings. Explicitly excludes UX around building grouped access policies: plan and implement the permission model first.
- Current behavior: Access is decided by comparing a role string. Route loaders and actions check the role, not whether the specific action is permitted.
- Root cause: Authorization was modelled as a role comparison from the start and every check since has followed that shape.
- Resolution: Do not start here. Blocked by #2030, because the issue text for #2030 is explicit that the implementation and architecture decisions need the options weighed first against what better-auth already provides. The sequencing is: #2030 investigates and recommends, then #2003 and #2008 can be specified, #2009 builds on #2008, and #2031 is the codebase-wide consistency sweep that lands last because it depends on the model existing everywhere.
- Look in: `app/lib/admin-middleware.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/auth-layout.server.ts`, `eslint.config.mjs (no-restricted-imports, tenant boundary)`
- Blocked by: [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030)
- Missing tests: permission model exists; each permission has a test at the route that enforces it
- Done when: A permission model exists that roles map onto as default groupings; Authorization checks a permission rather than comparing a role string; Existing roles continue to work as groupings without a migration per user; No route is left checking a broad role where a specific permission is meant
- Tracker: Parent epic. Explicitly out of scope per the issue text: the UX for building grouped access policies. Do not begin implementation before #2030 reports.

### [#2003](https://github.com/chester-hill-solutions/callcaster/issues/2003) Users with "Agent" role can access pages they aren't meant to
- Verdict: **Blocked / split first** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-23
- Recommended title: **Agent role can reach the billing page by URL even though the sidebar link is hidden**
- A concrete live instance of the gap the cluster is about. The Credits entry is correctly absent from the sidebar for the Agent role, but an Agent who types the billing path directly reaches the page. Hiding a link is not access control.
- Current behavior: Sidebar hides the link; the route does not enforce the permission. The route renders.
- Root cause: UI visibility was treated as the control. The route has no permission check for this resource.
- Resolution: Blocked by #2030, because the right fix is a permission check and which permission depends on the model. When it lands: the route must enforce, not merely render, and a direct URL request must be refused. Note the existing convention from AGENTS.md — a non-member gets a uniform 404 rather than a 403, to avoid workspace-id inference, so match whatever the sibling billing routes already do rather than inventing a response shape.
- Look in: `app/routes/workspaces+/$id/billing.*`, `app/components/layout/WorkspaceSidebar.tsx`, `app/lib/workspace-middleware.server.ts`
- Blocked by: [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030)
- Missing tests: an Agent requesting the billing path directly is refused
- Done when: An Agent requesting the billing path by URL is refused; The refusal matches the convention used by sibling routes (404 for non-members); The check is a permission check at the route, not a UI-visibility check
- Tracker: The smallest concrete instance of the cluster and the easiest to verify, so it makes a good first implementation once #2030 reports. Keep it separate from the model work so the model is not judged by one route.

### [#2011](https://github.com/chester-hill-solutions/callcaster/issues/2011) Sign up page should have background mural the way sign in page does
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-23
- Recommended title: **auth pages: sign-up is missing the background mural that sign-in has**
- The sign-up page lacks the background mural treatment the sign-in page already uses. Grouped under the auth-pages epic (#2057).
- Current behavior: Sign-in has a background mural; sign-up does not.
- Root cause: The treatment was applied to one route only.
- Resolution: Blocked by #2013 so the final visual pass sees the finished layout. Apply the same treatment to sign-up, ideally by extracting it so the two pages cannot drift apart again.
- Look in: `app/routes/account.sign-in.*`, `app/routes/account.sign-up.*`
- Blocked by: [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013)
- Missing tests: both routes render the mural treatment
- Done when: Sign-up renders the same mural treatment as sign-in; The treatment is shared, not duplicated per route
- Tracker: Trivial, but land it after #2013 so nobody has to re-verify alignment afterwards.

### [#1892](https://github.com/chester-hill-solutions/callcaster/issues/1892) DRY pass: de-duplicate the largest copy-paste clones (jscpd)
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-20
- Umbrella tracking issue. The gate dropped from 214 clones / 2884 lines to 178 / 1902 via PRs #1920, #1923, #1930 (and 177 / 1895 in #1987). The remaining ranked clones are tracked as open child issues (#1912-#1919; #1911 closed in the 2026-09-21 release).
- Current behavior: scripts/dry-baseline.json holds the gate at 178 clones / 1902 duplicated lines (1.28%).
- Root cause: Copy-paste duplication across the ranked files; each row needs a behaviour-preserving extraction.
- Resolution: Do not schedule this issue directly. Work the child issues #1912-#1919 one atomic PR each, then lower scripts/dry-baseline.json with npm run tools:dry:baseline after every extraction.
- Look in: `scripts/dry-baseline.json`, `scripts/check-dry.mjs`
- Blocked by: [#1912](https://github.com/chester-hill-solutions/callcaster/issues/1912), [#1913](https://github.com/chester-hill-solutions/callcaster/issues/1913), [#1914](https://github.com/chester-hill-solutions/callcaster/issues/1914), [#1915](https://github.com/chester-hill-solutions/callcaster/issues/1915), [#1916](https://github.com/chester-hill-solutions/callcaster/issues/1916), [#1917](https://github.com/chester-hill-solutions/callcaster/issues/1917), [#1918](https://github.com/chester-hill-solutions/callcaster/issues/1918), [#1919](https://github.com/chester-hill-solutions/callcaster/issues/1919)
- Existing tests: check:dry gate is the acceptance signal
- Done when: clones/duplicatedLines drop and the baseline is lowered to lock it; One implementation per clone; call sites behave the same
- Tracker: Umbrella/tracker; do not pick directly. Work the open children #1912-#1919.

### [#268](https://github.com/chester-hill-solutions/callcaster/issues/268) i18n: add proper localization with fr-CA as the first locale
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-19
- Recommended title: **i18n epic: fr-CA as the first locale (6 slices, one PR each)**
- Multi-PR epic reviving #268. Decisions recorded (React Aria I18nProvider + @react-aria/i18n; react-i18next + remix-i18next JSON catalogs; per-user locale with workspace default en-CA; per-campaign campaign.language; explicit /fr/* marketing routes; sign-in as slice 1). Nothing is implemented.
- Current behavior: English-only app with locale-naive formatting and no locale column on user, workspace or campaign.
- Root cause: No i18n framework or locale resolution was ever added.
- Resolution: Run the six published slices as separate PRs, starting with foundation + sign-in. Split them into child issues so each lands independently.
- Look in: `app/root.tsx`, `app/lib/types.ts`, `app/lib/tts-voices.ts`, `app/routes.ts`, `package.json`, `app/lib/low-credit-notify.server.ts`, `app/lib/billing-reconciliation-alert.server.ts`, `app/lib/send-reset-password-email.server.ts`
- Missing tests: catalog parity - every key present in every locale; locale resolution - user pref, then workspace default, then en-CA; /fr/* routes and hreflang; ICU plural handling for French
- Done when: A signed-in operator can switch to French and UI, dates and numbers render in fr-CA; Outbound voice, SMS and email can be French per campaign; A missing-translation check fails CI
- Tracker: Split first: open six child issues (one per slice) linked to this epic; slice 1 (foundation + sign-in) can start immediately. Do not attempt in one PR.

### [#1862](https://github.com/chester-hill-solutions/callcaster/issues/1862) IVR: fuzzy-match spoken / DTMF input to the script's declared options
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: enhancement, business-logic · Assignee: none · Updated: 2026-09-19
- Recommended title: **IVR: match spoken/DTMF input to the script's declared options (normalize + fuzzy)**
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

### [#1861](https://github.com/chester-hill-solutions/callcaster/issues/1861) Spike: replace Twilio AMD with a local, faster voicemail classifier
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: enhancement, business-logic · Assignee: none · Updated: 2026-09-18
- Investigation spike to keep, replace, or front-run Twilio AMD. Acceptance requires measured time-to-first-audio and accuracy on the same call set, which depends on the instrumentation in #1842 and the live AMD scope in #1845.
- Current behavior: Every outbound path sends synchronous machineDetection: 'Enable'. No async AMD, no local classifier, no shadow mode.
- Root cause: Synchronous AMD adds seconds of dead air and caps accuracy at Twilio's engine; there is no measured baseline.
- Resolution: After #1842 instrumentation and #1845 land, run the spike: measure Twilio async AMD and one local/managed option on the same call set, evaluate the media-stream fork limit, write the report and an ADR with the accuracy/latency threshold, then a phased shadow-mode plan.
- Look in: `app/lib/auto-dial.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/routes/api+/dial/status.action.server.ts`, `app/db/schema.ts`, `docs/adr/0030-media-stream-bun-service-third-railway-process.md`, `docs/live-transcription-coaching-plan.md`
- Blocked by: [#1842](https://github.com/chester-hill-solutions/callcaster/issues/1842), [#1845](https://github.com/chester-hill-solutions/callcaster/issues/1845)
- Missing tests: Measured time-to-first-audio for sync vs async AMD and a local classifier; Classifier accuracy on human/machine/screening/beep/silence/fax; Media-stream fork/concurrency budget at target volume
- Done when: Written report with measured latency and accuracy for Twilio async AMD and one local option on the same call set; Recommendation with an accuracy-latency threshold and reconciliation/fallback policy; If replacing: an ADR and a phased plan starting in shadow mode
- Tracker: Blocked on #1842 instrumentation and #1845. Run as a scoped spike after those land; produce an ADR before any implementation.

### [#1828](https://github.com/chester-hill-solutions/callcaster/issues/1828) PR open qa tests
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- Recommended title: **QA-environment PR acceptance suite against the smart test audience**
- Per-PR QA acceptance run: full sign-up through each of the 3 campaign types against the smart test audience, plus unit tests using CallCaster-qa test credentials.
- Current behavior: PRs run the compose E2E gate and a Twilio test-credential tier, but there is no QA-environment full-flow suite against a CallCaster-qa account.
- Root cause: There is no dedicated CallCaster-qa Twilio account or qa environment wiring yet.
- Resolution: After #1829 lands (which needs #1357), add the QA acceptance workflow and specs: sign up, run the 3 campaign types against the smart test audience, and run the Twilio-tier unit tests with the QA test credentials.
- Look in: `.github/workflows/e2e.yml`, `.github/workflows/ci.yml`, `e2e/`, `test/integration-twilio/`, `vitest.integration-twilio.config.ts`
- Blocked by: [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157), [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829)
- Existing tests: e2e compose gate; .github/workflows/e2e.yml; test/integration-twilio/twilio-test-credentials.test.ts
- Missing tests: QA-environment full-flow acceptance over the 3 campaign types; Unit tier wired to CallCaster-qa credentials
- Done when: PRs run sign-up through the 3 campaign types against the smart test audience; Twilio unit tests use CallCaster-qa credentials; Failures are attributable to the PR
- Tracker: blocked-epic: #1829 (CallCaster-qa Twilio account) and #1157 (smart test audiences) must land first; #1357 gates #1829.

### [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) PR open dev tests
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- Recommended title: **Dev-environment PR acceptance suite**
- Per-PR dev tests: sign-up, create workspace, MFA, rent a number, upload an audience and audio, create a second workspace; plus Twilio-tier unit tests with CallCaster-dev credentials.
- Current behavior: E2E runs in the local compose harness; nothing runs against a dev.callcaster.ca environment backed by a dedicated CallCaster-dev Twilio account.
- Root cause: There is no dedicated CallCaster-dev Twilio account; #1356 and #1827 are both open.
- Resolution: After #1827 lands (which needs #1356), wire the dev PR suite over the listed steps and run the Twilio-tier unit tests with dev credentials.
- Look in: `.github/workflows/e2e.yml`, `e2e/specs/`, `test/integration-twilio/`, `docs/local-development.md`
- Blocked by: [#1827](https://github.com/chester-hill-solutions/callcaster/issues/1827)
- Existing tests: e2e compose gate; test/integration-twilio/twilio-test-credentials.test.ts
- Missing tests: Dev-environment signup / workspace / MFA / number / audience / audio flow; Dev-credential unit tier
- Done when: PRs run the dev checklist against CallCaster-dev; MFA is enabled on the dev test environment; Twilio unit tests use CallCaster-dev credentials
- Tracker: blocked-epic: #1827 (CallCaster-dev Twilio account) first; #1356 gates #1827.

### [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) Create Twilio CallCaster-qa account (ideally with IaC) and update qa.callcaster.ca to use that account
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- Recommended title: **Provision a CallCaster-qa Twilio account and point qa.callcaster.ca at it**
- Create a dedicated Twilio account for QA (ideally via IaC) and repoint qa.callcaster.ca to use it.
- Current behavior: QA has no dedicated Twilio account; #1357 is open and is the prerequisite.
- Root cause: Environment-level Twilio credential separation has not been provisioned; blocked by the DNS/IaC task #1357 (itself blocked by #1355).
- Resolution: Decide manual vs IaC provisioning, create the CallCaster-qa Twilio account, store credentials as environment secrets/vars, and update the qa environment config. Then unblock #1828.
- Look in: `.railway/environments/`, `.railway/railway.ts`, `docs/twilio-runtime-inventory.md`, `docs/twilio-parent-ops-runbook.md`, `.github/workflows/railway-iac.yml`
- Blocked by: [#1357](https://github.com/chester-hill-solutions/callcaster/issues/1357)
- Missing tests: n/a (operations task)
- Done when: CallCaster-qa Twilio account exists and is documented; qa.callcaster.ca uses the QA account credentials; Credentials are stored as secrets/vars, not in the repo; IaC-vs-manual decision is recorded
- Tracker: blocked-epic: #1357 (qa DNS/IaC, blocked by #1355). Confirm the IaC-vs-manual decision when unblocked; this unblocks #1828.

### [#1827](https://github.com/chester-hill-solutions/callcaster/issues/1827) Create Twilio CallCaster-dev account (ideally with IaC) and update dev.callcaster.ca to use that account
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- Recommended title: **Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it**
- Create a dedicated Twilio account for the dev environment (ideally via IaC) and update dev.callcaster.ca to use it.
- Current behavior: There is no dedicated CallCaster-dev Twilio account; dev falls back to shared or main-account credentials. #1356 is open.
- Root cause: Environment-level Twilio credential separation has not been provisioned; blocked by the DNS/IaC task #1356.
- Resolution: Create the CallCaster-dev Twilio account, store the credentials as dev environment secrets/vars, and update the dev.callcaster.ca config. Then unblock #1826.
- Look in: `.railway/environments/dev.ts`, `.railway/railway.ts`, `docs/twilio-runtime-inventory.md`, `docs/twilio-parent-ops-runbook.md`
- Blocked by: [#1356](https://github.com/chester-hill-solutions/callcaster/issues/1356)
- Missing tests: n/a (operations task)
- Done when: CallCaster-dev Twilio account exists and is documented; dev.callcaster.ca uses the dev account credentials; Credentials are stored as secrets/vars, not in the repo; IaC-vs-manual decision is recorded
- Tracker: blocked-epic: #1356 (dev DNS/IaC) first. Confirm the IaC-vs-manual decision when unblocked; this unblocks #1826.

### [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157) Create test audiences for voice, SMS, and AI scenarios
- Verdict: **Blocked / split first** · Size: L-XL · Risk: high · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- Recommended title: **epic(testing): controlled synthetic campaign audiences**
- Let testers upload controlled test audiences for voice/SMS/AI scenarios; in simulator mode data stays synthetic and never contacts real recipients; measure setup time, callback delay, completion, throughput. Parent of #1191/#1192/#1193.
- Current behavior: Seed has one generic audience; upload maps contact fields only; no scenario registry; mock returns fixed successes.
- Root cause: Dependent on the synthetic provider (#1328).
- Resolution: Keep as parent epic; implement #1192 (server-owned scenario profiles) only after the synthetic provider model exists; #1193 is the final acceptance journey.
- Look in: `e2e/fixtures/seed.ts`, `app/components/audience/AudienceUploader.tsx`, `app/components/audience/AudienceUploadMapStep.tsx`
- Blocked by: [#1328](https://github.com/chester-hill-solutions/callcaster/issues/1328)
- Existing tests: seed fixture only
- Missing tests: scenario safety and telemetry
- Done when: Test audiences reference server-owned scenario ids; Simulator rejects real recipient numbers; Runs report timing metrics; No billable traffic
- Tracker: Parent epic; blocked by #1328.

### [#1803](https://github.com/chester-hill-solutions/callcaster/issues/1803) security(deps): remediate open development dependency alerts
- Verdict: **Blocked / split first** · Labels: none · Assignee: none · Updated: 2026-09-12
- The development-scope dependency findings span multiple package families and need separate remediation slices.
- Resolution: Recheck each advisory against current dev, then split by package concern. Preserve both lockfiles and run full ci:local for each slice.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Tracker: The live ticket lists development packages only; do not pull runtime Nano ID or csv-parse into this scope.

### [#1802](https://github.com/chester-hill-solutions/callcaster/issues/1802) security(deps): remediate open runtime dependency alerts
- Verdict: **Blocked / split first** · Labels: none · Assignee: none · Updated: 2026-09-12
- Runtime dependency remediation spans separate packages. Nano ID shipped to dev in PR #1807; qs is in progress under #1809. csv-parse and provider-utils remain to be assessed.
- Resolution: Use one package concern per ticket and PR. Keep this umbrella open until all runtime findings are resolved or have reviewed exceptions; confirm alerts after default-branch promotion.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Tracker: Do not duplicate Nano ID #1805 or the active qs #1809 work.

### [#1329](https://github.com/chester-hill-solutions/callcaster/issues/1329) Twilio environment program - consolidated roadmap (IaC controller, accounts, cost, testing)
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: enhancement, devops/admin · Assignee: none · Updated: 2026-09-09
- Recommended title: **feat(twilio-iac): add ownership manifest and read-only environment plan**
- Roadmap for the Twilio environment program (IaC controller, accounts, cost, testing). Railway IaC is separate and done; no Twilio controller exists. Sub-issues were folded into this issue and are not implemented.
- Current behavior: Twilio operations are imperative workspace actions; workspace provisioning owns dynamic resources; no ownership manifest, plan artifact, or drift workflow.
- Root cause: Roadmap not started; too large for one agent.
- Resolution: First slice only: ownership manifest + read-only 'plan' command (no apply/delete/rental/prune). Later: account separation, state import, drift guardrails, cost inventory, Test Credentials + smoke tests.
- Look in: `app/routes/admin+/workspaces/$workspaceId/twilio.actions.server.ts`, `app/lib/platform-workspace-numbers.server.ts`, `scripts/railway/`, `.railway/README.md`
- Existing tests: none
- Missing tests: plan fixtures; destructive-change rejection; read-back verification
- Done when: Every managed resource has one env/owner/cleanup rule; Read-only plan compares declared vs actual; Plan cannot create/delete/rent; Secrets outside source and output
- Tracker: Split; first slice is M/medium. #1195 overlaps its testing section.

### [#1645](https://github.com/chester-hill-solutions/callcaster/issues/1645) Campaigns: first-class "send a test to this number" for every campaign type
- Verdict: **Blocked / split first** · Labels: none · Assignee: none · Updated: 2026-09-07
- Message tests shipped in #1648 and voice/IVR tests in #1654. The remaining slice is live-call rehearsal.
- Resolution: Scope a separate live-call issue with isolation from queue, results and normal campaign metrics. Do not rebuild the shipped test-send paths.

### [#1498](https://github.com/chester-hill-solutions/callcaster/issues/1498) [Feature]: Add campaign export report with toplines and reply conversations
- Verdict: **Blocked / split first** · Labels: feature request, business-logic · Assignee: none · Updated: 2026-09-02
- The export report needs toplines, inbound replies, contact grouping, attribution and tenant-safe filtering. This is a feature program, not a release cleanup.
- Resolution: Split metrics and conversation projection from artifact presentation; establish scope and fixtures before implementation.
- Look in: `app/lib/campaign-export.server.ts`

### [#1328](https://github.com/chester-hill-solutions/callcaster/issues/1328) Simulated telephony: gateway + synthetic provider for local dev and tests
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: enhancement, devops/admin · Assignee: none · Updated: 2026-08-26
- Recommended title: **feat(telephony): add provider factory and synthetic SMS transport (split further)**
- Build a gateway seam between CallCaster call/SMS paths and the provider, with a synthetic provider for local dev/tests (no Twilio credentials). Consolidates #1156/#1194/#1161.
- Current behavior: Workspace Twilio client hard-wired; IVR/number-rental call Twilio directly; SMS has a client-like seam; E2E mocks intercept browser HTTP only; Compose uses placeholder creds + disabled webhook validation.
- Root cause: No server-side provider abstraction.
- Resolution: Introduce a provider factory + synthetic SMS transport first; add voice and number rental as later slices. Provider selection explicit and fail-closed by environment.
- Look in: `app/lib/database/workspace.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/lib/platform-workspace-numbers.server.ts`, `app/lib/sms-send.server.ts`, `e2e/fixtures/twilio-mocks.ts`
- Existing tests: e2e mocks (browser-level only)
- Missing tests: server-side synthetic contract; status callback delivery; no external Twilio request assertion; synthetic number lifecycle
- Done when: Provider selection explicit and fail-closed; Synthetic sends create deterministic events without creds; Tests prove no Twilio network call; Real Twilio unchanged
- Tracker: Split: factory+SMS, voice, rental. Dependencies #1157/#1192/#1193.

### [#1272](https://github.com/chester-hill-solutions/callcaster/issues/1272) B1: Vertical slice — publish, launch, run, exact-classify SMS/MMS interaction
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-15
- Recommended title: **feat(interactive-sms): deliver a flagged exact-match opener-to-follow-up run slice**
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

### [#1271](https://github.com/chester-hill-solutions/callcaster/issues/1271) A3: Message domain-id + credit reservation primitive for SMS/MMS
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-15
- Recommended title: **feat(billing): add local message identity and atomic SMS credit reservations**
- Give message a local domain-id PK with nullable indexed twilio_sid (rows before provider dispatch) and an atomic PL/pgSQL credit-reservation RPC with settle/reconcile.
- Current behavior: message.sid is the required PK; campaign messages created at Twilio before local persistence; no reservation schema/RPC; billing supports idempotent writes but not holds.
- Root cause: Not implemented.
- Resolution: Additive identity migration first, then reservation/settlement migration + service. Reuse apply_ledger_entry_and_sync_credits, shared/pricing.ts, shared/billing-keys.ts.
- Look in: `app/db/schema.ts`, `app/lib/sms-send.server.ts`, `app/lib/transaction-history.server.ts`, `shared/pricing.ts`, `shared/billing-keys.ts`, `client/migrations/`
- Existing tests: none
- Missing tests: message before SID; nullable unique SID; concurrent reservation affordability; idempotent settle/release/reconcile
- Done when: Message row exists before SID; SID nullable + unique when present; Concurrent reservations cannot overspend; Settle/release/reconcile idempotent
- Tracker: Blocks #1272; independent of the v2 editor.

### [#1269](https://github.com/chester-hill-solutions/callcaster/issues/1269) A1: scriptkit-interaction-core v2 contracts + v1→v2 explicit conversion
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-15
- Recommended title: **feat(scriptkit): add provider-neutral interaction document v2 and deterministic reducer**
- Create vendored @chester-hill-solutions/scriptkit-interaction-core: ScriptDocument v2 schemas (send/collect/action/wait/handoff/complete), typed transitions, strict publish validator, deterministic reducer/effects, exact classifier, explicit convertV1ToV2. Provider/framework neutral.
- Current behavior: Only v1 call-script packages exist under vendor/scriptkit; v2 exists only in ADR-0032.
- Root cause: Not implemented.
- Resolution: Build the package only (no persistence/Twilio/React/billing); ship golden fixtures, publish-validation positive/negative, reducer determinism, effect-ID stability, simulator parity.
- Look in: `vendor/scriptkit/`, `docs/adr/0032-interactive-sms-script-document-v2.md`, `docs/interactive-sms-delivery-plan.md`
- Existing tests: none
- Missing tests: v1->v2 golden; publish validation; reducer determinism; effect ID stability; simulator parity
- Done when: All six ops + transitions exported; convertV1ToV2 explicit with stable warnings; Stable error codes; Deterministic reducer for fixtures
- Tracker: Blocks #1272; independent of #1271; can start.

### [#1268](https://github.com/chester-hill-solutions/callcaster/issues/1268) Interactive SMS/MMS campaigns — release one
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-15
- Recommended title: **epic(interactive-sms): ship release-one audited SMS/MMS interactions**
- Parent epic for interactive SMS/MMS. Milestone A (domain id, single dispatch coordinator, credit reservation, policy) and B (vertical slice). Sub-issues #1269-1272.
- Current behavior: A2 consolidation mostly landed; A1, A3, B1 absent; consent/disclosure tables, flags, and observability have no dedicated child issue; tracking docs stale.
- Root cause: Epic; not single-agent work.
- Resolution: Refresh milestone status in docs/interactive-sms-build-tracking.md; create missing child issues (consent, flags/observability, correlation); keep #1272 blocked until Phase A integrity gates pass.
- Look in: `docs/interactive-sms-delivery-plan.md`, `docs/interactive-sms-build-tracking.md`
- Existing tests: n/a
- Missing tests: release-level suite once implemented
- Done when: Every milestone has owned child issue + dependency; A1-A3 exit gates pass before B1; One flagged workspace completes the slice without duplicate effects/billing
- Tracker: Keep as epic; split before assignment.

---

## Duplicates — 3

Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.

### [#1843](https://github.com/chester-hill-solutions/callcaster/issues/1843) All steps in a script should have a next or "goto" option even outside of a selected choice and how long it waits
- Verdict: **Duplicates** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-23
- Duplicate of: [#1883](https://github.com/chester-hill-solutions/callcaster/issues/1883)
- Recommended title: **IVR step no-input wait + next/goto (folds into #1883 and #1884)**
- Body asks for a per-step no-input behavior: default 10s wait, default to next block, and an option to hang up. That is #1883 (configurable wait + no-input action) plus the explicit terminal routing in #1884.
- Current behavior: After #1883 (dev, PR #1937), a step carries a configurable wait and a no-input action. #1884 still owns the explicit Hang up target and terminal validation.
- Root cause: Same requirement as #1883/#1884, filed before the work was split from #780.
- Resolution: Close as duplicate of #1883. Fold the next/goto and guaranteed-hangup acceptance into #1884. Do not implement again.
- Look in: `app/lib/ivr-step-config.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/components/campaign/settings/script/ScriptBlockEditor.IvrNoInput.tsx`
- Existing tests: test/ivr-step-config.test.ts; test/ivr-block-response.route.test.ts; test/ui/script-block-editor-ivr.test.tsx
- Done when: See #1883 (wait + no-input action) and #1884 (next/goto + terminal hangup)
- Tracker: Duplicate of #1883; the goto half belongs to #1884. Close, do not re-scope.

### [#2000](https://github.com/chester-hill-solutions/callcaster/issues/2000) Invitation accepted toast should be green
- **IN PROGRESS** · Verdict: **Duplicates** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-23
- Duplicate of: [#2032](https://github.com/chester-hill-solutions/callcaster/issues/2032)
- Recommended title: **Invite-accepted confirmation is an inline banner in the destructive tone; it should be a one-time green success toast**
- Same surface as #2032, and #2032 removes it. The invite acceptance renders through QueryParamBanner (app/routes/workspaces+/index.tsx:272-280), which draws a dismissible Alert with no variant (app/components/shared/QueryParamBanner.tsx:43-56). The Alert default is `border-brand-tertiary bg-brand-wash`, and in dark mode --brand-wash is hsl(340 28% 18%), a maroon, so a success message reads as a red error banner. That is the 'should be green' report exactly. Doing it as a colour change would only make the banner green and leave it persistent, shareable through the URL, and inconsistent with the toast pattern the rest of the app uses. One extra finding from the same code: the banner is an Alert, so it carries role="alert" and is beaconed by app/lib/flash-telemetry.client.ts to /api/workspaces/:id/client-flash as an error flash, so a successful invite acceptance is currently logged as an error.
- Current behavior: A maroon, dismissible, URL-replayable inline banner on the workspaces page announcing a successful invite acceptance.
- Root cause: One-time success state is carried in a shareable query parameter because there is no server-owned flash mechanism, and the tone is left to a primitive default that happens to be crimson in dark mode.
- Resolution: Do not implement separately. Fold the tone question into #2032 and close this one. #2032 replaces the banner with a server-owned, signed, one-time session flash that renders as toast.success, which is green by construction and drops the URL-replay and the false error-flash beacon at the same time. A colour-only fix here would be thrown away when #2032 lands. If #2032 is deprioritised and the banner has to stay for a while, the minimal correct interim is variant="success" on that Alert plus removing the role="alert" beacon pollution, and it should be filed as a comment on #2032 rather than a second PR.
- Look in: `app/routes/workspaces+/index.tsx:272-280 (the invite QueryParamBanner)`, `app/components/shared/QueryParamBanner.tsx:43-56 (the Alert with no variant)`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx (default variant = border-brand-tertiary bg-brand-wash)`, `vendor/chester-hill-solutions/shad-cc/src/styles/theme.css:161 (--brand-wash dark = hsl(340 28% 18%))`, `app/lib/flash-telemetry.client.ts (role=alert surfaces are beaconed as error flashes)`
- Existing tests: test/accept-invite.route.test.ts:172 (asserts the current redirect URL, updated by #2032)
- Missing tests: no test asserts the invite success surface is a toast rather than a banner, so it can regress back without failing anything; no test asserts that a success surface is not beaconed to client-flash as an error
- Done when: Invite acceptance shows a green one-time success toast; The message does not replay on refresh or revisit; The success surface is no longer beaconed to client-flash as an error; No colour-only change is shipped on its own
- Tracker: Duplicate of #2032. Same component, same redirect, same root cause, and #2032 deletes the surface rather than recolouring it. Implement once, in #2032, and close this.

### [#1720](https://github.com/chester-hill-solutions/callcaster/issues/1720) Contacts that have opted out should be marked as such in the queue instead of completed
- Verdict: **Duplicates** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Same root cause as 1732: queue_status enum only has queued/dequeued and opted-out entries display as 'completed'. 1732's outreach-status model is the canonical ticket; 1720 is one of its observable symptoms.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

---

## Needs triage — 6

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#2067](https://github.com/chester-hill-solutions/callcaster/issues/2067) check:effects never verifies @effect-deps against the real dependency array
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-25
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2064](https://github.com/chester-hill-solutions/callcaster/issues/2064) Nightly ledger drift check compares the wrong branch against the dev database
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-25
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2063](https://github.com/chester-hill-solutions/callcaster/issues/2063) useChatRealtime depends on array identity, so a freshly-built 'initial' is an unbounded render loop
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-25
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2062](https://github.com/chester-hill-solutions/callcaster/issues/2062) flash-telemetry records every role="alert" as an error, so a successful invite acceptance is logged as an error
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-25
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2061](https://github.com/chester-hill-solutions/callcaster/issues/2061) Dark mode: a neutral Alert reads as an error because --brand-wash goes dark maroon while --brand-tertiary stays pale
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-25
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2060](https://github.com/chester-hill-solutions/callcaster/issues/2060) bucketFromIdempotencyKey never tests WELCOME_CREDITS_PREFIX, so welcome credits bucket as "other" not "purchase"
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-25
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
