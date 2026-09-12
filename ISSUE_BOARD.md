# CallCaster — Open Issue Board for Agents

> GitHub Projects status was unavailable during this refresh because the token lacks `read:project`. Issue metadata is current; verdicts use the recorded audit evidence. Prior **IN PROGRESS (unverified)** badges are retained from the previous board. Other issues can also have active work.

Reviewed at `dev@814d804f` · 150 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

## How to use this board

1. Pick from **Fix now** first (confirmed, with an exact resolution path).
2. Read the full issue before starting: `gh issue view <number>`.
3. Claim it: `gh issue edit <number> --add-assignee @me`.
4. Branch from `dev` via `gh issue develop --base dev`. Follow branch/PR rules in `AGENTS.md`.
5. Issues marked **Verify and close** need a verification pass, not new code.

Lane assignments, root causes, resolution paths, and test gaps come from the audit in
`scripts/issue-board-enrichment/` — update those files when evidence changes.

---

## Fix now — 15

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#1148](https://github.com/chester-hill-solutions/callcaster/issues/1148) SMS Onboarding Changes
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-08-07
- Recommended title: **ux(onboarding): move SMS compliance identity fields out of Goal and bound help popovers**
- Tooltip bounds are already implemented, and Goal renders its descriptions without a duplicate InfoPopover. Toll-free business identity fields still render on Goal.
- Current behavior: InfoPopover forwards max-width and max-height settings; OnboardingGoalStep still renders TollFreeVerificationFields after SMS number-path selection.
- Root cause: The remaining issue is placement of SMS identity fields, not the tooltip primitive.
- Resolution: Move SMS business identity fields into the identity step while preserving validation and channel-specific visibility. Do not reimplement tooltip bounds.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingGoalStep.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingBusinessIdentityStep.tsx`, `app/components/shared/InfoPopover.tsx`
- Existing tests: test/ui/onboarding-goal-step.test.tsx (expects toll-free on Goal — must move)
- Missing tests: popover bounds; SMS-only identity fields
- Done when: Goal has short non-duplicated guidance; Help content wraps/scrolls within bounds; SMS compliance fields only for SMS goal; Saved data unchanged
- Tracker: Coordinate with #1345/#1311/#1122.

### [#1809](https://github.com/chester-hill-solutions/callcaster/issues/1809) security(deps): patch qs across runtime dependency paths
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-09-12
- PR #1811 contains the qs override and lockfile remediation and is awaiting review/checks. The two advisory inputs, actual Twilio/Stripe serialization, and full local CI passed; the PR has not merged.
- Resolution: Finish the active qs-only change and full checks. Keep parent SDK versions unchanged; verify default-branch alerts after promotion.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Tracker: Active PR #1811 owns this remediation; do not start a competing lockfile change.

### [#1781](https://github.com/chester-hill-solutions/callcaster/issues/1781) Duplicate script names are allowed: friendly error exists but no DB constraint enforces it
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-12
- Recommended title: **Unique index for script names (duplicate-name error has no DB constraint)**
- No unique index on script(workspace,name) — the friendly duplicate error (campaign.server.ts:556/619) is unenforceable. Add citext/lower unique index + map violations to the friendly message.
- Done when: Implement per ticket
- Tracker: Filed 2026-09-12 from board triage.

### [#1764](https://github.com/chester-hill-solutions/callcaster/issues/1764) "Number" onboarding breadcrumbs missing address step
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-09-11
- Confirmed gap: the rent path has a real address substep but the substep nav collapses address/rent/verify into one crumb. Add an address crumb to the nav state machine.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1739](https://github.com/chester-hill-solutions/callcaster/issues/1739) Workspace notification emails should mention the workspace name in the email
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Well-scoped template change with example copy: inject the workspace name into the low-credit email subject/body (workspace is in the notify context).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1727](https://github.com/chester-hill-solutions/callcaster/issues/1727) Campaign List should be sorted
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Explicit ordering spec (reverse chrono + status grouping running→waiting→draft→complete); campaigns list renders without that ordering. Well-scoped change at the source.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1716](https://github.com/chester-hill-solutions/callcaster/issues/1716) workspace drop down shouldn't move
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Navbar order shifts because NavbarCredits/WorkspacePicker render conditionally; issue specifies the exact desired order. Fix is a stable nav-shell order.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1715](https://github.com/chester-hill-solutions/callcaster/issues/1715) Profile drop down changes
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-09
- Precise change list with an exact target component (profile dropdown): remove padding/info/first-name/workspace settings, rename invitations line + icon.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1704](https://github.com/chester-hill-solutions/callcaster/issues/1704) Shouldn't allow scripts with same name
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Confirmed gap: script table has no unique index on (workspace,name) (schema + migrations), yet campaign.server.ts already maps isUniqueViolation to a friendly 'already exists' error — the guard is unreachable. Add the constraint and surface the existing error.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1703](https://github.com/chester-hill-solutions/callcaster/issues/1703) IVR Script: Remove response for IVR script should be a trash can icon in line with the fields on the right
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-09
- Exact change: replace the full-width 'Remove response' button with an inline trash icon in each response row.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1702](https://github.com/chester-hill-solutions/callcaster/issues/1702) IVR Script: Answer label description should be in an on hover tool tip after "Answer Label" not underneath the field
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-09
- Exact change: convert the Answer label description into a hover tooltip.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1701](https://github.com/chester-hill-solutions/callcaster/issues/1701) IVR Script: Upload Audio button should be closer to the select a recording option since they are options of the same choice: "What audio do you want to use"
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-09-09
- Well-scoped layout change: move the Upload audio button (rendered in IvrStepFields) adjacent to the 'Select a recording' control (RecordingStepFields).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1810](https://github.com/chester-hill-solutions/callcaster/issues/1810) docs(issues): refresh board after verified dev fixes
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-12
- This tracking-only refresh updates stale verdicts from live issue states and merged PR evidence.
- Resolution: Review and merge the active board refresh after full local checks.
- Look in: `ISSUE_BOARD.md`, `scripts/issue-board-enrichment/`
- Tracker: This board-refresh PR owns the ticket; do not duplicate it.

### [#1804](https://github.com/chester-hill-solutions/callcaster/issues/1804) docs(changelog): restore audit fix entries under Unreleased
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-12
- The audit release-note correction is in progress in PR #1808; it was not merged at this review.
- Resolution: Finish the existing PR and verify each audit fix appears once under Unreleased, with the schedule entry restored.
- Look in: `docs/CHANGELOG.md`
- Tracker: Active PR #1808 owns this change; do not create a duplicate.

### [#1783](https://github.com/chester-hill-solutions/callcaster/issues/1783) Dev/theme bootstrap mutates <html> before React hydrates (hydration mismatch, #1750)
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-12
- Recommended title: **Theme bootstrap <html> hydration mismatch**
- root.tsx inline theme script mutates documentElement pre-hydration; React logs mismatch every boot. Use narrow suppressHydrationWarning or server-rendered theme, keep the anti-flash script.
- Done when: Implement per ticket
- Tracker: Filed 2026-09-12 from board triage.

---

## Verify and close — 73

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#1805](https://github.com/chester-hill-solutions/callcaster/issues/1805) security(deps): patch nanoid 3.x lockfile resolutions
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: on-dev · Assignee: @wra-sol · Updated: 2026-09-12
- PR #1807 (814d804f) shipped Nano ID 3.3.19 in both lockfiles. Unaffected 5.1.16 consumers remain unchanged.
- Resolution: Verify default-branch promotion and Dependabot alert #209 after release. No further Nano ID change is expected unless a new affected version is found.
- Look in: `package-lock.json`, `bun.lock`
- Existing tests: PR #1807: both package-manager installs, frozen Bun check, full ci:local
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1696](https://github.com/chester-hill-solutions/callcaster/issues/1696) Audio preview in IVR script shows 0:00 until you hit play
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux, on-dev · Assignee: @wra-sol · Updated: 2026-09-12
- Recording metadata preload shipped to dev in PR #1806 (270680d8). A real Chrome check showed a one-second duration before Play, with the audio paused at time zero.
- Current behavior: The IVR recording preview uses preload="metadata".
- Resolution: Retest a selected recording on dev before playback. No further code is expected unless that check finds a gap.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`
- Existing tests: test/ui/script-block-editor-ivr.test.tsx; PR #1806: real Chrome before/after component check
- Done when: A selected recording shows its duration before Play.; Loading metadata does not start playback.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

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

### [#1726](https://github.com/chester-hill-solutions/callcaster/issues/1726) Contact search: allow creating a new contact from the bottom of the results list
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: on-dev · Assignee: none · Updated: 2026-09-12
- Recommended title: **Contact search creates a missing contact from the results list**
- Merged to dev (#1785); full local e2e gate green (118 passed). Awaiting user/QA retest.
- Current behavior: Bottom Add row creates + queues the contact inline.
- Root cause: Feature gap; implemented.
- Resolution: No further code expected unless retest finds a gap.
- Existing tests: test/ui/contact-search-dialog.test.tsx
- Done when: no-match search offers an Add row; created contact queued in the same dialog
- Tracker: Close once confirmed on dev.

### [#1668](https://github.com/chester-hill-solutions/callcaster/issues/1668) Error toasts should have sensible defaults for spacing. Adding an audio reveals lacking bottom spacing
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design, on-dev · Assignee: none · Updated: 2026-09-11
- Recommended title: **Toast spacing defaults (padding + gap)**
- Merged to dev (#1778); UI tests green; awaiting Sai/user retest on dev.
- Current behavior: Shipped on dev.
- Root cause: Fixed; see the PR.
- Resolution: No further code expected unless retest finds a gap.
- Done when: retest on dev
- Tracker: Close once confirmed on dev.

### [#1667](https://github.com/chester-hill-solutions/callcaster/issues/1667) audio upload toast text should all be inline no? just with a space?
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design, on-dev · Assignee: none · Updated: 2026-09-11
- Recommended title: **Audio upload toast stays one inline line**
- Merged to dev (#1777); UI tests green; awaiting Sai/user retest on dev.
- Current behavior: Shipped on dev.
- Root cause: Fixed; see the PR.
- Resolution: No further code expected unless retest finds a gap.
- Done when: retest on dev
- Tracker: Close once confirmed on dev.

### [#1669](https://github.com/chester-hill-solutions/callcaster/issues/1669) all workspaces option should be sticky to the bottom of the dropdown
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux, on-dev · Assignee: none · Updated: 2026-09-11
- Recommended title: **All workspaces pinned in workspace picker**
- Merged to dev (#1776); UI tests green; awaiting Sai/user retest on dev.
- Current behavior: Shipped on dev.
- Root cause: Fixed; see the PR.
- Resolution: No further code expected unless retest finds a gap.
- Done when: retest on dev
- Tracker: Close once confirmed on dev.

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

### [#1224](https://github.com/chester-hill-solutions/callcaster/issues/1224) Voicemail gets captured but not sent to email address
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-11
- Recommended title: **verify-close: voicemail email sends (presign TTL + auth token)**
- Verified end-to-end on dev: fired a signed RecordingStatusCallback (real Twilio recording, real call) and the route fetched the recording, uploaded to S3, presigned (7-day) and Resend sent the email (message id 6e55aadd...).
- Current behavior: email-vm: fetch recording (API key/auth token), upload, presign 7d, resend.emails.send; recording_url persists only after a successful send.
- Root cause: Original: presign 100d over SigV4 cap (#1223) + stale subaccount auth (#1655).
- Resolution: #1223 presign clamp + API-key-first auth; verified live.
- Look in: `app/routes/api+/email-vm.action.server.ts`, `app/lib/object-storage.server.ts`
- Existing tests: test/ivr-status.route.test.ts (voicemail)
- Done when: Voicemail webhook -> email arrives; recording_url persisted after send
- Tracker: Close as verified; residual eyeball = leave a real voicemail.

### [#1168](https://github.com/chester-hill-solutions/callcaster/issues/1168) Campaign states aren't clear
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux, business-logic · Assignee: @wra-sol · Updated: 2026-09-11
- Recommended title: **verify-close: campaign shows waiting when out of sending hours**
- waiting status + schedule-sweep running<->waiting implemented (#1236). Verified locally: a running voice campaign with no in-window schedule flips running->waiting via campaign_schedule_sync.
- Current behavior: campaign_schedule_sync flips active voice campaigns to waiting outside calling hours; UI shows amber Waiting.
- Root cause: None — behaviour implemented; needed verification.
- Resolution: Confirmed via direct sync run (scanned 3, transitioned 1) + campaign_schedule_sync.server.test.ts.
- Look in: `app/lib/campaign-schedule-sync.server.ts`, `app/lib/campaign-dispatch-policy.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts
- Done when: running->waiting outside window; waiting->running inside window
- Tracker: Close as verified; naming (waiting vs stopped) tracked separately if needed.

### [#1325](https://github.com/chester-hill-solutions/callcaster/issues/1325) How do I add audio to an IVR script
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-11
- Recommended title: **verify-close: add audio to an IVR script (editor upload + M4A playback)**
- Editor UI shipped in #1672; the M4A silent-upload bug fixed in #1731 (transcode from a seekable temp file). Verified on preview and dev: same file went from a 278-byte stub to a 1.6 MB / 200 s playable MP3.
- Current behavior: IVR step editor exposes Speak text / Play a recording + Upload audio; M4A uploads now normalize to playable MP3.
- Root cause: M4A/MOV moov-at-end cannot be read from a non-seekable stdin pipe: ffmpeg emitted a header-only stub and exited 0.
- Resolution: transcodeAudioBuffer stages input to a temp file (mirrors probeAudioDurationMs). Merged via #1731.
- Look in: `app/lib/audio.server.ts`, `app/lib/audio.server.test.ts (moov-at-end regression)`, `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`
- Existing tests: test/audio.server.test.ts
- Done when: Upload non-faststart M4A -> real playable MP3; Regression test proves file input, not pipe:0
- Tracker: Close with #1730 (M4A bug) via #1731.

### [#1769](https://github.com/chester-hill-solutions/callcaster/issues/1769) Upload actions leak raw storage/DB errors — route failures through toUserMessage
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: on-dev · Assignee: none · Updated: 2026-09-11
- Recommended title: **Upload actions route failures through toUserMessage**
- Merged to dev (#1775); unit/UI tests green; full local e2e gate passed for #1665. Awaiting final user/QA retest on dev.
- Current behavior: Shipped on dev.
- Root cause: Fixed; see the PR.
- Resolution: No further code expected unless retest finds a gap.
- Done when: retest on dev
- Tracker: Close once Sai/user confirms on dev.

### [#1665](https://github.com/chester-hill-solutions/callcaster/issues/1665) Adding an audio but not having a file gives the plain red text error when it should use the standardized error style
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design, on-dev · Assignee: none · Updated: 2026-09-11
- Recommended title: **Standardized Alert for a file-less upload error**
- Merged to dev (#1768); unit/UI tests green; full local e2e gate passed for #1665. Awaiting final user/QA retest on dev.
- Current behavior: Shipped on dev.
- Root cause: Fixed; see the PR.
- Resolution: No further code expected unless retest finds a gap.
- Done when: retest on dev
- Tracker: Close once Sai/user confirms on dev.

### [#1740](https://github.com/chester-hill-solutions/callcaster/issues/1740) Number verification: status does not update until refresh; sheet lacks a pending state with the confirmation token
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: on-dev · Assignee: none · Updated: 2026-09-11
- Recommended title: **Live number-verification status + pending sheet with confirmation token**
- Merged to dev (#1767); unit/UI tests green; full local e2e gate passed for #1665. Awaiting final user/QA retest on dev.
- Current behavior: Shipped on dev.
- Root cause: Fixed; see the PR.
- Resolution: No further code expected unless retest finds a gap.
- Done when: retest on dev
- Tracker: Close once Sai/user confirms on dev.

### [#1759](https://github.com/chester-hill-solutions/callcaster/issues/1759) Billing activity: group expansion and entry details break the table layout
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: on-dev · Assignee: none · Updated: 2026-09-11
- Bot comment 2026-09-11: merged in PR #1760 (1d961fed); PR state MERGED (nested sub-table + row disclosure). Retest on review env.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1757](https://github.com/chester-hill-solutions/callcaster/issues/1757) Billing: campaign usage rollup splits across pages — roll up then paginate
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: on-dev · Assignee: none · Updated: 2026-09-11
- Bot comment 2026-09-11: merged in PR #1758 (db7e9b32); PR state MERGED (roll up before pagination). Retest on review env.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1753](https://github.com/chester-hill-solutions/callcaster/issues/1753) Billing: activity screen truncates usage at 500 ledger rows — add pagination and full totals
- **IN PROGRESS (unverified)** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: on-dev · Assignee: none · Updated: 2026-09-10
- Bot comment 2026-09-10: merged in PR #1754 (2de36426); PR state MERGED (pagination + full totals). Retest on review env.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1748](https://github.com/chester-hill-solutions/callcaster/issues/1748) Connect shared form help and errors to their controls by default
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: on-dev · Assignee: none · Updated: 2026-09-09
- Bot comment 2026-09-09: merged in PR #1749 (2febfa74); PR state MERGED. Retest on review env.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1745](https://github.com/chester-hill-solutions/callcaster/issues/1745) Make the onboarding review show actionable setup progress
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: on-dev · Assignee: none · Updated: 2026-09-09
- Bot comment 2026-09-09: merged in PR #1747 (0d4ead79); PR state MERGED. Retest on review env; closes when promoted to master.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1205](https://github.com/chester-hill-solutions/callcaster/issues/1205) "Number" onboarding is confusing
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: ux, on-dev · Assignee: @wra-sol · Updated: 2026-09-09
- Recommended title: **Verify guided phone rental and caller-ID setup on dev**
- Guided rental and caller-ID substeps shipped to dev in PR #1746 (3a37310a). Both paths, address saving, billing return, and saved-number recovery were verified.
- Current behavior: Choose a method first; rental collects a service address before number search; caller-ID verification opens directly. Saved numbers resume at review.
- Root cause: The original single-page flow was replaced in PR #1746.
- Resolution: Retest the shipped flow. The missing address breadcrumb is the separate remaining issue #1764; do not rebuild the substeps.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`, `app/routes/workspaces+/$id/onboarding/wizard-step-resolution.ts`
- Existing tests: test/ui/onboarding-first-number-flow.test.tsx
- Missing tests: Live number purchase and carrier verification were not exercised in PR #1746.
- Done when: Choose method first; Rent requires address before search; Verify bypasses rental; Routing appears only after a number exists
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1682](https://github.com/chester-hill-solutions/callcaster/issues/1682) Campaign URLs with a non-numeric id show "Unexpected Server Error" instead of Page not found
- **IN PROGRESS (unverified)** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-09
- Fixed by PR #1683 (merged 2026-09-08, commit 03923185, same title as the issue); requirePositiveIntegerParam now guards the campaigns loaders so malformed ids 404. Sai's later comment is only a design nit on the 404 page styling, not a defect.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1708](https://github.com/chester-hill-solutions/callcaster/issues/1708) Leave a voicemail?
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-09-09
- Voicemail-drop capability is largely shipped (campaign.voicemail_file, audiodrop route, auto-detection + dispose on VM, 'Voicemail Left' UI). Remaining asks are acceptance-style (play/pause, attach UI, smart drop) — a verification pass on dev, not new architecture.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1334](https://github.com/chester-hill-solutions/callcaster/issues/1334) Results numbers are off?
- Verdict: **Verify and close** · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-09
- Shipped on master in PR #1633: fix(results): separate message totals from contact progress. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay.tsx`, `app/components/campaign/home/CampaignHomeScreen/MessageResultsScreen.tsx`, `app/components/campaign/home/CampaignHomeScreen/ResultsScreen.TotalCalls.tsx`, `app/lib/database/campaign-stats.server.ts`
- Existing tests: test/ui/campaign-result-display.test.tsx
- Tracker: PR #1633 merge 420e49bc is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1486](https://github.com/chester-hill-solutions/callcaster/issues/1486) Add a campaign Kick off action to restart stopped dispatch
- Verdict: **Verify and close** · Labels: none · Assignee: @wra-sol · Updated: 2026-09-09
- Shipped on master in PR #1635: feat(campaign): idempotent Kick off action restarts stopped dispatch. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/campaign/settings/CampaignLaunch.tsx`, `app/components/campaign/settings/CampaignLaunchActions.tsx`, `app/components/campaign/settings/useCampaignSettingsController.ts`, `app/lib/campaign-execution.server.ts`, `app/routes/workspaces+/$id/campaigns/$selected_id/launch.route.tsx`, `app/routes/workspaces+/$id/campaigns/$selected_id/settings.action.server.ts`
- Existing tests: test/campaign-dispatch-worker.test.ts; test/ui/campaign-launch-actions.test.tsx
- Tracker: PR #1635 merge 804b9c73 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1664](https://github.com/chester-hill-solutions/callcaster/issues/1664) AI agents interacting with GH should properly mark items as duplicate or not planned
- Verdict: **Verify and close** · Labels: devops/admin · Assignee: none · Updated: 2026-09-08
- The GitHub issue skill distinguishes COMPLETED, NOT_PLANNED and DUPLICATE. API verification on 2026-09-09 still reports #1314 as closed/not_planned.
- Resolution: Verify the canonical duplicate timeline, then correct the closed reason for #1314. Keep the existing closed state and avoid a false completed classification.
- Look in: `.agents/skills/github-issues/SKILL.md`

### [#1647](https://github.com/chester-hill-solutions/callcaster/issues/1647) Message campaigns: "Send test" to a phone number from the launch page
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-07
- Shipped on master in PR #1648: feat(campaign): send a test message to one number from the launch page. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/campaign/settings/CampaignLaunch.tsx`, `app/components/campaign/settings/CampaignLaunchActions.tsx`, `app/components/campaign/settings/CampaignTestSendDialog.tsx`, `app/components/campaign/settings/MessageSettings.tsx`, `app/components/campaign/settings/useCampaignSettingsController.ts`, `app/lib/campaign-test-send.server.ts`, `app/lib/message-templates.ts`, `app/routes/workspaces+/$id/campaigns/$selected_id/launch.route.tsx`
- Existing tests: test/campaign-settings.route.test.ts; test/campaign-test-send.test.ts; test/ui/campaign-launch-actions.test.tsx; test/ui/campaign-test-send-dialog.test.tsx
- Tracker: PR #1648 merge f1c4509b is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1586](https://github.com/chester-hill-solutions/callcaster/issues/1586) SMS outbox: chat sends should write the intent row before calling Twilio too
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1587: feat(sms): write the intent row before Twilio for chat sends and match from-less intents on to alone. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/message-db.server.ts`, `app/lib/sms-send.server.ts`, `app/lib/twilio-open-sync.server.ts`
- Existing tests: test/chat-sms.route.test.ts; test/helpers/tenant-db-stub.ts; test/sms-send-intent.server.test.ts; test/twilio-open-sync.server.test.ts
- Tracker: PR #1587 merge 9088d9c5 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1582](https://github.com/chester-hill-solutions/callcaster/issues/1582) SMS outbox part 1: write the message intent row before calling Twilio and resolve it by client reference
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1584: feat(sms): write the message intent row before calling Twilio and resolve it by client reference. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/db/schema.ts`, `app/lib/campaign-sms-send.server.ts`, `app/lib/message-db.server.ts`, `app/lib/sms-send.server.ts`, `app/routes/api+/sms/status.action.server.ts`, `client/migrations/20260905120000_message_client_ref.sql`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`
- Existing tests: test/campaign-sms-dispatch-contract.test.ts; test/campaign-sms-send.server.test.ts; test/helpers/tenant-db-stub.ts; test/sms-action.route.test.ts; test/sms-status.route.test.ts; test/sms.route.test.ts
- Tracker: PR #1584 merge 3a507a6f is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1581](https://github.com/chester-hill-solutions/callcaster/issues/1581) Campaign SMS send silently ignores a failed message-row write after Twilio accepted the text
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1583: fix(sms): alert when a sent campaign text's message row cannot be written. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/campaign-sms-send.server.ts`
- Existing tests: test/campaign-sms-send.server.test.ts
- Tracker: PR #1583 merge b5f9d49d is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1578](https://github.com/chester-hill-solutions/callcaster/issues/1578) Design: durable outbox for campaign SMS sends so a Twilio send whose local write fails is never lost or duplicated
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1585: feat(sms): reconcile stale pending message intents in the Twilio open sync. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/twilio-open-sync.server.ts`
- Existing tests: test/twilio-open-sync.server.test.ts
- Tracker: PR #1585 merge 814bfcf1 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1577](https://github.com/chester-hill-solutions/callcaster/issues/1577) A missing export status object returns 500 instead of 404: S3 NoSuchKey is not normalized
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1579: fix(storage): normalize a missing S3 key into ObjectNotFoundError so status polls answer 404. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/object-storage.server.ts`, `app/routes/api+/campaign-export-status.loader.server.ts`
- Existing tests: test/campaign-export-status.test.ts; test/object-storage-not-found.test.ts
- Tracker: PR #1579 merge e5bab511 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1575](https://github.com/chester-hill-solutions/callcaster/issues/1575) Deleting campaign media removes the object even when other campaigns still reference it
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1576: fix(media): delete a campaign media object only when no other campaign references it. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/campaign-ivr.server.ts`, `app/routes/api+/message_media.action.server.ts`
- Existing tests: test/message-media.route.test.ts
- Tracker: PR #1576 merge 843389ea is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1571](https://github.com/chester-hill-solutions/callcaster/issues/1571) Open-sync writes a terminal SMS status before queuing its billing job, so an enqueue failure loses the debit forever
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1574: fix(billing): queue the SMS side-effects job before open-sync writes a terminal status. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/twilio-open-sync.server.ts`
- Existing tests: test/twilio-open-sync.server.test.ts
- Tracker: PR #1574 merge 7a41ff40 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1570](https://github.com/chester-hill-solutions/callcaster/issues/1570) A failed successor enqueue silently ends a self-scheduling job chain until the worker restarts
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1572: fix(worker): re-seed self-scheduling chains on a watchdog and page when a successor enqueue fails. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/worker/ensure-scheduled-jobs.server.ts`, `app/lib/worker/handlers/shared.server.ts`, `worker/index.ts`
- Existing tests: test/ensure-scheduled-jobs.test.ts; test/worker-reschedule.test.ts
- Tracker: PR #1572 merge dedda4c0 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1567](https://github.com/chester-hill-solutions/callcaster/issues/1567) Turn two-factor authentication off for everyone behind a kill switch
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1569: feat(auth): turn two-factor authentication off behind a TWO_FACTOR_ENABLED kill switch. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/env.server.ts`, `app/lib/two-factor.server.ts`, `app/routes/account.loader.server.ts`, `app/routes/account.security.loader.server.ts`, `app/routes/account.security.tsx`, `app/routes/account.tsx`, `app/routes/two-factor.loader.server.ts`, `app/server/auth-instance.ts`
- Existing tests: test/account.route.test.ts; test/auth-instance.server.test.ts; test/setup.node.ts; test/two-factor-kill-switch.route.test.ts; test/two-factor.server.test.ts
- Tracker: PR #1569 merge 27277319 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1564](https://github.com/chester-hill-solutions/callcaster/issues/1564) Account security 2FA verification drops the cookies Better Auth sets
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1573: fix(auth): forward the two-factor cookies Better Auth sets on account security verification. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/routes/account.security.loader.server.ts`
- Existing tests: test/account-security.route.test.ts
- Tracker: PR #1573 merge 5b80a080 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1563](https://github.com/chester-hill-solutions/callcaster/issues/1563) Signing out with a bearer token leaves the session valid
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1566: fix(auth): revoke the bearer session on sign-out, not only the cookie. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/auth.server.ts`, `app/lib/platform-auth.server.ts`
- Existing tests: test/signout.route.test.ts
- Tracker: PR #1566 merge 8e6f7095 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1561](https://github.com/chester-hill-solutions/callcaster/issues/1561) Password reset does not revoke existing sessions
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1565: fix(auth): revoke existing sessions when a password is reset. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/server/auth-instance.ts`
- Existing tests: test/auth-instance.server.test.ts
- Tracker: PR #1565 merge 4ca0ff77 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1560](https://github.com/chester-hill-solutions/callcaster/issues/1560) JSON password-reset endpoint requires a session and drops the reset token
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1568: fix(auth): make the JSON password-reset endpoint public and carry the reset token. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/api-surface-annotations.ts`, `app/lib/api-surface-generated.ts`, `app/lib/platform-auth.server.ts`, `app/lib/schemas/api/platform-auth.ts`, `app/routes/api+/auth/reset-password.action.server.ts`
- Existing tests: test/api-reset-password.route.test.ts
- Tracker: PR #1568 merge 0e8870eb is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1559](https://github.com/chester-hill-solutions/callcaster/issues/1559) Browser password reset reports success on failure and silently trims the password
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1562: fix(auth): surface a rejected password reset and stop trimming the new password. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/routes/reset-password.action.server.ts`
- Existing tests: test/reset-password.route.test.ts
- Tracker: PR #1562 merge dcf6ed12 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1557](https://github.com/chester-hill-solutions/callcaster/issues/1557) Inbound MMS images never render in chat: fetchMessagePage always returns empty signedUrls
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1558: fix(chat): sign inbound MMS attachments so they render in the conversation view. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/chats/fetch-message-page.server.ts`
- Existing tests: test/fetch-message-page.server.test.ts
- Tracker: PR #1558 merge b1bb8967 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1555](https://github.com/chester-hill-solutions/callcaster/issues/1555) Number rental sweep escalates the non-payment ladder on technical failures
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1556: fix(billing): keep number-rental technical failures out of the non-payment ladder. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/number-rental-billing.server.ts`
- Existing tests: test/number-rental-billing.server.test.ts
- Tracker: PR #1556 merge dd17d741 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1553](https://github.com/chester-hill-solutions/callcaster/issues/1553) Destructive e2e scripts accept any DATABASE_URL / S3_ENDPOINT from the environment
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1554: fix(e2e): refuse non-local targets in the compose reset and purge scripts. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `scripts/e2e/bootstrap-compose-db.mjs`, `scripts/e2e/ensure-minio-bucket.mjs`, `scripts/e2e/run-compose-e2e.mjs`, `scripts/lib/local-target-guard.mjs`
- Existing tests: test/local-target-guard.test.ts
- Tracker: PR #1554 merge b46b3ada is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1550](https://github.com/chester-hill-solutions/callcaster/issues/1550) accept-invite account creation bypasses the signup-closed gate
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1552: fix(auth): refuse accept-invite account creation while signup is closed. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/routes/accept-invite.action.server.ts`
- Existing tests: test/accept-invite.route.test.ts
- Tracker: PR #1552 merge eea74189 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1548](https://github.com/chester-hill-solutions/callcaster/issues/1548) Worker job complete/fail/heartbeat are not fenced to the claiming worker
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1551: fix(worker): fence complete, fail, and heartbeat writes to the claiming worker. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/worker/poll-jobs.server.ts`, `worker/index.ts`
- Existing tests: test/worker.test.ts
- Tracker: PR #1551 merge f945c9cc is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1547](https://github.com/chester-hill-solutions/callcaster/issues/1547) Boot migration bootstrap has no ownership lock; concurrent boots can replay the same files
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1549: fix(boot): hold an advisory lock for the whole client-migration bootstrap pass. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/server/bootstrap-migrations.server.ts`, `scripts/lib/app-db-objects.mjs`
- Existing tests: test/bootstrap-migrations.server.test.ts
- Tracker: PR #1549 merge 2b9ec9a0 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1543](https://github.com/chester-hill-solutions/callcaster/issues/1543) Workspace invite accepts an unvalidated role and skips the escalation guard
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1546: fix(members): validate invite roles and enforce the escalation guard on settings invites. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/member-role.ts`, `app/lib/platform-members.server.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts`, `app/routes/workspaces+/$id/settings.action.server.ts`
- Existing tests: test/workspace-members-rbac.test.ts; test/workspace-setting-utils.test.ts; test/workspace-settings-rbac.test.ts
- Tracker: PR #1546 merge a7ee1443 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1542](https://github.com/chester-hill-solutions/callcaster/issues/1542) Tenant db update() lets callers reassign the workspace column at runtime
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1544: fix(tenant-db): strip the tenancy column from update payloads at runtime. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/server/tenant-db.ts`
- Existing tests: test/tenant-db.test.ts
- Tracker: PR #1544 merge 87bc000d is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1541](https://github.com/chester-hill-solutions/callcaster/issues/1541) Contacts API binds new contacts to the body's workspace field, not the authorized workspace
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1545: fix(contacts): bind new contacts to the authorized workspace. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/routes/api+/contacts.action.server.ts`
- Existing tests: test/contacts-action.server.test.ts
- Tracker: PR #1545 merge fc0e1a86 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1536](https://github.com/chester-hill-solutions/callcaster/issues/1536) Add Supabase-exit hardening handoff doc
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1539: docs(handoff): add Supabase-exit hardening handoff for pickup. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Tracker: PR #1539 merge 1c29c191 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1535](https://github.com/chester-hill-solutions/callcaster/issues/1535) Add CI load-reduction, code-quality roadmap, and lint-ratchet rule docs
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1538: docs(roadmap): add CI load-reduction, code-quality, and lint-ratchet plans. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Tracker: PR #1538 merge f975b91a is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1534](https://github.com/chester-hill-solutions/callcaster/issues/1534) Document agent pitfalls in AGENTS.md and ignore local agent state
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1537: chore(eng): document agent pitfalls and ignore local agent state. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Tracker: PR #1537 merge 14791c87 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1533](https://github.com/chester-hill-solutions/callcaster/issues/1533) Double SMS/MMS credit rates (SMS 1→2 per segment, MMS 2→4)
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-05
- Shipped on master in PR #1540: feat(billing): double SMS/MMS credit rates (1→2, 2→4). The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/routes/workspaces+/$id/billing.route.tsx`, `shared/billing-reconciliation.ts`, `shared/campaign-billing.ts`, `shared/pricing.ts`
- Existing tests: test/billing-reconciliation.test.ts; test/campaign-billing.test.ts; test/chats-action.server.test.ts; test/pricing.test.ts; test/ui/ChatInput.test.tsx; test/ui/message-settings.test.tsx; test/ui/pricing-calculator.test.tsx
- Tracker: PR #1540 merge 1e1a7e43 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1472](https://github.com/chester-hill-solutions/callcaster/issues/1472) Add from Audience is silent when it enqueues nothing or the audience is already linked
- Verdict: **Verify and close** · Labels: ux · Assignee: none · Updated: 2026-09-02
- Shipped on master in PR #1489: fix(queue): make Add from Audience report every outcome. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/queue/QueueContent.tsx`, `app/components/queue/QueueHeader.tsx`, `app/components/queue/audience-link-feedback.ts`, `app/hooks/utils/useActionFeedback.ts`, `app/routes/api+/campaign_audience.action.server.ts`, `app/routes/workspaces+/$id/campaigns/$selected_id/queue.route.tsx`
- Existing tests: test/campaign-audience.route.test.ts; test/ui/queue-add-audience-feedback.test.tsx
- Tracker: PR #1489 merge 832958e9 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1474](https://github.com/chester-hill-solutions/callcaster/issues/1474) Twilio voice geo-permissions enable fails with 20001 'unable to parse the updateRequest'
- Verdict: **Verify and close** · Labels: business-logic · Assignee: none · Updated: 2026-09-02
- Shipped on master in PR #1490: fix(twilio): send complete geo permission updates. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/twilio-geo-permissions.server.ts`
- Existing tests: test/twilio-geo-permissions.server.test.ts
- Tracker: PR #1490 merge 5c0d618d is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1476](https://github.com/chester-hill-solutions/callcaster/issues/1476) campaign_status enum lacks 'waiting' in every DB lineage; campaign_schedule_sync dead-letters every minute in prod and dev
- Verdict: **Verify and close** · Labels: database design · Assignee: none · Updated: 2026-09-02
- Shipped on master in PR #1491: fix(db): add 'waiting' to campaign_status enum in every lineage. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `.github/workflows/ci.yml`, `client/migrations/20260901000000_campaign_status_add_waiting.sql`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/db/check-schema-enums.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`, `scripts/lib/schema-enums.mjs`
- Existing tests: test/schema-enum-values.test.ts
- Tracker: PR #1491 merge 76fdff4e is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1327](https://github.com/chester-hill-solutions/callcaster/issues/1327) chore(scripts): collapse vestigial pageData.campaignDetails nesting
- **IN PROGRESS (unverified)** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-08-27
- Collapse the vestigial pageData.campaignDetails nesting in script editors. Flattened in #1353 (664708c7); Sai reopened requesting manual verification since other closures from the same PR did not hold.
- Current behavior: Script editor routes consume flattened campaign/script fields; no campaignDetails accessor remains. Sai cannot see this on the stale review env.
- Root cause: Internal refactor, invisible without a redeploy.
- Resolution: Verify on dev: rg campaignDetails in app/ has no editor hits, script editor routes render and save (covered by test/ui/script-editor-*.test.tsx), then close.
- Look in: `app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.route.tsx`, `app/routes/workspaces+/$id/scripts/`
- Existing tests: test/ui/script-editor-route.test.tsx; test/ui/script-editor-adapter.test.tsx; test/ui/campaign-script-edit-route.test.tsx
- Done when: No campaignDetails references in editor code on dev; Editor tests green on dev
- Tracker: Verification only; no new code.

### [#1113](https://github.com/chester-hill-solutions/callcaster/issues/1113) Onboarding Number | No space between action titles
- **IN PROGRESS (unverified)** · Verdict: **Verify and close** · Labels: design · Assignee: none · Updated: 2026-08-26
- Shipped on master in PR #1592: fix(onboarding): stop the box edge striking through the Number step's action titles. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`
- Existing tests: test/ui/onboarding-first-number-groups.test.tsx
- Tracker: PR #1592 merge 558cb4f1 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1347](https://github.com/chester-hill-solutions/callcaster/issues/1347) need to verify consistency for Robocall vs IVR vs Automated Phone Menu
- Verdict: **Verify and close** · Labels: design · Assignee: none · Updated: 2026-08-26
- Shipped on master in PR #1594: fix(ux): one customer-facing name for the automated phone menu goal. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`, `app/lib/campaign-goals.ts`, `app/lib/messaging-onboarding/goals.ts`, `app/lib/utils.ts`
- Existing tests: test/campaign-terminology.test.ts; test/ui/onboarding-goal-step.test.tsx; test/utils.test.ts
- Tracker: PR #1594 merge 8334dcda is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1204](https://github.com/chester-hill-solutions/callcaster/issues/1204) "Identity" step in onboarding breadcrumbs is always marked as red (unfinished) even once completed
- **IN PROGRESS (unverified)** · Verdict: **Verify and close** · Labels: design · Assignee: none · Updated: 2026-08-26
- Shipped on master in PR #1589: fix(onboarding): judge the Identity step by the fields the Identity screen collects. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/lib/messaging-onboarding/readiness.server.ts`
- Existing tests: test/messaging-onboarding.server.test.ts
- Tracker: PR #1589 merge f39daa3f is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

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

### [#969](https://github.com/chester-hill-solutions/callcaster/issues/969) should be more clear on all time selectors what timezone you're working in
- Verdict: **Verify and close** · Labels: design, ux · Assignee: none · Updated: 2026-08-26
- Shipped on master in PR #1593: feat(ux): disclose the browser time zone on every time control and timestamp. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.Schedule.tsx`, `app/components/sms-ui/ChatInput.tsx`, `app/components/workspace/BillingActivityTable.tsx`, `app/lib/schedule-timezone.ts`
- Existing tests: test/schedule-timezone.test.ts; test/ui/ChatInput.test.tsx; test/ui/billing-activity-table.test.tsx
- Tracker: PR #1593 merge 7c3b66c3 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1067](https://github.com/chester-hill-solutions/callcaster/issues/1067) Same screen mixes 'Call list' and 'Audience' terminology
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-08-26
- Shipped on master in PR #1591: fix(ux): say "Call list" instead of "Audience" on the remaining user-facing surfaces. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/contact/ContactDetails.tsx`, `app/components/queue/QueueHeader.tsx`, `app/components/queue/QueueTable.tsx`, `app/routes/workspaces+/$id/campaigns/$campaign_id/audiences/new.route.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingLaunchStep.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`
- Existing tests: test/ui/components-queue.test.tsx; test/ui/queue-add-audience-feedback.test.tsx
- Tracker: PR #1591 merge eadc67d3 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1152](https://github.com/chester-hill-solutions/callcaster/issues/1152) owners currently need 2fa. why?
- Verdict: **Verify and close** · Labels: ux, needs-repro · Assignee: none · Updated: 2026-08-26
- A global two-factor kill switch shipped in #1569. The earlier statement that owners always require MFA is stale.
- Resolution: Verify the desired deployed kill-switch setting and privileged-role behavior before closure.
- Look in: `app/lib/two-factor.server.ts`

### [#1322](https://github.com/chester-hill-solutions/callcaster/issues/1322) Need invoices in the billing section
- Verdict: **Verify and close** · Labels: business-logic · Assignee: none · Updated: 2026-08-25
- Shipped on master in PR #1596: feat(billing): link each credit purchase to its Stripe-hosted receipt. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/workspace/BillingActivityTable.tsx`, `app/lib/api-surface-annotations.ts`, `app/lib/api-surface-generated.ts`, `app/lib/platform-billing.server.ts`, `app/routes/api+/workspaces+/$workspaceId/billing/receipt.loader.server.ts`, `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`, `app/routes/workspaces+/$id/billing.route.tsx`, `scripts/baselines/route-tree.txt`
- Existing tests: test/billing-receipt.route.test.ts; test/platform-billing-receipt.test.ts; test/ui/billing-activity-table.test.tsx
- Tracker: PR #1596 merge 317dd679 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

### [#1185](https://github.com/chester-hill-solutions/callcaster/issues/1185) Platform side analytics
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: devops/admin · Assignee: none · Updated: 2026-08-07
- Recommended title: **docs: close billing analytics issue and update reconciliation runbook**
- Platform-side billing analytics already exists: billing-reconciliation.server.ts compares billable entities with ledger debits and the admin Twilio portal has a BillingReconciliationPanel with a run action.
- Current behavior: Reconciliation service + admin panel + core/server tests present.
- Root cause: Implemented; open state is bookkeeping.
- Resolution: Close and open a small docs cleanup (docs/production-billing-verification.md still references obsolete pg_cron/Supabase Edge execution).
- Look in: `app/lib/billing-reconciliation.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.BillingReconciliationPanel.tsx`, `docs/production-billing-verification.md`
- Existing tests: test/billing-reconciliation.test.ts; test/billing-reconcile-workspace.server.test.ts
- Missing tests: focused UI test for panel controls
- Done when: Implementation linked in close comment; Runbook names Bun worker, not Supabase Edge
- Tracker: Close; stale enrichment.

### [#1127](https://github.com/chester-hill-solutions/callcaster/issues/1127) Default times should be 9:00 to 21:00 since calling usually happens in the evenings
- Verdict: **Verify and close** · Labels: ux · Assignee: none · Updated: 2026-07-30
- Shipped on master in PR #1590: feat(campaigns): default calling hours to 09:00–21:00 local from one shared constant. The open state does not prove the fix is absent.
- Resolution: Verify the original acceptance criteria on the deployed app. Preserve this issue if user testing finds a residual defect. Do not implement the old fix again.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`, `app/lib/campaign-setup-steps.ts`, `app/lib/schedule-timezone.ts`
- Existing tests: test/campaign-setup-steps.test.ts; test/ui/components-campaign.test.tsx
- Tracker: PR #1590 merge 1879ce60 is an ancestor of master. Close only after remaining verification; this release does not bulk-close shipped items.

---

## Needs reproduction — 15

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

### [#1765](https://github.com/chester-hill-solutions/callcaster/issues/1765) Onboarding steps shouldn't have the credit warning after renting a number
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-11
- The specific 'credit warning after renting' could not be located in the onboarding source; screenshot unverifiable here. Needs the step + exact warning text to pin the component.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1750](https://github.com/chester-hill-solutions/callcaster/issues/1750) Fix the existing sign-in page hydration mismatch
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-09
- Confirmed symptom (React #418 args=[HTML] on every /signin load per the 4-case protocol) but root cause unproven. Fastest check: the pre-hydration theme script mutating <html> vs React 19 singleton hydration (issue itself hints at the theme bootstrap).
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1733](https://github.com/chester-hill-solutions/callcaster/issues/1733) IVR error
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- Generic catch-all IVR error with only a URL — no steps. Known IVR page-id bug #1348 was fixed via #1744; needs repro + logs to tell stale vs new cause.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1352](https://github.com/chester-hill-solutions/callcaster/issues/1352) Campaign window opens at 3:05 yet the singular contact got the message at 3:15
- **IN PROGRESS (unverified)** · Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- Fix #1374 (nextSendWindowOpenAt exact-boundary scheduling) shipped, but Sai 2026-09-09 gives a 12-step repro: window widened to 12:47 yet the message fired 1:12 — likely a periodic sweep floor or opt-in edge; same subsystem as 1351, verify together on dev.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1351](https://github.com/chester-hill-solutions/callcaster/issues/1351) SMS Window set to 3:05PM yet estimate says 3pm it'll be done
- **IN PROGRESS (unverified)** · Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- Fix #1375 (estimateOutboundCompletion, window-aware) shipped to dev, but Sai 2026-09-09 reports the estimate still tracks wall clock and suggests a cron-interval minimum; claim vs counter-claim needs an on-dev check before coding.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

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

### [#1714](https://github.com/chester-hill-solutions/callcaster/issues/1714) Get an error when inviting a user
- **IN PROGRESS (unverified)** · Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-09
- Error matches the 'User not found' path; findUserIdByUsername resolves against the auth users table. The invited account was supposedly created first, so why the miss needs the exact error text and steps; review-env DB resets muddy evidence.
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

### [#1698](https://github.com/chester-hill-solutions/callcaster/issues/1698) every keypress in the "Answer label" field in the script maker unfocuses the input
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-09
- Focus loss on each keystroke in Answer label is reproduced but root cause unproven; candidates are the option row key with id regeneration on document round-trip (documentToScript) and block onFocusCapture wrappers. Issue explicitly demands a systemic component-level fix, so evidence-first.
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

## Needs decision — 30

Product, security, or operations decision required before implementation can be scoped.

### [#1789](https://github.com/chester-hill-solutions/callcaster/issues/1789) Voice campaign exports calculate credits with the retired one-credit-per-minute rate
- Verdict: **Needs decision** · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1798 (a80b3f9c) fixed voice export rate math and zero-duration gating. The issue’s estimate-versus-ledger contract and estimate label remain unresolved.
- Current behavior: The CSV credits_used value is calculated from duration and shared pricing, not read from ledger debits. The column remains named credits_used.
- Root cause: The arithmetic fix does not establish whether the field promises actual debits or an estimate.
- Resolution: Decide the credits_used contract. If it remains an estimate, label it clearly; if actual debits are required, source it from the ledger. Preserve the corrected rates.
- Look in: `app/lib/campaign-export.server.ts`, `shared/pricing.ts`
- Existing tests: test/campaign-export-voice-credits.test.ts
- Missing tests: Acceptance check for the selected actual-versus-estimated contract.
- Done when: Define actual ledger debits versus estimated credits.; Label an estimate clearly, or source actual debits from the ledger.
- Tracker: Keep this contract decision open. Do not repeat the rate calculation fix from PR #1798.

### [#1316](https://github.com/chester-hill-solutions/callcaster/issues/1316) MFA Change Log
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: design, on-dev · Assignee: @wra-sol · Updated: 2026-09-12
- Recommended title: **Decide session behavior after MFA enrollment**
- MFA enrollment UI polish shipped to dev in PR #1780 (cb05869d). That PR explicitly left the issue’s logout-after-save question as a product decision.
- Current behavior: Status badge, Next action, copy success controls, secure-storage prompt, and themed feedback are implemented. Session behavior was not changed.
- Root cause: The remaining question is whether MFA enrollment should retain the current session.
- Resolution: Decide the intended session behavior after MFA enrollment. Retest the shipped controls; do not implement the UI polish again.
- Look in: `app/routes/account.security.tsx`, `app/routes/two-factor.tsx`
- Existing tests: test/ui/account-security.test.tsx; test/two-factor.server.test.ts
- Missing tests: Acceptance check for the chosen enrollment/session behavior.
- Done when: Decide whether enrollment keeps the current session.; Verify the chosen session behavior and the shipped enrollment controls.
- Tracker: Keep open while the session decision remains unresolved; UI-only PR #1780 does not settle it.

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
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-11
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

### [#1741](https://github.com/chester-hill-solutions/callcaster/issues/1741) IVR simple vs complex should be a script-side concern, not a campaign type choice
- Verdict: **Needs decision** · Size: S-M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-09
- Recommended title: **change(ivr): make simple/complex a script property, not a campaign type**
- Campaign setup offers Simple IVR vs Complex IVR, but the runtime treats both identically; complexity belongs to the script (one page vs menus).
- Current behavior: CampaignBasicInfo.SelectType exposes simple_ivr/complex_ivr; dispatch/execution treat them the same.
- Root cause: Design decision.
- Resolution: Decide: single IVR option at campaign setup; campaign_type simple_ivr/complex_ivr kept for existing rows and possibly derived from the script.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`, `app/lib/campaign-execution.server.ts`, `app/db/schema.ts`
- Existing tests: test/ui/campaign-* type selection
- Done when: campaign setup asks IVR once; no behavioural difference to lose
- Tracker: Product decision first; storage/UI change after.

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

### [#1728](https://github.com/chester-hill-solutions/callcaster/issues/1728) IVR was marked as complete before the recipient actually received their dial
- **IN PROGRESS (unverified)** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- Campaign completes on queue drain (completeCampaignsDrainedByDequeue) while the dial fires async seconds later — behavior confirmed. What 'complete' means for IVR is a product decision that blocks the fix.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1722](https://github.com/chester-hill-solutions/callcaster/issues/1722) What does "kick off" on campaign launch pane do
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- 'Kick off' button (running/paused) has no explanation and Sai 2026-09-09 confirms confusion; product decides label/tooltip/placement.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1725](https://github.com/chester-hill-solutions/callcaster/issues/1725) should template tags allow for no closing bracket? the preview renderer and the parser seems to think so
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question · Assignee: @wra-sol · Updated: 2026-09-09
- Parser tolerance of missing braces is intentional legacy support (single-brace bodies) — product decides whether to keep it or lint strict double-brace tags.
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

### [#1713](https://github.com/chester-hill-solutions/callcaster/issues/1713) Needing a user to have an account before invite makes no sense.
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Requiring an existing user before invite is documented current design ('They must sign up before being invited'); email delivery TBD in module comment. Pre-account (email-first) invites are a feature decision plus auth/email work.
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

### [#1705](https://github.com/chester-hill-solutions/callcaster/issues/1705) Primary button hover darkening isn't strong enough. should be a bit darker
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-09
- Default primary hover is hover:bg-primary/90 (shad-cc); the exact darker token/shade is a design-system decision the issue does not specify.
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

### [#1697](https://github.com/chester-hill-solutions/callcaster/issues/1697) Overwrite PR #1686 and add workflow to properly set project status
- **IN PROGRESS (unverified)** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-09
- PR #1686 already merged (2026-09-09) and working (on-dev label + 'On dev: merged in' comments). Remaining is how the project status should be set (needs ON_DEV_PROJECT_NUMBER/PROJECT_TOKEN config) and whether to keep the label behaviour — ops/product decision, not code.
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

## Blocked / split first — 15

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

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

### [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157) Create test audiences for voice, SMS, and AI scenarios
- Verdict: **Blocked / split first** · Size: L-XL · Risk: high · Labels: devops/admin · Assignee: none · Updated: 2026-08-10
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

### [#1192](https://github.com/chester-hill-solutions/callcaster/issues/1192) Add scenario profiles to test-audience uploads
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-08-08
- Recommended title: **feat(test-audiences): select trusted server-owned scenario profiles**
- Test-audience uploads should select server-owned scenario profiles (voice result, callback timing, voicemail greeting, SMS result, optional reply, media fixture) — never accept arbitrary simulation behavior from CSV rows.
- Current behavior: Header mapping supports contact fields only; upload submits file + mapping only; no profile registry.
- Root cause: Blocked by the synthetic provider (#1328).
- Resolution: Add a server-owned profile registry and an audience-level profile reference; reject unknown/unauthorized profiles and CSV behavior fields.
- Look in: `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/AudienceUploader.tsx`, `scripts/e2e/seed-data.mjs`
- Blocked by: [#1328](https://github.com/chester-hill-solutions/callcaster/issues/1328)
- Existing tests: none
- Missing tests: unknown profile rejection; CSV behavior-field rejection; profile-to-provider contract
- Done when: Clients submit only a profile id; Unknown/unauthorized rejected server-side; CSV cannot define outcomes; Profile reaches provider unchanged
- Tracker: Child of #1157; blocked by #1328.

---

## Duplicates — 2

Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.

### [#1720](https://github.com/chester-hill-solutions/callcaster/issues/1720) Contacts that have opted out should be marked as such in the queue instead of completed
- Verdict: **Duplicates** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Same root cause as 1732: queue_status enum only has queued/dequeued and opted-out entries display as 'completed'. 1732's outreach-status model is the canonical ticket; 1720 is one of its observable symptoms.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1193](https://github.com/chester-hill-solutions/callcaster/issues/1193) Test a campaign with controlled recipients
- Verdict: **Duplicates** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-08
- Duplicate of: [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157)
- Recommended title: **test(e2e): run one campaign against a controlled synthetic audience**
- User story for the controlled-recipient campaign test. Near-duplicate of parent epic #1157; implement as the final acceptance journey after #1192/#1328.
- Current behavior: Same gaps as #1157 (generic seed, no scenario selection, no server-side synthetic provider).
- Root cause: Dependent on #1328; redundant with #1157.
- Resolution: Close as duplicate of #1157, or keep as the manual acceptance test for #1157/#1192/#1328.
- Look in: `e2e/fixtures/seed.ts`, `app/components/audience/AudienceUploader.tsx`
- Blocked by: [#1328](https://github.com/chester-hill-solutions/callcaster/issues/1328), [#1192](https://github.com/chester-hill-solutions/callcaster/issues/1192)
- Existing tests: none
- Missing tests: controlled-campaign journey + metric assertions
- Tracker: Close as duplicate of #1157.
