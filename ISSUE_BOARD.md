# CallCaster — Open Issue Board for Agents

Reviewed at `dev@b2c9f891` · 294 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

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

## Fix now — 1

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#2459](https://github.com/chester-hill-solutions/callcaster/issues/2459) The Access form shows two success notices for one recovery click
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-07
- One click was measured as one POST, one membership update and two notices. A local existing-panel repair is tested; final browser approval remains pending.
- Current behavior: Local 784265970c6d40f09667938c80a4909e22ff073c on older dev@8672297b1b3a97dcf2744b31e80f421b860a1da0 uses TabsContent around the admin Outlet. Six real parent/Access Router cases, full local CI, 1,001 actual PostgreSQL cases and both source reviews pass. There is no PR or candidate browser acceptance.
- Root cause: The routed Access child was rendered in both the React Aria Tabs collection builder and visible tree because it lacked a TabPanel boundary. The measured original full-app case has one request and one write, so it is a presentation defect.
- Resolution: Complete the explicitly approved isolated browser role tests, require one notice per result and zero page-landmark movement at phone/desktop widths, then refresh onto current dev and repeat full gates/reviews before one atomic PR. Preserve repeat messages, pending controls, owner safety and the single root host.
- Look in: `app/routes/admin+/workspaces/$workspaceId.route.tsx`, `app/components/ui/tabs.tsx`, `app/hooks/utils/useActionFeedback.ts`, `app/root.tsx`
- Missing tests: Candidate full-app notice/request/write counts, repeat Owner action, sole-owner refusal and phone/desktop landmarks await role-test approval. Local test/ui/admin-access-result-notices.test.tsx has six passing Router cases but is not on dev.
- Done when: One recovery click produces one result notice after loader revalidation. Measure request/write counts before claiming a duplicate mutation or repairing that boundary.; A later valid action still produces its own result, including the same message. Error and warning results remain visible and are not suppressed by a previous success.; Navigation, revalidation and ordinary renders do not replay a handled result. Preserve pending controls, owner safety, target enrollment and saved data.; Success/error notice appearance, update and dismissal do not move page landmarks at phone and desktop widths. Keep the shared component library and single root host.; Add an executed failing regression with valid controls, then prove restored behavior. Pass full local CI, independent source reviews, applicable exact-head remote gates and deployments before an atomic merge. Keep deployed release acceptance separate.
- Tracker: Keep Fix now for the unmerged duplicate presentation repair. Automatic review rejected the fixture role change; no SQL, API or alternate browser bypass was used. Candidate base refresh, publication and deployed acceptance remain.

---

## Verify and close — 102

Likely already fixed or working as designed. Run the listed verification, then close without new code.

### [#2144](https://github.com/chester-hill-solutions/callcaster/issues/2144) Q43 regulatory address requirements are fetched, resolved and unit-tested, then never applied — the purchase path returns a bare 500
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-19
- Recommended title: **Q43 regulatory address requirements are applied at the purchase boundary**
- Implemented in PR #2468 (1a71ab1e, on dev). The purchase path resolves the number's regulatory address requirement before provider creation: it re-reads the exact inventory, returns 409 when the number is gone, lists the purchasing account's addresses and resolves the requirement. A missing or non-qualifying address returns 400 with the address-specific message and the reservation is cancelled. A compliant address is sent as AddressSid, distinct from EmergencyAddressSID. The search row shows the requirement badge before the click.
- Current behavior: Verified on dev@8b786af3, 19 October 2026. 23 regulatory-address integration cases, 27 purchase/credit cases and 4 rendered badge cases pass. Removing the resolve call from the purchase path fails 13 of the 23 address cases and lets creation proceed without an address.
- Root cause: The original purchase path called incomingPhoneNumbers.create with no addressSid and mapped the provider rejection to a bare 500. That path is gone: the resolve runs first and its 400/409 is returned with the reservation cancelled.
- Resolution: No source work remains. Verify live provider address/locality and bundle acceptance during release checks — country matching alone cannot prove every local provider rule — then promote through the normal release process.
- Look in: `app/lib/number-purchase.server.ts:394 (resolve before create; cancel on failure; AddressSid on success)`, `app/lib/number-regulatory-address.server.ts (resolveNumberPurchaseAddress, numberPurchaseAddressRejection, addressFailure)`, `app/lib/number-address-requirements.ts (resolveAddressForRequirement)`, `app/routes/api+/numbers.action.server.ts:54 (legacy route maps the address result)`, `app/components/phone-numbers/NumberPurchase.columns.tsx (search-row badge)`
- Existing tests: test/integration-db/number-regulatory-address.test.ts: 23 cases through the installed SDK boundary and real Postgres; test/integration-db/number-purchase-credits.test.ts: 27 purchase, credit and recovery cases; test/ui/number-address-badge.test.tsx: 4 rendered search-row cases
- Missing tests: Live provider address/locality acceptance for a real local purchase (needs a paid Twilio purchase); Deployed reproduction of a provider address rejection
- Done when: A number with addressRequirements local and no validated address returns 400 with the address-specific message, and no number is created; With a compliant address, the purchase succeeds and passes addressSid; A foreign requirement is satisfied by a foreign address; The badge is visible on the search row; No purchase path returns 500 for an address requirement
- Tracker: Lane is verify-close: source and regressions landed in PR #2468, so do not rebuild them. Only deployed provider acceptance and release promotion remain, and neither can run without a paid Twilio purchase. Close on promotion.

### [#2166](https://github.com/chester-hill-solutions/callcaster/issues/2166) Call audio depends on a best-effort Twilio copy — recover the ones that failed, then remove the Twilio playback fallback
- **IN PROGRESS** · Verdict: **Verify and close** · Size: M-L · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-19
- Call History shows unavailable stored playback; voicemail retries retain one deterministic recording key and metadata retention is recorded.
- Current behavior: PR #2451 merged into dev at c08f8b0f256f758ca445219af897660e9142c5b1. Call History shows unavailable stored playback; voicemail retries retain one deterministic recording key and metadata retention is recorded. Source reviews, full local gates, actual database regressions, applicable remote checks and exact-head preview deployments passed. These receipts do not complete remaining deployed acceptance or default-branch promotion.
- Root cause: The original design treated the copy as best-effort and swallowed the failure, which made an unrecoverable data loss look like success. A second, independent problem: recording_sid was written AFTER the copy, so a failed copy left no searchable row — the failure was unrepresentable in the database. #2169 fixed the ordering, which is what made the repair sweep's find query possible.
- Resolution: Source fix is merged into dev. Complete the remaining deployed acceptance and release verification stated in the current native issue before default-branch promotion and closure.
- Look in: `app/components/calls/CallLogTable.tsx`, `docs/CHANGELOG.md`, `docs/adr/0015-domain-ids-as-pk.md`, `test/integration-db/inbound-voicemail-recipient.test.ts`, `test/ui/call-log-table.test.tsx`
- Existing tests: test/integration-db/inbound-voicemail-recipient.test.ts; test/ui/call-log-table.test.tsx
- Missing tests: Deployed acceptance and release QA remain; current native issue separates those from passing source, local and remote tests.
- Done when: Failure propagation and the repair sweep remain covered by their existing regression tests.; Missing stored playback has a clear unavailable state and no raw Twilio recording link.; Repeated deliveries for one voicemail recording use one deterministic object key and the documented overwrite behavior.; An explicit recording_url retention decision is recorded.
- Tracker: PR #2451 is merged into dev; native issue remains OPEN/on-dev. Keep provider/candidate verification and release promotion visible; do not repeat completed implementation.

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

### [#1982](https://github.com/chester-hill-solutions/callcaster/issues/1982) Receipts: support email should be contact@callcaster.ca
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: @sai-sy · Updated: 2026-10-18
- Receipts currently carry a wrong/absent support contact; use contact@callcaster.ca.
- Current behavior: Receipt builder contact line differs from the canonical support address.
- Resolution: Swap the contact line to contact@callcaster.ca on the receipt.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts contact@callcaster.ca
- Done when: Receipts say contact@callcaster.ca

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

### [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) Restore the password recovery email journey
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-17
- The reset email reaches the password form with its token; request feedback is generic and both verification failure paths reach sign-in. Deployed checks remain.
- Current behavior: Merged to dev in PR #2279 at 9aa2025e. /remember uses configured BASE_URL with /reset-password, actual issued email links retain tokens through the password form and change the password; generic request feedback, expiry/replay rejection and limits remain. Both verification failures return to registered sign-in and password completion feedback is accurate. All 33 focused Node and four rendered UI cases passed, nine mutations failed, full local CI passed 5,022 Vitest and 22 Bun tests. All remote gates passed on 2303257c; issue-on-dev moved one item. Wider redirect guard remains separate in #2278. Deployed functional verification and promotion remain.
- Root cause: The UI passed an email verification callback as the final password reset page. That callback required other parameters and redirected to an absent route; request success feedback was disabled.
- Resolution: Verify the emailed journey, generic request feedback, expired and reused tokens, actual password sign-in and callback failures on deployed dev, then promote before closure. The repository-wide literal redirect guard is separate in #2278.
- Look in: `app/routes/remember.action.server.ts`, `app/routes/remember.tsx`, `app/routes/reset-password.tsx`, `app/routes/reset-password.loader.server.ts`, `app/routes/reset-password.action.server.ts`, `app/routes/api+/auth/callback.loader.server.ts`, `app/routes/auth/confirm.loader.server.ts`
- Existing tests: test/password-recovery-journey.test.ts (installed Better Auth, actual email sender, auth loader, reset loader/action, sign-in, expiry, replay, configured host and throttling); test/verification-callbacks.test.ts (both missing/rejected callbacks and success cookie/return controls); test/ui/password-recovery-feedback.test.tsx (real rendered forms and action feedback); Existing remember, reset, email sender, auth-instance and callback tests
- Missing tests: Deployed password recovery and callback verification before promotion.
- Done when: Actual issued link reaches the password form with the original token and the action changes the password.; Known and unknown emails receive the same generic acceptance feedback.; Verification failures reach a real sign-in route without carrying tokens; success keeps cookies and safe return paths.; Password completion feedback names the correct credential.; Existing expiry, replay rejection and request/reset limits remain.; Repository-wide redirect guard is tracked separately in #2278; deployed verification and promotion precede closure.
- Tracker: Source fix is in this change. Verify deployed recovery and failure paths, then promote and close.

### [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) Receipts: state how many credits were bought
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: @sai-sy · Updated: 2026-10-17
- Receipt (billing/receipt.route.tsx) should say how many credits the purchase covered, not just the amount.
- Current behavior: Receipt builder shows amount/line items; no credit quantity line.
- Resolution: Add a credit-quantity line to the receipt render (from the ledger row / stripe session metadata). Contact #1982/#1983 for the same receipts surface.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts credit-quantity line
- Done when: Receipt states how many credits were bought

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

### [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) IVR key press does not interrupt the current audio block (prompt sits outside the Gather)
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-15
- Shipped on dev in PR #1851 (51240b0b). The prompt now renders inside <Gather> via the shared appendBlockResponse seam, so a keypad press interrupts playback.
- Current behavior: When a block maps options, the gather is built first and the prompt is rendered into it; a DTMF press follows the mapped branch immediately.
- Root cause: handleAudio wrote the prompt as a sibling before the sibling <Gather>.
- Resolution: Verify on the review env that pressing a key during a block prompt stops the prompt and navigates, for outbound and inbound IVR. Close on master promotion. Do not reimplement.
- Look in: `app/lib/ivr-block-runtime.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server.ts`
- Existing tests: test/ivr-block.route.test.ts; test/inbound-ivr-block.route.test.ts; test/ivr-block-runtime.test.ts
- Done when: Pressing a key while a block prompt is playing stops the prompt and navigates; Applies to outbound campaign IVR and inbound IVR
- Tracker: PR #1851 merge 51240b0b is on dev, not yet master. Closes on master promotion.

### [#1856](https://github.com/chester-hill-solutions/callcaster/issues/1856) IVR advances when the caller speaks on a keypad-only step
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-15
- Shipped on dev in PR #1872 (725d77df). The shared gather builder now gathers DTMF only unless the block declares a vx-any spoken option (ivrStepGathersSpeech).
- Current behavior: Keypad-only steps build <Gather input=['dtmf']> (numDigits=1 for single-key menus). Speech is collected only for a vx-any option.
- Root cause: Every option block gathered input ['dtmf','speech']; any speech longer than two characters advanced the call.
- Resolution: Verify on the review env that speaking at a DTMF menu waits for a keypress/timeout and an explicit speech step still routes speech. Close on master promotion. Do not reimplement; #1862 is a separate open follow-up.
- Look in: `app/lib/ivr-gather.server.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server.ts`
- Existing tests: test/ivr-block.route.test.ts; test/inbound-ivr-block.route.test.ts; test/ivr-gather.test.ts
- Done when: Speaking at a DTMF menu does not advance the call; An explicit speech / vx-any step still captures and routes speech
- Tracker: PR #1872 merge 725d77df is on dev, not yet master. Closes on master promotion.

### [#1791](https://github.com/chester-hill-solutions/callcaster/issues/1791) SMS dispatch continues sending after the campaign window closes mid-batch
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: @sai-sy · Updated: 2026-10-15
- PR #1796 (0188cea8) added campaign-window checks before provider requests, including after asynchronous preparation.
- Current behavior: When the campaign window closes mid-batch, new sends stop and unsent contacts remain queued.
- Resolution: Verify the closing-boundary behavior on dev without sending outside the test window.
- Look in: `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: test/campaign-sms-dispatch-window.test.ts
- Missing tests: Deployed closing-boundary verification.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) Pass the live caller-ID verification status to the onboarding verification sheet
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-10-15
- From onboarding the verification sheet keeps showing 'Verification pending' after the number is verified; Settings shows 'Number verified' because it passes the live status.
- Current behavior: OnboardingFirstNumberStep renders CallerIdVerificationDialog without a status prop, so the sheet defaults to pending. Settings passes status derived from capabilities.verification_status.
- Root cause: The live-status wiring added for Settings (#1740) was never added to the onboarding render.
- Resolution: Compute the live verification status from callerIdNumbers and pass it to CallerIdVerificationDialog in OnboardingFirstNumberStep, mirroring settings/numbers.route.tsx.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/settings/numbers.route.tsx`, `app/components/phone-numbers/CallerIdVerificationDialog.tsx`
- Existing tests: test/ui/caller-id-verification-dialog.test.tsx; test/ui/onboarding-first-number-flow.test.tsx
- Missing tests: Onboarding dialog shows 'Number verified' after the number's verification_status flips to success
- Done when: Completing verification from onboarding flips the sheet to 'Number verified' with no reload; A failed verification still shows 'Verification failed'; Settings behaviour is unchanged
- Tracker: Exact fix: pass the live status the way Settings already does.

### [#1883](https://github.com/chester-hill-solutions/callcaster/issues/1883) IVR no-input editor panel + inbound mirror
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-15
- IMPLEMENTED on dev (#1992 merged 2026-09-22). Runtime+outbound half of #1937 shipped: ...
- Current behavior: Editor: ScriptBlockEditor.IvrStep.tsx has mode/speech/recording/voice controls but no no-input panel; the response rows (IvrResponses.tsx) only set option.next/label. Inbound: inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts:50-69 findNextStep ignores noInput; null userInput falls through to linear next/hangup; renderTerminalTarget (:71-123) has no noInput branch.
- Root cause: PR #1937 kept the editor panel and inbound twin out to stay atomic; the wire fields have no producer.
- Resolution: Editor: add per-step controls in ScriptBlockEditor.IvrStep.tsx writing block.noInput {action,pageId,blockId,maxReplays} + gatherTimeoutSeconds (defaults unchanged when unset). Inbound: mirror the outbound no-input branching into the inbound response route with a CALL-scoped replay store (no outreach attempt exists inbound; key by call/recurring session) and reuse resolveNoInputTarget + DEFAULT_NO_INPUT_MAX_REPLAYS. Fold #1843 or close it as duplicate.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-gather.server.ts`
- Existing tests: test/ivr-block-runtime.test.ts (resolveNoInputTarget); test/ivr-gather.test.ts (timeout attrs); test/inbound-ivr-block-response.route.test.ts:144-161 (null-input falls through)
- Missing tests: Editor emits wait/no-input controls; Inbound no-input branches (hangup/route/replay) + per-call replay cap
- Done when: A step can wait longer than the default and, on no input, replay or route instead of just advancing; Defaults unchanged for steps that do not configure it; Inbound mirrors outbound behavior with its own replay store
- Tracker: Implemented on dev (PR #1992, merged). Verify on the review env: #1883 editor no-input panel writes the fields + inbound mirrors the cap; #1884 dangling/cycle scripts block launch with script_routing_invalid and the editor shows the errors. Then close.

### [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) auth pages: sign-in hides the real error behind "We couldn't sign you in, Try again shortly"
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-10-08
- Safe sign-in messages are merged in PR #2361. Known provider codes are mapped; unknown failures remain generic. Deployed QA and default-branch release remain open.
- Current behavior: Source verified on dev@46ba4b7e, 2026-10-04. PR #2361 is merged. Full local CI, final-head remote checks and both deployments passed. Source proof does not complete deployed acceptance.
- Root cause: Fixed: the shared login helper previously masked the real invalid-credentials exception as a temporary server failure. Its finite mapping now checks known codes and expected statuses; browser and JSON paths use it.
- Resolution: Verify deployed wrong-password, rate-limit and provider-failure copy; confirm one root toast, retained form values, no layout movement, successful sign-in and two-factor routing. Release to the default branch before closure.
- Look in: `app/lib/platform-auth.server.ts`, `app/routes/signin.action.server.ts`, `test/platform-auth.test.ts`, `test/ui/signin-feedback.test.tsx`
- Existing tests: test/platform-auth.test.ts (real APIError codes and statuses, safe fallback and actual browser/token paths); test/ui/signin-feedback.test.tsx (real root toast, form retention and revalidation); Mutation checks rejected the old generic catch and raw provider-message disclosure.
- Missing tests: Deployed acceptance and default-branch release remain pending; source and automated checks do not prove deployed appearance or end-to-end behavior.
- Done when: The UI distinguishes invalid credentials from a provider outage or rate limit; A wrong password no longer reads as a generic temporary failure; The raw provider payload is mapped, not passed through to the user; The error is surfaced through the toast pattern, not inline text
- Tracker: Verify and close after deployed QA and default-branch release. PR #2361 is merged into dev; keep the issue open until the remaining verification is complete.

### [#2123](https://github.com/chester-hill-solutions/callcaster/issues/2123) The nested RouteErrorBoundary throws away the server's explanation for non-404 route errors
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-07
- Source repair merged into dev; candidate acceptance and default-branch promotion remain.
- Current behavior: Current source: dev@cd9a3e22d16f3114c00e8069556cfab70c155eb8, 2026-10-07 UTC. PR #2464 merged at 171f6fca4c7ec5be368d62a521c8063037af5d59. Root and nested error boundaries now extract recognized safe response messages through the shared sanitizer. Internal database/query data falls back to safe text; 404 handling remains.
- Root cause: The nested boundary discarded response messages, while the root accepted only strings and unsafe response data needed filtering.
- Resolution: Validate released route messages and layouts. Source markup and classes were preserved; this change has no fresh full-browser geometry claim. Do not close from dev source evidence alone.
- Look in: `app/components/shared/RouteErrorBoundary.tsx`, `app/lib/user-message.ts`, `app/root.tsx`
- Existing tests: test/user-message.test.ts; test/ui/route-error-messages.test.tsx
- Missing tests: Validate released route messages and layouts. Source markup and classes were preserved; this change has no fresh full-browser geometry claim.
- Done when: A 403 thrown as "You do not have access to this workspace" renders that sentence in the nested boundary (kill-check: revert to the status-only text and confirm the test goes red).; A 404 still renders its not-found treatment (the existing correct behaviour must stay green).; A non-`Response` error still goes through `toUserMessage` and never leaks a driver message.; Safe string response data and recognized structured error payloads both produce the intended message.; Response data containing a driver/internal message produces a safe fallback.; Missing or unrecognized response data uses the status fallback.
- Tracker: Verify and close after candidate acceptance and default-branch promotion. PR #2464 passed full local CI, applicable exact-head remote gates, actual PostgreSQL coverage and app/worker previews; source-equivalent squash and owned cleanup are verified.

### [#2151](https://github.com/chester-hill-solutions/callcaster/issues/2151) Cache interactive SMS readiness checks and measure Twilio read cost
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-07
- Source repair merged into dev; candidate acceptance and default-branch promotion remain.
- Current behavior: Current source: dev@cd9a3e22d16f3114c00e8069556cfab70c155eb8, 2026-10-07 UTC. PR #2462 merged at b2e8c712d9baab0b8f8f75a08b0b31be8df7d3a3. Interactive chat uses a 30-second sender-pool cache with version-fenced invalidation. Campaign ticks retain a fresh gate. Measured ten-message chat bursts use one sender read; three-message campaign ticks use one.
- Root cause: Chat readiness listed the live sender pool on each send without a bounded cache; campaign gating was already present.
- Resolution: Verify candidate worker/provider traffic and invalidation behavior. The measurements use real SDK calls with simulated transport; they are not live-provider acceptance. Do not close from dev source evidence alone.
- Look in: `app/lib/chat-sms.server.ts`, `app/lib/merge-workspace-twilio-data.server.ts`, `app/lib/twilio-readiness.server.ts`, `app/lib/twilio-sender-pool.server.ts`
- Existing tests: test/integration-db/interactive-sender-cache.test.ts; test/interactive-sender-pool-cache.test.ts; test/twilio-sender-pool.server.test.ts
- Missing tests: Verify candidate worker/provider traffic and invalidation behavior. The measurements use real SDK calls with simulated transport; they are not live-provider acceptance.
- Done when: A dispatch tick of N messages performs **one** readiness evaluation, not N (kill-check: revert to the per-message call and confirm the test goes red).; A chat burst re-lists the sender pool at most once per TTL window.; A non-ready campaign dispatch defers before row selection and does not spend queue attempts; this behavior is already implemented by PR #2228.; The before/after Twilio request count for a representative tick is recorded in the issue.; The chat readiness cache expires and invalidates after relevant sender/configuration changes.
- Tracker: Verify and close after candidate acceptance and default-branch promotion. PR #2462 passed full local CI, applicable exact-head remote gates, actual PostgreSQL coverage and app/worker previews; source-equivalent squash and owned cleanup are verified.

### [#2127](https://github.com/chester-hill-solutions/callcaster/issues/2127) The contact page's "Call lists" checkboxes and the whole "Other Data" editor are discarded, yet Save reports success
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-07
- Source repair merged into dev; candidate acceptance and default-branch promotion remain.
- Current behavior: Current source: dev@cd9a3e22d16f3114c00e8069556cfab70c155eb8, 2026-10-07 UTC. PR #2460 merged at 8672297b1b3a97dcf2744b31e80f421b860a1da0. The contact editor sends list membership and Other Data drafts through Save and persists them atomically with tenant validation. Reset, reload, create and refused edits are covered.
- Root cause: The draft and action transport omitted call-list membership and Other Data values.
- Resolution: Validate the released contact editor with candidate data and complete default-branch promotion. Do not close from dev source evidence alone.
- Look in: `app/components/contact/ContactDetails.tsx`, `app/components/contact/ContactDetailsOtherFields.tsx`, `app/lib/contact-editor.ts`, `app/routes/workspaces+/$id/contacts/$contactId.action.server.ts`, `app/routes/workspaces+/$id/contacts/$contactId.route.tsx`, `app/server/contact-editor.server.ts`
- Existing tests: test/contact-detail-action.route.test.ts; test/integration-db/contact-editor-save.test.ts; test/ui/_helpers/contact-editor.ts; test/ui/contact-editor-drafts.test.tsx; test/ui/contact-editor-route.test.tsx
- Missing tests: Validate the released contact editor with candidate data and complete default-branch promotion.
- Done when: Toggling a call-list checkbox persists the membership and it survives a reload (kill-check).; Editing an "Other Data" field persists and survives a reload (kill-check).; If the controls are removed instead, they are absent rather than inert.; The unfinished-wiring comment is gone.
- Tracker: Verify and close after candidate acceptance and default-branch promotion. PR #2460 passed full local CI, applicable exact-head remote gates, actual PostgreSQL coverage and app/worker previews; source-equivalent squash and owned cleanup are verified.

### [#2138](https://github.com/chester-hill-solutions/callcaster/issues/2138) Non-member sudo users cannot use the Access tab, while separate sudo membership writers omit safety guards
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-07
- Source repair merged into dev; candidate acceptance and default-branch promotion remain.
- Current behavior: Current source: dev@cd9a3e22d16f3114c00e8069556cfab70c155eb8, 2026-10-07 UTC. PR #2458 merged at 9e5bbdb38d77c7b6480aa650e4afc097bcf1e75d. Verified non-member sudo access and protected admin membership writes are implemented. Shared services lock membership changes and enforce sole-owner and target enrollment rules.
- Root cause: The Access route mixed platform and workspace roles, while separate admin writers omitted membership safety rules.
- Resolution: Validate the released sudo/member paths and actual MFA enrollment. The separate duplicate presentation defect remains under #2459. Do not close from dev source evidence alone.
- Look in: `app/components/workspace/TeamMember.tsx`, `app/lib/platform-admin.server.ts`, `app/lib/platform-members.server.ts`, `app/lib/workspace-members-db.server.ts`, `app/routes/admin+/users/$userId/workspaces.action.server.ts`, `app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts`, `app/routes/admin+/workspaces/$workspaceId/invite.route.tsx`, `app/routes/api+/admin+/users+/$userId/workspaces.action.server.ts`
- Existing tests: test/integration-db/platform-membership-safety.test.ts; test/ui/platform-member-controls.test.tsx; test/workspace-members-rbac.test.ts; test/workspace-ownership-transfer.test.ts
- Missing tests: Validate the released sudo/member paths and actual MFA enrollment. The separate duplicate presentation defect remains under #2459.
- Done when: A verified sudo user can open the Access tab without workspace membership.; A user without sudo access cannot open the admin route, regardless of workspace role.; Access-tab and sudo API mutations refuse sole-owner removal or demotion.; Access-tab and sudo API mutations refuse owner/admin grants to a target without required two-factor enrollment.; Permitted sudo mutations and existing member-path protections continue to work.
- Tracker: Verify and close after candidate acceptance and default-branch promotion. PR #2458 passed full local CI, applicable exact-head remote gates, actual PostgreSQL coverage and app/worker previews; source-equivalent squash and owned cleanup are verified.

### [#2455](https://github.com/chester-hill-solutions/callcaster/issues/2455) Bind inbound IVR page and block requests to the signed call workspace
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-07
- Source repair merged into dev; candidate acceptance and default-branch promotion remain.
- Current behavior: Current source: dev@cd9a3e22d16f3114c00e8069556cfab70c155eb8, 2026-10-07 UTC. PR #2457 merged at 31230d93b5a47396cf1b040860339ab5c89ec1f0. Inbound page and block actions bind the signed persisted call to the verified number workspace before routing, rendering or signing audio.
- Root cause: Page and block actions checked phone matching but omitted the signed call-to-number workspace comparison; the response action already had it.
- Resolution: Live signed-call and storage acceptance, release QA and default-branch promotion remain. Do not close from dev source evidence alone.
- Look in: `app/lib/inbound-ivr-db.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server.ts`
- Existing tests: test/integration-db/inbound-ivr-workspace.test.ts
- Missing tests: Live signed-call and storage acceptance, release QA and default-branch promotion remain.
- Done when: A valid B-workspace signed call cannot render, redirect to or sign audio for an A-workspace number, even when the called phone matches.; Missing call workspace and missing/foreign number or script fail closed before audio signing.; Correct workspace calls retain documented speech, MP3/WAV playback, Gather nesting and routing.; Invalid signatures and changed called phones remain denied.; Real signed HTTP/database tests cover page, block and response boundaries. Remove each workspace guard separately and require an executed failure with valid controls.; One atomic PR; full local CI before every push and exact-head remote database/E2E/deployment gates before merge. Deployed acceptance and default-branch promotion remain required for closure.
- Tracker: Verify and close after candidate acceptance and default-branch promotion. PR #2457 passed full local CI, applicable exact-head remote gates, actual PostgreSQL coverage and app/worker previews; source-equivalent squash and owned cleanup are verified.

### [#2148](https://github.com/chester-hill-solutions/callcaster/issues/2148) The inbound IVR renderer has no speech-text fallback and no WAV sidecar lookup, so a documented-format block emits an empty Say
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-07
- Source repair merged into dev; candidate acceptance and default-branch promotion remain.
- Current behavior: Current source: dev@cd9a3e22d16f3114c00e8069556cfab70c155eb8, 2026-10-07 UTC. PR #2456 merged at 4d9bbde26016fa3cea3753d5b4ce4919b66c3914. The inbound IVR action uses the canonical audio renderer with its workspace context. Content-only speech, recordings and WAV sidecars are covered.
- Root cause: The inbound action had a separate renderer that read audioFile for synthesized speech and omitted shared sidecar lookup.
- Resolution: Provider playback, storage behavior and release-candidate routing still require acceptance. Do not close from dev source evidence alone.
- Look in: `app/lib/ivr-block-render.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server.ts`
- Existing tests: test/inbound-ivr-block.route.test.ts; test/integration-db/inbound-ivr-prompt.test.ts
- Missing tests: Provider playback, storage behavior and release-candidate routing still require acceptance.
- Done when: A documented-format block on the **inbound** path emits the spoken text (kill-check: keep the local `handleAudio` and confirm the test goes red).; A block with an `audioFile` still plays the recording.; A block with a WAV sidecar still uses the sidecar.; There is one block renderer in the codebase (a grep assertion, so a second cannot be added without noticing).
- Tracker: Verify and close after candidate acceptance and default-branch promotion. PR #2456 passed full local CI, applicable exact-head remote gates, actual PostgreSQL coverage and app/worker previews; source-equivalent squash and owned cleanup are verified.

### [#2288](https://github.com/chester-hill-solutions/callcaster/issues/2288) Move audience-upload history loading to route data
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-07
- Upload history loads with the authorized audience page. Retry, live updates and navigation retain the current call-list identity.
- Current behavior: PR #2453 merged into dev at f1fc3ef5df1316c8f57b12d3c82afa7f4f001ba9. The existing scoped query feeds route data after audience access checks. Failed reads retain prior rows; retries use revalidation; prior workspace/audience callbacks and delayed responses cannot replace current rows. Persistent shared root feedback retains its action through notice updates and reopen. Both exact-source reviews, full local gates, all 875 local and remote database cases with zero skips, E2E and actual exact-head preview deployments passed. Six phone/desktop/wide light/dark geometry checks have zero background movement. Deployed acceptance and release promotion remain.
- Root cause: Initial server history is owned by a client effect instead of the existing audience route data contract.
- Resolution: Verify deployed upload history, retry and realtime navigation in the release candidate before default-branch promotion and closure. Source implementation is complete; retain all original acceptance criteria.
- Look in: `app/components/audience/AudienceUploadHistory.tsx`, `app/hooks/audience/useAudienceUploads.ts`, `app/routes/workspaces+/$id/audiences/$audience_id.loader.server.ts`, `app/routes/workspaces+/$id/audiences/$audience_id.route.tsx`
- Existing tests: test/ui/audience-upload-history.test.tsx; test/integration-db/audience-upload-history.test.ts
- Missing tests: Release-candidate deployed browser/upload acceptance and default-branch promotion remain.
- Done when: Initial history is route data; the mount fetch effect is removed.; Workspace/audience changes cannot leak old history or accept late results for another audience.; Loading, empty, error retry and success behavior remain available.; Current-audience event updates and route tenant authorization are retained.; Tests fail if the required loader, isolation, retry or event behavior is removed.; Remove candidate inventory debt and pass full local/remote gates before merge.; Initial audience upload history is route data; the mount effect and raw fetch path are removed from the hook.; Workspace/audience navigation cannot show a prior audience's uploads or let a late result overwrite the current audience.; Loading, empty, failed-read retry and successful history display remain supported.; Existing upload progress updates still handle INSERT, UPDATE and DELETE for the current audience.; Route authorization and tenant filtering are retained; foreign audience/workspace rows are not returned.; Meaningful route/UI tests fail if initial loading, audience isolation, retry or event updates are broken. Use stable fetcher/session doubles.; Remove this effect's CANDIDATE-REMOVE inventory entry after the runtime fix. Full local CI and all remote gates pass before merge.
- Tracker: Native issue is OPEN; exact-head issue-on-dev workflow moved one item. Source evidence is complete and separate from deployed acceptance and release QA.

### [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) Prepare a valid A2P Messaging Profile before brand registration
- Verdict: **Verify and close** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-07
- A2P product preparation validates explicit inputs, recovers verified resources and requires compliant submission before brand creation.
- Current behavior: PR #2450 merged into dev at d1f5664e02e013d49c9512cb413489bb21ca14ba. A2P product preparation validates explicit inputs, recovers verified resources and requires compliant submission before brand creation. Source reviews, full local gates, actual database regressions, applicable remote checks and exact-head preview deployments passed. These receipts do not complete remaining deployed acceptance or default-branch promotion.
- Resolution: Source fix is merged into dev. Complete the remaining deployed acceptance and release verification stated in the current native issue before default-branch promotion and closure.
- Look in: `app/lib/a2p-messaging-profile.server.ts`, `app/lib/a2p-messaging-profile.ts`, `app/lib/messaging-onboarding/business-profile.server.ts`, `app/lib/messaging-onboarding/merge.server.ts`, `app/lib/messaging-onboarding/normalize-sections.server.ts`, `app/lib/messaging-onboarding/normalize.server.ts`, `app/lib/messaging-onboarding/persistence.server.ts`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/onboarding-actions.server.ts`, `app/lib/platform-onboarding-handlers.server.ts`, `app/lib/platform-onboarding.server.ts`, `app/lib/twilio-a2p-messaging-profile.server.ts`, `app/lib/twilio-a2p-provision.server.ts`, `app/lib/twilio-a2p-status-sync.server.ts`, `app/lib/twilio-client.server.ts`, `app/lib/twilio-compliance-job.server.ts`, `app/lib/twilio-compliance-webhook.server.ts`, `app/lib/types.ts`, `app/routes/workspaces+/$id/onboarding/OnboardingBusinessIdentityStep.tsx`, `docs/CHANGELOG.md`, `docs/api-telephony-provisioning.md`, `test/a2p-messaging-profile.test.ts`, `test/fixtures/a2p-profile-provider.ts`, `test/fixtures/onboarding.ts`, `test/integration-db/a2p-messaging-profile.test.ts`, `test/onboarding-business-profile-validation.test.ts`, `test/twilio-a2p-provision.server.test.ts`, `test/twilio-a2p-status-sync.test.ts`, `test/ui/onboarding-business-identity-website-required.test.tsx`
- Existing tests: test/a2p-messaging-profile.test.ts; test/fixtures/a2p-profile-provider.ts; test/fixtures/onboarding.ts; test/integration-db/a2p-messaging-profile.test.ts; test/onboarding-business-profile-validation.test.ts; test/twilio-a2p-provision.server.test.ts; test/twilio-a2p-status-sync.test.ts; test/ui/onboarding-business-identity-website-required.test.tsx
- Missing tests: Deployed acceptance and release QA remain; current native issue separates those from passing source, local and remote tests.
- Done when: Required Messaging Profile inputs are explicit and valid; public-company attributes follow the current provider contract.; Create/reuse and assign the required EndUser and customer profile before evaluation/submission.; Provider/input failure blocks brand creation with visible details.; Retry repairs and resubmits incomplete existing products without duplicates.; Private/public business controls and deployed provider checks pass before promotion and closure.; Required messaging-profile business inputs are represented and validated. Public-company attributes and contact verification requirements follow the current provider contract; no invented attestations.; Create/reuse the messaging-profile EndUser and assign it to the Trust Product with the Secondary Customer Profile.; Evaluate and submit only after required entities exist. Submission or evaluation errors are visible and block brand registration.; Retry repairs and resubmits an existing incomplete product without duplicate EndUsers, assignments or brands.; Installed SDK transport tests cover preparation order, failures and missing inputs. Real persistence/readiness checks prove that incomplete prerequisites cannot become approval.; Complete private and public business controls pass. Deployed provider verification precedes promotion and issue closure.
- Tracker: PR #2450 is merged into dev; native issue remains OPEN/on-dev. Keep provider/candidate verification and release promotion visible; do not repeat completed implementation.

### [#2145](https://github.com/chester-hill-solutions/callcaster/issues/2145) The regulatory optInType submitted to Twilio is derived by substring-matching free-text prose
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-07
- Toll-free provisioning uses an explicit exact consent enum; missing or invalid selections stop new registration.
- Current behavior: PR #2447 merged into dev at f3e62bfc95ab907582d4a691cb81dd42c755e915. Toll-free provisioning uses an explicit exact consent enum; missing or invalid selections stop new registration. Source reviews, full local gates, actual database regressions, applicable remote checks and exact-head preview deployments passed. These receipts do not complete remaining deployed acceptance or default-branch promotion.
- Resolution: Source fix is merged into dev. Complete the remaining deployed acceptance and release verification stated in the current native issue before default-branch promotion and closure.
- Look in: `.agents/skills/local-development/SKILL.md`, `app/lib/messaging-onboarding/business-profile.server.ts`, `app/lib/messaging-onboarding/normalize-sections.server.ts`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/onboarding-actions.server.ts`, `app/lib/platform-onboarding-handlers.server.ts`, `app/lib/platform-onboarding.server.ts`, `app/lib/toll-free-opt-in.ts`, `app/lib/twilio-toll-free-provision.server.ts`, `app/lib/types.ts`, `app/routes/workspaces+/$id/onboarding/OnboardingBusinessIdentityStep.tsx`, `docs/CHANGELOG.md`, `docs/twilio-toll-free-verification-plan.md`, `test/fixtures/onboarding.ts`, `test/integration-db/toll-free-opt-in.test.ts`, `test/onboarding-business-profile-validation.test.ts`, `test/twilio-toll-free-provision.server.test.ts`, `test/ui/onboarding-business-identity-website-required.test.tsx`
- Existing tests: test/fixtures/onboarding.ts; test/integration-db/toll-free-opt-in.test.ts; test/onboarding-business-profile-validation.test.ts; test/twilio-toll-free-provision.server.test.ts; test/ui/onboarding-business-identity-website-required.test.tsx
- Missing tests: Deployed acceptance and release QA remain; current native issue separates those from passing source, local and remote tests.
- Done when: Free-text workflow descriptions never determine optInType.; Each supported explicit enum value passes through exactly; invalid explicit values are refused.; Missing selections follow an explicit recorded product policy and cannot silently produce an unsupported consent statement.; Any allowed legacy fallback logs the workspace and reason.; Tests cover negated verbal prose, explicit enum values, invalid values and missing selections.; The provisioning sweep result is recorded; any live registration audit is tracked separately.
- Tracker: PR #2447 is merged into dev; native issue remains OPEN/on-dev. Keep provider/candidate verification and release promotion visible; do not repeat completed implementation.

### [#2268](https://github.com/chester-hill-solutions/callcaster/issues/2268) Deliver inbound IVR voicemail to the script recipient
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-06
- Voicemail delivery retains the script-selected recipient and first-send payload through retries and receipt recovery.
- Current behavior: PR #2446 merged into dev at 63c8014263f67d304d806f6833e04bbc48505438. Voicemail delivery retains the script-selected recipient and first-send payload through retries and receipt recovery. Source reviews, full local gates, actual database regressions, applicable remote checks and exact-head preview deployments passed. These receipts do not complete remaining deployed acceptance or default-branch promotion.
- Root cause: No trusted recipient metadata is carried from the selected IVR target into recording delivery.
- Resolution: Source fix is merged into dev. Complete the remaining deployed acceptance and release verification stated in the current native issue before default-branch promotion and closure.
- Look in: `.agents/skills/local-development/SKILL.md`, `app/db/schema-inbound-voicemail.ts`, `app/db/schema.ts`, `app/db/workspace-scoped-tables.ts`, `app/lib/inbound-call-db.server.ts`, `app/lib/inbound-voicemail-email.server.ts`, `app/lib/voicemail-email-provider.server.ts`, `app/routes/api+/email-vm.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/server/inbound-voicemail-store.server.ts`, `client/migrations/20261006000003_inbound_voicemail_delivery.sql`, `docs/CHANGELOG.md`, `docs/contact-center-platform-plan.md`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`, `test/email-vm.route.test.ts`, `test/inbound-ivr-block-response.route.test.ts`, `test/integration-db/inbound-voicemail-recipient.test.ts`, `test/tenant-db.test.ts`, `test/voicemail-email-provider.test.ts`
- Existing tests: test/email-vm.route.test.ts; test/inbound-ivr-block-response.route.test.ts; test/integration-db/inbound-voicemail-recipient.test.ts; test/tenant-db.test.ts; test/voicemail-email-provider.test.ts
- Missing tests: Deployed acceptance and release QA remain; current native issue separates those from passing source, local and remote tests.
- Done when: The script target recipient receives the voicemail.; Legacy recipients remain valid and untrusted callbacks cannot replace another call or workspace recipient.; Retries and later script edits retain the bound recipient without duplicate emails.; Runtime, docs, tests and deployed verification agree before promotion.; An IVR target email receives the voicemail even when the number's default address differs.; Legacy number and queue voicemail retain their existing recipient behavior.; Callback requests cannot replace another call's or workspace's bound recipient.; Retry handling does not send a duplicate email or silently fall back to the wrong inbox.; Runtime, public target documentation and tests agree on `voicemail:{email}`.; Real failing-source regressions, valid controls and full local CI pass before publishing. Verify recording delivery on deployed dev before promotion and closure.
- Tracker: PR #2446 is merged into dev; native issue remains OPEN/on-dev. Keep provider/candidate verification and release promotion visible; do not repeat completed implementation.

### [#2269](https://github.com/chester-hill-solutions/callcaster/issues/2269) Validate inbound IVR scripts before number attachment
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-06
- Inbound script attachment and attached-script saves share tenant and routing validation; invalid changes retain the last valid configuration.
- Current behavior: PR #2445 merged into dev at 424f506b1344d007df58d318c11c97a979b1d752. Inbound script attachment and attached-script saves share tenant and routing validation; invalid changes retain the last valid configuration. Source reviews, full local gates, actual database regressions, applicable remote checks and exact-head preview deployments passed. These receipts do not complete remaining deployed acceptance or default-branch promotion.
- Root cause: Inbound activation and attached-script editing have no shared ownership/routing validation boundary.
- Resolution: Source fix is merged into dev. Complete the remaining deployed acceptance and release verification stated in the current native issue before default-branch promotion and closure.
- Look in: `.agents/skills/local-development/SKILL.md`, `app/components/campaign/settings/script/CampaignSettings.Script.tsx`, `app/components/campaign/settings/script/ScriptBlockEditor.IvrResponses.tsx`, `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/components/campaign/settings/script/ScriptBlockEditor.routing.ts`, `app/components/campaign/settings/script/ScriptBlockEditor.tsx`, `app/components/campaign/settings/script/ScriptEditorShell.tsx`, `app/components/campaign/settings/script/ScriptValidationDetails.tsx`, `app/lib/call-script-service.ts`, `app/lib/database/campaign.server.ts`, `app/lib/inbound-script-validation.ts`, `app/lib/ivr-no-input.ts`, `app/lib/ivr-script-validation.ts`, `app/lib/openapi-platform-components.ts`, `app/lib/openapi-platform.ts`, `app/lib/parse-utils.server.ts`, `app/lib/platform-workspace-numbers.server.ts`, `app/lib/routing-preset-write.server.ts`, `app/lib/schemas/api/platform-workspace-admin.ts`, `app/lib/script-persistence.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.route.tsx`, `app/routes/workspaces+/$id/phone-numbers.action.server.ts`, `app/routes/workspaces+/$id/scripts/$scriptId.route.tsx`, `app/server/inbound-script-write.server.ts`, `docs/CHANGELOG.md`, `docs/contact-center-platform-plan.md`, `openapi/public-api.json`, `shared/inbound-routing-presets.ts`, `test/inbound-ivr-block-response.route.test.ts`, `test/inbound-ivr-validation.test.ts`, `test/integration-db/inbound-script-attachment.test.ts`, `test/routing-preset-write.server.test.ts`, `test/script-persistence.server.test.ts`, `test/ui/inbound-script-validation.test.tsx`, `test/ui/script-block-editor-ivr.test.tsx`, `test/ui/script-editor-route.test.tsx`
- Existing tests: test/inbound-ivr-block-response.route.test.ts; test/inbound-ivr-validation.test.ts; test/integration-db/inbound-script-attachment.test.ts; test/routing-preset-write.server.test.ts; test/script-persistence.server.test.ts; test/ui/inbound-script-validation.test.tsx; test/ui/script-block-editor-ivr.test.tsx; test/ui/script-editor-route.test.tsx
- Missing tests: Deployed acceptance and release QA remain; current native issue separates those from passing source, local and remote tests.
- Done when: Foreign, missing, unsuitable and invalid scripts cannot be attached or saved over an attached valid version.; Valid targets and clearing remain usable.; API, editor and target docs agree; real write-boundary regressions and deployed checks pass.; Draft/configuration are preserved and canonical shared validation feedback does not move the page.; Foreign, missing or unsuitable scripts cannot be attached through the platform API, workspace form or automated-menu preset.; Dangling page/block targets, malformed voicemail emails and invalid forward/queue targets are rejected before attachment.; Workspace and campaign saves reject an invalid update to an attached script without replacing its valid version.; Valid scripts and each supported terminal target remain usable; clearing the attachment remains allowed.; API contract, editor errors and target documentation agree. Regression tests reach each real write boundary with valid controls.; Validation preserves the draft and returns usable feedback through the canonical shared components. Error appearance, update and clearing do not move the page layout.; Full local CI passes before publishing. Verify attachment and editing behavior on deployed dev before promotion and closure.
- Tracker: PR #2445 is merged into dev; native issue remains OPEN/on-dev. Keep provider/candidate verification and release promotion visible; do not repeat completed implementation.

### [#2114](https://github.com/chester-hill-solutions/callcaster/issues/2114) Message campaign credit estimates assume one segment per contact while billing charges per segment
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-06
- Campaign estimates use rendered recipient SMS segments and MMS rates with dispatch exclusions.
- Current behavior: PR #2444 merged into dev at ed73bd67dfd85d629fe87a8814b7384f8af7c52a. Campaign estimates use rendered recipient SMS segments and MMS rates with dispatch exclusions. Source reviews, full local gates, actual database regressions, applicable remote checks and exact-head preview deployments passed. These receipts do not complete remaining deployed acceptance or default-branch promotion.
- Resolution: Source fix is merged into dev. Complete the remaining deployed acceptance and release verification stated in the current native issue before default-branch promotion and closure.
- Look in: `app/components/campaign/settings/CampaignCostPanel.tsx`, `app/components/campaign/settings/CampaignLaunch.tsx`, `app/lib/campaign-billing.server.ts`, `app/lib/campaign-message-estimate.server.ts`, `app/lib/campaign-sms-dispatch.server.ts`, `app/lib/message-db.server.ts`, `app/lib/message-templates.ts`, `docs/CHANGELOG.md`, `shared/campaign-billing.ts`, `test/campaign-billing.test.ts`, `test/integration-db/campaign-message-estimate.test.ts`, `test/ui/campaign-cost-panel.test.tsx`, `test/ui/campaign-launch-review.test.tsx`
- Existing tests: test/campaign-billing.test.ts; test/integration-db/campaign-message-estimate.test.ts; test/ui/campaign-cost-panel.test.tsx; test/ui/campaign-launch-review.test.tsx
- Missing tests: Deployed acceptance and release QA remain; current native issue separates those from passing source, local and remote tests.
- Done when: For a campaign whose template produces 2 segments per message, the estimate equals the ledger debit (kill-check: revert to per-contact and confirm the test goes red).; The panel's `rateDescription` states the assumption it actually makes.; MMS is either estimated or explicitly excluded in the copy.; A `loadCampaignBillingSummary`-level test asserts estimate == debit for a representative campaign.
- Tracker: PR #2444 is merged into dev; native issue remains OPEN/on-dev. Keep provider/candidate verification and release promotion visible; do not repeat completed implementation.

### [#2111](https://github.com/chester-hill-solutions/callcaster/issues/2111) Admin Add User and Add Workspace buttons have no action
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-06
- The source removal repair is merged into dev. Deployed admin acceptance and default-branch promotion remain.
- Current behavior: The two inert admin creation controls were removed through [PR #2440](https://github.com/chester-hill-solutions/callcaster/pull/2440), at 2991159ce9c9be62b383327739990972899bd7bc. This follows the native removal option because the creation routes do not exist. Search, Clear Filters, pagination and Sync Twilio remain. Both full local gates, final reviews, all applicable exact-head remote checks, E2E, 700 PostgreSQL18 cases and both actual deployments passed. Recovery/source equivalence and topic/preview cleanup are verified. Original scope and acceptance remain; no live admin geometry or candidate acceptance is claimed.
- Root cause: Before the repair, the admin panels rendered creation buttons without routes or handlers.
- Resolution: Verify the original admin acceptance on the release candidate and promote the verified change. Keep the native issue open until then.
- Look in: `app/routes/admin+/panels/AdminUsersPanel.tsx`, `app/routes/admin+/panels/AdminWorkspacesPanel.tsx`, `test/ui/admin-pagination.test.tsx`
- Existing tests: test/ui/admin-pagination.test.tsx; test/ui/admin-public-remediation.test.tsx
- Missing tests: Deployed admin acceptance through the original criteria, release-candidate QA and default-branch promotion.
- Done when: Each of the two buttons either navigates to a real route or is removed (kill-check: remove the `to` and confirm the test goes red).; A guard test asserts that creation controls in app/routes/admin+/panels/ have a reachable action, or are absent.; If the routes do not exist yet, the button is absent rather than inert.
- Tracker: Merged on dev; verify the candidate before default-branch promotion and closure.

### [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) Dead Twilio recording callbacks on dial/:number and connect-campaign-conference
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-06
- The manual callback repair and unsupported conference recording removal are merged. Provider/storage acceptance and promotion remain.
- Current behavior: PR #2439 merged into dev at bc74dd45bf7a5dca637988487aa1901227d75067. Manual Dial keeps record-from-answer and sends completed recording events to the canonical signed /api/recording endpoint. The campaign Conference path removes recording under the permitted removal option. Its ConferenceSid payload cannot be passed to the existing CallSid endpoint. Authentication, ordinary call-status callbacks and conference join settings remain. All 37 focused tests, three isolated faults with controls, both full local gates, both reviews, all applicable remote checks, 700 PostgreSQL 18 tests and both actual deployments passed. Recovery/source equivalence and topic/preview cleanup are verified.
- Resolution: Verify actual manual-call recording download and persisted audio on the release candidate. Confirm that campaign conferences no longer request unsupported capture. Keep recording policy/lifecycle separate under #1873 and keep this issue open until deployed acceptance and default-branch promotion.
- Look in: `app/routes/api+/dial/$number.action.server.ts`, `app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.loader.server.ts`, `app/routes/api+/recording.action.server.ts`
- Existing tests: test/dial-number.route.test.ts; test/connect-campaign-conference.route.test.ts; test/recording.route.test.ts; test/webhook-side-effects.test.ts
- Missing tests: Actual provider recording download and call audio_url persistence on the release candidate. Passing synthetic boundaries and deployments do not prove provider acceptance.
- Done when: No dial path records without a persisted callback; Conference recordings persist (or record is removed)
- Tracker: Wire-or-remove source contract is merged and clean. General conference recording policy remains separate; candidate recording/storage acceptance and promotion remain.

### [#2110](https://github.com/chester-hill-solutions/callcaster/issues/2110) Chat composer segment counter and credit estimate desync from the message text after a failed send
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-06
- The source repair is merged into dev. Deployed acceptance, release-candidate QA and default-branch promotion remain.
- Current behavior: The chat composer repair merged into dev in [PR #2437](https://github.com/chester-hill-solutions/callcaster/pull/2437), at `c73ee65fc132b0318cc588f358d4fd2eb59a05e0`. One controlled draft now supplies text and send estimates. Failed sends restore the unchanged draft only for the same composer and recipient. Later typing and intentional clears remain intact. Immediate results and first-send redirects release the pending request; retained older results cannot replay. Accepted sends clear text; refused submissions preserve it.
- Resolution: Verify the merged behavior on the release candidate through the original acceptance criteria. Promote the verified repair through the release PR; keep the native issue open until then.
- Look in: `app/components/sms-ui/ChatInput.tsx`, `app/hooks/chats/useChatsPage.ts`, `app/routes/workspaces+/$id/chats.route.tsx`, `test/ui/chat-composer-recovery.test.tsx`, `test/ui/chat-composer-router-lifecycle.test.tsx`, `test/ui/hooks-chats-optimistic-failure.test.tsx`
- Existing tests: test/ui/chat-composer-recovery.test.tsx; test/ui/chat-composer-router-lifecycle.test.tsx; test/ui/hooks-chats-optimistic-failure.test.tsx
- Missing tests: Deployed acceptance through the original criteria, release-candidate QA and default-branch promotion remain. Passing merge gates do not establish provider or user acceptance.
- Done when: After a failed send of a 340-character message, the counter shows the real length, the real segment count and the real credit estimate (kill-check: keep the DOM write and confirm the test goes red).; The restored text is the user's, unchanged, and the cursor is at a sensible position.; A successful send still clears the composer.; The 160-character boundary warning still fires on the restored text.
- Tracker: Source repair merged into dev; verify candidate acceptance and promote before closure.

### [#2155](https://github.com/chester-hill-solutions/callcaster/issues/2155) Double-clicking Record leaks a microphone stream and corrupts the take
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-06
- The source repair is merged into dev. Deployed acceptance, release-candidate QA and default-branch promotion remain.
- Current behavior: The recorder lifetime repair merged into dev in [PR #2436](https://github.com/chester-hill-solutions/callcaster/pull/2436), at `0c7adc518e5036245079782f6080ae712038a8e4`. Record takes synchronous ownership before permission; cancelled and unmounted attempts release late streams. Each take owns its chunks; stale stop/error callbacks and late rejections cannot alter a newer take. Starting controls lock and phase changes are announced. Safe errors use the existing root Toaster.
- Resolution: Verify the merged behavior on the release candidate through the original acceptance criteria. Promote the verified repair through the release PR; keep the native issue open until then.
- Look in: `app/components/file-assets/AudioRecorder.tsx`, `test/ui/audio-recorder.test.tsx`
- Existing tests: test/ui/audio-recorder.test.tsx
- Missing tests: Deployed acceptance through the original criteria, release-candidate QA and default-branch promotion remain. Passing merge gates do not establish provider or user acceptance.
- Done when: A double-click on Record starts exactly one recording (kill-check: remove the latch and confirm the test goes red).; Only one `getUserMedia` stream is open at any time, and it is released on stop.; The recorded take contains one recording, not two.; The Record button is disabled while starting.; The phase is announced to assistive technology on start, pause, resume and stop.
- Tracker: Source repair merged into dev; verify candidate acceptance and promote before closure.

### [#2426](https://github.com/chester-hill-solutions/callcaster/issues/2426) Reconciliation cost total adds overlapping provider categories
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-06
- Source repair merged through PR #2433; release-candidate acceptance and promotion remain.
- Current behavior: Merged dev source 6d0bcdaefc10ee8190752f0b8953d2979b01167f is equivalent to the tested topic head. The native issue records completed source, CI, real database and deployment evidence. It remains open pending candidate acceptance and default-branch promotion.
- Resolution: Verify the deployed candidate through the original acceptance criteria and promote the verified source in the release PR. Keep the issue open until the required verification and promotion complete.
- Look in: `.agents/skills/local-development/SKILL.md`, `app/lib/billing-reconcile-workspace.server.ts`, `app/lib/platform-admin-twilio.server.ts`, `app/lib/twilio-billing-usage.server.ts`, `app/routes/admin+/workspaces/$workspaceId/loadTwilioData.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio.actions.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.BillingReconciliationPanel.tsx`, `docs/CHANGELOG.md`, `shared/billing-reconciliation.ts`, `test/admin-response-projection.test.ts`, `test/admin-workspace-twilio.route.test.ts`, `test/billing-cost-adapters.test.ts`, `test/billing-cost-reconciliation.test.ts`, `test/billing-reconcile-workspace.server.test.ts`, `test/helpers/twilio-usage-page.ts`, `test/integration-db/admin-billing-period.test.ts`, `test/integration-db/billing-message-reconciliation.test.ts`, `test/integration-db/billing-rental-reconciliation.test.ts`, `test/twilio-billing-usage.server.test.ts`, `test/ui/billing-cost-reconciliation.test.tsx`
- Existing tests: test/admin-response-projection.test.ts; test/admin-workspace-twilio.route.test.ts; test/billing-cost-adapters.test.ts; test/billing-cost-reconciliation.test.ts; test/billing-reconcile-workspace.server.test.ts; test/helpers/twilio-usage-page.ts; test/integration-db/admin-billing-period.test.ts; test/integration-db/billing-message-reconciliation.test.ts; test/integration-db/billing-rental-reconciliation.test.ts; test/twilio-billing-usage.server.test.ts; test/ui/billing-cost-reconciliation.test.tsx
- Missing tests: Release-candidate acceptance through the original criteria and default-branch promotion remain. Source and successful deployments alone do not establish live acceptance.
- Done when: With a valid provider total of 4.20 USD for the requested period, overlapping rental aggregate and subtype rows still produce 4.20 USD. The rental subset alone is insufficient to prove a full-account total and must remain unknown.; A provider total record cannot be ignored in favor of overlapping categories.; Valid zero totals remain zero; missing, malformed or unsupported coverage remains explicit.; An isolated source fault that restores the overlapping sum makes the regression test fail while valid controls pass.; The admin display and structured alert details retain the correct period and cost state; credit mutations and material-variance thresholds do not change.; Full local CI before each push, specification/structural review, applicable exact-head remote checks and candidate acceptance pass before closure.
- Tracker: Merged on dev; verify candidate acceptance and promote before closure.

### [#2113](https://github.com/chester-hill-solutions/callcaster/issues/2113) hasMaterialBillingVariance ignores categories.numbers.variance, so number-rental ledger drift never alerts and is not even stored in the snapshot
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-06
- The source repair is merged into dev. Deployed acceptance, release-candidate QA and default-branch promotion remain.
- Current behavior: The rental reconciliation repair is merged through [PR #2425](https://github.com/chester-hill-solutions/callcaster/pull/2425) at dev commit `4f00975aaf61ef60295ed699bd7deff866737a0b`. It compares the previous complete UTC month with non-overlapping rental subtypes in verified provider units. Initial purchases remain separate. Catch-up debits use their recorded billing cycle. Known rollout exemptions and released-number history are included. Missing or conflicting coverage remains explicit.
- Resolution: Verify the merged behavior on the release candidate through the original acceptance criteria. Promote the verified repair through the release PR; keep the native issue open until then.
- Look in: `shared/billing-reconciliation.ts`, `app/lib/billing-reconciliation-snapshot.server.ts`, `app/lib/billing-reconciliation-alert.server.ts`, `app/lib/number-rental-reconciliation.server.ts`, `test/integration-db/billing-rental-reconciliation.test.ts`, `test/billing-reconciliation.test.ts`, `test/billing-reconciliation-alert.test.ts`
- Existing tests: test/billing-reconciliation.test.ts; test/billing-reconciliation-alert.test.ts
- Missing tests: Deployed acceptance through the original criteria, release-candidate QA and default-branch promotion remain. Passing merge gates do not establish provider or user acceptance.
- Done when: A numbers variance above the threshold raises an alert (kill-check: drop the numbers term and confirm the test goes red).; `numbersVariance` is present in the snapshot and survives a normalise round-trip.; The `numbers` comparison is unit-consistent: a workspace with one number for one month shows zero variance (positive control, and the test that proves the units are right).; A one-time purchase debit does not create a permanent variance.
- Tracker: Source repair merged into dev; verify candidate acceptance and promote before closure.

### [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396) Make predictive machine playback and continuation retry-safe
- Verdict: **Verify and close** · Size: M-L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-06
- The source repair is merged into dev. Deployed acceptance, release-candidate QA and default-branch promotion remain.
- Current behavior: The predictive machine operation repair is merged through [PR #2424](https://github.com/chester-hill-solutions/callcaster/pull/2424) at dev commit `db0e1686c72e65c8c8c5540f3ce4861954117289`. A durable operation binds playback, disposition and continuation to the workspace, call, outreach attempt, campaign, actor and conference. Signed replay cannot issue playback twice, and continuation waits for the playback acknowledgement. Issued or uncertain outcomes retain a recorded recovery policy.
- Root cause: Before the repair, a terminal outcome claim was used as operation completion. Playback was outside its winning branch and continuation ran before provider acknowledgement.
- Resolution: Verify the merged behavior on the release candidate through the original acceptance criteria. Promote the verified repair through the release PR; keep the native issue open until then.
- Look in: `app/routes/api+/auto-dial/$roomId.action.server.ts`, `app/lib/telephony-db.server.ts`, `app/lib/outreach-disposition.ts`, `app/lib/twilio-twiml.server.ts`, `app/lib/auto-dial.server.ts`, `app/lib/worker/enqueue-job.server.ts`, `app/lib/worker/poll-jobs.server.ts`
- Existing tests: test/auto-dial-room.route.test.ts
- Missing tests: Deployed acceptance through the original criteria, release-candidate QA and default-branch promotion remain. Passing merge gates do not establish provider or user acceptance.
- Done when: Enabled-drop concurrent and sequential replays cannot request playback twice or start a second next turn.; Continuation does not run while playback acknowledgement is pending.; Rejected or uncertain provider acknowledgement has recorded, tested recovery and cannot appear as successful playback or lose continuation.; Drop-off/no-audio advances once; human/device flows, tenant isolation, signatures and billing ownership remain correct.; Real route/TwiML and durable claim tests, full local CI, exact-head remote checks and deployed acceptance are required.
- Tracker: Source repair merged into dev; verify candidate acceptance and promote before closure.

### [#2119](https://github.com/chester-hill-solutions/callcaster/issues/2119) runCampaignScheduleSync skips every voice campaign that lacks a start_date/end_date pair, so such a campaign never reports waiting
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-06
- The source repair is merged into dev. Deployed acceptance, release-candidate QA and default-branch promotion remain.
- Current behavior: The optional-date schedule repair is merged through [PR #2423](https://github.com/chester-hill-solutions/callcaster/pull/2423) at dev commit `059cc376d11e564e6db72ca2efa027bedb9a2a4e`. Machine-voice campaigns with absent or one-sided date bounds now use the canonical dispatch policy to report waiting outside calling hours and running when permitted. Future starts do not dial early. Invalid supplied bounds retain their skip, and expired active campaigns remain the dispatch worker's completion responsibility. The tenant-scoped conditional writer preserves concurrent pause or completion.
- Resolution: Verify the merged behavior on the release candidate through the original acceptance criteria. Promote the verified repair through the release PR; keep the native issue open until then.
- Look in: `app/lib/campaign-schedule-sync.server.ts`, `app/lib/campaign-dispatch-policy.ts`, `app/lib/worker/handlers/cron.server.ts`, `test/campaign-schedule-sync.server.test.ts`, `test/integration-db/campaign-schedule-sync-status-race.test.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts; test/integration-db/campaign-schedule-sync-status-race.test.ts
- Missing tests: Deployed acceptance through the original criteria, release-candidate QA and default-branch promotion remain. Passing merge gates do not establish provider or user acceptance.
- Done when: A machine-voice campaign with no date pair, outside its calling window, reports `waiting` (kill-check: restore the combined guard and confirm the test goes red).; A campaign in range reports `running`.; A campaign with an expired range reports the expired state (see the related `campaign_ended` issue).; The `waiting` predicate is a single shared function used by both the sweep and the dispatch gate — asserted by a test that they agree across a table of cases.; The production count is recorded in the issue.
- Tracker: Source repair merged into dev; verify candidate acceptance and promote before closure.

### [#2107](https://github.com/chester-hill-solutions/callcaster/issues/2107) Require answers before public survey completion
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-06
- The source repair is merged to dev; release-candidate acceptance remains.
- Current behavior: PR #2419 merged into dev as a691d7a7910153f4529902ebfb7e04e5159cbd81. Native issue evidence records the scoped source repair and completed local/remote gates. Current dev contains the merge. Candidate QA remains pending; preserve the original criteria.
- Resolution: Run the required release-candidate acceptance, then promote through the release PR. Keep the issue OPEN until required acceptance and default-branch promotion. Do not implement the landed source repair again.
- Look in: `app/components/ui/form-field.tsx`, `app/hooks/surveys/useSurveySubmission.ts`, `app/lib/survey-answer-state.ts`, `app/lib/survey-db.server.ts`, `app/lib/survey-required-answer.ts`, `app/routes/survey+/$surveyId.tsx`, `app/server/survey-completion.ts`, `app/routes/api+/survey-complete.action.server.ts`
- Existing tests: test/integration-db/survey-required-answers.test.ts; test/ui/form-field.test.tsx; test/ui/survey-required-answers.test.tsx; test/ui/survey-save-order.test.tsx
- Missing tests: Required candidate acceptance from the current native issue; do not treat merged source or deployment success as release QA.
- Done when: A required question left blank blocks advancing to the next page, with a visible error and focus moved to it.; A required question left blank on the last page blocks submission.; A response with a missing required answer is rejected **server-side** even if the client is bypassed (kill-check: remove the client check and confirm the server test still passes; then remove the server check and confirm a test goes red).; Non-required questions remain skippable.; An existing completed response with a blank required answer is not retroactively invalidated without a decision on that.
- Tracker: Verify and close after required acceptance and promotion. PR #2419 is merged to dev; deployment success alone is not product QA.

### [#2412](https://github.com/chester-hill-solutions/callcaster/issues/2412) Use the same billing period in admin reconciliation
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-06
- Source repair is merged into dev. Candidate acceptance and default-branch promotion remain.
- Current behavior: PR #2413 merged one captured reference date and bounded provider/ledger period into the admin loader and both manual actions. Tests reach the actual admin boundaries, real scoped ledger report and stored snapshot with synthetic provider responses. Tenant, auth, error and existing notification behavior remain. Candidate provider/admin acceptance remains. Merge: 5cf7db6256cd585cfe28f4451418b89f814042e4. Recovery/source equivalence and topic cleanup are verified.
- Resolution: Verify the original acceptance on the release candidate and promote through the release workflow. Keep the native issue open until verification and default-branch promotion.
- Look in: `app/lib/platform-admin-twilio.server.ts`, `app/routes/admin+/workspaces/$workspaceId/loadTwilioData.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio.actions.server.ts`, `test/admin-workspace-twilio.route.test.ts`, `test/integration-db/admin-billing-period.test.ts`
- Existing tests: test/admin-workspace-twilio.route.test.ts; test/integration-db/admin-billing-period.test.ts
- Missing tests: Deployed release-candidate acceptance through the original criteria; default-branch promotion.
- Done when: The admin loader and both manual actions request bounded provider dates.; Each provider request and ledger report use the same captured reference date, including a midnight-boundary case.; Old provider activity outside the ledger period cannot create admin drift.; Both manual actions persist the correct admin snapshot. The loader retains its existing read behavior.; Existing auth, tenant scope, failures and notification behavior stay correct.; Tests execute the actual admin boundaries with synthetic provider responses and the real report/persistence path where practical. State the evidence limits.; Full local CI, applicable exact-head remote checks and both deployments pass before merge. Keep the issue open for release acceptance and default-branch promotion.
- Tracker: Merged source is available on clean dev. Verify candidate acceptance and promote before closure.

### [#2112](https://github.com/chester-hill-solutions/callcaster/issues/2112) The reconciliation SMS side divides a mixed SMS+MMS credit total by the SMS per-segment rate, while the Twilio side never reads mms-outbound — every MMS adds phantom segments
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-05
- The source repair is merged to dev; release-candidate acceptance remains.
- Current behavior: PR #2411 merged into dev as f811e7dd6f6671db7e4997d7b639551971e09184. Native issue evidence records the scoped source repair and completed local/remote gates. Current dev contains the merge. Candidate QA remains pending; preserve the original criteria.
- Root cause: The ledger loader has no message-kind fact, all SMS-key credits are divided by the SMS rate, and the provider matcher sums an outbound aggregate with its included subtypes.
- Resolution: Run the required release-candidate acceptance, then promote through the release PR. Keep the issue OPEN until required acceptance and default-branch promotion. Do not implement the landed source repair again.
- Look in: `app/lib/billing-reconciliation-alert.server.ts`, `app/lib/billing-reconciliation-snapshot.server.ts`, `app/lib/billing-reconciliation.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.BillingReconciliationPanel.tsx`, `shared/billing-reconciliation-alert.ts`, `shared/billing-reconciliation.ts`, `app/lib/billing-reconcile-workspace.server.ts`, `shared/pricing.ts`
- Existing tests: test/billing-message-reconciliation.test.ts; test/billing-reconciliation-alert.test.ts; test/billing-reconciliation.test.ts; test/integration-db/billing-message-reconciliation.test.ts; test/ui/billing-message-reconciliation.test.tsx; test/billing-reconcile-workspace.server.test.ts
- Missing tests: Required candidate acceptance from the current native issue; do not treat merged source or deployment success as release QA.
- Done when: A pure SMS case reconciles with zero variance; disabling SMS matching makes this test fail.; A workspace that sent only MMS reconciles with zero variance.; A workspace that sent a mix of SMS and MMS reconciles with zero variance.; Explicitly map the provider SMS/MMS usage categories that correspond to supported billed message kinds and test that mapping.
- Tracker: Verify and close after required acceptance and promotion. PR #2411 is merged to dev; deployment success alone is not product QA.

### [#2149](https://github.com/chester-hill-solutions/callcaster/issues/2149) An SMS campaign's outreach disposition is pinned to completed at send time and can never be updated by the delivery status
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-05
- The source fix is merged to dev; release acceptance and promotion remain.
- Current behavior: Merged in PR #2409 at dev@ee28af666b6b0fd30f3c8bca0aa55ec996c8a429. Preparation commits the pending outreach link before provider invocation, leaves acceptance unresolved and queues recovered terminal side effects before settling local state. Thirteen real database cases and 153 caller cases passed. Full local CI, final-head remote checks and both deployments passed.
- Resolution: Verify the release candidate against the original criteria and promote only after required acceptance. Do not implement the landed repair again.
- Look in: `app/lib/campaign-sms-send.server.ts`, `app/lib/sms-send.server.ts`, `app/lib/twilio-open-sync.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/campaign-queue-search.server.ts`
- Existing tests: test/campaign-sms-send.server.test.ts; test/sms-status-settled.test.ts
- Missing tests: Live provider/browser acceptance against the release candidate and default-branch promotion remain. Historical-row repair must be separately verified before claiming it is complete.
- Done when: A message the carrier reports `failed` appears under `failed` in the campaign queue filter (kill-check).; `undelivered` and `delivered` likewise.; A message that never receives a callback still reaches a terminal disposition (positive control).; The call path is unchanged.
- Tracker: Verify and close. PR #2409 is merged to dev. Keep the native issue OPEN for promotion and required acceptance; deployment success alone is not live provider proof.

### [#2150](https://github.com/chester-hill-solutions/callcaster/issues/2150) An intent row recovered by the status webhook never gets num_segments, so it is billed as a single segment no matter how long the message was
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-05
- The source fix is merged to dev; release acceptance and promotion remain.
- Current behavior: Merged in PR #2407 at dev@b2831f728f273dddb269277ca6034af02a14413b. Signed callback and provider recovery paths persist provider quantity before billing. Eighteen real database cases passed with independent fault checks and all three database URL modes. Full local CI, final-head remote checks and both deployments passed.
- Resolution: Verify the release candidate against the original criteria and promote only after required acceptance. Do not implement the landed repair again.
- Look in: `app/routes/api+/sms/status.action.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/twilio-open-sync.server.ts`
- Existing tests: test/sms-status-webhook.test.ts; test/webhook-side-effects.test.ts
- Missing tests: Live release-candidate acceptance and default-branch promotion remain.
- Done when: A recovered three-segment intent is charged for three segments using validated provider metadata. The test fails if segment persistence/provider fallback is removed.; A send-time-resolved intent is unaffected (positive control).; A row reaching a terminal status with `num_segments IS NULL` and a non-empty body is logged and surfaced in the reconciliation.; The reconciliation variance for a multi-segment blast is zero.
- Tracker: Verify and close. PR #2407 is merged to dev. Keep the native issue OPEN for promotion and required acceptance; deployment success alone is not live provider proof.

### [#2402](https://github.com/chester-hill-solutions/callcaster/issues/2402) Scope campaign queue disposition filters to the selected campaign
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-05
- Recommended title: **Scope campaign queue disposition filters to the selected campaign and workspace**
- Named and unknown disposition predicates now match the queue row campaign and workspace; PR #2405 is merged on dev.
- Current behavior: Verified dev@c704cdf9 / PR #2405: all 14 real Postgres query cases passed. Four separate predicate-removal controls failed with passing cases. Final full local CI, exact-head remote checks and both deployments passed.
- Root cause: Disposition EXISTS subqueries previously matched only contact_id, allowing results from another campaign or workspace.
- Resolution: Verify both disposition branches on the release candidate, then retain OPEN until default promotion and deployed acceptance.
- Look in: `app/lib/campaign-queue-search.server.ts`, `test/integration-db/campaign-queue-disposition.test.ts`
- Existing tests: test/integration-db/campaign-queue-disposition.test.ts
- Missing tests: Deployed release filter acceptance with one contact in multiple campaigns and isolated workspace data.
- Done when: A named disposition from another campaign cannot match a queue row in the selected campaign.; A null disposition from another campaign cannot satisfy the selected campaign unknown filter.; An attempt from another workspace cannot satisfy either disposition branch.; Same-campaign, same-workspace named and unknown results remain visible; unfiltered results and other filters keep their behavior.; Actual Postgres cases pass and fail when each scope predicate is removed. Full local CI, exact-head remote checks and both deployments pass before merge.; Keep this issue open for default promotion and deployed filter acceptance.
- Tracker: OPEN Verify and close. Source scope is fixed; delivery state ownership remains separate in #2149.

### [#2122](https://github.com/chester-hill-solutions/callcaster/issues/2122) DateTimePicker's displayed month is initialised from value and never re-synced, so the grid can show a stale month
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-05
- External date, cleared value and AM/PM mirrors are fixed on dev in PR #2404; release browser acceptance remains.
- Current behavior: PR #2404 merged at 4e132d1ca1530026a3bcc0850a34815e475204f3. Twelve real UI cases, three independent fault controls and 32 caller cases passed. Final full local and exact-head remote checks and deployments passed.
- Resolution: Verify saved-value changes, clearing and retained calendar navigation on the release candidate; keep OPEN through default promotion and acceptance.
- Look in: `app/components/ui/datetime.tsx`, `test/ui/datetime-external-value.test.tsx`
- Existing tests: test/ui/datetime-external-value.test.tsx; test/ui/components-ui-primitives.test.tsx
- Missing tests: Release-candidate browser acceptance for external values, clearing, period display and intentional navigation.
- Done when: A `value` change from April to May updates the displayed month (kill-check: remove the re-sync and confirm the test goes red).; Clearing `value` resets the month to the current month.; After an external value change, the displayed month follows that value; intentional calendar navigation remains possible.; `TimePicker`'s AM/PM re-syncs from `date` on the same kinds of change.; The rendered AM/PM Select follows external date changes and clearing; updating period state alone is insufficient while the Select uses defaultValue.
- Tracker: OPEN Verify and close. Source is merged and tested; default promotion and live browser acceptance remain.

### [#2140](https://github.com/chester-hill-solutions/callcaster/issues/2140) Settings member projection drops names from the manage-sheet heading
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-05
- PR #2399 merged target member names and username fallback in workspace settings. Default promotion and deployed acceptance remain.
- Current behavior: Source verified at dev@f8f40ffc, 2026-10-05. The settings projection retains both names. The actual member sheet shows available target names with existing capitalization and falls back to the target username when both are absent. The shared display contract requires nullable names. Invitations provide null fields; the admin producer and its fallback rows already preserve the same fields. Sheet structure, roles and form identities retain their existing behavior; no actor-name defect was established.
- Root cause: The settings projection discarded name fields while a partial consumer type hid the omission.
- Resolution: Promote PR #2399 to the default branch and verify named and unnamed target members in workspace settings. Confirm the selected target and mutation form IDs on the deployed product. Keep OPEN for release acceptance.
- Look in: `app/lib/workspace-members.ts`, `app/lib/workspace-settings-db.server.ts`, `app/components/workspace/TeamMember.tsx`, `app/routes/workspaces+/$id/settings.route.tsx`, `app/lib/platform-admin.server.ts`, `app/routes/admin+/workspaces/$workspaceId/invite.route.tsx`
- Existing tests: test/workspace-settings-db.server.test.ts; test/ui/team-member-a11y.test.tsx; Three service cases and seven actual shared-sheet UI cases passed. Each projected-name deletion failed one executed case; removing the username fallback failed two executed cases. The compiler rejected the missing required first_name projection. Sources were restored. Full local CI, exact-head remote checks, E2E and both deployments passed before merge.
- Missing tests: Default promotion and acceptance on the deployed product.
- Done when: Member sheet heading shows target first/last name.; When both names are absent, heading falls back to username.; Producer/consumer types require the name fields, even when null.; Other member list producers are reviewed; admin invite projection already includes names.
- Tracker: Keep OPEN in Verify and close. Development is linked to PR #2399. Preserve original criteria and separate source proof from release acceptance.

### [#2121](https://github.com/chester-hill-solutions/callcaster/issues/2121) Dismissing a query-param banner pushes a history entry, so Back resurrects it
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-05
- PR #2398 merged query-notice dismissal with history replacement. Default promotion and deployed acceptance remain.
- Current behavior: Source verified at dev@efb3bb54, 2026-10-05. QueryParamBanner dismissal replaces the history entry and preserves unrelated repeated parameters. Active URL-flash cleanup already replaces history. QueryParamBanner has no current product-route consumer; this fix preserves its rendering and does not adopt a new banner. Genuine filter and pagination navigation retain their existing history behavior.
- Root cause: QueryParamBanner cleared its URL parameter with a push instead of a replacement.
- Resolution: Promote PR #2398 to the default branch, then verify that an active flash does not replay after Back/Forward and that filter navigation retains its own entry. Keep OPEN for release acceptance.
- Look in: `app/components/shared/QueryParamBanner.tsx`, `app/hooks/utils/useSearchParamFlash.ts`
- Existing tests: test/ui/notice-query-history.test.tsx; test/ui/components-shared-smoke.test.tsx; Thirty focused UI cases passed, including six new actual shared-banner/flash-hook cases with a real memory router. Two independent replacement faults each failed one executed case. Full local CI, exact-head remote checks, E2E and both deployments passed before merge.
- Missing tests: Default promotion and acceptance on the deployed product. No current product-route banner adoption is claimed.
- Done when: Dismissing the banner then pressing Back does **not** restore the banner (kill-check: drop `{ replace: true }` and confirm the test goes red).; Dismissing still clears the parameter from the URL.; Every presentational-parameter clear in the app uses replace (a grep-verified list recorded in the issue).
- Tracker: Keep OPEN in Verify and close. Development is linked to PR #2398. Preserve original criteria and separate source proof from release acceptance.

### [#2308](https://github.com/chester-hill-solutions/callcaster/issues/2308) Show agent startup failure once
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-05
- PR #2395 merged one persistent startup Alert in stable reserved space. Default promotion and deployed acceptance remain.
- Current behavior: Source verified at dev@e011e04b, 2026-10-05. Loading and failure startup views share one fixed-height region and Back to workspace action. A startup error appears once through the real shared Alert. Long messages scroll inside a keyboard-focusable region without moving page landmarks or page scroll. Connected status-error handling, device checks, pending guards and session ownership retain their existing behavior.
- Root cause: Startup failure was passed to StatusBar and rendered again in an outer Alert.
- Resolution: Promote PR #2395 to the default branch, then verify one token/runtime startup message, recovery navigation, pending controls and stable page geometry in the deployed product. Separate connected-status placement and runtime retry concerns are not resolved by this atomic startup presentation fix.
- Look in: `app/components/agent/AgentDesktop.tsx`, `app/components/calls/SoftphonePanel.tsx`, `docs/design-system.md`
- Existing tests: test/ui/agent-startup-feedback.test.tsx; test/ui/agent-desktop.test.tsx; Ten focused component cases passed. Four independent source faults each failed one executed case; removing the region height failed real-browser geometry. Desktop/narrow and light/dark cases each kept six transitions stable, including keyboard scrolling of long messages. Full local CI, exact-head remote checks, E2E and both deployments passed before merge.
- Missing tests: Default promotion and acceptance on the deployed product. Browser tests used isolated router/device boundaries and did not send provider calls.
- Done when: One visible result for one failed action.; Preserve genuine field validation, permissions, hard gates, entered values and retry.; No page or scroll movement on appearance, update or removal.
- Tracker: Keep OPEN in Verify and close. Development is linked to PR #2395; preserve original criteria and separate release acceptance from source proof.

### [#2131](https://github.com/chester-hill-solutions/callcaster/issues/2131) Predictive "Start Dialing" is a silent no-op when the campaign has no caller ID, and the error is discarded
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-05
- PR #2394 merged predictive start prerequisites, pending protection and safe once-only root feedback into dev. Default promotion and deployed acceptance remain.
- Current behavior: Source verified at dev@9f33f3e7, 2026-10-05. Missing caller ID/device disables the existing shared predictive start control with a reason. A synchronous pending lock prevents repeated requests before acknowledgement. Known route failures use safe recovery text; unknown/malformed/server replies use a stable retry message. Credit recovery is role-appropriate and adds no inline banner.
- Root cause: The call-screen contract discarded start error/loading state, and the client adapter exposed raw response text.
- Resolution: Promote PR #2394 to the default branch and verify missing prerequisites, server and credit failures, pending/double-click protection, retry and manual/connected controls on the deployed product. Keep OPEN until release acceptance.
- Look in: `app/hooks/call/useStartConferenceAndDial.ts`, `app/hooks/call/useCallScreen.ts`, `app/components/call/CallScreen.Layout.tsx`, `app/components/call/CallScreen.CallArea.tsx`, `app/lib/services/hooks-api.ts`
- Existing tests: test/startConferenceAndDial.test.ts; test/services-api.test.ts; test/ui/predictive-start-feedback.test.tsx; test/ui/hooks-call-screen.test.tsx; 45 focused Node cases and 50 UI cases passed. Ten independent source faults failed one executed case each. Browser geometry stayed fixed at desktop/narrow widths in both themes through 11 states each. Full local CI, exact-head remote checks, E2E and both deployments passed before merge.
- Missing tests: Default promotion and acceptance on the deployed product. Local start responses were loopback fixtures; no live provider call was sent.
- Done when: With `campaign.caller_id === null`, the Dial button is disabled and the reason is visible (kill-check: remove the `disabled` condition and confirm the test goes red).; With no device selected, same.; When the server rejects a start for any reason, the error reaches the user through a toast, not only the log (kill-check: drop the toast and confirm the test goes red).; The positive control: a configured caller ID and a device → the button is enabled and the start path runs.
- Tracker: Keep OPEN in Verify and close. Development is linked to PR #2394; preserve original criteria and separate release acceptance from source proof.

### [#2118](https://github.com/chester-hill-solutions/callcaster/issues/2118) A malformed known feature flag disables valid sibling flags
- Verdict: **Verify and close** · Size: XS · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-05
- Independent feature-flag reads and safe workspace diagnostics merged through PR #2382. Deployed functional acceptance and release remain open.
- Current behavior: Source fix dev@9f4bb125: requested flags use strict === true independently. Known-key diagnostics at the client projection, server workspace read and batch-worker flag read include only workspace ID and invalid key names. Stored values, defaults and batch policy stay unchanged. All 24 actual-reader PostgreSQL cases passed locally and in the final-head remote E2E job; all 68 focused Node cases passed. Six independent faults fail the relevant cases and exact restoration passes.
- Resolution: Verify deployed client, server and batch-worker behavior with malformed known siblings and valid requested flags, confirm safe workspace diagnostics, then promote to the default branch before closure.
- Look in: `app/lib/feature-flags.ts`, `app/lib/workspace-feature-flags.server.ts`, `app/lib/workspace-client-projection.server.ts`, `app/lib/workspace-members-db.server.ts`, `app/lib/worker/handlers/elevenlabs-batch-transcribe.server.ts`, `test/feature-flags.test.ts`, `test/workspace-feature-flags.server.test.ts`, `test/integration-db/workspace-feature-flags.test.ts`
- Existing tests: 68 focused Node cases cover flags, diagnostics, TwiML and live-media route controls.; 24 real PostgreSQL cases exercise the three actual readers, real TwiML/token signing, safe client projection, unchanged stored JSON and foreign-workspace isolation. Final-head remote E2E job 111588289870 ran all 24 successfully.; Six faults cover whole-object parsing, loose truthiness, removed diagnostics and each removed server call site; exact restoration passes 24 database and 36 focused Node cases.
- Missing tests: Deployed client, server and batch-worker acceptance with malformed known siblings and safe diagnostics; default-branch promotion.
- Done when: A true requested flag remains true when another known flag contains a wrong type.; A requested flag with a wrong type returns false.; A missing requested flag returns false.; Diagnostics for malformed stored known flags identify the key and workspace at a call site with workspace context.
- Tracker: Keep #2118 open in Verify and close after PR #2382 merged into dev. on-dev workflow 37255076883 moved one issue; a deployment success is not deployed functional acceptance.

### [#2355](https://github.com/chester-hill-solutions/callcaster/issues/2355) Reject invalid audio campaign targets before storage
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-05
- The audio campaign target precheck is merged through #2379. Invalid identifiers return 400 and missing or foreign campaigns return 404 before application file allocation or storage work.
- Current behavior: dev@63fecfa0 validates the campaign ID and reads the target through findCampaignInWorkspace before file allocation, upload, signing or update. Valid attachment retains 201. A missing or failed final update cannot report success. Real campaign deletion during upload returns failure. Object lifecycle work remains under #2356.
- Root cause: Resolved by #2379: the old action checked campaign existence only at the final update and used an unchecked Number conversion.
- Resolution: Verify the deployed /api/media endpoint and promote #2379 to the default branch before closure. Keep #2356 separate: uncertain outcomes, durable object ownership and physical reclamation are not resolved by this precheck.
- Look in: `app/routes/api+/media.action.server.ts`, `app/lib/campaign-ivr.server.ts`, `app/lib/handler.server.ts`, `app/lib/object-storage.server.ts`, `test/integration-db/media-campaign-target.test.ts`, `docs/api-data-management.md`
- Existing tests: All 25 actual-action PostgreSQL cases pass locally and in final-head remote job 111576750987 (run 37250419783). They use native multipart, real membership and scoped campaign reads/updates; session resolution and external storage are fixtures in this tier.; All 44 existing upload controls pass. Three independent faults remove the target precheck, identifier parser or empty-update guard; each fails relevant cases and exact restoration passes all 25.; All 25 production-build HTTP requests pass with genuine Better Auth sessions, real membership/campaign rows, native multipart and real URL signing. Valid MP3, WebM and OGA attach only to the owned campaign. Invalid, missing, foreign and sessionless targets have no application file allocation or S3 send. Real campaign deletion during upload returns failure. S3 SDK send is a provider fixture; no physical bucket acceptance or cleanup is claimed.; Full npm run ci:local and exact-head remote checks pass at a5e6d9123f7b1b8286b84ed09b51417db8ba1fc8; both deployments pass. Squash source equivalence is verified at 63fecfa07b7777cee052bffc1317c8e6de9d43cc.
- Missing tests: Deployed functional acceptance with the real bucket remains open. Confirm invalid/missing/foreign target rejection, valid 201 attachment and truthful final-update failure.; Default-branch release remains open; retain the native issue until release and required verification complete.
- Done when: Missing, non-numeric, non-finite, non-integer and invalid campaign IDs are rejected with 400 before media work.; A nonexistent or foreign-workspace campaign returns 404 before File.arrayBuffer, upload, signing or update. No global campaign accessor is used.; A valid campaign in the requested workspace retains its 201 response and updated audio URL.; A failed or empty final update cannot report success. Durable object reconciliation, safe deletion and uncertain outcomes are retained in #2356; this precheck does not claim to solve them.; The current workspace access guard, limits, source cancellation, safe keys and audio formats remain intact.; Real action tests cover invalid/foreign/missing targets, a valid target, failed attachment and zero unintended storage work before target validation. Break the precheck and confirm the relevant test fails.; Full local gates and exact-head remote checks pass; deployed functional acceptance and release promotion remain open.
- Tracker: Keep #2355 open in Verify and close for deployed functional acceptance and default-branch release. Its source fix is verified in #2379. Keep physical object reconciliation and uncertain attachment outcomes under #2356.

### [#2141](https://github.com/chester-hill-solutions/callcaster/issues/2141) addInboundQueueMember accepts any user_id, including non-members of the workspace
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-04
- Recommended title: **Verify workspace-scoped inbound queue member assignments**
- The shared service validates queue ownership, target membership and global-user existence before insertion. Both actual add routes return clear 400 validation errors.
- Current behavior: PR #2373 merged to dev as 9fa9d582 on 2026-10-04. The service refuses foreign queues and foreign or missing users, including stale memberships. Both routes map validation to 400; valid assignments succeed and unexpected database failures retain 500. The tested source and squash merge match. Full local CI, both reviews, remote checks and both deployment checks passed. Deployed acceptance and default-branch release remain.
- Root cause: The shared service inserted caller-selected queue and user IDs without checking queue ownership or target membership. The global-user FK could reject nonexistent users only after insertion was attempted, producing 500. Canonical membership can be stale, so the service now also checks global-user existence.
- Resolution: Run deployed dev acceptance through both real add routes for foreign user, nonexistent user with and without stale membership, foreign queue, caller refusal and valid member assignment. Promote the verified fix to the default branch before closure. A read-only dev review database audit found 0 total queue-member rows and 0 invalid rows; no cleanup was required and no rows changed. This is not a production-data audit. A membership FK migration needs its own key-upgrade and member-removal policy.
- Look in: `app/lib/inbound-queue-db.server.ts:107`, `app/routes/api+/inbound-queue.action.server.ts:97`, `app/routes/workspaces+/$id/settings/queues.action.server.ts:96`, `test/integration-db/inbound-queue-members.test.ts`, `app/db/schema-inbound-queue.ts`, `app/lib/workspace-members-db.server.ts`
- Existing tests: 22 real PostgreSQL route/service cases passed: invalid target and queue controls, stale membership, valid same-workspace rows, caller refusal and unexpected database failure.; Six injected faults failed their regression tests; exact restored source passed all 22 cases.; 14 actual session/HTTP cases passed against the final production build for both add routes.; Full ci:local passed 4,625 Node, 33 Bun and 1,054 UI tests, all guards, production build, bundle check and codegen verification.
- Missing tests: Repeat the actual add-route acceptance checks on deployed dev.; Default-branch promotion and release verification before closure.
- Done when: Both real add-member routes reject an existing foreign-workspace user with 400 and no insert.; Both routes reject a nonexistent user with a clear 400 rather than the current database-error 500.; The shared service rejects a queue belonging to another workspace.; A valid member and queue in the same workspace succeed.; An authorized existing-row audit records its count and cleanup result; this source audit does not claim live data was inspected.
- Tracker: Source fix is merged and reviewed on dev. Verify deployed acceptance and promote before closing; do not implement the membership validation again.

### [#2137](https://github.com/chester-hill-solutions/callcaster/issues/2137) The billing/ledger loader has no role gate — any member, including caller, reads the full credit history
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-04
- Recommended title: **Verify administrator-only workspace billing reads**
- The billing page and activity service require Admin on dev. Direct document and JSON checks refuse caller/member roles and permit admin/owner roles.
- Current behavior: PR #2370 merged to dev as 486de78e on 2026-10-04. The page throws 403 before billing reads for caller/member roles; the activity service also requires Admin. The existing JSON read stays session-only Admin, with non-member 404. Final full local CI and both reviews passed; the isolated production browser run passed 5/5. Remote CI, E2E and both deployment checks were green for the tested head. Deployed acceptance and default-branch promotion remain.
- Root cause: The page loader and activity service proved membership without an Admin floor. The server now enforces the existing billing policy before reads. The new sibling role guard records 11 exact pre-existing permission gaps for separate work.
- Resolution: Verify direct billing page and JSON requests on deployed dev for caller/member refusal and admin/owner access, then promote before closing. Existing baseline gaps remain separate audits; the JSON checkout role gap is tracked in #2371.
- Look in: `app/routes/workspaces+/$id/billing.loader.server.ts:15`, `app/lib/billing-activity.server.ts:202`, `app/routes/api+/workspaces+/$workspaceId/billing.loader.server.ts:11`, `scripts/lib/route-read-role-floor.mjs`, `scripts/baselines/route-read-role-floor.json`, `test/billing-read-access.test.ts`, `test/route-read-role-floor.test.ts`, `e2e/specs/rbac.spec.ts:83`
- Existing tests: Actual auth and membership controls: caller/member 403, admin/owner 200, non-member 404 and session-only JSON reads.; 64 focused cases passed. Nine faults made regressions fail; restored source passed again.; Full ci:local passed 4,625 Node, 33 Bun and 1,054 UI tests, all guards, build, bundle check and codegen verification.; Isolated production browser checks passed 5/5, including document and JSON status assertions for all four roles; no retry or skipped case.
- Missing tests: Deployed dev browser acceptance for direct page and JSON requests with all four roles.; Default-branch promotion and release verification before closure.
- Done when: A `caller` and a `member` receive 403 on the billing loader (kill-check: remove the gate and confirm the test goes red).; An `admin` and the `owner` receive 200.; The API path enforces the same floor.; The e2e RBAC spec asserts a loader status, not only nav visibility.
- Tracker: Source fix merged and reviewed on dev. Run deployed acceptance and promote before closing; do not implement the billing read gate again.

### [#2354](https://github.com/chester-hill-solutions/callcaster/issues/2354) Preserve workspace denial status on audio media uploads
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-04
- Known workspace denials retain 404/403 under merged #2357. Deployed acceptance and release remain.
- Current behavior: dev@8ae867ed includes #2357 at tested head 23950884. The route rethrows known AppError instances to its existing mapper, preserving safe 404/403 responses before file allocation or media work. Unknown failures remain 500.
- Root cause: The route catch swallows the known AppError before defineAction can map it.
- Resolution: Verify deployed denials, successful uploads, unknown failures and retry behavior, then promote through the release PR.
- Look in: `app/routes/api+/media.action.server.ts`, `app/lib/campaign-ivr.server.ts`, `app/lib/handler.server.ts`, `app/lib/object-storage.server.ts`
- Existing tests: Seven actual-route cases reproduce two denial failures and five passing controls. The fix passes 50 affected cases; removing passthrough fails both denials, restoring passes seven. Both source and final full local gates passed.; Exact final local gate passed at 23950884. Remote quality executed seven denial cases, 34 boundary cases and six stream cases; all applicable checks, e2e and both app/worker deployments passed before merge.
- Missing tests: Deployed functional acceptance and release promotion remain. Green deployment contexts are not functional QA.
- Done when: A non-member response is 404 with the safe workspace-not-found message and no file allocation, upload, URL signing or campaign update.; A known 403 role denial retains 403 and also does no media work.; A permitted session user still receives 201 for a valid upload. Unauthenticated and API-key-only callers remain refused.; Unknown storage/update failures remain failures. No exception details are added to user responses.; File and encoded body limits, source cancellation, safe keys and accepted formats remain covered.; Real action tests fail if the catch again maps known denials to 500. Full local gates and exact-head remote checks pass.; Verify the deployed response and failure/retry behavior before release promotion. Keep the issue open until then.
- Tracker: Source complete under #2357. Preserve the open Bug until deployed acceptance and default-branch release.

### [#2136](https://github.com/chester-hill-solutions/callcaster/issues/2136) POST /api/media lacks the file-size limit enforced by its sibling route
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-04
- The shared file cap, bounded body reader and safe audio keys are merged in #2353. Deployed functional acceptance and release promotion remain.
- Current behavior: dev@cea31c69 includes merged #2353. Both routes enforce the 10 MiB file policy before application allocation/storage. The encoded reader limits actual bytes to 10 MiB + 64 KiB and cancels overflow even without a truthful Content-Length. Random safe audio keys exclude campaign text. WebM audio remains supported by the native Bun parser; MMS still rejects it. No peak-memory or one-copy claim is made.
- Resolution: Verify the deployed exact-cap, oversize, malformed, stream-cancellation and WebM paths, then promote through the release PR. Measure peak memory/concurrency before making memory capacity claims.
- Look in: `app/lib/bounded-form-data.server.ts`, `app/lib/media-upload.server.ts`, `app/routes/api+/media.action.server.ts`, `app/routes/api+/message_media.action.server.ts`, `test/media-upload-boundary.test.ts`, `test/bounded-form-data.test.ts`, `test/media-upload.runtime.test.ts`
- Existing tests: 101 focused Node cases and 11 native Bun media cases passed. Six Node faults and a Bun WebM fault failed the relevant contracts; restored controls passed.; Full ci:local passed at exact reviewed head a574eefc. Remote quality ran 34 route, six stream and 11 native Bun media cases; applicable checks, e2e and both deployment contexts were green before merge.
- Missing tests: Deployed functional acceptance for valid/invalid and streamed uploads, failure/retry behavior and WebM compatibility remains. Process peak-memory and concurrent-request capacity have not been measured.
- Done when: An oversized file is rejected before file.arrayBuffer or storage work runs.; A file at the shared cap succeeds on both routes.; The request/multipart reader has an explicit tested bound so rejection does not depend solely on already materialized formData.; campaignName cannot control the storage key's path structure.; Memory claims describe measured allocations; they do not require an unsupported one-copy guarantee.
- Tracker: Source complete under #2353. Keep the native Bug open for deployed functional acceptance and default-branch promotion; deployment green is not QA.

### [#2350](https://github.com/chester-hill-solutions/callcaster/issues/2350) Retain the original audience CSV before import starts
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-04
- PR #2351 merged original audience CSV retention into dev at ee225fc3. Store exact private immutable bytes before campaign linking, existing-audience status changes and job enqueue. Storage failure persists the failed upload without those effects. Deployed acceptance and release remain.
- Current behavior: Original BOM/UTF-8/CRLF/multiline bytes are stored at {workspaceId}/{uploadId}/original.csv, separate from status sidecars and job retention. Reuses existing storage, tenant failure update and typed enqueue APIs. No report UI or whole-run recovery is introduced.
- Root cause: The route previously queued imports without a durable original file; completed job payloads are pruned after seven days.
- Resolution: Verify applicable deployed private original storage, failed-upload behavior and release promotion. Keep #1771 per-row reporting and #2128 recovery open.
- Look in: `app/routes/api+/audience-upload.action.server.ts`, `app/lib/audience-upload-db.server.ts`, `app/lib/object-storage.server.ts`, `test/audience-upload-original.test.ts`
- Existing tests: 11 actual-route/real-CSV artifact cases and 50 focused upload/route cases pass. Byte equality, immutable concrete path/options, held acknowledgement, failure ID/tenant predicate, campaign link and denied/foreign controls are covered.; Original source/removing storage and early enqueue each fail five cases; altered bytes/wrong failed-upload ID each fail one; early campaign link fails two. Restored source passes 11.; Both full local gates, both independent reviews, all applicable exact-head remote checks and both app/worker deployments passed. Successful remote quality ran all 11 cases; branch/worktree cleanup verified source equivalence and recovery bundle.
- Missing tests: Applicable deployed storage/upload functional acceptance and default-branch release promotion.
- Done when: Exact original bytes retained privately and immutably at server-created workspace/upload path before enqueue.; Storage failure truthfully persists failed upload; no campaign link, existing-audience status change or queued import.; Denied/foreign and invalid input perform no artifact or queued import; valid own-workspace control succeeds.; Original is separate from status sidecar and completed-job pruning; no public/unauthenticated retrieval.; Full local CI per pushed head, independent reviews, remote gates, both deploys, deployed acceptance and release verified.
- Tracker: Verified native Task under #1771, source completed in PR #2351. Keep open for deployed acceptance and release; does not complete parent reporting or #2128 recovery.

### [#2348](https://github.com/chester-hill-solutions/callcaster/issues/2348) Normalize opt-out values in the audience upload path
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-04
- PR #2349 merged normalization into dev at 0b72f37d after both full local gates, both reviews, applicable remote checks and both deployments passed. Mapped opt-out cells reach insertion as booleans through the existing total parser. Deployed acceptance and release remain required.
- Root cause: The real upload uses generic lib/csv and previously wrote mapped opt-out values as raw strings, bypassing the standalone parser fixed in #2250.
- Resolution: Verify the applicable deployed import behavior and release promotion. Keep broader reporting and failure/re-upload acceptance under parent #2128 and existing #1771; do not close the parent from this normalization-only Task.
- Look in: `app/lib/audience-upload-process.server.ts`, `app/lib/csv-contacts.ts`, `test/audience-upload-opt-out.test.ts`, `test/csv-opt-out-parsing.test.ts`
- Existing tests: 25 real server upload cases: explicit opt-out, permitted, blank, unknown and unmapped values; case-insensitive mapping, phone/custom data and successful completion controls.; 111 focused upload, standalone parser, route and phone dedupe cases pass.; Original source and removal of normalization each fail 24 cases with one unmapped control passing. A false unknown fallback fails 12 cases with 13 controls passing; restored source passes all 25.; Successful final-head remote quality job executed all 25 server upload cases; both full local gates, reviews, applicable remote checks and both deployments passed.
- Missing tests: Applicable deployed upload acceptance and release/default-branch verification.
- Done when: Mapped opt-out cells reach contact insertion as expected literal booleans through one canonical parser.; Existing value policy, unmapped default, other fields, custom data, phone normalization and completion remain correct.; Full local CI, both independent reviews, applicable remote gates and both deployments pass before merge.; Applicable deployed upload behavior and release promotion are verified.
- Tracker: Native Task under #2128; source completed and merged in PR #2349. Keep this Task open for deployed acceptance and release. Parent reporting and durable recovery requirements remain open.

### [#2320](https://github.com/chester-hill-solutions/callcaster/issues/2320) Download the current survey CSV on the first export click
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-04
- The first-click and stale survey-download fix merged into dev through PR #2322. Deployed acceptance and promotion remain pending.
- Current behavior: Source fix at dev@96229009: the shared shad-cc outline Button links to the protected CSV attachment route. Full local CI passed on final head f513f4e5; remote quality, bundle, browser checks and both deployments succeeded. The real local production browser passes first download, a changed answer on a later export, attachment headers and foreign-workspace 404. The original page fails the first download while its direct CSV control passes.
- Root cause: The old async export handler read the captured render value of exportFetcher.data after load(), which did not replace that value.
- Resolution: Verify first and repeated protected CSV downloads with changed saved data on the deployed review environment. Retain the shared Button position and styling, authorization, attachment filename, CSV protection and no-store policy. Promote through the release process after acceptance.
- Look in: `app/routes/workspaces+/$id/surveys/$surveyId/responses.route.tsx`, `app/routes/workspaces+/$id/surveys/$surveyId/responses/export.loader.server.ts`, `app/lib/csv.ts:csvResponse`, `app/components/campaign/home/CampaignHomeScreen/CampaignExportButton.tsx`
- Existing tests: test/ui/survey-export-link.test.tsx: two actual-page link cases, original-action fault proof.; e2e/specs/survey-admin.spec.ts SURV-11: real first and repeated download, fresh saved answer, attachment/no-store headers, foreign-workspace 404; original first-download failure and restored pass.; test/integration-db/survey-response-columns.test.ts retains workspace-isolation and CSV protection controls.
- Missing tests: Deployed review-browser protected-download acceptance for the first click and a later changed answer; release promotion.
- Done when: The first click downloads current survey data; a later click requests current data again.; Keep the shared Button geometry and action position.; Keep workspace authorization, attachment filename, CSV formula protection and no-store policy.; Real browser proves two downloads and updated saved answers; deployed acceptance remains explicit.
- Tracker: PR #2322 merged to dev at 96229009. Keep the native issue open until deployed browser acceptance and release promotion are verified. The separate response-column fix is #2317; historical response assessment remains #2292.

### [#2317](https://github.com/chester-hill-solutions/callcaster/issues/2317) Keep survey response columns tied to saved questions
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-04
- The saved-question response-column fix merged into dev through PR #2319. Deployed acceptance and promotion remain pending.
- Current behavior: Source fix at dev@5af3f675: response table and CSV columns match saved numeric question IDs. Header and cell keys use those IDs. Five actual-page and seven real-Postgres cases pass; original lookups fail four cases in each suite. Final-head full local CI, remote quality/bundle/deployments and E2E passed (181 database, 123 browser cases).
- Root cause: Response columns use a page-local public label instead of the saved question identity.
- Resolution: Verify distinct repeated-label columns and an unanswered column on the deployed response page and direct CSV attachment route. Preserve headers, order, checkbox formatting, formula protection and workspace isolation. Promote through the release process after acceptance.
- Look in: `app/lib/survey-responses.server.ts:buildSurveyResponsesCsv`, `app/routes/workspaces+/$id/surveys/$surveyId/responses.route.tsx`, `app/lib/survey-format.ts`, `test/survey-responses.route.test.ts`
- Existing tests: test/ui/survey-response-columns.test.tsx: five page cases and duplicate-key fault proof.; test/integration-db/survey-response-columns.test.ts: seven real-Postgres CSV cases, two selected-URL configurations, original-lookup fault proof.
- Missing tests: Deployed response-page and CSV attachment acceptance for repeated labels and unanswered columns; release promotion.
- Done when: Repeated-label columns show the answers for their distinct saved questions in both table and CSV.; An unanswered question retains its existing placeholder and CSV sanitizer escape; single-page/checkbox behavior and access controls remain.; Use unique internal question identities for header and cell keys.
- Tracker: PR #2319 merged to dev at 5af3f675. Keep native issue open pending deployed acceptance and promotion. The separate export-click defect is #2320; historical response assessment remains #2292.

### [#2294](https://github.com/chester-hill-solutions/callcaster/issues/2294) Keep public survey answers scoped to their page
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-04
- Public survey answer and write-in state use page/question identity. Source verification passed; deployed public-form acceptance and promotion remain.
- Current behavior: PR #2316 merged at dev@ec6ff792: the reader, local answers, write-in drafts and save queue share one page/question key. Resume excludes foreign-survey question rows without changing stored data.
- Root cause: The form and resume reader treat a page-scoped label as a survey-wide identity.
- Resolution: Verify the deployed public form with repeated labels through Next/Previous and reload, including checkbox/write-in state; then promote the tested source. Historical stored-data assessment stays in #2292.
- Look in: `app/lib/survey-answer-state.ts`, `app/lib/survey-responses.server.ts`, `app/routes/survey+/$surveyId.loader.server.ts`, `app/routes/survey+/$surveyId.tsx`, `app/hooks/surveys/useSurveySubmission.ts`, `test/ui/survey-answer-page-scope.test.tsx`, `test/integration-db/survey-respondent-identity.test.ts`
- Existing tests: Focused actual-page UI controls: 25 passed. Focused real-Postgres controls: 16 passed.; Full local CI: 4323 node tests passed with 11 existing skips, 22 Bun tests passed, 1008 UI tests passed. Full native Postgres tier: 174 passed, no skips.; Fault proof: original reader six failures/ten controls; survey ownership removed one/fifteen; page identity removed ten/fifteen UI controls. Restored source passes.
- Missing tests: Deployed public-form repeated-label navigation/reload and write-in acceptance before promotion.
- Done when: Each page retains its own displayed, resumed and write-in answer.; An unanswered question stays empty when another page has the same public label.; Single-page resume, checkbox hydration and signed identity remain valid.; A page-scope removal makes the new tests fail.; Resumed foreign-survey question references cannot replace owned answers; stored rows are unchanged.
- Tracker: Source fix in PR #2316; keep open for deployed acceptance and promotion. Project Status remains unverified by the local token.

### [#2058](https://github.com/chester-hill-solutions/callcaster/issues/2058) Rule and inventory: inline error text used where a toast belongs
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- PR #2302 completed the feedback rule and reviewed source inventory on dev; consumer conversions are separate work.
- Current behavior: Source audit: dev@5ad088c4, 2026-10-03. docs/design-system.md defines no movement on appearance, update and dismissal. docs/feedback-inventory.md records 76 error candidates, 79 Alert sites, supplemental status owners and five duplicate groups. Both review axes and full local/remote checks passed. No runtime conversion or deployed browser acceptance is claimed.
- Root cause: No written rule distinguishing field-level from page-level error presentation, so each site was decided locally.
- Resolution: Verify the documentation deliverable after promotion, then close. Implement consumer changes separately under #2300 and #2304–#2308.
- Look in: `docs/design-system.md`, `docs/feedback-inventory.md`, `docs/design-system-audit.md`
- Existing tests: Full local CI for PR #2302: 5,322 Vitest tests and 22 Bun tests; remote checks and both deployments passed.
- Missing tests: Promotion of the documentation deliverable; runtime conversions are separate acceptance.
- Done when: A written rule exists where a contributor will find it; Every inline error site is listed with a keep-or-change verdict and a reason; Pages rendering the same failure twice are identified; Changes, if any, land in reviewable batches after the inventory, not mixed into it; No form validation is removed in the name of consistency
- Tracker: Verify and close. PR #2302 is merged into dev at 5ad088c4; keep separate consumer issues open.

### [#2295](https://github.com/chester-hill-solutions/callcaster/issues/2295) Confirm bulk-send warning overrides explicitly
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The bulk-volume override has an explicit confirmation with recipient count, delivery risk and a Send anyway choice.
- Current behavior: Source change based on clean dev@a3d9fc40. The existing campaign-level local-number override is reused with Are you sure?, the actual queued contact count and delivery risk. Confirmation permits launch and does not dispatch immediately. Cancel, Escape and reopen require a fresh acknowledgement; pending confirmation locks the shared Checkbox and confirmation, with retry after failure. FormField uses matching visible label/control IDs. Existing admin/workspace guard, readiness rules, active notice, removal and splitting remain. Seven actual UI cases and 42 surrounding readiness/settings cases pass; original UI fails 5 with 2 controls; six faults fail and source is restored. Independent review is clear; full local/remote gates are required before merge.
- Root cause: The existing override wording did not use the requested explicit confirmation, and cancelled acknowledgement could persist on reopening. The custom Checkbox was not explicitly locked during the request.
- Resolution: Verify deployed bulk-volume warning count, explicit acknowledgement, Cancel/Escape/fresh reopen, pending double click, failure retry and active override removal. Keep other readiness and consent/opt-out enforcement. Promote before closure.
- Look in: `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx`, `app/routes/workspaces+/$id/campaigns/$selected_id/settings.action.server.ts`, `app/lib/campaign-readiness.ts`
- Existing tests: test/ui/split-campaign-override.test.tsx; test/campaign-readiness.test.ts; test/campaign-settings.route.test.ts
- Missing tests: Deployed dev browser verification and promotion.
- Done when: Show Are you sure?, real queued count, delivery risk, Cancel and Send anyway.; Require risk acknowledgement; Cancel/Escape sends nothing and reopening resets it.; Pending confirmation locks custom Checkbox and prevents a second request.; Failed confirmation is retryable without successful override state.; Keep existing workspace/admin authorization, readiness and recipient consent/opt-out boundaries.
- Tracker: User-authorized source change in this atomic PR; keep open for deployed verification and promotion.

### [#2108](https://github.com/chester-hill-solutions/callcaster/issues/2108) Save all pending survey answers before completion
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Each respondent keeps pending answers by page and question. Next and Submit await save acknowledgements; Thank You awaits completion success.
- Current behavior: Merged to dev in PR #2296 at a3d9fc40. Page/question revisions drain serially through the existing form client. Next and Submit await successful answer acknowledgements; Thank You awaits completion success. Failures retain retryable form values; a completed write does not remove a newer edit. Busy controls include explicit shared Checkbox disable. Respondent unmount cancels timers and requests; shared Sidebar debounce also cleans up. All 32 focused cases pass; original fails 16 with 16 controls; nine faults fail and source is restored. Full local CI passed 5,318 Vitest and 22 Bun; all remote and both Railway gates passed on 29115361. Source prerequisite #2125 is fulfilled. Verify deployed dev and promote before closure.
- Root cause: One timer discarded earlier question saves, and navigation/completion did not wait for successful action acknowledgements. The form owner remained mounted after optimistic completion; true unmount did not cancel timers.
- Resolution: Verify deployed rapid edits, repeated labels across pages, immediate final submit, delayed and failed saves/completion, recoverable retry, respondent change and route unmount. Keep required-answer policy #2107, page-scoped display/resume #2294 and historical assessment #2292 separate. Promote before closure.
- Look in: `app/hooks/surveys/useSurveySubmission.ts`, `app/routes/survey+/$surveyId.tsx`, `app/hooks/utils/useDebounce.ts`
- Existing tests: test/ui/survey-save-order.test.tsx; test/ui/debounce-owner-unmount.test.tsx; test/ui/survey-respondent-identity.test.tsx; test/ui/hooks-utils.test.tsx
- Missing tests: Deployed dev browser verification and promotion.
- Done when: Submitting within 1s of typing the last answer persists that answer (kill-check: remove the flush and confirm the test goes red).; No timer survives unmount in any `useDebounce` consumer (a test that unmounts mid-debounce and asserts no submit fires).; The answer write is observably ordered before the completion write.; A blank answer to a required question is still caught (the related issue) — the two must compose.; Changing multiple questions within the debounce interval does not cancel another question's pending save.; Completion waits for successful answer persistence, not only for the answer request to start.; Answer or completion failure keeps a recoverable form and does not show a false success card.
- Tracker: Merged source fix; verify deployed dev and promote before closure. Required validation, displayed/resumed page identity and historical assessment stay separate.

### [#2125](https://github.com/chester-hill-solutions/callcaster/issues/2125) Keep one signed respondent identity through the public survey
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- The public loader signs one respondent ID, keeps it in a scoped browser cookie and passes its token to every answer and completion. Completion requires an actual saved row.
- Current behavior: Merged to dev in PR #2293 at be7f2312. Signed respondent identity is authoritative, tokenless writes fail, and the scoped HttpOnly cookie resumes the exact saved response. Trusted bigint survey/contact IDs are normalized. Checkbox arrays resume correctly, respondent change resets state, and completion must affect a saved row. All 68 focused cases pass; original runtime fails 21 with 47 controls; ten faults fail. Full local CI passed 5,299 Vitest and 22 Bun tests; all remote and both Railway gates passed on 3700fdb2. Issue-on-dev moved one item. Required-answer policy, save ordering and historical assessment remain separate. Verify deployed dev and promote before closure.
- Root cause: The page omitted the signed token, and tokenless writes minted a fresh ID for each request. Completion reported success without checking the affected row.
- Resolution: Verify deployed public three-answer persistence, anonymous/contact reload, scoped token rejection and missing-row API failure. Required-answer enforcement is separate #2107; flush/save/completion acknowledgement and the premature Thank You screen are separate #2108. Historical fragments require read-only assessment #2292. Promote before closure.
- Look in: `app/routes/survey+/$surveyId.loader.server.ts`, `app/routes/survey+/$surveyId.tsx`, `app/lib/survey-public-action.server.ts`, `app/lib/survey-respondent-token.server.ts`, `app/lib/survey-respondent-cookie.server.ts`, `app/lib/survey-db.server.ts`, `app/lib/survey-responses.server.ts`
- Existing tests: test/survey-answer.route.test.ts; test/survey-complete.route.test.ts; test/survey-public-loader.route.test.ts; test/survey-respondent-token-cookie.test.ts; test/ui/survey-respondent-identity.test.tsx; test/integration-db/survey-respondent-identity.test.ts; test/integration-db/survey-answer-question-scope.test.ts
- Missing tests: Deployed dev survey/browser verification and promotion. Save-order/UI-success and required-field fixes remain in their own issues.
- Done when: Three acknowledged answers and completion use one survey response with three answers.; Anonymous reload retains the signed identity and saved answers; a contact cookie keeps its exact response even when a newer attempt exists.; The real page passes the loader token with answer/completion requests and resets state when respondent identity changes.; Tampered, expired, wrong-survey/workspace or missing tokens cannot become chosen plain IDs.; Completion with no matching saved response returns a non-2xx API error with no success:true.; Preserve existing active-survey, honeypot, rate-limit, contact scope and trusted contact resume controls.; Verify deployed dev and promote before closure.
- Tracker: Source fix is in this change. Keep #2107, #2108 and read-only historical assessment #2292 separate and visible.

### [#2105](https://github.com/chester-hill-solutions/callcaster/issues/2105) Return feature-unavailable response when call-in verification is not configured
- Verdict: **Verify and close** · Size: XS · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The real optional verification-number getter now permits missing/empty values, making the existing route 503 response reachable.
- Current behavior: Merged to dev in PR #2290 at c14e4a19. The single optional verification-number entry makes absent/empty real getter values undefined and the actual loader returns 503 without session writes. Configured requests retain number, caller, ten-minute expiry and session headers; invalid callers, auth denial and writer failure retain errors. Boot keys and other security settings are unchanged. All 27 focused cases pass; original runtime fails four with 23 controls, three mutations fail. Full local CI passed 5,255 Vitest and 22 Bun tests; all remote and both Railway gates passed on 0d44b4b7. Issue-on-dev moved one item. Verify disabled/enabled deployed behavior and promote before closure.
- Root cause: The optional type/boot configuration was inconsistent with the getter optional-key list. The getter threw before the intended route branch.
- Resolution: Verify absent/empty configuration on deployed dev returns 503 without a session write; verify configured valid session creation. Keep other required configuration and security contracts unchanged. Promote before closure.
- Look in: `app/lib/env.server.ts`, `app/lib/required-env-keys.ts`, `app/lib/required-env-keys.mjs`, `app/routes/api+/verify-call-in-session.loader.server.ts`
- Existing tests: test/env.server.test.ts; test/verify-call-in-session.route.test.ts; test/verification-number-config.route.test.ts
- Missing tests: Deployed dev disabled/enabled verification before production promotion.
- Done when: Absent/empty verification number returns undefined from the real getter and does not prevent startup.; The real loader returns 503 with Call-in verification is not configured and writes no session.; Configured valid requests retain number, caller, ten-minute expiry and headers.; Invalid callers, unauthenticated requests and session write failures retain error responses.; Required boot keys and other production configuration/security contracts remain intact.; Meaningful original-source and mutation regressions fail; full local/remote gates pass before merge.; Verify deployed dev and promote before closure.
- Tracker: Source fix is in this change; verify disabled/enabled deployed behavior before promotion and closure.

### [#2102](https://github.com/chester-hill-solutions/callcaster/issues/2102) Match published agent-call estimates to billing rates
- Verdict: **Verify and close** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Calling uses staffed 4/5 rates; IVR retains 2/3. Calculator inputs and billable durations now distinguish both lanes and team project quotes.
- Current behavior: Merged to dev in PR #2287 at 24c4d810. Calling publishes canonical staffed 4/5 credits; IVR retains 2/3. Distinct calculator fields use canonical duration arithmetic and exclude zero/invalid durations. Five connected minutes cost 24 and 14 credits; additional started minutes round up. Shared FormField/Input controls retain accessible hints and canonical styles. The team quote and active pricing copy are explicit; actual billing tariffs/debit logic are unchanged. All 57 focused cases pass; original runtime fails 22 with 35 controls and nine mutations fail. Full local CI passed 5,229 Vitest and 22 Bun tests; all remote gates and both Railway checks passed on da89d57e. Issue-on-dev moved one item. Verify deployed behavior and promote before closure.
- Root cause: The public Calling card bound IVR constants and the calculator combined two billing kinds under one label with copied duration arithmetic. Quote copy did not distinguish customer agents from the CallCaster team.
- Resolution: Verify deployed cards and calculator fields against actual billing: 24 credits for five-minute agent calls, 14 for IVR; zero-duration calls contribute zero. Retain the separate team quote flow, then promote before closure.
- Look in: `app/lib/public-pricing.ts`, `app/components/pricing/PricingCalculator.tsx`, `app/routes/workspaces+/$id/billing.route.tsx`, `shared/pricing.ts`, `app/lib/twilio-call-status.server.ts`
- Existing tests: test/public-pricing.test.ts; test/ui/pricing-calculator.test.tsx; test/call-status-billing.test.ts; test/ui/billing-purchase-caller-gating.test.tsx
- Missing tests: Deployed pricing cards/calculator and actual ledger smoke verification before promotion.
- Done when: Calling publishes 4/5 and IVR 2/3 from their canonical constants.; Representative positive durations agree across published rates, calculator estimates and the real billing processor.; Zero, negative and invalid duration estimates contribute zero.; Actual UI fields remain distinct and show matching credit/CAD totals.; The CallCaster-team quote request remains explicit.; Original source and isolated rate, kind, duration, field-wiring and copy mutations fail meaningful regressions.; Full local/remote gates and deployed verification pass before promotion and closure.
- Tracker: Source fix is in this change; verify deployed estimates and copy, then promote before closure.

### [#2134](https://github.com/chester-hill-solutions/callcaster/issues/2134) Require conversation read capability for message acknowledgments
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Conversation POST now uses the same existing campaigns.read capability strategy as GET before either received-message read acknowledgment writer.
- Current behavior: Merged to dev in PR #2285 at a3051a42. Conversation acknowledgment POST enforces campaigns.read before either received-message writer, matching GET. Required-capability keys and permitted session roles retain both modes; scope, actor, membership and workspace rejections perform no writes. Generated and served contracts state the matching capability and API-key/session access. These writers only change received-message read state, not outbound provider delivery receipts. All 92 focused cases pass; original runtime fails 21 of 37 cases with 16 controls and four mutations fail. Full local CI passed 5,184 Vitest and 22 Bun tests; all remote gates and both Railway checks passed on 0f9019b5. Issue-on-dev moved one item. Verify deployed behavior and promote before closure.
- Root cause: The action read middleware context but did not require a session actor or a capability. GET already required campaigns.read. An editorial auth declaration concealed the missing POST gate and the sessionOnly exposure contradicted key access.
- Resolution: Verify empty/unrelated API-key scopes cause no read-state write on deployed dev, while campaigns.read keys and permitted session roles can acknowledge one received message or a conversation. Verify 401/403/404/405 errors and the documented served contract. Promote before closing.
- Look in: `app/routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.action.server.ts`, `app/routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.loader.server.ts`, `app/lib/capability-guard.server.ts`, `app/lib/message-db.server.ts`, `app/lib/api-surface-annotations.ts`, `app/lib/api-surface-generated.ts`, `docs/api-data-plane.md`
- Existing tests: test/conversation-ack.route.test.ts (actual actions, actor/scope controls, both writers, decoding, methods, generated surface and both served specs); test/capability-actor.test.ts; test/capability-gated-routes.test.ts; test/capability-linkage.test.ts
- Missing tests: Deployed route verification and production promotion before closure.
- Done when: Empty/unrelated API-key scopes receive 403 and perform no message write in either acknowledgment mode.; Required-capability keys and permitted session roles succeed; missing actor is 401 and non-member/workspace mismatch is 404 with no write.; GET and POST enforce campaigns.read and generated/served API contracts state API-key/session access.; Preserve decoded phone forwarding, specific-SID and empty-body acknowledgment, POST-only behavior and write failures.; Original runtime and changed gate fail the actual route regressions while positive controls remain.; Verify deployed behavior before production promotion and closure.
- Tracker: Source fix is in this change; verify deployed behavior and promote before closure.

### [#2077](https://github.com/chester-hill-solutions/callcaster/issues/2077) Authorize invitation resend before token rotation
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Session email authorizes resend before rotation; the actual write also filters workspace, email, ID and pending state. Deployed checks remain.
- Current behavior: Merged to dev in PR #2277 at c261919e. Session email authorizes resend before rotation or delivery; the actual UPDATE filters mandatory workspace, authorized email, ID and pending state. Same 404 for foreign/missing/finalized invitations, unsigned 401, seven-day hash-only token and expired-pending resend remain. All 45 focused Node and six real Postgres cases passed, nine isolated mutations failed, full local CI passed 5,007 Vitest and 22 Bun tests. All remote gates passed on 7a1945e7; issue-on-dev moved one item. Deployed functional verification and promotion remain.
- Root cause: The route checked only the presence of a session email. The package resend API rotated a globally named pending invitation by ID without workspace or email authorization.
- Resolution: Verify foreign, missing and finalized refusal, normalized own-email resend, token expiry and existing throttling on deployed dev. Verify no email or token change on refusal, then promote before closure.
- Look in: `app/routes/accept-invite.action.server.ts`, `app/lib/workspace-invitations.server.ts`, `app/lib/platform-auth-rate-limit.server.ts`, `app/lib/platform-rate-limit.server.ts`
- Existing tests: test/workspace-invitation-resend.test.ts (real route, identity precheck, unsigned/race/server errors, email delivery and existing register throttling); test/integration-db/workspace-invitation-resend.test.ts (actual scoped UPDATE, unchanged tokens/expiry/status, independent hash check and seven-day expired-pending control); Existing accept-invite signup/redemption, invitations, cancellation and auth rate-limit controls
- Missing tests: Deployed invite resend refusal, delivery, token and rate-limit verification before promotion.
- Done when: Session email matches the pending invitation before rotation or email delivery.; Foreign, missing and finalized invitations share 404 and remain unchanged; unsigned callers remain 401.; The writer requires workspace and authorized email and filters both with ID and pending status.; Normalized own-email resend stores only the new hash and preserves the seven-day expiry contract.; Existing register rate limiting refuses excess resends before rotation or delivery.; Signup, redemption and cancellation remain separate; deployed verification and promotion precede closure.
- Tracker: Source fix is in this change. Verify deployed refusal, permitted delivery and rate limiting, then promote and close.

### [#2076](https://github.com/chester-hill-solutions/callcaster/issues/2076) Scope workspace invitation cancellation to its authorized workspace
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Cancellation requires the selected workspace in its actual mutation; deployed cancellation checks remain.
- Current behavior: Merged to dev in PR #2276 at 8e1f89d3. Mandatory workspace ID filters the actual cancellation UPDATE with ID and pending status; API and settings preserve uniform 404 and permitted-role behavior. Global admin cancellation derives the invitation workspace for the same writer. All 73 focused Node and ten real Postgres cases passed; eight isolated mutations failed and were restored. Full local CI passed 4,998 Vitest and 22 Bun tests; quality, e2e, bundle and both Railway checks passed on 9886eae2. Deployed functional verification and promotion remain.
- Root cause: API and form access checks used the requested workspace, but the global-table cancellation writer dropped that workspace and called a package API that filtered only ID and pending status.
- Resolution: Verify cross-workspace refusal, uniform not-found responses and permitted cancellation through API and settings on deployed dev. Verify global admin behavior, then promote before closure. Resend authorization and token rotation remain separate in #2077.
- Look in: `app/lib/workspace-invitations.server.ts`, `app/lib/platform-members.server.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/lib/workspace-members-db.server.ts`, `app/routes/api+/workspaces+/$workspaceId/members.action.server.ts`, `app/routes/workspaces+/$id/settings.action.server.ts`
- Existing tests: test/workspace-invitation-cancel.test.ts (real adapters, mandatory workspace wiring, 404/500 mapping, member/admin/owner controls and global admin caller); test/integration-db/workspace-invitation-cancel.test.ts (actual UPDATE, unchanged foreign/finalized rows, real API/settings, role refusal and global admin control); Existing workspace settings, invitations, member authorization and OpenAPI controls
- Missing tests: Deployed API, product and global admin cancellation verification before promotion.
- Done when: The canonical mutation requires workspace ID and filters ID, workspace and pending status.; API and settings reject foreign, missing and non-pending invites with the same 404 and no row change.; Current member/admin/owner cancellation policy and caller/non-member refusal stay intact.; Every cancellation caller supplies the authorized or explicitly admin-selected workspace.; Resend and invitation acceptance stay separate.; Deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify deployed cancellation and admin behavior, then promote and close. #2077 remains separate.

### [#2087](https://github.com/chester-hill-solutions/callcaster/issues/2087) Use saved IVR start page and page order in caller flow
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Caller entry and next-page flow use saved start and order; deployed outbound/manual/inbound flow checks remain.
- Current behavior: Merged to dev in PR #2274 at 48a29230. Signed campaign entry and both dispatch paths use the saved start; inbound entry and shared prompt/response flow use saved start and order. Raw campaign launch rejects a missing declared start before migration can repair it. All 139 focused tests passed; seven isolated mutations failed and were restored. Full local CI passed 4,981 Vitest and 22 Bun tests; quality, e2e, bundle and both Railway checks passed on e7d35344. Deployed caller-flow verification and promotion remain; #2269 owns inbound attachment/save validation.
- Root cause: Outbound dispatch hard-coded page_1, inbound entry used object key order, and three next-block helpers ignored saved order. Launch validation migrated first and silently repaired dangling saved entries.
- Resolution: Verify saved entry and order in manual, machine and inbound calls, machine-answer controls and clear launch rejection on deployed dev; promote before closure. Inbound attachment/save validation remains separate in #2269.
- Look in: `app/lib/ivr-page-order.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/campaign-ivr-page.server.ts`, `app/lib/call-script-service.ts`, `app/lib/twilio-ivr-runtime.server.ts`, `app/routes/api+/ivr/$campaignId.action.server.ts`, `app/routes/api+/inbound.action.server.ts`
- Existing tests: test/page-order.test.ts and test/page-flow.route.test.ts (entry, ordering, real TwiML, legacy/explicit-page, auth and machine controls); test/ivr.route.test.ts and test/campaign-ivr-dispatch.test.ts (manual/machine dispatch with real URL resolver); test/campaign-readiness-expiry.test.ts (raw entry rejects before status/job writes for all three machine voice types); Existing page, block response, inbound response, script service and shared runtime controls
- Missing tests: Deployed caller-flow and launch-error verification before promotion.
- Done when: Both outbound dispatch paths and inbound entry use the declared start.; Prompt and response fall-through use saved page order; explicit navigation and legacy behavior remain intact.; Unknown/repeated order IDs are reconciled and omitted pages remain reachable.; A dangling raw start is rejected before campaign launch; entry cannot silently choose another page.; Signature and stored campaign checks, machine-answer policy, deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify caller flow on deployed dev, then promote and close; #2269 owns attachment/save validation.

### [#2271](https://github.com/chester-hill-solutions/callcaster/issues/2271) Build valid inbound queue TwiML and ACD callbacks
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Both inbound routes now emit valid Enqueue text and ACD callbacks after a workspace-scoped queue lookup; deployed direct and scripted queue verification remains.
- Current behavior: Merged to dev in PR #2272 at dbb9f691. Direct number and IVR queues share real named Enqueue with encoded ACD wait/completion callbacks, stored IVR caller and a workspace-scoped queue check. All 59 focused Node and three real-Postgres cases passed; nine isolated mutations failed and were restored. Full local CI passed 4,941 Vitest and 22 Bun tests; quality, e2e, bundle and both Railway checks passed on 254c3fed. Deployed functional verification and promotion remain.
- Root cause: Both routes called a nonexistent Enqueue.queue method. The IVR queue branch also omitted the ACD wait and completion callbacks. Raw query interpolation could change callback parameters; repaired routing needs an owned queue before emitting TwiML.
- Resolution: Verify a queue-configured number and a script queue target on deployed dev, including ACD wait, agent connection and completion, then promote before closure. Inbound attachment validation remains separate in #2269.
- Look in: `app/lib/inbound-queue-twiml.server.ts`, `app/lib/inbound-queue-db.server.ts`, `app/routes/api+/inbound.action.server.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/lib/acd/acd-router.server.ts`
- Existing tests: test/inbound-queue-entry.route.test.ts (both real routes and TwiML: queue text, callback URL values, stored IVR caller, invalid/missing queues, lookup failure and signatures); test/integration-db/inbound-queue-lookup.test.ts (real query: same-workspace, foreign-workspace and missing IDs); Existing inbound, IVR and voicemail suites (surrounding controls)
- Missing tests: Deployed direct and scripted queue entry, ACD wait, agent connection and completion before promotion.
- Done when: Both routes emit valid named Enqueue with ACD wait and completion callbacks.; Callback values round-trip unchanged; invalid, missing or foreign queues cannot emit Enqueue.; Signature, call mismatch, voicemail and navigation controls remain valid.; Deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify deployed queue behavior after merge, then promote and close.

### [#2088](https://github.com/chester-hill-solutions/callcaster/issues/2088) Use the number settings for inbound IVR voicemail playback
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The inbound IVR terminal renderer now uses the configured greeting and actual called phone. Recording capture remains intact; deployed playback verification remains.
- Current behavior: Merged to dev in PR #2270 at 89bba361. The terminal renderer uses the configured greeting and verified called phone; direct and listed playback first check actual object existence. All 49 focused Node tests passed; four isolated mutations failed and were restored. Full local CI passed 4,931 Vitest and 22 Bun tests; quality, e2e, bundle and both Railway checks passed on a295b40c. Deployed functional verification and promotion remain.
- Root cause: The route already loaded inbound_audio and phoneNumber but passed null for the greeting and the number row ID for fallback speech.
- Resolution: Verify selected greeting playback, actual-phone fallback speech and voicemail recording capture on deployed dev, then promote before closing. Script recipient delivery and attachment validation remain open in #2268 and #2269; this playback fix does not resolve them.
- Look in: `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/lib/inbound-ivr-db.server.ts`, `app/lib/inbound-voicemail-twiml.server.ts`
- Existing tests: test/inbound-voicemail-audio.test.ts (real storage adapter with S3 boundaries: availability, failures and retry controls); test/inbound-ivr-block-response.route.test.ts (actual greeting Play, real called phone in speech, unavailable-audio fallback, recording attributes, existing call mismatch and navigation controls); test/inbound-ivr-block.route.test.ts, test/inbound.route.test.ts, test/ivr-block-runtime.test.ts and test/email-vm.route.test.ts (surrounding IVR and recording controls)
- Missing tests: Deployed greeting playback, actual-phone speech and recording capture before promotion.
- Done when: Configured greeting resolves to Play; fallback speech uses the actual called phone and never the number row ID.; Recording, beep, timeout and callback settings remain intact; call mismatch and navigation controls retain their behavior.; Deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify deployed playback after merge, then promote and close. #2268 and #2269 are separate tasks.

### [#2089](https://github.com/chester-hill-solutions/callcaster/issues/2089) Use the destination phone to verify the SMS recipient
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- The API, chat form and campaign test sender now use one verified recipient. Mismatched IDs, ambiguous contacts and failed verification block sends; deployed verification remains.
- Current behavior: Source fix from dev@2d25f309: a workspace-scoped SQL query selects every normalized-equal phone, including formatted duplicates; the shared guard verifies unique destination identity. A supplied ID must match it. The same contact supplies opt-out, cached line type, template data and attribution. API and form line lookups propagate actual cache and provider failures. Campaign tests retain their existing opt-out-only policy. All 146 focused cases passed (137 node and nine real-Postgres tests), including 53 recipient regressions and controls; the old source failed 42 with 11 controls retained. Ten isolated mutations failed the relevant checks and were restored.
- Root cause: The guards trusted the supplied ID and allowed ambiguous matches or lookup failures. Later template and attribution code reused the unverified ID. The general search helper can omit formatted phones and hide ambiguity.
- Resolution: Verify matching and mismatched IDs, ambiguous contacts, lookup failures, normalized phones, known opt-out and landline results, correct templates and attribution, and manual new-number behavior on deployed dev. Verify the campaign test sender. Promote verified behavior before closing. This change does not implement the unknown-sender consent ledger rollout under #2263 and #1268.
- Look in: `app/lib/database/contact.server.ts`, `app/lib/chat-sms-guards.server.ts`, `app/routes/api+/chat_sms.action.server.ts`, `app/routes/workspaces+/$id/chats.action.server.ts`, `app/lib/campaign-test-send.server.ts`, `app/lib/twilio-lookup.server.ts`, `app/lib/openapi-integrator.ts`, `docs/api-send-sms.md`
- Existing tests: test/integration-db/sms-recipient-identity.test.ts (actual SQL, normalized formats and hidden duplicates, workspace and prefix exclusion, new-number and international controls); test/sms-recipient-identity.test.ts (real resolver and line-type lookup through all three consumers, provider/cache failure, mismatch, ambiguity, phone equality, tags and attribution); test/chat-sms-action.route.test.ts and test/chats-action.route.test.ts (opt-out, landline and verification error responses); test/chats-action.server.test.ts (template and sender controls); test/campaign-test-send.test.ts (test-send policy, sample data and media); test/chat-sms.route.test.ts (actual chat sender and provider controls); test/twilio-lookup.server.test.ts (existing caller fail-open policy retained)
- Missing tests: Deployed verification through API, chat form and campaign test sender before promotion.
- Done when: Destination phone and unique workspace contact agree before sending; supplied IDs cannot bypass opt-out or landline protection.; Ambiguous and failed verification block sends with an error distinct from opt-out and landline.; Eligible normalized recipients use verified template data and attribution; legacy manual new-number and campaign test policies remain.; Public API contract and generated artifacts describe recipient verification.; Deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify deployed behavior after merge, then promote and close.

### [#2090](https://github.com/chester-hill-solutions/callcaster/issues/2090) Retain all required SMS opt-out keywords when workspace settings add custom keywords
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- The shared parser and direct matcher now retain all eight standard keywords plus the OPT OUT alias. Custom settings add keywords; deployed SMS and queue verification remain.
- Current behavior: Source fix from dev@fd86e10a: one shared merge retains mandatory keywords for both parsed configuration and direct callers. Whole-message matching normalizes case and whitespace. Returned arrays cannot mutate the defaults. Actual inbound-route tests prove every keyword updates matching contacts and removes both contacts from all workspace campaign queues. All 175 focused cases passed (162 node, 13 UI). The corrected old-source check failed 72 regressions while 43 controls passed; five isolated mutations failed the relevant checks, including both real dispatch adapter gates.
- Root cause: The default keyword list had only STOP and UNSUBSCRIBE, and non-empty workspace or direct-call lists replaced it.
- Resolution: Verify all standard keywords, the OPT OUT alias, custom phrases, STOP-only configuration, workspace queue removal and ordinary replies on deployed dev. Verify START still resubscribes without requeue. Promote verified behavior before closing. Unknown-sender app suppression and operator guidance remain separate decision issues #2263 and #2264.
- Look in: `app/lib/chat-opt-out.ts`, `app/routes/api+/inbound-sms.action.server.ts`, `app/routes/workspaces+/$id/chats.loader.server.ts`, `app/hooks/chats/useChatsPage.ts`, `app/hooks/chats/useChatThread.ts`, `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: test/chat-opt-out.test.ts (mandatory set, custom union, direct matcher, whitespace, exact match and immutable defaults); test/inbound-sms.route.test.ts (every keyword across three configurations, every fallback keyword, both matching contacts and workspace queues, ordinary replies and START controls); test/campaign-sms-dispatch-contract.test.ts (real coordinator through HTTP and worker; opted-out and eligible contacts); test/chat-sms-action.route.test.ts and test/chat-sms.route.test.ts (existing outbound route controls); test/ui/hooks-chats.test.tsx, test/ui/hooks-chats-optimistic-failure.test.tsx and test/ui/components-chats-contact.test.tsx (existing chat consumers and opt-out banner controls)
- Missing tests: Deployed SMS keyword and workspace queue verification before promotion.
- Done when: All eight standard keywords plus OPT OUT remain mandatory for parser and direct matcher.; Custom keywords add to the required set, with case and whitespace normalization and whole-message matching.; Matching contacts are opted out and removed from all receiving-workspace campaign queues; eligible dispatch and ordinary reply controls remain.; Deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify deployed behavior after merge, then promote and close. #2263 and #2264 are independent decisions; do not treat them as completed by this parser fix.

### [#2092](https://github.com/chester-hill-solutions/callcaster/issues/2092) The campaign_ended readiness code is declared and mapped to a corrective action but never emitted, so an expired campaign reads "Ready to launch"
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Expired campaigns now produce a readiness blocker before launch or joining. The correction selects the date pickers. Deployed launch and join verification remain.
- Current behavior: The source fix uses the same strict end_date < now check in pure readiness and launch. Readiness defaults to the current clock; launch passes its explicit clock. End date equality remains valid, and invalid or reversed dates keep their earlier corrections. Launch rejects expiry before status or dispatch writes. The existing UI and results loader consume the blocker. All 144 focused cases passed (132 node, 12 UI), and seven isolated mutations failed the relevant regressions while controls passed. Producer fixtures invoke every real readiness producer, including script routing; an exhaustive record and a runtime union check detect untested codes.
- Root cause: campaign_ended existed in the code union and action map but readiness had no producer. Launch checked expiry separately and did not pass args.now into readiness. The expiry action led to the queue instead of date pickers.
- Resolution: Verify expired, equal-time and future campaigns on deployed dev: expired campaigns show Complete before launch, disable Start and Schedule, and disable joining. The setup guide must select the date pickers. Check message, live and automated voice campaigns, then promote verified behavior before closing.
- Look in: `app/lib/campaign-readiness.ts`, `app/lib/campaign-execution.server.ts`, `app/lib/campaign-readiness-actions.ts`, `app/lib/campaign-setup-steps.ts`, `app/routes/workspaces+/$id/campaigns/$selected_id/settings.loader.server.ts`, `app/routes/workspaces+/$id/campaigns/$selected_id.loader.server.ts`, `app/components/campaign/settings/CampaignLaunch.tsx`
- Existing tests: test/campaign-readiness-expiry.test.ts (expiry boundary, default/explicit clock, launch writes, every real producer and a new-union-code guard); test/campaign-settings.route.test.ts (activation and unavailable-script controls with a pinned clock); test/campaign-readiness.test.ts and test/campaign-readiness-actions.test.ts (existing readiness controls with a pinned clock); test/campaign-setup-steps.test.ts (expired guide correction and existing steps); test/campaign-selected-id.loader.test.ts (expired/equal running-campaign join behavior); test/ui/campaign-launch-review.test.tsx and test/ui/campaign-launch-actions.test.tsx (real expiry readiness into UI, disabled start/schedule controls)
- Missing tests: Deployed expiry, date correction, launch and join verification before promotion.
- Done when: A campaign whose end date has passed shows a blocking readiness issue, a disabled Start button, and a non-empty "Complete before launch" list.; The corrective action scrolls to the date pickers.; A campaign with a future end date is unaffected.; A guard test fails if a code is added to the union with no producer.
- Tracker: The source fix travels with this board update. Verify deployed expiry, launch and joining after merge, then promote and close. Do not start a duplicate fix.

### [#2091](https://github.com/chester-hill-solutions/callcaster/issues/2091) messageMedia uploads are keyed by the client-supplied filename with no uniquifier, so a same-name upload silently replaces an existing attachment
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- New MMS uploads use unique keys and reject object collisions. Earlier chat attachments and campaign keys remain intact. Deployed upload and campaign-send verification remain.
- Current behavior: This source fix uses one server-generated UUID plus safe filename for upload, campaign message_media and signing. It passes upsert:false and treats the real ObjectExistsError as failure before signing or campaign attachment. Historic keys retain their stored values. All 42 focused cases passed, including five route cases through the real upload/signing adapter and both campaign dispatch adapters. Removing the unique key failed two regressions with three controls; removing no-overwrite or restoring conflict continuation each failed three regressions with two controls.
- Root cause: The messageMedia caller stored only workspace plus client filename and did not request no-overwrite. Its legacy statusCode conflict branch could continue to report success rather than handling the S3 adapter’s actual ObjectExistsError.
- Resolution: Verify same-name chat and campaign uploads on deployed dev: both retain their own bytes and links, each campaign sends its own media, historical attachments still resolve and a storage conflict cannot report success or alter the original. Promote verified behavior before closing.
- Look in: `app/routes/api+/message_media.action.server.ts`, `app/lib/object-storage.server.ts`, `app/lib/campaign-sms-dispatch.server.ts`, `app/components/campaign/settings/MessageSettings.tsx`, `app/components/sms-ui/ChatMessages.tsx`
- Existing tests: test/message-media-storage-regression.test.ts (five real-adapter cases: chat/campaign bytes, historic keys, preflight conflict and conditional-write race); test/message-media.route.test.ts (validation, auth, upload failure, campaign update and historic deletion controls); test/campaign-sms-dispatch-contract.test.ts (both API and worker sign and send historic plus new media keys); test/object-storage-upsert.test.ts (no-overwrite provider behavior)
- Missing tests: Deployed chat upload and campaign-send verification before promotion.
- Done when: Two uploads with the same filename in one workspace produce two distinct objects, and each message points at its own.; The route never reports `success: true` for an upload that replaced an existing object.; A live campaign re-signs the **correct** media for its own `message_media` value.; Historic `outbound_media` values keep resolving (no key rewrite breaks them).
- Tracker: The source fix travels with this board update. Verify deployed uploads and campaign sends after merge, then promote and close. Do not start a duplicate fix.

### [#2096](https://github.com/chester-hill-solutions/callcaster/issues/2096) Every live-calling dequeue is workspace-wide, not campaign-scoped — a contact called in one campaign is silently dropped from all of them
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Ordinary contact dequeues require a campaign and leave other campaign queues intact. Explicit workspace-wide opt-out remains. Deployed migration and calling verification remain.
- Current behavior: This source fix scopes primary and household SQL, RPC event snapshots, completion and no-op diagnostics to the selected campaign. A missing primary queue row cannot dequeue siblings or emit another operation’s sibling update. SMS opt-out and do-not-call use explicit allCampaigns targets. The assigned-agent guard and primary result remain. All 196 focused cases passed (161 node, 23 real Postgres, 12 UI); eight isolated mutations each failed the relevant regression. Both standards and issue-scope reviews passed after the missing-primary correction.
- Root cause: The guarded dequeue RPC and its event snapshot had workspace/contact limits but no campaign. Ordinary live-call paths omitted campaign scope. Optional campaign fallback and unscoped no-op diagnostics could affect unrelated campaign queues.
- Resolution: Verify the new six-argument dequeue_contact migration and matching application on deployed dev. Call one contact from campaign A while B stays queued; check household, predictive, manual advance, hangup and terminal callbacks, another agent’s claim, no-op messages, event scope and completion. Confirm SMS STOP and do-not-call still remove the contact from all campaign queues. Old callers fail after the old RPC signature is removed, so deploy the matching application and migration together. Promote verified behavior before closure.
- Look in: `client/migrations/20261003000000_scope_dequeue_contact_by_campaign.sql`, `app/lib/campaign-queue-db.server.ts`, `app/lib/db-rpc.server.ts`, `app/lib/auto-dial.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`, `app/routes/api+/queues.action.server.ts`, `app/routes/api+/hangup.action.server.ts`, `app/routes/api+/auto-dial/status.action.server.ts`, `app/lib/callscreenActions.ts`
- Existing tests: test/integration-db/dequeue-contact-assigned.test.ts (23 real Postgres cases: campaign/household/event/completion/no-op scope, missing-primary and concurrent events, own-assignee guard, global opt-out controls and exact RPC signature); test/queues.route.test.ts (validation, campaign/contact workspace pair and existing no-op/conflict responses); test/auto-dial.server.test.ts, test/auto-dial-status.test.ts, test/hangup.route.test.ts, test/webhook-side-effects.test.ts (campaign wiring and no-campaign controls); test/inbound-sms.route.test.ts and test/questions.route.test.ts (explicit all-campaign opt-out targets); test/ui/callscreenActions.test.ts (selected campaign in manual request)
- Missing tests: Deployed migration and calling verification before production promotion.
- Done when: One contact in two campaigns' queues: a hang-up in campaign A dequeues only A's row; B's row is still `queued` with `dequeued_at` null.; The same holds for the predictive post-dial and the terminal-status paths.; A dequeue with a campaign id that does not own the row is a no-op, not an error.; `check:queue-rpc-contract` passes with the new signature.; The manual "Save and Next" path is campaign-scoped too.
- Tracker: The source fix travels with this board update. Verify the migration and browser/phone calling on deployed dev after merge, then promote and close. Do not start a duplicate fix.

### [#2094](https://github.com/chester-hill-solutions/callcaster/issues/2094) Agent hang-up on a predictive call 500s and never tears the conference down — Twilio retries forever and the dialer keeps dialling
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Agent participant hangups stop the conference without an outreach attempt and notify only the matching screen. Deployed calling verification remains.
- Current behavior: This source fix handles participant hangups before ordinary call statuses, stops the carrier conference before metadata writes, and keeps the ordinary terminal billing claim available. The conference-stop broadcast has an explicit ended marker. Ordinary status events carry the stored conference name but do not clear the conference; the room and sync hooks ignore other or older conferences. All 73 focused cases passed. Restoring the old endpoint failed seven regressions with the signature control passing; removing the end event failed four cases. Removing the screen hangup or room scope each failed the real hook pipeline test. Removing ordinary event scope failed the callback sequence test; removing the ended-marker gate failed the ordinary-completion UI control.
- Root cause: The handler required an outreach attempt and wrote a possibly empty CallStatus before stopping the conference. A terminal CallStatus also took the wrong branch. Null-contact broadcasts were ignored by the screen, and unscoped broadcasts could affect another conference.
- Resolution: Verify on deployed dev with browser and phone agent devices: agent and callee hangups stop the conference and next dialer turn; the matching screen clears, other conferences remain active, and ordinary status callbacks still bill and record outcomes. Test provider stop failure/retry and already-ended conferences. Promote the verified fix before closing.
- Look in: `app/routes/api+/auto-dial/status.action.server.ts`, `app/hooks/call/useCallRoom.ts`, `app/hooks/call/usePredictiveCallSync.ts`, `app/lib/workspace-events.shared.ts`, `test/auto-dial-agent-leave.route.test.ts`, `test/ui/predictive-conference-ended.test.tsx`
- Existing tests: test/auto-dial-agent-leave.route.test.ts (eight cases: provider and legacy fields, metadata and provider errors, ended/SID-only conference, later billing claim and signature rejection); test/ui/predictive-conference-ended.test.tsx (real room and sync hooks; explicit end vs ordinary completion; matching, other and old conference events); test/auto-dial-status.test.ts (ordinary status and callee controls); test/auto-dial.server.test.ts (ended conference stops the next turn); test/ui/use-call-room.test.tsx; test/ui/use-predictive-call-sync.test.ts; test/ui/hooks-call-screen.test.tsx
- Missing tests: Deployed browser and phone calling verification, callback retries and billing verification.
- Done when: An agent hang-up returns 200 and completes the conference.; A callee hang-up still records the attempt outcome (the existing behaviour must stay green).; The predictive dialer stops when the last conference ends.; The other agents' dashboards receive the end-of-call broadcast for an agent-leg hang-up.; Twilio receives no retry (no 500) for the agent leg.
- Tracker: The source fix travels with this board update. After merge, verify on deployed dev and close after production promotion. Do not start a duplicate fix.

### [#2093](https://github.com/chester-hill-solutions/callcaster/issues/2093) A voice test call writes a call row with the campaign id, so the campaign's own duplicate gate later dequeues the real contact as "Duplicate IVR call prevented"
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Voice campaign test calls no longer count as prior campaign dispatches. Deployed campaign verification remains.
- Current behavior: This source fix adds IS NOT NULL on outreach_attempt_id to the real tenant-scoped duplicate query. All 45 focused cases passed, including three real Postgres query and dispatch cases. Removing the exclusion failed two cases while the real-call control passed; reversing it failed all three.
- Resolution: Verify on deployed dev: test-call an audience number, then dispatch the campaign and confirm the first real call proceeds. A later real dispatch to that number must still be skipped as a duplicate. Promote the verified fix before closing.
- Look in: `app/lib/telephony-db.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `test/integration-db/campaign-call-duplicate.test.ts`
- Existing tests: test/integration-db/campaign-call-duplicate.test.ts (real Postgres counts and real dispatch gate; test and real history; workspace, campaign and phone controls); test/campaign-test-call.test.ts (all three voice types, with and without a matching contact); test/campaign-settings.route.test.ts (all three voice types use the shared test-call helper); test/campaign-ivr-dispatch.test.ts (existing queue and dispatch controls)
- Missing tests: Deployed calling verification with a test recipient also in the audience, plus a real-call duplicate control.
- Done when: A test call to a number that is also in the campaign audience does **not** cause the campaign to dequeue that contact as a duplicate.; Two real dispatch calls to the same number in one campaign still dequeue the second (the positive control must stay green).; The dedupe query's test-call exclusion is asserted directly, not only through the dispatch result.; Every test-call path is covered; a test enumerates them.
- Tracker: The source fix travels with this board update. After merge, verify on deployed dev and close after production promotion. Do not start a duplicate fix.

### [#2103](https://github.com/chester-hill-solutions/callcaster/issues/2103) safeOutboundFetch buffers webhook responses without a byte limit
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Outbound responses are bounded to one MiB on dev; deployed verification remains.
- Current behavior: PR #2255 merged to dev as 6aec5b03. The helper rejects before retaining an overflow chunk, clears retained chunks on failure and closes the active request and response. All 17 focused stream and DNS-pinning cases passed. Removing the byte cap failed both size regressions while six cleanup/control cases passed.
- Resolution: Verify exact-limit and oversized response behavior on the deployed dev environment with a controlled webhook target. Confirm cleanup on abort/error and preserve the existing ten-second caller timeouts. Promote the tested fix before closing. Webhook scheduling remains separate work.
- Look in: `app/lib/safe-outbound-url.server.ts:268`, `app/lib/safe-outbound-url.server.ts:262`, `app/lib/workspace-webhooks.server.ts:64`, `test/safe-outbound-url.test.ts:175`, `app/lib/safe-outbound-url.server.ts (all `rejectPromise` paths, the accumulation loop)`, `app/lib/worker/handlers/cron.server.ts (the inline webhook call)`, `app/lib/worker/handlers/campaign.server.ts:545-567 (`webhook_delivery` handler)`, `app/lib/workspace-webhooks.server.ts`
- Existing tests: test/safe-outbound-response-limit.test.ts (eight real-stream boundary and cleanup cases); test/safe-outbound-url.test.ts (nine DNS validation, pinning and redirect cases)
- Missing tests: Confirm rejection and cleanup on the deployed dev environment using a controlled webhook target.
- Done when: A response above the configured cap rejects with a clear error and terminates its connection.; Buffered chunks never accumulate beyond the cap.; A response exactly at the cap succeeds.; Abort, stream-error and redirect paths release request/response resources.; Tests prove bounded buffering and cleanup. Webhook scheduling changes are separate work.
- Tracker: The source fix is on dev in PR #2255. Verify on deployed dev; close after production promotion. Do not start a duplicate fix.

### [#2132](https://github.com/chester-hill-solutions/callcaster/issues/2132) The workspaces:create idempotency scope is global, so one user's workspace id is replayed to another user
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Workspace creation replay is scoped to the verified user on dev; deployed verification remains.
- Current behavior: PR #2254 merged to dev as 41b2785e. Workspace creation now uses workspaces:create:${auth.user.id}. Legacy global records are unreachable through the route. Seven route tests pass, and restoring the global scope fails all three cross-user isolation regressions.
- Resolution: Verify cross-user isolation, same-user retries, in-flight conflicts, authentication and input validation on the deployed dev environment. Promote the tested fix to production before closing.
- Look in: `app/routes/api+/workspaces.action.server.ts`, `app/lib/platform-idempotency.server.ts`, `app/lib/openapi-platform.ts`, `test/api-workspace-create-idempotency.route.test.ts`
- Existing tests: test/api-workspace-create-idempotency.route.test.ts (seven route cases with real replay storage and route auth); test/platform-api.test.ts (replay helper and public API contract)
- Missing tests: Confirm workspace creation and retry behavior on the deployed dev environment.
- Done when: Two users sending the same `Idempotency-Key` to workspace-create each get their own workspace, and neither sees the other's id (kill-check: revert to the bare namespace and confirm the test goes red).; The same user retrying with the same key still replays their own result (the intended behaviour must stay green).; Every `withIdempotency(` namespace is listed with its scoping rule.
- Tracker: The source fix is on dev in PR #2254. Verify it on the deployed dev environment; close after production promotion. Do not start a duplicate fix.

### [#2086](https://github.com/chester-hill-solutions/callcaster/issues/2086) The IVR no-input replay branch overwrites outreach_attempt.result, destroying every answer already recorded on that call
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-02
- The replay path now merges answers and nested counters. CSV and result display strip the replay metadata. PR #2161 covers the reported loss.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The replay path now merges answers and nested counters. CSV and result display strip the replay metadata. PR #2161 covers the reported loss.
- Root cause: PR #2161 fixed the read-modify-write omission by merging prior answers and counters, and removes replay metadata from Results and export views.
- Resolution: The source fix and regression tests landed in #2161. Verify IVR answers, Results and CSV in the review environment; close after promotion under the issue policy.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts:226`, `app/lib/ivr-results.ts:113`, `test/ivr-block-response.route.test.ts:347`, `test/campaign-export-voice-credits.test.ts:230`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts:188-195,219-226,237+`, `app/lib/inbound-no-input-replay.server.ts`, `app/lib/campaign-export.server.ts:493`, `app/lib/outreach-typed-fields.server.ts`, `app/lib/ivr-results.ts`
- Existing tests: test/ivr-block-response.route.test.ts:347 preserves answers across repeated replays.; test/campaign-export-voice-credits.test.ts:230 removes replay metadata from CSV.; test/ivr-results.test.ts covers result presentation.
- Missing tests: Source tests exist; deployed IVR/result/CSV verification remains.
- Done when: A call that answers two prompts, then hits a no-input replay, then answers again, retains **all three** answers in `outreach_attempt.result`.; A second replay does not lose the answers either.; The export CSV `full_result` cell contains no `__no_input_replays` key.; The Results screen shows every answer for that attempt.
- Tracker: Source fix exists. Verify the review environment and required promotion before closing. Related PR evidence: #2161. A PR reference alone does not prove deployed behavior.

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

### [#2174](https://github.com/chester-hill-solutions/callcaster/issues/2174) test/integration-db never runs in CI — the real-Postgres tier built to catch schema-vs-database type mismatches is not wired to any workflow
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-29
- Recommended title: **Wire test/integration-db into a CI workflow**
- The premise is false: the tier already runs in CI. Its summary proved `grep -rln 'integration-db' .github/workflows/` returns nothing, which is a true observation and the wrong place to look — the workflow YAML never names the tier because the invocation lives in a script. `scripts/e2e/run-compose-e2e.mjs:108` runs `npm run test:integration-db`, and the e2e job runs that script, so the tier executes on every CI run. Implementing the requested remedy would duplicate an existing run rather than add coverage.
- Current behavior: The real-Postgres tier runs on every CI run inside the e2e compose job. Confirmed from a real log, not only from the source: PR #2207's e2e output contains `Test Files 6 passed (6)` / `Tests 60 passed (60)`, which is this tier exactly on dev before #2209 added its sixth file.
- Resolution: No code change. The tier is already gated. The issue's residual observation is narrower than claimed and is filed as #2211: the tier's only gate is the pipeline's least reliable job, so a genuine database regression and an unrelated compose flake arrive as the same red check, and the standing 'rerun a red e2e first' reflex would discard the real failure. Separately, `ci:local` omits the tier, so a green local gate says nothing about it.
- Look in: `scripts/e2e/run-compose-e2e.mjs:107-108 (the invocation #2174's grep could not see)`, `#2211 (the real residual: signal mixing, not missing coverage)`
- Existing tests: test/integration-db/ — runs in CI today via the e2e compose job
- Done when: Met: the tier runs in CI, so the schema-vs-database class of bug has a gate.; Not applicable: the wiring this issue asked for already exists.
- Tracker: Closing rather than implementing, because implementing would add a duplicate CI run and give the appearance of a fix. Worth carrying forward as a general check: when an issue says something 'runs nowhere', find where the invocation actually lives before concluding it is absent. A call inside a script is invisible to a grep of the workflow file, and verifying that takes two minutes.

### [#2187](https://github.com/chester-hill-solutions/callcaster/issues/2187) One contact's preparation failure aborts the whole campaign SMS batch
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-29
- handleMember forwards handleClaimedMember and re-throws, and runPacedSendBatches collects the batch with Promise.all, so one row's preparation failure rejects the whole dispatchCampaignSmsBatch and abandons every other row in it. Trigger: getOrLookupLineType throws — a transient connection reset, a statement timeout, or pool exhaustion under exactly the load #2185 addresses. Verified by making the first three lookups throw in a 25-row batch: the call rejects with 'lookup blew up' instead of returning dispatched or deferred_send_window. Not data loss — unstarted rows are never dequeued and a later tick retries them — but a whole batch of prepared work is discarded for one bad contact.
- Tracker: Fixed and merged as PR #2198 (a3ab6cf0e). The send path had a per-row failure boundary (sendSingleCampaignSms rejects, and its .then(_,onError) releases the credit, counts the failure, records the attempt and returns a per-contact result); preparation had none, so a throw in any of its four database round trips propagated into await Promise.all in runPacedSendBatches and rejected the whole batch. Blast radius, and the third is the one that mattered: batch siblings' responses were discarded even though they had already sent and been counted; every remaining batch was abandoned; and rpcFailExhaustedCampaignQueueContacts was skipped, so the failed row never dead-lettered, stayed eligible, failed again on the next run, and the campaign could not drain. That is a permanent outage from one bad contact, and it is invisible in the logs, which show a successful dispatch. Fix is three parts: a row boundary in handleMember wrapping the whole body (the await on its last statement is load-bearing, because the phone-claim handler rethrows and returning its promise would put the rejection outside the try); the reservation released wherever a row fails after reserving (the release previously lived ONLY in the send's rejection handler, so a SYNCHRONOUS throw out of sendSingleCampaignSms - invisible to .then - kept the credits for the rest of the dispatch, so failRow now takes the cost to release and a new throw site cannot forget it); and Promise.allSettled so no future row path can abort a campaign. Six tests, four kill-checks each failing exactly one: remove the row boundary -> the dead-letter test; allSettled back to all -> the recorder-down test; drop the post-prepare release -> the credit-release test; failRow stops recording -> the dead-letter test. Note removing the row boundary fails ONLY the dead-letter test, because the loop backstop alone already keeps the batch alive - the boundary earns its place by RECORDING the attempt, which is what lets the campaign drain. Read that as the general shape: a per-row boundary usually earns its keep through a side effect (a recorded failure, a released resource), not through preventing the cascade, which something else prevents too. The recorder-down test caught a double-count in the fix itself: failRow counted before awaiting the record, so a failed record made the loop count the same row again (failed:2 for one contact); counting after the await makes the two mutually exclusive, and that test is also what makes the loop backstop reachable rather than dead code, since recording a failure is itself a database write against the same database that has just failed. The file-size guard forced an extraction rather than a baseline: the credit budget and start pacer are pure, dependency-free and imported by nothing else, so they moved to campaign-sms-dispatch-primitives.server.ts, taking the file 860 -> 784. NOT fixed, deliberately: when the record write itself fails the row stays queued and eligible, because nothing is recorded to dead-letter it on - retrying is honest but a persistently broken recorder keeps that row alive, and that deserves its own issue rather than a guess here. ci:local exit 0, node 442/442 files 3560 tests, ui 151/151 924 tests.

### [#2157](https://github.com/chester-hill-solutions/callcaster/issues/2157) The chats loader-to-state sync can permanently discard a fresh page-1 response
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
- When the agent has scrolled the conversation list and triggered "load more" (page 4 is in `paginationFetcher.data`), a realtime message on a page-1 conversation causes a loader revalidation that produces a **new** `chats` array with fresh `message_count` / `conversation_last_update` for a page-1 row. The sync effect returns early because `fetchedPage (4) > pagination.page (1)`, so the fresh data is dropped.
- Current behavior: Page numbers are not an identity. Comparing them is a proxy for "have I already folded this response in?" that fails as soon as the agent paginates — and then fails **permanently**, not transiently.
- Resolution: 1. Track which loader response has been folded in with a **monotonic token** — a ref holding the `pagination` object last applied, or a request sequence — rather than comparing page numbers. 2. **Merge rather than replace**: `setLoadedChats(prev => mergeConversationPages(prev, chats))`, so page-1 updates are applied on top of the accumulated pages instead of being all-or-nothing. 3. If two conversations in different pages are the same conversation, the merge must dedupe by conversation identity — that is the same identity question the pagination accumulator already answers for messages, so reuse it. 4. Fix this together with the `useChatRealtime` re-seed defect, which wipes loaded pages on the same surface. Both are the "accumulated pagination vs revalidation" class and should share one merge helper.
- Look in: `app/hooks/chats/useChatsPage.ts (the loader-to-state sync effect)`, `app/hooks/chats/useChatRealtime.ts`, `app/hooks/chats/useChatThread.ts`, `app/components/chats/`
- Missing tests: Page-1 update applies after pagination (kill-check).; Loaded pages survive.; No duplicate conversation rows.
- Done when: With pages 1–4 loaded, a realtime event on a page-1 conversation updates that row's count and position (kill-check: restore the page-number comparison and confirm the test goes red).; The loaded pages are not lost.; A conversation appearing on two pages is not duplicated.; A fresh page-1 response is applied even after pagination (the permanent-staleness case).
- Tracker: Fixed and merged as PR #2191 (e3a10624). Page numbers are not an identity; the filter is. The sync effect now discriminates on accumulatedFilterKeyRef, so a different filter resets the list and the same filter merges the response in. Two changes were needed, not one: mergeConversationPages already deduped by conversation phone and applied the fresh row over the existing one, AND the cursor had to become monotonic — the old effect also reset paginationState and requestedPageRef to the loader's page 1, so deleting the guard alone would have made the next load-more re-request a page already held. Verified: 4 tests in test/ui/use-chats-page-pagination.test.tsx; 2 reproduce the defect and failed on current code with a fresh unread count of 9 and 7 arriving as 1; 2 guard behaviour a naive fix breaks. 4 kill-checks each fail exactly one test — page-number guard reinstated, replace-not-merge, cursor rewind, always-merge-never-reset — so neither 'always replace' nor 'always merge' passes. ci:local exit 0, node 441/441, ui 150/150. The max-lines-per-function warning is pre-existing at 450 lines, now 462; splitting the hook is a refactor and does not belong here. NOT done: the useChatRealtime re-seed defect this issue suggests fixing alongside — no revalidator call or page reset that wipes loaded pages could be found in app/hooks/realtime/useChatRealtime.ts. Left OPEN: merge to dev is not a release, and no CI tier covers accumulated-pagination behaviour against a live revalidation.

### [#2185](https://github.com/chester-hill-solutions/callcaster/issues/2185) Bound campaign SMS prep concurrency: the #2172 pacer lets 25 rows hit a 10-connection pool at once
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-29
- Found while verifying the #2172 fix (PR #2182). Moving the pacing gate to a serialising pacer claimed immediately before the provider request required removing the await from the dispatch loop, so rows in a batch now start their preparation together. Measured peak in-flight DB operations on a 25-row batch with 12ms prep: 1 before, 25 after. app/server/db.ts sets max: 10 on the query client. The postgres client queues the excess rather than failing, and MAX_CONCURRENCY=25 was already the intended batch cap, so nothing is broken — but each queued row holds its credit reservation while it waits, since ctx.budget.reserve runs before the pacer.
- Tracker: Fixed and merged as PR #2188 (8f1952bfd). createSemaphore gates the preparation phase at ceil(QUERY_POOL_MAX / 2), leaving half the pool for interactive traffic. The permit is released BEFORE the pacing wait, so the pool is never gated on the rate limit — holding it across waitForTurn would be the #2172 defect in a different hat. Verified: measured peak in-flight prep dropped from 25 to the bound; 5 semaphore unit tests with 2 kill-checks (off-by-one on handoff -> 2 fail, one reporting inFlight -17; release removed -> 4 fail, 2 by timeout); 2 dispatch tests asserted from both sides so neither degenerate fix passes (gate removed -> 25 > 5; bound of 1 -> 1 > 1). An off-by-one in the first semaphore implementation was found and fixed during the work, and the test written for it initially passed against the bug because it never queued — it now uses more callers than permits. check:unscoped-db-imports correctly rejected importing @/server/db for the constant; fixed in code by moving QUERY_POOL_MAX to app/server/db-pool-size.ts, no baseline change. Left OPEN: merge to dev is not a release, and no CI tier runs against real Postgres (#2174).

### [#2172](https://github.com/chester-hill-solutions/callcaster/issues/2172) Campaign SMS pacing measures dispatch time, not provider-request time, so the rate limit collapses under load
- Verdict: **Verify and close** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-28
- runPacedSendBatches stamps lastStartAt immediately after CALLING handleMember, which is async and does real work (normalizePhoneNumber, recipientCallingWindowStatus, an awaited dequeueQueueEntry) before the provider RPC fires. So the enforced interval is between dispatches, while the quantity that must be bounded is between RPC starts. When the pre-RPC work exceeds the pacing interval the wait collapses to zero and the batch sends near-simultaneously. Under load — precisely when rate limiting matters — campaign SMS pacing silently stops pacing.
- Current behavior: test/campaign-sms-dispatch-contract.test.ts 'three contacts at 60 MPS: rpcCreateOutreachAttempt starts are paced' fails intermittently in the full test:node run (436/437 files pass, this is the only failure) and passes 4/4 in isolation. It also passes on a clean origin/dev worktree. retries is not configured in vitest.node.config.ts, so it is a hard failure, not a retried flake.
- Root cause: The pacer reads the wrong clock. gap(RPC n, RPC n+1) = minStartIntervalMs + w(n+1) - w(n), where w is the pre-RPC work. When w(n) is large the gap SHRINKS; the check for n+1 then sees elapsedMs > minStartIntervalMs, computes waitMs = 0, and never waits. This resolves an apparent contradiction: CPU contention makes timers fire late, which alone would ENLARGE gaps — the lastStartAt versus RPC-start mismatch dominates that effect. The test's own comment blames 'setTimeout jitter on a busy CI runner'; that diagnosis is wrong. The 10ms floor is catching a genuine collapse, and the test should be kept as-is.
- Resolution: Stamp the pacing clock at the point the provider request is actually issued. Concretely: build a start pacer that serializes and awaits a minimum interval, and await it immediately before rpcCreateOutreachAttempt rather than pacing the dispatch loop. Open decision worth making deliberately: pace dispatch (simpler, but under-delivers by up to w(n)) or pace the provider call (correct, matches the code's stated intent of pacing starts rather than completions). Last touched by #2158 'enforce campaign send window before provider attempts', which is on this code path — check whether that PR moved when lastStartAt is stamped. Do NOT relax the 10ms floor to make the failure disappear; that would delete the only detector.
- Look in: `app/lib/campaign-sms-dispatch.server.ts:263 (minStartIntervalMs = 1000 / startRateMps)`, `app/lib/campaign-sms-dispatch.server.ts:353-361 (elapsedMs/waitMs against lastStartAt, then lastStartAt = Date.now() at dispatch)`, `app/lib/campaign-sms-dispatch.server.ts:449+ (handleMember — async work before the RPC)`, `test/campaign-sms-dispatch-contract.test.ts (the pacing contract test, and the comment that misdiagnoses it)`
- Existing tests: campaign-sms-dispatch-contract.test.ts: 'three contacts at 60 MPS: rpcCreateOutreachAttempt starts are paced' — catches the collapse, but only when the run is loaded enough to trigger it
- Missing tests: a test that makes handleMember's pre-RPC work slow (a mock resolving after ~40ms) and asserts the inter-RPC gap STILL holds at the configured interval — this must FAIL against current code; a test proving pacing holds under simulated event-loop contention
- Done when: A test that delays pre-RPC work and asserts the inter-RPC gap still holds; it fails against current code; Campaign SMS rate limiting holds under simulated event-loop contention; Existing dispatch contract tests stay green, with the 10ms floor unchanged; The dispatch-loop pacing and the send-point pacing are not both active (no double-wait)
- Tracker: Fixed and merged as PR #2182 (d9eecf80), deployed to dev and serving HTTP 200. The pacing gate moved from the dispatch loop to immediately before the provider request, so the interval is now measured between the requests Twilio actually receives. createStartPacer serialises turns so two rows finishing preparation in the same tick cannot pass the gate together. The predicted mechanism was confirmed by instrumentation: dispatches paced perfectly at 0/20/40ms while requests landed 15ms apart where 20ms was required. Note the pacer also stopped serialising row preparation (peak concurrent lookups 1 -> 20, peak concurrent provider sends unchanged at 1), which is a real change in DB concurrency, not a pure refactor. Verified: two new tests fail before the fix at 5ms and 15ms against a 20ms floor, three kill-checks executed (including one that breaks a pre-existing test, proving the turn-chaining is load-bearing), ci:local exit 0, node suite 440/440 files and 3528 tests including the previously flaky 60 MPS test. Left OPEN because a merge to dev is not a release and no CI tier exercises this against real Postgres (test/integration-db is excluded, #2174).

### [#2147](https://github.com/chester-hill-solutions/callcaster/issues/2147) A timed-out Gather writes a literal null answer, and the voice campaign export renders it as the string "null"
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-28
- PR #2163 is merged to dev. The response route saves only accepted input. Timeout and unsupported menu keys follow the no-input route.
- Current behavior: PR #2163 is merged to dev. The response route saves only accepted input. Timeout and unsupported menu keys follow the no-input route.
- Resolution: Verify a silent Gather and an unsupported key on dev. Check that the exported answer is blank. Keep the issue open until release.
- Look in: `app/lib/ivr-block-runtime.server.ts:120-131`, `the IVR response route (the `userInput === null` branch and the `result` write)`, `app/lib/ivr-results.ts:87-92`, `app/lib/campaign-export.server.ts:493`
- Existing tests: test/ivr-block-response.route.test.ts
- Done when: A caller who times out at a menu produces a CSV cell that is **empty**, not `null` (kill-check: keep recording the null and confirm the test goes red).; The Results screen is unchanged (empty, not `null`).; An unmatched key press re-prompts up to the replay cap and is not recorded as an answer (kill-check).; A terminal block is never answered by a digit the script did not offer.
- Tracker: Code reviewed at dev@5b673c81. PR #2163 merge 6c8a48fa is in origin/dev. Runtime and export verification remain.

### [#2041](https://github.com/chester-hill-solutions/callcaster/issues/2041) Admins can only grant credits by direct database write; add an audited manual credit load on the admin workspace page
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-09-27
- PR #2044 is merged to dev. The admin workspace Credits tab adds a positive whole-number credit load through the canonical ledger, with a required reason and a nonce for retry protection.
- Current behavior: PR #2044 is merged to dev. The admin workspace Credits tab adds a positive whole-number credit load through the canonical ledger, with a required reason and a nonce for retry protection.
- Root cause: The billing ledger was designed around automated, provider-keyed writes. There is no human-initiated grant concept, no key namespace for one, and no UI for one — and the guard that would catch an unsafe write (check:credit-writes, scripts/check-credit-write-paths.mjs) treats any direct workspace.credits write as a violation, which is the correct default and the reason a supported path is needed rather than a bypass.
- Resolution: Verify an admin credit load and a replay of the same form on dev. Check the balance, audit note and ledger row. Keep open until release.
- Look in: `app/routes/admin+/workspaces/$workspaceId/credits.action.server.ts`, `app/routes/admin+/workspaces/$workspaceId/credits.loader.server.ts`, `app/routes/admin+/workspaces/$workspaceId/credits.route.tsx`, `shared/billing-keys.ts`
- Existing tests: test/admin-workspace-credits.route.test.ts; test/billing-keys.test.ts
- Done when: A sudo admin can grant credits to any workspace from the admin page, and the balance updates on refresh; The grant is written through insertTransactionHistoryAndSyncCredits-equivalent RPC path only; no direct workspace.credits write and check:credit-writes stays green; A retried submit with the same nonce credits exactly once; Invalid amounts are rejected with a clear message and nothing is written; The ledger row shows type CREDIT, a positive amount, and a note naming the admin and the reason; The grant's bucket is decided deliberately and documented, and the welcome-credits prefix classification is corrected in the same change; npm run ci:local is green, including the codegen and surface checks
- Tracker: Code reviewed at dev@5b673c81. PR #2044 merge 1a2d2313 is in origin/dev. No deployed credit mutation was made during this review.

### [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) IVR: store speech answers as { value, raw, inputType } (slice B)
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-27
- PR #2160 is merged to dev. Outbound IVR answers include value, raw, inputType and optional confidence. Result readers still accept legacy strings.
- Current behavior: PR #2160 is merged to dev. Outbound IVR answers include value, raw, inputType and optional confidence. Result readers still accept legacy strings.
- Root cause: The response parser collapses Digits/SpeechResult into one string and drops the optional Confidence value.
- Resolution: Verify one speech answer, one keypad answer and one legacy answer in Results and CSV on dev. Keep the issue open until release.
- Look in: `app/lib/ivr-webhook-auth.server.ts`, `app/lib/ivr-results.ts`, `app/lib/outreach-typed-fields.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`
- Existing tests: test/ivr-webhook-auth.server.test.ts; test/ivr-results.test.ts; test/outreach-typed-fields.server.test.ts; test/campaign-export-voice-credits.test.ts
- Done when: A speech answer stores { value, raw, confidence, inputType }; confidence is null when Twilio omits or sends an invalid value; DTMF answers store inputType=dtmf and no confidence; route matching still receives the same userInput string; Legacy bare strings and new objects both aggregate and export as the answer value; Typed fields and CSV export resolve the value
- Tracker: Slice B is present in dev@5b673c81 through PR #2160 merge 9dcab08b. The earlier claim that confidence is discarded is obsolete.

### [#2048](https://github.com/chester-hill-solutions/callcaster/issues/2048) Block SMS campaign completion while messages are unsettled at Twilio
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-27
- DONE — the settled-message gate shipped on 2026-09-27 as PR #2050 (d032c0c9), a day before this record was written. Message campaigns no longer flip to complete on dequeue: try_complete_campaign_if_drained now refuses while any message is unsettled. Measured on the Eric Lombardi blast (2026-09-24) the old behaviour reported complete at 6:29pm EDT while Twilio still held 5,382 messages, releasing them between 11:59pm and 1:46am — a median lag of 7.3 hours.
- Current behavior: Verified against the live dev database, not just the migration file: campaign_has_unsettled_messages, campaign_ids_with_unsettled_messages and try_complete_campaign_if_drained all exist in public, and the deployed body of try_complete_campaign_if_drained does call campaign_has_unsettled_messages. A completion re-check exists (app/lib/campaign-settle-recheck.server.ts) because the gate would otherwise strand every message campaign at running forever once the local queue empties.
- Root cause: campaign_has_unsettled_calls had no message counterpart, and campaign_queue_has_pending_work treats a row as done at dequeue time — handed to Twilio, not delivered. The re-check module's own comment records that a TypeScript re-implementation of the settled rule shipped once and broke the recovery path in two ways no test caught, which is why both the filter and the gate now live only in SQL.
- Resolution: No code work outstanding. The residual is the expired-campaign bypass at app/lib/worker/handlers/campaign.server.ts, which writes status=complete directly and never calls the gate — that is issue #2051, DECLINED by the maintainer on 2026-09-25 ('no 2051') and deliberately left with a code comment marking it a known gap. Do not reopen it here. What remains is a verification pass: confirm on a real campaign that a message sitting at Twilio keeps the campaign at running, and that the re-check promotes it once the provider settles. That pass belongs on a real database, which is the tier #2174 tracks.
- Look in: `client/migrations/20260922120000_gate_campaign_completion_on_settled_calls.sql`, `app/lib/twilio-open-sync.server.ts`, `app/lib/sms-status.ts`, `app/lib/campaign-queue-completion.server.ts`, `app/lib/worker/handlers/campaign.server.ts`
- Existing tests: test/campaign-completion-rpc-contract.test.ts — extracts the live migration bodies and pins the settled list and the ::text casts (9 tests, runs in ci:local); test/campaign-settle-recheck.server.test.ts — the re-check sweep and its best-effort contract (7 tests, runs in ci:local); test/integration-db/campaign-completion-gate.test.ts — 14 tests against a real database; this tier is not wired to any workflow (#2174), so these do not run in CI today
- Missing tests: an end-to-end real-Postgres pass: a message unsettled at the provider keeps the campaign at running, and the re-check promotes it once settled (#2174)
- Done when: SMS campaign with queued/sending messages is not complete; Settled campaign completes normally; No-callback messages resolved by open-sync, don't block forever; IVR completion unchanged
- Tracker: Verify and close — this is NOT Fix now and the earlier verdict was wrong. The gate shipped as #2050 on 2026-09-27; this record was written on 2026-09-28 and described shipped work as pending, which put the highest-severity item on the board on a task that was already done. The issue stays OPEN by design: a merge to dev does not close an issue until the dev-to-master release, and the project Status is already on-dev. Do not spend implementation time here. The one real gap, the expired-campaign bypass, is #2051 and was declined.

### [#1794](https://github.com/chester-hill-solutions/callcaster/issues/1794) Campaign schedule sync can overwrite a concurrent pause or completion
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-09-27
- PR #1797 (88f73343) made schedule writes conditional on the status read by the sweep. A new real-Postgres regression test covers pause and completion after candidate selection.
- Current behavior: A concurrent status change causes the guarded update to return no transition; a real-Postgres test verifies paused and complete states are preserved and no transition event is emitted.
- Resolution: Keep the issue open until this test is merged to dev and the guarded status transition is verified there.
- Look in: `app/lib/campaign-schedule-sync.server.ts`, `app/lib/campaign-ivr.server.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts (sweep orchestration with mocked status helper); test/integration-db/campaign-schedule-sync-status-race.test.ts (pause/completion interleaving against Postgres)
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

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

### [#1980](https://github.com/chester-hill-solutions/callcaster/issues/1980) Trim IVR add-a-recording help copy: drop 'From the workspace audio library'
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-25
- Design nit: the add-a-recording step's recording select shows helper text 'From the workspace audio library.' (ScriptBlockEditor.IvrStep.tsx:304). Remove it (the picker already frames the library context) and any now-redundant spacing.
- Current behavior: ScriptBlockEditor.IvrStep.tsx:304 renders 'From the workspace audio library.' under the recording control.
- Resolution: Remove the helper text line; verify the RecordingStepFields block still reads clean with the Select only.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx:304`
- Missing tests: UI smoke renders recording step without the label
- Done when: No 'From the workspace audio library' text in the IVR recording step

### [#1889](https://github.com/chester-hill-solutions/callcaster/issues/1889) Verify: predictive auto-dial honours the voicemail-drop switch
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-25
- Fixed on dev in PR #1901 (16a7abdd, merged 2026-09-19, base dev). NOT in master (origin/master 807cea82), so dev-only until the next release.
- Current behavior: On dev, the predictive AMD branch reads voicemail_drop_enabled and calls machineAnswerDisposition.
- Root cause: The AMD branch read campaign.voicemail_file but never campaign.voicemail_drop_enabled.
- Resolution: No new code. Verify on the review environment, then close when promoted to master.
- Look in: `app/routes/api+/auto-dial/$roomId.action.server.ts`, `app/lib/telephony-db.server.ts`, `app/lib/ivr-machine.server.ts`
- Existing tests: test/auto-dial-room.route.test.ts; test/integration-db/call-status-guard.test.ts; test/telephony-db-call-status-guard.test.ts
- Done when: Predictive + machine + drop off yields No Answer with no audio; Predictive + machine + drop on yields Voicemail with the drop played
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#1888](https://github.com/chester-hill-solutions/callcaster/issues/1888) Verify: IVR machine answer with the drop off records No Answer
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Fixed on dev in PR #1890 (d07e26b1, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, machineAnswerDisposition(campaign) returns voicemail only when voicemail_drop_enabled && voicemail_file, otherwise no-answer.
- Root cause: recordVoicemailAnswer wrote disposition voicemail for every machine answer before deciding whether the drop would play.
- Resolution: No new code. Verify on the review environment, then close when promoted to master.
- Look in: `app/lib/ivr-machine.server.ts`, `app/routes/api+/ivr/status.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId.action.server.ts`
- Existing tests: test/ivr-page.route.test.ts; test/ivr-status.route.test.ts
- Done when: Drop on + audio records disposition voicemail; Drop off or no audio records disposition no-answer; Results, metrics and exports show No Answer in the second case
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#1884](https://github.com/chester-hill-solutions/callcaster/issues/1884) IVR editor routing validation + terminal-hangup guarantee
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- IMPLEMENTED on dev (#1991 merged 2026-09-22). Runtime half largely shipped (#1975): ou...
- Current behavior: Dangling option.next targets redirect to the block route which plays 'There was an error in the IVR flow. Goodbye.' then hangs up (outbound + inbound); routing cycles are undetected; no editor warning. Editor structural validation is scriptkit validateDocument only (parse.ts:22-40): startPageId exists + page/block refs — no next-target/cycle checks. clearDanglingRouting (use-script-editor-state.js:427-440) only clears when an id is deleted, not for malformed imports.
- Root cause: The runtime parses next as an opaque string with no terminal/validation contract.
- Resolution: Add app/lib/ivr-script-validation.ts: build an edge graph (page/block -> option.next targets) and run a DFS for (a) dangling targets (next refers to a nonexistent page/block), (b) reachable cycles (A->B->A), (c) terminal guarantee (every reachable path ends at hangup/end). Surface errors in ScriptEditorShell.tsx alongside editor.validation. Wire into validateScriptSteps (call-script-service.ts) and add a script_routing_invalid CampaignReadinessCode + readiness-action entry (campaign-readiness.ts:14-35 + campaign-readiness-actions.ts:35-144) so launch blocks (launchCampaign readiness gate campaign-execution.server.ts:86-95 surfaces it automatically). Inbound: make renderTerminalTarget treat 'end' explicitly and render <Hangup/> for dangling/terminal.
- Look in: `app/lib/ivr-script-validation.ts (new)`, `app/lib/call-script-service.ts`, `app/components/campaign/settings/script/ScriptEditorShell.tsx`, `app/lib/campaign-readiness.ts`, `app/lib/campaign-readiness-actions.ts`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`
- Existing tests: test/ivr-block-response.route.test.ts:226-247 (end terminal outbound)
- Missing tests: ivr-script-routing-validation: dangling target, A->B->A cycle, hangup/end ok, linear end ok; inbound route: next:'end' renders <Hangup/>, dangling renders <Hangup/>; editor shell test shows the cyclic-script validation error
- Done when: An author can choose Hang up as an option's next step (already true); A published script always has a terminal hangup; next:'end' and 'hangup' are both terminal at runtime (inbound too); Dangling targets and reachable cycles fail validation and block launch
- Tracker: Implemented on dev (PR #1991, merged). Verify on the review env: #1883 editor no-input panel writes the fields + inbound mirrors the cap; #1884 dangling/cycle scripts block launch with script_routing_invalid and the editor shows the errors. Then close.

### [#1830](https://github.com/chester-hill-solutions/callcaster/issues/1830) Codify blocking cross-developer tasks as assigned tickets in the GitHub agent skills
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Request that work another developer must do to unblock an issue becomes a separate ticket, set to block that issue and assigned to the right person, and that the agent skills say so.
- Current behavior: github-issues/SKILL.md covers issue types, parent/child decomposition, and the --blocked-by / --blocking flags, but does not require creating a separate assigned ticket when another dev's task blocks an issue.
- Root cause: The skill documents the mechanics of blocking links but not the policy that blocking work is its own assigned ticket.
- Resolution: Add a section to .agents/skills/github-issues/SKILL.md stating that blocking cross-developer work is created as a new Task, linked with --blocking <blocked issue> (or --blocked-by on the blocked issue), and assigned with --assignee; include a worked example.
- Look in: `.agents/skills/github-issues/SKILL.md`, `.agents/skills/github-cli/SKILL.md`, `.agents/skills/github-pull-request/SKILL.md`
- Done when: The skill states blocking work becomes a separate ticket; The skill shows the blocking link direction and assignment; The example uses --blocking and --assignee correctly
- Tracker: Implemented on dev (PR #1965 ac6aaef6): github-issues SKILL.md documents cross-developer blockers as assigned, one-direction blocking tickets. Verify and close.

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

### [#1792](https://github.com/chester-hill-solutions/callcaster/issues/1792) SMS rate pacing is skipped between batches, including all waits at one MPS
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-12
- PR #1796 (0188cea8) preserves the configured SMS send-start interval across dispatch batches.
- Current behavior: A one-MPS target retains its delay between one-row batches.
- Resolution: Verify configured pacing across batch boundaries on dev.
- Look in: `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: test/campaign-sms-dispatch-pacing.test.ts
- Missing tests: Deployed pacing verification.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

---

## Needs reproduction — 6

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

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

### [#1668](https://github.com/chester-hill-solutions/callcaster/issues/1668) Error toasts should have sensible defaults for spacing. Adding an audio reveals lacking bottom spacing
- Verdict: **Needs reproduction** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-10-04
- Recommended title: **Verify toast spacing and move defaults into the shared component**
- The app adapter adds gap-2 py-3 globally, but shad-cc does not own those defaults. Caller toastOptions can replace the adapter settings.
- Current behavior: Source audit dev@8ae867ed, 2026-10-04: one root host uses the app adapter. Shared spacing ownership and actual audio-error spacing are not verified.
- Root cause: App-level class duplication is not a shared component spacing contract. The reported computed spacing has not been reproduced on current code.
- Resolution: Measure the audio-upload error toast in light/dark themes with long text and actions. Move confirmed global defaults into shad-cc with safe option merging. Prove alerts render outside page flow with no layout shift.
- Look in: `app/components/ui/sonner.tsx:12`, `app/root.tsx:123`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/sonner.tsx:56`, `docs/design-system.md`
- Missing tests: Computed toast spacing for audio-upload errors and option overrides.; Light/dark and long-content browser checks with stable page landmarks.
- Done when: Error toasts have sensible global spacing defaults.; The shared component prevents the same spacing mistake across callers.; No alert causes page layout to shift when it renders.
- Tracker: Native issue updated. Needs reproduction; app adapter classes are partial source evidence. Keep shared component ownership under #2300 visible.

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

### [#2053](https://github.com/chester-hill-solutions/callcaster/issues/2053) Reproduce current E2E image-pull failures after the Stow migration
- Verdict: **Needs reproduction** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-02
- The original MinIO/Quay failure is obsolete after the Stow migration. Two anonymous Docker Hub pulls remain. Source alone cannot prove current image-pull failures or the claimed anonymous-quota root cause.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Stow replaced MinIO. Only postgres and inbucket Docker Hub images remain. No fresh hosted-runner image-pull failure was established in this code audit.
- Root cause: The historical unauthorized Quay pull is not proof of rate limiting and no longer exists in the compose graph. Anonymous Docker Hub pulls remain a possible failure source.
- Resolution: Read current master E2E runs. Separate image-pull failures from apt, database, and Playwright failures; choose mirror/auth policy only after confirming the remaining failure.
- Look in: `docker-compose.dev.yml:15`, `.github/workflows/e2e.yml:130`, `.github/workflows/e2e.yml:40,55 (runs-on) and the test:e2e:compose step`, `docker-compose.dev.yml:12,36,49 (the three image sources — note line 36 is quay.io)`, `scripts/e2e/run-compose-e2e.mjs:20,57-58,84 (composeFile, up -d, ensure-minio-bucket)`, `scripts/e2e/ensure-minio-bucket.mjs:12-13,25-26 (endpoint and credentials)`
- Missing tests: Need current hosted-runner logs, registry response evidence and the ten-run acceptance measurement.
- Done when: npm run test:e2e:compose passes on master from a GitHub-hosted runner; No image in docker-compose.dev.yml is pulled anonymously from a rate-limited registry; No image-pull failure across ten consecutive PR runs; If the gate is not required, that is recorded deliberately
- Tracker: Move to Needs reproduction for the current runner failure. Update obsolete MinIO and Quay claims first.

### [#1718](https://github.com/chester-hill-solutions/callcaster/issues/1718) contact has opted out messager should be dynamic
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: none · Updated: 2026-09-23
- Screenshot only, no repro or expected copy; generic opt-out banner is intentional per #1333 evidence. Needs the specific scenario before coding.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1670](https://github.com/chester-hill-solutions/callcaster/issues/1670) phone number search is too strict
- Verdict: **Needs reproduction** · Labels: ux · Assignee: none · Updated: 2026-09-23
- Searching Pickering does not find South Pickering. PR #1675 changed rate-centre display names; it did not prove search matching.
- Resolution: Compare the submitted locality with provider results and determine whether the provider supports partial matching before changing the search contract.
- Look in: `app/components/phone-numbers/NumberPurchase.tsx`, `app/lib/number-locality.ts`

---

## Needs decision — 36

Product, security, or operations decision required before implementation can be scoped.

### [#2029](https://github.com/chester-hill-solutions/callcaster/issues/2029) Decide the release list and the retention policy for unused dev-environment Twilio numbers
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- An operations task, not a code change, and it is waiting on two things rather than on engineering. The screenshot shows 76 numbers in the dev account at $86.20/month, plus 4 number-setups at $0. The body names the three numbers Sai uses (2608141501, a 2026 Municipal Ward 19 NES campaign, a HESC Phone Bank) and asks @wra-sol to say which workspaces Arfin wants kept; everything else is proposed for release. Two decisions are open. First, the list: Arfin's workspaces are not in the issue, so the release set is undefined. Second, and more important, there is no stated rule for what makes a dev number safe to release, and no automated check — a number that is still referenced by a workspace_number row, a campaign sender, a messaging service, a caller ID, or a verification in progress will break on release, and in a dev environment that breakage is discovered by the next person who uses it. There is a number lifecycle in the app (app/lib/number-rental-billing.server.ts handles suspension and release and notifies the workspace), but nothing there enumerates what a number is still referenced by.
- Current behavior: 76 numbers are held in the dev Twilio account; an unspecified subset is unused, and nobody can say which.
- Root cause: Dev numbers accumulate because renting is cheap and there is no reaper. The list of what is safe to release is held in people's heads and in Slack, not in the repo or the database.
- Resolution: Answer two questions and it becomes a 30-minute console task. (1) The release list: get Arfin's workspaces, then release every number not on the combined keep-list. (2) The safety rule, and this is the part worth writing down: what counts as 'in use'. The concrete options are (a) query the app for references — any workspace_number row not in a released state, any campaign using it as sender or caller ID, any messaging service with it attached, any caller-ID verification pending — and refuse to release a number with a live reference; (b) a time-based rule, release anything not rented in the last N days, accepting that a dormant campaign sender breaks; (c) purely manual, the operator eyeballs the console, which is what happens today and is how 76 accumulated. (a) is the only one that cannot break a workspace, and it is cheap because the reference check is a handful of queries over tables that already exist. Also decide whether dev numbers get a periodic reaper on the same rule, or whether this stays a one-off clean-up. Note the numbers in the keep-list are per-workspace, so record the mapping (number -> workspace) before releasing, otherwise the next clean-up starts from zero knowledge again.
- Look in: `app/lib/number-rental-billing.server.ts:170-200 (existing suspend/release lifecycle and its workspace notification)`, `app/lib/platform-workspace-numbers.server.ts (the workspace_number accessor to build the reference check on)`, `app/db/workspace-scoped-tables.ts (workspace_number, campaign, workspace_audio — the tables a reference check must cover)`, `app/routes/admin+/workspaces/$workspaceId/twilio/ (the admin Twilio panels; no release action exists there today)`
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

### [#1724](https://github.com/chester-hill-solutions/callcaster/issues/1724) What happens if we use template tags on a contact that doesn't have that piece of information?
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: question · Assignee: none · Updated: 2026-10-17
- Current behavior: missing contact fields render empty string or the fallback (code answers the question). Product decides the desired UX (placeholder/flagging).
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

### [#2036](https://github.com/chester-hill-solutions/callcaster/issues/2036) Decide the scope of flattening the call screen: the call screen only, or the shared workspace panel every page uses
- Verdict: **Needs decision** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-10-15
- The complaint is clear and both named surfaces are real, but the outer card is not owned by the call screen — it is the shared workspace panel, so 'remove the rounded edges and drop shadow' is a choice about blast radius, not a local edit. The top bar is local: app/components/call/CallScreen.Header.tsx:239 is a sticky header with rounded-xl, border, shadow-sm and a backdrop blur, and that is the campaign details/settings bar in the screenshot. The outer card is app/routes/workspaces+/$id.tsx:206, a single className string that gives every workspace page its panel: `min-w-0 flex-1 lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card/70 lg:p-6 lg:shadow-sm ...`, and the same file already branches on isChatsScreen (:204-207) so a call-screen branch is available. The issue's broader point is also a design-system one: cards are fine as containers, but their default treatment should be overridable per site.
- Current behavior: The live calling screen stacks three card treatments — the workspace panel, the sticky top bar, and inner section cards — and the invisible ones still cost padding.
- Root cause: The workspace panel treatment is a single shared className with no per-surface override, and the top bar re-states rounded/border/shadow locally. Two owners for the same visual concept, so the call screen cannot opt out.
- Resolution: Decide the scope, then it is a small edit either way. Option A (call screen only): add an isCallScreen branch next to the existing isChatsScreen branch at app/routes/workspaces+/$id.tsx:204-207 that drops rounded-2xl, border and shadow-sm and reduces p-6 for the call route, and flatten the sticky header at CallScreen.Header.tsx:239. Nothing else on the product changes; the risk is that the call screen now looks different from every page beside it. Option B (whole product): flatten the shared panel for all workspace routes, so the page is a flat canvas and cards mean something when they appear. Bigger visual diff, needs a pass over every workspace page to check what depended on the panel's padding, but it is the version that actually establishes 'a card is a deliberate container'. Option C (middle): keep the panel as-is and change the top bar only, which fixes the half the reporter named twice but leaves the outer card. Whichever is chosen, express it as a variant on the panel rather than a route-conditional className string, so the next surface can opt out without editing a ternary. Also decide the padding: the reporter asks to 'punch back' the padding the invisible cards were creating, which means auditing the space-* classes between the panel and the first inner card as part of the change, not just deleting rounded and shadow.
- Look in: `app/components/call/CallScreen.Header.tsx:239 (the sticky top bar: rounded-xl, border, shadow-sm, backdrop-blur)`, `app/routes/workspaces+/$id.tsx:202-208 (the shared workspace panel, with the isChatsScreen branch as the pattern for a call-screen branch)`, `app/components/call/CallScreen.Layout.tsx:191 (the call screen's own space-y-6, the padding the invisible cards create)`, `app/components/call/CallScreen.Coaching.tsx:53,73 and CallScreen.DTMFPhone.tsx:22 (inner cards, which the issue says to keep)`
- Existing tests: test/ui/call-screen-header.test.tsx (CampaignHeader only); test/ui/call-screen-callarea.test.tsx, call-screen-queuelist.test.tsx (inner cards)
- Missing tests: no test asserts the call screen's panel treatment, so a regression to the nested-card look passes silently; no visual or class-level test would catch a re-introduced rounded/shadow on the top bar
- Done when: The chosen scope is written down, and the panel treatment is a named variant rather than a route-conditional className string; The named surfaces (outer card, top bar) have no curved edges or drop shadow; The padding the removed cards were creating is punched back, verified by measuring the gap at the top of the call screen; Inner section cards keep their treatment — they are the containers that should still read as cards; No other workspace page changed unintentionally, or changed deliberately and listed
- Tracker: Needs decision, briefly, then fix. The implementation is an hour either way; what is unresolved is whether this is a call-screen change or a product-wide one, and picking wrong means either an inconsistent product or an unreviewable visual diff across every page. The reporter's phrasing ('the call screen has the page, an outer card, and inner cards') reads as a call-screen complaint, which points to Option A, but the outer card is shared and the reporter may not know that. Answer that one question and this becomes a fix-now.

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

### [#1789](https://github.com/chester-hill-solutions/callcaster/issues/1789) Voice campaign exports calculate credits with the retired one-credit-per-minute rate
- **IN PROGRESS** · Verdict: **Needs decision** · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-15
- PR #1798 (a80b3f9c) fixed voice export rate math and zero-duration gating: exports now use voiceCreditsFromDurationSeconds (shared/pricing.ts:122; IVR 2+3, staffed 4+5) and gate zero-duration attempts to 0 (campaign-export.server.ts:436-447). CONFIRMED in current dev; test/campaign-export-voice-credits.test.ts pins it. The only open item is the estimate-versus-ledger contract and the credits_used label.
- Current behavior: The CSV credits_used value is calculated from duration and shared pricing, not read from ledger debits. The column remains named credits_used.
- Root cause: The arithmetic fix does not establish whether the field promises actual debits or an estimate.
- Resolution: Decide the credits_used contract. If it remains an estimate, label it clearly; if actual debits are required, source it from the ledger. Preserve the corrected rates.
- Look in: `app/lib/campaign-export.server.ts`, `shared/pricing.ts`
- Existing tests: test/campaign-export-voice-credits.test.ts
- Missing tests: Acceptance check for the selected actual-versus-estimated contract.
- Done when: Define actual ledger debits versus estimated credits.; Label an estimate clearly, or source actual debits from the ledger.
- Tracker: Keep this contract decision open. Do not repeat the rate calculation fix from PR #1798.

### [#1700](https://github.com/chester-hill-solutions/callcaster/issues/1700) Why have a distinction between recording step and spoken step if you can also change "Speak text" to "play a recording"
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: @sai-sy · Updated: 2026-10-15
- Proposal to collapse Speak/recording block types into one 'Add block'. The editor already treats them as one block with a playback-mode toggle, so the change is a product/scope decision.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1858](https://github.com/chester-hill-solutions/callcaster/issues/1858) IVR additional tools
- Verdict: **Needs decision** · Size: XL · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-15
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

### [#1983](https://github.com/chester-hill-solutions/callcaster/issues/1983) Receipts and charges should include tax
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-15
- Product/legal decision: receipts currently show untaxed charges. Adding tax display (and taxing charges) needs a jurisdiction/tax-configuration decision (rates, exemptions, remittance) before implementation.
- Current behavior: Billing shows amounts without tax; receipts have no tax line; ledgers store pretax totals.
- Resolution: Decide: (1) tax on CallCaster charges scope (which products, jurisdictions, rate config), (2) display-only receipts vs taxed ledger amounts. Then implement in the receipt builder + pricing path.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`, `shared/pricing.ts`
- Done when: No implementation until the tax decision is recorded

### [#2263](https://github.com/chester-hill-solutions/callcaster/issues/2263) Scope unknown-sender opt-out enforcement in the consent ledger rollout
- Verdict: **Needs decision** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
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
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Passwords are enabled and sessions issue without email verification; verification handler/message exist with no send callback. Registration can occupy an unverified email, while password reset goes to the mailbox owner.
- Root cause: Auth configuration enables password signup and reset delivery but has no email-verification delivery or enforcement configuration. Verification handlers and a verification message remain without a configured issuance flow. Source does not establish that the feature was deliberately removed.
- Resolution: Choose mandatory verification with delivery/resend/pending-session UX, or deliberately remove misleading verification surface. EmailVerified is a Better Auth schema field and should not be deleted blindly. Cover actual registration behavior.
- Look in: `app/server/auth-instance.ts:21`, `app/lib/platform-auth.server.ts:195`, `app/lib/platform-auth.server.ts:347`, `app/routes/api+/auth/verify-email.action.server.ts:9`, `app/server/auth-instance.ts:22-31 (emailAndPassword: no sendVerificationEmail, no requireEmailVerification)`, `app/lib/platform-auth.server.ts:339-380 (the unreachable verify-email handler)`, `app/lib/platform-auth.server.ts:189-198 (the unreachable success branch)`, `app/routes/api+/auth/verify-email.action.server.ts:9 (a rate limit on a dead route)`, `app/db/auth-schema.ts:16 (emailVerified column, default false, never written)`
- Missing tests: No test exercises real registration to assert verification issuance and session policy. Account-address occupancy is established; automatic account takeover by the first registrant is not, since reset goes to the actual mailbox owner.
- Done when: A test registers a user and asserts one of the two outcomes, so the half-wired state cannot return; No user-visible string references verification unless verification happens; The dead route and its rate limit are either live or removed; A test covers the chosen path end to end
- Tracker: Needs decision. The issue explicitly requires Option A/B product policy and states funnel cost is unknown; do not select cheaper removal as a bug fix. Then implement/test the chosen policy. Related PR evidence: #2223, #2222. A PR reference alone does not prove deployed behavior.

### [#2194](https://github.com/chester-hill-solutions/callcaster/issues/2194) Cull 111 empty legacy-named Twilio subaccounts (Console-only; 31 must be kept)
- Verdict: **Needs decision** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- The old survey identified 111 apparent candidates and 31 live dev owners. Dev, staging and production share the account; current ownership and deletion safety have not been established.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The 111 deletion candidates come from a dated shared-account survey. The inventory only reads Twilio resources; it does not prove that all candidates lack live dev, staging and production owners.
- Resolution: Refresh the read-only inventory, reconcile each candidate with every environment and decide an explicit keep/delete list before Console cleanup.
- Look in: `scripts/twilio-subaccount-inventory.mjs:24`, `scripts/twilio-subaccount-inventory.mjs:29`, `scripts/twilio-subaccount-inventory.mjs:65`
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
- Current behavior: A disabled workspace can still be signed into and can still call the API with valid credentials. Number RELEASE deliberately keeps running, because freezing it would strand every unpaid number in a suspended workspace.
- Root cause: `disabled` was specified and implemented as a billing lever only. It was never given an auth meaning, so the name implies a kill switch it does not provide. Not a missing check — a missing decision.
- Resolution: Decide the semantics before scoping, because the two plausible answers have very different blast radius. (a) `disabled` blocks sign-in and API access, becoming a true kill switch; the warn->suspend->release ladder still runs server-side, so numbers are still released. (b) `disabled` stays billing-only and a separate field carries access suspension. Recommendation: (a), because one field with one meaning is what operators assume, and the release ladder already runs in background jobs that do not need user access. Do NOT implement by adding a single auth-path check — that would leave `disabled` still reading as billing-only everywhere else.
- Look in: `app/lib/workspace-middleware.server.ts (workspaceContext — no disabled check)`, `app/lib/data-plane-middleware.server.ts (dataPlaneAuthContext — no disabled check)`, `app/lib/admin-middleware.server.ts (adminContext)`, `app/db/schema.ts (workspace.disabled)`
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
- Current behavior: Expired campaign terminalizes to 'complete' regardless of unsettled provider messages; the #2048 gate does not apply.
- Root cause: Genuine rule conflict, not an oversight. The RPC also requires an empty queue, and this path exists so a campaign that expires mid-drain does not stay stuck 'running' (#1512). Routing it through the gate would re-break that.
- Resolution: Decide between: (1) complete anyway and accept abandoned messages, specifying credit treatment and operator warning; (2) cancel everything still unsettled at the provider, wait, then let the normal gate complete it; (3) terminalize to a distinct status such as expired/cancelled so 'complete' always means settled, which keeps the #2048 promise intact but needs a campaign_status enum value plus UI handling. Option 3 is the one that preserves the new invariant.
- Look in: `app/lib/worker/handlers/campaign.server.ts (expired-campaign branch of campaignDispatchHandler)`, `app/lib/worker/webhook-side-effects.server.ts (cancelQueuedMessagesForCampaign, only after end_date)`, `client/migrations/20260925120000_gate_campaign_completion_on_settled_messages.sql`
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
- Current behavior: No scheduled backup exists. A workspace's data exists only in the live database.
- Root cause: The backup system was never ported; the gocanvass blueprint it copies is described in the issue and nothing in CallCaster implements it.
- Resolution: Answer the four questions, then implement. (1) What is in the snapshot: the issue proposes every tenant table, which includes contact PII (names, phones, emails, street addresses) and the full billing ledger. Options: everything (maximum recoverability, maximum exposure), or contacts and the ledger excluded (a schema-and-reference backup that cannot restore customer records), or a middle option that includes contact identifiers without free-text fields. This is the decision that has to be made by someone accountable for the data, not by the implementer. (2) Where it lands: a dedicated backups bucket with its own retention, or the existing S3_BUCKET under a backups/ prefix. A dedicated bucket is the better answer on isolation grounds and the issue already designs for it; the prefix is cheaper and needs no new env var. Pick one and say why, because the object-storage bucket union has to grow either way. (3) Retention and deletion: BACKUP_RETENTION_DAYS defaults to 30 and pruning deletes objects. Confirm the default and confirm the retention is long enough to be useful for the incident it is insurance against. (4) Who can restore: the issue explicitly puts restore tooling out of scope, which means the snapshots are written and never read. Decide whether that is acceptable as phase one, or whether a restore runbook is part of the deliverable — an unread backup is a liability, since it is a full copy of customer data with no access control beyond the bucket. Once those are answered the implementation is the issue's own step list: job type and registry entry, daily dedupe via an idempotency key of backups:<YYYY-MM-DD> (or a self-scheduling chain seeded by ensure-scheduled-jobs), per-workspace fanout so one failure does not error the job, one CSV per table from createTenantDb over the 28 tables, a manifest.json, and a prune pass over the date segments.
- Look in: `app/db/workspace-scoped-tables.ts:41-95 (WORKSPACE_SCOPED_TABLES — 28 tables today, the single source of truth for the snapshot list)`, `app/lib/object-storage.server.ts:8-13 (ObjectStorageBucket, no backups member) and :57-62 (BUCKET_ENV_VARS)`, `app/lib/worker/job-types.server.ts, app/lib/worker/job-params.server.ts:206-222, app/lib/worker/handlers.server.ts:89-178 (job type, params, registry)`, `app/lib/worker/handlers/cron.server.ts:176-230 (handler pattern) and app/lib/worker/handlers/shared.server.ts:19-42 (withReschedule)`, `app/lib/cron-workspace-fanout.server.ts:42-89 (per-workspace error isolation)`, `app/lib/rpc-csv.server.ts and app/lib/csv.ts:55-75 (rowsToCsv, escapeCsvCell)`, `~/Documents/gocanvass/app/server/backup-schedule.server.ts and workspace-csv-backup.server.ts (the blueprint being ported)`
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

### [#1852](https://github.com/chester-hill-solutions/callcaster/issues/1852) cleanup .env: document Twilio env vars and define config-as-code vs layered secrets
- Verdict: **Needs decision** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Audit and rationalize environment variables. Both TWILIO_APP_SID and TWILIO_AUTH_TOKEN in .env.example are used, but there is no documented policy for config-as-code vs secrets and no layered secret resolution.
- Current behavior: TWILIO_APP_SID is the TwiML App SID for Voice SDK outbound and is auto-assigned per non-protected environment; TWILIO_AUTH_TOKEN is used for REST calls. Some paths use TWILIO_API_KEY/TWILIO_API_SECRET. No ENVIRONMENT singleton and no .secrets/env.<environment> layering.
- Root cause: No documented owner/purpose per variable and no agreed boundary between config and secrets.
- Resolution: Decide the env schema and secret precedence (.env -> .secrets/env.<environment> -> secrets manager), document each variable's purpose and which are secrets, then prune unused/duplicated variables. Prefer an ENVIRONMENT selector over per-value env config.
- Look in: `.env.example`, `app/lib/env.server.ts`, `app/lib/required-env-keys.mjs`, `app/server/environment-twiml-app.server.ts`, `docs/twilio-runtime-inventory.md`, `docs/local-development.md`, `scripts/railway/`
- Existing tests: test/env.server.test.ts
- Missing tests: Env validation / precedence for layered secrets; A guard that fails on an undocumented or unused required key
- Done when: Every env var has a documented purpose and secret/config classification; Unused or duplicated variables removed; Secret precedence defined and easy to swap to a secrets manager; Non-sensitive config handled as config, not env values
- Tracker: Decision (secrets/config policy) before edits. Coordinate with #1329. Do not touch the user's live .env.

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

### [#1815](https://github.com/chester-hill-solutions/callcaster/issues/1815) Decide TWO_FACTOR_ENABLED kill-switch state per environment
- Verdict: **Needs decision** · Size: XS · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-25
- Screenshot-only report from Sai. Env check resolves it: MFA is off BECAUSE TWO_FACTOR_ENABLED is unset on the review (dev) env AND on production app services (Railway list-variables; only DISABLE_2FA_ENFORCEMENT + NODE_ENV present on review, and neither 2FA var on production). isTwoFactorFeatureEnabled() (env.server.ts:270) is false unless TWO_FACTOR_ENABLED=true|1 — the #1569 kill-switch default.
- Current behavior: Better Auth twoFactor plugin is not registered; no code prompt at sign-in for enrolled users. Enrollment rows are kept (two-factor.server.ts:59) so setting the flag turns it all back on.
- Root cause: None — MFA is off by the intended kill-switch default because the optional env flag is unset everywhere.
- Resolution: Decide the intended state. To enable 2FA, set TWO_FACTOR_ENABLED=true|1 on dev + production and retest. Otherwise keep the kill switch and close with the explanation.
- Look in: `app/lib/env.server.ts`, `app/lib/two-factor.server.ts`
- Existing tests: test/two-factor-kill-switch.route.test.ts; test/two-factor.server.test.ts
- Done when: Decide whether 2FA should be on; If on, set TWO_FACTOR_ENABLED and verify the plugin registers
- Tracker: Keeps blocking #1316 until the state is decided.

### [#1770](https://github.com/chester-hill-solutions/callcaster/issues/1770) feature(audience): client-side preview + column-mapping step (gocanvass parity)
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Add a preview/map step to the audience uploader: parse client-side, show headers + rows, guess and edit the mapping, then start. Server validation stays the gate.
- Current behavior: AudienceUploader is fire-and-forget: server parses + validates, job starts.
- Root cause: UX gap vs gocanvass's import wizard.
- Resolution: Wizard: file -> preview/map -> start; browser-safe CSV parser; reuse shared/contact-import-headers types.
- Look in: `app/components/audience/AudienceUploader.tsx`, `app/lib/csv.ts`, `shared/contact-import-headers.ts`, `app/routes/api+/audience-upload.action.server.ts`
- Existing tests: test/ui/audience-uploader.test.tsx
- Missing tests: preview renders parsed headers/rows; mapping submitted with upload
- Done when: parsed preview before start; columns mappable; server validation still gates
- Tracker: Scope with #1771 (can ship together or split).

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

---

## Blocked / split first — 35

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

### [#1827](https://github.com/chester-hill-solutions/callcaster/issues/1827) Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-10-17
- Create a dedicated Twilio account for the dev environment (ideally via IaC) and update dev.callcaster.ca to use it.
- Current behavior: There is no dedicated CallCaster-dev Twilio account; dev falls back to shared or main-account credentials. #1356 is open.
- Root cause: Environment-level Twilio credential separation has not been provisioned; blocked by the DNS/IaC task #1356.
- Resolution: Create the CallCaster-dev Twilio account, store the credentials as dev environment secrets/vars, and update the dev.callcaster.ca config. Then unblock #1826.
- Look in: `.railway/environments/dev.ts`, `.railway/railway.ts`, `docs/twilio-runtime-inventory.md`, `docs/twilio-parent-ops-runbook.md`
- Missing tests: n/a (operations task)
- Done when: CallCaster-dev Twilio account exists and is documented; dev.callcaster.ca uses the dev account credentials; Credentials are stored as secrets/vars, not in the repo; IaC-vs-manual decision is recorded
- Tracker: blocked-epic: #1356 (dev DNS/IaC) first. Confirm the IaC-vs-manual decision when unblocked; this unblocks #1826.

### [#1885](https://github.com/chester-hill-solutions/callcaster/issues/1885) Retire the remaining auth schema after dependency verification
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: M-L · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- Partial fix only. Dead RPC removal and both actor rewrites are on dev; legacy auth shim remains and the fail-closed schema drop is absent. Issue discussion requires production dependency verification before the drop.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The two live RPCs now use app.current_user_id and get_outreach_attempts is dropped; auth.uid() is still created and schema auth remains to be retired.
- Root cause: The live RPC actor rewrites and dead RPC removal shipped. The baseline shim still creates auth.uid(), and the final dependency guard and schema retirement remain unshipped.
- Resolution: Remaining work only: ship a dependency guard, verify all production dependencies/data, then release the schema drop separately and retire the bootstrap shim.
- Look in: `client/migrations/20260920120100_rewrite_manual_dial_claim_actor.sql:23`, `client/migrations/20260920120200_rewrite_last_access_actor.sql:18`, `drizzle/0001_auth_uid_shim.sql:2`, `scripts/db/bootstrap-fresh-db.mjs:120`, `app/lib/db-rpc.server.ts`, `drizzle/0001_auth_uid_shim.sql`, `drizzle/0000_baseline.sql`, `client/migrations/20260807130000_manual_dial_claim_attempt_count.sql`, `client/migrations/20260715140000_drop_legacy_rls.sql`, `scripts/db/check-db-orphans.mjs`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`
- Existing tests: test/queue-rpc-contract.test.ts; test/db-rpc-claim-queue-entry.test.ts; test/db-rpc-outreach-attempt.test.ts; test/atomic-manual-dial-claims.integration.test.ts
- Missing tests: No legacy-auth SQL guard is present on dev. Existing queue contract tests need latest-definition and actor/no-actor coverage. Database state was not queried in this read-only code audit.
- Done when: A dependency guard fails before any destructive operation when non-auth functions, policies, views or other schema objects still depend on auth.; Production dependencies and data-retention requirements are verified before the schema drop.; Guard and schema drop follow the separate release steps recorded in the issue.; The two rewritten RPC flows retain actor and missing-actor behavior.; A fresh bootstrap does not recreate auth.uid() after retirement.
- Tracker: Blocked / split first. Chunks 1–2 shipped in #1966. The 2026-09-28 issue comment explicitly requires production checks and separate guard/drop release work; do not merge the old chunk-3 branch as-is. Related PR evidence: #1966, #1887. A PR reference alone does not prove deployed behavior.

### [#2213](https://github.com/chester-hill-solutions/callcaster/issues/2213) Correct the remaining temporal column types listed in the schema drift baseline
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: devops/admin · Assignee: none · Updated: 2026-10-17
- The guard and campaign_queue/call/message slices are present. The committed baseline still holds 64 remaining temporal mismatches. This is a multi-table program requiring separate table changes, not one atomic fix.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. 64 committed temporal mismatch lines remain; guard and first table slices are on dev. Tenant write type boundary was tightened in PR #2244, so the earlier untyped-write prerequisite is resolved.
- Root cause: The remaining Drizzle declarations model database timestamps as text. The database types already are temporal; these slices normally change model and callers, not database column DDL. The original call/message/campaign_queue slices and tenant write-boundary repair are complete.
- Resolution: Split remaining tables into atomic tasks and start one table slice. Validate invalid/empty values, wire contracts and Date sorting at each boundary.
- Look in: `scripts/baselines/schema-type-drift.txt:1`, `test/integration-db/schema-type-drift.test.ts:141`, `app/server/tenant-db.ts:121`, `scripts/baselines/schema-type-drift.txt`, `test/integration-db/schema-type-drift.test.ts`, `test/helpers/schema-drift.ts`, `app/db/schema.ts`, `app/db/schema-campaign.ts`
- Existing tests: test/integration-db/schema-type-drift.test.ts
- Missing tests: Guard exists. Each slice needs behavior tests at Date/write/wire boundaries plus real-Postgres verification; no fresh database count performed here.
- Done when: The temporal drift baseline reaches zero in small table-specific changes.; The existing guard rejects both new drift and stale baseline entries.
- Tracker: Move to Blocked / split first as a multi-table parent. Create table-specific tasks; do not re-implement the guard or completed slices. Related PR evidence: #2231, #2233, #2241, #2244. A PR reference alone does not prove deployed behavior.

### [#2168](https://github.com/chester-hill-solutions/callcaster/issues/2168) Cull old dev numbers and workspaces: backfill subaccount names and record the keep-list in the repo
- Verdict: **Blocked / split first** · Size: S-M · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- The keep-list now lives in the repo and is enforced by PR #2536 on dev. Name backfill and the repeat-policy decision remain; workspace-row cleanup stays deferred.
- Current behavior: Source audit: dev@7f2c2f9a, 2026-10-11. The cull report reads the checked-in three-workspace keep-list before phone-name and activity rules. PR #2536 passed full CI, E2E, schema checks, and both Railway preview deployments; issue #2168 is on-dev. Name backfill, repeat policy, and live cleanup remain separate.
- Root cause: No tooling existed to decide what could be culled, and no recorded rule to make the decision repeatable. The name-fragment junk exclusion is deliberately a --exclude flag rather than hardcoded, because it is a judgement call rather than a rule.
- Resolution: The durable keep-list slice is complete in PR #2536, merged to dev. The phone-named workspace 2608141501 wins before cull rules. Keep the follow-up split: backfill existing Twilio subaccount names with an idempotent operation, decide whether cleanup repeats, and keep workspace-row deletion deferred. Recheck current ownership before any new live cleanup.
- Look in: `scripts/cull-report.mjs:1`, `app/lib/twilio-resource-name.ts:1`, `scripts/cull-report.mjs (read-only cull tool, merged #2171)`, `app/lib/twilio-resource-name.ts (naming helper, merged #2167)`, `app/lib/database/workspace-twilio-subaccount.server.ts (subaccount create path the backfill mirrors)`
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

### [#1771](https://github.com/chester-hill-solutions/callcaster/issues/1771) feature(audience): per-row import error report + original CSV artifact
- Verdict: **Blocked / split first** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-17
- Original-file retention source is merged through native child #2350 / PR #2351. Per-row failure/review capture and reviewable/downloadable output in the existing progress panel remain open; do not create a duplicate Feature.
- Current behavior: The route now retains private immutable original bytes before campaign link/status/enqueue and records storage failure without those effects. The import still exposes only aggregate invalid/duplicate counts and does not persist per-row outcomes or unknown opt-out review warnings.
- Root cause: Original source retention is implemented. Validation/dedupe lose precise source-row attribution and the worker has no durable per-row error/outcome representation or existing-panel review/download delivery.
- Resolution: Split per-row source identity/capture, durable reporting and existing progress-panel retrieval into reviewable native Tasks with real prerequisite edges. Coordinate landed-row evidence with #2128 recovery. Keep aggregate behavior and every existing Feature acceptance; original retention still needs deployed acceptance/release under #2350.
- Look in: `app/lib/audience-upload-process.server.ts`, `app/components/audience/AudienceUploader.tsx`, `app/lib/object-storage.server.ts`
- Existing tests: #2350 / PR #2351: 11 actual-route artifact cases; 50 focused upload cases; original bytes, immutable concrete key, storage acknowledgement, truthful failure and denied/foreign controls. Six faults fail; restored 11 pass.; Both full local gates, both independent reviews, applicable exact-head remote checks and both deployments passed. Remote quality ran all 11 artifact cases. This is source/deployment evidence, not functional deployed acceptance.
- Missing tests: Durable per-row rowNumber/field/reason capture, including blank/header/BOM/multiline records and rows removed by validation/dedupe.; Unknown opt-out review warnings and review/download output in the existing progress/completion panel with tenant checks and unchanged aggregates.; Applicable deployed original-file/reporting acceptance and release verification.
- Done when: reviewable per-row failure list or download; original CSV retained safely; aggregate counts unchanged
- Tracker: Native original-file child Task #2350 is source complete. Keep this existing Feature open, split its remaining reporting work, and retain #2128 whole-run/replay requirements. #1770 remains related context.

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

### [#2128](https://github.com/chester-hill-solutions/callcaster/issues/2128) An opt-out column value like "unsubscribe" crashes the audience import mid-run and leaves a partial import committed
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-08
- Recommended title: **Complete audience upload recovery after opt-out normalization**
- Normalization source is merged in PR #2349. Original-file source is merged in PR #2351 under existing Feature #1771. Unknown-value review reporting, exact landed outcomes and safe failure/replay/re-upload remain unfinished; neither child completes this Bug.
- Current behavior: Actual handler/worker boundary faults return ok: true and complete the job after caught import failure. Four isolated PostgreSQL cases show orphan contacts after membership failure, committed contact/link rows after progress failure and duplicate contacts on replay or input with no mapped phone. Foreign/public controls stayed unchanged. Originals are now retained before enqueue, but the worker has no source-row outcome journal.
- Root cause: Mapped opt-out strings are now normalized, but the worker still catches import failure as success. Contact, membership and progress writes commit separately, phone dedupe cannot see orphan/unmapped-phone rows, and no durable source-row journal proves which effects landed.
- Resolution: Keep the complete zero-or-durable-report and same-file re-upload acceptance. Use #1771 for reporting. Split a reviewed durable recovery protocol into atomic native Tasks; preserve source-row identity before filtering and commit effects with recovery evidence. Prove process loss, concurrent replay and failure at every write/status boundary before enabling retry. Verify both child Tasks on deployment/release.
- Look in: `app/lib/audience-upload-process.server.ts`, `app/lib/audience-upload-db.server.ts`, `app/routes/api+/audience-upload.action.server.ts`, `app/components/audience/AudienceUploader.tsx`, `app/components/audience/AudienceUploadMapStep.tsx`, `shared/contact-import-headers.ts`, `app/lib/csv-contacts.ts`, `app/lib/chat-opt-out.ts`
- Existing tests: #2348: 25 actual server upload cases with real CSV/value parsers; 111 focused upload/standalone parser/route/dedupe cases pass.; Removing normalization fails 24 cases with the unmapped control passing; changing the fallback fails 12 with 13 controls passing. Restored source passes all 25.; Existing phone dedupe tests cover within-file and already-linked audience phones; they do not prove recovery after linking or progress failure.; Six actual handler/worker boundary cases reproduce caught-success and completed-job behavior after failure; SQL/write/storage boundaries are mocked.; Four isolated real-PostgreSQL stored-row cases reproduce orphan contacts, partial progress effects, replay and no-phone duplication; foreign-workspace/public-table controls remain unchanged. Pools closed and only the owned schema was dropped. These cases prove the defect, not its repair.; #2350: 11 actual-route original-artifact cases and 50 focused upload cases pass; all six injected source faults fail. PR #2351 has both full local gates, both reviews, applicable remote gates and both deployments green.
- Missing tests: Per-row/unknown-value review output and exact durable landed-row outcomes under #1771.; Repair proof for insert/link/progress/final-status/status-storage failures, lease/process loss, concurrent replay and same-file re-upload, including no mapped phone. A per-chunk transaction alone is insufficient.; Opted-out rows excluded from actual dispatch, applicable deployed upload/recovery acceptance and default-branch release verification.
- Done when: `unsubscribe`, `opted out`, `opted-out`, `no`, `false`, `n`, `0` are all accepted and normalised (a parameterised test over the set).; An unrecognised value does not throw; it maps to the documented safe default and the row is reported as needing review.; A failure part-way through a run leaves **zero** rows committed, or commits with a per-row report naming exactly which rows landed (kill-check: remove the transaction and confirm the test goes red).; Re-uploading the same file does not duplicate the rows that already landed.; An opt-out value is never dropped on the floor: the contact is excluded from dispatch.
- Tracker: Native normalization Task #2348 is under #2128; native original-file Task #2350 is under existing Feature #1771. Both sources are merged; keep their deployed acceptance/release open. Retain this parent’s full acceptance and implement the pinned recovery fault contract through separate atomic children. Do not duplicate #1771 or call normalization/artifact retention a recovery fix.

### [#1802](https://github.com/chester-hill-solutions/callcaster/issues/1802) security(deps): remediate open runtime dependency alerts
- Verdict: **Blocked / split first** · Labels: none · Assignee: none · Updated: 2026-10-07
- Runtime security is a native Epic with separate package Tasks. Six source fixes are merged: Axios #2336, csv-parse #2338, Scalar SDK #2339, ws #2343, Twilio JWS #2345 and PostCSS #2346. Deployed acceptance and release promotion remain open. At dev@befe20fa, npm production audit is clear and the independently resolved Bun runtime graph has zero affected nodes.
- Resolution: Complete each child’s applicable deployed acceptance and release promotion. Verify fresh audits and the live default-branch alert state before closing the Epic. Do not repeat completed package source work or treat package exposure as a proved app exploit.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Tracker: The Bun mandatory runtime trace resolves 594 nodes, zero missing required edges and zero affected nodes; it excludes vendor devDependencies and optional peer integrations. The most recent 2026-10-04 master snapshot has two runtime alerts (#220, #218) plus 37 development alerts, a separate release view. All six source PRs passed full local CI, exact-head remote gates and both deployments. Keep #1805 and closed #1809 as existing history; all applicable child QA/release requirements remain open.

### [#1803](https://github.com/chester-hill-solutions/callcaster/issues/1803) security(deps): remediate open development dependency alerts
- Verdict: **Blocked / split first** · Labels: none · Assignee: none · Updated: 2026-10-07
- Development security remains a native Epic. At dev@ee28af66, thirteen of fourteen live high-severity default-branch advisory ranges match five current npm development package families: Browserslist, fast-uri, ip-address, js-yaml and undici. The Axios range does not match current npm 1.20.0. This subset comparison does not replace the earlier full audit or establish exploit reachability, runtime exposure or Bun scope.
- Resolution: Trace advisory conditions and real consumers, then create separate native child Tasks by package or toolchain concern before implementation. Verify both locks and meaningful tool behavior; do not apply automatic audit major changes or downgrades without compatibility proof.
- Look in: `package.json`, `package-lock.json`, `bun.lock`
- Tracker: Keep runtime fixes under #1802 and existing landed PostCSS work under #2342/#2346. Trace current advisory conditions and tool consumers; split confirmed concerns into atomic native child Tasks. Normalize provider range syntax and reject invalid ranges before deciding applicability. Preserve full npm/Bun install and codegen/test/coverage/build behavior, with complete local/remote gates and both deployments.

### [#1878](https://github.com/chester-hill-solutions/callcaster/issues/1878) Surface and select the caller audio on the /call welcome dialog
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-05
- The session-selected audio feature remains unfinished. Complete-query validation is implemented; the separately confirmed AMD playback/continuation defect in #2396 is a prerequisite for complete playback behavior.
- Current behavior: Source audit: dev@eb7bc066, 2026-10-05. The dialog carries a voicemail boolean and no picker; predictive callbacks and agent drop still use campaign defaults. Machine and agent recording choices are session-only. Manual calling keeps its no-AMD policy. The shared verifier now authenticates complete queries, including GET/HEAD semantics. Actual-route follow-up at dev@9f33f3e7 confirmed enabled-drop callbacks request playback twice and next-turn continuation runs before the playback update acknowledgement. The existing drop-off concurrency control passes. Native #2396 now blocks #1878.
- Root cause: The call-loader and screen contract lose file identity. The start service and every predictive continuation lack a machine selection. Agent drop resolves a child SID, which does not cover independent predictive recipient legs, and reads the shared default.
- Resolution: Resolve #2396 as a separate callback operation first, with durable duplicate/acknowledgement recovery. Then extend the workspace library and shared Select/FormField composition. Define omitted/default, explicit None and named selections. Keep screen state by workspace/campaign/agent through revalidation; freeze the machine choice at conference start and carry it through every signed callback edge. Keep the agent picker reachable in-call, including after None. Validate existing tenant-owned objects and actor/campaign/conference-bound active recipients before playback; await provider acknowledgement and retain the connected call on failure. Extend the public start OpenAPI contract before validation and generated clients. Do not write campaign or script configuration.
- Look in: `app/components/call/CallScreen.Dialogs.tsx`, `app/components/call/CallScreen.Layout.tsx`, `app/components/call/CallScreen.CallArea.tsx`, `app/hooks/call/useCallScreen.ts`, `app/routes/workspaces+/$id/campaigns/$campaign_id/call.loader.server.ts`, `app/lib/platform-media.server.ts`, `app/routes/api+/audiodrop.action.server.ts`, `app/lib/auto-dial-start.server.ts`, `app/lib/auto-dial.server.ts`, `app/routes/api+/auto-dial/$roomId.action.server.ts`, `app/routes/api+/auto-dial/status.action.server.ts`, `app/lib/openapi-platform-components.ts`, `app/lib/services/hooks-api.ts`
- Blocked by: [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396)
- Existing tests: test/ui/call-screen-dialogs.test.tsx; test/ui/call-screen-callarea.test.tsx; test/audiodrop.test.ts; test/auto-dial-start.server.test.ts; test/auto-dial.server.test.ts; test/auto-dial-room.route.test.ts; test/auto-dial-status.test.ts
- Missing tests: Session file identity/None through every continuation; loader revalidation and separate agents; no shared configuration writes; tenant/object/actor/session refusal before provider updates; provider delay/rejection and retry without ending the call; API schema parity; real shared Dialog/Select/Toaster and stable geometry. Existing AMD replay/acknowledgement findings must be tested explicitly before claiming robust playback.
- Done when: The welcome dialog surfaces the caller audio (name and a way to change it); What is surfaced matches what the dialer actually plays; The choice is session-only and does not write the campaign config
- Tracker: Keep OPEN in Blocked / split first with native #2396 dependency. Preserve the session-only selection and media/recipient ownership plan; the signature prerequisite is fulfilled. Original feature criteria remain unchanged.

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

### [#780](https://github.com/chester-hill-solutions/callcaster/issues/780) Hang up controls/block in IVR script (parent of #1883 + #1884)
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-28
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

### [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030) Spike: weigh permission models against what the auth system already provides
- Verdict: **Blocked / split first** · Size: M · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The root of the authorization cluster and the first thing that must land. The issue text is explicit: before making implementation and architecture decisions, weigh the options and investigate what systems the codebase already has in place, and what the tools being used — better-auth — can provide. Everything else in the cluster is unspecified until this reports.
- Current behavior: Unknown until investigated. The risk is building a hand-rolled permission layer over an auth system that already has an administration/permission plugin, which is the most expensive possible outcome here because it doubles the model and leaves two sources of truth.
- Root cause: Roles were adopted as the model without first checking whether a permission primitive was available.
- Resolution: Produce a written recommendation, not code. Cover: what better-auth already provides for roles and permissions, including its admin plugin, and whether it is already installed or only nominally a dependency; what the codebase already has, since the tenant-scoped client and the middleware boundary are a de facto authorization layer; the realistic options with their migration cost; and a recommendation with the reason. State explicitly what was ruled out and why, so the next person does not re-derive it.
- Look in: `package.json (better-auth version and plugins in use)`, `app/lib/admin-middleware.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/server/tenant-db.ts`, `app/lib/data-plane-middleware.server.ts`
- Done when: A written recommendation exists, reviewed before any implementation begins; better-auth permission capabilities are established from the installed version, not from documentation memory; Existing in-repo authorization is inventoried so it is extended rather than duplicated; Ruled-out options are recorded with reasons
- Tracker: Highest value-per-size item in the entire board, and it blocks five others. Do this before writing any authorization code anywhere. Sizing is M because it is investigation, not implementation — the implementation is the XL.

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
- The broad policy question behind the cluster. Decide which capabilities an Agent has over live-call campaigns, IVR campaigns and SMS campaigns. The issue proposes defaults of all live-call campaigns, no IVR campaigns, no SMS campaigns, and states that without access those pages must be hidden from the sidebar AND return 403 on a direct attempt.
- Current behavior: Partly implicit. The sidebar is the main gate, so a denied user can often still reach a page by URL.
- Root cause: Capability-by-capability policy was never written down, so it is enforced ad hoc in whichever component happened to check it.
- Resolution: #2030 supplies the vocabulary (docs/adr/0039-role-checks-become-capability-checks.md): grow PRODUCT_CAPABILITIES in app/lib/capabilities.ts rather than inventing a second model. Then: write the default capability set down as data, not as scattered conditionals; enforce at the route for every surface in the set, so hiding the sidebar and refusing the URL are the same rule applied twice; and confirm the 403 requirement, noting it differs from the 404-for-non-members convention in AGENTS.md — that convention is about workspace membership, whereas this is about a known member lacking a capability, so 403 is defensible here. Worth deciding that boundary explicitly rather than by accident.
- Look in: `app/components/layout/WorkspaceSidebar.tsx`, `app/lib/workspace-middleware.server.ts`, `app/routes/workspaces+/$id/**`, `app/db/workspace-scoped-tables.ts`
- Missing tests: each capability has a route-level enforcement test; sidebar visibility and route enforcement agree
- Done when: The Agent capability set is written down as data, not scattered conditionals; Every denied surface returns 403 on a direct URL attempt, not only when hidden; The 403-versus-404 boundary is decided and documented rather than incidental; Sidebar visibility and route enforcement read from the same source
- Tracker: Unblocked by #2030 (docs/adr/0039-role-checks-become-capability-checks.md). This is the product decision the cluster is really waiting on. The defaults in the issue are a proposal, not a decision — get them confirmed before building enforcement, or the enforcement work gets thrown away when the policy changes.

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

### [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) Dev-environment PR acceptance suite
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
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

### [#1272](https://github.com/chester-hill-solutions/callcaster/issues/1272) feat(interactive-sms): deliver a flagged exact-match opener-to-follow-up run slice
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
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

### [#1271](https://github.com/chester-hill-solutions/callcaster/issues/1271) feat(billing): add local message identity and atomic SMS credit reservations
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Give message a local domain-id PK with nullable indexed twilio_sid (rows before provider dispatch) and an atomic PL/pgSQL credit-reservation RPC with settle/reconcile.
- Current behavior: message.sid is the required PK; campaign messages created at Twilio before local persistence; no reservation schema/RPC; billing supports idempotent writes but not holds.
- Root cause: Not implemented.
- Resolution: Additive identity migration first, then reservation/settlement migration + service. Reuse apply_ledger_entry_and_sync_credits, shared/pricing.ts, shared/billing-keys.ts.
- Look in: `app/db/schema.ts`, `app/lib/sms-send.server.ts`, `app/lib/transaction-history.server.ts`, `shared/pricing.ts`, `shared/billing-keys.ts`, `client/migrations/`
- Existing tests: none
- Missing tests: message before SID; nullable unique SID; concurrent reservation affordability; idempotent settle/release/reconcile
- Done when: Message row exists before SID; SID nullable + unique when present; Concurrent reservations cannot overspend; Settle/release/reconcile idempotent
- Tracker: Blocks #1272; independent of the v2 editor.

### [#1269](https://github.com/chester-hill-solutions/callcaster/issues/1269) feat(scriptkit): add provider-neutral interaction document v2 and deterministic reducer
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Create vendored @chester-hill-solutions/scriptkit-interaction-core: ScriptDocument v2 schemas (send/collect/action/wait/handoff/complete), typed transitions, strict publish validator, deterministic reducer/effects, exact classifier, explicit convertV1ToV2. Provider/framework neutral.
- Current behavior: Only v1 call-script packages exist under vendor/scriptkit; v2 exists only in ADR-0032.
- Root cause: Not implemented.
- Resolution: Build the package only (no persistence/Twilio/React/billing); ship golden fixtures, publish-validation positive/negative, reducer determinism, effect-ID stability, simulator parity.
- Look in: `vendor/scriptkit/`, `docs/adr/0032-interactive-sms-script-document-v2.md`, `docs/interactive-sms-delivery-plan.md`
- Existing tests: none
- Missing tests: v1->v2 golden; publish validation; reducer determinism; effect ID stability; simulator parity
- Done when: All six ops + transitions exported; convertV1ToV2 explicit with stable warnings; Stable error codes; Deterministic reducer for fixtures
- Tracker: Blocks #1272; independent of #1271; can start.

### [#1268](https://github.com/chester-hill-solutions/callcaster/issues/1268) epic(interactive-sms): ship release-one audited SMS/MMS interactions
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Parent epic for interactive SMS/MMS. Milestone A (domain id, single dispatch coordinator, credit reservation, policy) and B (vertical slice). Sub-issues #1269-1272.
- Current behavior: A2 consolidation mostly landed; A1, A3, B1 absent; consent/disclosure tables, flags, and observability have no dedicated child issue; tracking docs stale.
- Root cause: Epic; not single-agent work.
- Resolution: Refresh milestone status in docs/interactive-sms-build-tracking.md; create missing child issues (consent, flags/observability, correlation); keep #1272 blocked until Phase A integrity gates pass.
- Look in: `docs/interactive-sms-delivery-plan.md`, `docs/interactive-sms-build-tracking.md`
- Existing tests: n/a
- Missing tests: release-level suite once implemented
- Done when: Every milestone has owned child issue + dependency; A1-A3 exit gates pass before B1; One flagged workspace completes the slice without duplicate effects/billing
- Tracker: Keep as epic; split before assignment.

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

## Needs triage — 113

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#2519](https://github.com/chester-hill-solutions/callcaster/issues/2519) call settings: call in verification not conigured
- Status: on-dev · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2724](https://github.com/chester-hill-solutions/callcaster/issues/2724) Adopt Effect for the audio conversion lifetime (child process, temp file, deadline)
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2722](https://github.com/chester-hill-solutions/callcaster/issues/2722) Adopt Effect for Audience Upload Status polling with a serialized read
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-10-19
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2718](https://github.com/chester-hill-solutions/callcaster/issues/2718) Adopt Effect for call-status polling with owner identity and cancellation
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2719](https://github.com/chester-hill-solutions/callcaster/issues/2719) Audience detail page never stops polling a finished call-list upload
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2716](https://github.com/chester-hill-solutions/callcaster/issues/2716) Decide the next scoped Effect adoption
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2714](https://github.com/chester-hill-solutions/callcaster/issues/2714) Railway plans propose deleting an existing legacy variable
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2712](https://github.com/chester-hill-solutions/callcaster/issues/2712) Campaign export polling overlaps slow status requests
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2706](https://github.com/chester-hill-solutions/callcaster/issues/2706) Twilio transport errors interrupt device cleanup on page exit
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2705](https://github.com/chester-hill-solutions/callcaster/issues/2705) Delayed Twilio microphone selection restarts polling after page exit
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2704](https://github.com/chester-hill-solutions/callcaster/issues/2704) Queue event bursts repeatedly abort workspace navigation loaders
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2702](https://github.com/chester-hill-solutions/callcaster/issues/2702) Power-dial Leave Campaign resets other callers’ queue assignments
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2703](https://github.com/chester-hill-solutions/callcaster/issues/2703) Concurrent workspace event reads duplicate delivered events
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2701](https://github.com/chester-hill-solutions/callcaster/issues/2701) Destroy all stale stripe environments and sandboxes
- Status: Backlog · Labels: devops/admin · Assignee: none · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2700](https://github.com/chester-hill-solutions/callcaster/issues/2700) Cannot find stripe account that is connected to dev environment
- Status: Backlog · Labels: question · Assignee: @wra-sol · Updated: 2026-10-18
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2699](https://github.com/chester-hill-solutions/callcaster/issues/2699) Cannot find the stripe account that is connected to prod
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

### [#1165](https://github.com/chester-hill-solutions/callcaster/issues/1165) Prune stale non-production Twilio resources safely
- Status: In progress · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-17
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2503](https://github.com/chester-hill-solutions/callcaster/issues/2503) Campaign creation pages don't need headers since they have the breadcrumbs
- Status: tested-on-dev · Labels: design · Assignee: @sai-sy · Updated: 2026-10-17
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

### [#2605](https://github.com/chester-hill-solutions/callcaster/issues/2605) Redirect to Sign In after a successful password reset
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-15
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

### [#2513](https://github.com/chester-hill-solutions/callcaster/issues/2513) SMS Message page doesn't stop the list from growing once you're searching
- Status: on-dev · Labels: ux · Assignee: @sai-sy · Updated: 2026-10-15
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2510](https://github.com/chester-hill-solutions/callcaster/issues/2510) SMS Campaign bulk confirmation modal checkbox is off
- Status: on-dev · Labels: design · Assignee: @sai-sy · Updated: 2026-10-15
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

### [#2493](https://github.com/chester-hill-solutions/callcaster/issues/2493) Stow bootstrap fails on macOS when sha256sum is absent
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2479](https://github.com/chester-hill-solutions/callcaster/issues/2479) Make audience import effects recoverable by source row
- Status: on-dev · Labels: none · Assignee: @wra-sol · Updated: 2026-10-08
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2239](https://github.com/chester-hill-solutions/callcaster/issues/2239) e2e toolchain step times out on a 62.8 MB ffmpeg apt download
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-07
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2472](https://github.com/chester-hill-solutions/callcaster/issues/2472) Limit public docs to supported public API surfaces
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-07
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2469](https://github.com/chester-hill-solutions/callcaster/issues/2469) Link the workspace address warning to its service-address form
- Status: on-dev · Labels: none · Assignee: none · Updated: 2026-10-07
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2303](https://github.com/chester-hill-solutions/callcaster/issues/2303) Extract safe-outbound-url to a shared package — three repos now need it, and two have written their own half
- Status: Backlog · Labels: none · Assignee: none · Updated: 2026-10-03
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
