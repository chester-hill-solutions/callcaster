# CallCaster — Open Issue Board for Agents

Reviewed at `dev@f1d19cc3` · 153 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

## How to use this board

1. Pick from **Fix now** first (confirmed, with an exact resolution path).
2. Read the full issue before starting: `gh issue view <number>`.
3. Claim it: `gh issue edit <number> --add-assignee @me`.
4. Branch from `dev` via `gh issue develop --base dev`. Follow branch/PR rules in `AGENTS.md`.
5. Issues marked **Verify and close** need a verification pass, not new code.

Lane assignments, root causes, resolution paths, and test gaps come from the audit in
`scripts/issue-board-enrichment/` — update those files when evidence changes.

---

## Fix now — 0

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

_None._

---

## Verify and close — 27

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#1810](https://github.com/chester-hill-solutions/callcaster/issues/1810) docs(issues): refresh board after verified dev fixes
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-20
- Tracking-only board refresh. Regenerates ISSUE_BOARD.md and prunes/moves enrichment records after verified dev fixes.
- Resolution: This PR is the refresh. Review the generated board and enrichment diff, then close on master promotion.
- Look in: `ISSUE_BOARD.md`, `scripts/issue-board-enrichment/`
- Existing tests: test/issue-board-generator.test.ts; test/issue-board-atomic.test.ts
- Done when: Verified merged work leaves Fix now; closed issues' records pruned; no issue closed early.
- Tracker: Recurring tracking ticket; the active refresh PR owns it. Do not duplicate.

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

### [#1702](https://github.com/chester-hill-solutions/callcaster/issues/1702) IVR Script: Answer label description should be in an on hover tool tip after "Answer Label" not underneath the field
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: @wra-sol · Updated: 2026-09-20
- Recommended title: **verify-close: IVR Answer label help in a tooltip**
- Merged to dev in PR #1946 (8e3c8668): the IVR response Answer label help shows in a hover/focus tooltip beside the label, via a new FormField labelTooltip prop, instead of a paragraph under the field.
- Resolution: Verify on the review environment that the Answer label help appears on hover/focus and no paragraph renders under the field. Close on master promotion.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrResponses.tsx`, `app/components/ui/form-field.tsx`
- Existing tests: test/ui/form-field.test.tsx; test/ui/script-block-editor-ivr.test.tsx
- Done when: Answer label help is a tooltip, not a paragraph under the field
- Tracker: PR #1946 merge 8e3c8668 is on dev, not yet master.

### [#1942](https://github.com/chester-hill-solutions/callcaster/issues/1942) Task: ratchet the base db client in app/lib
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Merged to dev in PR #1944 (dda06a62): the guard also bans @/server/db in app/lib; baseline grew to 81 (50 base, 31 admin).
- Resolution: Verify the guard fails on a new base-db import in app/lib and that ci:local is green. Close on master promotion.
- Look in: `scripts/check-unscoped-db-imports.mjs`, `scripts/baselines/unscoped-db-imports.txt`
- Done when: A new app/lib @/server/db import fails the guard
- Tracker: PR #1944 merge dda06a62 is on dev, not yet master.

### [#1939](https://github.com/chester-hill-solutions/callcaster/issues/1939) Task: ban the unscoped admin client in app/lib
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-20
- Merged to dev in PR #1943 (ec1d8075): scripts/check-unscoped-db-imports.mjs bans @/server/admin-db in app/lib with a ratchet baseline of 31 importers.
- Resolution: Verify the guard fails on a new admin-db import in app/lib and on a stale baseline entry, and that ci:local runs check:unscoped-db-imports. Close on master promotion.
- Look in: `scripts/check-unscoped-db-imports.mjs`, `scripts/baselines/unscoped-db-imports.txt`, `package.json`, `.github/workflows/ci.yml`
- Done when: A new app/lib admin-db import fails the guard; A stale baseline entry fails the guard
- Tracker: PR #1943 merge ec1d8075 is on dev, not yet master.

### [#1940](https://github.com/chester-hill-solutions/callcaster/issues/1940) Task: construct the workspace-scoped tenant client in middleware
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-20
- Merged to dev in PR #1941 (58bea105): workspace and data-plane middleware build the scoped Drizzle client once and expose it as tdb on the context; 14 workspaces+/$id routes read it.
- Resolution: Verify typecheck, test:node, test:ui, and that no createTenantDb remains under app/routes/workspaces+. Close on master promotion.
- Look in: `app/lib/route-context.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/workspace-route.server.ts`
- Existing tests: test/tenant-db.test.ts
- Done when: No createTenantDb under app/routes/workspaces+; tdb built once per workspace request
- Tracker: PR #1941 merge 58bea105 is on dev, not yet master.

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

### [#1148](https://github.com/chester-hill-solutions/callcaster/issues/1148) SMS Onboarding Changes
- Verdict: **Verify and close** · Size: M · Risk: low · Labels: design, ux · Assignee: @wra-sol · Updated: 2026-09-19
- Recommended title: **verify-close: SMS business identity fields on the Identity step**
- Fixed on dev in PR #1903 (3103b835): toll-free and US registration business details are collected on the Identity step after the number path is chosen, not expanded on the Goal step. Changelog records the change.
- Resolution: Verify on the review environment that the Goal step no longer shows the identity fields and that Identity collects them for the SMS paths, with saved data unchanged. Close on master promotion. Do not reimplement tooltip bounds (already shipped in #1608).
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingGoalStep.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingBusinessIdentityStep.tsx`
- Existing tests: test/ui/onboarding-goal-step.test.tsx
- Done when: SMS compliance fields only on Identity; Goal has no duplicate guidance; Saved data unchanged
- Tracker: PR #1903 merge 3103b835 is on dev, not yet master. Closes on master promotion.

### [#1739](https://github.com/chester-hill-solutions/callcaster/issues/1739) Workspace notification emails should mention the workspace name in the email
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-19
- Fixed on dev in PR #1902 (f081cee8): the low-credit notification email names the workspace in its subject and body from the notify context. The open state does not prove the fix is absent.
- Resolution: Verify on the review environment that the low-credit email subject and body name the workspace. Close on master promotion. Do not reimplement the template change.
- Look in: `app/lib/low-credit-notify.server.ts`
- Existing tests: test/low-credit-notify.server.test.ts
- Done when: Low-credit email subject and body name the workspace
- Tracker: PR #1902 merge f081cee8 is on dev, not yet master. Closes on master promotion.

### [#1727](https://github.com/chester-hill-solutions/callcaster/issues/1727) Campaign List should be sorted
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-19
- Fixed on dev in PR #1899 (9a82cbce): the campaigns list sorts by status group then newest first, via app/lib/campaign-list-order.ts. The open state does not prove the fix is absent.
- Resolution: Verify on the review environment that the list orders running, then waiting, then draft, then complete, newest first within each group. Close on master promotion. Do not reimplement the sort.
- Look in: `app/lib/campaign-list-order.ts`
- Existing tests: test/campaign-list-order.test.ts
- Done when: Campaign list orders running, waiting, draft, complete, newest first within each group
- Tracker: PR #1899 merge 9a82cbce is on dev, not yet master. Closes on master promotion.

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

### [#1327](https://github.com/chester-hill-solutions/callcaster/issues/1327) chore(scripts): collapse vestigial pageData.campaignDetails nesting
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-08-27
- Collapse the vestigial pageData.campaignDetails nesting in script editors. Flattened in #1353 (664708c7); Sai reopened requesting manual verification since other closures from the same PR did not hold.
- Current behavior: Script editor routes consume flattened campaign/script fields; no campaignDetails accessor remains. Sai cannot see this on the stale review env.
- Root cause: Internal refactor, invisible without a redeploy.
- Resolution: Verify on dev: rg campaignDetails in app/ has no editor hits, script editor routes render and save (covered by test/ui/script-editor-*.test.tsx), then close.
- Look in: `app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.route.tsx`, `app/routes/workspaces+/$id/scripts/`
- Existing tests: test/ui/script-editor-route.test.tsx; test/ui/script-editor-adapter.test.tsx; test/ui/campaign-script-edit-route.test.tsx
- Done when: No campaignDetails references in editor code on dev; Editor tests green on dev
- Tracker: Verification only; no new code.

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

## Needs reproduction — 13

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

### [#1698](https://github.com/chester-hill-solutions/callcaster/issues/1698) every keypress in the "Answer label" field in the script maker unfocuses the input
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-19
- Focus loss on each keystroke in Answer label is reproduced but root cause unproven; candidates are the option row key with id regeneration on document round-trip (documentToScript) and block onFocusCapture wrappers. Issue explicitly demands a systemic component-level fix, so evidence-first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

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
- **IN PROGRESS** · Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
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

## Needs decision — 32

Product, security, or operations decision required before implementation can be scoped.

### [#1725](https://github.com/chester-hill-solutions/callcaster/issues/1725) should template tags allow for no closing bracket? the preview renderer and the parser seems to think so
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question · Assignee: @wra-sol · Updated: 2026-09-19
- Parser tolerance of missing braces is intentional legacy support (single-brace bodies) — product decides whether to keep it or lint strict double-brace tags.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1705](https://github.com/chester-hill-solutions/callcaster/issues/1705) Primary button hover darkening isn't strong enough. should be a bit darker
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-18
- Default primary hover is hover:bg-primary/90 (shad-cc); the exact darker token/shade is a design-system decision the issue does not specify.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1814](https://github.com/chester-hill-solutions/callcaster/issues/1814) agent is referencing M4A bug on an issue that isn't talking about it and was already marked "tested-on-dev"
- Verdict: **Needs decision** · Size: XS · Risk: low · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-09-18
- Recommended title: **Decide agent verbosity when quoting resolved sibling issues**
- Report: an agent comment on #1325 (M4A upload bug, already verified/closed-tracked) pasted a wra-sol snippet pointing to PR #1731 as if the issue were still open. The M4A bug fix (#1731, merged) is real and verified; the complaint is process/verbosity — referencing a resolved fix on a non-matching context reads as noise.
- Current behavior: Issue comments may restate resolved fixes from sibling issues; #1325's record (verify-close) already points at #1731 and #1730.
- Root cause: None in code — comment placement/copy discipline for agents.
- Resolution: Decide the agent guideline: do not re-post resolution snippets from another issue's thread; prefer a one-line pointer and check whether the issue is already marked tested/on-dev before commenting.
- Done when: Issue comments avoid restating resolved sibling fixes; Agent checks issue state/labels before commenting
- Tracker: Process decision; overlaps #1813 (on-dev marking) and the agent-skills guidance.

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
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-09
- Campaign completes on queue drain (completeCampaignsDrainedByDequeue) while the dial fires async seconds later — behavior confirmed. What 'complete' means for IVR is a product decision that blocks the fix.
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
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-09
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

## Blocked / split first — 14

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

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

## Duplicates — 1

Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.

### [#1720](https://github.com/chester-hill-solutions/callcaster/issues/1720) Contacts that have opted out should be marked as such in the queue instead of completed
- Verdict: **Duplicates** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-09
- Same root cause as 1732: queue_status enum only has queued/dequeued and opted-out entries display as 'completed'. 1732's outreach-status model is the canonical ticket; 1720 is one of its observable symptoms.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

---

## Needs triage — 66

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#1854](https://github.com/chester-hill-solutions/callcaster/issues/1854) Public API: reject simple_ivr / complex_ivr with a steering error (#1741 follow-up)
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1938](https://github.com/chester-hill-solutions/callcaster/issues/1938) Epic: construct the scoped tenant client in middleware and enforce the boundary beyond routes
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1883](https://github.com/chester-hill-solutions/callcaster/issues/1883) IVR step: configurable no-input handling (wait length + reroute/replay)
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1892](https://github.com/chester-hill-solutions/callcaster/issues/1892) DRY pass: de-duplicate the largest copy-paste clones (jscpd)
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1936](https://github.com/chester-hill-solutions/callcaster/issues/1936) Comment policy: comments must carry information (no-useless-comments rule)
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1932](https://github.com/chester-hill-solutions/callcaster/issues/1932) Systemic structural review: PR risk template + coverage gate
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) IVR estimates are too low. projected CPS is too high
- Status: on-dev · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1931](https://github.com/chester-hill-solutions/callcaster/issues/1931) Ratchet the test echo-shape: expectations that reuse SUT exports
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1925](https://github.com/chester-hill-solutions/callcaster/issues/1925) Prune tautological tests (echo tests) with kill-verification
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1924](https://github.com/chester-hill-solutions/callcaster/issues/1924) Effects gate: require @effect-why-not-loader and flag 'none' side-effects
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1910](https://github.com/chester-hill-solutions/callcaster/issues/1910) Issue board: render unenriched issues in a Needs triage lane
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1897](https://github.com/chester-hill-solutions/callcaster/issues/1897) Guardrails: git hooks + PR issue-reference gate
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1919](https://github.com/chester-hill-solutions/callcaster/issues/1919) Hooks: drop global-barrel exports for single-consumer hooks
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1918](https://github.com/chester-hill-solutions/callcaster/issues/1918) Queue item relations: return grouped contact maps
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1917](https://github.com/chester-hill-solutions/callcaster/issues/1917) Public survey guard: type the extra required fields
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1916](https://github.com/chester-hill-solutions/callcaster/issues/1916) Campaign export hook: stop recreating the poll interval every tick
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1915](https://github.com/chester-hill-solutions/callcaster/issues/1915) Admin pagination: consolidate onto the canonical TablePagination
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1914](https://github.com/chester-hill-solutions/callcaster/issues/1914) Survey routes: share the fetcher-redirect and error extraction
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1913](https://github.com/chester-hill-solutions/callcaster/issues/1913) Decompose SurveyForm into page and question subcomponents
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1912](https://github.com/chester-hill-solutions/callcaster/issues/1912) Survey form hook: duplicate page/question ids after a removal
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1911](https://github.com/chester-hill-solutions/callcaster/issues/1911) Survey form hook: collapse the deep-map mutators into index primitives
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-20
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1886](https://github.com/chester-hill-solutions/callcaster/issues/1886) Run db:schema:check per deployed environment (DB-backed gate)
- Status: Backlog · Labels: none · Assignee: @wra-sol · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1885](https://github.com/chester-hill-solutions/callcaster/issues/1885) Rewrite Supabase-auth RPCs, then drop the legacy auth schema
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) Improve IVR speech capture: hints, valid speech model, confidence, intent matching
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1884](https://github.com/chester-hill-solutions/callcaster/issues/1884) IVR editor: expose an explicit Hang up routing target and a guaranteed terminal hangup
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1842](https://github.com/chester-hill-solutions/callcaster/issues/1842) IVR audio takes ~7s to start after answer (synchronous AMD suspected)
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#268](https://github.com/chester-hill-solutions/callcaster/issues/268) i18n: add proper localization with fr-CA as the first locale
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1889](https://github.com/chester-hill-solutions/callcaster/issues/1889) Predictive auto-dial drops a voicemail even when the voicemail drop switch is off
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1869](https://github.com/chester-hill-solutions/callcaster/issues/1869) Test calls must not change the campaign queue
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1894](https://github.com/chester-hill-solutions/callcaster/issues/1894) Pin the test suite to UTC
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1896](https://github.com/chester-hill-solutions/callcaster/issues/1896) Design-system linting: ESLint 9 + @shadcn/lint
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1891](https://github.com/chester-hill-solutions/callcaster/issues/1891) Mobile nav sheet lays its links out horizontally instead of stacking them
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1888](https://github.com/chester-hill-solutions/callcaster/issues/1888) IVR: a machine answer with the voicemail drop off should record No Answer, not Voicemail
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1862](https://github.com/chester-hill-solutions/callcaster/issues/1862) IVR: fuzzy-match spoken / DTMF input to the script's declared options
- Status: Backlog · Labels: enhancement, business-logic · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) gap between pressing an IVR option and it moving on to the next block is very long ~4 seconds
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1843](https://github.com/chester-hill-solutions/callcaster/issues/1843) All steps in a script should have a next or "goto" option even outside of a selected choice and how long it waits
- Status: Backlog · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1853](https://github.com/chester-hill-solutions/callcaster/issues/1853) Dev: workspace invite insert fails (works on prod)
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#780](https://github.com/chester-hill-solutions/callcaster/issues/780) Hang up controls/block in IVR script
- Status: Backlog · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1873](https://github.com/chester-hill-solutions/callcaster/issues/1873) record every call and IVR
- Status: Backlog · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1877](https://github.com/chester-hill-solutions/callcaster/issues/1877) De-duplicate the IVR runtime (machine policy, block runtime, option type, Setup sections)
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1878](https://github.com/chester-hill-solutions/callcaster/issues/1878) Surface the caller audio selection on the /call welcome dialog (on join)
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1845](https://github.com/chester-hill-solutions/callcaster/issues/1845) Live campaign calls keep synchronous AMD latency when voicemail drop is off
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1880](https://github.com/chester-hill-solutions/callcaster/issues/1880) Roadmap: evaluate Jev (TypeSafe) as the IVR speech-intent service
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1833](https://github.com/chester-hill-solutions/callcaster/issues/1833) Primary button hover needs the hover mouse
- Status: Backlog · Labels: design · Assignee: @sai-sy · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1863](https://github.com/chester-hill-solutions/callcaster/issues/1863) Move the remaining dial options (household, dial type) to campaign Setup
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1856](https://github.com/chester-hill-solutions/callcaster/issues/1856) IVR advances when the caller speaks on a keypad-only step
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1864](https://github.com/chester-hill-solutions/callcaster/issues/1864) Review env: IVR still drops voicemail with the drop off (campaign 109)
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1839](https://github.com/chester-hill-solutions/callcaster/issues/1839) Voice campaigns need a voicemail-drop toggle and dedicated voicemail audio on Setup (IVR and live)
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1861](https://github.com/chester-hill-solutions/callcaster/issues/1861) Spike: replace Twilio AMD with a local, faster voicemail classifier
- Status: Backlog · Labels: enhancement, business-logic · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1859](https://github.com/chester-hill-solutions/callcaster/issues/1859) Show campaign costs un-collapsed on the Launch page
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1858](https://github.com/chester-hill-solutions/callcaster/issues/1858) IVR Script Builder Options
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) IVR key press does not interrupt the current audio block (prompt sits outside the Gather)
- Status: tested-on-dev · Labels: none · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1852](https://github.com/chester-hill-solutions/callcaster/issues/1852) cleanup .env
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1840](https://github.com/chester-hill-solutions/callcaster/issues/1840) IVR test call key press speaks the generic error: response route requires an outreach attempt
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1849](https://github.com/chester-hill-solutions/callcaster/issues/1849) what happens when multiple columns map to the same column in call list upload
- Status: Backlog · Labels: question, business-logic · Assignee: @wra-sol · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1848](https://github.com/chester-hill-solutions/callcaster/issues/1848) call list mapping
- Status: Backlog · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1847](https://github.com/chester-hill-solutions/callcaster/issues/1847) Call list mapping should allow you to drop columns if you don't want the clutter instead of just custom fields
- Status: Backlog · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) Phone number verification pending doesn't switch to verified from onboarding steps
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1844](https://github.com/chester-hill-solutions/callcaster/issues/1844) Call History LIsten In feature sends you to twilio
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-09-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#360](https://github.com/chester-hill-solutions/callcaster/issues/360) sign in and signup pages shouldn't be available to people who are already signed in
- Status: No status · Labels: design · Assignee: none · Updated: 2026-09-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1830](https://github.com/chester-hill-solutions/callcaster/issues/1830) Tasks for other devs that are blocking movement on an issue should be new tickets, that are set to "blocking" the other issue and correctly assigned. GH agent skills should reflect
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1824](https://github.com/chester-hill-solutions/callcaster/issues/1824) workspace dropdown sends user to "Something went wrong" page
- Status: tested-on-dev · Labels: business-logic · Assignee: @sai-sy · Updated: 2026-09-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1828](https://github.com/chester-hill-solutions/callcaster/issues/1828) PR open qa tests
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) PR open dev tests
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) Create Twilio CallCaster-qa account (ideally with IaC) and update qa.callcaster.ca to use that account
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1827](https://github.com/chester-hill-solutions/callcaster/issues/1827) Create Twilio CallCaster-dev account (ideally with IaC) and update dev.callcaster.ca to use that account
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-09-16
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
