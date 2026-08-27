# CallCaster — Open Issue Board for Agents

Reviewed at `dev@f838c367` · Generated: 2026-08-27T01:54:10.580Z · 74 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

## How to use this board

1. Pick from **Fix now** first (confirmed, with an exact resolution path).
2. Read the full issue before starting: `gh issue view <number>`.
3. Claim it: `gh issue edit <number> --add-assignee @me`.
4. Branch from `dev` via `gh issue develop`. Follow branch/PR rules in `AGENTS.md`.
5. Issues marked **Verify and close** need a verification pass, not new code.

Lane assignments, root causes, resolution paths, and test gaps come from the audit in
`scripts/issue-board-enrichment.json` — update that file when evidence changes.

---

## Fix now — 34

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#1348](https://github.com/chester-hill-solutions/callcaster/issues/1348) IVR campaign is running yet no call to the recipient
- Verdict: **Fix now** · Size: L · Risk: high · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-08-26
- Recommended title: **fix(ivr): dispatch campaign calls when the campaign enters running state**
- IVR campaign shows running yet no call reaches the recipient. Voice/IVR campaigns only get a status update on launch — no durable dispatch work is enqueued.
- Current behavior: settings.action.server.ts updates status to running for voice/IVR but only message campaigns call launchCampaign; the campaign worker explicitly skips non-message campaigns; /api/initiate-ivr is not called by current UI.
- Root cause: The IVR dispatch path is legacy/one-off; nothing durable drives IVR calls after the campaign enters running.
- Resolution: Add a durable IVR dispatch job (or extend campaign dispatch with an IVR branch): claim queued contacts, rate-limit Twilio calls, keep out-of-window rows queued with a successor, and complete the campaign when its queue drains. Do not dispatch long-running work in the settings HTTP action.
- Look in: `app/routes/workspaces+/$id/campaigns/$selected_id/settings.action.server.ts`, `app/lib/campaign-execution.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/routes/api+/initiate-ivr.action.server.ts`, `app/lib/ivr-initiate.server.ts`
- Existing tests: test/initiate-ivr.route.test.ts; test/ivr-initiate.server.test.ts; test/campaign-dispatch-worker.test.ts (skips non-message)
- Missing tests: launching IVR enqueues work; worker claims queued contacts and calls Twilio; out-of-window rows retry with successor; campaign completes only after IVR queue drains
- Done when: Starting an IVR campaign enqueues durable dispatch work; Eligible contacts produce rate-limited Twilio attempts; Deferred/failed rows stay retryable; Status becomes complete only after drain
- Tracker: Highest-risk confirmed functional gap. Enrichment note: audio-upload hypothesis (#1346) is wrong — text-to-speech IVR works without recorded audio.

### [#1270](https://github.com/chester-hill-solutions/callcaster/issues/1270) A2: Consolidate campaign SMS dispatch into one coordinator
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-15
- Recommended title: **fix(sms): finish and contract-test the unified campaign dispatch coordinator**
- The single SMS dispatch coordinator now exists and both /api/sms and the worker use it. Remaining: in-batch duplicate protection, real MPS pacing, exact next-window scheduling, and one shared contract suite.
- Current behavior: campaign-sms-dispatch.server.ts applies windows, opt-out, line-type, duplicate, template, media, sender gates; Promise.all batch can race duplicate checks; no delay between batches; fixed 15-min send-window retry (#1352).
- Root cause: Consolidation landed but contract/pacing/dedup was never finished.
- Resolution: Add in-batch normalized-number reservation, real pacing (dispatch start rate <= configured MPS), exact next-window scheduling (with #1351/#1352), and one fixture suite run through both adapters.
- Look in: `app/lib/campaign-sms-dispatch.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/routes/api+/sms.action.server.ts`, `app/lib/throughput-config.ts`
- Existing tests: test/sms-action.route.test.ts; test/campaign-dispatch-worker.test.ts (mocks coordinator)
- Missing tests: same fixture suite through both adapters; duplicate numbers in one batch; rate over elapsed time; worker media/template/sender without mocking
- Done when: HTTP and worker adapters pass same policy fixtures; Two rows with same normalized number produce at most one send; Starts do not exceed configured MPS; Deferral schedules exact next eligible time
- Tracker: Blocks #1272. Old enrichment claiming two divergent paths is stale.

### [#1207](https://github.com/chester-hill-solutions/callcaster/issues/1207) Time zone info is incorrect
- Verdict: **Fix now** · Size: S-M · Risk: high · Labels: business-logic · Assignee: none · Updated: 2026-08-10
- Recommended title: **fix(calling): enforce recipient-local hours on manual campaign dials**
- The send-window copy claims contacts are only dialed 8am-9pm in their own timezone, but manual campaign dials are not gated at all — the reporter dialed themselves at 4am.
- Current behavior: Automated dial, IVR, and campaign SMS enforce recipientCallingWindowStatus(); the manual /api/dial path claims the queue row and creates the call without that gate.
- Root cause: app/routes/api+/dial.action.server.ts never calls the recipient-window helper before claiming.
- Resolution: Validate the canonical queued contact number against the recipient-local window before the claim (or have the claim RPC return the window verdict); a blocked dial must leave the queue row available.
- Look in: `app/routes/api+/dial.action.server.ts`, `app/lib/recipient-calling-window.ts`, `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`
- Existing tests: test/recipient-calling-window.test.ts
- Missing tests: manual dial blocked before 8:00 and at 21:00; blocked dial leaves row queued; to_number cannot bypass queued contact
- Done when: All four dial paths share the same recipient-window policy; Blocked manual dial contacts nobody; Queue row remains for a valid time
- Tracker: Compliance-relevant; do before feature work in #969/#1127.

### [#1322](https://github.com/chester-hill-solutions/callcaster/issues/1322) Need invoices in the billing section
- Verdict: **Fix now** · Size: M-L · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-08-25
- Recommended title: **feat(billing): separate credit purchases and expose Stripe receipts**
- Billing activity needs to separate purchases from usage once the ledger fills, and users need downloadable receipts/invoices.
- Current behavior: Purchases are already classified as 'Credit purchase' in billing-activity-projection but rendered in one unfiltered table; checkout does not request or store receipt data.
- Root cause: Flat activity table plus no receipt retrieval.
- Resolution: Add a Purchases filter/tab first; treat downloadable invoices as a separate Stripe-backed slice with workspace-authorized receipt lookup and safe fallback.
- Look in: `app/components/workspace/BillingActivityTable.tsx`, `app/lib/billing-activity-projection.ts`, `app/routes/workspaces+/$id/billing.route.tsx`, `app/lib/platform-billing.server.ts`
- Existing tests: test/billing-activity-projection.test.ts; test/ui/billing-activity-table.test.tsx
- Missing tests: purchase filtering/pagination; receipt authorization; missing document fallback
- Done when: Purchases viewable separately; Eligible purchases have authorized receipt action; No Stripe secret/unrestricted object serialized to client
- Tracker: Two slices: purchases view, then receipts.

### [#1280](https://github.com/chester-hill-solutions/callcaster/issues/1280) Campaign export CSV uses block IDs instead of question text for column headers
- **IN PROGRESS** · Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(export): export question columns and answers for production block types and flat live-call results**
- The header-label fix landed, but exports still show only full_result JSON with block_1 keys. Production live-call blocks use textarea/radio/select/etc, which extractScriptQuestions filters out, and live-call results are flat block-ID maps while the exporter expects nested IVR page/title objects.
- Current behavior: extractScriptQuestions accepts only question/recorded/dtmf; production uses textarea/radio/boolean/dropdown/select/multi/checkbox. Live-call results are {block_1:'...'} while exporter treats each top-level key as a page id.
- Root cause: Exporter vocabulary and result shape disagree with the live-call runtime.
- Resolution: Branch response handling by campaign/result shape (live_call flat vs robocall nested), accept production input types, use block ID as the stable lookup key, build the header before the attempt loop, and add real-data CSV tests. Do not close the issue.
- Look in: `app/lib/campaign-export-helpers.server.ts`, `app/lib/campaign-export.server.ts`, `app/routes/api+/campaign-export.action.server.ts`, `app/hooks/call/useCallScreen.ts`
- Existing tests: test/campaign-export.route.test.ts (uses artificial question type + nested result)
- Missing tests: production live-call shape; documented types (select/checkbox/dropdown/multi/boolean); nested IVR shape; blank/renamed IVR titles; zero attempts still get header
- Done when: textareas/radios export with content headers; flat live-call answers populate cells; no block_1 headers; IVR history preserved under stale titles
- Tracker: Keep open; retitle to the residual defect.

### [#1343](https://github.com/chester-hill-solutions/callcaster/issues/1343) calling work area shouldn't end up with a horizontal scroll off a macbook screen width
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(call): prevent call workbench overflow inside the workspace sidebar layout**
- The calling work area overflows horizontally on MacBook widths: the xl breakpoint activates a 3-column grid (min ~1172px) while the real container is far narrower inside the sidebar + padding.
- Current behavior: CallScreen.Workbench.tsx:35-40 forces queue 340 + script 420 + controls 380 + gaps; breakpoint uses viewport width, not container width.
- Root cause: Viewport-based breakpoint vs nested sidebar container.
- Resolution: Make the layout respond to available container width; at narrower widths move the queue into a sheet. Do not hide overflow. Merge #1314 into this.
- Look in: `app/components/call/CallScreen.Workbench.tsx`, `app/components/call/CallScreen.Layout.tsx`, `app/routes/workspaces+/$id.tsx`
- Existing tests: test/ui/call-screen-workbench.test.tsx
- Missing tests: no horizontal scroll at 1280/1366/1440 with sidebar; queue collapses to sheet
- Done when: No document horizontal scroll at laptop widths; Script and controls usable; Queue moves to sheet when needed
- Tracker: Merge #1314 (exact duplicate) into this issue.

### [#1335](https://github.com/chester-hill-solutions/callcaster/issues/1335) All errors should use the standard toast/warning alert not just red text
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **design(feedback): standardize page-level feedback with shared Alert variants and one themed toaster**
- Errors appear as plain red text in several places instead of the standard feedback components. Standardize, but do NOT turn every error into a toast.
- Current behavior: FormField owns inline field errors (keep); hand-built page-level red boxes remain in CallScreen.Layout.tsx:45, workspaces+/$id.tsx:154, MessageSettings.tsx:292; root uses raw Sonner Toaster; account.security.tsx and two-factor.tsx use plain red text.
- Root cause: No enforced 3-way feedback contract: field errors (FormField), persistent/blocking (Alert), transient action results (toast).
- Resolution: Slices 1-2 landed in the working tree: shared themed toaster adopted in root.tsx; CallScreen error banners, the workspace depleted/low-credit banners, MessageSettings media feedback, and ChatOptOutBanner migrated to shared Alert variants (resolving #1312/#1332 surfaces). Remaining: Slice 3 (MFA feedback), Slice 4 (auth/creation forms), Slice 5 (loaders, campaign summaries, pseudo-toasts).
- Look in: `app/components/ui/sonner.tsx`, `app/root.tsx`, `app/components/ui/alert.tsx`, `app/components/call/CallScreen.Layout.tsx`, `app/components/campaign/settings/MessageSettings.tsx`, `app/components/chats/ChatOptOutBanner.tsx`
- Existing tests: test/ui/components-shared-smoke.test.tsx; test/ui/hooks-utils.test.tsx
- Missing tests: Alert variant rendering light/dark; one-root-toaster contract; distinguishes field vs persistent vs transient
- Done when: Page-level blocking errors use Alert variants; Transient results use single root toaster; Field errors stay in FormField; Readable contrast in both themes
- Tracker: Parent for #1332 and #1312 (duplicates).

### [#1323](https://github.com/chester-hill-solutions/callcaster/issues/1323) Sample Campaign should be based on the goal you chose:L IVR vs Live calls vs SMS
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-08-26
- Recommended title: **feat(onboarding): generate marked sample content from the selected goal**
- The auto-seeded Sample Campaign is always live_call; it should match the chosen goal (IVR / Live calls / SMS). Seeding currently happens before the goal is known.
- Current behavior: createNewWorkspace seeds a fixed live_call sample; the goal is saved later; sample rows carry no marker.
- Root cause: Seed-before-goal timing plus no durable sample marker.
- Resolution: Implement #1070 first (durable is_sample marker), then create or replace marked sample content when the goal is first saved. Only marked rows may be replaced.
- Look in: `app/lib/seed/seed-workspace-sample-data.server.ts`, `app/lib/seed/sample-script.server.ts`, `app/lib/database/workspace-provisioning.server.ts`, `app/lib/platform-onboarding-handlers.server.ts`
- Existing tests: test/seed-workspace-sample-data.server.test.ts (expects live_call)
- Missing tests: SMS/IVR goal samples; repeated goal save
- Done when: Live/SMS/menu goals get suitable samples; Only marked sample rows replaced; User content never touched
- Tracker: Depends on #1070; pairing note on the issue agrees.

### [#1230](https://github.com/chester-hill-solutions/callcaster/issues/1230) Schema truth: bigint columns declared serial(); guard raw-SQL number coercion
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(schema): model bigint IDs correctly and normalize raw SQL numeric rows**
- Drizzle declares serial()/integer() for columns that are bigint in the real DDL (contact.id, message.contact_id, campaign_queue, call, outreach_attempt), so raw db.execute results that return int8 strings look type-safe when they are not.
- Current behavior: coercion helpers exist (coerceRowNumbers, queryScalarNumber) but some raw reads still cast without coercion (e.g. campaign-queue-db.server.ts:114).
- Root cause: Schema lie: serial() vs bigint DDL; int8 comes back from Postgres as a string.
- Resolution: Correct known columns to bigint({ mode: 'number' }) (TypeScript schema only — no DDL migration), then audit every raw SQL site that consumes numeric fields and route them through coercion.
- Look in: `app/db/schema.ts`, `app/lib/db-rpc.server.ts`, `app/lib/campaign-queue-db.server.ts`, `app/lib/acd/acd-router.server.ts`
- Existing tests: coercion helper tests (partial)
- Missing tests: schema contract test vs baseline bigint columns; raw row coercion tests for queue/RPC IDs
- Done when: Known bigint columns use bigint mode-number; Raw SQL bigint fields explicitly converted and checked; Regression test fails if columns return to serial/integer
- Tracker: No DB migration — fixes TypeScript declaration only.

### [#969](https://github.com/chester-hill-solutions/callcaster/issues/969) should be more clear on all time selectors what timezone you're working in
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-08-26
- Recommended title: **ux(time): show the active browser timezone on campaign, scheduled-SMS, and billing time surfaces**
- Every time selector should say which timezone it is working in. A campaign helper label already exists; start/end pickers, weekly schedule, scheduled SMS, and billing timestamps do not.
- Current behavior: CampaignBasicInfo.Dates shows one timezone helper below the schedule (always browser TZ); DateTimePicker is timezone-neutral; weekly schedule and scheduled SMS and billing table show no timezone.
- Root cause: Timezone disclosure not applied to every time surface.
- Resolution: Use browser timezone now (no workspace TZ storage in this issue); add a small shared timezone-label composition applied to campaign dates/schedule, scheduled SMS, and billing timestamps.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.Schedule.tsx`, `app/components/sms-ui/ChatInput.tsx`, `app/components/workspace/BillingActivityTable.tsx`, `app/lib/schedule-timezone.ts`
- Existing tests: test/schedule-timezone.test.ts (conversion strong)
- Missing tests: visible IANA timezone on campaign/SMS/billing surfaces; scheduled SMS still submits correct UTC
- Done when: Campaign schedule controls show IANA timezone; Scheduled SMS shows timezone + correct UTC; Billing timestamps identify timezone
- Tracker: Coordinate with #1127 (defaults) and #1207 (enforcement) but keep separate.

### [#1316](https://github.com/chester-hill-solutions/callcaster/issues/1316) MFA Change Log
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: design · Assignee: @wra-sol · Updated: 2026-08-25
- Recommended title: **design(mfa): polish enrollment steps, status layout, and secure code-copy controls**
- MFA change-log polish: cramped sublines (move status top-right), password-step action should be 'Next', icon copy controls with checkmark success, backup-code copy + secure-storage prompt, error-toast consistency.
- Current behavior: account.tsx renders SectionHeader with 'Save' button for the password step, status below header, plain text copy control, no backup-code copy/guidance; account.security.tsx + two-factor.tsx use plain red text.
- Root cause: Unpolished enrollment UI; some generic feedback overlaps #1335.
- Resolution: Scope to /account and /account/security: rename Save->Next, add accessible icon copy buttons with temporary check states, add backup-code copy + secure-storage guidance, move generic feedback conversion to #1335. Do not change session/logout behavior.
- Look in: `app/routes/account.tsx`, `app/routes/account.security.tsx`, `app/routes/two-factor.tsx`
- Existing tests: test/two-factor.server.test.ts (server gates only)
- Missing tests: button labels; clipboard success/failure; enrollment keeps session
- Done when: Password step says Next; Copy buttons accessible with check states; Backup codes have secure-storage prompt; Session behavior unchanged
- Tracker: Redirect work stays under #1317, not here.

### [#1310](https://github.com/chester-hill-solutions/callcaster/issues/1310) Change workspace dropdown to a scrollable, searchable combobox
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: design, ux · Assignee: @sai-sy · Updated: 2026-08-19
- Recommended title: **design(nav): replace the desktop workspace dropdown with an accessible searchable combobox**
- Workspace dropdown grows long and is not searchable. Replace with a searchable popover/command composition with a viewport-safe max height (absorbs #1309).
- Current behavior: Navbar WorkspacePicker renders a plain dropdown with no max-height, no search; shared Command primitive already has a scroll limit.
- Root cause: Primitive not used; dropdown has no height/scroll contract.
- Resolution: Replace desktop picker with Command + Popover + Button composition; keep active-workspace check and All-workspaces destination; keep mobile sheet.
- Look in: `app/components/layout/Navbar.tsx`, `app/components/ui/command.tsx`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/command.tsx`
- Existing tests: test/ui/navbar-workspace-picker.test.tsx (mocks dropdown)
- Missing tests: case-insensitive filter; empty result; keyboard + Escape; bounded height with many workspaces
- Done when: Filter by name; List viewport-safe and scrolls; Keyboard nav works; Active + All workspaces remain
- Tracker: Absorbs #1309 (close as duplicate when landed).

### [#1070](https://github.com/chester-hill-solutions/callcaster/issues/1070) Auto-seeded sample campaign/script silently completes setup-wizard steps for new workspaces
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-08-10
- Recommended title: **feat(onboarding): exclude marked sample scripts and campaigns from onboarding completion**
- Auto-seeded sample script/campaign silently completes wizard and launch-checklist steps for new workspaces. Samples are ordinary rows with no durable marker.
- Current behavior: campaign/script schema has no is_sample; seeder inserts ordinary rows; onboarding and checklist count any row > 0.
- Root cause: No durable sample marker; count-based completion.
- Resolution: Add is_sample boolean not null default false to campaign and script (migration + Drizzle), mark seeded rows, backfill existing sample rows safely (no title matching), and exclude samples from readiness/checklist counts.
- Look in: `app/db/schema.ts`, `app/lib/seed/seed-workspace-sample-data.server.ts`, `app/lib/platform-onboarding-helpers.server.ts`, `app/lib/workspace-launch-checklist.ts`
- Existing tests: test/seed-workspace-sample-data.server.test.ts
- Missing tests: fresh-workspace integration: samples do not complete steps
- Done when: Seeded rows carry is_sample; Sample-only workspaces show Script/Campaign incomplete; User rows complete steps; Safe backfill for existing samples
- Tracker: Prerequisite for #1323 and the #1167 onboarding assertion.

### [#1205](https://github.com/chester-hill-solutions/callcaster/issues/1205) "Number" onboarding is confusing
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-08-10
- Recommended title: **ux(onboarding): split Number into guided rent-or-verify substeps**
- The Number onboarding step is one long page (service address, rent/verify, inbound routing) with no internal navigation.
- Current behavior: OnboardingFirstNumberStep renders all sections on one page; outer wizard treats it as one first_number step.
- Root cause: No internal state machine or substeps.
- Resolution: Add substeps: choose Rent vs Verify -> service address (rent path) -> purchase/verify -> inbound routing. Preserve server actions and billing return URL.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`, `app/routes/workspaces+/$id/onboarding/wizard-step-resolution.ts`
- Existing tests: none for the step UI
- Missing tests: both branches; back navigation; billing return; completed-number resume
- Done when: Choose method first; Rent requires address before search; Verify bypasses rental; Routing appears only after a number exists
- Tracker: Overlaps #1110/#1113/#1318; keep as its own issue.

### [#1195](https://github.com/chester-hill-solutions/callcaster/issues/1195) Add Twilio test-credential contract tests
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-08-08
- Recommended title: **test(twilio): verify Call and Message API contracts with Test Credentials**
- Add an opt-in suite using Twilio Test Credentials and magic numbers for no-cost Call/Message request-shape and error-code coverage. Never runs against live credentials; not for webhook/TwiML/delivery.
- Current behavior: Existing Twilio tests mock the client; no Test-Credential suite exists.
- Root cause: Coverage gap.
- Resolution: Build the suite against explicit Test Credentials only (secret-gated, opt-in); the sms-send client-like seam already accepts a dependency.
- Look in: `test/twilio-client.server.test.ts`, `test/twilio-errors.test.ts`, `app/lib/sms-send.server.ts`
- Existing tests: test/twilio-client.server.test.ts; test/twilio-errors.test.ts (constructed errors)
- Missing tests: success/request-shape; documented error mappings via magic inputs
- Done when: Only Test Credentials + magic inputs; Success and error mappings asserted; Cannot use live credentials or test delivery
- Tracker: Overlaps the testing section of #1329; keep separate and opt-in.

### [#1190](https://github.com/chester-hill-solutions/callcaster/issues/1190) Sign Twilio webhooks in Compose E2E
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-08-08
- Recommended title: **test(e2e): sign Compose Twilio callbacks and reject invalid signatures**
- Compose E2E globally disables webhook validation and fixtures send no signature. Enable validation and sign fixtures with the seeded token; add invalid cases.
- Current behavior: run-compose-e2e.mjs sets TWILIO_VALIDATE_WEBHOOKS=false; webhooks.ts posts unsigned bodies.
- Root cause: E2E bypasses the real security boundary.
- Resolution: Enable validation in Compose; make fixture helpers compute signatures for the exact URL + body with the fixed seeded workspace token; add missing/invalid/tamper cases.
- Look in: `scripts/e2e/run-compose-e2e.mjs`, `e2e/fixtures/webhooks.ts`, `app/twilio.server.ts`, `app/lib/twilio-webhook.server.ts`
- Existing tests: test/twilio-webhook-validation.test.ts (mocked validator)
- Missing tests: valid/missing/invalid/tampered signature E2E
- Done when: Normal callback E2E runs with validation on; Fixtures sign exact URL+body; Invalid cases fail; No normal spec relies on bypass
- Tracker: Security-boundary work; independent of #1328.

### [#1148](https://github.com/chester-hill-solutions/callcaster/issues/1148) SMS Onboarding Changes
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: design, ux · Assignee: none · Updated: 2026-08-07
- Recommended title: **ux(onboarding): move SMS compliance identity fields out of Goal and bound help popovers**
- Goal page repeats SMS text in an InfoPopover, toll-free compliance fields live on Goal, and InfoPopover has no max-width/height/scroll.
- Current behavior: OnboardingGoalStep shows long SMS copy + tooltip; SMS toll-free fields on Goal; InfoPopover unbounded.
- Root cause: Content layout on Goal + unbounded popover primitive.
- Resolution: Extend InfoPopover with bounded wrap/scroll props (reusable), shorten Goal copy, move SMS compliance fields to Identity/Program shown only for SMS goal.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingGoalStep.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingBusinessIdentityStep.tsx`, `app/components/shared/InfoPopover.tsx`
- Existing tests: test/ui/onboarding-goal-step.test.tsx (expects toll-free on Goal — must move)
- Missing tests: popover bounds; SMS-only identity fields
- Done when: Goal has short non-duplicated guidance; Help content wraps/scrolls within bounds; SMS compliance fields only for SMS goal; Saved data unchanged
- Tracker: Coordinate with #1345/#1311/#1122.

### [#1351](https://github.com/chester-hill-solutions/callcaster/issues/1351) SMS Window set to 3:05PM yet estimate says 3pm it'll be done
- Verdict: **Fix now** · Size: S-M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(sms): align deferred dispatch and ETA to the next send-window opening**
- SMS send window is 3:05PM yet the completion estimate says done by 3PM. The live ETA (getEtaRange) is a naive Date.now() + queue/rate calc that ignores the send window and the worker's 15-min deferral.
- Current behavior: CampaignLaunchExtras renders an ETA from getEtaRange and never passes sms_send_window to any projection.
- Root cause: estimateOutboundCompletion() in app/lib/campaign-outbound-estimate.ts is window-aware but has zero callers; the UI uses a local naive estimator.
- Resolution: Delete local getEtaRange, call estimateOutboundCompletion with the campaign send window, and share the scheduler calculation with the worker (see #1352).
- Look in: `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`, `app/lib/campaign-outbound-estimate.ts`, `app/lib/campaign-send-window.ts`
- Existing tests: test/campaign-outbound-estimate.test.ts (throughput only)
- Missing tests: ETA cannot finish before window opens; work spanning two windows; fast/slow bounds across closed period; UI range test with fixed clock
- Done when: ETA is never earlier than the first eligible send time; Closed periods do not consume projected throughput; Rendered estimate uses estimateOutboundCompletion
- Tracker: Merge with #1352 (it is already its parent).

### [#1334](https://github.com/chester-hill-solutions/callcaster/issues/1334) Results numbers are off?
- Verdict: **Fix now** · Size: S-M · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-08-26
- Recommended title: **fix(results): separate contact progress from message and call attempt totals**
- SMS results show 'Total messages: 2 of 1' with a one-contact queue and 3+ messages each. The UI sums message-status rows AND dequeued queue rows for one contact.
- Current behavior: CampaignResultDisplay sums visible disposition/status buckets; MessageResultsScreen divides by total queue contacts; campaign-stats.server.ts adds a dequeued count after counting message statuses. One sent message produces one message-status row plus one completed queue row -> '2 of 1'.
- Root cause: Contact progress and provider-message totals are conflated: queue lifecycle and message statuses are summed into one denominator.
- Resolution: Define separate metrics: contact progress = unique completed queue rows / total queue rows; messages sent = message-row count (no contact denominator); call attempts = attempt count (no contact denominator).
- Look in: `app/lib/database/campaign-stats.server.ts`, `app/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay.tsx`, `app/components/campaign/home/CampaignHomeScreen/MessageResultsScreen.tsx`
- Existing tests: test/ui/campaign-result-display.test.tsx (empty-state only)
- Missing tests: 1 sent + 1 dequeued shows 1 of 1 not 2 of 1; multiple messages to one contact unchanged progress; multiple call attempts produce no invalid fraction
- Done when: Contact progress never exceeds assigned queue total; Message totals count message rows only; Call-attempt totals clearly labelled without contact denominator
- Tracker: Webhook-side-effects/dispatch files in old enrichment are secondary; root is campaign-stats + result presentation.

### [#1231](https://github.com/chester-hill-solutions/callcaster/issues/1231) Delete dead Supabase-era app code (shims, stale types, PostgREST constants)
- Verdict: **Fix now** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-08-26
- Recommended title: **chore: remove verified zero-consumer Supabase and Deno compatibility residue**
- Delete dead Supabase-era code — but only what has zero production importers. Several items in the original list are actually live.
- Current behavior: queue-status.ts constants are live UI contracts (do not delete); type-safety-utils Supabase wrapper is dead outside tests but the file is widely imported; supabase.types.ts is a 7-line stub; shared/ivr-status-logic.ts is already deleted; Deno devDependency remains; useRealtimeData stub has no production caller; get_conversation_summary type is still used by chat realtime.
- Root cause: Original issue list was written pre-cleanup and is partly stale.
- Resolution: Partially implemented in the working tree: supabase.types.ts deleted, dead useRealtimeData stub + barrel exports + README entry removed, deno.lock deleted and the deno devDependency removed from package.json + both lockfiles. Remaining: prune the 16 dead type-safety-utils exports and switch useChatRealtime to the canonical ConversationSummary type.
- Look in: `app/lib/type-safety-utils.ts`, `app/hooks/realtime/useChatRealtime.ts`, `app/lib/chat-conversation-sort.ts`
- Existing tests: test/queue-status.test.ts
- Missing tests: structural zero-import check for deprecated exports
- Done when: Every deleted symbol has zero production importers; Live queue/campaign/chat types intact; Deno removed only if no active command imports it
- Tracker: Retitle from the original list; comment on issue already corrects it.

### [#1342](https://github.com/chester-hill-solutions/callcaster/issues/1342) once a user hangs up the button still says hang up
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: ux, business-logic · Assignee: none · Updated: 2026-08-26
- Recommended title: **feat(call): show a confirmed 'Call back' action after a completed call**
- After a hangup the button should become 'Call back' (with confirmation) for the same contact; today terminal state falls back to the generic Dial. The stale 'Hang Up' symptom itself is already fixed by terminal-state handling.
- Current behavior: Hang Up shows only while dialing/connected; terminal provider status sends HANG_UP and disconnects the SDK call; a completed call falls back to ordinary Dial with no callback label or confirmation.
- Root cause: No isRedial/terminal-contact state in the display derivation.
- Resolution: Add an explicit terminal-contact state, label the action 'Call back', add a confirmation dialog before redialing the same contact, keep normal Dial for a new queue recipient. Merge #1292 into this.
- Look in: `app/components/call/CallScreen.CallArea.tsx`, `app/hooks/call/useCampaignDialActions.ts`, `app/hooks/call/useCallHandling.ts`, `app/hooks/call/useCampaignCallFlow.ts`
- Existing tests: test/ui/call-screen-callarea.test.tsx; test/ui/campaign-call-flow-display-state.test.ts
- Missing tests: completed same-contact shows Call back; callback requires confirmation; cancel does not dial
- Done when: Terminal state never shows Hang Up; Same contact shows Call back; Callback confirmed before dial; Cancel creates no attempt
- Tracker: Merge #1292 into this issue.

### [#1319](https://github.com/chester-hill-solutions/callcaster/issues/1319) Red button hover state text should be black or red not white
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(ui-kit): destructive button text contrast across default and hover states in shad-cc**
- Red/destructive buttons keep white text on hover (bg opacity change only). Fix belongs upstream in @chester-hill-solutions/shad-cc, not per-screen.
- Current behavior: shad-cc button.tsx destructive variant: white text base + hover:bg-destructive/90; foreground/background tokens are package-owned.
- Root cause: Contrast requirement; 'black or red text' was the reporter's framing, contrast is the real requirement.
- Resolution: Measure WCAG AA contrast in both themes and states, fix the package token/variant, update the vendored copy through the package workflow. No per-screen overrides.
- Look in: `vendor/chester-hill-solutions/shad-cc/src/components/ui/button.tsx`, `vendor/chester-hill-solutions/shad-cc/src/styles/theme.css`, `app/components/ui/button.tsx`
- Existing tests: none for contrast
- Missing tests: package-level contrast/axe for default/hover/focus/disabled; CallCaster smoke keeps package variant
- Done when: Destructive button text meets AA in both themes; States remain distinct; Package-owned fix applies to Button/LinkButton/asChild
- Tracker: Portfolio-level fix; do not hand-roll locally.

### [#1067](https://github.com/chester-hill-solutions/callcaster/issues/1067) Same screen mixes 'Call list' and 'Audience' terminology
- Verdict: **Fix now** · Size: S-M · Risk: low · Labels: none · Assignee: none · Updated: 2026-08-26
- Recommended title: **refactor(copy): finish the user-facing 'Call list' rename while preserving Audience API names**
- Most UI now says 'Call list', but contact detail, queue header/table, campaign-context creation, wizard step, and launch badge still say 'Audience'. Canonical UI term is now Call list.
- Current behavior: Residue: ContactDetails heading + fallback names, QueueHeader/QueueTable labels, campaigns/$campaign_id/audiences/new.route.tsx title/button, OnboardingWizard step title, OnboardingLaunchStep badge; a test preserves stale queue copy.
- Root cause: Partial rename; several surfaces never converted.
- Resolution: Rename user-visible copy to 'Call list(s)' only. Keep Audience in types, routes, DB columns, API fields, and code identifiers.
- Look in: `app/components/contact/ContactDetails.tsx`, `app/components/queue/QueueHeader.tsx`, `app/components/queue/QueueTable.tsx`, `app/routes/workspaces+/$id/campaigns/$campaign_id/audiences/new.route.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`
- Existing tests: test/ui/components-queue.test.tsx (preserves stale term)
- Missing tests: copy guard for user-visible 'Audience' with documented exceptions
- Done when: Listed surfaces say Call list; Unnamed records use 'Call list <id>'; Internal/API names unchanged; UI tests updated
- Tracker: Issue proposed 'Audience' as canonical; current UI standard is Call list.

### [#1347](https://github.com/chester-hill-solutions/callcaster/issues/1347) need to verify consistency for Robocall vs IVR vs Automated Phone Menu
- Verdict: **Fix now** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **refactor(copy): standardize customer-facing automated-phone-menu terminology**
- 'Automated phone menu', 'IVR', and 'Robocall' are used inconsistently for the same product goal across UI and docs.
- Current behavior: campaign-goals.ts says 'Automated phone menu'; messaging-onboarding/goals.ts says 'IVR'; services.tsx says 'Robocalls'; utils.ts legacy helper returns 'Robocall'. Internal enums remain robocall/simple_ivr/complex_ivr.
- Root cause: No canonical customer-facing label; three sources of truth.
- Resolution: Pick one customer-facing name for the goal (keep internal/API enum values unchanged), keep 'Advanced IVR' technically distinct, add a shared terminology contract test.
- Look in: `app/lib/campaign-goals.ts`, `app/lib/messaging-onboarding/goals.ts`, `app/routes/services.tsx`, `app/lib/utils.ts`, `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`
- Existing tests: test/ui/campaign-new-goals.test.tsx; test/ui/onboarding-goal-step.test.tsx; test/utils.test.ts (all preserve inconsistency)
- Missing tests: shared canonical-label contract test
- Done when: Goal selection and campaign setup use one customer-facing name; Internal enums and API values unchanged; Advanced IVR stays separate
- Tracker: Coordinate with #1323 onboarding copy.

### [#1338](https://github.com/chester-hill-solutions/callcaster/issues/1338) Call Settings buttons are all over the place needs better alignment and padding
- Verdict: **Fix now** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **design(call): organize Call Settings into consistent audio and calling-device sections**
- Call Settings buttons/controls are scattered with inconsistent alignment and padding.
- Current behavior: Header sheet mixes a 3-column mic/speaker/mute grid with a separate wrapping row for calling device and Add Phone Number, plus an inline number form.
- Root cause: Two layout systems inside one sheet; no shared section/alignment.
- Resolution: Define sections (Audio input, Audio output, Calling device, Verified numbers), use one FormField grid and one action alignment, keep everything in the existing sheet.
- Look in: `app/components/call/CallScreen.Header.tsx`, `app/components/call/CallScreen.Layout.tsx`
- Existing tests: test/ui/call-screen-header.test.tsx
- Missing tests: desktop/mobile sheet screenshots; keyboard order; long device-label wrapping
- Done when: One alignment system; Usable with long device labels; Consistent padding mobile/desktop; Keyboard order matches visual order
- Tracker: Combine with #1339 if audio test controls are approved.

### [#1317](https://github.com/chester-hill-solutions/callcaster/issues/1317) Logging in after setting MFA sends me to /account instead of /workspaces
- Verdict: **Fix now** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(auth): preserve and follow the workspace destination after inline MFA enrollment**
- Logging in after setting up MFA lands on /account instead of /workspaces. PR #1330 fixes the unauthenticated /account bounce but not authenticated inline enrollment, which loses the next param.
- Current behavior: two-factor.server.ts gates with /account?enroll=1&next=<path>; account loader reads only enroll; inline verification form has no next field; security action redirects only when next is present. verifyTOTP response headers are discarded on the account path.
- Root cause: next is dropped through the inline enrollment flow; verifyTOTP Set-Cookie headers not merged.
- Resolution: Amend PR #1330: return safe next from the account loader, submit it in the inline verify form, merge verifyTOTP headers into the response, redirect after enrollment, and add focused tests.
- Look in: `app/routes/account.loader.server.ts`, `app/routes/account.tsx`, `app/lib/two-factor.server.ts`, `app/routes/account.security.loader.server.ts`, `app/routes/signin.action.server.ts`
- Existing tests: test/account.route.test.ts (mocks auth)
- Missing tests: enroll=1&next preserved; inline form submits next; redirect after verify; Set-Cookie headers reach response; external next rejected
- Done when: /account?enroll=1&next=/workspaces retains next; Success redirects to safe destination; Unsafe next rejected; No-next stays on Account
- Tracker: Do not close with PR #1330 as-is; the failing E2E check on it is unrelated call-screen flake.

### [#1318](https://github.com/chester-hill-solutions/callcaster/issues/1318) On-boarding width can be smaller
- Verdict: **Fix now** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-25
- Recommended title: **design(onboarding): constrain onboarding steps while keeping the number flow wide**
- Onboarding pages can use a narrower centered max width; the first-number step must stay wide.
- Current behavior: Focused onboarding layout still uses full workspace width ($id.tsx); OnboardingWizard adds spacing but no width constraint; individual forms are narrow but headers/checklist/launch are full width.
- Root cause: No centered width constraint around ordinary wizard steps.
- Resolution: Add a centered readable max-width wrapper for standard steps; keep first_number wide; mobile stays full width.
- Look in: `app/routes/workspaces+/$id.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`
- Existing tests: none
- Missing tests: responsive/width component test; visual checks at laptop widths
- Done when: Standard steps centered with max width; Number step stays wide; Mobile no horizontal scroll; Footer aligns with step content
- Tracker: Coordinate with #1110/#1205 number flow.

### [#1311](https://github.com/chester-hill-solutions/callcaster/issues/1311) Website URL is required even though it says optional outside of SMS
- Verdict: **Fix now** · Size: S · Risk: low · Labels: ux · Assignee: @sai-sy · Updated: 2026-08-19
- Recommended title: **fix(onboarding): make Website URL requirement depend on the SMS goal**
- Website URL shows 'required' styling plus an 'Optional' label; it should be optional unless the goal is SMS (then required, no 'optional' hint, dynamic asterisk).
- Current behavior: useRequiredBusinessProfileFields sets required:true for every field; server treats website as optional for every goal including SMS — both client and server are wrong in different directions.
- Root cause: Requiredness not derived from goal; client and server disagree.
- Resolution: Derive websiteRequired from selectedGoal === sms; apply the same rule in client validation, server validation, label, description, and progress. Implement with #1122.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingBusinessIdentityStep.tsx`, `app/routes/workspaces+/$id/onboarding/useRequiredBusinessProfileFields.ts`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/platform-onboarding-handlers.server.ts`
- Existing tests: test/onboarding-business-profile-validation.test.ts (website optional)
- Missing tests: goal-specific requiredness; asterisk/optional copy per goal
- Done when: Website optional for live/IVR/rent goals; Required for SMS; Client and server agree; Copy and asterisk follow goal
- Tracker: Implement together with #1122.

### [#1167](https://github.com/chester-hill-solutions/callcaster/issues/1167) e2e full sign up flow
- Verdict: **Fix now** · Size: S · Risk: low · Labels: devops/admin · Assignee: none · Updated: 2026-08-10
- Recommended title: **test(e2e): complete signup, session, and first-login redirect**
- Add a full sign-up flow E2E: unique user registers through the browser, gets an authenticated session, and lands on the expected workspace/onboarding route. Headed and headless.
- Current behavior: Current auth.spec.ts only checks the signup form opens.
- Root cause: No browser test exercises registration -> session -> first navigation.
- Resolution: Add one unique-user test; sequence the onboarding-state assertion behind #1070 (seeded samples must not count as complete).
- Look in: `e2e/specs/auth.spec.ts`, `e2e/fixtures/seed.ts`, `app/routes/signup.action.server.ts`
- Existing tests: e2e/specs/auth.spec.ts (form opens only)
- Missing tests: successful submit; duplicate email; new-session verification; post-#1070 fresh-workspace assertion
- Done when: Unique user signs up with session; Reaches expected workspace/onboarding route; Runs headless and headed
- Tracker: One assertion depends on #1070; not a formal blocker.

### [#1159](https://github.com/chester-hill-solutions/callcaster/issues/1159) Better dev flow
- Verdict: **Fix now** · Size: S · Risk: low · Labels: devops/admin · Assignee: none · Updated: 2026-08-07
- Recommended title: **chore(dev): add local up/down/logs commands and an agent workflow skill**
- Local dev is mostly solved (one-command setup, Compose stack, quickstart README). Residual: no simple stop/logs commands and no agent skill for the local workflow.
- Current behavior: npm run setup starts services; docs/local-development.md is a second, longer boot procedure; no Makefile; no skill.
- Root cause: Setup exists; ergonomics around stopping/tailing and agent guidance are missing.
- Resolution: Add local:up / local:down / local:logs commands, make the guide delegate to them, and add a small agent skill (setup, doctor, logs, calling-sync). Never overwrite .env.
- Look in: `scripts/local/setup.mjs`, `docs/local-development.md`, `README.md`, `docker-compose.dev.yml`
- Existing tests: none for commands
- Missing tests: command smoke/help tests
- Done when: One documented command starts/stops/tails stack; README delegates to one canonical guide; Small agent skill exists; .env never overwritten
- Tracker: Do not rebuild setup; #1328 later removes real Twilio creds from local dev.

### [#1127](https://github.com/chester-hill-solutions/callcaster/issues/1127) Default times should be 9:00 to 21:00 since calling usually happens in the evenings
- Verdict: **Fix now** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-07-30
- Recommended title: **feat(campaign): change default voice calling hours to 09:00-21:00**
- Default calling hours are 09:00-17:00; change to 09:00-21:00 since calling happens in the evenings.
- Current behavior: campaign-setup-steps.ts and Dates.tsx default to 09:00-17:00; presets and E2E seed lock it.
- Root cause: Hard-coded default duplicated in several places.
- Resolution: Create one shared default-hours constant used by creation, day-enabling, presets, and E2E seed.
- Look in: `app/lib/campaign-setup-steps.ts`, `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`, `scripts/e2e/seed-data.mjs`
- Existing tests: test/campaign-setup-steps.test.ts; test/ui/components-campaign.test.tsx (both lock 17:00)
- Missing tests: preset label/value agreement
- Done when: New voice campaigns default 09:00-21:00; Enabling a day uses same default; Existing saved schedules unchanged
- Tracker: Recipient window already ends at 21:00 so the value is legal.

### [#1122](https://github.com/chester-hill-solutions/callcaster/issues/1122) Onboarding - Business Identity: Website URL error says required when actual error is format
- Verdict: **Fix now** · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-07-30
- Recommended title: **fix(onboarding): validate Website URL format with an accurate error**
- Entering 'sai.com' shows 'Website URL is required.' when the actual error is format. Blank and malformed both trigger onInvalid and map to 'required'.
- Current behavior: The hook treats every invalid event as missing; server does not validate URL format at all (saves sai.com).
- Root cause: valueMissing and typeMismatch conflated; no server-side URL validation.
- Resolution: Distinguish valueMissing from typeMismatch and add server-side URL parsing; error copy: 'Please enter a valid url e.g. https://example.com'.
- Look in: `app/routes/workspaces+/$id/onboarding/useRequiredBusinessProfileFields.ts`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/platform-onboarding-handlers.server.ts`
- Existing tests: blank/valid only
- Missing tests: malformed format; server/API validation parity
- Done when: sai.com reports format example; blank reports required only when required; valid https URLs save; server matches browser
- Tracker: Implement with #1311.

### [#1113](https://github.com/chester-hill-solutions/callcaster/issues/1113) Onboarding Number | No space between action titles
- **IN PROGRESS** · Verdict: **Fix now** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(onboarding): prevent Number-step section outlines from crossing action titles**
- Spacing between 'Rent a Canadian Number' and 'Verify your own number' is fixed; the current defect is the fieldset/legend outline crossing the title.
- Current behavior: OnboardingFirstNumberStep uses two fieldsets with overflow-hidden; latest screenshot shows the outline struck through the section title.
- Root cause: fieldset/legend border treatment with overflow-hidden clips/draws through the legend.
- Resolution: Fix the fieldset/legend border handling; keep the vertical gap. Update the issue title to the current symptom.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`
- Existing tests: none for the sections
- Missing tests: outline not crossing title; light/dark rendering
- Done when: No border crosses either title; Two actions keep vertical separation; Accessible grouping retained; Light + dark correct
- Tracker: Retitle from the fixed spacing problem to the outline problem.

### [#1204](https://github.com/chester-hill-solutions/callcaster/issues/1204) "Identity" step in onboarding breadcrumbs is always marked as red (unfinished) even once completed
- **IN PROGRESS** · Verdict: **Fix now** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(onboarding): align Identity progress completion with Identity validation**
- The Identity breadcrumb stays marked incomplete after the form is filled — progress counts hidden A2P fields that validation does not require.
- Current behavior: readiness.server.ts isBusinessBasicsComplete uses all A2P fields (website, use-case, samples) while Identity validation only requires legal business name; server accepts the one-field profile but progress stays incomplete.
- Root cause: Two different required-field sets for the same step.
- Resolution: Make isBusinessBasicsComplete use BUSINESS_IDENTITY_REQUIRED_FIELDS (or the shared missing-field helper) so a saved legal business name completes Identity.
- Look in: `app/lib/messaging-onboarding/readiness.server.ts`, `app/lib/messaging-onboarding/predicates.ts`, `app/routes/workspaces+/$id/onboarding/OnboardingProgressStrip.tsx`
- Existing tests: test/onboarding-business-profile-validation.test.ts (one-field baseline)
- Missing tests: progress-step test for the same profile
- Done when: Saved legal business name completes Identity; Program/SMS fields do not control Identity; Missing name keeps step incomplete
- Tracker: Confirmed; small one-liner alignment.

---

## Verify and close — 13

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#1346](https://github.com/chester-hill-solutions/callcaster/issues/1346) clicking the audio upload button does nothing
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux, business-logic · Assignee: none · Updated: 2026-08-26
- Recommended title: **fix(scripts): enable inline audio upload in the campaign script editor**
- Audio upload in the campaign-settings script editor does nothing — the route renders CampaignSettingsScript without onUploadAudio, so the upload control is not even rendered (standalone scripts route works).
- Current behavior: Fixed in working tree: edit.route.tsx now threads workspace_id + a handleUploadAudio callback (POST /api/audio-upload, adds the returned media name to local mediaNames) into CampaignSettingsScript.
- Root cause: Threading gap: standalone route passes handleUploadAudio, campaign edit route did not.
- Resolution: Implemented: onUploadAudio is now passed for all campaign script branches; mediaNames is local state so uploaded names are available to recorded blocks. Regression tests cover the wiring and the failure toast.
- Look in: `app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.route.tsx`, `app/components/campaign/settings/script/ScriptBlockEditor.tsx`, `app/routes/api+/audio-upload.action.server.ts`
- Existing tests: test/ui/campaign-script-edit-route.test.tsx (onUploadAudio wiring + failure toast)
- Missing tests: none — new tests landed with the fix
- Done when: Recorded IVR blocks show Upload audio while editable; Successful upload selects returned media name; Failed upload toasts and leaves block unchanged
- Tracker: Verify on dev and close. Coordinate with #1327 if the props refactor starts.

### [#1126](https://github.com/chester-hill-solutions/callcaster/issues/1126) This campaign is currently inactive modal is all over the place
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-08-26
- Recommended title: **fix(call): clean up the inactive-campaign dialog layout**
- Inactive-campaign modal: title centered while message left-aligned, and the dialog is too tall.
- Current behavior: Fixed in working tree: CallScreen.Dialogs.tsx now uses the standard DialogHeader/DialogTitle/DialogDescription composition with sm:max-w-[450px]; text-center, text-2xl, my-4 and mb-2 removed.
- Root cause: Custom dialog classes overrode the standard composition and added excess spacing.
- Resolution: Implemented: standard composition per the design system; test updated to assert title in DialogTitle, message in DialogDescription, and no grid-cols-1 artifact.
- Look in: `app/components/call/CallScreen.Dialogs.tsx`
- Existing tests: test/ui/call-screen-dialogs.test.tsx (standard composition assertions)
- Missing tests: mobile screenshot
- Done when: Title and message share a left edge; Max width 450px desktop; Height follows content; OK right-aligned desktop
- Tracker: Verify on dev and close.

### [#1278](https://github.com/chester-hill-solutions/callcaster/issues/1278) bug(queue): manual dequeue of another agent's assigned row returns success but silently no-ops
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-08-26
- Recommended title: **Close #1278: surfaced guarded dequeue no-op is complete; new flash is a separate symptom**
- The silent no-op is fixed by PR #1279 (merge 66f1446c): dequeue_contact reports rows affected, the wrapper explains the no-op (assigned_elsewhere 409 vs already_dequeued 200), and PostgreSQL tests preserve the race guard.
- Current behavior: Cross-agent dequeue returns 409 and leaves the row; already-dequeued is idempotent 200. Latest reporter comment 'still get the flash once dialing' is NOT this issue — dequeue is triggered by Save and Next, not Dial.
- Root cause: Original defect resolved. The new flash is ambiguous: stale outcome (#1286), dial claim refusal (409 from /api/dial), or delayed dequeue toast.
- Resolution: Close #1278. For the flash, identify exact text/area: top-bar stale status -> #1286 (needs repro); toast 'assigned to another agent' after Save and Next -> delayed #1278 feedback; other toasts -> dial claim refusal. Use flash telemetry.
- Look in: `app/routes/api+/queues.action.server.ts`, `app/lib/campaign-queue-db.server.ts`, `client/migrations/20260815130000_dequeue_contact_returns_rows_affected.sql`, `app/lib/flash-telemetry.client.ts`
- Existing tests: test/queues.route.test.ts (409/idempotent); test/integration-db/dequeue-contact-assigned.test.ts
- Missing tests: integrated remote-hangup asserts Hang Up disappears; flash classification test
- Done when: Cross-agent dequeue 409 leaves row; Retries idempotent 200; Race guard preserved in real PG
- Tracker: Close original; file a new issue for the flash once reproduced with text/area.

### [#1336](https://github.com/chester-hill-solutions/callcaster/issues/1336) Call Exports
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-08-26
- Recommended title: **docs(csv): explain spreadsheet-safety prefix on exported phone numbers**
- The leading apostrophe on +phone numbers is intentional CSV-injection protection (sanitizeCsvInjection). Not a bug unless a strictly validated E.164-only export strategy is approved.
- Current behavior: Strings starting with + are prefixed with '; campaign exports enable protection for every row; contract tests require neutralization.
- Root cause: Working as designed.
- Resolution: Close as working-as-designed, or add help text explaining the prefix. Only exempt phone cells if E.164 normalization is proven and a malicious-value regression test is added.
- Look in: `app/lib/csv.ts`, `app/lib/campaign-export.server.ts`, `test/csv.test.ts`
- Existing tests: test/csv.test.ts; test/campaign-export-contract.test.ts
- Missing tests: E.164 round-trip/import test if exempting phones
- Done when: Protection remains for untrusted strings; Help text explains the apostrophe
- Tracker: Close or document; removing the prefix is a security regression risk.

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

### [#1327](https://github.com/chester-hill-solutions/callcaster/issues/1327) chore(scripts): collapse vestigial pageData.campaignDetails nesting
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-08-26
- Recommended title: **refactor(script-editor): replace pageData wrapper with script/onChange props**
- Flattened CampaignSettings.Script to { script, onChange, mediaNames, onUploadAudio, readOnly }; deleted the PageData wrapper and both as-PageData casts.
- Current behavior: Implemented in working tree: component takes script/onChange directly; standalone route passes onChange={setScript}; campaign edit route passes onChange updating pageData.campaignDetails.script; tests updated to the flat contract.
- Root cause: Legacy prop wrapper with no consumer meaning.
- Resolution: Implemented. Also pairs with the #1346 upload wiring (same component/route).
- Look in: `app/components/campaign/settings/script/CampaignSettings.Script.tsx`, `app/routes/workspaces+/$id/scripts/$scriptId.route.tsx`, `app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.route.tsx`
- Existing tests: test/ui/script-editor-adapter.test.tsx; test/ui/script-editor-route.test.tsx; test/ui/campaign-script-edit-route.test.tsx (all updated and passing)
- Missing tests: none
- Done when: Component accepts script/onChange directly; No PageData casts on either route; Editor/save/read-only/media/audio tests pass
- Tracker: Verify on dev and close.

### [#1286](https://github.com/chester-hill-solutions/callcaster/issues/1286) Call screen paints one stale frame (previous outcome / last disposition) on every new dial
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-08-17
- Recommended title: **Close #1286: synchronous dial lifecycle reset is covered**
- The stale-frame defect is fixed by PR #1288 (merge a1fb10f3): beginDial resets the lifecycle in the same batch as START_DIALING and the live FSM outranks the previous disposition. Render-by-render regression tests exist.
- Current behavior: beginDial() resets provider state and lifecycle synchronously; dial click calls FSM action + beginDial in one batch; live FSM outranks old disposition.
- Root cause: Resolved; open state is project/default-branch bookkeeping (Closes # does not fire on dev merges).
- Resolution: Verify CI is green and close. No production change indicated.
- Look in: `app/hooks/call/useCampaignCallFlow.ts`, `app/hooks/call/useCampaignDialActions.ts`, `test/ui/use-campaign-call-flow.test.tsx`, `test/ui/campaign-call-flow-display-state.test.ts`
- Existing tests: use-campaign-call-flow render-history tests; campaign-call-flow-display-state terminal tests
- Missing tests: none required; optional Playwright frame test
- Done when: No-stale-frame tests pass; New dial never renders prior outcome; No extra production change
- Tracker: Close after verification; do not reopen on the #1278 flash without a confirmed stale frame.

### [#1222](https://github.com/chester-hill-solutions/callcaster/issues/1222) call.queue_id is never persisted on the manual dial path
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-08-13
- Recommended title: **Prove manual dial persists the campaign queue ID**
- call.queue_id is now persisted on the manual dial path: startCall appends the queue row id, /api/dial requires and writes it into both the outreach attempt and the call row.
- Current behavior: Client requires nextRecipient.contact; dial route requires queue_id and persists it.
- Root cause: Resolved during #1218/#1223 work.
- Resolution: Optionally add direct assertions for submitted and persisted queue_id, then close.
- Look in: `app/lib/callscreenActions.ts`, `app/routes/api+/dial.action.server.ts`
- Existing tests: test/ui/callscreenActions.test.ts; test/dial.route.test.ts
- Missing tests: FormData carries queue_id; saveCallToDatabase receives queue_id; outreach attempt receives queue_id
- Done when: Client submits queue id; Both writes receive same id; Missing id stays 400
- Tracker: Close; enrichment was stale.

### [#1168](https://github.com/chester-hill-solutions/callcaster/issues/1168) Campaign states aren't clear
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: @sai-sy · Updated: 2026-08-10
- Recommended title: **Verify and close campaign Running/Waiting state clarity**
- The 'waiting' status and automatic running<->waiting transitions around calling hours are implemented (PR #1236 / commit fca7f872). UI shows amber Waiting; scheduler flips voice campaigns in/out of window.
- Current behavior: campaign-status-rail + status-badge show waiting; campaign-schedule-sync.server.ts runs every minute and transitions running<->waiting; tests cover transitions.
- Root cause: Implemented; uses 'Archived' instead of proposed 'Stopped'.
- Resolution: Visual/product QA; close if 'Archived' is accepted, else file a naming-only decision.
- Look in: `app/lib/campaign-status-rail.ts`, `app/components/ui/status-badge.tsx`, `app/lib/campaign-schedule-sync.server.ts`, `app/lib/worker/handlers/cron.server.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts
- Missing tests: integrated UI test shows Waiting after transition
- Done when: Outside-hours voice shows Waiting; Returns to Running in window; Product approves Archived vs Stopped
- Tracker: Close after QA; stale enrichment described a proposal.

### [#1203](https://github.com/chester-hill-solutions/callcaster/issues/1203) audience file upload should have some on file hover UI change when dragging a file
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-10
- Recommended title: **design(audience): show an active visual state while a CSV is dragged over the upload zone**
- The audience drop zone has pointer-hover styles but no drag-active state.
- Current behavior: Fixed in working tree: AudienceUploadFileStep tracks dragenter/dragleave via a depth counter and applies a border-primary/bg-primary/10 highlight while a file is over the zone.
- Root cause: dragenter/dragleave not tracked.
- Resolution: Implemented: drag-active state with semantic tokens; clears on leave and drop; drop still imports the file. Regression test covers enter/persist/leave/drop.
- Look in: `app/components/audience/AudienceUploadFileStep.tsx`
- Existing tests: test/ui/audience-uploader.test.tsx (drag-active lifecycle + existing drop)
- Missing tests: none — new test landed with the fix
- Done when: Dragging shows clear highlight; Leaving/dropping removes highlight; Keyboard/picker unchanged
- Tracker: Verify on dev and close.

### [#1185](https://github.com/chester-hill-solutions/callcaster/issues/1185) Platform side analytics
- Verdict: **Verify and close** · Size: XS-S · Risk: low · Labels: devops/admin · Assignee: none · Updated: 2026-08-07
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

### [#1150](https://github.com/chester-hill-solutions/callcaster/issues/1150) Webhook signature fallback + unscoped cross-tenant RPCs on the call-screen apparatus
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-08-07
- Recommended title: **chore(security): verify and close completed call-screen tenant-isolation audit**
- Both gap classes are fixed by PR #1151: webhook routes now fail closed on missing CallSid, and dequeue_contact / create_outreach_attempt gained workspace predicates (migration 20260807120000). Audio-drop lookup is workspace-scoped.
- Current behavior: acd-router routes reject missing CallSid; RPCs require workspace; audiodrop scoped.
- Root cause: Resolved; issue left open because Closes # did not fire on dev merge.
- Resolution: Link PR #1151 and close. No code change.
- Look in: `app/routes/api+/acd-router.action.server.ts`, `client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql`, `app/routes/api+/audiodrop.action.server.ts`
- Existing tests: test/scope-dequeue-and-outreach-attempt.integration.test.ts; test/audiodrop.test.ts
- Missing tests: none
- Done when: Security/DB regression tests pass; Issue closed with PR linked
- Tracker: Close.

### [#1069](https://github.com/chester-hill-solutions/callcaster/issues/1069) E2E seed's 'Empty Workspace' isn't empty, so the fresh-workspace onboarding redirect has no fixture coverage
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-07-20
- Recommended title: **Rename the numbered E2E 'Empty Workspace' fixture and close the superseded redirect gap**
- The claimed coverage gap no longer exists: a separate onboarding fixture seeds a truly empty workspace and rbac.spec.ts covers the owner/admin redirect. The numbered 'Empty Workspace' is intentionally used by voicemail E2E.
- Current behavior: seed-data.mjs has a fresh onboarding fixture; rbac.spec.ts asserts the redirect; the numbered empty fixture is used by voicemail tests.
- Root cause: Superseded; misleading fixture name remains.
- Resolution: Close the redirect gap; optionally rename empty -> numberedEmpty/zeroCampaign to remove the misleading name.
- Look in: `scripts/e2e/seed-data.mjs`, `scripts/e2e/seed-database.mjs`, `e2e/specs/rbac.spec.ts`
- Existing tests: e2e/specs/rbac.spec.ts (redirect coverage)
- Missing tests: fixture-contract test for accurate names
- Done when: Redirect tests remain; Fixture renamed accurately; Voicemail tests keep using it
- Tracker: Close; old enrichment pointed at the wrong middleware.

---

## Needs reproduction — 5

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

### [#1344](https://github.com/chester-hill-solutions/callcaster/issues/1344) call work area section outline curve doesn't match underlying element curve. extra visible on dark mode
- Verdict: **Needs reproduction** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-26
- Recommended title: **Verify call-panel border clipping in dark mode**
- Reported outline-curve mismatch in the call area, extra visible in dark mode. Static radius arithmetic is actually correct: outer 16px radius + 2px border matches a 14px inner radius.
- Current behavior: call-panel-classes.ts rounded-2xl border-2; status bar rounded-[14px]; the math lines up.
- Root cause: Cannot confirm a defect from code; likely border color/anti-aliasing/seam or a stale screenshot.
- Resolution: Reproduce in Chromium + Safari dark mode at 1x and 2x. If visible, adjust only callPanelShellClass or status-bar background clipping.
- Look in: `app/components/call/call-panel-classes.ts`, `app/components/call/CallScreen.CallArea.tsx`
- Existing tests: test/ui/call-screen-callarea.test.tsx
- Missing tests: dark-mode screenshot test
- Done when: No visible corner seam; Light/dark at 1x and 2x checked
- Tracker: Needs a screenshot reproduction before styling changes; coordinate with #1338/#1313.

### [#1224](https://github.com/chester-hill-solutions/callcaster/issues/1224) Voicemail gets captured but not sent to email address
- **IN PROGRESS** · Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-08-26
- Recommended title: **ops(voicemail): diagnose why CHS workspace voicemail email still fails while another workspace works**
- The SigV4 7-day presign fix is deployed, yet voicemail email works on Heino's workspace but not CHS. The app marks the call processed as soon as Resend accepts, so delivery failures are invisible.
- Current behavior: email-vm route: global sender, checks only result.error, writes processed marker immediately, no Resend delivery/bounce/suppression tracking. Per-number inbound_action holds the recipient.
- Root cause: Likely Resend accepted but recipient suppressed/bounced/delayed/filtered; also possible: stale per-number inbound_action, conflicting higher-priority routing (queue/IVR/handset win over voicemail), wrong-environment Twilio callback, or workspace credential mismatch.
- Resolution: Diagnostic: trace one fresh CallSid -> is voicemail visible in the app? (yes -> Resend delivery state; no -> routing/callback/credentials). Check inbound_action per CHS number, routing precedence, Twilio request inspector, and Resend events. Then persist the Resend email id + delivery state and reject invalid inbound_action at callback time.
- Look in: `app/routes/api+/email-vm.action.server.ts`, `app/lib/inbound-voicemail-twiml.server.ts`, `app/routes/workspaces+/$id/voicemails/setup.action.server.ts`, `app/routes/api+/inbound.action.server.ts`, `shared/inbound-routing-presets.ts`
- Existing tests: test/email-vm.route.test.ts (acceptance/retry/SigV4)
- Missing tests: delivery vs accepted states; suppressed/bounced/delayed; invalid inbound_action rejected (currently allows to:''); setup clears higher-priority routing
- Done when: Fresh voicemail tracked end-to-end; Delivery state persisted; Invalid inbound_action rejected; Routing precedence visible
- Tracker: Do not close; production incident with a defined diagnostic tree.

### [#1341](https://github.com/chester-hill-solutions/callcaster/issues/1341) When dialing, there is a tone, but it gets cut off. Keep the tone it's good feedback
- Verdict: **Needs reproduction** · Size: M · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-08-26
- Recommended title: **Keep dialing feedback active until the customer leg connects or ends**
- The tone heard while dialing cuts off early. DTMF code is unrelated — the likely source is the Twilio Voice SDK outgoing sound or customer-leg ringback, which can stop when the agent leg accepts while the customer still rings.
- Current behavior: Agent leg connects first, then the customer child leg rings; SDK outgoing sound may stop at agent-leg accept. Suspicious: device.audio.outgoing(muted) is wired to microphone mute.
- Root cause: Unknown without browser/Twilio reproduction; plausible misuse of device.audio.outgoing.
- Resolution: Identify the sound source with SDK event logging; remove any device.audio.outgoing misuse; if needed, add controlled ringback keyed to customer-leg dialing that stops on connect/terminal.
- Look in: `app/hooks/call/useCallHandling.ts`, `app/hooks/call/useCampaignCallFlow.ts`, `app/lib/dtmf.ts`
- Existing tests: test/ui/campaign-call-flow-display-state.test.ts
- Missing tests: outgoing-feedback lifecycle; teardown on cancel/fail/connect/unmount
- Done when: Feedback starts once per attempt; Continues while queued/ringing; Stops on connect/terminal; No nodes remain after teardown
- Tracker: Reproduce with real Twilio audio before changing audio code; shares infra with #1339.

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

### [#1321](https://github.com/chester-hill-solutions/callcaster/issues/1321) Phone number search says "Ajaxpickering" is this correct?
- Verdict: **Needs reproduction** · Size: S · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-08-25
- Recommended title: **test(numbers): reproduce and normalize malformed Twilio locality labels**
- City search showed 'Ajaxpickering'. CallCaster does not concatenate that: search passes Twilio friendlyName/region/locality through unchanged and joins locality + region with ', '.
- Current behavior: numbers-search.server.ts passes provider fields through; Name column shows friendlyName; Location joins locality, region.
- Root cause: Provider data, not CallCaster concatenation.
- Resolution: Capture the exact Twilio payload and confirm whether the screenshot shows friendlyName or locality; normalize narrowly, never alter valid locality names.
- Look in: `app/components/phone-numbers/NumberPurchase.columns.tsx`, `app/lib/numbers-search.server.ts`, `app/components/phone-numbers/NumberPurchase.constants.ts`
- Existing tests: test/numbers-search.server.test.ts
- Missing tests: fixture reproducing the reported payload; location display test
- Done when: Fixture reproduces the value; UI separates provider name from locality/region
- Tracker: Reproduce with a captured payload before changing anything.

---

## Needs decision — 7

Product, security, or operations decision required before implementation can be scoped.

### [#1162](https://github.com/chester-hill-solutions/callcaster/issues/1162) change default branch to dev for some DevExp improvements?
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-08-26
- Recommended title: **chore(repo): make a QA branch the protected default and align CI triggers**
- Latest requirement: a lowercase 'qa' default branch with dev -> qa -> production promotion, so 'close #<n>' chains persist and gh defaults to the testing branch. Earlier threads debated dev/UAT.
- Current behavior: Default branch is master; CI/E2E push triggers omit dev; Railway IaC models dev -> production; platform guide says master is default.
- Root cause: Branch model not decided; admin change.
- Resolution: Decide the branch model (dev -> qa -> production), update workflow triggers/docs, add branch protection, then change the GitHub default. No unit tests; verify with GitHub API/PR base behavior.
- Look in: `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `docs/AGENT-PLATFORM-GUIDE.md`, `AGENTS.md`
- Existing tests: n/a — repo admin
- Missing tests: verify via GitHub API after change
- Done when: QA branch protected + default; CI/E2E run on dev + promotion paths; Production protected
- Tracker: Decision pending; coordinate with assignee wra-sol.

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

### [#1339](https://github.com/chester-hill-solutions/callcaster/issues/1339) Call Settings should have a test microphone and test speaker option
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-08-26
- Recommended title: **Add microphone and speaker tests to Call Settings (behavior to decide)**
- Call Settings has mic/speaker selection and mute but no test controls. Product must choose the microphone behavior (live meter vs record/play) and speaker test, plus Safari output-routing fallback.
- Current behavior: Header provides device selects + mute via useCallAudioControls; no level meter/loopback/sample/test sound.
- Root cause: Feature decision not yet made.
- Resolution: Decide behavior, then implement: mic live meter or record-and-play; speaker generated test sound routed to selected output; clear unsupported-browser fallback; release tracks/nodes on close.
- Look in: `app/components/call/CallScreen.Header.tsx`, `app/hooks/call/useCallAudioControls.ts`, `app/hooks/call/audio-device-selection.ts`
- Existing tests: test/ui/call-screen-header.test.tsx; test/ui/audio-device-lifecycle.test.tsx
- Missing tests: start/stop mic test; track/node cleanup; speaker routes to output; unsupported fallback
- Done when: Verify mic without a call; Play test sound through speaker; Resources released on close
- Tracker: Decision first; shares audio infra with #1341.

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

### [#1152](https://github.com/chester-hill-solutions/callcaster/issues/1152) owners currently need 2fa. why?
- Verdict: **Needs decision** · Size: M · Risk: high · Labels: ux, needs-repro · Assignee: none · Updated: 2026-08-26
- Recommended title: **Decide and document owner/admin MFA enforcement scope**
- Owners currently require 2FA. This is deliberate policy (privileged roles are gated), not a Twilio-only side effect. Decide global privileged-role MFA vs step-up MFA.
- Current behavior: two-factor.server.ts marks owner/admin privileged; workspace middleware enforces enrollment; privileged role assignment requires MFA; privileged users cannot disable it.
- Root cause: Intentional policy; the 'why' needs to be decided/documented.
- Resolution: Security-policy decision; apply the chosen policy to middleware, role assignment, API guards, and disable rules; explain to users in the UI.
- Look in: `app/lib/two-factor.server.ts`, `app/lib/workspace-middleware.server.ts`
- Existing tests: test/two-factor.server.test.ts (global enforcement)
- Missing tests: per-policy matrix (owner/admin/member/api-key/sudo)
- Done when: Policy chosen and documented; All enforcement surfaces use it; UI explains why
- Tracker: The 'only needed for Twilio' premise is unsupported; this is a security decision.

### [#1320](https://github.com/chester-hill-solutions/callcaster/issues/1320) Transfer phone number from old CHS workspace to new CHS workspace if possible
- Verdict: **Needs decision** · Size: S-M · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-08-25
- Recommended title: **ops(twilio): migrate one CHS number with callback and database reconciliation**
- Transfer a Twilio number from the old CHS workspace to the new one. This is an operational migration (Twilio-side), not a product feature; no number-transfer action exists.
- Current behavior: Settings support routing/release/purchase/caller-id only; no transfer workflow.
- Root cause: Not a product gap; one-off infra task.
- Resolution: Run a one-off runbook: confirm ownership, transfer in Twilio, insert/update destination workspace row, repoint callbacks/messaging service, verify inbound/outbound, remove old row, record rollback + evidence.
- Look in: `app/routes/workspaces+/$id/settings/numbers.action.server.ts`, `app/lib/platform-workspace-numbers.server.ts`
- Existing tests: n/a — operational
- Missing tests: before/after evidence, rollback steps
- Done when: Ownership confirmed before transfer; Voice/SMS/callbacks work in new workspace; Single owner after migration
- Tracker: Ops task with rollback plan; may depend on #1329 account ownership.

### [#1313](https://github.com/chester-hill-solutions/callcaster/issues/1313) Calling Join and Leave should be explicit actions. Remove side bar and all other UI details
- Verdict: **Needs decision** · Size: L · Risk: high · Labels: ux · Assignee: @wra-sol · Updated: 2026-08-19
- Recommended title: **Define and implement focused Join/Leave mode for campaign calling**
- Join is already explicit before the call route; Leave is in the actions menu. 'Remove side bar and all other UI details' needs a defined focused-mode design, and can conflict with required queue/script/disposition/settings controls.
- Current behavior: Join gated by CampaignInstructions; Leave in header menu; workspace sidebar and campaign chrome remain on the call route; workbench intentionally shows queue/script/controls.
- Root cause: Feature decision about what a focused calling mode contains.
- Resolution: Decide the control set; if approved, hide workspace/campaign navigation only on the call route while preserving settings access (#1339) and safe teardown.
- Look in: `app/routes/workspaces+/$id.tsx`, `app/routes/workspaces+/$id/campaigns/$selected_id.route.tsx`, `app/components/campaign/home/CampaignHomeScreen/CampaignInstructions.tsx`, `app/components/call/CallScreen.Workbench.tsx`
- Existing tests: test/ui/call-screen-workbench.test.tsx; test/ui/call-screen-header.test.tsx (indirect)
- Missing tests: focused route hides nav; leave teardown; browser-back behavior
- Done when: Product defines remaining controls; Join explicit before resources start; Leave always visible + safe teardown; Nonessential nav hidden on call route
- Tracker: Decide before #1343/#1314/#1338/#1344 layout work.

---

## Blocked / split first — 8

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

### [#1329](https://github.com/chester-hill-solutions/callcaster/issues/1329) Twilio environment program - consolidated roadmap (IaC controller, accounts, cost, testing)
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: enhancement, devops/admin · Assignee: none · Updated: 2026-08-26
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
- Look in: `docs/interactive-sms-delivery-plan.md`, `docs/interactive-sms-build-tracking.md`, `#1269`, `#1270`, `#1271`, `#1272`
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
- Existing tests: none
- Missing tests: unknown profile rejection; CSV behavior-field rejection; profile-to-provider contract
- Done when: Clients submit only a profile id; Unknown/unauthorized rejected server-side; CSV cannot define outcomes; Profile reaches provider unchanged
- Tracker: Child of #1157; blocked by #1328.

---

## Duplicates — 7

Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.

### [#1352](https://github.com/chester-hill-solutions/callcaster/issues/1352) Campaign window opens at 3:05 yet the singular contact got the message at 3:15
- Verdict: **Duplicate** · Size: S-M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-08-26
- Duplicate of: [#1351](https://github.com/chester-hill-solutions/callcaster/issues/1351) — fix(sms): align deferred dispatch and ETA to the next send-window opening
- Recommended title: **fix(sms): align deferred dispatch and ETA to the next send-window opening**
- Same send-window scheduling contract as #1351 (delivery at 3:15 vs window at 3:05).
- Current behavior: Fixed 15-min worker retry defers past the window opening.
- Root cause: Same root as #1351: no exact next-window scheduling; ETA ignores window.
- Resolution: Fold into #1351 implementation.
- Look in: `app/lib/worker/handlers/campaign.server.ts`, `app/lib/campaign-send-window.ts`
- Existing tests: test/campaign-dispatch-worker.test.ts
- Missing tests: exact 3:05 successor
- Tracker: Merge into #1351 (already parent).

### [#1332](https://github.com/chester-hill-solutions/callcaster/issues/1332) dark mode opt out info box has black text
- Verdict: **Duplicate** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-26
- Duplicate of: [#1335](https://github.com/chester-hill-solutions/callcaster/issues/1335) — design(feedback): standardize page-level feedback with shared Alert variants and one themed toaster
- Recommended title: **Use the shared warning Alert for the chat opt-out banner**
- ChatOptOutBanner converted to the shared warning Alert (role=status) under #1335 slice 2, resolving the dark-mode contrast concern. Ready to verify and close.
- Current behavior: Migrated: banner uses Alert variant=warning with semantic tokens instead of raw amber classes.
- Root cause: Standardization residue, not a live contrast bug.
- Resolution: Resolved under #1335 slice 2; verify the banner in light/dark and close.
- Look in: `app/components/chats/ChatOptOutBanner.tsx`, `app/components/ui/alert.tsx`
- Existing tests: test/ui/components-chats-contact.test.tsx (passes)
- Missing tests: dark-theme contrast test
- Tracker: Verify and close as duplicate of #1335.

### [#1312](https://github.com/chester-hill-solutions/callcaster/issues/1312) dark mode red error box can be the default error box no need to change for dark mode (true for all error/info boxes)
- Verdict: **Duplicate** · Size: S-M · Risk: low · Labels: design · Assignee: none · Updated: 2026-08-26
- Duplicate of: [#1335](https://github.com/chester-hill-solutions/callcaster/issues/1335) — design(feedback): standardize page-level feedback with shared Alert variants and one themed toaster
- Recommended title: **Replace remaining hand-built feedback boxes with semantic shared Alerts**
- Dark-mode error-box residue: the three confirmed hand-built red divs (CallScreen.Layout, workspaces+/$id, MessageSettings) and ChatOptOutBanner were converted to shared Alert variants under #1335 slice 2. Ready to verify and close.
- Current behavior: Migrated: CallScreen ErrorBanner, workspace depleted/low-credit banners, MessageSettings media error/success, ChatOptOutBanner all use shared Alert variants with semantic contrast.
- Root cause: Standardization residue.
- Resolution: Resolved under #1335 slice 2; verify the migrated surfaces in light/dark and close.
- Look in: `app/components/call/CallScreen.Layout.tsx`, `app/routes/workspaces+/$id.tsx`, `app/components/campaign/settings/MessageSettings.tsx`, `app/components/chats/ChatOptOutBanner.tsx`, `app/components/ui/alert.tsx`
- Existing tests: workspace-skip-link, message-settings, components-chats-contact UI tests pass
- Missing tests: dark-theme contrast check
- Tracker: Verify and close as duplicate of #1335.

### [#1314](https://github.com/chester-hill-solutions/callcaster/issues/1314) Calling Screen pushes out of the VW
- Verdict: **Duplicate** · Size: M · Risk: medium · Labels: design · Assignee: @wra-sol · Updated: 2026-08-19
- Duplicate of: [#1343](https://github.com/chester-hill-solutions/callcaster/issues/1343) — fix(call): prevent call workbench overflow inside the workspace sidebar layout
- Recommended title: **Merge into #1343: constrain the call workbench to available width**
- Exact duplicate of #1343 (viewport overflow).
- Current behavior: Forced 1172px 3-column min activated by viewport breakpoint inside sidebar layout.
- Root cause: Same as #1343.
- Resolution: Merge into #1343 and implement one container-aware responsive layout.
- Look in: `app/components/call/CallScreen.Workbench.tsx`
- Existing tests: test/ui/call-screen-workbench.test.tsx
- Missing tests: real viewport overflow assertions
- Tracker: Close as duplicate of #1343.

### [#1309](https://github.com/chester-hill-solutions/callcaster/issues/1309) When workspace dropdown gets too long it can get cut off by the screen
- Verdict: **Duplicate** · Size: XS · Risk: low · Labels: design, ux · Assignee: @sai-sy · Updated: 2026-08-19
- Duplicate of: [#1310](https://github.com/chester-hill-solutions/callcaster/issues/1310) — design(nav): replace the desktop workspace dropdown with an accessible searchable combobox
- Recommended title: **Bound and scroll the workspace results list under #1310**
- Long workspace dropdown gets cut off by the screen. Strict subset of the #1310 combobox work.
- Current behavior: Desktop DropdownMenuContent has no max-height/overflow; mobile already scrolls.
- Root cause: Same as #1310.
- Resolution: Add the viewport-safe list requirement to #1310, then close.
- Look in: `app/components/layout/Navbar.tsx`
- Existing tests: test/ui/navbar-workspace-picker.test.tsx
- Missing tests: many-workspace scroll test (under #1310)
- Tracker: Close as duplicate of #1310.

### [#1292](https://github.com/chester-hill-solutions/callcaster/issues/1292) if the call recipient hangs up, I get call completed but still the option to hang up
- Verdict: **Duplicate** · Size: XS · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-08-17
- Duplicate of: [#1342](https://github.com/chester-hill-solutions/callcaster/issues/1342) — feat(call): show a confirmed 'Call back' action after a completed call
- Recommended title: **Merge into #1342: verify remote hangup removes call-only controls and preserves disposition context**
- Recipient hangup -> 'call completed' but stale Hang Up option; contact info disappears. The stale Hang Up symptom is likely already fixed by terminal handling; the remaining ask is finished-contact retention + callback.
- Current behavior: Terminal status sends HANG_UP and disconnects the SDK call; Hang Up hides; contact info renders from nextRecipient which can advance/null out.
- Root cause: Partially resolved; finished-contact retention and callback behavior remain under #1342.
- Resolution: Merge remaining terminal-action work into #1342; optionally keep finished contact rendered from questionContact.
- Look in: `app/components/call/CallScreen.CallArea.tsx`, `app/hooks/call/useCallHandling.ts`, `app/hooks/call/useCampaignCallFlow.ts`
- Existing tests: test/ui/campaign-call-flow-display-state.test.ts; test/ui/call-screen-callarea.test.tsx
- Missing tests: integrated remote-hangup asserts Hang Up gone; finished contact retained for disposition
- Tracker: Close as duplicate of #1342; callback tracked there.

### [#1193](https://github.com/chester-hill-solutions/callcaster/issues/1193) Test a campaign with controlled recipients
- Verdict: **Duplicate** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-08-08
- Duplicate of: [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157) — epic(testing): controlled synthetic campaign audiences
- Recommended title: **test(e2e): run one campaign against a controlled synthetic audience**
- User story for the controlled-recipient campaign test. Near-duplicate of parent epic #1157; implement as the final acceptance journey after #1192/#1328.
- Current behavior: Same gaps as #1157 (generic seed, no scenario selection, no server-side synthetic provider).
- Root cause: Dependent on #1328; redundant with #1157.
- Resolution: Close as duplicate of #1157, or keep as the manual acceptance test for #1157/#1192/#1328.
- Look in: `e2e/fixtures/seed.ts`, `app/components/audience/AudienceUploader.tsx`
- Existing tests: none
- Missing tests: controlled-campaign journey + metric assertions
- Tracker: Close as duplicate of #1157.
