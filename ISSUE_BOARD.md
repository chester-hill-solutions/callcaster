# CallCaster — Open Issue Board for Agents

Reviewed at `dev@7820d50f` · 174 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

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

## Fix now — 8

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

### [#1728](https://github.com/chester-hill-solutions/callcaster/issues/1728) IVR was marked as complete before the recipient actually received their dial
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
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

### [#1896](https://github.com/chester-hill-solutions/callcaster/issues/1896) Design-system linting: ESLint 9 + @shadcn/lint
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-19
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

## Verify and close — 73

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#1982](https://github.com/chester-hill-solutions/callcaster/issues/1982) Receipts should say contact@callcaster.ca
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **Receipts: support email should be contact@callcaster.ca**
- Receipts currently carry a wrong/absent support contact; use contact@callcaster.ca.
- Current behavior: Receipt builder contact line differs from the canonical support address.
- Resolution: Swap the contact line to contact@callcaster.ca on the receipt.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts contact@callcaster.ca
- Done when: Receipts say contact@callcaster.ca

### [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) Receipts should say how many credits were bought
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-22
- Recommended title: **Receipts: state how many credits were bought**
- Receipt (billing/receipt.route.tsx) should say how many credits the purchase covered, not just the amount.
- Current behavior: Receipt builder shows amount/line items; no credit quantity line.
- Resolution: Add a credit-quantity line to the receipt render (from the ledger row / stripe session metadata). Contact #1982/#1983 for the same receipts surface.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts credit-quantity line
- Done when: Receipt states how many credits were bought

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

### [#1713](https://github.com/chester-hill-solutions/callcaster/issues/1713) Needing a user to have an account before invite makes no sense.
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-21
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

### [#1847](https://github.com/chester-hill-solutions/callcaster/issues/1847) Call list mapping should allow you to drop columns if you don't want the clutter instead of just custom fields
- Verdict: **Verify and close** · Size: S-M · Risk: low · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-21
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

### [#1844](https://github.com/chester-hill-solutions/callcaster/issues/1844) Call History LIsten In feature sends you to twilio
- Verdict: **Verify and close** · Size: S-M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-21
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
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-21
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

### [#1701](https://github.com/chester-hill-solutions/callcaster/issues/1701) IVR Script: Upload Audio button should be closer to the select a recording option since they are options of the same choice: "What audio do you want to use"
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design, ux · Assignee: @wra-sol · Updated: 2026-09-20
- In an IVR step on Play a recording, the Upload audio control now renders with the recording field (before the preview/empty-recording warning). On Speak text it stays visible with its switch hint.
- Resolution: Verify on the review environment that the Upload audio button sits under the recording control in Play a recording mode and is still present in Speak text mode. Close on master promotion.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`
- Existing tests: test/ui/script-block-editor-audio.test.tsx; test/ui/script-block-editor-ivr.test.tsx
- Done when: Upload audio is adjacent to the recording Select on recorded steps; still visible on spoken steps (keeps #1325).
- Tracker: Merged on dev in PR #1951 (fffeae9a); closes on master promotion.

### [#1716](https://github.com/chester-hill-solutions/callcaster/issues/1716) workspace drop down shouldn't move
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-20
- Navbar credit count removed on desktop and mobile so the workspace dropdown no longer shifts; the count stays in the workspace sidebar (WorkspaceNav).
- Resolution: Verify on the review environment that no Credits readout appears in the navbar and the workspace dropdown holds its position; the sidebar still shows credits. Close on master promotion.
- Look in: `app/components/layout/Navbar.tsx`, `app/components/layout/Navbar.MobileMenu.tsx`, `app/components/workspace/WorkspaceNav.tsx`
- Existing tests: test/ui/navbar-credits.test.tsx; test/ui/components-shared-invite-layout.test.tsx
- Done when: No navbar-credits testid and no 'Credits:' link in the nav shell; sidebar credits unchanged.
- Tracker: Merged on dev in PR #1950 (2180c94d); closes on master promotion.

### [#1822](https://github.com/chester-hill-solutions/callcaster/issues/1822) agents are labelling issues "on-dev" instead of setting the project status to on-dev
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-09-20
- issue-on-dev.yml now moves the CHS backlog Status to the project's lowercase on-dev option on every dev merge (no label). The stale 'On dev' default that silently skipped the move is fixed; the vestigial on-dev label is deleted.
- Resolution: Live-verified: merging PR #1949 logged moved=1 and moved #1715 to on-dev with no label applied. Close on master promotion.
- Look in: `.github/workflows/issue-on-dev.yml`, `.agents/skills/project-on-dev-status/SKILL.md`
- Done when: A dev-merge PR moves its referenced issues to the on-dev Status; no on-dev label exists or is applied.
- Tracker: Merged on dev in PR #1952 (0beba212); closes on master promotion.

### [#1696](https://github.com/chester-hill-solutions/callcaster/issues/1696) Audio preview in IVR script shows 0:00 until you hit play
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-20
- Recording metadata preload shipped to dev in PR #1806 (270680d8). A real Chrome check showed a one-second duration before Play, with the audio paused at time zero.
- Current behavior: The IVR recording preview uses preload="metadata".
- Resolution: Retest a selected recording on dev before playback. No further code is expected unless that check finds a gap.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`
- Existing tests: test/ui/script-block-editor-ivr.test.tsx; PR #1806: real Chrome before/after component check
- Done when: A selected recording shows its duration before Play.; Loading metadata does not start playback.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

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

### [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) IVR estimates are too low. projected CPS is too high
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-20
- The IVR completion estimate is now bounded by voiceConcurrentCallLimit / average in-flight call duration and labelled as completion time. Shipped on dev in PR #1934 (e833d955).
- Current behavior: campaign-outbound-estimate.ts computes the effective IVR rate as min(configured dispatcher CPS, voiceConcurrentCallLimit / IVR_AVG_CALL_DURATION_SECONDS) and footnote-annotates the concurrent-call bound.
- Root cause: The projection treated CPS (dial-start rate) as a completion rate while IVR rows are dequeued only at call completion.
- Resolution: No code work left. Verify a 5000-call IVR projection against the concurrency bound on the review env, then close when dev is promoted to master.
- Look in: `app/lib/campaign-outbound-estimate.ts`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`, `app/lib/campaign-ivr-dispatch.server.ts`
- Existing tests: test/campaign-outbound-estimate.test.ts
- Done when: IVR projection accounts for the concurrent-call bound; Projection is labelled as completion time, not dial time
- Tracker: Verify and close. Dev-only (e833d955 not in master); close when dev promotes to master.

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

### [#1764](https://github.com/chester-hill-solutions/callcaster/issues/1764) "Number" onboarding breadcrumbs missing address step
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design, ux · Assignee: @wra-sol · Updated: 2026-09-19
- Fixed on dev in PR #1906 (14d29f1c): the rent path shows Service address as its own breadcrumb step (address, then number search, then review). Changelog records the change.
- Resolution: Verify on the review environment that the address substep gets its own crumb when renting. Close on master promotion.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`
- Existing tests: test/ui/onboarding-first-number-flow.test.tsx
- Done when: Address substep has its own breadcrumb when renting
- Tracker: PR #1906 merge 14d29f1c is on dev, not yet master.

### [#1703](https://github.com/chester-hill-solutions/callcaster/issues/1703) IVR Script: Remove response for IVR script should be a trash can icon in line with the fields on the right
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: @wra-sol · Updated: 2026-09-19
- Fixed on dev in PR #1905 (db176dc8): each IVR response row removes with an inline trash icon beside the fields. Changelog records the change.
- Resolution: Verify on the review environment that the Remove response button is a trash icon in line with the row. Close on master promotion.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrResponses.tsx`
- Existing tests: test/ui/script-block-editor-ivr.test.tsx
- Done when: Response removal is an inline trash icon, not a full-width button
- Tracker: PR #1905 merge db176dc8 is on dev, not yet master.

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

### [#1853](https://github.com/chester-hill-solutions/callcaster/issues/1853) Dev: workspace invite insert fails (works on prod)
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-19
- Root cause confirmed in comments: workspace_invite.user_id had two FKs, one to legacy auth.users (empty on dev), so every invite insert failed. PR #1887 (c80e59ec) drops both legacy constraints in migration 20260919120000_drop_legacy_auth_users_fks.sql, wired into both bootstrap scripts. Merged on dev only.
- Current behavior: On dev the dropped constraints are gone; the public.user FK remains. Master still has the legacy auth.users FKs.
- Root cause: Legacy Supabase auth.users FK on workspace_invite.user_id (and workspace_api_key.created_by).
- Resolution: Invite a user on the review environment and confirm the insert succeeds; then close when the fix is promoted to master. No further code.
- Look in: `client/migrations/20260919120000_drop_legacy_auth_users_fks.sql`, `app/lib/invite-user-by-email.server.ts`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`
- Existing tests: test/accept-invite.route.test.ts; test/bootstrap-migrations.server.test.ts
- Missing tests: schema assertion that no public FK targets auth.users; invite insert succeeds with no legacy FK
- Done when: Inviting a user to a workspace succeeds on dev; Root schema difference identified and reconciled; No public FK to auth.users remains after migrations
- Tracker: Verify on review env. Merged on dev in PR #1887 (c80e59ec); close on master promotion.

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

### [#1849](https://github.com/chester-hill-solutions/callcaster/issues/1849) what happens when multiple columns map to the same column in call list upload
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: question, business-logic · Assignee: @wra-sol · Updated: 2026-09-18
- Working as designed. Duplicate mappings are a blocking validation: validateContactImportMapping flags duplicate-target, AudienceUploadMapStep shows a destructive 'Mapping needs attention' alert, Continue is blocked, and the upload action re-validates server-side. The guard shipped in PR #1063 (7824c824) and is on master.
- Current behavior: Mapping both 'phone' and 'cell phone' to Phone number shows 'Phone number is assigned to more than one CSV column' and prevents continuing. The server rejects the same mapping independently.
- Root cause: Not a defect. The issue is a question about intentional designed behaviour.
- Resolution: Answer the question and confirm the blocking behaviour is intended, then close. If the desired behaviour is to merge two phone columns, that is a new feature.
- Look in: `shared/contact-import-headers.ts`, `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/AudienceUploader.tsx`, `app/routes/api+/audience-upload.action.server.ts`, `app/lib/audience-upload-process.server.ts`
- Existing tests: test/contact-import-headers.test.ts
- Done when: Question answered with the current blocking behaviour; Blocking validation confirmed on master
- Tracker: Answer and close as working-as-designed (validation from PR #1063 is on master). Open a separate feature ticket only if merging multiple phone columns is wanted.

### [#360](https://github.com/chester-hill-solutions/callcaster/issues/360) sign in and signup pages shouldn't be available to people who are already signed in
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-16
- Recommended title: **Verify the signed-in redirect on /signin and /signup and the home CTA**
- The sign-in and sign-up loaders already redirect a signed-in visitor to /workspaces, and the landing page shows 'Go to Workspaces' instead of Sign Up. Both are on master.
- Current behavior: signin.loader.server.ts and signup.loader.server.ts redirect to /workspaces when getSession returns a user. _index renders 'Go to Workspaces' for a signed-in user.
- Root cause: The original gap was closed by the loader redirects plus the signed-in home CTA (release 807cea82, #1838).
- Resolution: Verify on the deployed master environment that a signed-in visit to /signin and /signup redirects to /workspaces and that the home CTAs read 'Go to Workspaces'. No new code expected.
- Look in: `app/routes/signin.loader.server.ts`, `app/routes/signup.loader.server.ts`, `app/routes/_index/index.tsx`, `app/routes/_index/index.loader.server.ts`
- Existing tests: test/ui/index.route.test.tsx; test/signup.route.test.ts; e2e/specs/auth.spec.ts; e2e/specs/signup-flow.spec.ts
- Missing tests: Loader test that /signin and /signup redirect to /workspaces when a session exists
- Done when: Signed-in /signin redirects to /workspaces; Signed-in /signup redirects to /workspaces; The home hero and CTA read 'Go to Workspaces' when signed in
- Tracker: Released to master (807cea82, #1838). Verify, then close; do not reimplement the redirects.

### [#1824](https://github.com/chester-hill-solutions/callcaster/issues/1824) workspace dropdown sends user to "Something went wrong" page
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: business-logic · Assignee: @sai-sy · Updated: 2026-09-16
- Recommended title: **Verify the workspace picker runtime-error fix**
- PR #1825 kept the workspace actions inside the React Aria menu and rendered the pinned All workspaces footer as a plain button, removing the runtime error. The change is on master.
- Current behavior: The workspace picker's All workspaces footer is a plain <button> with id all-workspaces outside the CommandList/menu.
- Root cause: A React Aria CommandItem (All workspaces) was rendered outside its required menu context, causing the runtime error.
- Resolution: Retest on the review environment: open the workspace dropdown, choose a workspace, and choose All workspaces; confirm no error page. Close on master. Do not reimplement.
- Look in: `app/components/layout/Navbar.tsx`
- Existing tests: test/ui/navbar-user-menu.test.tsx; test/ui/navbar-credits.test.tsx
- Missing tests: Workspace-picker regression test (the mocked test was deleted in PR #1825)
- Done when: Opening the workspace dropdown does not throw; Choosing a workspace navigates to it; All workspaces navigates to /workspaces
- Tracker: PR #1825's change is present on master (release trunk 807cea82, #1838); verify and close.

### [#1788](https://github.com/chester-hill-solutions/callcaster/issues/1788) SMS export adds a false skipped row for each sent contact
- Verdict: **Verify and close** · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1798 (a80b3f9c) shipped the filter that removes synthetic SMS skipped rows for sent contacts.
- Current behavior: Successful-send dequeues do not add a second skipped CSV row; genuine suppression reasons remain eligible for skip rows.
- Resolution: Verify delivered and genuine skipped contact rows on a dev export.
- Look in: `app/lib/campaign-export.server.ts`, `app/lib/campaign-queue-db.server.ts`
- Existing tests: test/campaign-export-sms-dequeued.test.ts
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1794](https://github.com/chester-hill-solutions/callcaster/issues/1794) Campaign schedule sync can overwrite a concurrent pause or completion
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1797 (88f73343) made schedule writes conditional on the status read by the sweep. The requested real database interleaving check is still missing.
- Current behavior: A concurrent status change causes the guarded update to return no transition; events follow successful updates only.
- Resolution: Verify pause/completion interleaving against a real database. The existing sweep test mocks the status helper, so it does not prove the SQL concurrency behavior.
- Look in: `app/lib/campaign-schedule-sync.server.ts`, `app/lib/campaign-ivr.server.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts (sweep orchestration with mocked status helper)
- Missing tests: Real database pause/completion after candidate selection; confirm state and emitted events.
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

### [#1338](https://github.com/chester-hill-solutions/callcaster/issues/1338) Call Settings buttons are all over the place needs better alignment and padding
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-11
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
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-11
- Recommended title: **verify-close: call screen shows Hang Up in-call, Dial (with confirm) after**
- Dial control (#1408) flips to Dial and requires a second click after a call ends; Hang Up has its own two-step confirm. CallControls state machine verified by code + call-screen UI tests.
- Current behavior: in-call -> Hang Up (two-step); after end -> armed Dial ('Click again to call back') that disarms on first click.
- Root cause: Errors not reproduced; #1408 implemented the guard.
- Resolution: No new code; run the idle-state eyeball on dev.
- Look in: `app/components/call/CallScreen.CallArea.tsx`
- Existing tests: test/ui/call-screen-callarea.test.tsx
- Done when: active call -> Hang Up; ended call -> Dial with confirm; no hang-up confirm loop
- Tracker: Close after the eyeball.

### [#1664](https://github.com/chester-hill-solutions/callcaster/issues/1664) AI agents interacting with GH should properly mark items as duplicate or not planned
- Verdict: **Verify and close** · Labels: devops/admin · Assignee: none · Updated: 2026-09-08
- The GitHub issue skill distinguishes COMPLETED, NOT_PLANNED and DUPLICATE. API verification on 2026-09-09 still reports #1314 as closed/not_planned.
- Resolution: Verify the canonical duplicate timeline, then correct the closed reason for #1314. Keep the existing closed state and avoid a false completed classification.
- Look in: `.agents/skills/github-issues/SKILL.md`

### [#1333](https://github.com/chester-hill-solutions/callcaster/issues/1333) I don't think it's helpful to obfuscate the unsubscribe and resubscribe SMS message from the CC side
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: none · Updated: 2026-08-26
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

---

## Needs reproduction — 14

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

### [#1698](https://github.com/chester-hill-solutions/callcaster/issues/1698) every keypress in the "Answer label" field in the script maker unfocuses the input
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: @sai-sy · Updated: 2026-09-21
- Focus loss on each keystroke in Answer label is reproduced but root cause unproven; candidates are the option row key with id regeneration on document round-trip (documentToScript) and block onFocusCapture wrappers. Issue explicitly demands a systemic component-level fix, so evidence-first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) gap between pressing an IVR option and it moving on to the next block is very long ~4 seconds
- Verdict: **Needs reproduction** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-19
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

### [#1765](https://github.com/chester-hill-solutions/callcaster/issues/1765) Onboarding steps shouldn't have the credit warning after renting a number
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-11
- The specific 'credit warning after renting' could not be located in the onboarding source; screenshot unverifiable here. Needs the step + exact warning text to pin the component.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1352](https://github.com/chester-hill-solutions/callcaster/issues/1352) Campaign window opens at 3:05 yet the singular contact got the message at 3:15
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- Fix #1374 (nextSendWindowOpenAt exact-boundary scheduling) shipped, but Sai 2026-09-09 gives a 12-step repro: window widened to 12:47 yet the message fired 1:12 — likely a periodic sweep floor or opt-in edge; same subsystem as 1351, verify together on dev.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1351](https://github.com/chester-hill-solutions/callcaster/issues/1351) SMS Window set to 3:05PM yet estimate says 3pm it'll be done
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- Fix #1375 (e49ce7a1, on master) made the launch-page queue ETA window-aware. Sai's 2026-09-09 counter-claim has not been re-verified, and #1816/#1820 (on master) now pulls a parked dispatch successor forward when the window is edited. The 15-min-cron hypothesis is refuted for SMS: the successor is scheduled at the exact nextOpenAt and the worker polls every 5s; SEND_WINDOW_RETRY_MS=15min applies only to voice 'waiting'.
- Current behavior: With an in-window campaign the ETA is now+activeSeconds by design; outside the window it projects to the next open. Editing a window to include now wakes the parked successor. Actual first-send latency vs the ETA has not been measured.
- Root cause: Unproven counter-claim with no timed repro. No 15-min dispatch floor exists on the SMS path.
- Resolution: Reproduce on master/review env: (1) set a narrow future SMS window and note the ETA; (2) widen it to include now; (3) record the ETA and the actual first-send/completion timestamps. If dispatch still lags, instrument the successor's runAt vs actual execution and decide whether the ETA should add a dispatch-startup floor.
- Look in: `app/lib/campaign-outbound-estimate.ts`, `app/lib/campaign-dispatch-policy.ts`, `app/lib/campaign-execution.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`, `app/lib/throughput-config.ts`, `app/lib/worker/poll-jobs.server.ts`
- Existing tests: test/campaign-dispatch-policy.test.ts; test/campaign-outbound-estimate.test.ts
- Missing tests: SMS ETA with a future window starts at/after the window boundary; rescheduleDispatchAfterWindowEdit pulls a parked successor to now when the window is widened; Timed integration: first-send latency within one poll interval of the ETA
- Done when: A 3:05 window shows an ETA at/after 3:05; Widening the window to include now makes both the ETA and actual dispatch start within the poll interval; No unexplained wall-clock drift remains
- Tracker: Needs reproduction. Fix #1375 and #1816/#1820 are on master; re-test the window-expansion scenario before scoping code. Keep paired with #1352.

### [#1719](https://github.com/chester-hill-solutions/callcaster/issues/1719) messages page should fit within VH
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-09-09
- Visual layout complaint that cannot be verified from code; sidebar already uses min-h-0 flex-1 overflow so a screenshot/steps on dev are required to identify the overflow.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1718](https://github.com/chester-hill-solutions/callcaster/issues/1718) contact has opted out messager should be dynamic
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Screenshot only, no repro or expected copy; generic opt-out banner is intentional per #1333 evidence. Needs the specific scenario before coding.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1671](https://github.com/chester-hill-solutions/callcaster/issues/1671) Campaign setup start and end set to 20:00:00 ? but also not adhered to at all
- Verdict: **Needs reproduction** · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-09
- A new report shows campaign date boundaries at 20:00 and says the boundaries are not enforced. This is separate from weekly calling-hours defaults, already shipped in #1590.
- Resolution: Reproduce date-only serialization and display in the campaign timezone, then check dispatch against exact start/end instants before selecting a fix.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`, `app/lib/campaign-schedule-sync.server.ts`

### [#1707](https://github.com/chester-hill-solutions/callcaster/issues/1707) Audo > Add Audio > Upload button doesn't have the on mouse hover
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-09
- The Upload Audio submit is a standard primary Button that has hover:bg-primary/90, so the claimed missing hover cannot be confirmed from code; needs on-dev repro. May share the too-subtle-hover root cause with 1705, which the issue's investigation directive implies.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1670](https://github.com/chester-hill-solutions/callcaster/issues/1670) phone number search is too string
- Verdict: **Needs reproduction** · Labels: ux · Assignee: none · Updated: 2026-09-08
- Searching Pickering does not find South Pickering. PR #1675 changed rate-centre display names; it did not prove search matching.
- Resolution: Compare the submitted locality with provider results and determine whether the provider supports partial matching before changing the search contract.
- Look in: `app/components/phone-numbers/NumberPurchase.tsx`, `app/lib/number-locality.ts`

### [#1666](https://github.com/chester-hill-solutions/callcaster/issues/1666) Audio uploaded shows error toast when it should be a success
- Verdict: **Needs reproduction** · Labels: design · Assignee: none · Updated: 2026-09-08
- A successful audio upload is reported as an error toast.
- Resolution: Capture the action response and redirect flash, then verify the success/error discriminator. Keep independent from toast layout changes.
- Look in: `app/routes/workspaces+/$id/audios/new.action.server.ts`, `app/routes/workspaces+/$id/audios/new.route.tsx`, `app/lib/audio-upload.ts`

### [#1615](https://github.com/chester-hill-solutions/callcaster/issues/1615) shad-cc tsup build is not deterministic, so its vendored dist cannot be drift-checked
- Verdict: **Needs reproduction** · Labels: none · Assignee: none · Updated: 2026-09-07
- PR #1621 added a warn-only shad-cc rebuild check. The latest report found 12 identical builds, but enforcement is still disabled.
- Resolution: Gather clean CI build evidence, then make enforcement its own PR. Do not close based only on the diagnostic PR.
- Look in: `scripts/check-vendor-dist-drift.mjs`

### [#1110](https://github.com/chester-hill-solutions/callcaster/issues/1110) Onboarding Rent A Number Issues
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: needs-repro · Assignee: none · Updated: 2026-08-26
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

---

## Needs decision — 35

Product, security, or operations decision required before implementation can be scoped.

### [#1705](https://github.com/chester-hill-solutions/callcaster/issues/1705) Primary button hover darkening isn't strong enough. should be a bit darker
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-22
- Default primary hover is hover:bg-primary/90 (shad-cc); the exact darker token/shade is a design-system decision the issue does not specify.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1347](https://github.com/chester-hill-solutions/callcaster/issues/1347) need to verify consistency for Robocall vs IVR vs Automated Phone Menu
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-21
- Recommended title: **Robocall vs IVR vs Automated Phone Menu — terminology consistency**
- Consistency audit for customer-facing naming. #1854 (API type robocall) and #1741 (one automated phone menu) set the direction, but UI still mixes terms: 'Robocall' appears in CampaignLaunch.tsx, CampaignLaunchExtras.tsx, CampaignVoiceSettings.tsx, SelectType.tsx, while the product language moved to 'automated phone menu'. Decide the canonical customer term + sweep scope.
- Current behavior: Mixed labels (Robocall/IVR/automated phone menu) across campaign setup surfaces.
- Resolution: Decide the canonical term (suggestion: 'Automated phone menu' in UI; 'robocall' stays the API value), then a copy sweep replacing IVR/Robocall labels.
- Look in: `app/components/campaign/settings/CampaignLaunch.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`, `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`
- Done when: One customer-facing term; API values unaffected

### [#1983](https://github.com/chester-hill-solutions/callcaster/issues/1983) Receipts should have tax (and the charges themselves should be taxed)
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-21
- Recommended title: **Receipts and charges should include tax**
- Product/legal decision: receipts currently show untaxed charges. Adding tax display (and taxing charges) needs a jurisdiction/tax-configuration decision (rates, exemptions, remittance) before implementation.
- Current behavior: Billing shows amounts without tax; receipts have no tax line; ledgers store pretax totals.
- Resolution: Decide: (1) tax on CallCaster charges scope (which products, jurisdictions, rate config), (2) display-only receipts vs taxed ledger amounts. Then implement in the receipt builder + pricing path.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`, `shared/pricing.ts`
- Done when: No implementation until the tax decision is recorded

### [#1725](https://github.com/chester-hill-solutions/callcaster/issues/1725) should template tags allow for no closing bracket? the preview renderer and the parser seems to think so
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question · Assignee: @wra-sol · Updated: 2026-09-19
- Parser tolerance of missing braces is intentional legacy support (single-brace bodies) — product decides whether to keep it or lint strict double-brace tags.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

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

### [#1814](https://github.com/chester-hill-solutions/callcaster/issues/1814) agent is referencing M4A bug on an issue that isn't talking about it and was already marked "tested-on-dev"
- Verdict: **Needs decision** · Size: XS · Risk: low · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-09-18
- Recommended title: **Decide agent verbosity when quoting resolved sibling issues**
- Report: an agent comment on #1325 (M4A upload bug, already verified/closed-tracked) pasted a wra-sol snippet pointing to PR #1731 as if the issue were still open. The M4A bug fix (#1731, merged) is real and verified; the complaint is process/verbosity — referencing a resolved fix on a non-matching context reads as noise.
- Current behavior: Issue comments may restate resolved fixes from sibling issues; #1325's record (verify-close) already points at #1731 and #1730.
- Root cause: None in code — comment placement/copy discipline for agents.
- Resolution: Decide the agent guideline: do not re-post resolution snippets from another issue's thread; prefer a one-line pointer and check whether the issue is already marked tested/on-dev before commenting.
- Done when: Issue comments avoid restating resolved sibling fixes; Agent checks issue state/labels before commenting
- Tracker: Process decision; overlaps #1813 (on-dev marking) and the agent-skills guidance.

### [#1858](https://github.com/chester-hill-solutions/callcaster/issues/1858) IVR Script Builder Options
- Verdict: **Needs decision** · Size: XL · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-18
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

### [#1813](https://github.com/chester-hill-solutions/callcaster/issues/1813) issues should be marked on-dev when commits are merged into dev.
- Verdict: **Needs decision** · Size: XS · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-09-13
- Recommended title: **Finish the on-dev Status config: mint PROJECT_TOKEN**
- Resolved shape per #1822: issue-on-dev.yml now moves the CHS backlog Status via `gh project item-edit` (Status is THE signal; the `on-dev` label was removed). ON_DEV_PROJECT_NUMBER=9 is set as a repo variable. The only missing piece is the fine-grained PROJECT_TOKEN secret (GITHUB_TOKEN cannot write org projects). Until it is set, the workflow logs-and-comments and the project-on-dev-status skill backfills the move.
- Current behavior: issue-on-dev.yml: Status move via gh project item-edit + comment on dev merge; no label. Without PROJECT_TOKEN the move is skipped (logged) and the comment still lands.
- Root cause: None — automation now exists and is Status-first; the token secret is the sole unconfigured input.
- Resolution: Mint a fine-grained PAT with Projects read/write and set it as the PROJECT_TOKEN repo secret (steps in .github/workflows/issue-on-dev.yml header). Until then the project-on-dev-status skill covers merges.
- Look in: `.github/workflows/issue-on-dev.yml`
- Done when: A dev-merge PR auto-moves its referenced issues to the 'On dev' Status; No on-dev label is applied anywhere (Status is the only signal)
- Tracker: Ops/config: only PROJECT_TOKEN remains; overlaps #1697/#1686.

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

### [#1763](https://github.com/chester-hill-solutions/callcaster/issues/1763) "Number" onboarding sub breadcrumbs don't work
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-11
- Verify path never advances past sub-step 2 (caller-ID sets no hasFirstNumber so numberStep stays 'verify' and crumb 3 is unreachable for caller-ID). What progression means on the verify path is a product decision; overlaps #1205 (already Fix now).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

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

### [#1717](https://github.com/chester-hill-solutions/callcaster/issues/1717) Page not found should take you to workspace not home
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- 404 'Go back' is context-free history.back(); issue proposes URL-shape-dependent targets. Behavior policy decision first, then a small change.
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

### [#1700](https://github.com/chester-hill-solutions/callcaster/issues/1700) Why have a distinction between recording step and spoken step if you can also change "Speak text" to "play a recording"
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Proposal to collapse Speak/recording block types into one 'Add block'. The editor already treats them as one block with a playback-mode toggle, so the change is a product/scope decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1699](https://github.com/chester-hill-solutions/callcaster/issues/1699) IVR script refers to the recipient as the "caller" in "caller response"
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Terminology question: in the IVR Gather semantics the interacting party is the 'caller' on the keypad, so 'caller response' is defensible. Product must pick the canonical term and the sweep scope before any rename.
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

### [#1355](https://github.com/chester-hill-solutions/callcaster/issues/1355) Rename the Railway staging environment to "qa" (still tracking master)
- Verdict: **Needs decision** · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-08-31
- The current topology is dev→dev and master→staging/production. The request only renames staging to qa; there is no qa branch.
- Resolution: Verify a safe in-place rename before changing IaC. Do not recreate the environment.
- Look in: `.railway/environments/staging.ts`

### [#1345](https://github.com/chester-hill-solutions/callcaster/issues/1345) Use CHS BN for Toll-Free calls?
- Verdict: **Needs decision** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-26
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
- Verdict: **Needs decision** · Size: L · Risk: high · Labels: ux, needs-repro · Assignee: none · Updated: 2026-08-26
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

## Blocked / split first — 23

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

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

### [#780](https://github.com/chester-hill-solutions/callcaster/issues/780) Hang up controls/block in IVR script
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-19
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

### [#1752](https://github.com/chester-hill-solutions/callcaster/issues/1752) Standardize campaign completion exports (SMS report format)
- Verdict: **Blocked / split first** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-10
- Large multi-part export feature (PDF report with appendices + CSV + run/aggregation + inbound detail) referencing the Lee Fairclough format. Too large for one ticket — split PDF pipeline, CSV, and aggregation layers first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

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

### [#1357](https://github.com/chester-hill-solutions/callcaster/issues/1357) Point qa.callcaster.ca at the staging/qa environment (DNS + IaC)
- Verdict: **Blocked / split first** · Labels: devops/admin · Assignee: none · Updated: 2026-08-31
- The qa custom domain depends on the environment naming decision and DNS access. Staging continues to track master.
- Resolution: Resolve the naming decision, attach the domain through IaC, set DNS, and verify readyz externally.
- Look in: `.railway/environments/staging.ts`
- Blocked by: [#1355](https://github.com/chester-hill-solutions/callcaster/issues/1355)

### [#1356](https://github.com/chester-hill-solutions/callcaster/issues/1356) Point dev.callcaster.ca at the dev environment (DNS + IaC)
- Verdict: **Blocked / split first** · Labels: devops/admin · Assignee: none · Updated: 2026-08-31
- The dev custom domain was attached in Railway; DNS and IaC ownership were still missing at the last verified report.
- Resolution: Inspect current DNS and the Railway target. DNS changes need access to the domain zone, then codify the live mapping.
- Look in: `.railway/environments/dev.ts`

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

## Duplicates — 2

Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.

### [#1843](https://github.com/chester-hill-solutions/callcaster/issues/1843) All steps in a script should have a next or "goto" option even outside of a selected choice and how long it waits
- Verdict: **Duplicates** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-19
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

### [#1720](https://github.com/chester-hill-solutions/callcaster/issues/1720) Contacts that have opted out should be marked as such in the queue instead of completed
- Verdict: **Duplicates** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Same root cause as 1732: queue_status enum only has queued/dequeued and opted-out entries display as 'completed'. 1732's outreach-status model is the canonical ticket; 1720 is one of its observable symptoms.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

---

## Needs triage — 19

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#2019](https://github.com/chester-hill-solutions/callcaster/issues/2019) Task: document corrected project-9 Status flow and repair enrichment lanes
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) sign in page error says "We couldn't sign you in, Try again shortly" when it could/should just bubble up the internal error
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2014](https://github.com/chester-hill-solutions/callcaster/issues/2014) sign in page error should be correctly styled as a snackbar not just inline text
- Status: Backlog · Labels: design · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013) login page and sign up page should be better aligned style wise
- Status: In progress · Labels: design · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2012](https://github.com/chester-hill-solutions/callcaster/issues/2012) sign page doesn't need "Sign Up" and "Create an Account"
- Status: In progress · Labels: design · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2011](https://github.com/chester-hill-solutions/callcaster/issues/2011) Sign up page should have background mural the way sign in page does
- Status: In progress · Labels: design · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2010](https://github.com/chester-hill-solutions/callcaster/issues/2010) sign in and sign up page has a scrollbar even though it fits in VH?
- Status: In progress · Labels: design · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2006](https://github.com/chester-hill-solutions/callcaster/issues/2006) Some bot is moving issues project status from on-qa to "archive"
- Status: In progress · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2008](https://github.com/chester-hill-solutions/callcaster/issues/2008) "Agent" roles need ABAC around top level live call campaign calling, messages, and handset usage
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2009](https://github.com/chester-hill-solutions/callcaster/issues/2009) "Agent" role needs ABAC around what campaigns they can see
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2007](https://github.com/chester-hill-solutions/callcaster/issues/2007) Users with "Agent" role shouldn't be able to see voicemails page
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2005](https://github.com/chester-hill-solutions/callcaster/issues/2005) Quit this workspace button doesn't work. Remove the button entirely it's not needed
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2004](https://github.com/chester-hill-solutions/callcaster/issues/2004) 403 Forbidden checks and UI
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2003](https://github.com/chester-hill-solutions/callcaster/issues/2003) Users with "Agent" role can access pages they aren't meant to
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2002](https://github.com/chester-hill-solutions/callcaster/issues/2002) Attribute Based Access Control
- Status: Backlog · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2001](https://github.com/chester-hill-solutions/callcaster/issues/2001) Phone numbers should be it's own page
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2000](https://github.com/chester-hill-solutions/callcaster/issues/2000) Invitation accepted toast should be green
- Status: Backlog · Labels: design · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1998](https://github.com/chester-hill-solutions/callcaster/issues/1998) Ensure workspace audio and inbound call audio are never mixed
- Status: on-dev · Labels: enhancement · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1996](https://github.com/chester-hill-solutions/callcaster/issues/1996) Daily workspace CSV backups — port gocanvass's backup system
- Status: Backlog · Labels: enhancement · Assignee: none · Updated: 2026-09-22
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
