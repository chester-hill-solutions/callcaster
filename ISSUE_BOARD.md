# CallCaster — Open Issue Board for Agents

Reviewed at `dev@959d859b` · 198 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

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

## Fix now — 11

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#100](https://github.com/chester-hill-solutions/callcaster/issues/100) "Theme" value from ThemeProvider is undefined by default
- Verdict: **Fix now** · Labels: none · Assignee: @manstephen · Updated: 2026-10-19
- The theme provider still returns next-themes' raw `theme` string, so `useTheme().theme` is undefined before hydration and equals "system" (not "light"/"dark") under the app's default; only the mode toggle defends against that by falling back to "system", while the react-icons colour sites still branch on the raw `theme` value.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The issue text asks for the "Theme" value to be usable to conditionally render react-icons. The value is still the raw next-themes `theme`: undefined on the server/first render and "system" by default, so `theme === "dark"` in TeamMember.tsx is false for a system-dark user and the icon is painted black on a dark background. The mode toggle was hardened (da1a1f7d) but the shared provider was not given a defined default, and the icons named in the issue were not migrated to `resolvedTheme`. The issue was closed on 2024-08-22 without a matching commit; the only later reference (bot comment pointing at PR #2735 / 20f59d0e) is a CI release-gate change that is not in master and has nothing to do with theming.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/components/shared/theme-provider.tsx`, `app/components/workspace/TeamMember.tsx`, `app/components/shared/mode-toggle.tsx`, `app/root.tsx`
- Existing tests: test/ui/mode-toggle.test.tsx — covers the mode toggle's theme fallback, but no test covers the TeamMember react-icons colour branch, which is the part the issue is about

### [#2686](https://github.com/chester-hill-solutions/callcaster/issues/2686) Research: what common CMS and member platforms expose
- **IN PROGRESS** · Verdict: **Fix now** · Labels: wayfinder:research · Assignee: none · Updated: 2026-10-19
- The deliverable is the findings document, and it is not in master: it exists on origin/research/cms-platform-capabilities (2cca9b5a) and nowhere else. Its Decisions section contradicts a decision that was already closed.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The research was done, but the artifact never landed, and what it says would override two decisions that are already closed. It needs correcting against those resolutions before it lands.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `docs/research/cms-platform-capabilities.md`

### [#2684](https://github.com/chester-hill-solutions/callcaster/issues/2684) Decide the CORS policy for the public API
- **IN PROGRESS** · Verdict: **Fix now** · Labels: wayfinder:grilling · Assignee: @wra-sol · Updated: 2026-10-19
- This change states the existing server-to-server CORS policy in both quickstarts and the public error reference, and replaces the overview's stale Express wording. Review and merge remain.
- Current behavior: Production documentation has the policy only in the overview's final CORS section. The candidate puts the backend requirement before the examples and explains browser preflight failures separately from API HTTP errors.
- Root cause: The earlier closure recorded the policy decision but left its promised quickstart and error-reference guidance unwritten. Only the overview's final CORS section mentioned the constraint, and it still named the retired Express layer.
- Resolution: Review and merge the documentation completion. Keep CORS disabled and retain the decision; no API runtime or schema change is required.
- Look in: `docs/api-overview.md`, `docs/api-agent-quickstart.md`
- Existing tests: Manual documentation check: all six added local links resolve to their target headings; Source review: the Bun server and public API auth add no CORS allow headers; the MDN CORS guide confirms the distinction between a blocked preflight request and a blocked response
- Done when: The overview, quickstarts and error reference state that public integrator calls are server-to-server and workspace API keys stay on the backend; The error reference explains that failed preflight blocks the intended request, while a request without preflight can reach the server but its response remains blocked in browser JavaScript; Same-origin browser session access remains documented and CORS remains disabled
- Tracker: Live inspection on 2026-10-20: Task; Priority, Effort and Enviornment unset; Project Status In progress; assigned to wra-sol. Parent #2677; no children, dependency links or active fixing PR at the start. Keep the issue open until the documentation reaches master.

### [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) Pass the live caller-ID verification status to the onboarding verification sheet
- **IN PROGRESS** · Verdict: **Fix now** · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-20
- PR #2750 refreshes the onboarding loader from workspace_number events, so an open verification sheet changes from pending to success or failure without a reload. Merge and deployed verification remain.
- Current behavior: Source on origin/master passes the verification status into the sheet but does not refresh its loader snapshot on a number event. The candidate adds workspace_number to the existing batched workspace revalidation subscription.
- Root cause: PR #1971 added the sheet status prop, but the workspace revalidation hook listened only for campaign, campaign_queue and transaction_history events. The callback already saves and emits the workspace_number update.
- Resolution: Review and merge PR #2750 into dev. Verify a real caller-ID verification in the deployed onboarding flow before closing.
- Look in: `app/hooks/realtime/useWorkspaceRealtimeRevalidation.ts`, `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/onboarding.loader.server.ts`
- Existing tests: test/ui/workspace-realtime-revalidation.test.tsx: three expected failures on original source; the repaired subscription passes number-event batching plus pending-to-success and pending-to-failure sheet checks through the real Workspace layout, shared subscription and child loader; 37 focused UI cases pass across workspace refresh, onboarding number setup and the shared event connection; Full npm run ci:local passes with VITEST_MAX_WORKERS=2: 5573 Node, 34 Bun and 1483 UI tests, all guards, the production build, bundle check and codegen verification
- Missing tests: A real caller-ID verification call in the deployed onboarding flow remains
- Done when: An open pending verification sheet displays the success or failure returned by the callback without a page reload; Number events use the existing batched refresh scheduler; navigation, event filtering and cleanup controls keep passing; Complete deployed caller-ID verification acceptance before closing
- Tracker: Live inspection on 2026-10-20: Bug; Priority Low; Effort Low; Enviornment dev; Project Status In progress. Assigned to wra-sol; no parent, children or dependency links. PR #2750 is open into dev with a verified Development link; PR #1971 is the earlier incomplete fix. Keep the issue open for release and deployed acceptance.

### [#2507](https://github.com/chester-hill-solutions/callcaster/issues/2507) CSV Upload success should not have a toast (or be a simple success toast that goes away).
- **IN PROGRESS** · Verdict: **Fix now** · Labels: ux · Assignee: @sai-sy, @wra-sol · Updated: 2026-10-19
- PR #2749 removes the persistent CSV upload success toast and keeps the inline completion message and saved report link. Full local CI passes; merge and deployed verification remain.
- Current behavior: The source on origin/master still creates the persistent success toast. The candidate completion hook calls the existing completion callback without creating a toast; the upload panel retains its success message and row report link.
- Root cause: The completion hook created an infinite-duration root success toast with a report download action, duplicating the upload panel's feedback and report action.
- Resolution: Review PR #2749 and its remote checks. Verify the deployed upload completion and saved report access before closing the issue.
- Look in: `app/components/audience/use-audience-upload-progress.ts`, `app/components/audience/AudienceUploadProgressPanel.tsx`
- Existing tests: test/ui/audience-import-report-handoff.test.tsx: embedded completion and standalone inline success/report checks both fail on the original source and pass with the repair.; 32 focused UI cases pass across report handoff, report panel, uploader progress and status polling.
- Missing tests: Deployed CSV upload acceptance and saved row report access remain.
- Done when: CSV upload success does not create a root toast or a toast download prompt.; Inline completion feedback and the saved row report link remain available.; Embedded and standalone completion callbacks still run once.
- Tracker: Live inspection on 2026-10-20: Change Request; Priority Low; Effort nothing-burger; Enviornment prod; Project Status In progress; no parent, children or dependency links. PR #2749 targets dev and has the verified Development link. The old PR #2576 is closed and unmerged. Keep the issue open until the fix reaches production and the reported symptom is verified.

### [#2503](https://github.com/chester-hill-solutions/callcaster/issues/2503) Campaign creation pages don't need headers since they have the breadcrumbs
- **IN PROGRESS** · Verdict: **Fix now** · Labels: design · Assignee: @sai-sy · Updated: 2026-10-19
- Master removes the duplicated section headings on the campaign pages (the 'Setup' heading under the Setup/Content/Queue/Launch tab row, the 'Launch' section header and the 'Call/Message Campaign Results' h1), but the campaign title header and the 'Create campaign' page heading are still rendered.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The two changes that addressed the issue title directly were later undone: 92422d92 (PR #2579) removed the create-page h1 and 709ea3b6 (PR #2602) removed the campaign title header, but #2602 reverted #2579 and cca3f1be (PR #2670) restored the campaign title header. What the issue screenshot shows as the redundant duplicate — the big 'Setup' heading under the Setup/Content/Queue/Launch tabs — is gone in master; the page title header ('Student Send') is not. Because the residue is a visual/layout judgment, a person should look at the campaign pages in a browser to confirm the remaining header is acceptable (docs/release-test-guide-2026-10-15.md:62 still asks for that manual check).
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/components/campaign/settings/CampaignSettings.tsx`, `app/components/campaign/settings/CampaignLaunch.tsx`, `app/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay.tsx`, `selected_id.route.tsx`, `id/campaigns/new.route.tsx`
- Existing tests: test/ui/campaigns-new-caller-gating.test.tsx:37 — `await screen.findByRole("heading", { name: "Create campaign" });` asserts the create-page heading is still present; e2e/specs/errors-empty-states.spec.ts:58-65 — 'The campaign header title is the hub's own heading; the "Call Campaign Results" section heading was removed as a duplicate in #2670.'

### [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) IVR: store speech answers as { value, raw, inputType } (slice B)
- **IN PROGRESS** · Verdict: **Fix now** · Labels: none · Assignee: none · Updated: 2026-10-19
- Slice A and slice B items 4-5 shipped: a vx-any step sends hints with a valid speechModel/speechTimeout pairing, a single-key menu sends numDigits, and every recorded speech answer is stored as `{ value, raw, confidence, inputType }` — but slice B item 6 (normalised intent matching, per-option spoken aliases, a confidence threshold and a re-prompt) is not implemented and is deferred to the #1880 decision.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: Two commits are in origin/master: 642f4ee7 'feat(ivr): improve speech capture with hints, valid model, and numDigits (#1875) (#1876)' (slice A) and 9dcab08b 'feat(ivr): store structured speech answers (#2160)' (slice B items 4-5). The brief's candidate list only names the slice A commit, which by itself would not satisfy the slice B title; the slice B shape landed later under PR #2160 and is what the master tree contains. The remaining slice B item 6 is knowingly deferred: the repo's own triage record for #1880 ('Decide: adopt Jev (TypeSafe) or hand-roll IVR speech intent', scripts/issue-board-enrichment/needs-decision.json:311-328) says its decision 'decides #1862 and the deferred confidence slice of #1875', and the board still lists #1880 in the 'Needs decision' lane. Because the issue's own acceptance criteria (hints + valid model/timeout pairing, numDigits, and a confidence value on each recorded speech answer) are all met but the slice-B scope named in the title is not complete, the verdict is PARTIAL rather than VERIFIED. manual: false — everything that is implemented is machine-checkable.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/lib/ivr-gather.server.ts`, `app/lib/ivr-webhook-auth.server.ts`, `app/lib/ivr-results.ts`
- Existing tests: test/ivr-webhook-auth.server.test.ts — 'captures speech text and a valid Twilio confidence score' (Confidence "0.87" → `answer.confidence === 0.87`), 'keeps confidence null when Twilio sends an invalid or missing value', 'records DTMF as structured input without speech confidence'; test/ivr-results.test.ts — the `IvrRecordedAnswer` aggregation; test/campaign-export-voice-credits.test.ts — the export carries the structured answer and its confidence; test/ivr-gather.test.ts — the gather attributes (hints / speechTimeout / speechModel / numDigits / input). Ran green: test/ivr-webhook-auth.server.test.ts, test/ivr-results.test.ts and test/campaign-export-voice-credits.test.ts all passed.

### [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) Provision a CallCaster-qa Twilio account and point qa.callcaster.ca at it
- **IN PROGRESS** · Verdict: **Fix now** · Labels: devops/admin · Assignee: none · Updated: 2026-10-19
- No dedicated CallCaster-qa Twilio account exists and qa.callcaster.ca is not pointed at one: the QA Railway environment still copies the dev/shared Twilio credentials and there is no Twilio account provisioning in the IaC model or in any script.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The issue has no symptom body — it is an infrastructure provisioning task. The repo's own board records that it 'closed as not planned on 2026-10-17' (ISSUE_BOARD.md:865, scripts/issue-board-enrichment/blocked-epic.json:298), and the related #1828 QA acceptance suite was re-scoped because of it. The DNS/IaC half (#1357) did land (docs/qa-rehearsal-runbook.md, .railway/environments/qa.ts), but the Twilio-account half did not. manual: true because creating a Twilio account and repointing a live domain is a console/ops action a human performs, not something a code change or test can confirm.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `.railway/environments/qa.ts`, `ISSUE_BOARD.md`
- Existing tests: None. There is no test or check that asserts a QA-specific Twilio account; `git grep -n "qa.callcaster.ca" origin/master -- .` returns only .railway/environments/qa.ts and docs/qa-rehearsal-runbook.md.

### [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) Dev-environment PR acceptance suite
- **IN PROGRESS** · Verdict: **Fix now** · Labels: devops/admin · Assignee: none · Updated: 2026-10-19
- Nothing in origin/master provides a dev-environment PR acceptance suite: the only PR-level end-to-end gate is the local docker-compose Playwright run, and the Twilio tier uses Twilio's free test credentials, not a CallCaster-dev account.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: This issue is an acceptance-suite work item, not a code defect, so nothing in the tree can 'fix' it in the usual sense. The upstream dependency is #1827 'Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it', which the board still lists in the 'Blocked / split first' lane (ISSUE_BOARD.md:565-574) with #1356 (dev DNS/IaC) ahead of it. manual: true because the missing artefact is a dev-environment acceptance run that only a person with the dev Twilio account and dev environment credentials can execute.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `test/integration-twilio/twilio-test-credentials.test.ts`
- Existing tests: None. `git ls-tree -r origin/master --name-only | grep -i acceptance` returns nothing, and there is no dev-environment Playwright project (e2e/playwright.config.ts and e2e/playwright.sim.config.ts both target the local compose/sim stack).

### [#1165](https://github.com/chester-hill-solutions/callcaster/issues/1165) Prune stale non-production Twilio resources safely
- **IN PROGRESS** · Verdict: **Fix now** · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-19
- A read-only dry-run Twilio prune report exists in master (scripts/twilio-resource-prune-report.mjs) driven by a shared policy module that classifies every resource as KEEP / STALE / UNKNOWN with an environment check and an owner check, and the only deletion path (scripts/local/prune-environment-twiml-apps.mjs) deletes nothing but closed pull-request preview TwiML Apps, dry-run by default.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: PARTIAL, and manual. The report and both checks are in master, but the goal says "Find and remove stale Twilio resources in development, review, and closed-preview environments" and the removal half is only implemented for closed-preview TwiML Apps: the only `.remove()` call in the repo is in prune-environment-twiml-apps.mjs. There is no delete path for a stale messaging service, incoming phone number, or subaccount, and by design a workspace-owned resource can never be STALE (UNKNOWN), so dev/review-owned resources are never removed automatically — that matches the issue's own "do not remove production resources automatically" but leaves "remove in development and review environments" unbuilt. The report is a script against a live Twilio account with live credentials and a live database, so a human must run it and act on the STALE list to confirm the behaviour; the classification logic itself is machine-checked. Also note the candidate PR commit b4046027 is unrelated to this issue (it is a CI ledger-drift gate) — the real work is the 2026-10-19 release commit 91c4409b, which added the report, the policy module and the shared live-environment list.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `scripts/twilio-resource-prune-report.mjs`, `scripts/lib/twilio-resource-prune-policy.mjs`, `scripts/local/prune-environment-twiml-apps.mjs`, `scripts/lib/live-environments.mjs`
- Existing tests: test/twilio-resource-prune-policy.test.ts — 31 policy cases (environment check, owner check, keep list, assertPrunable guard); no test exercises a real delete (there is no delete path for workspace-owned resources)

### [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) Receipts: state how many credits were bought
- **IN PROGRESS** · Verdict: **Fix now** · Labels: none · Assignee: @sai-sy · Updated: 2026-10-19
- Nothing in origin/master changes the Stripe receipt to say how many credits were bought: the Checkout Session still creates ONE line item with `quantity: 1` and the whole package price in `unit_amount`, with the credit count folded into the product name — so the receipt still reads '500 workspace credits x 1', not 'Workspace credits x 500'.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The claimed fix (070f04f4 'fix(billing): receipts state credit count + contact@callcaster.ca ... (#1997)', PR #1997) IS an ancestor of origin/master (merged by 61594cdf on 2026-09-24) — but it does not implement the requested behaviour, it implements the rejected alternative. What is missing from origin/master: a Checkout Session whose line item is `name: 'Workspace credits'` with `quantity: <credits bought>` and a per-credit `unit_amount`, so the receipt states the count. The fix for that lives only on `origin/change-request/1981-credit-receipt-quantity` (8225f5ce) and has not been promoted. manual: true — the symptom is a real Stripe receipt (or a real credit balance on the account) that a person has to read; the unit test only inspects the request payload.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/lib/platform-billing.server.ts`
- Existing tests: None that proves the receipt text. test/platform-billing-checkout.test.ts asserts the Checkout request SHAPE (`quantity === 1`, name contains the formatted count) rather than the rendered receipt, so it passes while the reported symptom remains. There is no Stripe test-mode session, no receipt assertion and no screenshot of a real receipt in the repo.

---

## Verify and close — 24

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#2519](https://github.com/chester-hill-solutions/callcaster/issues/2519) call settings: call in verification not conigured
- Verdict: **Verify and close** · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- The call-in verification number is now platform data instead of an environment variable: a verification_number table holds the numbers, getActiveVerificationNumber reads the one active row, the Admin System Settings panel registers, activates and removes a number, and the session route answers 503 'Call-in verification is not configured' when no row is active.
- Current behavior: The code is in master. What is left is a person's action on master, so the issue stays open until they finish it and confirm it.
- Root cause: PARTIAL, and manual. What is covered: the number is no longer an invisible, redeploy-only environment variable. It is a database row, it is visible and changeable in Admin, the decision is written in docs/adr/0038, and the route answers a clean 503 instead of failing. What is not covered: the number itself. The issue's screenshot is the Call settings modal showing 'Call-in verification is not configured', and that is exactly what production still shows after this release, because no row is active. The release guide for the same release says so in plain words. The remaining work is an operator action, not a code change: register and activate a number in Admin (or run scripts/configure-verification-number.mjs), then place a real verification call. manual: true because that last step is a real phone call to a real handset. The candidate commit 6c7c361a (PR #2726) is not an ancestor of origin/master by SHA, but its content is in master through the release merge 91c4409b.
- Resolution: No new code. Register and activate the number (or run the operator script), then make the real call and confirm it.
- Look in: `app/lib/verification-number.server.ts`, `/verify-call-in-session.loader.server.ts`, `/route.action.server.ts`, `/panels/AdminSystemSettingsPanel.tsx`, `docs/release-test-guide-2026-10-19.md`
- Existing tests: No automated test for this change. scripts/configure-verification-number.mjs registers and activates a number in one transaction and is the operator path, and docs/release-test-guide-2026-10-19.md:13-21 lists the manual checks.
- Done when: A person confirms the reported symptom is gone on master.

### [#2592](https://github.com/chester-hill-solutions/callcaster/issues/2592) Add IVR end-call options
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- An IVR author can end a call from the script: the step editor offers a Hang up option for the no-input action, the routing target list offers a Hang up special target, the runtime resolves that target to a hangup and emits twiml.hangup(), and the routing validation treats hangup and end as terminal targets instead of dangling ones.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The capability predates the issue: the hangup option landed in 0dc620be (PR #1992) and the terminal-target validation in 1c9d1306 (PR #1991), both before the issue was raised on 2026-10-15. The issue was closed the same day with state_reason duplicate and was then reopened on 2026-10-19. No commit or document mentions #2592 itself, so the verdict rests on the code, not on a linked change. manual: true because 'safe terminal behavior at runtime' means a real call must end cleanly, which only a person on a handset can confirm; the code stops at the TwiML.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `vendor/scriptkit/scriptkit-call-script-react/src/hooks/use-script-editor-state.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-script-validation.ts`, `blockId/response.action.server.ts`
- Existing tests: test/ivr-block-runtime.test.ts:11 — 'hangup ends the call' asserts resolveNoInputTarget({ action: "hangup" }, 3) equals { kind: "hangup" }; vendor/scriptkit/scriptkit-call-script-react/test/script-editor.test.ts:353 — 'routingTargets lists pages, blocks and hangup by label, never raw ids'.
- Done when: A person confirms the reported symptom is gone on master.

### [#2512](https://github.com/chester-hill-solutions/callcaster/issues/2512) SMS Message page is super slow when sending out a campaign
- Verdict: **Verify and close** · Labels: ux, business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- The chats list defaults to the hasReplied filter and renders a virtual row window: the loader and the hook both default the sort to hasReplied, the SQL and the JS filter drop conversations the contact never replied to, ConversationList draws a fixed-height spacer with absolutely positioned rows, and the accumulated pages are cached under a fetcher key built from the campaign, sort and search filters.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Both asks are implemented in master: the list defaults to conversations where the other user replied, and the list is virtualised with a page cache so the page does not freeze as the list grows. manual: true because the reported symptom is perceived slowness under a real campaign load; the virtualisation is structural but no test measures frame cost, so only a person on a large campaign can confirm the page stays responsive.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/hooks/chats/useChatsPage.ts`, `id/chats.loader.server.ts`, `app/lib/database/workspace-conversations.server.ts`, `app/lib/chat-conversation-sort.ts`, `id/chats/ConversationList.tsx`, `app/lib/chats/conversation-utils.ts`
- Existing tests: test/chat-conversation-sort.test.ts:31 — 'filters out unreplied conversations for hasReplied' and the getChatSortOption default cases (lines 189-196); test/ui/use-chats-page-pagination.test.tsx:185 — 'defaults to conversations with a reply' plus the page-cache key cases; test/conversation-utils.test.ts — the phone-key merge cases. Added by 4ea8f3ba (PR #2535).
- Done when: A person confirms the reported symptom is gone on master.

### [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396) Make predictive machine playback and continuation retry-safe
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- Predictive-machine playback is now a durable, leased operation row bound to workspace/call/attempt/campaign/actor/conference, so a signed replay polls the journal instead of issuing a second Play, the continuation job refuses to run until the post-Play acknowledgement commits, and uncertain or rejected outcomes are recorded as a recoverable state with a reconciliation job rather than silently advancing.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Change is commit db0e1686 (PR #2424, 'Make predictive machine recovery retry-safe'), confirmed in origin/master; the mechanism is still present at master head 91c4409b. manual: true because the acceptance criteria end at a real provider call — a person must hear the voicemail and confirm the continuation actually happens; the code and the 85+ real-Postgres cases stop short of that. The issue's own note (migration and registered worker verified on the release candidate, provider acceptance for playback, acknowledgement, callback retries and recovery) is a release-QA step, not a code gap. Durable-object reconciliation and uncertain attachment outcomes for audio uploads remain in their own issues (#2356); this verdict covers the predictive machine only.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/predictive-machine.server.ts`, `app/server/predictive-machine-operation.server.ts`, `app/server/predictive-successor-callback.server.ts`, `app/lib/worker/job-types.server.ts`
- Existing tests: test/integration-db/predictive-machine-operation.test.ts (real Postgres, real TwiML builder, real signature helper, real tenant-scoped claim state) — 'concurrent callbacks emit one Play and no early continuation'; 'sequential redelivery polls without replaying audio'; 'post-Play acknowledgement commits one continuation for concurrent replays'; 'failed audio preparation is recorded and a signed retry can issue once'; 'lost issued response cannot claim voicemail or replay on retry'; 'continuation is refused before the post-Play callback'; 'a waiting callback cannot issue another Play'; 'a foreign signed room cannot acknowledge an issued operation'; 'acknowledgement and disposition roll back when the outbox fails'; 'provider history with the exact post-Play request recovers lost local acknowledgement'; 'a saved successor and journal share a transaction and recovery cannot dial again'; 'unknown successor acknowledgement remains fenced after a process lease expires'. test/integration-db/predictive-machine-continuation.test.ts — the continuation/recovery cases. docs/predictive-machine-recovery.md — the recorded recovery policy.
- Done when: A person confirms the reported symptom is gone on master.

### [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) Prepare a valid A2P Messaging Profile before brand registration
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- Brand registration is now gated on a prepared, submitted A2P Messaging Profile: `prepareA2pMessagingProfile` creates or recovers the `us_a2p_messaging_profile_information` EndUser, assigns it and the Secondary Customer Profile to the Trust Product, evaluates the product (requiring a `compliant` result), submits it, and only then does `provisionA2pRegistration` proceed to brand registration — with any failure thrown and surfaced instead of suppressed.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix landed in PR #2450 (commit d1f5664e), confirmed an ancestor of origin/master. This replaces the old behaviour the issue documented, where `provisionA2pRegistration` created a Trust Product, assigned the Secondary Customer Profile, had no `us_a2p_messaging_profile_information` EndUser, suppressed Trust Product submission failure and continued to brand registration anyway. manual: true — the deliverable is Twilio accepting a real A2P registration, and the tests use a synthetic provider transport (test/fixtures/a2p-profile-provider.ts) rather than the live TrustHub API, so they prove the sequence, the error surfacing and the idempotency but not that Twilio's real evaluation returns `compliant` for a real business. The issue's own note agrees: "Provider transport in tests is synthetic. Actual deployed provider verification, accepted-product repair, Authentication+, historic registration review, release QA and default-branch promotion remain. A prepared profile is not brand or campaign approval." A person still has to run a real registration against Twilio's TrustHub to confirm the profile is accepted. The manual A2P setup path through the canonical compliance jobs is the separate PR #2283.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/twilio-a2p-messaging-profile.server.ts`, `app/lib/twilio-a2p-provision.server.ts`, `app/lib/a2p-messaging-profile.server.ts`
- Existing tests: test/twilio-a2p-provision.server.test.ts — I ran it plus test/a2p-messaging-profile.test.ts and test/twilio-a2p-status-sync.test.ts against origin/master: 113 tests passed, 3 files green. The cases that carry the mechanism: "public company sends stock and representative email on EndUser, not BrandRegistration"; "submission failure retains IDs and assignment evidence for a single-resource retry"; "existing approved profile with complete actual attributes can be read without inventing local company data"; "incomplete legacy public profile is repaired before brand reuse without duplicate EndUser"; "unrecorded owned provider product and EndUser are recovered instead of duplicated"; "a preparation failure during polling is retained by the fresh-row status update"; "a concurrent business change prevents old preparation from marking the new inputs ready"; "all assignment pages are read before deciding to create a duplicate". test/integration-db/a2p-messaging-profile.test.ts — 13 real-Postgres storage and callback cases, which I also ran green against a live Postgres 18.
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

### [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) Instrument and attribute the ~4s IVR option-press to next-block gap
- Verdict: **Verify and close** · Labels: ux · Assignee: @sai-sy · Updated: 2026-10-19
- The IVR now carries a transition timestamp across the gather response so every next-block and next-page request logs how long it took to get from 'the key press was ready' to 'the next block was received', which is the measurement needed to attribute the reported ~4s option-press-to-next-block gap.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix commit c8b3dafd 'Instrument IVR gather-to-next-block timing (#2540)' — confirmed an ancestor of origin/master; the same content is on origin/bug/1857-ivr-gap. docs/CHANGELOG.md:66 records it: 'IVR responses now record response handling, response-to-next-block delay, and block rendering time without logging caller input'. manual: true because the issue's second half — attributing the reported ~4s gap to a cause — is a reading of real production timing logs from actual calls, and the repo's own acceptance step says so: docs/release-test-guide-2026-10-13.md:34 'use IVR timing logs to locate the reported delay'. The code half (the instrumentation) is complete and tested; no root-cause write-up for the 4s exists in the repo (no ADR under docs/adr/ covers it), so the attribution itself still has to be done by a person against live logs.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/ivr-transition-timing.server.ts`, `blockId/response.action.server.ts`, `blockId.action.server.ts`, `app/lib/campaign-ivr-page.server.ts`
- Existing tests: test/ivr-transition-timing.test.ts — 'carries the source block and ready time to the next Twilio request' asserts the exact URL and the computed `responseToNextBlockMs: 75`; 'ignores missing, invalid, and future response timestamps' pins the guard. Ran green: `DATABASE_URL=... npx vitest run test/ivr-transition-timing.test.ts` → passed.
- Done when: A person confirms the reported symptom is gone on master.

### [#1856](https://github.com/chester-hill-solutions/callcaster/issues/1856) IVR advances when the caller speaks on a keypad-only step
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- The `<Gather>` now requests speech only when the step actually maps a spoken answer (a `vx-any` option); a keypad-only menu sends `input="dtmf"`, so Twilio never collects speech there and speaking can no longer fall through to the linear next block.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: Fix commit 725d77df 'fix(ivr): gather DTMF only on keypad-only steps (#1856) (#1872)' — confirmed an ancestor of origin/master. Note the ordering: this fix depends on #1841 (51240b0b) making the prompt nested inside the Gather, which is why the symptom became visible. manual: true because the acceptance criterion is phrased as a caller's experience ('Speaking at a DTMF menu does not advance the call') on a live phone line; the TwiML is provably DTMF-only, but a person still has to speak at a keypad menu on a real call to close it out.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/ivr-gather.server.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-option-value.ts`
- Existing tests: test/ivr-block.route.test.ts — 'gathers speech only when the step maps a spoken answer (#1856)' and the nested-Gather assertion `input="dtmf" numDigits="1"`; test/ivr-gather.test.ts covers `ivrGatherAttributes`/`ivrStepGathersSpeech` directly. Ran green: test/ivr-block.route.test.ts and test/ivr-block-response.route.test.ts passed in the earlier run (9 files / 90 tests).
- Done when: A person confirms the reported symptom is gone on master.

### [#2524](https://github.com/chester-hill-solutions/callcaster/issues/2524) Leaving the calling interface crashes the browser
- Verdict: **Verify and close** · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- Leaving the call screen now releases the microphone: the hook stops every track of the MediaStream it owns when the stream is replaced or the hook unmounts, discards a getUserMedia result that resolves after unmount, and the leave handler awaits the hang-up before navigating, so the browser is no longer left holding a live capture and audio pipeline after the campaign is left.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The fix is commit 3a139405 'Fix microphone track cleanup when leaving call screen (#2526)' (inner commit: 'Fix microphone track cleanup when leaving call screen (#2524)'), an ancestor of origin/master (first merged by f896b451 on 2026-10-13). manual: true — the symptom is a real browser CPU/RAM spike on a specific browser/OS combination (Helium on Windows 11) and a perceived crash. The code removes the leaked capture and the premature unmount, but only a person on that machine, watching task manager while leaving a dial session, can confirm the spike is gone.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/hooks/call/useCallAudioControls.ts`, `app/components/call/CallScreen.Layout.tsx`, `app/hooks/call/useTwilioConnection.ts`
- Existing tests: test/ui/audio-device-lifecycle.test.tsx — 'releases SDK microphone capture that resolves after unmount' (per exit mode: unmount, replacement, normal completion) asserts `stopMicrophoneTrack` is called for the owned stream; test/ui/call-screen-leave.test.tsx — 'live Leave waits for hangup before navigation and leaves device teardown to its hook' asserts `hangUp` is called once, `navigate(-1)` happens only after the hang-up promise resolves, and `device.destroy` is NOT called by the leave handler; plus the predictive/power-dial leave cases. These UI tests could NOT be executed in this checkout: every UI test fails with 'Cannot read properties of null (reading useContext)' raised from the vendored shad-cc copy of next-themes/react, and an unrelated control test (test/ui/debounce-owner-unmount.test.tsx) fails identically — a local node_modules artifact, not a code defect. Both files are part of CI.
- Done when: A person confirms the reported symptom is gone on master.

### [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) Restore the password recovery email journey
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-10-19
- The password recovery journey is wired end to end again: the request is pinned to the configured BASE_URL with /reset-password as the callback, Better Auth emails a link that keeps its token, the reset page reads that token and posts it to the reset action, and the action hands it to the installed Better Auth `resetPassword` implementation; the success copy now describes a password change, and both verification-callback failure paths land on a real route without a token.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The fix is commit 9aa2025e 'Restore the password recovery email journey (#2279)', an ancestor of origin/master (first merged by release 268c2692 on 2026-10-08), with two later touches in master: cb88df8b 'Show reset-password action failures once (#2310)' and ca652b9e 'fix: return to sign in after password reset (#2606)'. IMPORTANT — the operator's 2026-10-17 comment ('I get "This reset link is invalid or has expired. Request a new one from the sign-in page." when attempting to reset password') was NOT a broken journey: the deployed dev log for that minute shows exactly one entry, `reset-password: reset rejected` with `error: "Password too short"` (Railway dev env 18ef9173-4b33-4a62-9b94-9dfc7a36eb05, service CallCaster, 2026-10-17T09:58:21Z). That error is raised by Better Auth AFTER the token was accepted, so the emailed link did reach the reset form with a valid token; the submitted new password was simply shorter than Better Auth's minimum (8 characters, node_modules/better-auth/dist/context/create-context.mjs:185). One residual defect is worth a follow-up ticket but is outside this issue's acceptance criteria: the reset form has no `minLength={8}` on its password inputs (app/routes/reset-password.tsx:35-46), unlike sign-up (app/routes/signup.tsx:121), and the too-short error is reported through the generic catch in app/routes/reset-password.action.server.ts:58-70 with the misleading 'This reset link is invalid or has expired' text. manual: true — the final proof is a real reset email landing in a real inbox, a real link, a real password change and a real sign-in with the new password.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/routes/remember.action.server.ts`, `app/routes/reset-password.loader.server.ts`, `app/routes/reset-password.action.server.ts`, `app/routes/reset-password.tsx`, `/auth/callback.loader.server.ts`, `app/routes/remember.tsx`
- Existing tests: test/password-recovery-journey.test.ts — walks the ACTUAL issued email through the installed Better Auth (memory adapter): it reads the reset link out of the sent mail, drives the real `api+/auth/$.loader.server` callback (expects 302 to /reset-password?token=<issued token>), loads the reset page (expects `{ token }`), submits the new password, asserts the password changed (the old password no longer signs in, the new one does) and that the link cannot be replayed (the second submit returns 400). It also covers identical generic feedback for known and unknown emails, the caller-selected-host resistance, the expired-link path, and the request rate limit. Ran green on this tree: `npx vitest run -c vitest.node.config.ts test/password-recovery-journey.test.ts ...` -> 4 files passed, 34 tests passed. test/ui/reset-password-feedback.test.tsx and e2e/specs/password-reset-feedback.spec.ts cover the failure feedback (one toast, retained fields, no layout shift) but the UI suite could not be executed in this checkout (every UI test fails with 'Cannot read properties of null (reading useContext)' from the vendored shad-cc copy of next-themes/react; an unrelated control test fails identically — a local install artifact, not a code defect).
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

### [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) IVR estimates are too low. projected CPS is too high
- Verdict: **Verify and close** · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- The IVR launch estimate no longer projects the queue at the dial-start rate: it now computes a completion rate bounded by the concurrent-call limit over the average in-flight call time and uses THAT for the ETA, so a campaign that cannot finish in the promised time says so before it starts.
- Current behavior: The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it.
- Root cause: The fix is commit e833d955 'fix(ivr): bound the completion estimate by the concurrent call limit (#1874) (#1934)', an ancestor of origin/master (first merged by e3a1f002 on 2026-09-21). It matches the issue's own diagnosis comment (wra-sol, 2026-09-20) proposal-for-exactly, including the ~75s default and the concurrent-call bound, and the reporter's worked example (5000 calls, 25 concurrent, ~90s in flight -> ~5 hours) is now the shape the estimate produces. manual: true — the protocol names this case explicitly ('a number a human reads and judges: IVR estimates are too low'); the unit test proves the arithmetic, not that 75s is the right in-flight constant for the operator's actual calls (ring time, answer rate and voicemail differ per campaign), so a person has to judge whether the new number is believable against a real run.
- Resolution: Run the verification on master, then close. No new code unless it fails.
- Look in: `app/lib/campaign-outbound-estimate.ts`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`
- Existing tests: test/campaign-outbound-estimate.test.ts:93-131 — 'IVR completion rate is bounded by the concurrent call limit over avg call time (#1874)' (100 concurrent -> `effectiveCompletionPerSecond` = 100/75 and < the dial-start rate, `avgCallDurationSeconds` = 75, warning contains 'bound by the concurrent call limit'), 'IVR completion rate equals the dial-start rate when concurrency is not the bound' (10,000 concurrent) and 'a low concurrent call limit caps completion well below the dial-start rate' (10 concurrent -> 10/75). Ran green on this tree: `npx vitest run -c vitest.node.config.ts test/campaign-outbound-estimate.test.ts ...` -> 4 files passed, 34 tests passed.
- Done when: A person confirms the reported symptom is gone on master.

### [#1956](https://github.com/chester-hill-solutions/callcaster/issues/1956) Release PRs must close the issues they promote (Closes #N)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-19
- The gate shipped in PR #1960 was incomplete. It accepted a release body of `Closes #1, #2, #3` because its regex treated the comma list as a group of closing references. GitHub closes ONE issue per closing keyword, so only #1 closed. Release PR #2668 listed 17 issues that way and closed one: #2655 closed at the merge timestamp, #2663 and #2504 were closed by hand a day later, and #2605, #2503, #2513 and #2510 were never closed even though their fixes are in master. A sweep of the on-dev lane on 19 October 2026 found 57 open issues whose fix was already in production. The gate is now scripts/check-release-closing-references.mjs, which rejects the grouped form and names the numbers it would strand.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026, in PR #2735. Twelve cases cover the real release 2668 body, a body that gives every issue its own keyword, a bare mention, prose that mentions a fix, a sentence after a keyword, a list whose later numbers have no hash, and the command line. Breaking the list detection fails five of the twelve. The dev-branch gate is untouched.
- Root cause: The gate checked a shape GitHub does not honour. Its regex captured a comma list behind one keyword as a group of closing references, so the gate passed while GitHub ignored every number but the first.
- Resolution: No source work remains. The next dev to master release PR must write one keyword per issue; the gate names the numbers it would otherwise strand. The issues that shipped without closing have been closed and moved to on-prod.
- Look in: `scripts/check-release-closing-references.mjs (the checker: one keyword per issue)`, `test/check-release-closing-references.test.ts (twelve cases, including the real release 2668 body)`, `.github/workflows/release-close-issues.yml (the gate that calls it)`
- Existing tests: test/check-release-closing-references.test.ts: 12 cases over the grouped form, the correct form, prose false positives and the command line
- Done when: A release PR body that names an issue behind a single closing keyword fails the gate; A release PR body that gives every issue its own keyword passes and closes them all; A bare mention and prose that mentions a fix are not treated as closing references
- Tracker: Lane is verify-close: the gate shipped and the checker is tested. Do not rebuild it. The next release must use the correct body shape; the gate names what it would strand.

### [#1333](https://github.com/chester-hill-solutions/callcaster/issues/1333) STOP and START text remains visible to operators but no system information messages
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: none · Updated: 2026-10-18
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

### [#2095](https://github.com/chester-hill-solutions/callcaster/issues/2095) "Leave Campaign" does not leave the campaign in predictive mode — the conference and the dialer keep running and real calls keep being placed
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-17
- Predictive Leave waits for a confirmed conference stop and preserves the queue; deployed calling verification remains.
- Current behavior: PR #2257 implements #2095: Leave waits for the server stop, keeps the local device on failure and omits queue reset. The endpoint finds the current user's idle conferences and reports completion failures. All 57 focused UI and server cases passed; restoring the old Leave handler failed four regressions, and restoring the old endpoint failed twelve regressions with five controls passing.
- Resolution: Verify predictive Leave on deployed dev with browser and phone devices, pending calls and an idle conference. Confirm that the next turn stops, failed stops permit retry, other users remain connected and live Leave keeps its behavior. Promote the tested fix before closing.
- Look in: `app/components/call/CallScreen.Layout.tsx`, `app/lib/callscreenActions.ts`, `app/routes/api+/auto-dial/end.action.server.ts`, `app/lib/auto-dial.server.ts`, `test/ui/call-screen-leave.test.tsx`, `test/auto-dial-end.route.test.ts`
- Existing tests: test/ui/call-screen-leave.test.tsx (seven cases using the real conference-end helper); test/ui/callscreenActions.test.ts (server confirmation before agent hangup/state clearing); test/auto-dial-end.route.test.ts (completion failures, idle discovery, explicit target, other-user rejection and SID/name deduplication); test/auto-dial.server.test.ts (no claim, outreach attempt or call after the conference ended)
- Missing tests: Deployed browser/phone calling verification, including delayed and failed conference completion.
- Done when: With `campaign.dial_type === "predictive"`, clicking "Leave Campaign" posts `/api/auto-dial/end` and completes the conference.; No `DELETE /api/queues` requeue is issued when the campaign is being left in predictive mode.; The dialer stops placing calls within one turn after leave.; A non-predictive (live) campaign's Leave behaviour is unchanged.; The control is confirmed before it fires (see the related UX issue).
- Tracker: The source fix is in PR #2257. This board update travels with that fix; after merge, verify on deployed dev and close after production promotion. Do not start a duplicate fix.

### [#1938](https://github.com/chester-hill-solutions/callcaster/issues/1938) Epic: construct the scoped tenant client in middleware and enforce the boundary beyond routes
- Verdict: **Verify and close** · Size: L-XL · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-17
- All three children shipped on dev: middleware builds the scoped tdb once (#1940/PR #1941), the unscoped admin client is banned in app/lib with a ratchet baseline (#1939/PR #1943), and the base db client is ratcheted too (#1942/PR #1944). The epic's acceptance is met on dev.
- Current behavior: workspaceMiddleware and dataPlaneMiddleware build createTenantDb(workspaceId) once and expose tdb on the route context; workspaces+ routes read context.tdb. scripts/check-unscoped-db-imports.mjs bans @/server/admin-db and @/server/db in app/lib against an 81-entry baseline.
- Root cause: The scoped-client rule was enforced only in app/routes; app/lib was honor-system.
- Resolution: No code work left. Verify on the review env that no workspaces+ route constructs createTenantDb and that the unscoped-import guard fails on a probe import, then close when dev is promoted to master.
- Look in: `app/lib/route-context.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/workspace-route.server.ts`, `scripts/check-unscoped-db-imports.mjs`, `scripts/baselines/unscoped-db-imports.txt`, `eslint.config.mjs`
- Existing tests: test/helpers/route-context-mock.ts; test/ci-guard-scripts.test.ts
- Missing tests: A guard probe that a new app/lib module importing @/server/admin-db fails the run
- Done when: No route file under app/routes constructs createTenantDb for a plain request-scoped read or write; tdb is built once per workspace request, in middleware; A new app/lib module cannot import @/server/admin-db without adding itself to a ratchet allowlist; npm run ci:local is green
- Tracker: Verify and close. Children #1939/#1940/#1942 merged to dev (PRs #1943/#1941/#1944) but not master; close the epic when dev promotes to master.

### [#1869](https://github.com/chester-hill-solutions/callcaster/issues/1869) Verify: test calls leave the campaign queue untouched
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: @sai-sy · Updated: 2026-10-17
- Fixed on dev in PR #1900 (2a2eb281, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, the dequeue block in webhook-side-effects.server.ts is gated on outreachAttemptId != null.
- Root cause: The contact-keyed dequeue had no guard on the resolved outreach attempt, so any terminal callback with a contact_id could mutate the queue.
- Resolution: No new code. Verify on the review environment, then close when promoted to master.
- Look in: `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/routes/api+/call-status.action.server.ts`
- Existing tests: test/webhook-side-effects.test.ts
- Done when: A test call to a queued number leaves queue_state queued, queue_order unchanged, attempts unchanged and dequeued_at null
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#2060](https://github.com/chester-hill-solutions/callcaster/issues/2060) Verify welcome-credit classification through the display and reconciliation adapters
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-02
- The claimed purchase-classification defect is not present in the public adapters. Welcome and manual grant prefix buckets intentionally return other; the display adapter converts other+CREDIT to purchase, and reconciliation classifies every CREDIT as purchase.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. shared/billing-keys.ts returns other for welcome/manual grant prefixes, as explicitly tested in test/billing-keys.test.ts:28. app/lib/transaction-history-display.ts:30 maps other+CREDIT to purchase. shared/billing-reconciliation.ts:126 also maps every CREDIT to purchase. The reconciliation prefix classifier is duplicated, but that does not cause the claimed welcome-credit defect.
- Root cause: The issue mistakes the prefix-only bucket for the final event source. The adapters already use transaction type to identify credit purchases/grants. The shared key helper documentation overstates classifier reuse because reconciliation still has an inline classifier.
- Resolution: Verify welcome CREDIT classification through getBillingEventSource and categorizeLedgerRow, then close the incorrect defect report. Any distinction between paid purchases and grants needs its own product decision and task; no welcome-prefix change is needed for the claimed behavior.
- Look in: `app/lib/transaction-history-display.ts:30`, `shared/billing-reconciliation.ts:126`, `test/billing-keys.test.ts:28`, `shared/billing-keys.ts:71`, `shared/billing-keys.ts:116`, `shared/billing-reconciliation.ts:3`, `shared/billing-keys.ts:24,72,106-129`, `app/lib/getBillingEventSource`, `shared/billing-keys.ts (categorizeLedgerRow)`
- Existing tests: test/billing-keys.test.ts:28 asserts welcome/manual grant prefix buckets are other.; test/transaction-history.server.test.ts; test/billing-reconciliation.test.ts
- Missing tests: A focused adapter-level welcome CREDIT test would pin the already-correct displayed/reconciliation behavior.
- Done when: A welcome CREDIT displays as Purchase and reconciles as purchase through the public adapters.; The intentional prefix-only grant bucket remains other unless product semantics change.; Any change to distinguish paid purchases and grants has its own decision and task.
- Tracker: Move to Verify and close. Public adapters already satisfy the claimed purchase classification; do not change intentional grant prefix buckets solely to satisfy the original incorrect premise.

### [#2039](https://github.com/chester-hill-solutions/callcaster/issues/2039) Verify rented-number success tone and routing spacing
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-10-02
- PR #2071 changed the rented-number notice to success and removed the extra routing top padding. Source matches the recorded implementation plan.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The success tone and spacing change are present in dev.
- Root cause: The original default-tone and duplicate-padding defects are fixed by PR #2071. Dark/light visual checks remain.
- Resolution: Verify the reported success state and spacing visually; no further source fix is established.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx:388`, `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx:485`, `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx:387-400 (the Alert), :270 (space-y-6), :485 (border-t pt-6)`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx (default variant = border-brand-tertiary bg-brand-wash; success/destructive/warning/info exist)`, `vendor/chester-hill-solutions/shad-cc/src/styles/theme.css:161 (--brand-wash dark = hsl(340 28% 18%))`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx (sibling steps to sweep for the same missing variant)`
- Existing tests: test/ui/onboarding-first-number-flow.test.tsx; test/ui/onboarding-first-number-groups.test.tsx
- Missing tests: Existing first-number UI tests cover number flows but do not prove tone and spacing in a real rendered theme. No browser check was performed.
- Done when: The rented-number confirmation reads as a success, not an error, in both light and dark themes; The gap under the banner matches the rest of the step's rhythm; The Alert primitive's default variant is unchanged; The rented-number confirmation uses the success tone. The wider default-Alert contract is tracked separately in #2061.; A test fails if a success-state Alert renders with the default variant
- Tracker: Move to Verify and close pending browser confirmation. Related PR evidence: #2071. A PR reference alone does not prove deployed behavior.

### [#2052](https://github.com/chester-hill-solutions/callcaster/issues/2052) Give the completion RPC one best-effort owner
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Five call sites invoke try_complete_campaign_if_drained and only two guard it. campaign-queue-completion.server.ts:51-68 and ivr/status.action.server.ts:130-153 catch and log; the #2048 campaign-settle-recheck.server.ts catches and logs under a third event name; campaign.server.ts continueOrCompleteDispatch and auto-dial.server.ts:437-444 do not catch at all, so an RPC failure propagates and fails the dispatch job or dial drain. An RPC failure only means 'not complete yet', which must never fail unrelated work.
- Current behavior: Completion failures are reported three different ways depending on surface, and on two surfaces they fail the surrounding job instead of being absorbed.
- Root cause: Each call site invented its own try/catch and log message. The #2048 wrapper was created for the same reason, so there are now two wrappers and three policies.
- Resolution: One internal helper owns 'ask the gate, log, never throw', with a comment stating why. All five call sites use it and lose their own try/catch. Collapse campaign-settle-recheck.server.ts into the same owner rather than keeping two wrappers. Normalise the log event name and fields so a completion failure reads the same from every surface.
- Look in: `app/lib/campaign-queue-completion.server.ts:51-68`, `app/routes/api+/ivr/status.action.server.ts:130-153`, `app/lib/campaign-settle-recheck.server.ts`, `app/lib/worker/handlers/campaign.server.ts (continueOrCompleteDispatch)`, `app/lib/auto-dial.server.ts:437-444`, `app/lib/db-rpc.server.ts:176-184`
- Existing tests: test/webhook-side-effects.test.ts; test/campaign-settle-recheck.server.test.ts
- Missing tests: completion RPC failure does not propagate out of a dispatch job; completion RPC failure does not propagate out of a dial drain; completion RPC failure does not fail a Twilio webhook; completion RPC failure does not fail an open-sync sweep; one log event name is used from every surface
- Done when: Exactly one code path owns the best-effort completion call; All five call sites use it with no local try/catch; A completion RPC failure never propagates into a dispatch job, dial drain, webhook or sweep; One log event name and field set from every surface; Failure path tested at each call site, not only at the owner
- Tracker: Small cleanup, no live defect. Raised by the #2048 structural review and deliberately deferred there to keep that PR atomic. Lane is verify-close because the work is a de-duplication with no behavioural change to specify.

---

## Needs reproduction — 4

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

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

### [#2292](https://github.com/chester-hill-solutions/callcaster/issues/2292) Assess fragmented public survey responses
- Verdict: **Needs reproduction** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- The historic impact of per-request respondent IDs has not been measured on deployed data.
- Current behavior: The source defect is confirmed under #2125. No production survey-row query or repair has been performed in this audit.
- Root cause: Tokenless writes could fragment one visit across response rows, but anonymous records may not permit reliable attribution.
- Resolution: Identify deployment interval and intended database. Run read-only aggregate counts with controls for legitimate separate attempts and anonymous/contact-backed respondents. Record attribution limits and a concrete repair or no-repair recommendation. If justified, create an atomic repair task with exact selection and rollback; perform no repair in this assessment.
- Look in: `app/lib/survey-db.server.ts`, `app/lib/survey-responses.server.ts`, `app/db/schema-survey.ts`
- Existing tests: test/integration-db/survey-respondent-identity.test.ts
- Missing tests: Read-only aggregate deployed-data assessment with reliable identity controls.
- Done when: Identify affected revision/deployment interval and database.; Measure aggregate fragmented-response/answer/no-row-completion patterns without exporting respondent rows.; Separate anonymous/contact-backed groups and legitimate multiple attempts.; Record attribution limits and repair/no-repair recommendation.; Do not update, delete, merge or backfill stored rows in this task.
- Tracker: Independent read-only historical assessment; it does not block the source fix.

### [#1670](https://github.com/chester-hill-solutions/callcaster/issues/1670) phone number search is too strict
- Verdict: **Needs reproduction** · Labels: ux · Assignee: none · Updated: 2026-09-23
- Searching Pickering does not find South Pickering. PR #1675 changed rate-centre display names; it did not prove search matching.
- Resolution: Compare the submitted locality with provider results and determine whether the provider supports partial matching before changing the search contract.
- Look in: `app/components/phone-numbers/NumberPurchase.tsx`, `app/lib/number-locality.ts`

---

## Needs decision — 34

Product, security, or operations decision required before implementation can be scoped.

### [#1717](https://github.com/chester-hill-solutions/callcaster/issues/1717) Page not found should take you to workspace not home
- **IN PROGRESS** · Verdict: **Needs decision** · Labels: ux · Assignee: none · Updated: 2026-10-19
- A workspace URL that does not exist now lands on /workspaces, and an unknown path inside a workspace renders the 404 inside the workspace chrome (no longer the bare CallCaster error document), but nothing implements the requested URL-shape-dependent redirect: the workspace 404 still offers only a context-free window.history.back() and a root-level 404 still renders a CallCaster-branded shell with a manual 'Go home' link instead of redirecting.
- Current behavior: The claimed fix does not resolve the reported symptom.
- Root cause: The repository's own board record classified this issue as 'needs-decision' (scripts/issue-board-enrichment/needs-decision.json at 91c4409b^): "404 'Go back' is context-free history.back(); issue proposes URL-shape-dependent targets. Behavior policy decision first, then a small change." No ADR under docs/adr/ records that decision, so there is no written policy in the repo to implement. GitHub shows the issue closed 2026-10-14 as NOT_PLANNED with no commit, PR or test tied to it, and the current ISSUE_BOARD.md in master no longer lists it. Because the issue title is not a 'Decide:'/'Spike:' record, this is judged as a defect: two of the three requested destinations are not implemented as redirects.
- Resolution: Implement the missing mechanism named in the root cause.
- Look in: `app/lib/workspace-middleware.server.ts`, `.loader.server.ts`, `app/components/shared/RouteErrorBoundary.tsx`, `app/root.tsx`
- Existing tests: test/workspace-not-found.loader.test.ts — asserts the workspace catch-all throws a 404 Response and that the workspace layout's boundary renders 'Page not found' inside the app chrome; test/ui/route-error-messages.test.tsx:139-152 — asserts the 404 card keeps a 'Go back' button. No test asserts any URL-shape-dependent redirect destination.

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

### [#1815](https://github.com/chester-hill-solutions/callcaster/issues/1815) Implement TWO_FACTOR_ENABLED kill-switch state per environment
- Verdict: **Needs decision** · Size: XS · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- Recommended title: **Decide TWO_FACTOR_ENABLED kill-switch state per environment**
- Screenshot-only report from Sai. Env check resolves it: MFA is off BECAUSE TWO_FACTOR_ENABLED is unset on the review (dev) env AND on production app services (Railway list-variables; only DISABLE_2FA_ENFORCEMENT + NODE_ENV present on review, and neither 2FA var on production). isTwoFactorFeatureEnabled() (env.server.ts:270) is false unless TWO_FACTOR_ENABLED=true|1 — the #1569 kill-switch default.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The code half shipped: commit 27277319 (feat(auth): turn two-factor authentication off behind a TWO_FACTOR_ENABLED kill switch (#1569)) registers the Better Auth twoFactor plugin only when the flag is true, and every privileged-role mandate is off with it. test/two-factor-kill-switch.route.test.ts, test/two-factor.server.test.ts and test/auth-instance.server.test.ts cover it. What is missing is the state, not the code: .env.example:159 still has TWO_FACTOR_ENABLED commented out, no Railway environment model sets it, and no ADR records whether 2FA is meant to be off.
- Root cause: None — MFA is off by the intended kill-switch default because the optional env flag is unset everywhere.
- Resolution: Decide and record the per-environment state, then set the flag to match. The code is done and tested, so this is a decision plus configuration, not an implementation. A short ADR next to the existing ones is the right record, because the current position - 2FA off everywhere by default - is only correct if it is intended.
- Look in: `app/lib/env.server.ts:262-271 (isTwoFactorFeatureEnabled)`, `app/server/auth-instance.ts:59-67 (the plugin is registered only when the flag is on)`, `.env.example:159 (the flag, still commented out)`, `test/two-factor-kill-switch.route.test.ts (the kill switch is tested)`
- Existing tests: test/two-factor-kill-switch.route.test.ts; test/two-factor.server.test.ts
- Done when: Decide whether 2FA should be on; If on, set TWO_FACTOR_ENABLED and verify the plugin registers
- Tracker: Keeps blocking #1316 until the state is decided.

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

### [#1709](https://github.com/chester-hill-solutions/callcaster/issues/1709) Workspace Sidebar
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-10-17
- Major UX redesign of the workspace/campaign sidebar; interaction model (per-campaign sidebar with status/completion/quick controls) needs a product decision before scoping.
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
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: @sai-sy · Updated: 2026-10-15
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

### [#2216](https://github.com/chester-hill-solutions/callcaster/issues/2216) Email verification is half-wired: a verify-email route and a "verify your email" prompt both exist, but no verification email is ever sent
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Email verification remains half-wired: auth has reset email callback but no verification callback/requirement; register fallback claims verification and a verify handler survives. The live issue explicitly leaves mandatory verification versus removal undecided.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. Still half-wired. There is no sendVerificationEmail and no requireEmailVerification anywhere in app/. The signup response still says 'Verify your email before signing in' and the error map still maps EMAIL_NOT_VERIFIED to 403, so the promise is made and nothing delivers it. app/routes/api+/auth/verify-email.action.server.ts still exists with its rate limit and writes nothing, and auth_user.email_verified is never set by app code. No test registers a user and asserts either outcome.
- Root cause: Auth configuration enables password signup and reset delivery but has no email-verification delivery or enforcement configuration. Verification handlers and a verification message remain without a configured issuance flow. Source does not establish that the feature was deliberately removed.
- Resolution: Decide between sending the email and removing the prompt, or making verification mandatory and wiring the send. The half-wired state is the worst of the three: a user is told to verify an email that will never arrive. Whichever way it goes, the verify-email route, the signup message, the EMAIL_NOT_VERIFIED error and the emailVerified column all have to move together, and a test has to register a user and assert the outcome.
- Look in: `app/server/auth-instance.ts:21-31 (emailAndPassword, no verification callback)`, `app/lib/platform-auth.server.ts:208-217 (the signup message that lies)`, `app/lib/platform-auth.server.ts:112 (the EMAIL_NOT_VERIFIED error map)`, `app/routes/api+/auth/verify-email.action.server.ts (the dead route, still rate limited)`, `app/db/auth-schema.ts:16 (emailVerified, never written by app code)`
- Missing tests: No test exercises real registration to assert verification issuance and session policy. Account-address occupancy is established; automatic account takeover by the first registrant is not, since reset goes to the actual mailbox owner.
- Done when: A test registers a user and asserts one of the two outcomes, so the half-wired state cannot return; No user-visible string references verification unless verification happens; The dead route and its rate limit are either live or removed; A test covers the chosen path end to end
- Tracker: Needs decision. The issue explicitly requires Option A/B product policy and states funnel cost is unknown; do not select cheaper removal as a bug fix. Then implement/test the chosen policy. Related PR evidence: #2223, #2222. A PR reference alone does not prove deployed behavior.

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

## Blocked / split first — 29

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

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

### [#2213](https://github.com/chester-hill-solutions/callcaster/issues/2213) Correct the remaining temporal column types listed in the schema drift baseline
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: devops/admin · Assignee: none · Updated: 2026-10-17
- The guard and campaign_queue/call/message slices are present. The committed baseline still holds 64 remaining temporal mismatches. This is a multi-table program requiring separate table changes, not one atomic fix.
- Current behavior: Verified on dev@20f59d0e, 19 October 2026. The guard and three slices landed: the campaign_queue, call and message tables now declare their temporal columns as timestamps (3d951645, 6fca427d), and test/integration-db/schema-type-drift.test.ts asserts no column has started lying about being text and that no baselined column has stopped lying. The baseline scripts/baselines/schema-type-drift.txt still holds all 64 entries, so no further table has been sliced. app/db/schema.ts:323 still declares date_updated as text().
- Root cause: The remaining Drizzle declarations model database timestamps as text. The database types already are temporal; these slices normally change model and callers, not database column DDL. The original call/message/campaign_queue slices and tenant write-boundary repair are complete.
- Resolution: The guard and the first three slices are done. The remaining work is mechanical: correct the 64 baselined temporal columns in the same slice-at-a-time pattern, lowering the baseline with each slice, and remove the last text() temporal declaration. The existing guard test already refuses a stale baseline entry, so each slice is provable on its own.
- Look in: `scripts/baselines/schema-type-drift.txt:1`, `test/integration-db/schema-type-drift.test.ts:141`, `app/server/tenant-db.ts:121`, `scripts/baselines/schema-type-drift.txt`, `test/integration-db/schema-type-drift.test.ts`, `test/helpers/schema-drift.ts`, `app/db/schema.ts`, `app/db/schema-campaign.ts`
- Existing tests: test/integration-db/schema-type-drift.test.ts
- Missing tests: Guard exists. Each slice needs behavior tests at Date/write/wire boundaries plus real-Postgres verification; no fresh database count performed here.
- Done when: The temporal drift baseline reaches zero in small table-specific changes.; The existing guard rejects both new drift and stale baseline entries.
- Tracker: Move to Blocked / split first as a multi-table parent. Create table-specific tasks; do not re-implement the guard or completed slices. Related PR evidence: #2231, #2233, #2241, #2244. A PR reference alone does not prove deployed behavior.

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

## Needs triage — 95

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#2734](https://github.com/chester-hill-solutions/callcaster/issues/2734) Delete every workspace on dev.callcaster.ca
- Status: Backlog · Labels: devops/admin · Assignee: @sai-sy · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2732](https://github.com/chester-hill-solutions/callcaster/issues/2732) Delete Workspace Option
- Status: Backlog · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2493](https://github.com/chester-hill-solutions/callcaster/issues/2493) Stow bootstrap fails on macOS when sha256sum is absent
- Status: Backlog · Labels: none · Assignee: @wra-sol · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2716](https://github.com/chester-hill-solutions/callcaster/issues/2716) Decide the next scoped Effect adoption
- Status: In progress · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2701](https://github.com/chester-hill-solutions/callcaster/issues/2701) Destroy all stale stripe environments and sandboxes
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2700](https://github.com/chester-hill-solutions/callcaster/issues/2700) Cannot find stripe account that is connected to dev environment
- Status: Backlog · Labels: question · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2698](https://github.com/chester-hill-solutions/callcaster/issues/2698) call interface in "Predictive Dialer" campaign says "power dialer" and in "power dialer" says "manual dialing"
- Status: Backlog · Labels: design, ux · Assignee: none · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2696](https://github.com/chester-hill-solutions/callcaster/issues/2696) Railway IaC fails on dev: the plan proposes deleting CallCaster.STRIPE_API_KEY
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2677](https://github.com/chester-hill-solutions/callcaster/issues/2677) Map: spec for an integrator-friendly public API (CMS/member-platform → SMS)
- Status: Backlog · Labels: wayfinder:map · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2693](https://github.com/chester-hill-solutions/callcaster/issues/2693) Decide the 1:1 reply contract for the portal
- Status: Backlog · Labels: wayfinder:grilling · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2692](https://github.com/chester-hill-solutions/callcaster/issues/2692) Decide the opt-out webhook event and its payload
- Status: Backlog · Labels: wayfinder:grilling · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2687](https://github.com/chester-hill-solutions/callcaster/issues/2687) Decide the read-operation contracts the portal needs
- Status: Backlog · Labels: wayfinder:grilling · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2691](https://github.com/chester-hill-solutions/callcaster/issues/2691) Decide the workspace broadcast defaults for sender and send window
- Status: Backlog · Labels: wayfinder:grilling · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2690](https://github.com/chester-hill-solutions/callcaster/issues/2690) Decide whether external_id is namespaced per source system
- Status: Backlog · Labels: wayfinder:grilling · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2689](https://github.com/chester-hill-solutions/callcaster/issues/2689) Decide the phone-fallback claim rule when the matched contact has a different external_id
- Status: Backlog · Labels: wayfinder:grilling · Assignee: none · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2688](https://github.com/chester-hill-solutions/callcaster/issues/2688) Decide audience membership lifecycle when a member leaves the CMS
- Status: Backlog · Labels: wayfinder:grilling · Assignee: none · Updated: 2026-10-17
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

### [#2661](https://github.com/chester-hill-solutions/callcaster/issues/2661) Offer password recovery before entry when the reset token is missing
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2660](https://github.com/chester-hill-solutions/callcaster/issues/2660) Offer a clear recovery step for an invalid invitation
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2659](https://github.com/chester-hill-solutions/callcaster/issues/2659) Keep campaign section scrolling inside the mobile navigation rail
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2658](https://github.com/chester-hill-solutions/callcaster/issues/2658) Name each weekly campaign start/end time control
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2657](https://github.com/chester-hill-solutions/callcaster/issues/2657) Name the date-picker time parts for assistive technology
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2656](https://github.com/chester-hill-solutions/callcaster/issues/2656) Make campaign message attachments usable without hover
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2654](https://github.com/chester-hill-solutions/callcaster/issues/2654) Connect the Send using label to its campaign control
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2653](https://github.com/chester-hill-solutions/callcaster/issues/2653) Give Text campaign editing useful desktop space
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2652](https://github.com/chester-hill-solutions/callcaster/issues/2652) Give the campaign message editor an accessible field name
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

### [#2647](https://github.com/chester-hill-solutions/callcaster/issues/2647) Name the Call list index row actions
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

### [#2642](https://github.com/chester-hill-solutions/callcaster/issues/2642) Return from the audio editor to the existing library route
- Status: Backlog · Labels: ux · Assignee: @wra-sol · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2641](https://github.com/chester-hill-solutions/callcaster/issues/2641) Identify each campaign queue selection checkbox by contact
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

### [#2501](https://github.com/chester-hill-solutions/callcaster/issues/2501) SMS campaigns should have the same sendnidefault as other campaigns
- Status: Backlog · Labels: ux · Assignee: none · Updated: 2026-10-13
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2531](https://github.com/chester-hill-solutions/callcaster/issues/2531) Auto Notes on live calls
- Status: Backlog · Labels: business-logic · Assignee: none · Updated: 2026-10-10
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

### [#2239](https://github.com/chester-hill-solutions/callcaster/issues/2239) e2e toolchain step times out on a 62.8 MB ffmpeg apt download
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-07
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2472](https://github.com/chester-hill-solutions/callcaster/issues/2472) Limit public docs to supported public API surfaces
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-07
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2303](https://github.com/chester-hill-solutions/callcaster/issues/2303) Extract safe-outbound-url to a shared package — three repos now need it, and two have written their own half
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-03
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
