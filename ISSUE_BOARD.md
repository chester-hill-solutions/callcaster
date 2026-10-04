# CallCaster — Open Issue Board for Agents

Reviewed at `dev@b6a00f60 + webhook delivery plan audit (2026-10-04 UTC)` · 305 open issues in `chester-hill-solutions/callcaster` · Refresh with `npm run tools:issues:board`

Project status could not be refreshed: the current GitHub token lacks `read:project`. The IN PROGRESS markers are retained from the prior board at `dev@8cb8c0f7`; they are not current verification results. Issue state, labels and assignees come from the fresh REST issue snapshot read on 2026-10-04 UTC after the verified webhook delivery acceptance update. Project markers remain cached; no current project-status result is claimed.

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

## Fix now — 63

Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.

### [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) Prepare a valid A2P Messaging Profile before brand registration
- Verdict: **Fix now** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- The canonical A2P chain omits the required Messaging Profile EndUser, suppresses product submission errors and does not resubmit a repaired existing product.
- Current behavior: Source audit: dev@aacb17ac, 2026-10-03. provisionA2pRegistration creates the Trust Product and assigns the customer profile, leaves the required EndUser as a TODO, catches submission failure and continues to the brand step. Existing-product retries only check customer-profile assignment.
- Resolution: Collect and validate the required provider business inputs, create/reuse and assign the Messaging Profile EndUser, evaluate and submit before brand registration, and make repair retries idempotent. Provider and input failures must stop the brand step with visible action-needed details. Do not infer regulatory attributes from prose.
- Look in: `app/lib/twilio-a2p-provision.server.ts`, `app/lib/twilio-client.server.ts`, `app/lib/types.ts`, `app/lib/messaging-onboarding/predicates.ts`, `app/components/onboarding/`
- Existing tests: test/twilio-a2p-provision.server.test.ts exercises campaign phases with an existing Trust Product; it does not claim product preparation is complete.
- Missing tests: Installed SDK tests for EndUser creation/reuse, assignments, evaluation, submission, missing inputs, provider failure and repair retries.; Real persistence/readiness and deployed provider preparation verification.
- Done when: Required Messaging Profile inputs are explicit and valid; public-company attributes follow the current provider contract.; Create/reuse and assign the required EndUser and customer profile before evaluation/submission.; Provider/input failure blocks brand creation with visible details.; Retry repairs and resubmits incomplete existing products without duplicates.; Private/public business controls and deployed provider checks pass before promotion and closure.
- Tracker: Confirmed separate prerequisite defect. Implement as its own atomic concern; #2082 does not complete provider product preparation.

### [#2117](https://github.com/chester-hill-solutions/callcaster/issues/2117) sms_status_side_effects does a synchronous up-to-10s customer-webhook POST on the worker's serial loop and swallows the failure — never retried
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-04
- SMS side effects still await the external customer webhook and log delivery failure without throwing. Durable webhook_delivery exists but this path does not use it.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. SMS side effects still await the external customer webhook and log delivery failure without throwing. Durable webhook_delivery exists but this path does not use it. Current dev@b6a00f60 source confirms that incoming SMS side effects use SID/status keys; a SID-only delivery key would suppress distinct status events.
- Resolution: Queue customer webhooks for durable retry and message/status event deduplication. To meet the no-delay claim-loop requirement, give webhook delivery separate processing capacity or bound delivery concurrency while reserving capacity for other job types; enqueueing onto the same serial loop alone does not meet it. app/lib/worker/poll-jobs.server.ts:320-359 claims one job and awaits its handler before the next claim.
- Look in: `app/lib/worker/webhook-side-effects.server.ts:278`, `app/lib/worker/webhook-side-effects.server.ts:297`, `app/lib/workspace-webhooks.server.ts:77`, `app/lib/worker/handlers/campaign.server.ts:640`, `app/lib/worker/handlers/cron.server.ts (`runSmsStatusSideEffects`)`, `app/lib/worker/job-params.server.ts:175-181,221`, `app/lib/worker/handlers/campaign.server.ts:545-567`, `app/lib/workspace-webhooks.server.ts`, `app/routes/api+/sms/status.action.server.ts:26-31`
- Existing tests: test/webhook-side-effects.test.ts
- Missing tests: Retry/dedup tests, distinct sent/delivered event controls, repeated-callback controls and worker next-claim timing with a slow destination. Existing delivery handler alone does not prove this path is fixed.
- Done when: An `outbound_sms` webhook that fails is retried by the `webhook_delivery` job, with the retry count visible in the job record (kill-check: revert to the inline call and confirm the test goes red).; A slow webhook destination does not delay other jobs in the real processing arrangement. Exercise the delivery worker/concurrency boundary rather than only asserting that SMS side effects enqueue a delivery. Saturating delivery capacity with slow destinations must still allow other job types to be claimed.; Duplicate enqueue attempts for one normalized SMS status event produce one durable delivery job. Distinct accepted status updates for the same message, such as sent then delivered, remain deliverable. Do not use a SID-only delivery key.; SMS side-effect processing performs no inline customer webhook POST. The delivery handler owns the POST in separate processing capacity or bounded delivery concurrency with reserved capacity for other job types; a grep check excludes this intended delivery boundary.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2269](https://github.com/chester-hill-solutions/callcaster/issues/2269) Validate inbound IVR scripts before number attachment
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-04
- Attachment services accept scripts without full inbound target validation, and workspace/campaign saves can invalidate an attached script.
- Current behavior: Source audit dev@c1d3a34e, confirmed unchanged at eaaffaf4: the phone-number form delegates to patchWorkspaceNumber. The automated-menu preset separately checks workspace presence only. Workspace and campaign script saves can overwrite an attached valid configuration. Generic editor validation misreads inbound terminal targets and displays errors in a conditional flow row.
- Root cause: Inbound activation and attached-script editing have no shared ownership/routing validation boundary.
- Resolution: Use one inbound validator in the platform attachment service, automated-menu preset and both attached-script save paths. Align client/server checks for documented queue, forward and voicemail email targets, validate workspace ownership and reject before writes. Preserve the draft and last valid configuration; use canonical shared feedback without page movement. Clearing remains valid.
- Look in: `app/lib/platform-workspace-numbers.server.ts`, `app/routes/workspaces+/$id/phone-numbers.action.server.ts`, `app/lib/routing-preset-write.server.ts`, `app/lib/script-persistence.server.ts`, `app/components/campaign/settings/script/ScriptEditorShell.tsx`, `app/lib/inbound-ivr-db.server.ts`, `docs/contact-center-platform-plan.md`
- Missing tests: Real platform/form and preset attachment boundaries, plus workspace/campaign attached-script saves: foreign/missing/type-invalid scripts, dangling/malformed targets, valid targets and clearing.; Client/server target agreement, preserved draft/configuration, usable shared validation feedback and no layout movement.
- Done when: Foreign, missing, unsuitable and invalid scripts cannot be attached or saved over an attached valid version.; Valid targets and clearing remain usable.; API, editor and target docs agree; real write-boundary regressions and deployed checks pass.; Draft/configuration are preserved and canonical shared validation feedback does not move the page.
- Tracker: Current native scope corrected after the write-boundary audit. Source defect remains Fix now; playback and recipient delivery are separate concerns.

### [#2107](https://github.com/chester-hill-solutions/callcaster/issues/2107) Require answers before public survey completion
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- The public survey still has no required-answer checks in Next/Submit, and completion updates completed_at without checking required persisted answers. Native required controls sit outside a form.
- Current behavior: Stable respondent identity source prerequisite #2125 merged to dev in PR #2293 at be7f2312; native dependency removed. Public completion still lacks required-answer enforcement. Implement per-page user feedback and persisted server checks in its own atomic fix, preserving optional questions.
- Resolution: Add per-page respondent validation and independent server completion validation; do not patch survey-submit.ts, which manages survey authoring.
- Look in: `app/routes/survey+/$surveyId.tsx:107`, `app/routes/survey+/$surveyId.tsx:198`, `app/lib/survey-db.server.ts:699`, `app/routes/survey+/$surveyId.tsx`, `app/routes/api+/survey-complete.action.server.ts`, `app/lib/survey-db.server.ts`
- Missing tests: No public survey UI required-field test or database completion rejection test was found. survey-submit.ts belongs to survey editing, not this respondent path.
- Done when: A required question left blank blocks advancing to the next page, with a visible error and focus moved to it.; A required question left blank on the last page blocks submission.; A response with a missing required answer is rejected **server-side** even if the client is bypassed (kill-check: remove the client check and confirm the server test still passes; then remove the server check and confirm a test goes red).; Non-required questions remain skippable.; An existing completed response with a blank required answer is not retroactively invalidated without a decision on that.
- Tracker: Ready for its own atomic required-answer fix from clean dev.

### [#2268](https://github.com/chester-hill-solutions/callcaster/issues/2268) Deliver inbound IVR voicemail to the script recipient
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- The documented voicemail email target is dropped; delivery reads the number default instead.
- Current behavior: Source audit dev@f6d02f91: the terminal branch discards the voicemail target payload. The recording callback uses number.inbound_action. The platform plan documents a voicemail email destination and builder picker; no ADR found changes that contract.
- Root cause: No trusted recipient metadata is carried from the selected IVR target into recording delivery.
- Resolution: Bind the validated target email to trusted workspace-scoped call metadata before recording. Read that recipient after callback signature, call and workspace checks. Preserve legacy number/queue delivery and processed-recording retry protection. Verify storage field and migration/bootstrap coverage if needed; do not trust an arbitrary callback field or URL override.
- Look in: `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/lib/inbound-voicemail-twiml.server.ts`, `app/routes/api+/email-vm.action.server.ts`, `app/lib/telephony-db.server.ts`, `docs/contact-center-platform-plan.md`
- Existing tests: test/email-vm.route.test.ts (existing number-recipient and recording controls)
- Missing tests: Script-selected email differs from number default, legacy and other-workspace controls, script edits, retry stability and duplicate protection.
- Done when: The script target recipient receives the voicemail.; Legacy recipients remain valid and untrusted callbacks cannot replace another call or workspace recipient.; Retries and later script edits retain the bound recipient without duplicate emails.; Runtime, docs, tests and deployed verification agree before promotion.
- Tracker: Independent Task split from #2088. Follow the documented email contract; playback does not complete delivery.

### [#2128](https://github.com/chester-hill-solutions/callcaster/issues/2128) An opt-out column value like "unsubscribe" crashes the audience import mid-run and leaves a partial import committed
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- PR #2250 fixes a separate csv-contacts parser, but the audience upload imports lib/csv and maps opt_out strings verbatim into contact inserts. The affected upload path still lacks safe boolean normalization.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. PR #2250 fixes a separate csv-contacts parser, but the audience upload imports lib/csv and maps opt_out strings verbatim into contact inserts. The affected upload path still lacks safe boolean normalization.
- Root cause: PR #2250 changed csv-contacts.ts, but the affected audience upload path uses lib/csv and maps non-phone values verbatim. The boolean coercion is not wired into that path.
- Resolution: Reuse one fail-safe opt-out parser in the actual audience-upload mapping path, with an upload-level test. Split row reporting and whole-run failure/re-upload guarantees into separate reviewable work; do not assume the merged standalone parser fixes this route.
- Look in: `app/lib/audience-upload-process.server.ts:1`, `app/lib/audience-upload-process.server.ts:406`, `app/lib/audience-upload-process.server.ts:496`, `app/lib/audience-upload-process.server.ts`, `app/lib/audience-upload-db.server.ts`, `app/routes/api+/audience-upload.action.server.ts`, `app/components/audience/AudienceUploader.tsx`, `AudienceUploadMapStep.tsx`, `shared/contact-import-headers.ts`, `app/lib/csv-contacts.ts`, `app/lib/chat-opt-out.ts:1`
- Existing tests: test/csv-opt-out-parsing.test.ts covers the separate contact parser.; test/audience-upload.route.test.ts does not prove safe opt_out normalization at the insert boundary.
- Missing tests: Upload CSV with unsubscribe/opted out/unknown strings through the actual server mapping path; assert boolean opt_out and no partial-write failure.
- Done when: `unsubscribe`, `opted out`, `opted-out`, `no`, `false`, `n`, `0` are all accepted and normalised (a parameterised test over the set).; An unrecognised value does not throw; it maps to the documented safe default and the row is reported as needing review.; A failure part-way through a run leaves **zero** rows committed, or commits with a per-row report naming exactly which rows landed (kill-check: remove the transaction and confirm the test goes red).; Re-uploading the same file does not duplicate the rows that already landed.; An opt-out value is never dropped on the floor: the contact is excluded from dispatch.
- Tracker: Fix now: mapped audience opt_out remains unnormalized. The broad row-report/retry requirements need a separate plan. Related PR evidence: #2250. A PR reference alone does not prove deployed behavior.

### [#2115](https://github.com/chester-hill-solutions/callcaster/issues/2115) ensureStripeCustomer is read-then-create-then-write, so two concurrent first-time checkouts orphan a Stripe customer and can strand a saved payment method
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- First-time checkout remains a read-create-unconditional-write race. Stripe customer creation does not use a workspace idempotency key.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. First-time checkout remains a read-create-unconditional-write race. Stripe customer creation does not use a workspace idempotency key.
- Resolution: Use an idempotent workspace customer creation and/or a compare-and-set protocol; reconcile losers.
- Look in: `app/lib/platform-billing.server.ts:54`, `app/lib/platform-billing.server.ts:65`, `app/lib/database/stripe.server.ts:62`, `app/lib/platform-billing.server.ts (`ensureStripeCustomer`, `createBillingCheckoutSession`)`, `app/routes/api+/workspaces+/$workspaceId/billing/sessions`, `app/db/schema.ts (the `workspace.stripe_id` column)`
- Existing tests: test/platform-billing-checkout.test.ts; test/db-stripe.server.test.ts
- Missing tests: Concurrent first checkout, loser logging, retained payment method, and existing-ID control tests.
- Done when: Concurrent first-time checkouts both use the same canonical Stripe customer, and workspace.stripe_id stores that same ID. Exactly one customer is created, or any losing customer is identified and reconciled.; If the protocol creates a losing customer, its ID is logged and reconciled; an idempotent single-customer path need not create an orphan.; A saved payment method is retrievable after the race.; The permitted path (a second checkout after `stripe_id` is set) is unchanged and does not call `createStripeContact`.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2112](https://github.com/chester-hill-solutions/callcaster/issues/2112) The reconciliation SMS side divides a mixed SMS+MMS credit total by the SMS per-segment rate, while the Twilio side never reads mms-outbound — every MMS adds phantom segments
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- Reconciliation divides all SMS-key debit credits by the SMS segment rate while provider matching excludes MMS. MMS uses the SMS key but has a flat, different debit.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Reconciliation divides all SMS-key debit credits by the SMS segment rate while provider matching excludes MMS. MMS uses the SMS key but has a flat, different debit.
- Resolution: Compare SMS and MMS in consistent separate units or join ledger/message facts before converting units.
- Look in: `shared/billing-reconciliation.ts:180`, `shared/billing-reconciliation.ts:185`, `app/lib/worker/webhook-side-effects.server.ts:207`, `app/lib/billing-reconciliation.server.ts`, `app/lib/billing-reconciliation-workspace.server.ts`, `app/lib/billing-reconciliation-alert.server.ts`, `app/lib/billing-reconciliation-snapshot.server.ts`, `shared/billing-reconciliation.ts:12`, `app/lib/worker/webhook-side-effects.server.ts:207-209`, `shared/pricing.ts (`SMS_SEGMENT_CREDITS`, `MMS_CREDITS`)`
- Existing tests: test/billing-reconciliation.test.ts; test/billing-reconcile-workspace.server.test.ts
- Missing tests: Pure SMS, pure MMS and mixed tests with rate-card-driven coverage; no real provider reconciliation measured here.
- Done when: A pure SMS case reconciles with zero variance; disabling SMS matching makes this test fail.; A workspace that sent only MMS reconciles with zero variance.; A workspace that sent a mix of SMS and MMS reconciles with zero variance.; Explicitly map the provider SMS/MMS usage categories that correspond to supported billed message kinds and test that mapping.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2084](https://github.com/chester-hill-solutions/callcaster/issues/2084) Number purchase reads credits, calls Twilio, then debits — no transaction, no reservation and no balance floor
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- Number rental still reads credits, provisions Twilio, writes local state and onboarding, and only then debits. There is no visible balance reservation or compensation across this sequence.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Number rental still reads credits, provisions Twilio, writes local state and onboarding, and only then debits. There is no visible balance reservation or compensation across this sequence.
- Resolution: Add an atomic credit reservation and explicit provider/database compensation protocol.
- Look in: `app/lib/platform-workspace-numbers.server.ts:129`, `app/lib/platform-workspace-numbers.server.ts:175`, `app/lib/platform-workspace-numbers.server.ts:316`, `app/lib/platform-workspace-numbers.server.ts:129-138,175-192,216-325`, `app/lib/number-rental-billing.server.ts:394-397 (the documented precedent)`, `client/migrations/20260704000004_apply_ledger_entry_and_sync_credits.sql:75-79`, `app/lib/workspace-credits.server.ts`, `shared/pricing.ts (`NUMBER_RENTAL_MONTHLY_CREDITS`, `debitAmountFromCredits`)`, `scripts/check-credit-write-paths.mjs`
- Missing tests: Real concurrency test for one affordable rental; provider/write fault injection must prove balance, number inventory and ledger agree.
- Done when: Two concurrent rentals of different available numbers for a workspace with credits for only one result in exactly one provider purchase and one debit; the other returns an insufficient-credits error.; A Twilio failure after the funds are reserved leaves the balance unchanged and no `workspace_number` row.; Provider success followed by local insert, onboarding or debit failure triggers compensation or leaves a durable retry state; no unbilled active number is silently retained.; The balance can never go negative through this path (an assertion or check, not a comment).; `check:credit-writes` stays green.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2113](https://github.com/chester-hill-solutions/callcaster/issues/2113) hasMaterialBillingVariance ignores categories.numbers.variance, so number-rental ledger drift never alerts and is not even stored in the snapshot
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Number variance is calculated but excluded from material alerts and snapshots. The number comparison also equates ledger events with provider number-month units, including purchase events.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Number variance is calculated but excluded from material alerts and snapshots. The number comparison also equates ledger events with provider number-month units, including purchase events.
- Resolution: First make number units/purchase-cycle treatment correct, then include number variance in snapshot and alert.
- Look in: `shared/billing-reconciliation.ts:232`, `shared/billing-reconciliation.ts:261`, `app/lib/billing-reconciliation-snapshot.server.ts:47`, `app/lib/billing-reconciliation-alert.server.ts:174-184`, `app/lib/billing-reconciliation-snapshot.server.ts`, `app/lib/billing-reconciliation.server.ts`, `app/lib/billing-reconciliation-workspace.server.ts`, `shared/billing-reconciliation.ts:12`, `shared/pricing.ts (`NUMBER_RENTAL_MONTHLY_CREDITS`)`
- Existing tests: test/billing-reconciliation.test.ts; test/billing-reconciliation-alert.test.ts
- Missing tests: Need month-unit positive control, purchase exclusion/period semantics, threshold alert and snapshot round-trip.
- Done when: A numbers variance above the threshold raises an alert (kill-check: drop the numbers term and confirm the test goes red).; `numbersVariance` is present in the snapshot and survives a normalise round-trip.; The `numbers` comparison is unit-consistent: a workspace with one number for one month shows zero variance (positive control, and the test that proves the units are right).; A one-time purchase debit does not create a permanent variance.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2085](https://github.com/chester-hill-solutions/callcaster/issues/2085) Releasing a number can report failure after Twilio already released it and the row was deleted, and the stale sender-pool entry then blocks all outbound SMS
- Verdict: **Fix now** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- Release still deletes the provider number and local row before updating sender metadata. A metadata write failure returns a plain error after irreversible provider success.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Release still deletes the provider number and local row before updating sender metadata. A metadata write failure returns a plain error after irreversible provider success.
- Resolution: Make release state durable and retryable; reconcile stale sender references after provider success.
- Look in: `app/lib/database/workspace.server.ts:549`, `app/lib/database/workspace.server.ts:561`, `app/lib/database/workspace.server.ts:581`, `app/lib/database/workspace.server.ts:586-619`, `app/lib/number-rental-billing.server.ts:170-200 (suspend/release lifecycle and its workspace notification)`, `app/lib/twilio-sender-pool.server.ts`, `app/lib/messaging-onboarding/predicates.ts:458-471`, `app/lib/twilio-readiness.server.ts:66-88`
- Existing tests: test/db-workspace.server.test.ts; test/twilio-sender-pool.server.test.ts
- Missing tests: Need post-delete metadata-failure and retry tests that assert row absence, pool cleanup and explicit partial success.
- Done when: A failure in the bookkeeping step after the Twilio delete does **not** report a plain failure; it reports the incomplete state and the release is retryable.; A retry after a partial failure reconciles the sender pool and the onboarding state, and returns success.; After any partial failure, `sender_pool_in_sync` either passes or names the exact stale reference.; The successful path is unchanged, and `test/` coverage asserts the row is gone and the pool is clean.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2150](https://github.com/chester-hill-solutions/callcaster/issues/2150) An intent row recovered by the status webhook never gets num_segments, so it is billed as a single segment no matter how long the message was
- Verdict: **Fix now** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- Webhook recovery resolves only SID, and the following message update still omits NumSegments. Billing defaults a null segment count to one. The sweep also does not fill num_segments.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Webhook recovery resolves only SID, and the following message update still omits NumSegments. Billing defaults a null segment count to one. The sweep also does not fill num_segments.
- Resolution: Persist validated provider segment count before any terminal debit; handle absence through explicit provider fetch/reconciliation rather than blind one-segment default.
- Look in: `app/routes/api+/sms/status.action.server.ts:105`, `app/routes/api+/sms/status.action.server.ts:137`, `app/lib/worker/webhook-side-effects.server.ts:203`, `app/lib/twilio-open-sync.server.ts:404`, `app/routes/api+/sms/status.action.server.ts:97-110,150-164`, `app/lib/sms-send.server.ts:247-258`, `app/lib/campaign-sms-send.server.ts:97-110`, `app/lib/worker/handlers/cron.server.ts (`runSmsStatusSideEffects`)`, `app/lib/sms-segments.ts (`estimateMessageCredits`, `estimateSegments`)`
- Existing tests: test/sms-status-webhook.test.ts; test/webhook-side-effects.test.ts
- Missing tests: Recovered three-segment debit test and terminal missing-count alert; provider status callback field availability must be verified before assuming all callbacks contain NumSegments.
- Done when: A recovered three-segment intent is charged for three segments using validated provider metadata. The test fails if segment persistence/provider fallback is removed.; A send-time-resolved intent is unaffected (positive control).; A row reaching a terminal status with `num_segments IS NULL` and a non-empty body is logged and surfaced in the reconciliation.; The reconciliation variance for a multi-segment blast is zero.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2145](https://github.com/chester-hill-solutions/callcaster/issues/2145) The regulatory optInType submitted to Twilio is derived by substring-matching free-text prose
- Verdict: **Fix now** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- optInType still falls back to free-text workflow and substring matches VERBAL/PAPER/TEXT/QR. Explicit input is also substring-normalized rather than checked as an exact enum.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. optInType still falls back to free-text workflow and substring matches VERBAL/PAPER/TEXT/QR. Explicit input is also substring-normalized rather than checked as an exact enum.
- Resolution: Use an explicit validated exact enum from onboarding. Do not infer from prose. Decide and document handling of existing missing selections; blindly defaulting WEB_FORM can also make a false attestation. Audit already submitted registrations separately with authorized provider access.
- Look in: `app/lib/twilio-toll-free-provision.server.ts:90`, `app/lib/twilio-toll-free-provision.server.ts:96`, `app/lib/twilio-toll-free-provision.server.ts:218`, `app/lib/twilio-toll-free-provision.server.ts:66-68,232`, `app/lib/twilio-toll-free.server.ts`, `app/components/other-services/`, the toll-free onboarding step`, `app/lib/twilio-a2p-provision.server.ts (the sibling fields)`
- Missing tests: Negated verbal workflow, every exact valid enum passthrough, invalid explicit type, absent legacy field. No live provider registration audit was performed.
- Done when: Free-text workflow descriptions never determine optInType.; Each supported explicit enum value passes through exactly; invalid explicit values are refused.; Missing selections follow an explicit recorded product policy and cannot silently produce an unsupported consent statement.; Any allowed legacy fallback logs the workspace and reason.; Tests cover negated verbal prose, explicit enum values, invalid values and missing selections.; The provisioning sweep result is recorded; any live registration audit is tracked separately.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2136](https://github.com/chester-hill-solutions/callcaster/issues/2136) POST /api/media lacks the file-size limit enforced by its sibling route
- Verdict: **Fix now** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- POST /api/media has no file-size guard before buffering, while /api/message_media has a 10 MiB file policy. The reported three independent buffer copies are not supported by the implementation.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Multipart is materialized, then file.arrayBuffer is read. Buffer.from(ArrayBuffer) shares its allocation, and uploadObject.toBuffer returns an existing Buffer without a copy. Unbounded route file-size policy remains the defect.
- Resolution: Share the size/type validation and run it before file.arrayBuffer. Add a bounded request/multipart reader where needed because request.formData has already read the part. Sanitize generated storage keys and measure memory before asserting copy count.
- Look in: `app/routes/api+/media.action.server.ts:25`, `app/lib/object-storage.server.ts:136`, `app/routes/api+/message_media.action.server.ts:15`, `test/media.route.test.ts:50`, `app/routes/api+/media.action.server.ts:35`, `the sibling media route with the 10 MB cap`, `app/lib/object-storage.server.ts:180-220`, `app/components/file-assets/`, `app/lib/audio-upload.ts`, `app/lib/user-audio.server.ts`
- Existing tests: test/media.route.test.ts covers upload success, authentication refusal and upload/update failure.; test/message-media.route.test.ts covers the sibling route; neither establishes the required shared boundary for /api/media.
- Missing tests: Oversized upload must reject before application buffer allocation; boundary allowed test and a request streaming limit test are needed. Peak memory has not been measured.
- Done when: An oversized file is rejected before file.arrayBuffer or storage work runs.; A file at the shared cap succeeds on both routes.; The request/multipart reader has an explicit tested bound so rejection does not depend solely on already materialized formData.; campaignName cannot control the storage key's path structure.; Memory claims describe measured allocations; they do not require an unsupported one-copy guarantee.
- Tracker: Keep Fix now for absent upload limits. Correct the triple-copy/OOM claims; no production memory reproduction was performed.

### [#2099](https://github.com/chester-hill-solutions/callcaster/issues/2099) Production rate-limit buckets have no retention cleanup and use the leftmost forwarded address
- Verdict: **Fix now** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- Production rate buckets still have no deletion path and use the first X-Forwarded-For entry as the key. Existing SQL index is present; trusted proxy behavior is not established by this source audit.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. No source path prunes production rate buckets. Rate keys read the leftmost X-Forwarded-For value; whether an external client can control that position depends on deployment ingress and remains unverified here.
- Resolution: Add an indexed retention prune to daily maintenance and log row count. Validate the Railway ingress header contract and derive client identity from a trusted source; the reset_at index already exists.
- Look in: `app/lib/platform-rate-limit.server.ts:40`, `client/migrations/20260714120000_rate_limit_bucket.sql:8`, `app/lib/worker/handlers/cron.server.ts:214`, `app/lib/platform-rate-limit.server.ts:39-43`, `app/lib/platform-auth-rate-limit.server.ts:22-33,56-73`, `client/migrations/20260714120000_rate_limit_bucket.sql:35`, `app/lib/worker/handlers/cron.server.ts:190-225`, `app/lib/platform-rate-limit-db.server.ts`, `app/lib/platform-rate-limit-window.ts`
- Existing tests: test/platform-api.test.ts covers rate limiting using a supplied X-Forwarded-For header.; test/auth-catch-all-rate-limit.route.test.ts covers auth throttling; neither test proves the production proxy trust contract or database retention.
- Missing tests: No retention boundary test; existing tests set client forwarded headers. Deployment proxy overwrite/append behavior needs verification before claiming externally spoofable keys.
- Done when: After the daily job, `rate_limit_bucket` contains no row with `reset_at` older than the retention window.; The prune is covered by a test with rows on both sides of the boundary (kill-check: make the prune a no-op and confirm the test goes red).; The job's row count is logged.; The credential rate limit is not bypassable by varying `X-Forwarded-For` (the related issue's acceptance criteria).
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2149](https://github.com/chester-hill-solutions/callcaster/issues/2149) An SMS campaign's outreach disposition is pinned to completed at send time and can never be updated by the delivery status
- Verdict: **Fix now** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-25
- SMS create stamps completed before delivery. The transition guard refuses completed → delivered/failed/undelivered. Direct checks confirm the lock.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. SMS create stamps completed before delivery. The transition guard refuses completed → delivered/failed/undelivered. Direct checks confirm the lock.
- Resolution: Leave create-time disposition nonterminal and let delivery callbacks own the terminal result. Define recovery for messages with no callback.
- Look in: `app/lib/campaign-sms-send.server.ts:238`, `app/lib/outreach-disposition.ts:25`, `app/lib/worker/webhook-side-effects.server.ts:227`, `app/lib/campaign-sms-send.server.ts (the `disposition: "completed"` on the create response)`, `app/lib/outreach-disposition.ts (`canTransitionOutreachDisposition`, `shouldUpdateOutreachDisposition`)`, `app/lib/worker/handlers/cron.server.ts (`runSmsStatusSideEffects`)`, `app/lib/campaign-queue-search.server.ts:171-200`, `app/routes/api+/sms/status.action.server.ts`
- Existing tests: test/campaign-sms-send.server.test.ts; test/sms-status-settled.test.ts
- Missing tests: Create → failed/undelivered/delivered must update Results and queue filters; cover duplicate/out-of-order callbacks.
- Done when: A message the carrier reports `failed` appears under `failed` in the campaign queue filter (kill-check).; `undelivered` and `delivered` likewise.; A message that never receives a callback still reaches a terminal disposition (positive control).; The call path is unchanged.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2166](https://github.com/chester-hill-solutions/callcaster/issues/2166) Call audio depends on a best-effort Twilio copy — recover the ones that failed, then remove the Twilio playback fallback
- Verdict: **Fix now** · Size: M-L · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Failure propagation and the repair sweep landed. Raw Twilio playback fallback and timestamped voicemail keys remain; recording_url retention still needs a decision.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Failure propagation and the repair sweep landed. Raw Twilio playback fallback and timestamped voicemail keys remain; recording_url retention still needs a decision.
- Root cause: The original design treated the copy as best-effort and swallowed the failure, which made an unrecoverable data loss look like success. A second, independent problem: recording_sid was written AFTER the copy, so a failed copy left no searchable row — the failure was unrepresentable in the database. #2169 fixed the ordering, which is what made the repair sweep's find query possible.
- Resolution: Failure propagation and repair sweep are complete. Remaining concrete fixes: replace the raw Twilio playback link with a clear storage-unavailable state; make voicemail keys stable per recording identity. The S3 upload helper overwrites by default unless upsert:false, so the defect is the timestamp key, not a required upsert:true option. Decide recording_url retention separately.
- Look in: `app/components/calls/CallLogTable.tsx:234`, `app/routes/api+/email-vm.action.server.ts:186`, `app/lib/object-storage.server.ts:225`, `app/lib/call-recording-storage.server.ts (persistCallRecordingToStorage — throws on every failure mode)`, `app/lib/worker/webhook-side-effects.server.ts (runRecordingSideEffects — writes recording identity before the copy)`, `app/lib/call-recording-repair.server.ts (repair sweep, PR #2173)`, `app/components/calls/CallLogTable.tsx:234 (Twilio-URL playback fallback — step 3)`, `app/lib/call-log.server.ts:49-52 (CallLogRow.recordingUrl is the raw Twilio URL, documented as 'a fallback that leaves the app')`, `app/routes/api+/email-vm.action.server.ts:185-197 (voicemail object key and upload — step 4)`
- Existing tests: test/call-recording-storage.server.test.ts — inverted to assert the throwing behaviour; test/webhook-side-effects.test.ts — asserts identity is written before the copy; test/call-recording-repair.server.test.ts — 13 tests, including a schema-contract test proving the swept payload is accepted by the real job-params schema
- Missing tests: Two same-recording callbacks yield one object; missing stored audio has a clear state and no raw Twilio link.
- Done when: Failure propagation and the repair sweep remain covered by their existing regression tests.; Missing stored playback has a clear unavailable state and no raw Twilio recording link.; Repeated deliveries for one voicemail recording use one deterministic object key and the documented overwrite behavior.; An explicit recording_url retention decision is recorded.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point. Related PR evidence: #2169, #2173, #2175, #2177. A PR reference alone does not prove deployed behavior.

### [#2032](https://github.com/chester-hill-solutions/callcaster/issues/2032) Invite acceptance shows a persistent, replayable inline banner instead of a one-time success toast
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Invite acceptance still redirects to a replayable query-param success banner. PR #2037 explicitly left this separate cookie/session-flash change open.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Invite acceptance still redirects to a replayable query-param success banner. PR #2037 explicitly left this separate cookie/session-flash change open.
- Root cause: One-time state is being carried in a shareable URL because there is no server-owned flash mechanism to carry it instead. AGENTS.md names toast() from sonner as the single feedback pattern and a single root Toaster already exists (app/root.tsx:123), so the app has the right tool and the wrong transport.
- Resolution: Implement the allow-listed signed flash cookie, preserve all Better Auth Set-Cookie headers, read/clear it in the loader on success and failure, and consume it once with toast.success.
- Look in: `app/routes/accept-invite.action.server.ts:62`, `app/routes/workspaces+/index.tsx:272`, `app/routes/workspaces+/index.loader.server.ts:1`, `app/routes/accept-invite.action.server.ts:58 and :183 (the two redirects to /workspaces?invite=accepted)`, `app/routes/workspaces+/index.tsx:272-280 (the QueryParamBanner invite configuration)`, `app/components/shared/QueryParamBanner.tsx:16-57 (unchanged by this issue; note the Alert inside it)`, `app/routes/workspaces+/index.loader.server.ts:32-72 (where the flash is read and cleared)`, `app/lib/flash-telemetry.client.ts (beacons role=alert surfaces, so the success banner is logged as an error flash today)`, `app/root.tsx:123 (the single root Toaster, so no infrastructure change is needed)`
- Existing tests: test/accept-invite.route.test.ts:231 (asserts /workspaces?invite=accepted and must be updated)
- Missing tests: Both redeem paths, mixed Set-Cookie preservation, invalid/expired payload clearing, loader-failure clearing, and exactly-once UI toast tests are missing.
- Done when: Invite acceptance shows a one-time success toast, not an inline banner; The redirect URL no longer carries invite=accepted, and refreshing it does not reproduce the message; The Better Auth session cookie survives the redirect in both redemption paths; An unknown, malformed or expired flash payload produces no client-visible output and is still cleared; A loader revalidation does not fire the toast twice; Invite acceptance uses the one-time success toast and does not produce a local error-surface warning. Workspace-scoped Alert severity classification remains separate work in #2062.; No support, analytics or e2e flow still depends on ?invite=accepted (checked before removal)
- Tracker: Fix now. PR #2037 did not implement #2032; it names the issue as excluded work. Related PR evidence: #2037. A PR reference alone does not prove deployed behavior.

### [#2288](https://github.com/chester-hill-solutions/callcaster/issues/2288) Move audience-upload history loading to route data
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The current audience-history mount effect fetches server data. The syntax guard now exposes it as CANDIDATE-REMOVE; route data is the adopted policy.
- Current behavior: Source audit at dev@24c4d810. useAudienceUploads calls fetchAudienceUploads on mount and workspace/audience changes, then maintains live history via workspace events. The old guard skipped this effect because its preceding comment ended in a dot. The guard fix only inventories the existing behavior; the runtime route-data change remains open under #2288.
- Root cause: Initial server history is owned by a client effect instead of the existing audience route data contract.
- Resolution: Load initial upload history through the authenticated audience page loader, pass route data into the history UI/hook and retain React Router retry/revalidation plus current-audience event updates. Remove the fetch-on-mount effect and its candidate inventory row.
- Look in: `app/hooks/audience/useAudienceUploads.ts`, `app/components/audience/AudienceUploadHistory.tsx`, `app/routes/workspaces+/$id/audiences/$audience_id.loader.server.ts`, `app/routes/workspaces+/$id/audiences/$audience_id.route.tsx`, `app/routes/api+/workspaces+/$workspaceId/audiences/$audienceId/uploads.loader.server.ts`
- Existing tests: test/ui/audience-upload-history.test.tsx
- Missing tests: Real route initial-history and foreign-audience denial cases.; Navigation/late-result isolation, retry and retained insert/update/delete event controls.
- Done when: Initial history is route data; the mount fetch effect is removed.; Workspace/audience changes cannot leak old history or accept late results for another audience.; Loading, empty, error retry and success behavior remain available.; Current-audience event updates and route tenant authorization are retained.; Tests fail if the required loader, isolation, retry or event behavior is removed.; Remove candidate inventory debt and pass full local/remote gates before merge.
- Tracker: Adopted route-data policy gives an exact implementation path. This independent runtime task does not block #2104.

### [#2215](https://github.com/chester-hill-solutions/callcaster/issues/2215) Add the five workspace foreign keys missing from the active bootstrap lineage
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Five tenant tables lack a workspace FK in the active fresh-bootstrap SQL: outreach_attempt, workspace_events, workspace_member, workspace_audit_event and workspace_audio. Six originally listed tables are already constrained in drizzle/0006_app_schema_tail.sql.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The fresh bootstrap adds campaign_queue/inbound/agent workspace constraints. No live database was inspected, so actual deployed lineage drift remains unverified.
- Root cause: Original audit checked only 0000_baseline.sql and missed 0006_app_schema_tail.sql plus the campaign_queue tenancy migration. Five constraint gaps remain. Three have text tenancy columns requiring a database conversion, not only a Drizzle model edit.
- Resolution: First inventory supported DB lineages. Add the two missing UUID constraints for outreach_attempt and workspace_events. Convert the three text tenancy columns separately with data validation. Add a real catalog/cascade guard.
- Look in: `scripts/e2e/bootstrap-compose-db.mjs:33`, `drizzle/0006_app_schema_tail.sql:84`, `drizzle/0006_app_schema_tail.sql:133`, `drizzle/0006_app_schema_tail.sql:283`, `drizzle/0002_workspace_events.sql:4`, `app/db/schema.ts:127`, `client/migrations/20260705000200_add_campaign_queue_workspace.sql:43`, `drizzle/0000_baseline.sql:5320 (workspace.id is uuid in the database)`, `app/db/schema.ts:102 (workspace.id is text() in the model — the drift)`, `app/db/schema.ts:126,453,472 (the three text tenancy columns: workspace_member, workspace_audit_event, workspace_audio)`, `app/db/schema.ts:51,79 (schema-campaign: campaign_queue.workspace is uuid)`, `app/db/workspace-scoped-tables.ts:41-94 (the 27 registered tables)`, `client/migrations/20260713180000_chs_workspace_membership.sql:99-106 (workspace_member, role_id FK but no workspace_id FK)`, `client/migrations/20260713120000_workspace_audit_event.sql:4 (workspace_audit_event.workspace_id is text)`, `client/migrations/20260715120000_workspace_audio_metadata.sql:17 (workspace_audio.workspace_id is text)`, `client/migrations/20260731140000_create_workspace_events.sql:24 (workspace_events.workspace_id is uuid — unconstrained)`
- Missing tests: Need real-Postgres coverage proving registered FK presence and deletes, plus referential-integrity measurement before constraining deployed data.
- Done when: Inspect the supported database lineages and record the actual missing workspace constraints.; Add workspace(id) foreign keys with ON DELETE CASCADE for outreach_attempt and workspace_events after checking orphan rows.; Convert and constrain workspace_member.workspace_id, workspace_audit_event.workspace_id and workspace_audio.workspace_id in separate validated changes, or track explicit blocking tasks.; A real-Postgres test checks every registered tenancy table for the intended workspace FK and proves cascade behavior.; A model/database type check covers workspace.id and tenancy columns.
- Tracker: Keep Fix now with corrected five-table scope. Do not re-add six existing constraints or assume model-only uuid correction makes text foreign keys possible.

### [#2170](https://github.com/chester-hill-solutions/callcaster/issues/2170) Stale subaccount credentials block the product's own number-release path — a customer cannot release their own number
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-10-02
- A 2026-09-28 run found 18 rejected workspace credentials. Current code still selects API-key auth without rejection-time fallback, and number release uses the same client. Current credential liveness was not measured in this audit.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The 18 stale-credential failures are historical incident evidence. Current client selection has no fallback after an API-key rejection; release still uses that client.
- Root cause: Stored credentials were rejected in the incident; the rotation cause is not proved. Client construction prefers a key, but does not automatically retry a rejected key with the Auth Token.
- Resolution: Detect and report provider credential rejection. Select a reviewed recovery path using the existing re-auth capability or platform-owned release path. Coordinate release ordering with #2085; verify current credential liveness separately.
- Look in: `app/lib/database/workspace.server.ts:461`, `app/lib/database/workspace.server.ts:497`, `app/lib/database/workspace-twilio-subaccount.server.ts (createSubaccount/createKeys; the place credentials are minted and would be rotated)`, `app/lib/phone-numbers.server.ts (removeWorkspacePhoneNumber — authenticates with the workspace credential)`, `master.api.v2010.accounts(subAccountSid) — the working path for platform-operated calls`
- Existing tests: none that exercise a stale or rejected subaccount credential
- Missing tests: Inject provider auth rejection and prove recovery or a named degraded state; verify current liveness separately.
- Done when: Rejected workspace credentials produce a named degraded state or a tested recovery path.; A customer can release their own platform-owned number under the selected credential-recovery contract.; Valid credentials retain supported operations without unnecessary re-authentication.; The current live credential state is measured separately; the historical 18 failures are not reported as a fresh result.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2151](https://github.com/chester-hill-solutions/callcaster/issues/2151) Cache interactive SMS readiness checks and measure Twilio read cost
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Campaign per-contact readiness overhead is fixed by PR #2228 (#2081). Chat remains per send without a TTL.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. One readiness evaluation per campaign dispatch; chat still verifies the live sender pool per message.
- Resolution: Add a short workspace-keyed TTL with sender/config invalidation for interactive sends and record measured request cost. Do not move the campaign gate again.
- Look in: `app/lib/campaign-sms-dispatch.server.ts:154`, `app/lib/campaign-sms-pre-dispatch-gate.server.ts:119`, `app/lib/chat-sms.server.ts:86`, `app/lib/twilio-readiness.server.ts:46`, `test/campaign-sms-workspace-readiness.test.ts:173`, `app/lib/campaign-sms-send.server.ts:75-82`, `app/lib/twilio-readiness.server.ts:66-88`, `app/lib/messaging-onboarding/predicates.ts:458-471 (`sender_pool_in_sync`)`, `app/lib/campaign-sms-dispatch.server.ts (the tick)`, `app/lib/campaign-sms-guards` / the chat send path`
- Existing tests: test/campaign-sms-workspace-readiness.test.ts covers whole-dispatch readiness deferral and no per-row attempt burn.; test/campaign-sms-send.server.test.ts
- Missing tests: Chat burst/cache-expiry/invalidation test and representative before/after request counts.
- Done when: A dispatch tick of N messages performs **one** readiness evaluation, not N (kill-check: revert to the per-message call and confirm the test goes red).; A chat burst re-lists the sender pool at most once per TTL window.; A non-ready campaign dispatch defers before row selection and does not spend queue attempts; this behavior is already implemented by PR #2228.; The before/after Twilio request count for a representative tick is recorded in the issue.; The chat readiness cache expires and invalidates after relevant sender/configuration changes.
- Tracker: Partial fix. Keep Fix now for the remaining chat/cache and measurement scope. Related PR evidence: #2228. A PR reference alone does not prove deployed behavior.

### [#2144](https://github.com/chester-hill-solutions/callcaster/issues/2144) Q43 regulatory address requirements are fetched, resolved and unit-tested, then never applied — the purchase path returns a bare 500
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Number purchase still has explicit deferred-Q43 code and no regulatory addressSid. Its service-address precheck and validated emergencyAddressSid do not resolve local/foreign regulatory requirements.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Purchase requires a service address and may pass validated emergencyAddressSid. It still explicitly defers regulatory addressRequirements/addressSid, and provider create rejection maps to 500.
- Resolution: Look up inventory requirement, select compliant validated regulatory address, explain absence before purchase and pass addressSid.
- Look in: `app/lib/platform-workspace-numbers.server.ts:171`, `app/lib/platform-workspace-numbers.server.ts:187`, `app/lib/platform-workspace-numbers.server.ts:152`, `app/lib/platform-workspace-numbers.server.ts:344`, `app/lib/platform-workspace-numbers.server.ts:175-192,339-346`, `app/lib/number-address-requirements.ts (`resolveAddressForRequirement`, `addressRequirementUserMessage`)`, `app/lib/numbers-search.server.ts`, `app/lib/numbers-search.types.ts`, `app/components/phone-numbers/ (the search row and purchase fetcher)`, `isNanpTollFreeNumber`
- Missing tests: Purchase-boundary missing/compliant/foreign address tests and search badge. Twilio rejection and live address data were not reproduced.
- Done when: A number with `addressRequirements: "local"` and no validated address returns 400 with the address-specific message, and no Twilio number is created (kill-check: remove the resolve call and confirm the test goes red).; With a compliant address, the purchase succeeds and passes `addressSid`.; A `foreign` requirement is satisfied by a foreign address.; The badge is visible on the search row.; No purchase path returns 500 for an address requirement.
- Tracker: Keep Fix now. E911 address handling is not the Q43 regulatory address requirement implementation; current source does not resolve the latter.

### [#2138](https://github.com/chester-hill-solutions/callcaster/issues/2138) Non-member sudo users cannot use the Access tab, while separate sudo membership writers omit safety guards
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Non-member sudo still cannot use Access tab. Tab mutations call member helpers that now enforce protection; the separate sudo membership API calls admin writers that omit sole-owner/MFA guards.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Access tab remains membership-gated and its update/delete adapters call member helpers with protection. A separate sudo API bypasses those helpers and uses unguarded platform-admin membership writers.
- Root cause: Platform role and workspace role are mixed in the Access tab; parallel sudo writer APIs bypass the product membership safety policy.
- Resolution: Derive Access tab authorization from verified sudo context. Use shared protected admin mutation services on both tab and sudo JSON API; enforce sole-owner and MFA policy there and define recovery for existing ownerless workspaces.
- Look in: `app/lib/platform-admin.server.ts:375`, `app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts:31`, `app/lib/platform-members.server.ts:416`, `app/lib/platform-admin.server.ts:277`, `app/routes/api+/admin+/users+/$userId/workspaces.action.server.ts:103`, `app/routes/admin+/workspaces/$workspaceId/invite.loader.server.ts`, `app/routes/admin+/workspaces/$workspaceId/invite.action.server.ts`, `app/lib/platform-members.server.ts:220-235,440-475`, `app/lib/two-factor.server.ts:181-204`, `app/routes/workspaces+/$id/settings.action.server.ts:66-75`, `app/routes/workspaces+/$id/settings.route.tsx:84-86,235`
- Missing tests: Need non-member sudo access, sole-owner refuse, target MFA refuse on sudo API/tab, permitted admin change and member-path controls.
- Done when: A verified sudo user can open the Access tab without workspace membership.; A user without sudo access cannot open the admin route, regardless of workspace role.; Access-tab and sudo API mutations refuse sole-owner removal or demotion.; Access-tab and sudo API mutations refuse owner/admin grants to a target without required two-factor enrollment.; Permitted sudo mutations and existing member-path protections continue to work.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2127](https://github.com/chester-hill-solutions/callcaster/issues/2127) The contact page's "Call lists" checkboxes and the whole "Other Data" editor are discarded, yet Save reports success
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Both contact editor defects remain. Checkbox changes and Other Data callbacks only mark changes; the imperative Save contract and action transport only text fields.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The handlers still discard both values. Save reads only fieldValues and the action handles text fields, so this needs UI contract and server persistence work.
- Resolution: Lift both edits into the Save contract and validate workspace-scoped membership/other_data writes, or remove these controls. Cover save and reload, reset, and existing text fields as a positive control.
- Look in: `app/components/contact/ContactDetails.tsx:137`, `app/components/contact/ContactDetails.tsx:232`, `app/components/contact/ContactDetails.tsx:94`, `app/routes/workspaces+/$id/contacts/$contactId.action.server.ts:59`, `app/components/contact/ContactDetails.tsx:137-148,232-240`, `the `OtherDataFields` component it passes the setter to`, `the contact update action and `ContactUpdateData`, `app/lib/contacts/`, `app/routes/workspaces+/$id/contacts*`
- Existing tests: test/ui/contact-details-form-values.test.tsx
- Missing tests: Current contact-details-form-values tests verify text capture and Other Data accessible names only, not changed data persistence.
- Done when: Toggling a call-list checkbox persists the membership and it survives a reload (kill-check).; Editing an "Other Data" field persists and survives a reload (kill-check).; If the controls are removed instead, they are absent rather than inert.; The unfinished-wiring comment is gone.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2067](https://github.com/chester-hill-solutions/callcaster/issues/2067) check:effects never verifies @effect-deps against the real dependency array
- Verdict: **Fix now** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- The effects guard checks annotation presence only. It never parses the actual dependency array or compares it with @effect-deps.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The effects guard checks annotation presence only. It never parses the actual dependency array or compares it with @effect-deps.
- Root cause: The guard checks for the presence of an annotation, not its truth. An annotation nobody verifies is a comment, and a comment about behaviour is worse than no comment because it is trusted.
- Resolution: Implement dependency comparison with a documented escape rule; coordinate scope with #2104 scanner repair.
- Look in: `scripts/check-effects.mjs:101`, `scripts/lib/effects-lib.mjs:18`, `scripts/check-effects.mjs:124,145`, `scripts/effects-baseline.json`, `app/components/ui/datetime.tsx (the live passing violation, and also the un-gated React.useEffect call)`
- Existing tests: test/effects-compliance.test.ts covers annotation compliance rules; dependency-array/scanner fixtures remain missing.
- Missing tests: Fixture tests must fail mismatched annotations and accept matching arrays plus a justified escape.
- Done when: A disagreeing annotation fails `check:effects`; The comparison rule is written down, with its escape hatch; The guard has fixture tests for both the fail and the pass case; A `React.useEffect(` call is not silently skipped
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2047](https://github.com/chester-hill-solutions/callcaster/issues/2047) Warn when a message campaign has no end time on its send window
- Verdict: **Fix now** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- No warning is emitted for a null SMS send window. Malformed interval ends are removed by parsing. The readiness check still explicitly accepts unrestricted sending.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. No warning is emitted for a null SMS send window. Malformed interval ends are removed by parsing. The readiness check still explicitly accepts unrestricted sending.
- Root cause: The readiness gate deliberately treats null send windows as a non-issue, and SMS dispatch never consults `campaign.schedule` (voice field). Interval end-times that are missing/malformed are silently dropped by parseSendWindow.
- Resolution: Add a warning for unrestricted SMS and preserve raw malformed interval validation before normalization.
- Look in: `app/lib/campaign-readiness.ts:479`, `app/lib/campaign-send-window.ts:141`, `app/lib/campaign-readiness.ts`, `app/lib/campaign-dispatch-policy.ts`, `app/lib/campaign-send-window.ts`, `app/components/campaign/settings/basic/CampaignBasicInfo.Schedule.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`
- Existing tests: test/campaign-readiness.test.ts; test/campaign-send-window.test.ts
- Missing tests: Tests must cover null window, voice-only schedule, malformed end, and warning severity without a launch block.
- Done when: No sms_send_window → visible unrestricted-send warning at launch; Voice schedule with null sms_send_window → same warning; Missing/malformed interval end flagged, not dropped; Warning only, no new blocker for legitimately 24/7 campaigns
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2320](https://github.com/chester-hill-solutions/callcaster/issues/2320) Download the current survey CSV on the first export click
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: @wra-sol · Updated: 2026-10-04
- The first export click downloads nothing; the next click downloads the previous CSV request.
- Current behavior: Actual page/fetcher reproduction at 5707c2f5, with the export handler unchanged from dev@71f86986: first-click and fresh-second-click cases fail; one control confirms the second click downloads the first CSV revision. No skips. No deployed respondent data read or changed.
- Root cause: The async export handler reads the captured render value of exportFetcher.data after load(), which does not replace that value.
- Resolution: Use the existing protected CSV attachment resource through the shared shad-cc Button link pattern. Remove the stale fetcher/blob copy; keep styling, action position, authorization, server filename, CSV protection and no-store policy.
- Look in: `app/routes/workspaces+/$id/surveys/$surveyId/responses.route.tsx`, `app/routes/workspaces+/$id/surveys/$surveyId/responses/export.loader.server.ts`, `app/lib/csv.ts:csvResponse`, `app/components/campaign/home/CampaignHomeScreen/CampaignExportButton.tsx`
- Existing tests: Isolated actual-page reproduction: two regression failures and one positive control.; test/integration-db/survey-response-columns.test.ts retains workspace-isolation and CSV protection controls.
- Missing tests: Actual-page protected native action coverage; real-browser first and repeated download with changed CSV data.; Deployed protected-download acceptance after source merge.
- Done when: The first click downloads current survey data; a later click requests current data again.; Keep the shared Button geometry and action position.; Keep workspace authorization, attachment filename, CSV formula protection and no-store policy.; Real browser proves two downloads and updated saved answers; deployed acceptance remains explicit.
- Tracker: Native Bug #2320 assigned to wra-sol. Implement as an independent atomic PR from clean dev; do not bundle with #2317 or historical assessment #2292.

### [#2308](https://github.com/chester-hill-solutions/callcaster/issues/2308) Show agent startup failure once
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The startup-failure branch passes the same token/runtime error to StatusBar and renders it again in an outer Alert. This replaces unavailable content. Keep one failure-region message, available recovery actions and disabled unavailable controls. Do not convert live call controls into brief toasts or change device/call state.
- Current behavior: Source-confirmed at dev@5ad088c4, 2026-10-03. The startup-failure branch passes the same token/runtime error to StatusBar and renders it again in an outer Alert. This replaces unavailable content. Keep one failure-region message, available recovery actions and disabled unavailable controls. Do not convert live call controls into brief toasts or change device/call state.
- Root cause: The same action failure reaches two presentation paths.
- Resolution: Keep one result for the actual operation. Preserve field association, entered values, retry, pending locks, permissions and recovery. Use the shared feedback rule in docs/design-system.md.
- Look in: `app/components/agent/AgentDesktop.tsx`, `docs/feedback-inventory.md`
- Missing tests: Actual component and feedback-hook regression: original defect fails, allowed validation/retry control passes, no replay. Real-browser page rectangles and scroll remain stable.
- Done when: One visible result for one failed action.; Preserve genuine field validation, permissions, hard gates, entered values and retry.; No page or scroll movement on appearance, update or removal.
- Tracker: Fix now as one atomic PR. Parent #2300; full local CI before every push, then merge and clean up only on green.

### [#2306](https://github.com/chester-hill-solutions/callcaster/issues/2306) Associate workspace settings errors with the correct action
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Every settings action failure is toasted and assigned to the add-member Email field. Failures from other settings operations are not email validation. Associate only actual email validation with that field; render other action failures once through the root toast. Retain permission checks and action-specific recovery.
- Current behavior: Source-confirmed at dev@5ad088c4, 2026-10-03. Every settings action failure is toasted and assigned to the add-member Email field. Failures from other settings operations are not email validation. Associate only actual email validation with that field; render other action failures once through the root toast. Retain permission checks and action-specific recovery.
- Root cause: The route assigns failures from unrelated settings actions to the Email field.
- Resolution: Keep one result for the actual operation. Preserve field association, entered values, retry, pending locks, permissions and recovery. Use the shared feedback rule in docs/design-system.md.
- Look in: `app/routes/workspaces+/$id/settings.route.tsx`, `docs/feedback-inventory.md`
- Missing tests: Actual component and feedback-hook regression: original defect fails, allowed validation/retry control passes, no replay. Real-browser page rectangles and scroll remain stable.
- Done when: One visible result for one failed action.; Preserve genuine field validation, permissions, hard gates, entered values and retry.; No page or scroll movement on appearance, update or removal.
- Tracker: Fix now as one atomic PR. Parent #2300; full local CI before every push, then merge and clean up only on green.

### [#2211](https://github.com/chester-hill-solutions/callcaster/issues/2211) Run the independent real-Postgres CI tier for application changes covered by its tests
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Independent real-Postgres CI now exists and runs the entire tier. Its trigger filters exclude app/server and app/lib changes covered by that tier; ci:local still omits it.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Independent Postgres job and local run documentation are present. Application-only changes can bypass that job because of path filters. E2E names the tier explicitly.
- Root cause: The independent workflow runs the full integration-db tier, but its path filters omit application modules and most integration test files; ci:local also omits the tier.
- Resolution: Extend existing triggers and verify required-check behavior. Remaining runtime acceptance includes measured E2E failure rate.
- Look in: `.github/workflows/schema-default-drift.yml:31`, `.github/workflows/schema-default-drift.yml:117`, `scripts/e2e/run-compose-e2e.mjs:105`, `docs/schema-default-drift.md:124`, `.github/workflows/schema-default-drift.yml`, `scripts/e2e/run-compose-e2e.mjs`, `package.json`, `vitest.integration-db.config.ts`
- Existing tests: test/integration-db/dequeue-contact-assigned.test.ts — the real dequeue_contact function, dial path only; test/integration-db/split-campaign-atomic.test.ts — six real-Postgres tests added by #2209
- Missing tests: Need application-only PR trigger proof and repository required-check settings; neither established in this source audit.
- Done when: An application-only change covered by integration-db starts the independent Postgres job, and an integration assertion failure makes that job fail. Keep the existing E2E invocation explicitly documented.; The tier is runnable locally by a documented command, matching what CI runs.; The e2e log names the tier it is running before any test output.; The measured e2e failure rate is recorded somewhere durable.
- Tracker: Partial fix remains. Do not repeat the independent CI job, local command or E2E tier label.

### [#2155](https://github.com/chester-hill-solutions/callcaster/issues/2155) Double-clicking Record leaks a microphone stream and corrupts the take
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Recorder start remains reentrant during microphone permission acquisition. Concurrent starts overwrite stream/recorder refs and share a chunk buffer; there is no starting phase or phase status region.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Recorder start remains reentrant during microphone permission acquisition. Concurrent starts overwrite stream/recorder refs and share a chunk buffer; there is no starting phase or phase status region.
- Resolution: Latch synchronously before permission, disable starting controls, isolate chunks per recorder, and stop late streams after cancel/unmount. Add a status announcement for all phase changes.
- Look in: `app/components/file-assets/AudioRecorder.tsx:31`, `app/components/file-assets/AudioRecorder.tsx:259`, `app/components/file-assets/AudioRecorder.tsx:335`, `app/components/file-assets/AudioRecorder.tsx:459`, `app/components/file-assets/AudioRecorder.tsx`
- Missing tests: No AudioRecorder-specific test was found. Add deferred getUserMedia double activation, all track release, isolated take, permission failure, cancel/unmount while pending, and phase announcement assertions.
- Done when: A double-click on Record starts exactly one recording (kill-check: remove the latch and confirm the test goes red).; Only one `getUserMedia` stream is open at any time, and it is released on stop.; The recorded take contains one recording, not two.; The Record button is disabled while starting.; The phase is announced to assistive technology on start, pause, resume and stop.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2153](https://github.com/chester-hill-solutions/callcaster/issues/2153) DELETE /api/queues reset wipes dequeued_at and dequeued_reason for every row, destroying the dequeue audit trail
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Queue reset still applies the queued transition to every campaign row. That transition clears dequeue timestamp/reason and current claim/assignment, with no history or opt-out filter.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Queue reset still applies the queued transition to every campaign row. That transition clears dequeue timestamp/reason and current claim/assignment, with no history or opt-out filter.
- Resolution: Scope ordinary reset to eligible in-flight rows; design explicit audited full requeue separately.
- Look in: `app/routes/api+/queues.action.server.ts:111`, `app/lib/campaign-queue-updates.server.ts:81`, `app/lib/queue-status.ts:306`, `app/routes/api+/queues.action.server.ts (the reset branch)`, `app/lib/campaign-queue-db.server.ts (`requeueAllCampaignQueueForCampaign`)`, `app/components/call/CallScreen.Layout.tsx:167-172`, `scripts/check-queue-rpc-contract.mjs`
- Existing tests: test/queues.route.test.ts; test/queue-status.test.ts
- Missing tests: Completed/dequeued history preservation, untouched-row control, opted-out never-rearmed and deliberate requeue audit tests.
- Done when: A reset does not clear `dequeued_at` or `dequeued_reason` on a row that was already dequeued (kill-check: clear all rows and confirm the test goes red).; Un-attempted rows return to `queued` (positive control).; An opted-out contact is never re-armed by a reset.; If deliberate full requeue is retained or added, it is a separate explicit operation with audit history. Ordinary reset does not require a new full-requeue feature.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2152](https://github.com/chester-hill-solutions/callcaster/issues/2152) POST /api/campaign_queue honours a client-supplied startOrder, skipping the atomic reservation
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Public enqueue skips server order reservation. It defaults startOrder to zero even if omitted. The duplicate-send assertion is overstated: bootstrap enforces unique campaign/contact and dispatch has independent dedupe.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Public POST defaults startOrder to zero, so reservation is skipped even when clients omit the field.
- Root cause: A client-controlled/default ordering option bypasses atomic order allocation. It does not itself remove the unique campaign/contact constraint or normalized-number dispatch dedupe.
- Resolution: Remove public startOrder/default and always reserve server-side; test ordering concurrency separately from dedupe.
- Look in: `app/routes/api+/campaign_queue.action.server.ts:40`, `app/routes/api+/campaign_queue.action.server.ts:69`, `app/lib/queue.server.ts:51`, `drizzle/0006_app_schema_tail.sql:95`, `client/migrations/20260716120000_fix_handle_campaign_queue_entry_queue_state.sql:49`, `app/routes/api+/campaign_queue.action.server.ts`, `app/lib/campaign-queue-db.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts:156-161`, `scripts/check-queue-rpc-contract.mjs`, `client/migrations/ (the reservation RPC)`
- Existing tests: test/campaign-queue.route.test.ts; test/queue.server.test.ts; test/queue-rpc-contract.test.ts
- Missing tests: Route missing/supplied order tests and concurrent reservation test. Same-contact duplicate rows are prevented by SQL; normalized-number distinct-contact behavior needs its own claim evidence.
- Done when: Omitted and supplied startOrder both use server-reserved order ranges; client ordering is rejected or ignored.; Two concurrent public enqueues reserve disjoint order ranges.; The existing UNIQUE(campaign_id,contact_id) invariant remains effective; do not attribute it to order reservation.; check-queue-rpc-contract rejects public route bypass of server order allocation, including forwarded startOrder options, with a failing fixture.; Record the API sweep for other client-writable queue lifecycle fields.
- Tracker: Fix now for server-owned ordering. Correct the unsupported claim that startOrder alone defeats dedupe.

### [#2142](https://github.com/chester-hill-solutions/callcaster/issues/2142) rental_warned_cycle is never cleared, so a second non-payment episode gets no warning and the ladder suspends a customer who was never warned
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Successful rental charges clear suspension but never clear rental_warned_cycle. A later one-cycle lapse can skip its warning.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Successful rental charges clear suspension but never clear rental_warned_cycle. A later one-cycle lapse can skip its warning.
- Resolution: Reset rental_warned_cycle after the unpaid streak is cleared. Do not put the reset only inside if(number.suspended_at): a warned-but-not-suspended number must reset too. Preserve paid-cycle idempotency and technical-failure handling.
- Look in: `app/lib/number-rental-billing.server.ts:230`, `app/lib/number-rental-billing.server.ts:502`, `app/lib/number-rental-billing.server.ts:230,449-461`, `app/lib/number-rental-lifecycle.ts:1-10`, `app/lib/database/workspace.server.ts (the `workspace_number` write)`, `shared/pricing.ts (`NUMBER_RENTAL_MONTHLY_CREDITS`)`
- Existing tests: test/number-rental-billing.server.test.ts; test/number-rental-lifecycle.test.ts
- Missing tests: Warn → pay → lapse warns again; also cover suspend → full recovery → lapse and idempotent reruns.
- Done when: The full sequence warn → suspend → pay → lapse produces a **second** warning (kill-check: remove the clear and confirm the test goes red).; Warn → pay without suspension → lapse also produces a second warning.; The first lapse still warns exactly once.; A workspace that never lapses is never warned.; The policy comment in `number-rental-lifecycle.ts` matches the tested behaviour.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2141](https://github.com/chester-hill-solutions/callcaster/issues/2141) addInboundQueueMember accepts any user_id, including non-members of the workspace
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Add-member service still checks neither target membership nor queue ownership. Existing-user ids from another workspace can be written. Fresh bootstrap already has a user FK, so nonexistent users do not insert successfully.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Service inserts caller-selected existing user/queue ids without workspace membership/queue ownership checks. A fresh database FK already rejects nonexistent user ids, but error maps to 500 instead of clear 400.
- Resolution: Validate target workspace membership and queue belongs to workspace inside the shared service. A DB membership constraint must reference composite (workspace_id,user_id), not bare workspace_member(user_id), which is not unique. Preserve existing global user FK. Audit existing rows with authorized database access.
- Look in: `app/lib/inbound-queue-db.server.ts:103`, `app/routes/api+/inbound-queue.action.server.ts:89`, `app/routes/workspaces+/$id/settings/queues.action.server.ts:88`, `drizzle/0006_app_schema_tail.sql:147`, `app/lib/inbound-queue-db.server.ts:97`, `drizzle/0006_app_schema_tail.sql:144`, `app/db/schema-inbound-queue.ts:25`
- Existing tests: test/inbound-queue.test.ts covers queue-name helpers; it does not cover add-member target membership or queue ownership.
- Missing tests: Existing foreign user refused/no insert, nonexistent user gives clear 400, foreign queue refused, and valid same-workspace member accepted; live-row audit count unknown.
- Done when: Both real add-member routes reject an existing foreign-workspace user with 400 and no insert.; Both routes reject a nonexistent user with a clear 400 rather than the current database-error 500.; The shared service rejects a queue belonging to another workspace.; A valid member and queue in the same workspace succeed.; An authorized existing-row audit records its count and cleanup result; this source audit does not claim live data was inspected.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2124](https://github.com/chester-hill-solutions/callcaster/issues/2124) Two ratcheting guards tolerate stale baseline entries, so a ratchet that should only shrink can silently grow
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Both guards still accept stale baseline entries. Redirect scanning also remains line-based, and replacing mocks are stored as a set rather than occurrence counts.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Both guards still accept stale baseline entries. Redirect scanning also remains line-based, and replacing mocks are stored as a set rather than occurrence counts.
- Resolution: Make both ratchets fail stale entries; parse multiline redirects and count mock occurrences.
- Look in: `scripts/check-relative-redirects.mjs:66`, `scripts/check-relative-redirects.mjs:137`, `scripts/check-test-mock-coverage.mjs:74`, `scripts/check-test-mock-coverage.mjs:89`, `scripts/check-relative-redirects.mjs:36,134-142 (the regex is correct; the stale branch is not)`, `scripts/check-test-mock-coverage.mjs:15-16,72-76,80-93,112`, `scripts/check-queue-rpc-contract.mjs:135-145 (the correct pattern to copy)`, `scripts/baselines/relative-redirects.json`, `scripts/baselines/test-mock-replace.txt`
- Existing tests: None. Neither guard has a fixture test that proves it can fail in the stale direction.
- Missing tests: A multiline relative redirect such as redirect(
 "./foo"
) fails.; A stale baseline fails with a rewrite hint.; Repeated replacing mocks for one file/module increase the count and fail.
- Done when: A multiline relative redirect fails. An absolute /foo redirect remains outside the relative-redirect guard.; Both guards reject stale baselines.; The mock baseline records per-occurrence counts.; Fixture tests prove fail and pass cases.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2123](https://github.com/chester-hill-solutions/callcaster/issues/2123) The nested RouteErrorBoundary throws away the server's explanation for non-404 route errors
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- The nested boundary still drops response data. The issue understates the contract: middleware and error mapper often supply JSON {error,...}, while root only accepts string data; not all mapper data is sanitized.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Nested boundary discards all response data. Common 403 data is a JSON error object; the root handles strings only. Raw mapper messages cannot be trusted unconditionally.
- Resolution: Extract recognized response message shapes with sanitization; do not blindly render error.data or copy the root string-only logic.
- Look in: `app/components/shared/RouteErrorBoundary.tsx:34`, `app/lib/workspace-middleware.server.ts:69`, `app/lib/errors.server.ts:85`, `app/root.tsx:249`, `the nested `RouteErrorBoundary` component`, `app/lib/handler.server (`createErrorResponse`)`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/root.tsx (the correct reader)`
- Existing tests: test/ui/components-shared-smoke.test.tsx
- Missing tests: Existing shared smoke tests cover 404 and raw-driver fallback, but the 403 test pins status-only text. Add safe string data, safe JSON error data, unknown/driver response data, and empty-data fallback.
- Done when: A 403 thrown as "You do not have access to this workspace" renders that sentence in the nested boundary (kill-check: revert to the status-only text and confirm the test goes red).; A 404 still renders its not-found treatment (the existing correct behaviour must stay green).; A non-`Response` error still goes through `toUserMessage` and never leaks a driver message.; Safe string response data and recognized structured error payloads both produce the intended message.; Response data containing a driver/internal message produces a safe fallback.; Missing or unrecognized response data uses the status fallback.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2122](https://github.com/chester-hill-solutions/callcaster/issues/2122) DateTimePicker's displayed month is initialised from value and never re-synced, so the grid can show a stale month
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Date/month and AM/PM mirrors are still initialized once. The proposed period state sync alone would be insufficient because the period Select is also uncontrolled.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Date/month and AM/PM mirrors are still initialized once. The proposed period state sync alone would be insufficient because the period Select is also uncontrolled.
- Resolution: Sync month/period on external value changes and use value={period} for TimePeriodSelect; period-state sync alone does not fix its uncontrolled Select.
- Look in: `app/components/ui/datetime.tsx:617`, `app/components/ui/datetime.tsx:488`, `app/components/ui/datetime.tsx:328`, `test/ui/components-ui-primitives.test.tsx:369`, `app/components/ui/datetime.tsx (`DateTimePicker` `month` state; `TimePicker` `period` state)`, `app/components/audience/AudienceTable.tsx:84-90`, `app/components/queue/QueueTable.tsx:198-202,215-227`
- Existing tests: test/ui/components-ui-primitives.test.tsx
- Missing tests: Need mounted popover rerenders and rendered AM/PM selection tests, not just state or a button smoke assertion.
- Done when: A `value` change from April to May updates the displayed month (kill-check: remove the re-sync and confirm the test goes red).; Clearing `value` resets the month to the current month.; After an external value change, the displayed month follows that value; intentional calendar navigation remains possible.; `TimePicker`'s AM/PM re-syncs from `date` on the same kinds of change.; The rendered AM/PM Select follows external date changes and clearing; updating period state alone is insufficient while the Select uses defaultValue.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2114](https://github.com/chester-hill-solutions/callcaster/issues/2114) Message campaign credit estimates assume one segment per contact while billing charges per segment
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- The estimate still assumes one segment per message and has no template/media input. Its copy says per segment while total is contact count times 2.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The estimate still assumes one segment per message and has no template/media input. Its copy says per segment while total is contact count times 2.
- Resolution: Estimate rendered template segment counts or state a clear minimum assumption; include/exclude MMS explicitly.
- Look in: `shared/campaign-billing.ts:23`, `shared/campaign-billing.ts:32`, `app/lib/campaign-billing.server.ts:30`, `app/lib/campaign-outbound-estimate.ts`, `app/lib/sms-segments.ts`, `app/lib/worker/webhook-side-effects.server.ts:207-209`, `the Launch page cost panel component and `loadCampaignBillingSummary`
- Existing tests: test/campaign-billing.test.ts
- Missing tests: Summary-level multi-segment and media examples must compare estimate assumptions with billed rates.
- Done when: For a campaign whose template produces 2 segments per message, the estimate equals the ledger debit (kill-check: revert to per-contact and confirm the test goes red).; The panel's `rateDescription` states the assumption it actually makes.; MMS is either estimated or explicitly excluded in the copy.; A `loadCampaignBillingSummary`-level test asserts estimate == debit for a representative campaign.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2110](https://github.com/chester-hill-solutions/callcaster/issues/2110) Chat composer segment counter and credit estimate desync from the message text after a failed send
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Failed sends still restore the textarea by DOM write while counts derive from ChatInput bodyValue state. The existing failure test verifies text restoration but never mounts the real counter component.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Failed sends still restore the textarea by DOM write while counts derive from ChatInput bodyValue state. The existing failure test verifies text restoration but never mounts the real counter component.
- Resolution: Give composer text one React-owned value and restore/clear through that contract. Test actual ChatInput with failed send, long text, segment/credit display, user typing during request, and success clear.
- Look in: `app/components/sms-ui/ChatInput.tsx:100`, `app/components/sms-ui/ChatInput.tsx:209`, `app/components/sms-ui/ChatInput.tsx:355`, `app/hooks/chats/useChatsPage.ts:448`, `test/ui/hooks-chats-optimistic-failure.test.tsx:97`, `app/components/sms-ui/ChatInput.tsx`, `app/hooks/chats/useChatsPage.ts`, `test/ui/hooks-chats-optimistic-failure.test.tsx`
- Existing tests: test/ui/hooks-chats-optimistic-failure.test.tsx
- Missing tests: Existing DOM-only failure test cannot detect that bodyValue remains empty. Mount the actual composer and assert restored text, segments/credits, cursor behavior, and successful clearing.
- Done when: After a failed send of a 340-character message, the counter shows the real length, the real segment count and the real credit estimate (kill-check: keep the DOM write and confirm the test goes red).; The restored text is the user's, unchanged, and the cursor is at a sensible position.; A successful send still clears the composer.; The 160-character boundary warning still fires on the restored text.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2064](https://github.com/chester-hill-solutions/callcaster/issues/2064) Nightly ledger drift check compares the wrong branch against the dev database
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- All three environment drift jobs still use a refless checkout. A scheduled dev job can therefore compare default-branch files with the dev database.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. All three environment drift jobs still use a refless checkout. A scheduled dev job can therefore compare default-branch files with the dev database.
- Root cause: Scheduled runs use the default branch when checkout has no ref; the dev environment job therefore compares that branch's migration/schema files with the dev database. This workflow checks each environment against its matching code, not dev against master.
- Resolution: Pin the intended branch per environment and add a workflow contract check.
- Look in: `.github/workflows/ledger-drift-check.yml:97`, `.github/workflows/ledger-drift-check.yml:127`, `.github/workflows/ledger-drift-check.yml:153`, `.github/workflows/ledger-drift-check.yml (all three jobs)`, `scripts/db/check-db-orphans.mjs`, `scripts/db/bootstrap-fresh-db.mjs`
- Missing tests: Need fixture showing a refless environment job fails and dev-ahead-of-master comparison passes.
- Done when: Every job in the workflow checks out an explicit ref; The nightly dev job passes on a correct database that is ahead of master; The job name states which comparison it makes; A refless job fails the check
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2063](https://github.com/chester-hill-solutions/callcaster/issues/2063) Harden useChatRealtime against a fresh array with unchanged contents
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- The array-identity reset remains. A fresh same-content initial array can cause a loop, but the live caller uses stable loader data and conversation remounts, so this remains the latent contract risk described in the issue.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Identity reset is still present. Production uses a stable loader list per navigation; the test mock was stabilized but did not harden the hook.
- Root cause: The dependency is array identity rather than the conversation identity the effect actually cares about. Nothing in the type system or a guard distinguishes the two.
- Resolution: Give reset ownership to conversation identity/remount and safely reconcile loader content. Add a bounded-render same-content fresh-array test without an unbounded OOM run; coordinate reconciliation with #2106.
- Look in: `app/hooks/realtime/useChatRealtime.ts:98`, `app/hooks/chats/useChatThread.ts:66`, `test/ui/hooks-chats.test.tsx:52`, `app/hooks/realtime/useChatRealtime.ts:98-102`, `app/hooks/chats/useChatThread.ts (the pagination accumulation the effect discards)`
- Existing tests: test/ui/hooks-chats.test.tsx (loader mock now has stable identity; the former OOM diagnosis is historical); test/ui/hooks-realtime.test.tsx (realtime insert/dedupe/failure behavior with stable initial arrays)
- Missing tests: Existing realtime tests use stable initial arrays. Need unchanged-content/new-identity, real content updates, and conversation-switch bounded behavior.
- Done when: A contents-equal but freshly built `initial` does not re-seed the thread; The effect converges under StrictMode double-rendering; The live pagination-wipe symptom has its own tracked fix; A changed conversation resets the thread, while loader updates for the same conversation retain valid accumulated history.
- Tracker: Fix now as defensive hook-contract work. Do not report a reproduced current production infinite loop.

### [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) auth pages: sign-in hides the real error behind "We couldn't sign you in, Try again shortly"
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-10-02
- The actual Better Auth invalid-credentials exception is still reduced to the generic server-failure message. The path is now signin.action.server.ts and platform-auth.server.ts, not account.sign-in.*.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The shared login helper masks thrown INVALID_EMAIL_OR_PASSWORD errors as temporary server failures; only a resolved missing user/token yields Invalid credentials.
- Root cause: loginWithPassword in app/lib/platform-auth.server.ts catches the provider exception and returns a fixed generic message without reading its known error code. signin.action.server.ts forwards that result.
- Resolution: Map known safe backend error codes to shared user copy, preserve the generic fallback for unknown/driver failures, and test the real invalid-credentials exception shape. Use the same map for browser and JSON login.
- Look in: `app/lib/platform-auth.server.ts:140`, `app/routes/signin.action.server.ts:28`, `test/platform-auth.test.ts:104`, `app/lib/platform-auth.server.ts`, `app/routes/signin.action.server.ts`, `test/platform-auth.test.ts`
- Existing tests: test/platform-auth.test.ts
- Missing tests: Add a thrown APIError with body.code INVALID_EMAIL_OR_PASSWORD, unknown-code fallback, and infrastructure-message non-disclosure tests.
- Done when: The UI distinguishes invalid credentials from a provider outage or rate limit; A wrong password no longer reads as a generic temporary failure; The raw provider payload is mapped, not passed through to the user; The error is surfaced through the toast pattern, not inline text
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2148](https://github.com/chester-hill-solutions/callcaster/issues/2148) The inbound IVR renderer has no speech-text fallback and no WAV sidecar lookup, so a documented-format block emits an empty Say
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Inbound IVR still renders synthesized audio from audioFile only, while content may contain the spoken text. Recorded audio also bypasses the shared WAV-sidecar renderer.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Inbound IVR still renders synthesized audio from audioFile only, while content may contain the spoken text. Recorded audio also bypasses the shared WAV-sidecar renderer.
- Resolution: Use the shared IVR block audio renderer on inbound routes with the loaded workspace context.
- Look in: `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server.ts:25`, `the inbound IVR block route under `app/routes/api+/inbound-ivr/`, `app/lib/ivr-block-render.server.ts (`renderIvrBlock`)`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-wav.server.ts`, `docs/script-json-format.md`, `test/fixtures/script-wire/documented-format.json`
- Existing tests: test/inbound-ivr-block.route.test.ts; test/ivr-wav.server.test.ts
- Missing tests: Inbound content-only speech must be audible; recorded blocks use the supported sidecar path.
- Done when: A documented-format block on the **inbound** path emits the spoken text (kill-check: keep the local `handleAudio` and confirm the test goes red).; A block with an `audioFile` still plays the recording.; A block with a WAV sidecar still uses the sidecar.; There is one block renderer in the codebase (a grep assertion, so a second cannot be added without noticing).
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2137](https://github.com/chester-hill-solutions/callcaster/issues/2137) The billing/ledger loader has no role gate — any member, including caller, reads the full credit history
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Billing loader/service still require membership only, so caller/member roles can read credit history despite stricter purchase controls.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Billing loader/service still require membership only, so caller/member roles can read credit history despite stricter purchase controls.
- Resolution: Apply Admin minimum role to loader and shared billing read service; verify API read parity.
- Look in: `app/routes/workspaces+/$id/billing.loader.server.ts:8`, `app/lib/billing-activity.server.ts:198`, `app/lib/billing-activity.server.ts:221`, `test/billing-loader.route.test.ts:113`, `app/routes/workspaces+/$id/billing.loader.server.ts`, `app/routes/api+/workspaces+/$workspaceId/billing/sessions`, `app/lib/workspace-middleware.server.ts:60-76`, `app/components/workspace/WorkspaceNav.tsx:96-120`, `e2e/specs/rbac.spec.ts:14-22`
- Existing tests: test/billing-loader.route.test.ts covers page/filter forwarding and missing workspace access; it does not cover a valid caller or member being refused.; e2e/specs/rbac.spec.ts checks navigation visibility rather than direct billing-loader status.
- Missing tests: Caller and member refusal with no billing read, admin/owner allowed, direct URL e2e status assertions.
- Done when: A `caller` and a `member` receive 403 on the billing loader (kill-check: remove the gate and confirm the test goes red).; An `admin` and the `owner` receive 200.; The API path enforces the same floor.; The e2e RBAC spec asserts a loader status, not only nav visibility.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2131](https://github.com/chester-hill-solutions/callcaster/issues/2131) Predictive "Start Dialing" is a silent no-op when the campaign has no caller ID, and the error is discarded
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Predictive begin sets an error for missing caller ID/device, but useCallScreen does not read that error or loading state. The button does not explain these preconditions.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Predictive begin sets an error for missing caller ID/device, but useCallScreen does not read that error or loading state. The button does not explain these preconditions.
- Resolution: Expose the start error in the UI and disable Dial with the exact missing prerequisite.
- Look in: `app/hooks/call/useStartConferenceAndDial.ts:66`, `app/hooks/call/useCallScreen.ts:294`, `app/hooks/call/useStartConferenceAndDial.ts`, `app/components/call/CallScreen.Layout.tsx (`handleDialButton`, the Dial control)`, `app/components/call/CallScreen.CallArea.tsx`, `app/components/campaign/settings/detailed/CampaignLaunch*.tsx (the existing readiness-gate pattern)`
- Existing tests: test/ui/use-campaign-dial-actions.test.ts
- Missing tests: Render missing caller ID/device and a server failure; assert an actionable message and safe disabled/loading state.
- Done when: With `campaign.caller_id === null`, the Dial button is disabled and the reason is visible (kill-check: remove the `disabled` condition and confirm the test goes red).; With no device selected, same.; When the server rejects a start for any reason, the error reaches the user through a toast, not only the log (kill-check: drop the toast and confirm the test goes red).; The positive control: a configured caller ID and a device → the button is enabled and the start path runs.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2119](https://github.com/chester-hill-solutions/callcaster/issues/2119) runCampaignScheduleSync skips every voice campaign that lacks a start_date/end_date pair, so such a campaign never reports waiting
- Verdict: **Fix now** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Schedule sync still skips any voice campaign without both dates. Those campaigns never transition to waiting outside their calling hours.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Schedule sync still skips any voice campaign without both dates. Those campaigns never transition to waiting outside their calling hours.
- Resolution: Separate optional date-bound evaluation from the calling-window rule and share the rule with dispatch.
- Look in: `app/lib/campaign-schedule-sync.server.ts:49`, `app/lib/campaign-schedule-sync.server.ts:55`, `app/lib/worker/handlers/cron.server.ts (`runCampaignScheduleSync` and its header)`, `app/lib/campaign-schedule-sync.server.ts`, `app/lib/campaign-dispatch-policy.ts (the dispatch gate)`, `app/lib/campaign-status.ts`, `app/lib/campaign-status-rail.ts`, `app/lib/recipient-calling-window.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts; test/integration-db/campaign-schedule-sync-status-race.test.ts
- Missing tests: No-date outside-window, in-window, expired bounds and sweep/dispatch parity tests; production count still needs measurement.
- Done when: A machine-voice campaign with no date pair, outside its calling window, reports `waiting` (kill-check: restore the combined guard and confirm the test goes red).; A campaign in range reports `running`.; A campaign with an expired range reports the expired state (see the related `campaign_ended` issue).; The `waiting` predicate is a single shared function used by both the sweep and the dispatch gate — asserted by a test that they agree across a table of cases.; The production count is recorded in the issue.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2118](https://github.com/chester-hill-solutions/callcaster/issues/2118) A malformed known feature flag disables valid sibling flags
- Verdict: **Fix now** · Size: XS · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- A wrong type in any known flag still causes whole-object schema parsing to fail and disables an independently valid flag. Unknown passthrough keys are not the same failure case.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Any mistyped known schema flag masks valid sibling flags. Unknown passthrough keys do not necessarily cause validation failure.
- Resolution: Evaluate the requested key with value === true. Log malformed known stored flags at a call site that knows the workspace; the current helper has no workspace argument.
- Look in: `app/lib/feature-flags.ts:12`, `app/lib/coaching-schemas.ts:6`, `test/feature-flags.test.ts:36`, `app/lib/feature-flags.ts:1-40`, `the `feature_flags` column in `app/db/schema*.ts`, `the schema (`WorkspaceFeatureFlagsSchema`)`, `every `hasFeatureFlag` call site (grep)`
- Existing tests: test/feature-flags.test.ts covers true, missing and null values, plus capability combinations; it does not cover a valid flag beside a malformed known flag.
- Missing tests: Add known-sibling-invalid plus own-value-invalid/missing tests; ensure a valid true survives another known flag with string value.
- Done when: A true requested flag remains true when another known flag contains a wrong type.; A requested flag with a wrong type returns false.; A missing requested flag returns false.; Diagnostics for malformed stored known flags identify the key and workspace at a call site with workspace context.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#1878](https://github.com/chester-hill-solutions/callcaster/issues/1878) Surface and select the caller audio on the /call welcome dialog
- Verdict: **Fix now** · Size: M · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-02
- The welcome dialog still carries only a voicemail boolean. It has no audio name or picker, and audiodrop still loads the campaign default. The session-only decision is recorded in the issue.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The welcome dialog still carries only a voicemail boolean. It has no audio name or picker, and audiodrop still loads the campaign default. The session-only decision is recorded in the issue.
- Root cause: The call-loader/Dialogs contract carries booleans and prose only; /api/audiodrop has no override parameter.
- Resolution: Pass the audio library and both campaign defaults through the loader; add session state and validated overrides to every relevant playback path. Confirm machine drop and agent drop follow the chosen values without a campaign write.
- Look in: `app/components/call/CallScreen.Dialogs.tsx:25`, `app/components/call/CallScreen.Layout.tsx:523`, `app/routes/api+/audiodrop.action.server.ts:46`, `app/components/call/CallScreen.Dialogs.tsx`, `app/components/call/CallScreen.Layout.tsx`, `app/routes/api+/audiodrop.action.server.ts`
- Existing tests: test/ui/call-screen-dialogs.test.tsx; test/ui/call-screen-callarea.test.tsx; test/audiodrop.test.ts
- Missing tests: Existing dialog and audiodrop tests do not cover file identity, session picker changes, override playback or no campaign writes.
- Done when: The welcome dialog surfaces the caller audio (name and a way to change it); What is surfaced matches what the dialer actually plays; The choice is session-only and does not write the campaign config
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2278](https://github.com/chester-hill-solutions/callcaster/issues/2278) Validate literal redirect targets against the route tree
- Verdict: **Fix now** · Size: S-M · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-03
- The existing gate checks dot-relative redirects but cannot detect an absent absolute target.
- Current behavior: Source audit dev@c261919e: check-relative-redirects freezes dot-relative calls only. The wide absolute-target gate requested by #2075 is now a separate Task.
- Root cause: The existing guard has no route-tree matching for absolute redirect literals.
- Resolution: Parse literal absolute redirects with the TypeScript AST, compare normalized pathnames to the generated route tree with explicit parameter and wildcard matching, test absent/real/multiline targets, resolve current violations and wire the gate into local and quality CI.
- Look in: `scripts/check-relative-redirects.mjs`, `scripts/baselines/route-tree.txt`, `app/routes/`, `package.json`, `.github/workflows/ci.yml`
- Existing tests: test/check-relative-redirects.test.ts
- Missing tests: Absolute-target parser, registered/missing route, multiline, query/hash, parameterized and wildcard fixtures.
- Done when: Literal absolute redirect pathnames match registered routes, including multiline calls.; Query/hash stripping, parameterized routes and wildcards have explicit behavior and fixtures.; Existing violations are corrected or tracked before enabling the gate.; Local and quality CI run the gate; the relative redirect check remains.
- Tracker: Independent preventive Task split from #2075; no blocking edge.

### [#2061](https://github.com/chester-hill-solutions/callcaster/issues/2061) Dark mode: a neutral Alert reads as an error because --brand-wash goes dark maroon while --brand-tertiary stays pale
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-03
- Option B is recorded: make the default Alert neutral and require explicit semantic tones. CallCaster has not adopted that contract.
- Current behavior: Source audit: dev@5ad088c4, 2026-10-03. The app vendor default still uses border-brand-tertiary and bg-brand-wash. The issue now records a neutral default contract, without changing global brand tokens. Shared workbench ownership is confirmed; app adoption and rendered acceptance remain.
- Root cause: The app still consumes the older brand-styled default Alert; the selected neutral contract has not been adopted.
- Resolution: Adopt the reviewed canonical ui-kit Alert snapshot as a separate consumer change. Keep existing geometry and theme. Classify unvarianted and style-only warning sites, give conditions explicit tones, and verify light/dark contrast and no page movement. Do not change global brand-wash or brand-tertiary.
- Look in: `vendor/chester-hill-solutions/shad-cc/src/styles/theme.css:100`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx:23`, `app/components/ui/alert.tsx:1`, `vendor/chester-hill-solutions/shad-cc/src/styles/theme.css`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx`, `app/components/ui/alert.tsx`
- Missing tests: Actual light/dark rendered tone and contrast, including default/explicit warning sites; browser geometry for any migrated dynamic notices.
- Done when: Record the token change, explicit tone, or combined decision.; Under that decision, a neutral Alert remains legible and does not appear to indicate failure in dark mode.; List every Alert without an explicit tone and mark it deliberately neutral or give it the required tone.; If shared tokens change, check their other consumers in light and dark themes.; Test the selected Alert tone contract and verify the rendered result.
- Tracker: Fix now: the Option B decision is recorded. Shared Alert metadata is tracked in chester-hill-solutions/chester-hill-solutions#121; consumer adoption is still unfinished.

### [#2062](https://github.com/chester-hill-solutions/callcaster/issues/2062) Flash telemetry infers Alert severity from its ARIA role
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-03
- Telemetry still classifies every alert role as alert-banner without semantic severity. The invite example is overstated: /workspaces does not match a workspace ID, so it logs locally but does not send that banner to /client-flash, and alert capture has no stack.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. All observed alerts become severity-free alert-banner events; workspace-scoped successes can become warning logs. The /workspaces invite banner only logs locally, without a stack or network beacon.
- Root cause: The telemetry keys on the ARIA role rather than on the severity the component is actually communicating. `role="alert"` is an accessibility announcement mechanism, not a severity signal, and a neutral `Alert` uses it too.
- Resolution: Make severity explicit through primitive, client payload and sink schema. Do not infer severity from role alone.
- Look in: `app/lib/flash-telemetry.client.ts:125`, `app/lib/flash-telemetry.client.ts:58`, `app/routes/api+/workspaces+/$workspaceId/client-flash.action.server.ts:29`, `app/lib/flash-telemetry.client.ts`, `app/components/shared/QueryParamBanner.tsx (the Alert inside it)`, `app/routes/api+/workspaces+/$workspaceId/client-flash`
- Existing tests: test/ui/flash-telemetry.test.tsx (error-toast and alert-banner capture; no semantic severity mapping)
- Missing tests: Current flash tests cover error toast and alert-banner only. Need success, warning, neutral, unknown-role-only, existing-error retention, and sink-schema tests.
- Done when: An explicit Alert tone or severity determines telemetry classification; role=alert alone does not imply an error.; Success and neutral Alerts inside a workspace URL do not enter the error signal.; A success Alert is recorded as success under the selected telemetry contract.; Genuine errors retain their existing reporting and deduplication.; The client payload and server sink accept the same severity contract.; The /workspaces invite path produces no error event; its current lack of a workspace ID is not used as the severity test.; The e2e alert selectors still resolve after the change.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2035](https://github.com/chester-hill-solutions/callcaster/issues/2035) The settings-sheet Leave Campaign button bypasses the new confirmation
- Verdict: **Fix now** · Size: S · Risk: low · Labels: ux · Assignee: @sai-sy · Updated: 2026-10-03
- Partial fix: the top Leave Campaign button and welcome leave actions ask for confirmation, but the settings-sheet Leave button still calls cleanup immediately.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. PR #2074 adds a visible top action and confirmation, but settings-only Leave bypasses it at Layout:325.
- Root cause: PR #2074 added confirmation to the top action and welcome leave callbacks. CallScreen.Layout.tsx:325 still passes handleLeaveCampaign directly to the settings-only CampaignHeader, so that button performs cleanup immediately.
- Resolution: Finish confirmation wiring for the settings-sheet Leave button and cover all active-session exit controls.
- Look in: `app/components/call/CallScreen.Header.tsx:270`, `app/components/call/CallScreen.Layout.tsx:182`, `app/components/call/CallScreen.Layout.tsx:325`, `app/components/call/CallScreen.Header.tsx:239 (TopChrome header), :264-291 (the kebab menu holding Leave Campaign), :143-150 (the settings-only visible button)`, `app/components/call/CallScreen.Layout.tsx:164-172 (handleLeaveCampaign: hangUp, device.destroy, requeueContacts, navigate(-1)) and :238, :315, :504 (the three call sites)`, `app/components/call/CallScreen.Dialogs.tsx:142 and :177 (the existing leave actions), and the Dialog imports at :4-11 for the pattern to copy`
- Existing tests: test/ui/call-screen-header.test.tsx (covers CampaignHeader only; TopChrome is not rendered by any test)
- Missing tests: Existing header test checks only callback invocation. No layout integration test proves settings Leave is safe, cancel does nothing, and confirm cleans up once.
- Done when: Leave Campaign is visible on the live call screen, not only inside the kebab menu; Leaving the campaign requires an explicit confirmation that states what it does; No hangup, device teardown or requeue happens before the confirmation is accepted; All leave entry points share one confirmation and one implementation; The confirmation is keyboard accessible and has a focus-visible cancel action
- Tracker: Partial fix; retain Fix now for the settings-sheet bypass. Related PR evidence: #2074. A PR reference alone does not prove deployed behavior.

### [#2045](https://github.com/chester-hill-solutions/callcaster/issues/2045) Unread message badge counts only the newest 100 conversations, so it undercounts and drifts down as volume grows
- Verdict: **Fix now** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-10-02
- The newest-100 cap is still explicit in both client badge and server unread total. A sidebar revalidation fix landed separately, but it does not remove this cap.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Both unread totals remain capped at 100 conversations. Sidebar response-merging was fixed by PR #2191 but that does not resolve this count cap.
- Root cause: Both the client badge and server Today count sum a newest-100-conversation page instead of a workspace-wide aggregate. An optimistic inbound increment can disappear at the next capped poll.
- Resolution: Provide a scoped aggregate using the current unread definition, consume it for both server and badge, and test a conversation beyond the newest 100. Retest the screenshot list symptom separately.
- Look in: `app/hooks/chats/useUnreadConversationsCount.ts:15`, `app/lib/database/workspace-conversations.server.ts:489`, `app/hooks/chats/useUnreadConversationsCount.ts:89`, `app/hooks/chats/useUnreadConversationsCount.ts:15-22 (the documented 100-conversation limit), :39-61 (page fetch and sum), :78-91 (optimistic inbound bump), :13 (30s poll)`, `app/lib/database/workspace-conversations.server.ts:486-505 (getWorkspaceUnreadConversationCount and its 'agree with the badge' comment)`, `app/lib/database/workspace-conversations.server.ts:223-241 (the agg CTE: unread_count definition and conv_key grouping)`, `app/lib/chats/unread-count.ts:1-11 (UNREAD_CONVERSATION_PAGE_SIZE = 100)`, `app/routes/workspaces+/$id.loader.server.ts:73 (the server-rendered unread count, workspace root only)`, `app/hooks/chats/useChatsPage.ts:153-164 (the setLoadedChats reset path — the unconfirmed list symptom)`
- Existing tests: test/workspace-conversations-sql-parity.test.ts (conversation-query parity; no complete unread aggregate assertion); test/ui/hooks-realtime.test.tsx (conversation summary refresh/unread behavior; no useUnreadConversationsCount coverage)
- Missing tests: No >100-conversation aggregate parity test exists. The list symptom is not established by this cap alone, and #2191 addresses a different sidebar revalidation loss.
- Done when: The badge and the Today number report the true workspace-wide unread total for workspaces with more than 100 conversations; For the same workspace and unchanged unread data, polling returns the same complete aggregate; it cannot drop an inbound increment merely because the conversation is outside the newest 100.; A Postgres test proves the aggregate equals the per-conversation sum beyond the first page; Per-conversation unread pills are unchanged; The comments asserting the 100-conversation window is by design are corrected; The list-reset symptom is either reproduced and filed as its own issue, or explicitly closed as not reproducible, with evidence
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point. Related PR evidence: #2191. A PR reference alone does not prove deployed behavior.

### [#2004](https://github.com/chester-hill-solutions/callcaster/issues/2004) A 403 renders as "Something went wrong" with a Reload Page button and the raw status text
- Verdict: **Fix now** · Size: S · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-10-02
- The nested boundary still treats a 403 as a generic failure with a destructive alert and Reload Page. Permissions cannot be repaired by reload.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The nested boundary still treats a 403 as a generic failure with a destructive alert and Reload Page. Permissions cannot be repaired by reload.
- Root cause: The boundary was written around 404 and 500 and treats every other status as an unexpected crash. There is no map from status to user-facing meaning, so a deliberate authorization decision is presented as a system fault.
- Resolution: Add a dedicated access-denied state with a useful navigation action; preserve 404 and internal-error protections. Coordinate with #2123 message extraction without merging unrelated scopes.
- Look in: `app/components/shared/RouteErrorBoundary.tsx:13`, `app/components/shared/RouteErrorBoundary.tsx:34`, `test/ui/components-shared-smoke.test.tsx:238`, `app/components/shared/RouteErrorBoundary.tsx:13-32 (the 404 branch to copy), :34-56 (the generic 403 fallthrough)`, `app/lib/workspace-middleware.server.ts:62-75 (createWorkspaceMiddlewareWithMinRole returning 403 with a real message)`, `app/lib/workspace-membership.server.ts:158-187 (requireWorkspaceAccess, 403 AppError, 81 call sites)`, `app/routes/workspaces+/$id.tsx:303 (the workspace layout re-exports this boundary, so every workspace page inherits it)`
- Existing tests: test/ui/components-shared-smoke.test.tsx
- Missing tests: 403 copy/navigation/call-to-action behavior is untested; current status assertion preserves the faulty behavior.
- Done when: A 403 tells the user they lack access, in the app's voice, with the server's message where one exists; No 403 renders the generic crash heading or a Reload Page action; The boundary offers a next step the user can actually take; 401 gets the same treatment; 404 and 5xx behaviour is unchanged; A test covers each status branch, including one on a real min-role-gated route
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#1833](https://github.com/chester-hill-solutions/callcaster/issues/1833) Finish the raw-button cursor migration and prevention guard
- Verdict: **Fix now** · Size: S · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-10-02
- Partial fix: PR #1963 added the shared Button cursor. The raw-button migration and prevention guard in the issue inventory are still absent. The board wrongly says the shared fix is unmerged.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Shared Button cursor handling is present on dev. Raw buttons still bypass that wrapper, including shared pagination. No raw-button structural guard was found.
- Root cause: The shared Button cursor fix is present in dev. Remaining raw buttons bypass that wrapper and its cursor rules; no raw-button prevention guard was found.
- Resolution: Do not reopen the landed shared fix. Verify it, then track the raw-control inventory and prevention guard as focused work.
- Look in: `app/components/ui/button.tsx:55`, `app/components/shared/TablePagination.tsx:120`, `test/ui/button.smoke.test.tsx:11`, `app/components/ui/button.tsx`, `app/routes/workspaces+/$id/onboarding/OnboardingWizard.tsx`, `test/ui/button.smoke.test.tsx`
- Existing tests: test/ui/button.smoke.test.tsx
- Missing tests: Classes alone do not prove computed cursor behavior. Disabled and aria-disabled cursor browser checks and the raw-button prevention guard are missing.
- Done when: Interactive shared buttons show the pointer cursor by default; Disabled buttons show the default cursor; The reported onboarding save/continue instance is fixed; A guard prevents recurrence
- Tracker: Partial fix in PR #1963. Keep remaining inventory/guard work visible; the old unmerged-branch claim is stale. Related PR evidence: #1963. A PR reference alone does not prove deployed behavior.

### [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) Dead Twilio recording callbacks on dial/:number and connect-campaign-conference
- Verdict: **Fix now** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Two outbound paths enable recording without a recording callback URL. Their audio does not enter the stored-recording pipeline.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Two outbound paths enable recording without a recording callback URL. Their audio does not enter the stored-recording pipeline.
- Resolution: Set the completed recording callback on both paths and confirm how conference recordings map to call rows.
- Look in: `app/routes/api+/dial/$number.action.server.ts:68`, `app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.loader.server.ts:58`, `app/routes/api+/dial/$number.action.server.ts`, `app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.loader.server.ts`, `app/routes/api+/recording.action.server.ts`
- Blocked by: [#1873](https://github.com/chester-hill-solutions/callcaster/issues/1873)
- Existing tests: test/dial-number.route.test.ts; test/connect-campaign-conference.route.test.ts; test/recording.route.test.ts
- Missing tests: Exercise both TwiML paths and process a completed recording callback into call.audio_url.
- Done when: No dial path records without a persisted callback; Conference recordings persist (or record is removed)
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2121](https://github.com/chester-hill-solutions/callcaster/issues/2121) Dismissing a query-param banner pushes a history entry, so Back resurrects it
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-03
- Banner dismissal still pushes browser history. The shared URL-flash hook already uses replacement, but QueryParamBanner does not.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Banner dismissal still pushes browser history. The shared URL-flash hook already uses replacement, but QueryParamBanner does not.
- Resolution: Pass replace:true for banner dismissal and inventory presentation-only clears. Keep real filter/page navigation separate. Test dismiss then Back with unrelated parameters preserved.
- Look in: `app/components/shared/QueryParamBanner.tsx:34`, `app/hooks/utils/useSearchParamFlash.ts:51`, `test/ui/components-shared-smoke.test.tsx:113`, `app/components/shared/QueryParamBanner.tsx:16-57`, `app/hooks/ (the flash hook that already uses `replace: true`)`, `every `setSearchParams(` call site (grep)`
- Existing tests: test/ui/components-shared-smoke.test.tsx
- Missing tests: Need router/browser history outcome, exact URL clearing, and unrelated-param preservation. Existing test would remain green with push semantics.
- Done when: Dismissing the banner then pressing Back does **not** restore the banner (kill-check: drop `{ replace: true }` and confirm the test goes red).; Dismissing still clears the parameter from the URL.; Every presentational-parameter clear in the app uses replace (a grep-verified list recorded in the issue).
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2140](https://github.com/chester-hill-solutions/callcaster/issues/2140) Settings member projection drops names from the manage-sheet heading
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-02
- Settings member projection still drops names. Manage sheet renders the target memberName as Unnamed; it does not show the actor name as the issue also claims.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The target-name heading inside the sheet shows Unnamed because the settings projection drops names. SheetTitle itself is Manage Team Member. The current component reads the target member, not the actor.
- Resolution: Preserve first_name/last_name in the settings projection; define required nullable name fields plus username in the consumer type and use username fallback. Admin Access-tab projection already retains names. Remove the unsupported actor-name fix from scope.
- Look in: `app/lib/workspace-settings-db.server.ts:65`, `app/components/workspace/TeamMember.tsx:58`, `app/components/workspace/TeamMember.tsx:130`, `app/lib/platform-admin.server.ts:366`, `app/routes/workspaces+/$id/settings.loader.server.ts:15-22`, `app/lib/workspace-settings-db.server.ts:15 (`UserWithRole`), `getWorkspaceSettingsPageData`, `app/components/workspace/TeamMember.tsx (the heading)`
- Missing tests: Render target names, username fallback and type narrowing regression. No actor-name defect is established.
- Done when: Member sheet heading shows target first/last name.; When both names are absent, heading falls back to username.; Producer/consumer types require the name fields, even when null.; Other member list producers are reviewed; admin invite projection already includes names.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2111](https://github.com/chester-hill-solutions/callcaster/issues/2111) Admin Add User and Add Workspace buttons have no action
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-02
- Add User and Add Workspace remain dead buttons. The proposed /admin/users/new and /admin/workspaces/new routes do not exist in the current route tree.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Both dead controls persist, and the suggested new routes are absent.
- Resolution: Remove the inert controls until creation is scoped, or implement real creation as its own authorized work. Do not wire these buttons to absent routes. Add a guard with real action-resolution checks.
- Look in: `app/routes/admin+/panels/AdminUsersPanel.tsx:82`, `app/routes/admin+/panels/AdminWorkspacesPanel.tsx:103`, `app/routes/admin+/route.tsx:1`, `app/routes/admin+/panels/AdminUsersPanel.tsx`, `app/routes/admin+/panels/AdminWorkspacesPanel.tsx`, `app/routes/admin+/`
- Missing tests: Admin smoke tests do not activate these controls or prove a reachable route/action.
- Done when: Each of the two buttons either navigates to a real route or is removed (kill-check: remove the `to` and confirm the test goes red).; A guard test asserts that creation controls in app/routes/admin+/panels/ have a reachable action, or are absent.; If the routes do not exist yet, the button is absent rather than inert.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2109](https://github.com/chester-hill-solutions/callcaster/issues/2109) Changing "rows per page" in the admin portal blanks the table — the page number is never reset
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-10-02
- The admin page-size blank-table defect remains across all three panels. Changing page size invokes only setItemsPerPage; the reset key excludes size and there is no clamp.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The admin page-size blank-table defect remains across all three panels. Changing page size invokes only setItemsPerPage; the reset key excludes size and there is no clamp.
- Resolution: Make size changes reset page 1 in the shared contract and include size/clamp in admin state. Add populated page-2 to size-50 scenarios for users/workspaces/campaigns and true-empty-state checks.
- Look in: `app/components/shared/TablePagination.tsx:97`, `app/hooks/utils/useFilterPagination.ts:3`, `app/routes/admin+/panels/AdminUsersPanel.tsx:32`, `test/ui/table-pagination-page-size.test.tsx:43`, `app/hooks/utils/useFilterPagination.ts`, `app/components/shared/TablePagination.tsx`, `app/routes/admin+/panels/AdminUsersPanel.tsx`, `app/routes/admin+/panels/AdminWorkspacesPanel.tsx`, `app/routes/admin+/panels/AdminCampaignsPanel.tsx`
- Existing tests: test/ui/table-pagination-page-size.test.tsx
- Missing tests: The existing page-size test stays green while the bug remains. Needs table row outcomes, invariant, normal paging positive control, and empty filtered results.
- Done when: Changing the page size on page 2 shows the first page of the new size, not an empty table (kill-check: remove the `onPageChange(1)` call and confirm the test goes red).; The invariant `currentPage <= totalPages` holds after any page-size change, in all three admin panels.; An empty result shows a real empty state.; The permitted path (paging with an unchanged page size) is unchanged.
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

### [#2042](https://github.com/chester-hill-solutions/callcaster/issues/2042) Side Sheet has no default padding, so any body between header and footer renders flush to the edge
- Verdict: **Fix now** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-10-02
- The local sheet wrapper still adds no padding. The reported split-campaign sheet body has vertical padding only, while upstream padding applies to header/footer.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The reported sheet still has no horizontal body inset. Header/footer use upstream p-6.
- Root cause: SheetContent adds no body inset. Upstream header/footer slots have p-6, while the reported split-campaign body has only py-4. Other consumers require a separate audit; not every sheet should receive padding.
- Resolution: Add a deliberate body-padding contract and check existing consumers rather than blindly adding outer padding.
- Look in: `app/components/ui/sheet.tsx:50`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/sheet.tsx:81`, `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx:273`, `app/components/ui/sheet.tsx:50-54 (the local SheetContent wrapper, where the default belongs)`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/sheet.tsx:81 (no padding on the content slot), :132 and :142 (p-6 on header and footer only)`, `app/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign.tsx:262-263 (the sheet in the screenshot)`, `the 9 other SheetContent call sites: CallScreen.Layout.tsx:253,274,302; NumberSummaryList.tsx:467; CallerIdVerificationDialog.tsx:44; ChatAddContactDialog.tsx:72; TeamMember.tsx:128; Navbar.MobileMenu.tsx:44; AddAudioSheet.tsx:125`
- Existing tests: test/ui/components-ui-primitives.test.tsx (sheet render smoke test; no body-inset assertion); test/ui/add-audio-sheet.test.tsx (upload behavior; no padding assertion)
- Missing tests: No sheet inset regression test or browser measurement was found. Header/footer already have padding, so a naive content p-6 risks doubled insets.
- Done when: Body content in a side Sheet has the same horizontal inset as its header and footer; The two full-bleed sheets (chats mobile list, workspace nav) still render edge to edge; Padding is defined in one place, and hand-compensating padding at call sites is removed; A test fails if a new SheetContent call site reintroduces flush body content; The vendored shad-cc package is unchanged
- Tracker: Source defect remains. Use the revised resolution and verify behavior through the affected entry point.

---

## Verify and close — 135

Likely already fixed or working as designed. Run the listed verification, then close without new code.

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

### [#2129](https://github.com/chester-hill-solutions/callcaster/issues/2129) The inbound-queue duplicate-offer guard is wired as "already in the baseline" but exists in no baseline, and both database lineages behave wrongly
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-10-04
- The active-offer guard is repaired on dev. Repeated requests return no new offer; timeout and decline permit a new offer. Deployed caller behavior and promotion remain to verify.
- Current behavior: PR #2314 merged at dev@eaaffaf4. Both bootstrap paths apply the later guard after the unguarded claim definition. The partial index and RPC use queued/offered/accepted; duplicate claims reserve no extra agent or dial.
- Resolution: Verify the deployed final RPC, partial index, concurrent wait callbacks and release/retry behavior, then promote the tested source. Review existing duplicate active rows before an upgrade; the migration rejects them without ending calls.
- Look in: `client/migrations/20261003231500_guard_active_inbound_offers.sql`, `app/db/schema-inbound-queue.ts`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`, `app/lib/acd/acd-router.server.ts`, `test/integration-db/inbound-offer-guard.test.ts`
- Existing tests: test/integration-db/inbound-offer-guard.test.ts: thirteen real-Postgres cases on production fresh, compose fresh and legacy text-status/index upgrade fixtures.; Full real-database tier: 169 passed locally and in final PR E2E CI. Full local CI, remote quality/E2E/bundle/guards and both app/worker deployments passed at eb9019c4.; Fault proof: original runtime nine failures/four controls; caller serialization removed one/twelve; wrong terminal predicate three/ten; queue ownership removed one/twelve; restored thirteen pass. Dirty upgrade preserves rows, agent state, previous RPC and index state.
- Missing tests: Deployed real-caller concurrent wait and timeout/decline retry verification before promotion.
- Done when: Concurrent claims for the same queue and CallSid produce at most one active offer.; After timeout/release, a later claim can create a new offer; any different-agent preference is an explicit policy rather than assumed behavior.; The final claim definition and duplicate-offer constraint are applied on each supported database lineage.; A real-Postgres test fails when active-offer protection is removed.
- Tracker: Source repair verified on dev in PR #2314. Issue remains open until promotion and required deployed verification. No change to retry-agent preference.

### [#2304](https://github.com/chester-hill-solutions/callcaster/issues/2304) Show reset-password action failure once
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- PR #2310 completes single readable reset-password action feedback on dev; deployment verification and promotion remain.
- Current behavior: Merged at dev@cb88df8b, 2026-10-03. The root toast receives the actual error message once; the inline duplicate is removed and failed passwords remain for retry. Full local CI passed 5,325 Vitest and 22 Bun tests; four built-app narrow/desktop light/dark browser cases proved stable page/document/scroll geometry. Exact-head remote checks and both Railway checks passed before merge.
- Root cause: The same action failure reaches two presentation paths.
- Resolution: Verify the implemented reset failure/retry on the deployed review environment and promote through the release PR. Keep the issue open until its default-branch delivery and verification are complete.
- Look in: `app/routes/reset-password.tsx`, `docs/feedback-inventory.md`
- Existing tests: test/ui/reset-password-feedback.test.tsx; e2e/specs/password-reset-feedback.spec.ts; Original source fails both new error cases; restored source and validation/retry controls pass. Full PR #2310 CI and browser proof.
- Missing tests: Deployed review verification and promotion; no further duplicate-removal implementation is needed.
- Done when: One visible result for one failed action.; Preserve genuine field validation, permissions, hard gates, entered values and retry.; No page or scroll movement on appearance, update or removal.
- Tracker: Verify and close. Native Development link to PR #2310 and successful issue-on-dev workflow were verified; no deployed browser acceptance is claimed.

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

### [#2014](https://github.com/chester-hill-solutions/callcaster/issues/2014) auth pages: sign-in errors should be a toast, not inline text (sweep split to #2058)
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design · Assignee: none · Updated: 2026-10-03
- The sign-in route already sends action failures through the root feedback hook; the wider source inventory is complete in #2058.
- Current behavior: Source audit: dev@5ad088c4, 2026-10-03. app/routes/signin.tsx uses useActionFeedback with getError(data.error) and renders no inline action failure. Source behavior is present; this audit does not claim a deployed sign-in test.
- Root cause: The earlier board record described pre-conversion source and treated the inventory as a blocker for the page fix.
- Resolution: Verify one sign-in failure toast, no revalidation replay, retained input/validation and stable page geometry in the deployed app. Promote before closure. The separate inventory is PR #2302; other consumer defects remain under #2300.
- Look in: `app/routes/signin.tsx`, `app/hooks/utils/useActionFeedback.ts`, `app/root.tsx`, `docs/feedback-inventory.md`
- Missing tests: Actual sign-in failure, retry/revalidation and real-browser geometry; deployed verification and promotion.
- Done when: A failed sign-in surfaces through a toast, not inline text; No inline error text remains on the sign-in page; The change is scoped to this page; the sweep ships separately as #2058
- Tracker: Verify and close the sign-in-only scope. Do not bundle the five duplicate-message defects into this page fix.

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

### [#2106](https://github.com/chester-hill-solutions/callcaster/issues/2106) Keep loaded chat history when the current thread refreshes
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Same-conversation loader refreshes reconcile rows by SID and retain loaded history. Workspace/contact changes reset the keyed thread.
- Current behavior: Merged to dev in PR #2291 at b2d717c3. Same-conversation loader rows reconcile by SID and retain older/live history. Saved-row identity/time limits protect pending replies from known, older and unknown-time repeated-body rows. Different workspace/contact resets keyed history and pagination. Empty older pages set exhaustion. All 32 focused cases pass; original runtime fails ten with four controls; eleven faults fail and source is restored. Full local CI passed 5,269 Vitest and 22 Bun tests; remote and both Railway gates passed on 23676f9f. Issue-on-dev moved one item. Verify deployed dev and promote before closure.
- Root cause: Loader array reference changes were treated as a new conversation and replaced accumulated history. SID bookkeeping also excluded manually prepended rows; latest-page pagination state did not represent the retained thread.
- Resolution: Verify loading older pages, replying and filter/sort revalidation on deployed dev retain history, update matching records and do not duplicate saved/live replies. Different workspace/contact must reset history/pagination. Promote before closure.
- Look in: `app/hooks/realtime/useChatRealtime.ts`, `app/hooks/chats/useChatThread.ts`, `app/routes/workspaces+/$id/chats/$contact_number.route.tsx`, `app/hooks/chats/useChatsPage.ts`
- Existing tests: test/ui/chat-thread-history.test.tsx; test/ui/hooks-chats.test.tsx; test/ui/hooks-realtime.test.tsx; test/ui/hooks-chats-optimistic-failure.test.tsx; test/ui/use-chats-page-pagination.test.tsx
- Missing tests: Deployed dev scroll/reply/filter/identity verification before promotion.
- Done when: At least two older pages survive reply and filter/sort loader refreshes.; Matching SID records update, unmatched live rows remain and messages retain chronological order.; Saved rows replace matching optimistic replies when loader data arrives before SSE.; Known/older/unknown-time saved rows cannot remove a new repeated pending reply or hide send failure; valid second-precision saved rows can replace it.; SSE/loader overlap and already-loaded older SIDs do not append duplicates.; Different contact/workspace resets history and pagination; equivalent normalized contact keeps history.; Empty older pages stop pagination; latest-page availability changes do not reset exhaustion.; Current-context event filtering is retained.; Original source and isolated regressions fail meaningful tests; full local/remote gates pass before merge.; Verify deployed dev and promote before closure.
- Tracker: Source fix is in this change. Thread history is separate from the sidebar accumulation already fixed under #2191; verify the deployed flow before promotion and closure.

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

### [#2104](https://github.com/chester-hill-solutions/callcaster/issues/2104) Include namespace effect calls in the effects guard
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The effect guard collects actual direct and namespace calls and reads annotations before the complete callee. Both hidden effects are now inventoried.
- Current behavior: Merged to dev in PR #2289 at 0a0acd17. The guard collects actual direct and namespace call expressions and reads annotations before the complete callee; declarations and comment/string lookalikes are ignored. Both hidden app effects are now inventoried: datetime timer documented, audience-history fetch CANDIDATE-REMOVE under #2288. Inventory lists 120 effects: 118 documented and the same two grandfathered effects. Runtime, dependencies and allowances are unchanged. All 29 focused cases pass; original scanner fails 14 of 18 with four controls, five mutations and two annotation removals fail. Full local CI passed 5,247 Vitest and 22 Bun tests; all remote and both Railway gates passed on cc58190e. Issue-on-dev moved one item. Verify merged/dev guard inventory and promote before closure.
- Root cause: The definition-skip regex treated a preceding dot as proof of a declaration, including namespace calls and a dot in a preceding line comment. Annotation lookup at the hook name would also reject valid namespace annotations.
- Resolution: Verify the real guard and generated inventory on the merged source; namespace calls must be enforced and documented, true declarations ignored and baseline allowances retained. Promote before closure. Audience-history behavior belongs to #2288; dependency-tag comparison remains #2067.
- Look in: `scripts/check-effects.mjs`, `scripts/lib/effects-lib.mjs`, `app/components/ui/datetime.tsx`, `app/hooks/audience/useAudienceUploads.ts`, `docs/effects-inventory.md`, `scripts/effects-baseline.json`
- Existing tests: test/effects-scanner.test.ts; test/effects-compliance.test.ts; test/ui/audience-upload-history.test.tsx
- Missing tests: Verification on merged/deployed dev source before promotion.
- Done when: Actual unannotated direct, namespace and layout-effect calls fail the CLI.; Annotated complete member calls appear in inventory, including multiline forms.; Actual declarations and hook-like comments/strings are ignored.; Namespace effects count in baseline mode and growth above allowance fails.; Datetime timer annotation and audience removal debt are listed; production behavior and baseline allowance are unchanged.; Original source, scanner mutations and annotation removals fail meaningful regressions.; Full local/remote gates pass before merge; verify merged dev source before promotion and closure.
- Tracker: Source guard fix is in this change; verify inventory/enforcement and promote before closure.

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

### [#2100](https://github.com/chester-hill-solutions/callcaster/issues/2100) Align the API session-cookie contract with Better Auth
- Verdict: **Verify and close** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The API contract and SDK identify both session-cookie forms issued by the current auth configuration: HTTP and secure HTTPS deployment alternatives.
- Current behavior: Merged to dev in PR #2286 at 715c6844. Shared session-cookie definitions identify better-auth.session_token on HTTP and __Secure-better-auth.session_token on HTTPS as deployment alternatives. All served specs preserve session-only versus API-key/session policy; the SDK uses the exact issued name and signed value through its auth callback. Auth configuration/verifier are unchanged. All 112 focused cases pass; original runtime fails eight with ten controls, five source/SDK mutations and a separate signed-value challenge fail. Full local CI passed 5,202 Vitest and 22 Bun tests. All remote gates and both Railway checks passed on b13ad43d; issue-on-dev moved one item. Verify deployed behavior and promote before closure.
- Root cause: The OpenAPI source retained the retired Supabase cookie name. Generated outputs faithfully repeated it, and separate static security arrays omitted the HTTPS cookie mechanism.
- Resolution: Verify the deployed server cookie and served schemes match. Confirm a generated SDK request using its issued signed cookie authenticates, browser cookie-jar access remains valid, and API-key access is retained. Promote before closing.
- Look in: `app/lib/openapi-integrator.ts`, `app/lib/openapi-build.ts`, `app/lib/openapi-platform.ts`, `app/lib/api-generated/sdk.gen.ts`, `app/server/auth-instance.ts`, `app/lib/auth.server.ts`, `docs/api-auth-matrix.md`, `docs/api-overview.md`, `docs/api-telephony-control.md`, `test/session-cookie-contract.test.ts`
- Existing tests: test/session-cookie-contract.test.ts (real app auth instance with isolated adapter, issued signed cookies, three generated SDK operations, HTTP/HTTPS, wrong-name/prefix/signature and API-key header controls); test/openapi.test.ts (session-only and API-key/session security policy); test/api-auth.test.ts; test/auth-instance.server.test.ts; test/api-surface.test.ts; test/openapi-complete.test.ts
- Missing tests: Deployed cookie/SDK verification and production promotion before closure.
- Done when: All three specs and the generated SDK identify the real HTTP and secure HTTPS deployment cookie alternatives.; All session operations include both mechanisms without widening session-only routes to API-key access.; The three SDK operations authenticate using the exact issued cookie name and signed value under both base-URL forms.; Renamed cookies, wrong secure prefixes and modified signatures are refused by the real verifier.; Browser-cookie and SDK API-key controls remain valid.; Original source and changed source/SDK names or omitted secure alternatives fail collected regressions.; Full codegen/local/remote gates pass; verify deployed behavior before promotion and closure.
- Tracker: Source contract fix is in this change; verify deployed cookie/SDK behavior and promote before closure.

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

### [#2080](https://github.com/chester-hill-solutions/callcaster/issues/2080) Restrict webhook tests to permitted workspace members
- Verdict: **Verify and close** · Size: S-M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Both test URLs require workspace membership and the existing member-or-higher rule, then share one Postgres-backed per-user limit before DNS and outbound delivery.
- Current behavior: Merged to dev in PR #2284 at 29668acd. Both webhook-test URLs require member-or-higher workspace access and share ten tests per minute per authenticated user. Rejection and storage failure prevent DNS/HTTP work. The editor carries the top-level workspace ID, retains unsaved URL/header testing and preserves response read-back. The route guard checks external effects and only used service/provider imports. All 100 focused Node cases and one UI case pass; original runtime fails 23 regressions with 23 controls and the original editor fails. Thirteen mutations fail. Full local CI passed 5,147 Vitest and 22 Bun tests; all remote gates and both Railway checks passed on 470d1825. Issue-on-dev moved one item. Verify deployed behavior and cross-process shared rate limiting before promotion and closure.
- Root cause: The flat action trusted a session without workspace authorization. The nested test service relied on membership middleware but had no role gate. Neither test path was throttled. The membership guard skipped routes without tenancy text and could count unused service/provider imports as proof.
- Resolution: Verify both deployed URLs: permitted users can test unsaved destinations/headers; callers and non-members have no outbound effect; both URLs and workspaces share the same user budget and return actionable 429 responses. Check storage-error rejection and public-URL/response controls before production promotion and closure.
- Look in: `app/routes/api+/test-webhook.action.server.ts`, `app/routes/api+/workspaces+/$workspaceId/webhook.action.server.ts`, `app/lib/platform-members.server.ts:testWorkspaceWebhook`, `app/lib/webhook-test-delivery.server.ts`, `app/components/workspace/WebhookEditor.tsx`, `app/lib/platform-rate-limit.server.ts`, `scripts/check-route-membership.mjs`, `docs/api-workspace-admin.md`
- Existing tests: test/test-webhook.route.test.ts (actual actions, role/membership, real bucket, shared identities, failures, forwarding and expiry); test/check-route-membership.test.ts (external relay, unused imports, called services, auth/provider/cron controls); test/ui/webhook-editor.test.tsx (actual unsaved test submission and top-level workspace); test/openapi.test.ts; test/safe-outbound-url.test.ts; test/safe-outbound-response-limit.test.ts; test/platform-rate-limit.test.ts; test/workspace-setting-utils.test.ts
- Missing tests: Deployed route/provider verification, shared rate-limit behavior across app processes and production promotion before closure.
- Done when: Missing workspace or non-member cannot deliver a test. Caller is refused; member/admin/owner remains permitted.; Both URLs and all workspaces share ten tests per minute per authenticated user, independent of caller IP and destination.; Over-limit requests include Retry-After; storage failure, role rejection and membership rejection perform no DNS or HTTP work.; The editor sends top-level workspace_id while retaining unsaved URL/header testing and response read-back.; External-effect routes without workspace proof fail the guard; unused imports do not grant proof or a provider exemption. Explicit user auth/provider/cron controls remain valid.; Verify deployed behavior before promotion and closure.
- Tracker: Source fix is in this change; verify both deployed routes and the shared database-backed rate limit before promotion and closure.

### [#2082](https://github.com/chester-hill-solutions/callcaster/issues/2082) Route manual A2P setup through the canonical compliance job
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Source fix uses the existing compliance job for all manual actions, reports queue acceptance only and requires both provider resources for A2P approval.
- Current behavior: Merged to dev in PR #2283 at e71435b3. Manual actions queue the canonical compliance job and report queue acceptance only. Required A2P resources, real SDK campaign statuses and stored worker errors gate 10DLC SMS. Required inputs precede A2P product/brand/campaign calls, while prior service/customer-profile setup can run. All 107 focused cases pass, old source fails 27 regressions with 22 controls, and 16 mutations fail. Full local CI passed 5,103 Vitest and 22 Bun tests; all remote gates and both Railway checks passed on a4c8e9ba. Issue-on-dev moved one item. After brand approval, operators must retry the compliance job to create the campaign. Verify deployed behavior and promote before closure. Trust Product preparation remains separate in #2282.
- Resolution: After deployment, inspect actual brand/campaign SIDs and errors. Wait for brand approval, then use Retry compliance job to resume campaign creation. Verify provider review, error/retry recovery and the real 10DLC send gate before promotion and closure. Separate Messaging Trust Product preparation remains #2282.
- Look in: `app/lib/platform-onboarding-handlers.server.ts`, `app/lib/platform-admin-twilio.server.ts`, `app/routes/admin+/workspaces/$workspaceId/twilio.actions.server.ts`, `app/lib/twilio-a2p-provision.server.ts`, `app/lib/twilio-compliance-job.server.ts`, `app/lib/twilio-a2p-status-sync.server.ts`, `app/lib/messaging-onboarding/predicates.ts`, `docs/twilio-parent-ops-runbook.md`
- Existing tests: test/a2p-manual-actions.test.ts (onboarding/admin API queue acceptance, failures and role controls); test/admin-workspace-twilio.route.test.ts (actual admin form success/error); test/twilio-a2p-provision.server.test.ts (installed SDK, actual writer/normalizer/send gate, creation/reuse/wait/errors/inputs and retry recovery); test/twilio-a2p-status-sync.test.ts (required resources, provider VERIFIED/IN_PROGRESS, review demotion and unknown reads); Existing onboarding, business-profile and readiness controls
- Missing tests: Deployed provider and send-gate checks; manual retry after brand approval; production promotion before closure.
- Done when: All manual actions queue the canonical compliance job and report queue acceptance only.; Queue failure never reports success.; Brand review waits without campaign creation; both required resources and approval evidence gate 10DLC SMS.; The installed SDK submits a service-scoped campaign with the required payload and persists created/reused SIDs.; Provider failure, missing campaign SID and thrown bootstrap error remain visible and remove stale approval; successful retry clears stale errors.; Missing business inputs stop A2P Trust Product, brand and campaign calls; prior service/profile setup is separate. Opt-in text is never fabricated.; Verify deployed provider states and retry continuation before promotion and closure.
- Tracker: Source fix is in this change. Verify the complete deployed provider/send path and operator continuation before promotion and closure; #2282 remains separate.

### [#2083](https://github.com/chester-hill-solutions/callcaster/issues/2083) Block bulk SMS when toll-free verification evidence is missing
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Complete SDK enumeration and explicit approval now establish successful verification evidence. Missing, failed and older snapshots block bulk SMS until refreshed.
- Current behavior: Merged to dev in PR #2281 at aacb17ac. The stored bulk SMS gate requires complete successful toll-free verification evidence. Only TWILIO_APPROVED permits approval; full SDK inventory/verification lists, failed or legacy evidence and visible sync errors are covered. Approved/no-toll-free inventories and refresh recovery remain permitted. All 101 focused cases pass, 27 old-source regressions fail with 12 controls, 14 mutations fail, and full local CI passed 5,083 Vitest and 22 Bun tests. All remote gates and both Railway checks passed at 29b76839; issue-on-dev moved one item. Refresh deployed snapshots, verify behavior and promote before closure.
- Root cause: The verification helper swallowed errors, truncated enumeration and permitted unknown status. The outer sync error handler also cleared the block. Existing healthy/false snapshots could therefore be false approval evidence.
- Resolution: After deploying, refresh older snapshots through admin Sync Twilio or Sync Now. Verify approved, missing, provider-error, later-page inventory/verification and recovery cases through the real bulk SMS gate. Promote before closure.
- Look in: `app/lib/twilio-toll-free.server.ts`, `app/lib/database/workspace-twilio-sync.server.ts`, `app/lib/twilio-readiness.server.ts`, `app/lib/messaging-onboarding/predicates.ts`, `app/lib/workspace-twilio-sync.ts`, `app/lib/types.ts`, `scripts/check-app-file-size.mjs`, `docs/twilio-toll-free-verification-plan.md`
- Existing tests: test/toll-free-verification-evidence.test.ts (installed SDK transport, exact status controls, provider errors and later verification pages); test/workspace-twilio-sync.server.test.ts (real writer, normalization, stored readiness gate, later inventory page, unknown/legacy/malformed/failed evidence, approval/no-TF controls and refresh recovery); Existing portal, recommendations, shared onboarding/readiness, RCS and campaign send-gate controls
- Missing tests: Deployed dev refresh and actual bulk SMS checks before promotion and closure.
- Done when: Missing, unknown, misleading non-approved, pending and rejected verification blocks bulk SMS.; Provider and inventory errors remain visible and block the actual gate.; Phone inventory and matching verification beyond the former 200-result cap affect the decision.; A successful complete sync is required before old or missing evidence can permit sends.; Approved senders and successful no-toll-free inventory remain allowed; successful refresh recovers from failure.; The shared gate fails closed and adds no provider call per recipient.; Refresh deployed snapshots and verify behavior before promotion and closure.
- Tracker: Source fix is in this change. Refresh legacy snapshots after deployment, verify actual SMS decisions and recovery, then promote and close.

### [#2078](https://github.com/chester-hill-solutions/callcaster/issues/2078) Project admin workspace responses without credentials
- Verdict: **Verify and close** · Size: S-M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Admin workspace and provider data use positive field sets at the response boundary; nested invitation hashes are excluded. Deployed checks remain.
- Current behavior: Merged to dev in PR #2280 at 6e46180b. Six admin UI/API surfaces use the canonical positive workspace contract, nested invitation hashes are excluded and both account loaders use one five-field projection with selected-account tests. Safe client types and the static import/type gate preserve server-only credential reads and health derivation. All 50 focused Node cases passed, 13 mutations failed, full local CI passed 5,048 Vitest and 22 Bun tests. All remote gates passed on 9ee5270b; issue-on-dev moved one item. Deployed functional verification and promotion remain.
- Root cause: Safe derived workspaceRows were returned beside raw global workspace rows. Admin services also passed raw membership/invitation joins and detail rows through to route adapters, and a smaller provider interface did not remove runtime account fields.
- Resolution: Verify all admin UI/JSON payloads and nested rows exclude credentials and hashes on deployed dev, while display/health data and server-only Twilio operations remain usable. Promote before closure.
- Look in: `app/lib/platform-admin.server.ts`, `app/lib/workspace-client-projection.server.ts`, `app/lib/twilio-client-projection.server.ts`, `app/routes/admin+/workspaces/$workspaceId.loader.server.ts`, `app/routes/admin+/workspaces/$workspaceId/loadTwilioData.server.ts`, `app/routes/admin+/admin.types.ts`, `scripts/check-workspace-projection.mjs`
- Existing tests: test/admin-response-projection.test.ts (six real service/route surfaces, complete root/workspace/provider/invitation key sets, nested secret absence, API auth, missing workspace, provider failure, selected workspace account SID and server-only portal control); test/check-workspace-projection.test.ts (raw reader/type refusal, positive/secret Pick controls and permitted server-only credentials); Existing product SQL projection, admin rows/actions/credits/portal and membership summary controls
- Missing tests: Deployed admin payload, display/health and Twilio-operation verification before promotion.
- Done when: Dashboard UI/API, detail, campaign and user-workspace UI/API payloads exclude workspace credentials, provider authToken and invitation token_hash at every depth.; Workspaces and provider accounts use explicit positive field sets with useful display and operational data preserved.; Client types use the safe workspace contract and server-only credential reads remain permitted.; Admin entry import/type guard rejects raw readers and full/unsafe workspace types, accepts positive Pick and server-only helper controls; payload tests prove dataflow separately.; Missing workspace, provider failure and real API authorization remain controlled.; Deployed verification and promotion precede closure.
- Tracker: Source fix is in this change. Verify deployed nested payloads and admin operations, then promote and close.

### [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) Restore the password recovery email journey
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- The reset email reaches the password form with its token; request feedback is generic and both verification failure paths reach sign-in. Deployed checks remain.
- Current behavior: Merged to dev in PR #2279 at 9aa2025e. /remember uses configured BASE_URL with /reset-password, actual issued email links retain tokens through the password form and change the password; generic request feedback, expiry/replay rejection and limits remain. Both verification failures return to registered sign-in and password completion feedback is accurate. All 33 focused Node and four rendered UI cases passed, nine mutations failed, full local CI passed 5,022 Vitest and 22 Bun tests. All remote gates passed on 2303257c; issue-on-dev moved one item. Wider redirect guard remains separate in #2278. Deployed functional verification and promotion remain.
- Root cause: The UI passed an email verification callback as the final password reset page. That callback required other parameters and redirected to an absent route; request success feedback was disabled.
- Resolution: Verify the emailed journey, generic request feedback, expired and reused tokens, actual password sign-in and callback failures on deployed dev, then promote before closure. The repository-wide literal redirect guard is separate in #2278.
- Look in: `app/routes/remember.action.server.ts`, `app/routes/remember.tsx`, `app/routes/reset-password.tsx`, `app/routes/reset-password.loader.server.ts`, `app/routes/reset-password.action.server.ts`, `app/routes/api+/auth/callback.loader.server.ts`, `app/routes/auth/confirm.loader.server.ts`
- Existing tests: test/password-recovery-journey.test.ts (installed Better Auth, actual email sender, auth loader, reset loader/action, sign-in, expiry, replay, configured host and throttling); test/verification-callbacks.test.ts (both missing/rejected callbacks and success cookie/return controls); test/ui/password-recovery-feedback.test.tsx (real rendered forms and action feedback); Existing remember, reset, email sender, auth-instance and callback tests
- Missing tests: Deployed password recovery and callback verification before promotion.
- Done when: Actual issued link reaches the password form with the original token and the action changes the password.; Known and unknown emails receive the same generic acceptance feedback.; Verification failures reach a real sign-in route without carrying tokens; success keeps cookies and safe return paths.; Password completion feedback names the correct credential.; Existing expiry, replay rejection and request/reset limits remain.; Repository-wide redirect guard is tracked separately in #2278; deployed verification and promotion precede closure.
- Tracker: Source fix is in this change. Verify deployed recovery and failure paths, then promote and close.

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

### [#2079](https://github.com/chester-hill-solutions/callcaster/issues/2079) Reject workspace ownership transfer to the current owner
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Self transfer rejects before MFA or writes; API transfer failures remain errors. Deployed verification remains.
- Current behavior: Merged to dev in PR #2275 at 89bd9fbb. One canonical rule rejects the current owner before MFA or transactions; real API and settings return a clear 400 with no writes or success audit. API failure mapping calls the domain service directly. All 65 focused Node and three real Postgres cases passed; seven isolated mutations failed and were restored. Full local CI passed 4,989 Vitest and 22 Bun tests; quality, e2e, bundle and both Railway checks passed on 48ae34a0. Deployed functional verification and promotion remain.
- Root cause: The canonical writer promoted and demoted the same membership when both user IDs matched. The API checked a top-level error on a wrapped form response and could audit a failed transfer as successful.
- Resolution: Verify self rejection and distinct-member transfers through API and workspace settings on deployed dev. Verify owner roles, MFA and failed-transfer audit behavior, then promote before closure.
- Look in: `app/lib/workspace-members-db.server.ts`, `app/lib/platform-workspace.server.ts`, `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts`, `app/routes/api+/workspaces+/$workspaceId/transfer-ownership.action.server.ts`, `app/routes/workspaces+/$id/settings.action.server.ts`
- Existing tests: test/workspace-ownership-transfer.test.ts (real API/form, shared service, error/audit, MFA and owner-role controls); test/integration-db/workspace-ownership-transfer.test.ts (real distinct rows, self rejection, workspace isolation and rollback); Existing workspace membership, settings RBAC, form-helper and OpenAPI controls
- Missing tests: Deployed ownership-transfer verification before promotion.
- Done when: The canonical service rejects equal owner IDs before MFA or a transaction.; API and product self transfers return a clear error and leave ownership unchanged.; Session identity, owner authorization and distinct-target MFA remain enforced.; A valid transfer promotes the distinct member and demotes the previous owner only in its workspace.; A failed transfer cannot return API success or record a success audit.; Deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify deployed self, distinct-target and failed-transfer behavior, then promote and close.

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

### [#2130](https://github.com/chester-hill-solutions/callcaster/issues/2130) Validate ACD credentials before claiming and release failed offers
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-03
- Validated credentials are reused and agent-call setup failures release the exact offer; deployed configuration, release and retry checks remain.
- Current behavior: Merged to dev in PR #2273 at dff1ac66. Validated credentials are reused, call URL setup runs before a claim, and SDK setup/create failures release the exact offer with actionable context. All 33 focused Node and three real Postgres cases passed; six isolated mutations failed and were restored. Full local CI passed 4,952 Vitest and 22 Bun tests; quality, e2e, bundle and both Railway checks passed on 9960d86e. Deployed functional verification and promotion remain.
- Root cause: Initial missing credentials were already rejected during signature validation, but the second credential read after claim could leave an undialled offer. SDK loading/construction and URL configuration also happened outside or before the call-start cleanup boundary.
- Resolution: Verify missing configuration, failed agent-call setup, release state and bounded retries on deployed dev, then promote before closure. No new readiness subsystem or historical migration changes are required.
- Look in: `app/lib/acd/acd-router.server.ts`, `app/lib/db-rpc.server.ts`, `client/migrations/20260731130000_create_acd_inbound_queue_functions.sql`
- Existing tests: test/acd-offer-start.test.ts (credential reuse, initial rejection, configuration before claim, SDK/create failure, exact release, log context and retry/active controls); test/integration-db/acd-offer-cleanup.test.ts (real SDK setup error and actual release RPC: availability, accepted-entry and missing-entry controls); test/acd-router.test.ts, test/acd-router-route.test.ts and test/acd-router-subroutes.test.ts (existing ACD, signature and stale-sweep controls)
- Missing tests: Deployed configuration, failed setup, release and retry behavior before promotion.
- Done when: Missing credentials or required call URL configuration cannot create a new offer.; Validated credentials are reused; failed SDK setup or create releases the exact offered entry.; Actual release makes its agent available while accepted calls and other-workspace offers remain intact.; Logs identify the affected context without credentials; existing signatures, limits, active-entry and stale-sweep controls pass.; Deployed verification and promotion are complete before closure.
- Tracker: Source fix is in this change. Verify deployed ACD behavior after merge, then promote and close.

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

### [#2095](https://github.com/chester-hill-solutions/callcaster/issues/2095) "Leave Campaign" does not leave the campaign in predictive mode — the conference and the dialer keep running and real calls keep being placed
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Predictive Leave waits for a confirmed conference stop and preserves the queue; deployed calling verification remains.
- Current behavior: PR #2257 implements #2095: Leave waits for the server stop, keeps the local device on failure and omits queue reset. The endpoint finds the current user's idle conferences and reports completion failures. All 57 focused UI and server cases passed; restoring the old Leave handler failed four regressions, and restoring the old endpoint failed twelve regressions with five controls passing.
- Resolution: Verify predictive Leave on deployed dev with browser and phone devices, pending calls and an idle conference. Confirm that the next turn stops, failed stops permit retry, other users remain connected and live Leave keeps its behavior. Promote the tested fix before closing.
- Look in: `app/components/call/CallScreen.Layout.tsx`, `app/lib/callscreenActions.ts`, `app/routes/api+/auto-dial/end.action.server.ts`, `app/lib/auto-dial.server.ts`, `test/ui/call-screen-leave.test.tsx`, `test/auto-dial-end.route.test.ts`
- Existing tests: test/ui/call-screen-leave.test.tsx (seven cases using the real conference-end helper); test/ui/callscreenActions.test.ts (server confirmation before agent hangup/state clearing); test/auto-dial-end.route.test.ts (completion failures, idle discovery, explicit target, other-user rejection and SID/name deduplication); test/auto-dial.server.test.ts (no claim, outreach attempt or call after the conference ended)
- Missing tests: Deployed browser/phone calling verification, including delayed and failed conference completion.
- Done when: With `campaign.dial_type === "predictive"`, clicking "Leave Campaign" posts `/api/auto-dial/end` and completes the conference.; No `DELETE /api/queues` requeue is issued when the campaign is being left in predictive mode.; The dialer stops placing calls within one turn after leave.; A non-predictive (live) campaign's Leave behaviour is unchanged.; The control is confirmed before it fires (see the related UX issue).
- Tracker: The source fix is in PR #2257. This board update travels with that fix; after merge, verify on deployed dev and close after production promotion. Do not start a duplicate fix.

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

### [#2098](https://github.com/chester-hill-solutions/callcaster/issues/2098) The auth:register idempotency scope is global, so a replay on a shared Idempotency-Key returns another caller's live access and refresh tokens
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-03
- Signup responses are not cached or replayed on dev; deployed verification remains.
- Current behavior: PR #2252 merged to dev as 163884a4. Registration no longer uses the replay store. Seven route tests pass; restoring the old route fails all four replay regression cases.
- Resolution: Verify registration success, validation, rate limits and absence of response replay on deployed dev. The remaining replay namespaces are user-scoped workspace creation and authorized workspace-scoped billing checkout. Promote the tested fix before closing.
- Look in: `app/routes/api+/auth/register.action.server.ts:16`, `app/lib/platform-idempotency.server.ts:83`, `app/lib/platform-auth.server.ts:99`, `app/lib/auth.server.ts:80`, `app/routes/api+/auth/register.action.server.ts:6,10,16`, `app/lib/platform-idempotency.server.ts:54-59,240+`, `app/lib/openapi-platform.ts:19-27`, `app/lib/auth.server.ts (`resolveBearerSessionUser`)`, `every other `withIdempotency(` call site (grep)`
- Existing tests: test/api-auth-register.route.test.ts (seven route cases, real replay store and rate limiter); test/platform-api.test.ts (public auth API contract)
- Missing tests: Confirm the registration behavior on the deployed dev environment before promotion.
- Done when: Two callers using the same key with different emails never share session tokens or cookies.; A repeated request with the same key and email does not receive a cached session; existing-account handling still applies.; A previously stored auth:register response is not served by registration.; Registration success, validation, rate limits and provider failure retain their existing behavior.; OpenAPI and human docs state that registration does not replay session responses.; The remaining replay call sites are scoped to the verified user for workspace creation and to the authorized workspace for billing checkout.
- Tracker: The source fix is on dev in PR #2252. Verify on the deployed dev environment; close after production promotion. Do not repeat this fix.

### [#2116](https://github.com/chester-hill-solutions/callcaster/issues/2116) Verify the disabled-workspace billing split and continued number release
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- Implemented in PR #2165 on dev. Disabled workspaces receive no rental debit or sync/reconcile fanout. Number release keeps running.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The disabled-workspace billing split is complete on dev. Fanout skips disabled workspaces by default; rental billing still runs the release ladder and suppresses debits.
- Resolution: Verify the disabled workspace case on the review environment, then promote the existing change.
- Look in: `app/lib/cron-workspace-fanout.server.ts:92`, `app/lib/worker/handlers/cron.server.ts:193`, `app/lib/number-rental-billing.server.ts:435`, `test/cron-workspace-fanout.server.test.ts:1`, `app/lib/worker/handlers/cron.server.ts:64,121,167,190-225`, `app/lib/cron-workspace-fanout.server.ts`, `app/lib/database/workspace.server.ts (the `disabled` column and the sibling sweep that filters it)`
- Existing tests: test/cron-workspace-fanout.server.test.ts (new, 7 tests: skip + count, positive control, mixed sweep, includeDisabled opt-in, no credential read for a disabled workspace, undefined-disabled treated as enabled, skipped-not-failed); test/number-rental-billing.server.test.ts (new describe block, 6 tests: no charge when disabled with a healthy balance, enabled control still charges, no balance read, release still happens, no unsuspend without a charge, fail-open when the workspace lookup throws); test/worker-cron-handlers.server.test.ts (3 new tests asserting the coordinator passes includeDisabled: true for number_rental_billing and omits it for billing_reconcile and twilio_open_sync)
- Missing tests: Runtime verification remains; source and tests implement the decided behavior.
- Done when: DONE: a disabled workspace receives no number_rental_billing debit and no billing_reconcile or twilio_open_sync run. Kill-check run: inverting the fanout guard turns 4 tests red, inverting billingEnabled turns 4 red, setting includeDisabled: false turns 2 red.; DONE: the fanout summary counts the workspace as `skipped` and logs `<job>.fanout_skipped_disabled` with the workspaceId.; DONE: an enabled workspace is unaffected (positive control asserted in all three test files).; DONE: the decided meaning of `disabled` is recorded on this issue and in the runCronWorkspaceFanout doc comment.; DONE: the release half keeps running, so no number is stranded by the suspension itself.
- Tracker: Move to Verify and close. Do not implement the original single fanout guard. Related PR evidence: #2165. A PR reference alone does not prove deployed behavior.

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

### [#2049](https://github.com/chester-hill-solutions/callcaster/issues/2049) Verify provider send-time capture and bounded backfill on the review environment
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-10-02
- PR #2055 implements provider date_sent capture and bounded backfill on dev. Move to runtime verification.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. Provider send-time capture is implemented: open rows and bounded untimed non-open rows are processed; first-write-wins is enforced at the SQL update. Export visibility remains a separate follow-up.
- Root cause: The original omission is fixed in PR #2055: the sweep persists provider dateSent, selects bounded untimed non-open rows, and the database update preserves the first stored time.
- Resolution: Verify real provider capture and record API/DB cost. Keep separate request/send-time export work with #1752.
- Look in: `app/lib/twilio-open-sync.server.ts:295`, `app/lib/twilio-open-sync.server.ts:411`, `app/lib/message-db.server.ts:275`, `test/twilio-open-sync.server.test.ts:228`, `scripts/e2e/bootstrap-compose-db.mjs:89`, `app/lib/twilio-open-sync.server.ts:44,49,233-319`, `app/lib/message-db.server.ts:202-249`, `app/lib/worker/job-params.server.ts:52-56`, `app/lib/worker/handlers/cron.server.ts:73-107`, `app/db/schema.ts:390-420`, `app/lib/campaign-export.server.ts`
- Existing tests: test/twilio-open-sync.server.test.ts; test/message-db.server.test.ts; test/sms-status-webhook.test.ts
- Missing tests: No real capture-rate/cost measurement performed here; unit tests do not prove deployed historical data is filled.
- Done when: Message row carries the provider-reported date_sent after the sweep runs; Messages that settle before any sweep observed them still receive a date_sent; A message with no provider dateSent is abandoned after the age bound, not re-selected forever; date_sent is never overwritten once written and never inferred from date_created; Backfill selection is bounded, self-limiting, and its cost is measured; Record provider capture/backfill cost. Separate request/send-time export presentation stays tracked by #1752.
- Tracker: Verify and close after provider/runtime cost checks. Do not repeat the write/backfill implementation. Related PR evidence: #2055. A PR reference alone does not prove deployed behavior.

### [#2040](https://github.com/chester-hill-solutions/callcaster/issues/2040) Verify the SMS contact creation fix in the review environment
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: business-logic · Assignee: @sai-sy · Updated: 2026-10-02
- The reported SMS contact creation defects are addressed in current source: workspace_id is posted, blank audience is skipped, and the sheet waits for a successful response.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. PR #2070 fixes the posted workspace field, empty-audience conversion, and premature sheet close.
- Root cause: The original form/endpoint tenancy mismatch, blank-audience conversion, and premature sheet close are fixed by PR #2070. Browser persistence and failure-retention checks remain.
- Resolution: Verify both successful creation and error retention in the review environment.
- Look in: `app/components/contact/ContactForm.tsx:107`, `app/routes/api+/contacts.action.server.ts:51`, `app/components/sms-ui/ChatAddContactDialog.tsx:74`, `app/components/contact/ContactForm.tsx:45-51 (Form action/method/navigate) and :107 (hidden input name)`, `app/components/sms-ui/ChatAddContactDialog.tsx:62-69 (submit, navigate:false, unconditional setDialog(false))`, `app/routes/api+/contacts.action.server.ts:35-40 (reads data.workspace_id, 400 on empty)`, `app/lib/request-utils.server.ts:10-20 (parseRequestData does no field-name mapping)`, `app/components/queue/ContactSearchDialog.tsx:65 (the correct workspace_id caller, and the working pattern to copy)`
- Existing tests: test/contacts-action.server.test.ts (JSON tenancy checks; no Messages form round trip); test/ui/components-chats-contact.test.tsx (ContactForm rendering only)
- Missing tests: Source fix is present, but test/contacts-action.server.test.ts covers JSON tenancy and the UI smoke test only renders ContactForm. No full dialog success/failure test was found.
- Done when: Saving a contact from the Messages sheet creates exactly one contact row; The POST carries the tenancy field the endpoint reads, agreed in one place rather than two; A rejected save keeps the sheet open with the typed values and shows the reason; A successful save closes the sheet after the create response.; One click produces one request, verified by a test that counts requests
- Tracker: Verify and close after browser persistence/error checks; the original root-cause description is stale. Related PR evidence: #2070. A PR reference alone does not prove deployed behavior.

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

### [#2154](https://github.com/chester-hill-solutions/callcaster/issues/2154) splitMessageCampaign is non-atomic across clone, enqueue and dequeue, so a mid-run failure leaves a partially split campaign
- Verdict: **Verify and close** · Size: S · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
- `splitMessageCampaign` cloned the campaign, distributed the queued contacts across the clones and dequeued the source in three separate steps. A failure between them left contacts in two campaigns at once, and the source un-dequeued, so the next dispatch dialled them twice. Fixed: all three phases now run in one transaction.
- Current behavior: All three phases commit together. A failure in any phase rolls the whole split back, leaving the source exactly as it was.
- Resolution: DONE. Wrapped in `withAppCurrentUser` rather than `db.transaction` — the dequeue path calls SECURITY DEFINER plpgsql that reads `app.current_user_id`, so the setting must be transaction-local or it leaks between requests on the pooled connection. The SSE publish is **deferred to after the commit** rather than merely moved inside the transaction: an emit issued pre-commit tells a subscriber about rows a rollback erases, and never tells it the change was undone. Two other points from the original record dissolved or moved: *idempotency on retry* is now unnecessary, because with atomicity there is no partial state for a retry to double against; and the *clone roll-up* question is a product decision about how clones are presented, not a defect, and is not part of this fix. The in-flight-send question in point 3 became a separate issue (#2208) once it turned out the split has no in-flight marker to condition on.
- Look in: `app/lib/database/campaign.server.ts (splitMessageCampaign, now in withAppCurrentUser)`, `app/lib/campaign-queue-db.server.ts (DeferredEmit / QueueWriteExecutor seam)`, `app/lib/campaign-queue-updates.server.ts (created by #2207, the prerequisite refactor)`, `test/integration-db/split-campaign-atomic.test.ts (six real-database tests, two kill-checks)`
- Existing tests: test/integration-db/split-campaign-atomic.test.ts — six tests against a real Postgres. The unit tier mocks the db client wholesale, so nothing there would notice if the withAppCurrentUser call were deleted; that is why this is the integration tier.
- Done when: Met: a failure in the dequeue phase leaves the campaign exactly as it was (kill-check executed — removing withAppCurrentUser turns exactly this test red).; Met: nothing is published to subscribers unless the split commits (kill-check executed — publishing inline turns exactly this test red).; Met: contacts are distributed across the clones with the requested segment count — no test asserted this before.; NOT DONE, and deliberately: the in-flight-send case. It is #2208, and it is severe.
- Tracker: Two kill-checks, each failing exactly one test, re-confirmed after rebasing onto the #2207 refactor. One trap worth carrying: the first version of the failure test used `vi.spyOn` on `dequeueQueueEntry` and came back GREEN without ever failing, because splitMessageCampaign holds a direct ESM binding and a namespace spy does not intercept it. The failure is induced by a database trigger instead. A green test that never exercised its subject is worse than no test.

### [#2133](https://github.com/chester-hill-solutions/callcaster/issues/2133) The workspace SSE event stream admits any workspace API key with no scope, though the surface and the public OpenAPI both declare it session-only
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
- The workspace event stream wires only `dataPlaneMiddleware`, which admits any key bound to the workspace regardless of scope. The loader adds no capability gate. A key minted with **zero** scopes — or with only `campaigns.read` — can open the long-lived SSE stream and read every workspace event, which the route's own comment describes as including verbatim call transcripts. It is also an unbounded connection multiplier: each connection registers a `directPool.listen` subscription and is held open indefinitely. The published contract says this endpoint is **session-only**, so neither the operator nor the integrator knows the key works.
- Current behavior: Two defects compound: an unscoped privileged stream, and a surface guard that failed to fire on a declared/implemented mismatch. The second is why the first is invisible.
- Resolution: 1. Gate the loader on a capability: `dataPlaneCapabilityAuth("audit.read")` — the event log is the same class of privileged audit surface as `/audit-events`, which already requires it. 2. If a key must be allowed, require `requireDataPlaneWorkspaceUser` **and** declare `apiKeyOrSession` in the annotation, so the spec matches. 3. **Fix `scripts/lib/api-surface-derive.mjs:155-159`** and find out why `check:api:surface:check` accepted a declared `"session"` on a route whose context admits `apiKeyOrSession`. That guard gap is its own finding — a surface check that cannot detect an auth-class mismatch is not a check. 4. Bound concurrent SSE connections per workspace so a key cannot hold N open streams.
- Look in: `app/routes/api+/workspaces+/$workspaceId.middleware.server.ts:4`, `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts:75,173`, `scripts/lib/api-surface-derive.mjs:155-159`, `scripts/check-api-surface-coverage.ts`, `app/lib/api-surface-annotations.ts:168`, `app/lib/data-plane-route.server.ts:6-18`
- Missing tests: Zero-scope key refused (kill-check).; `campaigns.read`-only key refused.; Session with `audit.read` allowed (positive control).; A fixture where the declared auth class disagrees with the implemented one makes `check:api:surface:check` fail (kill-check).
- Done when: A key with zero scopes is refused on the events stream (kill-check: remove the capability gate and confirm the test goes red).; A key with only `campaigns.read` is refused.; A session with `audit.read` is allowed (positive control).; The annotation and the published spec agree with the implemented auth class, and `check:api:surface:check` **fails** when they do not — with a fixture test proving the guard can fail.
- Tracker: Fixed and merged as PR #2203 (c0e956239). The workspace SSE stream used getDataPlaneRouteContext, which only checks that the actor belongs to the workspace - so it admitted ANY workspace API key, including one minted with ZERO scopes, onto a long-lived connection carrying every workspace event, verbatim call transcripts among them. The published surface said 'session', so neither an operator auditing key scopes nor an integrator reading the spec had reason to look there. Now gated on audit.read, the same capability /audit-events already requires; the role-capability matrix grants it to OWNERS alone, so a member session is refused too - a control on the role axis, not only the scope axis. FIVE behavioural tests: zero-scope key refused, campaigns.read-only key refused, member session refused, and TWO POSITIVE CONTROLS (audit.read key allowed, owner session allowed) so the gate cannot pass by denying everything. IMPORTANT CORRECTION TO THE ISSUE'S DIAGNOSIS: it claims the surface guard 'accepted a declared session on a route whose context admits apiKeyOrSession'. It did not - the guard was CONSISTENT, the input it was consistent with was wrong. api-surface-derive.mjs listed allows:['session','workspaceAdmin'] for getDataPlaneRouteContext, on a comment claiming the preamble 'requires userId, so session-or-stronger'. It does NOT require userId - it only checks the workspace matches. So a declared authClass 'session' was validated against an allows list that itself asserted session was possible, and passed. A GUARD CANNOT DETECT A LIE ABOUT A HELPER IT BELIEVES. Corrected to permit apiKeyOrSession, and the misleading 'requires userId' claim removed from the comment - a comment asserting a guarantee the helper does not provide is worse than none, because it is what the next author trusts. authClass 'session' deleted from the annotation: dataPlaneCapabilityAuth derives the class authoritatively and the guard rejects a declaration alongside one, the same pattern as the audit-events sibling. Regenerated api-surface-generated.ts, both OpenAPI specs, and the inventory. Two test-harness traps worth keeping: the existing route test mocked @/lib/workspace-membership.server and defaulted every membership to 'member', but the gate resolves through @/lib/database/workspace.server - a DIFFERENT module - and audit.read is owner-only, so 'member' is refused before the stream opens; and the @/server/admin-db mock must be a LITERAL rather than an importOriginal spread, because the real module is built on `db` from @/server/db which that test mocks down to directPool alone, so spreading it evaluates the original and fails - while check:test-mocks then demands the spread anyway. Correct answer: literal for that module, spread for @/lib/database/workspace.server, which has no such dependency. Also caught a bug in my own tests: the two 200-path tests used asRouteResponse, which drains the body, and a 200 on this route is a LIVE STREAM THAT NEVER ENDS, so they hung for 5s and failed - they now assert status and content-type without reading the body. NOT done: the issue's step 4, bounding concurrent SSE connections per workspace, is a resource-limit change whose own failure mode (what happens to the n-th legitimate dashboard when the cap is hit) deserves its own PR. ci:local exit 0, node 444/444 files 3577 tests, ui 151/151 924 tests. The two non-null-assertion warnings in workspace-events.route.test.ts are pre-existing, verified against dev.

### [#2143](https://github.com/chester-hill-solutions/callcaster/issues/2143) syncWorkspaceA2pStatus seeds both statuses from the same stored value and reverts to the old value, so a stale approved A2P state survives a brand re-review
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
- The A2P status sync seeds the brand and campaign status from the **aggregate** stored status rather than from the provider. A workspace whose A2P was `approved` and whose brand re-enters review keeps reading `approved`, and the sync writes that back while bumping `lastSyncedAt` — so the record looks freshly verified and the SMS send gate stays open.
- Current behavior: A per-resource status is never seeded from an aggregate status. The aggregate is a *derived* value; deriving from it inverts the direction of truth and makes the state monotonic — it can only move toward `approved`, never away.
- Resolution: Never seed a per-resource status from the aggregate. Track which resources were actually fetched and compute the aggregate from the **authoritative** per-resource values, defaulting an unfetched resource to the most conservative value that keeps the gate closed: const brandStatus = brandSid ? await fetchBrand() : "pending"; const campaignStatus = campaignSid ? await fetchCampaign() : "pending"; const mergedStatus = brandStatus === "approved" && campaignStatus === "approved" ? "approved" : (brandStatus === "rejected" || campaignStatus === "rejected") ? "rejected" : "in_review"; and delete the `?? onboarding.a2p10dlc.status` fallback. Add a test per transition direction — `approved → in_review` and `approved → rejected` are the two that fail today.
- Look in: `app/lib/twilio-a2p.server.ts (`syncWorkspaceA2pStatus`, `mapBrandStatus` at line 19, lines 71-80)`, `app/lib/messaging-onboarding/predicates.ts:380-390`, `app/routes/api+/twilio/trusthub/status.action.server.ts:62`, `app/lib/twilio-a2p-status-sync.server.ts`
- Missing tests: `approved → in_review` (kill-check).; `approved → rejected`.; `in_review → approved` with both resources fetched (positive control).; An unfetched resource never yields `approved`.
- Done when: `approved → in_review` demotes the stored status (kill-check: restore the seed and confirm the test goes red).; `approved → rejected` demotes.; `in_review → approved` promotes when **both** resources are fetched as approved.; An unfetched resource never contributes `approved`.; The send gate closes on a re-review.
- Tracker: Fixed and merged as PR #2202. syncWorkspaceA2pStatus seeded BOTH per-resource statuses from the stored AGGREGATE, then merged back to the aggregate whenever the two disagreed. The aggregate is a derived value, so deriving from it inverts the direction of truth and makes the state MONOTONIC - it can only ever move toward approved. Verified against the real code before changing it: brand re-enters review with no campaignSid -> approved (want in_review); brand re-enters review with campaign still approved -> approved (want in_review); brand moving to provisioning (mapBrandStatus's default) -> approved (want in_review); brand rejected -> rejected (ALREADY CORRECT). Three of four wrong. Rejection already worked because it short-circuits on either side of the ||, which is why this survived review: the one direction that works is the one a test would naturally check. Fix: mergeA2pStatus extracted as a pure function over {fetched, exists} per resource, separating two states the old code conflated. DOES NOT EXIST is ignored - a brand-only workspace has no campaign to wait for, so it promotes on the brand alone. EXISTS BUT WAS NOT READ is an unknown, never an approval, and counts as in_review which keeps the gate shut. The second case is the consequential one and it is what the issue's own suggested fix got WRONG: defaulting every unfetched resource to a blocking value would permanently block brand-only workspaces, which would never be promoted. If NOTHING was read the sync returns early without writing, so a transient network error cannot close a live workspace's gate, and lastSyncedAt is not bumped so the record does not look freshly verified. 20 tests, six kill-checks each failing a specific one: restore the seed from the aggregate (the original defect) fails the all-fetches-failed test; an unread resource defaults to approved fails the blocks-a-promotion test; collapse absent into unread fails the contradiction test; guess when nothing authoritative was read fails the all-fetches-failed test; drop rejection precedence fails 3; no resources at all counts as approved fails the empty-resources test. WORTH RECORDING: one kill-check was a NO-OP and I only found out by enumerating the truth table - collapsing `exists ? fetched : null` into `fetched ?? (exists ? ... : null)` is not a semantic change at all, since the two differ only when exists is false AND fetched is non-null, which is unreachable because a caller cannot have fetched a resource that does not exist. My test 'passed' against it for that reason. The test that actually kills it asks a question I had not asked: what does a caller reporting a read for a resource it also reports ABSENT mean? The conservative answer is to drop the read, and that is the branch ordering the production code now has. Left alone deliberately: a2p_approved passing on approved OR live (predicates.ts:380-390) is a separate question from the sync's direction of truth and changing it would alter which workspaces can send at all. ci:local exit 0, node 444/444 files 3586 tests, ui 151/151 924 tests.

### [#2146](https://github.com/chester-hill-solutions/callcaster/issues/2146) The IVR option matcher reads only option.value, so a documented-format script's declared next routes never match
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
- PR #2199 is merged to dev. Option matching, labels and Gather configuration use the shared ivr-option-value helper, with content as a fallback when value is blank.
- Current behavior: The documented content/next option shape is supported on the read path. Launch-time handling of unmatchable options still needs the product decision recorded in this issue.
- Resolution: Verify documented-format routing and exported labels on dev. Decide whether launch validation should reject unmatchable options or normalize them before storage. Do not repeat the shared-reader fix.
- Look in: `the IVR response route's option matcher (`findNextStep`) and `findNextBlock` at lines 86-89`, `app/lib/ivr-results.ts:114-118 (`resolveIvrAnswerLabel`)`, `app/lib/ivr-script-validation.ts (`resolveNext`, `script_routing_invalid`)`, `app/lib/create-with-script.server.ts`, `docs/script-json-format.md`
- Existing tests: test/ivr-option-value.test.ts; test/ivr-gather.test.ts
- Missing tests: Launch validation exercises the option matcher after the normalization or rejection decision.
- Done when: A documented-format script with `content`/`next` options routes correctly on a key press (kill-check: remove the normalisation and confirm the test goes red).; The Results screen and the CSV export show the option label, not the raw digit.; A script whose options have no recognisable value is either normalised or rejected with a clear message — decided and tested.; The launch gate can detect a script whose options cannot be matched (a validation that exercises the matcher).
- Tracker: Fixed and merged as PR #2199 (d3d6e1bfa). It was FOUR value-only readers, not one: findMatchedOption in both response routes (the linear-chain fall-through the issue named), resolveIvrAnswerLabel in ivr-results.ts (the raw DTMF digit), ivrStepGathersSpeech (a vx-any catch-all invisible, so no speech input gathered), and ivrSingleKeyDigits (reads empty, so never one-key). Only ivrSpeechHints was correct - it already read label AND content. All four now go through app/lib/ivr-option-value.ts, and BOTH private copies of the matcher are deleted: the two response routes had near-identical copies that had already drifted. IvrOptionShape in ivr-results.ts and IvrOption in ivr-gather.server.ts are now aliases of the shared IvrOptionLike rather than hand-copied declarations, which is how the two shapes came to diverge. Value and label are ordered differently ON PURPOSE: ivrOptionValue takes value first then content (the digit is what a caller pressed - falling back to text first would match 'Yes' when they pressed '1'), while ivrOptionLabel takes label first then content (a label is what the author wrote to be shown). A blank or whitespace-only value falls through to the text, because that is what a form submits for an unfilled field and treating it as authoritative would make the option unmatchable. 25 tests written against the DOCUMENTED shape - a test written against value would have passed before the fix and proved nothing. Four kill-checks: matcher reverts to value-only (the original defect) fails 7 tests, label order inverted fails 2, vx-any loses its length gate fails 1, gather speech gate reverts to value-only fails 1. Worth recording: one kill-check PASSED when it should have failed, twice - the first ivrSingleKeyDigits test used content 'Yes', which is three characters, so the answer is undefined under both readers and the test could not distinguish them. The real disagreement is a documented option whose text IS a single key, which is what an author writes when the option doubles as the digit; that case is now tested and the mutation fails it. NOT done: resolution step 4, a launch-gate validation that exercises the matcher. It changes what the API ACCEPTS, so it needs the decision the issue explicitly leaves open - normalise on the way in, or reject a script whose options cannot be matched - which is a product decision, not a read-path fix. Asked on the issue. ci:local exit 0, node 442/442 files 3560 tests, ui 151/151 924 tests. Note test/ivr.route.test.ts and one case in test/inbound-ivr-block.route.test.ts fail locally for want of DATABASE_URL - verified pre-existing on clean dev, not introduced here.

### [#2187](https://github.com/chester-hill-solutions/callcaster/issues/2187) One contact's preparation failure aborts the whole campaign SMS batch
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-29
- handleMember forwards handleClaimedMember and re-throws, and runPacedSendBatches collects the batch with Promise.all, so one row's preparation failure rejects the whole dispatchCampaignSmsBatch and abandons every other row in it. Trigger: getOrLookupLineType throws — a transient connection reset, a statement timeout, or pool exhaustion under exactly the load #2185 addresses. Verified by making the first three lookups throw in a 25-row batch: the call rejects with 'lookup blew up' instead of returning dispatched or deferred_send_window. Not data loss — unstarted rows are never dequeued and a later tick retries them — but a whole batch of prepared work is discarded for one bad contact.
- Tracker: Fixed and merged as PR #2198 (a3ab6cf0e). The send path had a per-row failure boundary (sendSingleCampaignSms rejects, and its .then(_,onError) releases the credit, counts the failure, records the attempt and returns a per-contact result); preparation had none, so a throw in any of its four database round trips propagated into await Promise.all in runPacedSendBatches and rejected the whole batch. Blast radius, and the third is the one that mattered: batch siblings' responses were discarded even though they had already sent and been counted; every remaining batch was abandoned; and rpcFailExhaustedCampaignQueueContacts was skipped, so the failed row never dead-lettered, stayed eligible, failed again on the next run, and the campaign could not drain. That is a permanent outage from one bad contact, and it is invisible in the logs, which show a successful dispatch. Fix is three parts: a row boundary in handleMember wrapping the whole body (the await on its last statement is load-bearing, because the phone-claim handler rethrows and returning its promise would put the rejection outside the try); the reservation released wherever a row fails after reserving (the release previously lived ONLY in the send's rejection handler, so a SYNCHRONOUS throw out of sendSingleCampaignSms - invisible to .then - kept the credits for the rest of the dispatch, so failRow now takes the cost to release and a new throw site cannot forget it); and Promise.allSettled so no future row path can abort a campaign. Six tests, four kill-checks each failing exactly one: remove the row boundary -> the dead-letter test; allSettled back to all -> the recorder-down test; drop the post-prepare release -> the credit-release test; failRow stops recording -> the dead-letter test. Note removing the row boundary fails ONLY the dead-letter test, because the loop backstop alone already keeps the batch alive - the boundary earns its place by RECORDING the attempt, which is what lets the campaign drain. Read that as the general shape: a per-row boundary usually earns its keep through a side effect (a recorded failure, a released resource), not through preventing the cascade, which something else prevents too. The recorder-down test caught a double-count in the fix itself: failRow counted before awaiting the record, so a failed record made the loop count the same row again (failed:2 for one contact); counting after the await makes the two mutually exclusive, and that test is also what makes the loop backstop reachable rather than dead code, since recording a failure is itself a database write against the same database that has just failed. The file-size guard forced an extraction rather than a baseline: the credit budget and start pacer are pure, dependency-free and imported by nothing else, so they moved to campaign-sms-dispatch-primitives.server.ts, taking the file 860 -> 784. NOT fixed, deliberately: when the record write itself fails the row stays queued and eligible, because nothing is recorded to dead-letter it on - retrying is honest but a persistently broken recorder keeps that row alive, and that deserves its own issue rather than a guess here. ci:local exit 0, node 442/442 files 3560 tests, ui 151/151 924 tests.

### [#2156](https://github.com/chester-hill-solutions/callcaster/issues/2156) useQueue.updateQueue calls setNextRecipient and setCallDuration from inside a setQueue updater
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-29
- A `useState`/`useReducer` updater must be pure. React may invoke it more than once (deliberately under StrictMode, and it may replay or discard a result in concurrent rendering). `useQueue.updateQueue` nests `setNextRecipient(...)` and `setCallDuration(0)` inside `setQueue`'s updater — a state update during another state update.
- Current behavior: Two defects: an impure updater, and a guard whose condition cannot be true. The dead guard means the intended behaviour is also not happening — the branch that was supposed to set the newly assigned contact never runs.
- Resolution: 1. Make the updater pure. Compute `nextUncontacted` / `nextRecipient` from the same `currentQueue` inside it and return a `{ queue, nextRecipient, resetDuration }` tuple via a single `useReducer`, **or** hoist the `setNextRecipient`/`setCallDuration` calls out of `setQueue` and read the current queue from a ref. 2. Fix or delete the dead guard. If the intent is "advance to the newly assigned contact", write the condition that actually expresses it; if the intent is gone, remove it so the next reader is not misled. 3. The predictive-FSM bridge in the same area re-dispatches its transition on every queue change for a related reason (it depends on `queue` identity) — fix both together, or the effect dependency churn remains.
- Look in: `app/hooks/call/useQueue.ts:88-89,157`, `the predictive FSM bridge in the same area`, `app/hooks/call/useCallScreen.ts`
- Missing tests: StrictMode double-render yields an identical state (kill-check).; The next recipient advances to the newly assigned contact.; The call duration resets on a contact change.
- Done when: `updateQueue` contains no state update inside a state updater (kill-check: restore the nesting and confirm a StrictMode double-invoke test goes red).; A StrictMode double-render produces the same final state as a single render.; The newly assigned contact becomes the next recipient when that is the intent (the dead-guard fix).; A contact change resets the call duration.
- Tracker: Fixed and merged as PR #2196 (24948429e). updateQueue now plans the next queue in a pure function and applies the state updates outside, so setQueue takes a value and never a function and the impure shape cannot return unnoticed. The issue's useReducer option was NOT viable: useCampaignQueueFlow types setQueue as Dispatch<SetStateAction<QueueItem[]>> and usePredictiveCallSync plus useCallScreen both hold setNextRecipient, so the hoisting option was used and both setter shapes are unchanged. The dead guard if (!nextRecipientRef.current) was DELETED, not fixed - it could essentially never fire, and where it could the queue[0] fallback already gave the same value, so removal is behaviour-preserving and a kill-check confirms it. The stated intent, advance to the newly assigned contact, never happened; implementing it would change which contact a live call screen points at mid-session, so it stays a product decision and is flagged in the code. queueRef needs both a synchronous write after planning (else two updates in one tick lose the first row's addition) and an effect re-syncing on commit (else an external setQueue from useCallScreen or useCampaignQueueFlow is ignored); each has a test that fails when removed. Verified: 10 tests, 4 kill-checks - nested update restored fails 4 tests, no synchronous write fails composition, no effect fails external setQueue, no advance fails the recipient test. Two traps recorded: the recipient-advance test PASSED against a mutation that deleted the advance, because nextRecipient=null falls back to queue[0] and the difference is only observable when the next uncontacted row is not first; and the pre-existing hooks-queue.test.tsx used id 'user-1', which is not a UUID, so every updateQueue call in it took the removal branch and the assignment path had no coverage at all. The predictive-FSM re-dispatch churn in usePredictiveCallSync is deliberately not touched - separate effect-dependency concern. ci:local exit 0, node 441/441, ui 151/151 with 924 tests up from 914, no new lint warnings.

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

### [#1896](https://github.com/chester-hill-solutions/callcaster/issues/1896) Design-system linting: retire the hand-rolled SaveBar token test
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-28
- Both linter PRs shipped on dev: ESLint 9 flat config in PR #1907 (c5ac39e2) and @shadcn/lint in PR #1908 (f561396f), neither in master. One acceptance item is unmet: the hand-rolled token test test/ui/components-shared-smoke.test.tsx:286 is still present.
- Current behavior: eslint.config.mjs registers @shadcn/lint; the SaveBar token smoke test still asserts bg-background / not bg-white.
- Root cause: The migration PRs covered the linter config but did not remove the now-redundant hand-rolled test.
- Resolution: Delete the 'uses design tokens rather than hardcoded colors' test from test/ui/components-shared-smoke.test.tsx and confirm check:lint-ratchet and the ratchet baseline are unchanged. Keep the component-variant tests.
- Look in: `test/ui/components-shared-smoke.test.tsx`, `eslint.config.mjs`, `scripts/check-lint-ratchet.mjs`, `scripts/baselines/lint-ratchet.json`
- Existing tests: test/ui/components-shared-smoke.test.tsx (remove line 286)
- Done when: ESLint 9 runs the same rule set with the ratchet baseline unchanged or lower (done on dev); @shadcn/lint rules enabled and ratcheted (done on dev); The hand-rolled token test is removed (outstanding)
- Tracker: Implemented on dev (PR #2027 bca2bc24): the hand-rolled SaveBar token test is gone and the ui-suite testTimeout is 20s to absorb route-hydration load. ESLint 9 + @shadcn/lint already shipped via #1907/#1908. Verify eslint runs clean and the save bar renders on the review env, then close.

### [#1728](https://github.com/chester-hill-solutions/callcaster/issues/1728) IVR: don't mark a campaign complete while calls are still in flight
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-28
- Confirmed defect. IVR dispatch dequeues each queue row right after Twilio calls.create (campaign-ivr-dispatch.server.ts:260-264) and completion fires whenever campaign_queue_has_pending_work is false, so the campaign flips to 'complete' while calls are still ringing. Product decision (2026-09-20): 'complete' means all calls settled, not all dials attempted.
- Current behavior: Campaign status turns 'complete' seconds after launch; the recipient's phone rings / the call arrives afterwards. The dequeue reason string 'IVR call completed' is factually wrong.
- Root cause: dequeued_at is written at dial time, not at call completion, while completion keys only off pending queue rows and never checks in-flight (non-terminal) calls.
- Resolution: Gate completion on no pending queue rows AND no non-terminal calls: teach try_complete_campaign_if_drained / continueOrCompleteDispatch to check for in-flight campaign calls, or defer the IVR dequeue to the terminal status callback in api+/ivr/status.action.server.ts (larger; needs a timeout sweep for missing callbacks). Update the existing 'dequeues on success' test that encodes the current behaviour.
- Look in: `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/lib/campaign-queue-completion.server.ts`, `app/lib/worker/handlers/campaign.server.ts`, `app/routes/api+/ivr/status.action.server.ts`, `drizzle/0000_baseline.sql`
- Existing tests: test/campaign-ivr-dispatch.test.ts; test/campaign-dispatch-worker.test.ts; test/ivr-status.route.test.ts; test/campaign-queue-throughput.integration.test.ts
- Missing tests: Campaign is not marked complete while it has a non-terminal call; A terminal status callback completes the campaign only after all calls settle; Replace the 'dequeues on success' assertion with acknowledgment-on-completion semantics
- Done when: Campaign status does not read 'complete' while any campaign call is still in flight; Completion happens after the last call reaches a terminal status; No stalled campaign when a status callback never arrives
- Tracker: Implemented on dev (PR #2028 061689af): campaign completion is gated on settled calls (campaign_has_unsettled_calls + try_complete_campaign_if_drained), the IVR terminal-status callback triggers completion and persists busy/canceled, and the dequeue reason wording is corrected. Integration + contract tests land with it. Verify on the review env (campaign completes after calls settle, incl. no-answer/busy), then close.

### [#2178](https://github.com/chester-hill-solutions/callcaster/issues/2178) call.date_created is declared text() but is timestamptz, so every date predicate needs a hand-written cast
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-28
- PR #2241 corrected all four call timestamps and the message timestamps in dev. The recording-repair workaround cast is removed.
- Resolution: Run the real-Postgres temporal guard and the recording-repair tests on dev. Verify the deployed schema before release. Track other tables under #2213.
- Look in: `app/db/schema.ts`, `app/lib/call-recording-repair.server.ts`, `test/integration-db/schema-type-drift.test.ts`
- Existing tests: test/integration-db/schema-type-drift.test.ts; test/call-recording-repair.server.test.ts
- Tracker: Code reviewed at dev@5b673c81. The original call.date_created text declaration is absent. Do not create a second implementation for this issue.

### [#2097](https://github.com/chester-hill-solutions/callcaster/issues/2097) PATCH /api/campaigns/:campaignId/queue never checks that the referenced audience or contacts belong to the caller's workspace
- Verdict: **Verify and close** · Size: M · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-09-28
- `patchCampaignQueueApi` proves the **campaign** is the caller's, then resolves `add_audience` / `add_contact_ids` against **any** id in the platform. The trigger stamps the attacker's workspace onto the resulting queue rows, so `GET /api/campaigns/:id/queue` then returns another tenant's contacts in full.
- Current behavior: `PATCH /api/campaigns/57/queue` with `{"add_audience": {"audience_id": "<ws-B audience>"}}` → the campaign is the attacker's → the audience is workspace B's → every B contact id is inserted into campaign 57's queue with `workspace = <attacker's workspace>` → `GET /api/campaigns/57/queue` returns B's contact records.
- Resolution: 1. Resolve the target ids through the caller's tenant client before enqueuing. For `add_audience`: `createTenantDb(workspaceId).audience.findFirst({ where: eq(audienceTable.id, body.audience_id) })` → 404 when it is not in the workspace. 2. For `add_contact_ids`: filter the id list to `tdb.contact` rows, or reject with a 400 naming the foreign ids. Do not enqueue a partial set silently. 3. Return the same uniform 404 the rest of the data plane uses for another tenant's resource, so the endpoint is not an existence oracle. 4. Sweep the other `api+` write endpoints for the same shape: a request that references a tenant-scoped id must resolve it through the tenant client. `check:route-membership` cannot catch this class — it checks the route, not the referenced ids — so say so in the issue and consider a helper the write paths must use.
- Look in: `app/routes/api+/campaigns/$campaignId/queue.action.server.ts:60-62`, `the `patchCampaignQueueApi` implementation (the `add_audience` / `add_contact_ids` branches)`, `app/lib/campaign-queue-search.server.ts:553-564`, `app/server/tenant-db.ts`, `app/db/workspace-scoped-tables.ts`
- Missing tests: `add_audience` with a foreign audience → 404, no rows enqueued (kill-check: drop the tenant lookup and confirm the test goes red).; `add_contact_ids` with a foreign contact → rejected, no rows enqueued.; A permitted-path positive control.
- Done when: `add_audience` with another workspace's `audience_id` returns 404 and enqueues nothing.; `add_contact_ids` with a foreign `contact_id` returns 404 (or a 400 naming it) and enqueues nothing.; A mixed list is handled explicitly: either all-or-nothing or a named rejection — documented and tested.; The permitted path (ids from the caller's own workspace) still enqueues, with a positive-control test.; Every `api+` write endpoint that accepts a tenant-scoped id has been swept and the sweep is recorded in the issue.
- Tracker: Fixed on dev by PR #2175 (07bd43d1), merged 2026-09-28, plus PR #2177 (13e7c502) which unified the guard. Verified on dev rather than assumed: app/lib/contacts/tenant-scope.server.ts:44 defines resolveContactsOwnedByWorkspace, app/lib/platform-data.server.ts imports it at line 70 and calls it at line 506 from the add_contact_ids branch of patchCampaignQueueApi, and test/campaign-queue-tenant-scope.test.ts plus test/contact-tenant-scope-unified.test.ts cover it. One deliberate behaviour change: the workspaces+ route now answers 404 where it answered 403, because a 403 or 400 naming foreign ids would confirm a workspace's contents exist. The record went stale because it predates the fix and the generator only prunes CLOSED issues; #2097 is still open, correctly, since a merge to dev is not a release. Left OPEN: what remains is a verification pass on the review environment, not code.

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

### [#1782](https://github.com/chester-hill-solutions/callcaster/issues/1782) Verify send-window boundary timing for voice campaigns on dev (#1351/#1352)
- Verdict: **Verify and close** · Labels: none · Assignee: none · Updated: 2026-09-27
- PR #1796 (0188cea8) now wakes waiting voice work at the next calling-hours boundary. The four deployed boundary checks requested by this issue remain pending.
- Current behavior: The waiting voice successor uses the next window opening; schedule-sweep ownership of waiting-to-running remains intact.
- Resolution: Collect deployed evidence for future start, exact open, mid-run close, and no premature completion. Preserve #1351/#1352 until that evidence is assessed.
- Look in: `app/lib/worker/handlers/campaign.server.ts`, `app/lib/campaign-schedule-sync.server.ts`
- Existing tests: test/campaign-dispatch-worker.test.ts
- Missing tests: DB rows plus screenshots or API results for all four deployed boundary cases.
- Tracker: Verification work remains; do not repeat the next-window scheduling patch from PR #1796.

### [#1794](https://github.com/chester-hill-solutions/callcaster/issues/1794) Campaign schedule sync can overwrite a concurrent pause or completion
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: @wra-sol · Updated: 2026-09-27
- PR #1797 (88f73343) made schedule writes conditional on the status read by the sweep. A new real-Postgres regression test covers pause and completion after candidate selection.
- Current behavior: A concurrent status change causes the guarded update to return no transition; a real-Postgres test verifies paused and complete states are preserved and no transition event is emitted.
- Resolution: Keep the issue open until this test is merged to dev and the guarded status transition is verified there.
- Look in: `app/lib/campaign-schedule-sync.server.ts`, `app/lib/campaign-ivr.server.ts`
- Existing tests: test/campaign-schedule-sync.server.test.ts (sweep orchestration with mocked status helper); test/integration-db/campaign-schedule-sync-status-race.test.ts (pause/completion interleaving against Postgres)
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#1791](https://github.com/chester-hill-solutions/callcaster/issues/1791) SMS dispatch continues sending after the campaign window closes mid-batch
- Verdict: **Verify and close** · Risk: high · Labels: none · Assignee: none · Updated: 2026-09-27
- PR #1796 (0188cea8) added campaign-window checks before provider requests, including after asynchronous preparation.
- Current behavior: When the campaign window closes mid-batch, new sends stop and unsent contacts remain queued.
- Resolution: Verify the closing-boundary behavior on dev without sending outside the test window.
- Look in: `app/lib/campaign-sms-dispatch.server.ts`
- Existing tests: test/campaign-sms-dispatch-window.test.ts
- Missing tests: Deployed closing-boundary verification.
- Tracker: Keep open until default-branch promotion. Verify the remaining acceptance criteria before closure; do not repeat the shipped fix.

### [#2005](https://github.com/chester-hill-solutions/callcaster/issues/2005) Quit This Workspace posts a self-leave that always 403s for the role it is shown to; remove the button and the self-leave path behind it
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-27
- PR #2038 is merged to dev. The Quit This Workspace forms and deleteSelf adapter are removed. removeWorkspaceMember rejects a self-targeted request with 403.
- Current behavior: PR #2038 is merged to dev. The Quit This Workspace forms and deleteSelf adapter are removed. removeWorkspaceMember rejects a self-targeted request with 403.
- Root cause: deleteSelf was never a domain operation — it is a thin adapter over member removal — and member removal is a management-of-others operation. Because it exists as a named intent, the UI could offer it to a role the underlying service forbids, and the same intent is reachable through the public member-delete endpoint, where a same-rank actor can currently target their own user_id.
- Resolution: Verify the workspace settings page has no self-leave control. Verify the member API refuses self-removal and still permits authorized removal of another member.
- Look in: `app/components/workspace/TeamMember.tsx`, `app/routes/workspaces+/$id/settings.route.tsx`, `app/routes/workspaces+/$id/settings.action.server.ts`, `app/lib/platform-members.server.ts`
- Existing tests: test/workspace-setting-utils.test.ts; test/workspace-settings-rbac.test.ts
- Done when: No Quit This Workspace form renders anywhere; The deleteSelf intent is gone from all three actions and handleDeleteSelf no longer exists; Member removal refuses a self-target with a clear 403 for every role; Removing a different member, owner transfer, invite cancellation and platform-admin removal are unchanged; The OpenAPI description and the generated spec state that self-removal is unsupported; The e2e RBAC-03 assertion that the button is visible is removed, and the invite-authorization follow-up is filed as its own issue
- Tracker: Code reviewed at dev@5b673c81. PR #2038 is merged. Its PR body says tests were not run, so a merge alone does not complete verification.

### [#2054](https://github.com/chester-hill-solutions/callcaster/issues/2054) test:ui worker OOMs on test/ui/hooks-chats.test.tsx intermittently, on every branch including master
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-27
- PR #2065 is merged to dev. The chats test mock returns one stable loader object. It no longer creates a new messages array on each render.
- Current behavior: PR #2065 is merged to dev. The chats test mock returns one stable loader object. It no longer creates a new messages array on each render.
- Root cause: The old loader mock created a new array on each render. The hook effect set state on each new array and caused a render loop.
- Resolution: Run the UI suite in CI and confirm the chats file completes. Do not add a heap cap as a substitute for the mock fix.
- Look in: `vitest.ui.config.ts (pool, maxWorkers, isolate)`, `test/ui/hooks-chats.test.tsx`, `test/setup.ui.ts`
- Existing tests: test/ui/hooks-chats.test.tsx
- Done when: test:ui completes 149/149 on a GitHub-hosted runner; hooks-chats no longer kills its worker under memory pressure; No rerun needed for a stable result on a clean dev checkout; Any new heap ceiling is documented in vitest.ui.config.ts beside the setting with its reason
- Tracker: Code reviewed at dev@5b673c81. PR #2065 reports a measured render loop and a fix. The prior claim of runner memory pressure was incorrect.

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

### [#2019](https://github.com/chester-hill-solutions/callcaster/issues/2019) Corrected project-9 Status flow documented and the enrichment lanes repaired
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Shipped in PR #2026 (3d091ce5), which is an ancestor of the current dev HEAD, and every acceptance criterion in the issue body is satisfied in the working tree. .github/projects.yaml lists on-prod (2f691958) alongside the other six options. The board how-to in scripts/issue-board-lib.mjs:353-365 describes the corrected flow, including 'Never move a CLOSED issue by hand' and the not_planned/duplicate-is-the-one-manual-move rule. .agents/skills/project-on-dev-status/SKILL.md:114-140 carries the same rule and the option ids. The lane repair is done: verify-close.json holds #1883, #1884, #1846, #1980, #1981, #1982, #1830, #1844, #1845, #1886, #1936, and fix-now.json holds none of them. The validation error the issue quoted (#780 blockedBy unknown issue 1884) cannot occur now, because #1884 is present.
- Current behavior: The Status flow is documented in the three places an agent will actually read, and the lanes match what has shipped.
- Root cause: The 2026-09-21 release session bulk-archived 260+ closed items, which exposed that the documented flow described a hand-move process the automation had replaced, and that PR #1995 had dropped two enrichment records.
- Resolution: No code. Confirm the fix reaches master and close. If the board is regenerated and any lane claim here turns out to be stale, correct the enrichment files rather than reopening this issue — the repair itself is done.
- Look in: `.github/projects.yaml (on-prod option present)`, `scripts/issue-board-lib.mjs:353-365 (corrected Status-flow how-to)`, `.agents/skills/project-on-dev-status/SKILL.md:114-140 (Related section and option ids)`, `scripts/issue-board-enrichment/verify-close.json and fix-now.json (the lane moves)`
- Existing tests: scripts/issue-board-lib.mjs validateEnrichmentFiles (fails on a duplicate issueNumber, an unknown blockedBy target, or a cycle — this is what caught the dropped #1883/#1884 records)
- Missing tests: no test asserts that an on-prod option exists in .github/projects.yaml, so removing it again would not fail any check; no test asserts that no lane record claims a verdict its filename contradicts (the issue notes lanes come from the verdict field, which is a drift trap)
- Done when: npm run tools:issues:board exits 0 with no blockedBy, duplicateOf or cycle error; The corrected Status flow is documented in the board how-to, the skill and AGENTS.md where an agent will find it; .github/projects.yaml lists on-prod; Every record moved between lanes carries the verdict matching its lane file
- Tracker: Verify and close. The work is committed on dev and the acceptance criteria are individually checkable in the working tree. Close on promotion to master.

### [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013) auth pages: one shared form container — same width, padding, centring
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-25
- PR #2024 is merged to dev. Sign-in and sign-up use AuthCard and the same centered main layout. Both main wrappers use px-4 py-8, with the same responsive padding.
- Current behavior: PR #2024 is merged to dev. Sign-in and sign-up use AuthCard and the same centered main layout. Both main wrappers use px-4 py-8, with the same responsive padding.
- Root cause: No shared container component; each page sets its own geometry.
- Resolution: Compare sign-in and sign-up at narrow and wide viewport sizes on dev. Check width, centering and padding. Keep open for any remaining visual defect.
- Look in: `app/routes/signin.tsx`, `app/routes/signup.tsx`, `app/components/shared/AuthCard.tsx`
- Existing tests: test/ui/signup.route.test.tsx
- Done when: Identical form width on both pages; Identical padding on both pages; Centred vertically and horizontally on both pages; Geometry defined in one place, not per page; #2010 re-checked against this change
- Tracker: Current source reviewed at dev@5b673c81. The PR description names older padding values; use current source for verification.

### [#2012](https://github.com/chester-hill-solutions/callcaster/issues/2012) auth pages: remove the top "Sign Up" link and rename "Create an Account" to "Sign Up"
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-25
- The sign-in page shows a "Sign Up" link at the top as well as a "Create an Account" button, so the same destination is offered twice under two different labels. Grouped under the auth-pages epic (#2057).
- Current behavior: Two distinct labels both lead to sign-up.
- Root cause: Copy was added over time without a single naming decision.
- Resolution: Remove the top "Sign Up" link and change the button to read "Sign Up". Verify the result against the live routes before closing — this may already be fixed in which case it closes with a link to the current code.
- Look in: `app/routes/account.sign-in.*`, `app/components/shared/AuthCard.tsx`
- Done when: One label, one destination; No duplicate link to the same page from the same screen
- Tracker: Smallest item in the cluster. Check the live route first — if it already reads this way, close it as already done rather than writing a change.

### [#2006](https://github.com/chester-hill-solutions/callcaster/issues/2006) Bulk Status moves to archive on the shared CHS backlog: incident fixed, prevention documented, no repo automation involved
- **IN PROGRESS** · Verdict: **Verify and close** · Size: XS · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-09-25
- Diagnosed and remediated by wra-sol in the issue comments, and the repo-side half is done. The mover was never this repository: nothing under .github/workflows/ writes project Status at all (a grep for 'archive' across the workflows returns nothing), and the board scripts never touch GitHub Projects. It was agent tooling doing a bulk sweep on the shared board, which overreached and put 48 OPEN issues into the terminal lane; all 48 were restored to Backlog and verified. The durable prevention is now written into the two places an agent will read: scripts/issue-board-lib.mjs:353-365 (the board how-to states the corrected flow, that closed items go to on-qa by automation, and that archive is only the one manual move for not_planned/duplicate) and .agents/skills/project-on-dev-status/SKILL.md:114-140 (never set a terminal lane, with the option ids). The bulk-sweep warning that was added to session memory is now in the repo instead of in one person's memory.
- Current behavior: No repo automation can move a project item. The rule that prevents a repeat is documented in the board generator and the skill.
- Root cause: A terminal Status option named archive exists on a project shared by several CHS products, and a bulk 'archive the closed items' cleanup ran without checking item state. Open items in a terminal lane is a contradiction that nothing detected.
- Resolution: No code. Verify on the shared board that no OPEN issue sits in a terminal lane (the check the fix claimed, re-run it), and that the corrected flow is still in the two documented places. Then close. If a repeat happens, the missing piece is an out-of-repo guard, not a repo change — a script that lists open items in a terminal lane would be worth its own issue if this recurs.
- Look in: `.github/workflows/ (no project Status writes — the negative result is the evidence)`, `scripts/issue-board-lib.mjs:353-365 (the corrected Status-flow section, including the never-hand-move-a-closed-item rule)`, `.agents/skills/project-on-dev-status/SKILL.md:114-140 (the same rule plus the option ids)`, `.github/projects.yaml (the terminal option is literally named archive)`
- Existing tests: scripts/issue-board-lib.mjs validateEnrichmentFiles (structural validation of the enrichment, not of the project board)
- Missing tests: no check anywhere fails when an OPEN item is left in a terminal lane — the failure mode that produced this incident is still undetectable; no script lists project items in a terminal lane on demand, so the verification is manual
- Done when: No open issue on the CHS backlog sits in archive or any other terminal lane; Nothing in this repository moves project Status to a terminal lane; The corrected Status flow is documented where an agent will read it, not only in session memory; The not_planned/duplicate exception is the only documented manual terminal move
- Tracker: Verify and close. The incident was fixed and the prevention is in the repo, so there is no code work here. The one thing worth carrying forward is the gap named above: nothing detects an open item in a terminal lane, and that is what allowed a sweep to go unnoticed until a human looked.

### [#2001](https://github.com/chester-hill-solutions/callcaster/issues/2001) Phone Numbers promoted to its own top-level page at /phone-numbers and removed from Settings
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: @sai-sy · Updated: 2026-09-25
- Shipped. PR #2018 (0ee4766a) merged to dev and the automation comment says this closes when it reaches master. Verified in the working tree: the route module exists (app/routes/workspaces+/$id/phone-numbers.route.tsx and phone-numbers.loader.server.ts, both dated 2026-09-24), the sidebar links to it (app/components/workspace/WorkspaceNav.tsx:140, path 'phone-numbers'), the URL is in the verified route-tree baseline (scripts/baselines/route-tree.txt:153), and the purchase sub-route is split out (app/routes/workspaces+/$id/phone-numbers/purchase.route.tsx).
- Current behavior: Phone Numbers is its own sidebar page; the settings page no longer carries a Phone Numbers section.
- Root cause: It was a section inside Settings rather than a top-level destination, which put a daily-use surface three clicks deep.
- Resolution: No code. Verify on the review environment that /phone-numbers loads with numbers listed, that the Settings page has no Phone Numbers section, and that the e2e RBAC-04 assertion (e2e/specs/rbac.spec.ts:29-32, a caller is redirected away from /phone-numbers) still holds — that test is the only thing guarding the role gate on the new page. Then close when the fix is promoted to master.
- Look in: `app/routes/workspaces+/$id/phone-numbers.route.tsx and phone-numbers.loader.server.ts`, `app/components/workspace/WorkspaceNav.tsx:140`, `scripts/baselines/route-tree.txt:153`, `e2e/specs/rbac.spec.ts:29-32 (the caller role gate on the new page)`
- Existing tests: e2e/specs/rbac.spec.ts (RBAC-04 gates the caller role off /phone-numbers); npm run tools:routes:verify (route tree baseline includes the new path)
- Missing tests: no test asserts the Settings page no longer renders a Phone Numbers section, so a re-add would pass silently; the sidebar link and the route path are asserted in the same place, so a rename cannot half-land
- Done when: /phone-numbers loads and lists the workspace numbers; The Settings page has no Phone Numbers section; A caller role is still refused on /phone-numbers; No dead links point at the old settings anchor
- Tracker: Verify and close. The work is merged to dev and the route tree baseline proves the path exists. The only open item is promotion to master.

### [#1998](https://github.com/chester-hill-solutions/callcaster/issues/1998) Workspace audio library and caller/call audio split into separate key prefixes; migration tool shipped
- Verdict: **Verify and close** · Size: XS · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Shipped in PR #1999 (27601c58), which is in the dev history. The split is real: app/lib/platform-media.server.ts:79-80 documents that caller voicemails live under voicemail/<ws>/ and Twilio recordings under call-recordings/<ws>/, outside the library prefix, and the migration tool exists at scripts/migrate-media-namespaces.ts with the npm script tools:media-namespace-migrate (dry-run by default, --apply to move). Tests were added alongside: test/media-namespace-migrate.server.test.ts, test/voicemail-media.server.test.ts, and test/call-recording-storage.server.test.ts was extended.
- Current behavior: Library audio, caller voicemails and call recordings live in three different key prefixes, so the filename-prefix heuristics the issue listed are gone.
- Root cause: One bucket and one key prefix for three different kinds of media, which forced every consumer to guess from a filename and produced junk like voicemail-undefined.
- Resolution: No code. The one remaining step is operational and is what makes this verifiable: run tools:media-namespace-migrate in dry-run on the review environment, check the counts, then --apply, then confirm the voicemails page and call-history playback still resolve their objects. Then repeat on prod. If the dry-run reports objects it cannot classify, that is a real gap — file it rather than forcing them across. Close when the review environment passes, since the code half is already merged.
- Look in: `app/lib/platform-media.server.ts:75-85 (the prefix split and the comment replacing the heuristics)`, `scripts/migrate-media-namespaces.ts and package.json tools:media-namespace-migrate (dry-run default, --apply)`, `app/lib/object-storage.server.ts (bucket + key layout for workspaceAudio)`, `app/routes/api+/email-vm.action.server.ts (the voicemail writer, now writing voicemail/<ws>/)`
- Existing tests: test/media-namespace-migrate.server.test.ts; test/voicemail-media.server.test.ts; test/call-recording-storage.server.test.ts
- Missing tests: no test asserts that a voicemail object and a call recording are invisible to listWorkspaceAudiosApi, which is the whole point of the change; no test asserts the migrator is idempotent, so running it twice is unproven safe; no test covers an unclassifiable pre-split object, which is the case most likely to strand history
- Done when: The review environment runs the migration dry-run, applies it, and the voicemails page and call-history playback still work; The audio library no longer lists voicemails or call recordings; No voicemail- or recording- filename heuristics remain in the code; The migration is idempotent and reports anything it cannot classify; The prod run happens after the review run and is recorded
- Tracker: Verify and close, after the migration dry-run on the review environment. The code and the tests are merged; the only thing outstanding is running the tool, and that run is the verification rather than new work. Risk is medium only because the tool moves objects — which is why the dry-run default exists and why it should be run on review first.

### [#1982](https://github.com/chester-hill-solutions/callcaster/issues/1982) Receipts: support email should be contact@callcaster.ca
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Receipts currently carry a wrong/absent support contact; use contact@callcaster.ca.
- Current behavior: Receipt builder contact line differs from the canonical support address.
- Resolution: Swap the contact line to contact@callcaster.ca on the receipt.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts contact@callcaster.ca
- Done when: Receipts say contact@callcaster.ca

### [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) Receipts: state how many credits were bought
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Receipt (billing/receipt.route.tsx) should say how many credits the purchase covered, not just the amount.
- Current behavior: Receipt builder shows amount/line items; no credit quantity line.
- Resolution: Add a credit-quantity line to the receipt render (from the ledger row / stripe session metadata). Contact #1982/#1983 for the same receipts surface.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`
- Missing tests: receipt test asserts credit-quantity line
- Done when: Receipt states how many credits were bought

### [#1980](https://github.com/chester-hill-solutions/callcaster/issues/1980) Trim IVR add-a-recording help copy: drop 'From the workspace audio library'
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-25
- Design nit: the add-a-recording step's recording select shows helper text 'From the workspace audio library.' (ScriptBlockEditor.IvrStep.tsx:304). Remove it (the picker already frames the library context) and any now-redundant spacing.
- Current behavior: ScriptBlockEditor.IvrStep.tsx:304 renders 'From the workspace audio library.' under the recording control.
- Resolution: Remove the helper text line; verify the RecordingStepFields block still reads clean with the Select only.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx:304`
- Missing tests: UI smoke renders recording step without the label
- Done when: No 'From the workspace audio library' text in the IVR recording step

### [#1976](https://github.com/chester-hill-solutions/callcaster/issues/1976) IVR results/export show the option label (not raw DTMF)
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Shipped in #1977 via resolveIvrAnswerLabel (app/lib/ivr-results.ts): results screen and CSV export render the option label for known keys; unknown values fall back to the raw value. Verify on the review env and close.
- Current behavior: Before fix: IvrOption labels ignored; raw DTMF was shown.
- Resolution: Verify on dev: a script with keypad options displays the chosen label in Results + export; a key with no matching option still shows the raw value.
- Look in: `app/lib/ivr-results.ts`
- Existing tests: test/ivr-results* and route tests for label resolution
- Done when: Results + export show the label the caller chose (or raw when unmatched)

### [#1961](https://github.com/chester-hill-solutions/callcaster/issues/1961) issue-on-dev abort when PR bodies reference non-issue numbers
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Fixed by #1964: issue-on-dev.yml now parses closing keywords and 'Issues:' lines with PR-number robustness, and the parser ignores bare PR-number references. Verify a merge with a body containing issue numbers doesn't abort the loop, then close.
- Current behavior: Before: 'gh issue view' on a PR number returned MERGED and the GraphQL move loop aborted.
- Resolution: Verify with a reference PR whose body names issues + a PR number; confirm Status moves complete. #1961 is docs/automation only.
- Look in: `.github/workflows/issue-on-dev.yml`
- Done when: The move loop completes when a PR body references issue numbers

### [#1919](https://github.com/chester-hill-solutions/callcaster/issues/1919) verify-close: single-consumer hooks dropped from the global barrel (#1920)
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- app/hooks/index.ts no longer exports useSurveyForm or useCampaignExport; the hooks stay reachable through their sub-barrels. Shipped to dev in PR #1920 (95f084c9); ancestor of origin/dev, NOT of origin/master.
- Root cause: The #1892 DRY pass widened the global barrel with hooks that have one consumer each.
- Resolution: Verify on dev: rg the two hook names in app/hooks/index.ts finds no export, and the survey/export tests stay green. No new code expected.
- Look in: `app/hooks/index.ts`, `app/hooks/surveys/index.ts`, `app/hooks/campaign/index.ts`
- Existing tests: test/ui/use-survey-form.test.tsx; test/ui/campaign-export-button.test.tsx
- Done when: The global-barrel exports are dropped; the sub-barrels keep the hooks.; No import breaks.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1918](https://github.com/chester-hill-solutions/callcaster/issues/1918) verify-close: loadQueueItemRelations returns grouped contact maps (#1920)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- loadQueueItemRelations in app/lib/campaign-queue-search.server.ts now returns { contactById, attemptsByContactId, audiencesByContactId } and both fetchers consume the same maps. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The helper returned raw arrays, so the page fetcher grouped them while the item fetcher re-filtered them.
- Resolution: Verify on dev: queue route suites green and both fetchers use the maps. No new code expected.
- Look in: `app/lib/campaign-queue-search.server.ts`
- Existing tests: test/campaign-queue.route.test.ts; test/campaign-queue-db.claim.test.ts; test/campaign-settings-queue.route.test.ts
- Done when: The helper returns grouped-by-contact maps used by both consumers.; The queue suites stay green.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1917](https://github.com/chester-hill-solutions/callcaster/issues/1917) verify-close: type the public survey guard's extra required fields (#1920)
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- extraRequiredFields is typed as PublicSurveyRequiredField[] in app/lib/survey-public-action.server.ts. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The shared guard encoded one route's requirement as an untyped string list.
- Resolution: Verify on dev: survey route suites stay green and the type alias is used. No new code expected.
- Look in: `app/lib/survey-public-action.server.ts`
- Existing tests: test/survey-answer.route.test.ts; test/survey-complete.route.test.ts
- Done when: extraRequiredFields is typed or the required-field check stays route-local.; Survey route suites stay green.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1916](https://github.com/chester-hill-solutions/callcaster/issues/1916) verify-close: campaign export poll keyed on ids only, stops on terminal status (#1920)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- useCampaignExport's poll effect depends on [exportId, workspaceIdStr] only and clears its interval on terminal status. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: Keying the interval on exportStatus tore down and restarted the 2s timer on every status change.
- Resolution: Verify on dev: test/ui/campaign-export-button.test.tsx covers start -> poll -> completed with fake timers. No new code expected.
- Look in: `app/hooks/campaign/useCampaignExport.ts`, `app/components/campaign/CampaignExportButton.tsx`
- Existing tests: test/ui/campaign-export-button.test.tsx
- Done when: The interval is keyed on exportId / workspaceIdStr only; terminal status stops polling.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1915](https://github.com/chester-hill-solutions/callcaster/issues/1915) verify-close: admin pagination consolidated onto TablePagination (#1920)
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- TablePagination gained optional pageSizeOptions + onPageSizeChange; AdminPagination is deleted and the three admin panels use TablePagination. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The DRY pass extracted a near-duplicate AdminPagination instead of extending the canonical component.
- Resolution: Verify on dev: rg AdminPagination finds no imports; test/ui/table-pagination-page-size.test.tsx green. Eyeball the three admin panels' pagination. No new code expected.
- Look in: `app/components/shared/TablePagination.tsx`, `app/components/admin/`, `app/components/queue/QueueTablePagination.tsx`
- Existing tests: test/ui/table-pagination-page-size.test.tsx
- Done when: TablePagination gains the page-size select.; AdminPagination is deleted; the three admin panels use TablePagination.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1914](https://github.com/chester-hill-solutions/callcaster/issues/1914) verify-close: survey routes share the fetcher redirect and error extraction (#1920)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- app/lib/survey-submit.ts owns SurveySubmitResult, surveySubmitError, and surveySuccessPath; both survey routes import it and render <Navigate>. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The two routes carried ~40 duplicated lines.
- Resolution: Verify on dev: test/ui/survey-create-edit-redirect.test.tsx green and both routes import from @/lib/survey-submit. No new code expected.
- Look in: `app/lib/survey-submit.ts`, `app/routes/workspaces+/$id/surveys/new.route.tsx`, `app/routes/workspaces+/$id/surveys/$surveyId/edit.route.tsx`
- Existing tests: test/ui/survey-create-edit-redirect.test.tsx
- Done when: A shared helper owns the redirect and error extraction.; Both routes use it.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1913](https://github.com/chester-hill-solutions/callcaster/issues/1913) verify-close: SurveyForm decomposed into page and question subcomponents (#1920)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- SurveyForm.tsx defines SurveyQuestionCard and SurveyPageSection; the top-level SurveyForm function is under the 200-line threshold. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: The file held a 265-line function with everything inline.
- Resolution: Verify on dev: lint reports no max-lines-per-function warning and survey tests stay green. No new code expected.
- Look in: `app/components/surveys/SurveyForm.tsx`
- Existing tests: test/ui/survey-create-edit-redirect.test.tsx; test/ui/use-survey-form.test.tsx
- Done when: SurveyPageSection and SurveyQuestionCard are extracted.; The top-level function drops under the threshold.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1912](https://github.com/chester-hill-solutions/callcaster/issues/1912) verify-close: survey ids derive from the highest suffix, unique after removal (#1920)
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- useSurveyForm derives new page/question ids from nextSuffix() (highest existing suffix + 1) and a regression test asserts ids stay unique after a middle removal. Shipped to dev in PR #1920 (95f084c9); NOT yet master.
- Root cause: Ids were derived from array.length + 1, which collides after a middle removal.
- Resolution: Verify on dev: test/ui/use-survey-form.test.tsx includes the uniqueness regression. No new code expected.
- Look in: `app/hooks/surveys/useSurveyForm.ts`, `test/ui/use-survey-form.test.tsx`
- Existing tests: test/ui/use-survey-form.test.tsx
- Done when: New ids derive from the max existing numeric suffix.; A test adds three, removes the middle, adds another, asserts unique ids.
- Tracker: Verify and close after dev verification; promote #1920 to master first.

### [#1897](https://github.com/chester-hill-solutions/callcaster/issues/1897) verify-close: git hooks + PR issue-reference gate (shipped to dev in #1921/#1926)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Both halves shipped to dev: a checked-in pre-commit hook wired via core.hooksPath, and a PR-into-dev issue-reference gate. Merged in PR #1921 (23700b0f) and PR #1926 (f416f037). Both are ancestors of origin/dev but NOT of origin/master.
- Root cause: The repo had no git hooks and no requirement that a PR body reference an issue.
- Resolution: Verify on dev only: stage a lint error and confirm the pre-commit hook blocks the human commit; open a dev PR without an issue reference and confirm the check is red, then add no-issue and confirm it clears. No new code expected.
- Look in: `.githooks/pre-commit`, `scripts/setup-githooks.sh`, `package.json`, `.github/workflows/pr-issue-reference.yml`, `.github/workflows/issue-on-dev.yml`
- Done when: A commit with a lint error is blocked by the pre-commit hook.; A PR into dev with no issue reference fails a check unless labelled no-issue.
- Tracker: Verify and close after dev verification; promote #1921/#1926 to master first.

### [#1894](https://github.com/chester-hill-solutions/callcaster/issues/1894) Verify: the test suite is pinned to UTC
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Fixed on dev in PR #1898 (4079b7ae, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, vitest.shared.config.ts:16 sets test env { TZ: "UTC" } for both projects.
- Root cause: Neither vitest.shared.config.ts nor the setup files set TZ.
- Resolution: No new code. Verify on the review environment and a non-UTC machine, then close when promoted to master.
- Look in: `vitest.shared.config.ts`, `test/ui/campaign-launch-eta.test.tsx`, `test/setup.node.ts`, `test/setup.ui.ts`
- Existing tests: test/ui/campaign-launch-eta.test.tsx
- Missing tests: optional guard that process.env.TZ === "UTC" inside a test
- Done when: process.env.TZ === "UTC" in node and ui tests without any per-file pin; The suite passes unchanged on a non-UTC machine
- Tracker: Verify on the review env; close when promoted to master (dev-only today). Update the AGENTS.md per-file TZ pitfall once confirmed.

### [#1891](https://github.com/chester-hill-solutions/callcaster/issues/1891) Verify: mobile nav sheet stacks its links vertically
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Fixed on dev in PR #1893 (c83ad822, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, navLinkClass in Navbar.MobileMenu.tsx:37 includes block.
- Root cause: navLinkClass lacked block, so <NavLink> stayed inline.
- Resolution: No new code. Verify on the review environment at a narrow viewport, then close when promoted to master.
- Look in: `app/components/layout/Navbar.MobileMenu.tsx`
- Existing tests: e2e/specs/marketing-mobile-nav.spec.ts
- Done when: On a narrow viewport, Home, Docs, Sign In and Sign Up stack one per row; Signed-in account links and the Log Out button stack the same way
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

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

### [#1883](https://github.com/chester-hill-solutions/callcaster/issues/1883) IVR no-input editor panel + inbound mirror
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- IMPLEMENTED on dev (#1992 merged 2026-09-22). Runtime+outbound half of #1937 shipped: ...
- Current behavior: Editor: ScriptBlockEditor.IvrStep.tsx has mode/speech/recording/voice controls but no no-input panel; the response rows (IvrResponses.tsx) only set option.next/label. Inbound: inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts:50-69 findNextStep ignores noInput; null userInput falls through to linear next/hangup; renderTerminalTarget (:71-123) has no noInput branch.
- Root cause: PR #1937 kept the editor panel and inbound twin out to stay atomic; the wire fields have no producer.
- Resolution: Editor: add per-step controls in ScriptBlockEditor.IvrStep.tsx writing block.noInput {action,pageId,blockId,maxReplays} + gatherTimeoutSeconds (defaults unchanged when unset). Inbound: mirror the outbound no-input branching into the inbound response route with a CALL-scoped replay store (no outreach attempt exists inbound; key by call/recurring session) and reuse resolveNoInputTarget + DEFAULT_NO_INPUT_MAX_REPLAYS. Fold #1843 or close it as duplicate.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server.ts`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-gather.server.ts`
- Existing tests: test/ivr-block-runtime.test.ts (resolveNoInputTarget); test/ivr-gather.test.ts (timeout attrs); test/inbound-ivr-block-response.route.test.ts:144-161 (null-input falls through)
- Missing tests: Editor emits wait/no-input controls; Inbound no-input branches (hangup/route/replay) + per-call replay cap
- Done when: A step can wait longer than the default and, on no input, replay or route instead of just advancing; Defaults unchanged for steps that do not configure it; Inbound mirrors outbound behavior with its own replay store
- Tracker: Implemented on dev (PR #1992, merged). Verify on the review env: #1883 editor no-input panel writes the fields + inbound mirrors the cap; #1884 dangling/cycle scripts block launch with script_routing_invalid and the editor shows the errors. Then close.

### [#1869](https://github.com/chester-hill-solutions/callcaster/issues/1869) Verify: test calls leave the campaign queue untouched
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: @wra-sol · Updated: 2026-09-25
- Fixed on dev in PR #1900 (2a2eb281, merged 2026-09-19, base dev). NOT in master, so dev-only.
- Current behavior: On dev, the dequeue block in webhook-side-effects.server.ts is gated on outreachAttemptId != null.
- Root cause: The contact-keyed dequeue had no guard on the resolved outreach attempt, so any terminal callback with a contact_id could mutate the queue.
- Resolution: No new code. Verify on the review environment, then close when promoted to master.
- Look in: `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/campaign-test-call.server.ts`, `app/routes/api+/call-status.action.server.ts`
- Existing tests: test/webhook-side-effects.test.ts
- Done when: A test call to a queued number leaves queue_state queued, queue_order unchanged, attempts unchanged and dequeued_at null
- Tracker: Verify on the review env; close when promoted to master (dev-only today).

### [#1847](https://github.com/chester-hill-solutions/callcaster/issues/1847) Add a 'Do not import' mapping option so columns can be dropped
- Verdict: **Verify and close** · Size: S-M · Risk: low · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-25
- The CSV mapping forces every column to a target and defaults unknown columns to Custom field; users want to drop unwanted columns instead of importing them as custom fields.
- Current behavior: Every CSV header maps to a ContactImportTarget (unknown headers default to other_data / Custom field). The Map CSV Headers select offers no ignore/drop option.
- Root cause: CONTACT_IMPORT_TARGETS has no ignore/drop target, and the mapping, validation, and import paths assume every column is imported.
- Resolution: Add an 'ignore' / 'Do not import' option: offer it in the Map CSV Headers select, exclude it from other_data, exclude it from duplicate-target validation, and skip it in processAudienceUpload. Leave the Data Preview unchanged.
- Look in: `shared/contact-import-headers.ts`, `app/components/audience/AudienceUploadMapStep.tsx`, `app/components/audience/audience-upload-csv.ts`, `app/components/audience/AudienceUploader.tsx`, `app/lib/audience-upload-process.server.ts`
- Existing tests: test/contact-import-headers.test.ts; test/ui/audience-uploader.test.tsx; test/audience-upload-parsing.test.ts
- Missing tests: A column mapped to ignore passes validation and is absent from imported contacts; Ignore is not counted as a duplicate target
- Done when: A mapping option drops a column; Dropped columns are not written to other_data; Dropped columns do not create duplicate-target errors; Phone and name validation behaviour is unchanged
- Tracker: Implemented on dev (PR #1973 41d45f6d): shared/contact-import-headers.ts includes a drop-column option with tests (test/contact-import-headers.test.ts) + CHANGELOG entry. Verify the mapping UI and close.

### [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) Pass the live caller-ID verification status to the onboarding verification sheet
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-25
- From onboarding the verification sheet keeps showing 'Verification pending' after the number is verified; Settings shows 'Number verified' because it passes the live status.
- Current behavior: OnboardingFirstNumberStep renders CallerIdVerificationDialog without a status prop, so the sheet defaults to pending. Settings passes status derived from capabilities.verification_status.
- Root cause: The live-status wiring added for Settings (#1740) was never added to the onboarding render.
- Resolution: Compute the live verification status from callerIdNumbers and pass it to CallerIdVerificationDialog in OnboardingFirstNumberStep, mirroring settings/numbers.route.tsx.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`, `app/routes/workspaces+/$id/settings/numbers.route.tsx`, `app/components/phone-numbers/CallerIdVerificationDialog.tsx`
- Existing tests: test/ui/caller-id-verification-dialog.test.tsx; test/ui/onboarding-first-number-flow.test.tsx
- Missing tests: Onboarding dialog shows 'Number verified' after the number's verification_status flips to success
- Done when: Completing verification from onboarding flips the sheet to 'Number verified' with no reload; A failed verification still shows 'Verification failed'; Settings behaviour is unchanged
- Tracker: Exact fix: pass the live status the way Settings already does.

### [#1845](https://github.com/chester-hill-solutions/callcaster/issues/1845) fix(dial): drop synchronous AMD from manual/power dials; keep it predictive-only
- Verdict: **Verify and close** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Manual call-creation paths still send machineDetection:'Enable', so an answered manual call waits for the AMD verdict. Decision couples AMD to dial mode: predictive keeps it, manual/power turns it off and uses the agent's Audio Drop button. IVR keeps AMD (see #1842/#1864).
- Current behavior: machineDetection:'Enable' at call.action.server.ts:108 and dial/$number.action.server.ts:73; auto-dial.server.ts:63 keeps it. test/api-call.route.test.ts:180 asserts machineDetection="Enable".
- Root cause: AMD was added unconditionally to support auto voicemail drop; on manual/power calls an agent is already on the line.
- Resolution: Remove machineDetection (and any AMD-callback wiring) from call.action.server.ts and dial/$number.action.server.ts; keep it in auto-dial.server.ts. Confirm the Audio Drop control stays visible when voicedrop_audio is set. Update the api-call test and add a regression that auto-dial still sets it.
- Look in: `app/routes/api+/call.action.server.ts`, `app/routes/api+/dial/$number.action.server.ts`, `app/lib/auto-dial.server.ts`, `app/routes/api+/dial/status.action.server.ts`, `app/components/call/CallScreen.CallArea.tsx`
- Existing tests: test/api-call.route.test.ts; test/dial-number.route.test.ts; test/dial-status.route.test.ts; test/auto-dial.server.test.ts
- Missing tests: manual routes emit no machineDetection; auto-dial still emits machineDetection; Audio Drop still works on manual/power calls
- Done when: A manual/power call reaches audio immediately with no AMD wait; Predictive dialing still drops or hangs up on a detected machine; A drop-enabled campaign still plays the voicemail when an agent drops it
- Tracker: Implemented on dev (PR #1969 86794a3d): manual/power dials no longer send machineDetection (call.action.server.ts, dial/$number), auto-dial keeps it; tests assert both. Verify on the review env and close.

### [#1844](https://github.com/chester-hill-solutions/callcaster/issues/1844) Play call recordings in-app instead of linking to the Twilio recording URL
- Verdict: **Verify and close** · Size: S-M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The Call History 'Listen' link opens call.recording_url, a Twilio API mp3 URL that sends the user to Twilio; recordings are already copied to object storage as call.audio_url.
- Current behavior: CallLogTable renders an <a href={recordingUrl}>Listen when recording_url is set. app/lib/call-log.server.ts selects call.recording_url. runRecordingSideEffects already persists recordings to object storage (call.audio_url).
- Root cause: Call History reads the raw Twilio recording_url and links out to it instead of serving the stored call.audio_url.
- Resolution: Select call.audio_url in app/lib/call-log.server.ts and mint a signed object-storage URL (createSignedObjectUrls, as the voicemails loader does), preferring it for the Listen action; render an in-app player and keep a clear fallback when no persisted copy exists.
- Look in: `app/lib/call-log.server.ts`, `app/components/calls/CallLogTable.tsx`, `app/lib/call-recording-storage.server.ts`, `app/lib/worker/webhook-side-effects.server.ts`, `app/lib/platform-media.server.ts`, `app/lib/object-storage.server.ts`
- Existing tests: test/call-log.test.ts
- Missing tests: Loader returns a non-Twilio playback URL for a call with audio_url; CallLogTable renders the in-app player and no external Twilio link
- Done when: Listen plays the recording without leaving CallCaster or opening Twilio; Works for a call whose recording was persisted to storage; A clear message when no recording copy exists; Tenant scoping is preserved
- Tracker: Implemented on dev (PR #1972 d1c6049d): Call History plays the stored object-storage copy in-app via signed URL; raw Twilio link remains only as the no-copy fallback. Verify on the review env and close.

### [#1842](https://github.com/chester-hill-solutions/callcaster/issues/1842) WAV sidecar backfill for existing prompts (gen-wav-sidecars)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- PR #1968 wires WAV sidecar creation only on NEW audio (upload: platform-media.server.ts:135-139; clip save: audio-clip.server.ts:87). The in-browser recording path (audios/record.action.server.ts:76) never writes a sidecar either. Backfill needed so EXISTING prompts (incl. recorded-*) stop being re-encoded by Twilio.
- Current behavior: Sidecar logic lives in app/lib/ivr-wav.server.ts: ivrWavObjectKey (ivr-wav/<workspace>/<base>.wav), writeIvrWavSidecar (skips .wav, transcodeToWavBuffer, putMediaObject upsert), resolveIvrPromptObjectKey prefers the sidecar via objectExists. Transcode: app/lib/audio.server.ts transcodeToWavBuffer (mono 8kHz 16-bit PCM, WAV_ENCODE_ARGS:74-84) via raw ffmpeg spawn (runAudioTool:143-186); ffmpeg is a runtime dep (Dockerfile:33-38). Storage is S3 (MinIO local / Railway Bucket prod) with workspaceAudio/ prefix; workspace_audio is metadata-only. Prompt filter isWorkspaceAudioFile excludes voicemail-+/voicemail-undefined/recording- (platform-media.server.ts:30-35).
- Root cause: Sidecar generation is opportunistic (only at write time); thousands of pre-existing MP3 prompts and recorded-* files never got one.
- Resolution: Add scripts/gen-wav-sidecars.ts (bun-resolved @/ aliases; package.json tools:gen-wav-sidecars) modeled on scripts/db/reconcile-stuck-calls.ts (env placeholder bootstrap BEFORE app imports 28-50; dry-run default, --apply, per-workspace error isolation, non-zero exit on residual). Loop: select workspaces; listMediaObjects('workspaceAudio', ws) prefix ws/; filter to prompts (isWorkspaceAudioFile, skip existing .wav); dedupe gate objectExists(ivrWavObjectKey) unless --force; downloadObject -> transcodeToWavBuffer -> putMediaObject(upsert:true). Factor a pure core with injectable Deps (DI style of audio.server.ts:42-52) for unit tests mocking listObjects/objectExists/transcode/upload (ivr-wav.server.test.ts pattern). Include recorded-* library recordings (the record path never sidecared them); keep the voicemail- exclusion. Never pipe:0 input (seekable temp file required for mp4/m4a moov), skip empty transcode output.
- Look in: `app/lib/ivr-wav.server.ts`, `app/lib/audio.server.ts`, `app/lib/object-storage.server.ts`, `scripts/db/reconcile-stuck-calls.ts`, `app/routes/workspaces+/$id/audios/record.action.server.ts`
- Existing tests: test/ivr-wav.server.test.ts (key/sidecar/resolve); test/audio.server.test.ts (transcode)
- Missing tests: Backfill core: lists prompts, skips existing sidecars + .wav, dedupes/--force, records per-workspace failures
- Done when: All prompts incl. recorded-* have a sidecar after a apply run (idempotent re-runs); No new deps; reuses ivrWavObjectKey/transcodeToWavBuffer/putMediaObject
- Tracker: Implemented on dev (PR #1994, merged). Run `npm run tools:gen-wav-sidecars -- --apply` against the review env first, then prod; verify sidecars appear (\`ivr-wav/<ws>/…\`) and IVR playback uses them, then close.

### [#1830](https://github.com/chester-hill-solutions/callcaster/issues/1830) Codify blocking cross-developer tasks as assigned tickets in the GitHub agent skills
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Request that work another developer must do to unblock an issue becomes a separate ticket, set to block that issue and assigned to the right person, and that the agent skills say so.
- Current behavior: github-issues/SKILL.md covers issue types, parent/child decomposition, and the --blocked-by / --blocking flags, but does not require creating a separate assigned ticket when another dev's task blocks an issue.
- Root cause: The skill documents the mechanics of blocking links but not the policy that blocking work is its own assigned ticket.
- Resolution: Add a section to .agents/skills/github-issues/SKILL.md stating that blocking cross-developer work is created as a new Task, linked with --blocking <blocked issue> (or --blocked-by on the blocked issue), and assigned with --assignee; include a worked example.
- Look in: `.agents/skills/github-issues/SKILL.md`, `.agents/skills/github-cli/SKILL.md`, `.agents/skills/github-pull-request/SKILL.md`
- Done when: The skill states blocking work becomes a separate ticket; The skill shows the blocking link direction and assignment; The example uses --blocking and --assignee correctly
- Tracker: Implemented on dev (PR #1965 ac6aaef6): github-issues SKILL.md documents cross-developer blockers as assigned, one-direction blocking tickets. Verify and close.

### [#1713](https://github.com/chester-hill-solutions/callcaster/issues/1713) Workspace invites: email-first (invite by email without requiring an account)
- Verdict: **Verify and close** · Size: M · Risk: medium · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-25
- IMPLEMENTED on dev (#1985, merged 2026-09-21): email-first invites (SEC-03) landed end-to-end — invite writers no longer require a pre-existing account, pending invites live on workspace_invitation by email, acceptance is token-gated through the emailed link, email sent via Resend, members API / settings / admin lists and cancel/resend moved to the new table. Verify the invitee flow on the review env (invite unknown email -> accept link -> signup -> workspace membership), then close.
- Current behavior: Invites are account-keyed: workspace_invite.user_id is uuid NOT NULL (schema.ts:214). app/lib/invite-user-by-email.server.ts:26-31 returns 'User not found. They must sign up before being invited to a workspace.' when no auth user matches, and the module comment says email delivery is TBD - no invitation email is ever sent; the invitee only sees the invite after logging in. The /accept-invite signup branch admits the gap ('invites are keyed by an existing user id, so nothing here proves an invite exists', accept-invite.action.server.ts:26-28).
- Root cause: Legacy invite model (workspace_invite) has no email column and no delivery; invites were created only for existing user ids. The email-first replacement (workspace_invitation / SEC-03) was scaffolded in 2026-07 but never adopted by the writers/readers.
- Resolution: Shipped in PR #1985. Follow-ups (tracked separately, do not block this close): Phase D drop of legacy workspace_invite; #1714 same-'User not found'-error verify-and-close against the new writer.
- Look in: `app/lib/invite-user-by-email.server.ts`, `app/lib/platform-members.server.ts`, `app/routes/api+/workspaces+/$workspaceId/members.action.server.ts`, `app/routes/accept-invite.action.server.ts`, `app/routes/accept-invite.loader.server.ts`, `app/routes/accept-invite.tsx`, `app/routes/workspaces+/$id/settings.route.tsx`, `app/db/schema.ts:180`, `app/lib/schemas/api/platform-workspace-admin.ts`, `app/lib/send-reset-password-email.server.ts`, `docs/remediation/wave1-membership-migration-2026-07-13.md`
- Existing tests: test/accept-invite* (accept/redeem; see test/ for invite coverage); members API invite tests (POST /members)
- Missing tests: createInvitation writer: unknown email creates pending email-keyed invite; existing user creates user-keyed invite; duplicate pending email rejected; redeemInvitation: wrong token, expired, wrong email vs verified email, concurrent redeem CAS; signup-claim: new account with invited email lands in the workspace on /accept-invite; email sent carries id + raw token; token never persisted; members list renders pending email invitations; cancel/resend
- Done when: Inviting an unknown email succeeds: the email is attached to the workspace and pending; the invitee gets a prompt (email + signup landing) to create an account; Inviting a known email behaves as today (user-keyed invite, no duplicate pending); After signup/sign-in with the invited email, the invite redeems atomically (verified-email match, CAS) and a workspace_member row is inserted; Raw invitation tokens are never stored; token_hash only; members.invite capability gate and role policy (owner never invitational) unchanged; Legacy workspace_invite rows migrated or abandoned before the table is dropped
- Tracker: Verify on the review env after the 2026-09-21 release: invite an email with no account, receive the Resend link, sign up, land in the workspace; ensure token-less accept is not reachable. Then close.

### [#1338](https://github.com/chester-hill-solutions/callcaster/issues/1338) verify-close: call settings sheet laid out by device, no redundant labels
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-25
- #1680 laid the sheet out by device (single label per field, buttons say what they do, flex gap), removing the redundant headings flagged in the issue. UI green; visual eyeball pending.
- Current behavior: Microphone/Speaker/Output fields each carry one label with their controls beneath.
- Root cause: Original layout clipped/misaligned; #1680 restructured.
- Resolution: No new code; eyeball on dev.
- Look in: `app/components/call/CallScreen.DeviceSettings.tsx`, `app/components/call/CallScreen.Layout.tsx`
- Existing tests: test/ui/audio-device-lifecycle.test.tsx; test/ui/call-screen-header.test.tsx
- Done when: no clipping left/right; no redundant labels
- Tracker: Close after the eyeball.

### [#1333](https://github.com/chester-hill-solutions/callcaster/issues/1333) test(chats): prove STOP and START text remains visible to operators
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-25
- STOP/START bodies are stored unchanged and rendered verbatim in the transcript and conversation preview. The only remaining obfuscation is generic opt-out-banner copy ('replied with an opt-out keyword').
- Current behavior: inbound-sms persists the raw body before opt-out processing; ChatMessages renders message.body; ConversationList preview shows it; STOP-only hiding is explicit.
- Root cause: Already implemented; the ask likely refers to banner copy.
- Resolution: Verify the transcript shows the exact text; if the banner is the concern, include the exact matched keyword in ChatOptOutBanner copy. Add tests pinning unchanged persistence.
- Look in: `app/routes/api+/inbound-sms.action.server.ts`, `app/components/sms-ui/ChatMessages.tsx`, `app/components/chats/ChatOptOutBanner.tsx`, `app/lib/chat-opt-out.ts`
- Existing tests: test/inbound-sms.route.test.ts (keyword state changes)
- Missing tests: STOP/START bodies persisted unchanged; transcript/preview exact text
- Done when: Opt-out text unchanged in history; Preview shows exact text; Hiding STOP-only stays explicit
- Tracker: Close after verification; future #1268 consent work replaces the boolean authority.

### [#1292](https://github.com/chester-hill-solutions/callcaster/issues/1292) verify-close: call screen shows Hang Up in-call, Dial (with confirm) after
- **IN PROGRESS** · Verdict: **Verify and close** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-25
- Dial control (#1408) flips to Dial and requires a second click after a call ends; Hang Up has its own two-step confirm. CallControls state machine verified by code + call-screen UI tests.
- Current behavior: in-call -> Hang Up (two-step); after end -> armed Dial ('Click again to call back') that disarms on first click.
- Root cause: Errors not reproduced; #1408 implemented the guard.
- Resolution: No new code; run the idle-state eyeball on dev.
- Look in: `app/components/call/CallScreen.CallArea.tsx`
- Existing tests: test/ui/call-screen-callarea.test.tsx
- Done when: active call -> Hang Up; ended call -> Dial with confirm; no hang-up confirm loop
- Tracker: Close after the eyeball.

### [#1957](https://github.com/chester-hill-solutions/callcaster/issues/1957) Exempt docs/data-only PRs from the review-coverage gate
- Verdict: **Verify and close** · Size: XS · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- The review-coverage gate now skips docs/data-only PRs, i.e. when every changed file is ISSUE_BOARD.md or under scripts/issue-board-enrichment/.
- Resolution: Verify on dev that a board-only PR over ~500 lines passes without a Structural review marker, and a code PR does not. Close on master promotion.
- Look in: `.github/workflows/review-coverage.yml`
- Done when: A docs/data-only PR over 500 lines passes without the marker; Any code path keeps the marker requirement
- Tracker: Merged on dev in PR #1959; closes on master promotion.

### [#1956](https://github.com/chester-hill-solutions/callcaster/issues/1956) Release PRs must close the issues they promote (Closes #N)
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- release-close-issues.yml requires a closing keyword (Closes #N) in a dev to master release PR body, with a no-issue override; the local-development skill documents it.
- Resolution: Verify on dev that a master PR without a closing reference fails the gate unless labelled no-issue. Close on master promotion.
- Look in: `.github/workflows/release-close-issues.yml`, `.agents/skills/local-development/SKILL.md`
- Done when: A release PR carrying Closes #N closes those issues on merge; A master PR with no closing reference fails unless labelled no-issue
- Tracker: Merged on dev in PR #1960; closes on master promotion.

### [#1936](https://github.com/chester-hill-solutions/callcaster/issues/1936) Comment policy: comments must carry information (no-useless-comments rule)
- Verdict: **Verify and close** · Size: S-M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Add a local ESLint rule callcaster/no-useless-comments (error) rejecting issue/PR-number-only and punctuation-only comments, sweep the ~20 existing offenders, and document the rule. Not implemented.
- Current behavior: eslint.config.mjs only wires upstream plugins; there is no local rule infrastructure and no no-useless-comments rule.
- Root cause: Comment hygiene is unenforced; a number or a punctuation banner passes lint.
- Resolution: Define the rule (inline plugin object in eslint.config.mjs, or a small local-rules module), set it to error, fix the offenders, add rule unit tests, and document the intent.
- Look in: `eslint.config.mjs`, `package.json`, `app/`, `test/`
- Missing tests: Rule unit tests: number-only comment fails, punctuation-only comment fails, informative comment passes
- Done when: Issue/PR-number-only comments are lint errors; Punctuation-only comments are lint errors; Existing offenders are zero; Rule intent is documented
- Tracker: Implemented on dev (PR #1974 5fd10f49 + sweep/docs PR #1979 356e3efe): callcaster/no-useless-comments is error with unit tests (test/no-useless-comments-rule.test.ts), zero offenders, intent documented. Verify eslint passes and close.

### [#1932](https://github.com/chester-hill-solutions/callcaster/issues/1932) Systemic structural review: PR risk template + coverage gate
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- PR #1935 (93def136) added .github/pull_request_template.md and the review-coverage workflow gate: high-risk paths or a ~500-line diff require a Structural review: marker. Shipped on dev only.
- Current behavior: Every PR body declares Files touched / Risk class / Structural review; the review-coverage workflow fails a PR that touches app/lib/worker/, app/server/, app/db/ or client/migrations/, or crosses the line cap, without the marker.
- Root cause: Structural review was an end-of-batch habit, so problems were caught after merge.
- Resolution: No code work left in-repo. Verify the gate fails an unmarked high-risk PR on the review env, then close when dev is promoted to master.
- Look in: `.github/pull_request_template.md`, `.github/workflows/review-coverage.yml`, `.github/workflows/pr-issue-reference.yml`
- Existing tests: Workflow self-validates on its own PR
- Done when: PR template declares risk surface; Gate fails high-risk PRs without a Structural review: marker; ci:local green
- Tracker: Verify and close. Dev-only (93def136 not in master); confirm the marker is enforced, then close on promotion.

### [#1931](https://github.com/chester-hill-solutions/callcaster/issues/1931) Ratchet the test echo-shape: expectations that reuse SUT exports
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- PR #1933 (3bfd5210) added scripts/check-test-echo.mjs plus an empty baseline, wired check:test-echo into ci:local, and converted the remaining echo candidates. Shipped on dev only.
- Current behavior: check:test-echo scans test/ for toBe/toEqual/toContain whose expected argument is an identifier imported from app/ or shared/; scripts/test-echo-baseline.json is {}.
- Root cause: Assertions could echo SUT exports, so any value the SUT chose would pass.
- Resolution: No code work left. Re-run npm run check:test-echo on the review env, then close when dev is promoted to master.
- Look in: `scripts/check-test-echo.mjs`, `scripts/test-echo-baseline.json`, `package.json`, `.github/workflows/ci.yml`
- Existing tests: test/test-echo-checker.test.ts
- Done when: check:test-echo reports echo-shaped expectations; Existing occurrences are zero; the count only ratchets down; Both suites stay green
- Tracker: Verify and close. Dev-only (3bfd5210 not in master); baseline is empty.

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

### [#1727](https://github.com/chester-hill-solutions/callcaster/issues/1727) Campaign List should be sorted
- Verdict: **Verify and close** · Size: S · Risk: low · Labels: ux · Assignee: @wra-sol · Updated: 2026-09-19
- Fixed on dev in PR #1899 (9a82cbce): the campaigns list sorts by status group then newest first, via app/lib/campaign-list-order.ts. The open state does not prove the fix is absent.
- Resolution: Verify on the review environment that the list orders running, then waiting, then draft, then complete, newest first within each group. Close on master promotion. Do not reimplement the sort.
- Look in: `app/lib/campaign-list-order.ts`
- Existing tests: test/campaign-list-order.test.ts
- Done when: Campaign list orders running, waiting, draft, complete, newest first within each group
- Tracker: PR #1899 merge 9a82cbce is on dev, not yet master. Closes on master promotion.

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

## Needs reproduction — 12

Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.

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

### [#1765](https://github.com/chester-hill-solutions/callcaster/issues/1765) Onboarding steps shouldn't have the credit warning after renting a number
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: ux · Assignee: @sai-sy · Updated: 2026-09-27
- The specific 'credit warning after renting' could not be located in the onboarding source; screenshot unverifiable here. Needs the step + exact warning text to pin the component.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#2034](https://github.com/chester-hill-solutions/callcaster/issues/2034) Campaign results disagree with themselves: 0 of 1 contacts completed while the disposition breakdown reports 2 completed
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The inconsistency is real and the two numbers are computed from different tables, but I could not confirm which write produces the extra rows, so I am not specifying a fix. 'Contacts Completed' is queueRows, not attempts: ResultsScreen.tsx:53-57 passes queueCounts.completedCount, which is countDialableCompletedCampaignQueueRows (app/lib/campaign-queue-search.server.ts:338-342) counting campaign_queue rows where queue_state='dequeued' OR dequeued_at IS NOT NULL (the predicate is right, verified at :59-67). The disposition breakdown is attempts: it comes from the get_campaign_stats RPC (drizzle/0000_baseline.sql:2565, `COUNT(*) as count ... FROM outreach_attempt oa`) for non-message campaigns. So the screen compares a count of queue rows with a count of attempt rows, and they can only agree if there is exactly one attempt per contact. The report says the agent pressed hang up several times, and the breakdown says 2, so something produced two attempt rows — or one attempt plus a duplicate. I could not find it: the repeated-hangup guard in app/hooks/call/useCallHandling.ts:408-426 returns early without a server call when there is no active call, and the server-side /api/hangup is guarded (Twilio error 21220 is swallowed at app/routes/api+/hangup.action.server.ts:43-47, and the disposition update is scoped to the attempt and described as terminal-guarded at :67-80). Also unexplained: completedCount is 0, meaning the queue row was never dequeued, yet a disposition of completed exists. The remote-hangup button symptom is separately known and already guarded (the #1292 comment at useCallHandling.ts:409-412), so the visible half may already be fixed while the numbers half is not.
- Current behavior: One contact, one call, the contact hangs up remotely, the agent presses hang up repeatedly: the headline reads 'Contacts Completed: 0 of 1' with a 100.0% completion rate, and the disposition bar reads 'Completed 2 (100.0%)'.
- Root cause: Not established. Two candidate causes, and the repro distinguishes them. (a) A write-side duplication: something creates a second outreach_attempt row for the same contact in the same campaign, so the row count is 2 while the contact count is 1. (b) An aggregate-unit mismatch only: the queue row was never marked dequeued (so completedCount is 0) while one or more attempts carry a completed disposition, and the 2 comes from two attempts created by the dial, not by the hang-up presses. (b) is the more likely reading of completedCount=0, and it would mean the real defect is a dequeue that never happens, not a hang-up that happens twice.
- Resolution: Reproduce first, then choose. Steps: (1) create a 1-contact call campaign, launch it, dial, let the contact answer, then hang up remotely from a second handset; (2) press hang up in the agent UI two or three times and note whether the button is still enabled and what the network tab shows for each press; (3) open the Results tab and record both numbers. Then, for that campaign id, query campaign_queue for the row (queue_state, dequeued_at), outreach_attempt for every row (id, contact_id, disposition, created_at) and call for every row (outreach_attempt_id, duration). The reading decides the fix: two attempt rows for one contact means a write-side duplication to find in the dial/hangup path and the aggregate is right; one attempt plus queue_state still 'queued' means the dequeue never ran, which points at dequeueQueueEntry in /api/hangup (app/routes/api+/hangup.action.server.ts:59-66) failing silently for this path — note it dequeues by contactId with a household-fanout branch, and an early return or a swallowed error there would produce exactly completedCount=0. If the numbers are right and only the units differ, the fix is in the presentation: state the unit ('contacts' versus 'attempts') or make the breakdown count distinct contacts. Do not change get_campaign_stats on the strength of a screenshot.
- Look in: `app/components/campaign/home/CampaignHomeScreen/ResultsScreen.tsx:51-64 (the two numbers side by side)`, `app/lib/campaign-queue-search.server.ts:265-267 and :338-342 (completedCount = dequeued queue rows)`, `drizzle/0000_baseline.sql:2495-2571 (get_campaign_stats, COUNT(*) over outreach_attempt rows for non-message campaigns)`, `app/routes/api+/hangup.action.server.ts:49-81 (dequeueQueueEntry by contactId, then the attempt disposition update)`, `app/hooks/call/useCallHandling.ts:404-426 (the #1292 stale-hangup guard) and app/hooks/call/useCallScreen.ts:178`, `app/lib/dequeueQueueEntry in app/lib/campaign-queue-db.server.ts (the fanout branch that could fail silently)`
- Existing tests: test/integration-db/campaign-completion-gate.test.ts; test/integration-db/dequeue-contact-assigned.test.ts; test/integration-db/call-status-guard.test.ts; test/ui/call-lifecycle-regression.test.tsx
- Missing tests: no test asserts that a remote hangup followed by repeated agent hang-up presses leaves exactly one attempt row and one dequeued queue row; no test asserts that the results headline and the disposition breakdown agree for a 1-contact campaign — this is the assertion that would have caught the report; no test covers a /api/hangup for an already-ended call, which is the exact path the repro exercises; no test asserts that a failed dequeueQueueEntry surfaces rather than resolving quietly; no test pins the unit of the disposition breakdown (attempts versus contacts), so the two numbers can drift apart freely
- Done when: The exact reproduction is recorded with the campaign_queue, outreach_attempt and call rows for the campaign; A 1-contact campaign whose contact hangs up remotely shows the same contact count in the headline and in the disposition breakdown; Repeated hang-up presses after a remote hangup do not create additional attempt or queue rows; The disposition breakdown's unit is stated in the UI or in code, and the headline and the breakdown cannot contradict each other; The fix lands with a test that fails against the current behaviour
- Tracker: Needs reproduction, not fix now. The inconsistency is confirmed but the cause is not, and there are two candidate causes whose fixes are opposites: one is a duplicated write, the other is a write that never happens. Guessing here would change either a write path or an aggregate on the strength of a screenshot. The repro is three queries and about ten minutes. Also file the remote-hangup button symptom separately if the repro shows it still reproduces, since the existing #1292 guard suggests that half may already be fixed.

### [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) Instrument and attribute the ~4s IVR option-press to next-block gap
- Verdict: **Needs reproduction** · Size: S · Risk: low · Labels: ux · Assignee: none · Updated: 2026-09-25
- No issue body. The one comment attributes the gap to the flow-entry redirect hop or per-request media render in #1842, but this is the response->block hop after a key press, a path #1842 does not measure.
- Current behavior: Pressing an option POSTs to response.action (outreach read/write, findNextStep), which redirects; Twilio then calls the block route, which re-fetches call and campaign in series and renders audio.
- Root cause: Not confirmed. Candidates: the response->block double round-trip, serial findCallBySid + fetchCampaignWithScript, and MP3 transcoding.
- Resolution: Add structured timing logs at option received, response TwiML returned, next-block request, and first audio. Attribute the gap from real review-env calls, then either fold into #1842 or open a scoped PR. Do not close on the likely-cause comment alone.
- Look in: `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId/$blockId.action.server.ts`, `app/routes/api+/ivr/$campaignId/$pageId.action.server.ts`, `app/lib/ivr-block-runtime.server.ts`
- Existing tests: test/ivr-block-response.route.test.ts; test/ivr-block.route.test.ts; test/ivr-page.route.test.ts
- Missing tests: latency attribution from option-press to next-block first audio
- Done when: Measured option-press -> next-block first-audio, before and after; Chosen fix under 2s without regressing #1842/#1864; Root cause recorded, or folded into #1842 with evidence
- Tracker: needs-repro: likely shares the per-request render root cause with #1842 but different hop. Measure before merging the tickets.

### [#1110](https://github.com/chester-hill-solutions/callcaster/issues/1110) Reproduce and split the onboarding number-step defects
- Verdict: **Needs reproduction** · Size: S · Risk: medium · Labels: needs-repro · Assignee: none · Updated: 2026-09-25
- Parent for number-step issues; the body has no current defect details and children #1111/#1112/#1114 are closed.
- Current behavior: OnboardingFirstNumberStep is a large combined flow (service address, rental, verification, routing); no component UI test exists.
- Root cause: Cannot be determined from the open issue; needs reproduction.
- Resolution: Record viewport/role/goal/browser/steps for each observed defect, split unrelated defects into separate issues, and add a regression test per confirmed behavior.
- Look in: `app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx`
- Existing tests: wizard step ordering only
- Missing tests: component render for the step
- Done when: Each defect recorded with steps; Unrelated defects split; Regression test per defect
- Tracker: Reproduce and split; overlaps #1205/#1113/#1318.

### [#1615](https://github.com/chester-hill-solutions/callcaster/issues/1615) shad-cc tsup build is not deterministic, so its vendored dist cannot be drift-checked
- Verdict: **Needs reproduction** · Labels: none · Assignee: none · Updated: 2026-09-25
- PR #1621 added a warn-only shad-cc rebuild check. The latest report found 12 identical builds, but enforcement is still disabled.
- Resolution: Gather clean CI build evidence, then make enforcement its own PR. Do not close based only on the diagnostic PR.
- Look in: `scripts/check-vendor-dist-drift.mjs`

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

### [#1670](https://github.com/chester-hill-solutions/callcaster/issues/1670) phone number search is too strict
- Verdict: **Needs reproduction** · Labels: ux · Assignee: none · Updated: 2026-09-23
- Searching Pickering does not find South Pickering. PR #1675 changed rate-centre display names; it did not prove search matching.
- Resolution: Compare the submitted locality with provider results and determine whether the provider supports partial matching before changing the search contract.
- Look in: `app/components/phone-numbers/NumberPurchase.tsx`, `app/lib/number-locality.ts`

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

---

## Needs decision — 46

Product, security, or operations decision required before implementation can be scoped.

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

### [#2029](https://github.com/chester-hill-solutions/callcaster/issues/2029) Decide the release list and the retention policy for unused dev-environment Twilio numbers
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-02
- An operations task, not a code change, and it is waiting on two things rather than on engineering. The screenshot shows 76 numbers in the dev account at $86.20/month, plus 4 number-setups at $0. The body names the three numbers Sai uses (2608141501, a 2026 Municipal Ward 19 NES campaign, a HESC Phone Bank) and asks @wra-sol to say which workspaces Arfin wants kept; everything else is proposed for release. Two decisions are open. First, the list: Arfin's workspaces are not in the issue, so the release set is undefined. Second, and more important, there is no stated rule for what makes a dev number safe to release, and no automated check — a number that is still referenced by a workspace_number row, a campaign sender, a messaging service, a caller ID, or a verification in progress will break on release, and in a dev environment that breakage is discovered by the next person who uses it. There is a number lifecycle in the app (app/lib/number-rental-billing.server.ts handles suspension and release and notifies the workspace), but nothing there enumerates what a number is still referenced by.
- Current behavior: 76 numbers are held in the dev Twilio account; an unspecified subset is unused, and nobody can say which.
- Root cause: Dev numbers accumulate because renting is cheap and there is no reaper. The list of what is safe to release is held in people's heads and in Slack, not in the repo or the database.
- Resolution: Answer two questions and it becomes a 30-minute console task. (1) The release list: get Arfin's workspaces, then release every number not on the combined keep-list. (2) The safety rule, and this is the part worth writing down: what counts as 'in use'. The concrete options are (a) query the app for references — any workspace_number row not in a released state, any campaign using it as sender or caller ID, any messaging service with it attached, any caller-ID verification pending — and refuse to release a number with a live reference; (b) a time-based rule, release anything not rented in the last N days, accepting that a dormant campaign sender breaks; (c) purely manual, the operator eyeballs the console, which is what happens today and is how 76 accumulated. (a) is the only one that cannot break a workspace, and it is cheap because the reference check is a handful of queries over tables that already exist. Also decide whether dev numbers get a periodic reaper on the same rule, or whether this stays a one-off clean-up. Note the numbers in the keep-list are per-workspace, so record the mapping (number -> workspace) before releasing, otherwise the next clean-up starts from zero knowledge again.
- Look in: `app/lib/number-rental-billing.server.ts:170-200 (existing suspend/release lifecycle and its workspace notification)`, `app/lib/platform-workspace-numbers.server.ts (the workspace_number accessor to build the reference check on)`, `app/db/workspace-scoped-tables.ts (workspace_number, campaign, workspace_audio — the tables a reference check must cover)`, `app/routes/admin+/workspaces/$workspaceId/twilio/ (the admin Twilio panels; no release action exists there today)`
- Missing tests: no check reports which numbers in an account are referenced by a live workspace record, which is the check that would make this repeatable; no test covers a release that is refused because a reference exists; no test asserts that a released number cannot still be selected as a campaign sender
- Done when: Arfin's keep-list is recorded in the issue, with the workspace each kept number belongs to; Every number released is confirmed to have no live workspace reference, checked by query and not by eye; The kept numbers are confirmed still working after the release run; The rule for 'in use' is written down, with the chosen option; A decision is recorded on whether the clean-up repeats on a schedule or stays a one-off
- Tracker: Needs decision, and it is a short one. The engineering is a console exercise; what is genuinely unresolved is the safety rule, and getting that wrong breaks a dev workspace in a way nobody notices until later. If the answer is 'a reference check first', that is worth filing as its own small issue, because it makes every future clean-up safe and is more valuable than this particular release.

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

### [#1699](https://github.com/chester-hill-solutions/callcaster/issues/1699) IVR script refers to the recipient as the "caller" in "caller response"
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: ux · Assignee: @sai-sy · Updated: 2026-09-27
- Terminology question: in the IVR Gather semantics the interacting party is the 'caller' on the keypad, so 'caller response' is defensible. Product must pick the canonical term and the sweep scope before any rename.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

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

### [#2036](https://github.com/chester-hill-solutions/callcaster/issues/2036) Decide the scope of flattening the call screen: the call screen only, or the shared workspace panel every page uses
- Verdict: **Needs decision** · Size: S · Risk: low · Labels: design · Assignee: none · Updated: 2026-09-25
- The complaint is clear and both named surfaces are real, but the outer card is not owned by the call screen — it is the shared workspace panel, so 'remove the rounded edges and drop shadow' is a choice about blast radius, not a local edit. The top bar is local: app/components/call/CallScreen.Header.tsx:239 is a sticky header with rounded-xl, border, shadow-sm and a backdrop blur, and that is the campaign details/settings bar in the screenshot. The outer card is app/routes/workspaces+/$id.tsx:206, a single className string that gives every workspace page its panel: `min-w-0 flex-1 lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card/70 lg:p-6 lg:shadow-sm ...`, and the same file already branches on isChatsScreen (:204-207) so a call-screen branch is available. The issue's broader point is also a design-system one: cards are fine as containers, but their default treatment should be overridable per site.
- Current behavior: The live calling screen stacks three card treatments — the workspace panel, the sticky top bar, and inner section cards — and the invisible ones still cost padding.
- Root cause: The workspace panel treatment is a single shared className with no per-surface override, and the top bar re-states rounded/border/shadow locally. Two owners for the same visual concept, so the call screen cannot opt out.
- Resolution: Decide the scope, then it is a small edit either way. Option A (call screen only): add an isCallScreen branch next to the existing isChatsScreen branch at app/routes/workspaces+/$id.tsx:204-207 that drops rounded-2xl, border and shadow-sm and reduces p-6 for the call route, and flatten the sticky header at CallScreen.Header.tsx:239. Nothing else on the product changes; the risk is that the call screen now looks different from every page beside it. Option B (whole product): flatten the shared panel for all workspace routes, so the page is a flat canvas and cards mean something when they appear. Bigger visual diff, needs a pass over every workspace page to check what depended on the panel's padding, but it is the version that actually establishes 'a card is a deliberate container'. Option C (middle): keep the panel as-is and change the top bar only, which fixes the half the reporter named twice but leaves the outer card. Whichever is chosen, express it as a variant on the panel rather than a route-conditional className string, so the next surface can opt out without editing a ternary. Also decide the padding: the reporter asks to 'punch back' the padding the invisible cards were creating, which means auditing the space-* classes between the panel and the first inner card as part of the change, not just deleting rounded and shadow.
- Look in: `app/components/call/CallScreen.Header.tsx:239 (the sticky top bar: rounded-xl, border, shadow-sm, backdrop-blur)`, `app/routes/workspaces+/$id.tsx:202-208 (the shared workspace panel, with the isChatsScreen branch as the pattern for a call-screen branch)`, `app/components/call/CallScreen.Layout.tsx:191 (the call screen's own space-y-6, the padding the invisible cards create)`, `app/components/call/CallScreen.Coaching.tsx:53,73 and CallScreen.DTMFPhone.tsx:22 (inner cards, which the issue says to keep)`
- Existing tests: test/ui/call-screen-header.test.tsx (CampaignHeader only); test/ui/call-screen-callarea.test.tsx, call-screen-queuelist.test.tsx (inner cards)
- Missing tests: no test asserts the call screen's panel treatment, so a regression to the nested-card look passes silently; no visual or class-level test would catch a re-introduced rounded/shadow on the top bar
- Done when: The chosen scope is written down, and the panel treatment is a named variant rather than a route-conditional className string; The named surfaces (outer card, top bar) have no curved edges or drop shadow; The padding the removed cards were creating is punched back, verified by measuring the gap at the top of the call screen; Inner section cards keep their treatment — they are the containers that should still read as cards; No other workspace page changed unintentionally, or changed deliberately and listed
- Tracker: Needs decision, briefly, then fix. The implementation is an hour either way; what is unresolved is whether this is a call-screen change or a product-wide one, and picking wrong means either an inconsistent product or an unreviewable visual diff across every page. The reporter's phrasing ('the call screen has the page, an outer card, and inner cards') reads as a call-screen complaint, which points to Option A, but the outer card is shared and the reporter may not know that. Answer that one question and this becomes a fix-now.

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

### [#1983](https://github.com/chester-hill-solutions/callcaster/issues/1983) Receipts and charges should include tax
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Product/legal decision: receipts currently show untaxed charges. Adding tax display (and taxing charges) needs a jurisdiction/tax-configuration decision (rates, exemptions, remittance) before implementation.
- Current behavior: Billing shows amounts without tax; receipts have no tax line; ledgers store pretax totals.
- Resolution: Decide: (1) tax on CallCaster charges scope (which products, jurisdictions, rate config), (2) display-only receipts vs taxed ledger amounts. Then implement in the receipt builder + pricing path.
- Look in: `app/routes/api+/workspaces+/$workspaceId/billing/receipt.route.tsx`, `shared/pricing.ts`
- Done when: No implementation until the tax decision is recorded

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

### [#1858](https://github.com/chester-hill-solutions/callcaster/issues/1858) Unify IVR and live script blocks and define prompt, multi-select, input, and end-call semantics
- Verdict: **Needs decision** · Size: XL · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Umbrella request to align the IVR script model with the live-call script model and add block kinds: prompt-only, multi-select with an explicit 'do nothing' default, free input with a stop key, end-call options, and a per-block default go-to.
- Current behavior: IVR scripts use IvrBlock; live scripts use a separate instruction/multi-select model. There is no prompt-only block, no stop-key input block, no end-call block, and no general per-block default destination beyond noInput.
- Root cause: Two parallel script models and undefined block semantics.
- Resolution: Decide the unified block model, the default 'do nothing' behaviour, and stop-key/end-call semantics first; record the decision, then split into tracer-sized tickets (one block kind each).
- Look in: `app/components/campaign/settings/script/`, `app/lib/ivr-block-runtime.server.ts`, `app/lib/ivr-gather.server.ts`, `app/lib/campaign-ivr.server.ts`, `app/db/schema-campaign.ts`
- Existing tests: test/ivr-block-runtime.test.ts; test/ivr-gather.test.ts; test/ui/script-block-editor-ivr.test.tsx
- Missing tests: Default go-to when the caller gives no input; Input block stop-key handling; End-call block routes/hangs up as authored
- Done when: Product decision recorded for the unified block model and defaults; Blocks split into ticket-sized units before implementation; Prompt, multi-select, input, and end-call semantics specified with a default do-nothing path
- Tracker: Decision first, then split. Related: #1862, #1741. #1856 and #1841 are already fixed on dev and should not be re-done.

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

### [#1771](https://github.com/chester-hill-solutions/callcaster/issues/1771) feature(audience): per-row import error report + original CSV artifact
- Verdict: **Needs decision** · Size: S-M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Persist per-row failures (rowNumber + field + reason) during the audience import job and expose a reviewable list; store the original CSV at a workspace-scoped artifact path.
- Current behavior: Only aggregate counts (skipped invalid/duplicate) are surfaced; original file not retained.
- Root cause: No per-row capture or artifact retention, unlike gocanvass.
- Resolution: Record per-row errors in the job; surface in the progress/completion panel; upload original.csv under {ws}/{importId}/ with existing guards.
- Look in: `app/lib/audience-upload-process.server.ts`, `app/components/audience/AudienceUploader.tsx`, `app/lib/object-storage.server.ts`
- Missing tests: per-row errors persisted + listed; original retained under workspace prefix
- Done when: reviewable per-row failure list or download; original CSV retained safely; aggregate counts unchanged
- Tracker: Co-ordinate with #1770.

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

### [#1742](https://github.com/chester-hill-solutions/callcaster/issues/1742) feature(ivr): preview Speak (TTS) steps in the script editor
- Verdict: **Needs decision** · Size: M · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Spoken IVR steps have no in-editor preview; recorded steps do. Add a Preview control that plays the text in the selected Polly voice.
- Current behavior: No TTS preview endpoint; text+voice only materialise when Twilio runs the call.
- Root cause: Feature gap.
- Resolution: Add a workspace-gated route using AWS Polly SynthesizeSpeech (voices are Polly ids) + a preview control in SpokenStepFields; AWS creds need polly:SynthesizeSpeech.
- Look in: `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`, `app/lib/tts-voices.ts`, `app/routes/workspaces+/$id/audios/$fileName.preview.loader.server.ts`
- Missing tests: preview plays selected voice text; membership enforced
- Done when: Speak step previews audibly; voice matches the block; workspace-gated
- Tracker: Confirm provider (Polly vs ElevenLabs) then implement.

### [#1741](https://github.com/chester-hill-solutions/callcaster/issues/1741) change(ivr): make simple/complex a script property, not a campaign type
- Verdict: **Needs decision** · Size: S-M · Risk: low · Labels: none · Assignee: none · Updated: 2026-09-25
- Campaign setup offers Simple IVR vs Complex IVR, but the runtime treats both identically; complexity belongs to the script (one page vs menus).
- Current behavior: CampaignBasicInfo.SelectType exposes simple_ivr/complex_ivr; dispatch/execution treat them the same.
- Root cause: Design decision.
- Resolution: Decide: single IVR option at campaign setup; campaign_type simple_ivr/complex_ivr kept for existing rows and possibly derived from the script.
- Look in: `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`, `app/lib/campaign-execution.server.ts`, `app/db/schema.ts`
- Existing tests: test/ui/campaign-* type selection
- Done when: campaign setup asks IVR once; no behavioural difference to lose
- Tracker: Product decision first; storage/UI change after.

### [#1347](https://github.com/chester-hill-solutions/callcaster/issues/1347) Robocall vs IVR vs Automated Phone Menu — terminology consistency
- **IN PROGRESS** · Verdict: **Needs decision** · Size: S · Risk: medium · Labels: design · Assignee: none · Updated: 2026-09-25
- Consistency audit for customer-facing naming. #1854 (API type robocall) and #1741 (one automated phone menu) set the direction, but UI still mixes terms: 'Robocall' appears in CampaignLaunch.tsx, CampaignLaunchExtras.tsx, CampaignVoiceSettings.tsx, SelectType.tsx, while the product language moved to 'automated phone menu'. Decide the canonical customer term + sweep scope.
- Current behavior: Mixed labels (Robocall/IVR/automated phone menu) across campaign setup surfaces.
- Resolution: Decide the canonical term (suggestion: 'Automated phone menu' in UI; 'robocall' stays the API value), then a copy sweep replacing IVR/Robocall labels.
- Look in: `app/components/campaign/settings/CampaignLaunch.tsx`, `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`, `app/components/campaign/settings/basic/CampaignVoiceSettings.tsx`, `app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`
- Done when: One customer-facing term; API values unaffected

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

### [#1320](https://github.com/chester-hill-solutions/callcaster/issues/1320) ops(twilio): migrate one CHS number with callback and database reconciliation
- Verdict: **Needs decision** · Size: S-M · Risk: high · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-09-25
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

### [#1657](https://github.com/chester-hill-solutions/callcaster/issues/1657) Admin Twilio portal page is overwhelming — group into sections/tabs
- Verdict: **Needs decision** · Labels: none · Assignee: none · Updated: 2026-09-25
- The admin Twilio page needs grouping. The issue explicitly requests confirmation of panel priorities before implementation.
- Resolution: Confirm the default tab and grouping, then ship a presentation-only PR.
- Look in: `app/routes/admin+/workspaces/$workspaceId/twilio`

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

### [#1722](https://github.com/chester-hill-solutions/callcaster/issues/1722) What does "kick off" on campaign launch pane do
- Verdict: **Needs decision** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- 'Kick off' button (running/paused) has no explanation and Sai 2026-09-09 confirms confusion; product decides label/tooltip/placement.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

### [#1355](https://github.com/chester-hill-solutions/callcaster/issues/1355) Rename the Railway staging environment to "qa" (still tracking master)
- **IN PROGRESS** · Verdict: **Needs decision** · Labels: devops/admin · Assignee: @sai-sy, @wra-sol · Updated: 2026-09-25
- The current topology is dev→dev and master→staging/production. The request only renames staging to qa; there is no qa branch.
- Resolution: Verify a safe in-place rename before changing IaC. Do not recreate the environment.
- Look in: `.railway/environments/staging.ts`

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

---

## Blocked / split first — 40

Blocked by other open issues, or too large for one agent. Split or unblock before assigning.

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

### [#2213](https://github.com/chester-hill-solutions/callcaster/issues/2213) Correct the remaining temporal column types listed in the schema drift baseline
- Verdict: **Blocked / split first** · Size: L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
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
- Verdict: **Blocked / split first** · Size: S-M · Risk: low · Labels: devops/admin · Assignee: @wra-sol · Updated: 2026-10-02
- The read-only report and historical number cull are complete. Durable keep-list storage, name backfill and the repeat policy remain, with workspace-row cleanup explicitly deferred.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The read-only report and historical number cull are complete. Durable keep-list storage, name backfill and the repeat policy remain, with workspace-row cleanup explicitly deferred.
- Root cause: No tooling existed to decide what could be culled, and no recorded rule to make the decision repeatable. The name-fragment junk exclusion is deliberately a --exclude flag rather than hardcoded, because it is a judgement call rather than a rule.
- Resolution: Report tool and the historical number cull are complete. Split durable keep-list configuration, name backfill and repeat policy into separate work. Workspace-row deletion was deferred in the issue discussion. Recheck current ownership before any new live cleanup.
- Look in: `scripts/cull-report.mjs:1`, `app/lib/twilio-resource-name.ts:1`, `scripts/cull-report.mjs (read-only cull tool, merged #2171)`, `app/lib/twilio-resource-name.ts (naming helper, merged #2167)`, `app/lib/database/workspace-twilio-subaccount.server.ts (subaccount create path the backfill mirrors)`
- Blocked by: [#2170](https://github.com/chester-hill-solutions/callcaster/issues/2170)
- Existing tests: cull-report.mjs handles 555-number test credentials, the E911 VERIFY line, cross-workspace-only blockers, and compares dates rather than strings
- Missing tests: Keep-list lookup must protect an explicitly kept phone-named workspace; name backfill must be idempotent.
- Done when: Subaccount display names are backfilled to the #2167 format; The keep-list lives in the repository, not a shell argument; 2608141501 survives, since it is on both the keep-list and the phone-number-named rule; The cull report remains read-only with no delete path
- Tracker: Blocked / split first: keep-list/repeat policy and external name writes are separate concerns. Related PR evidence: #2171, #2167. A PR reference alone does not prove deployed behavior.

### [#1885](https://github.com/chester-hill-solutions/callcaster/issues/1885) Retire the remaining auth schema after dependency verification
- Verdict: **Blocked / split first** · Size: M-L · Risk: high · Labels: none · Assignee: none · Updated: 2026-10-02
- Partial fix only. Dead RPC removal and both actor rewrites are on dev; legacy auth shim remains and the fail-closed schema drop is absent. Issue discussion requires production dependency verification before the drop.
- Current behavior: Source audit: dev@5b673c81, 2026-10-02. The two live RPCs now use app.current_user_id and get_outreach_attempts is dropped; auth.uid() is still created and schema auth remains to be retired.
- Root cause: The live RPC actor rewrites and dead RPC removal shipped. The baseline shim still creates auth.uid(), and the final dependency guard and schema retirement remain unshipped.
- Resolution: Remaining work only: ship a dependency guard, verify all production dependencies/data, then release the schema drop separately and retire the bootstrap shim.
- Look in: `client/migrations/20260920120100_rewrite_manual_dial_claim_actor.sql:23`, `client/migrations/20260920120200_rewrite_last_access_actor.sql:18`, `drizzle/0001_auth_uid_shim.sql:2`, `scripts/db/bootstrap-fresh-db.mjs:120`, `app/lib/db-rpc.server.ts`, `drizzle/0001_auth_uid_shim.sql`, `drizzle/0000_baseline.sql`, `client/migrations/20260807130000_manual_dial_claim_attempt_count.sql`, `client/migrations/20260715140000_drop_legacy_rls.sql`, `scripts/db/check-db-orphans.mjs`, `scripts/db/bootstrap-fresh-db.mjs`, `scripts/e2e/bootstrap-compose-db.mjs`
- Existing tests: test/queue-rpc-contract.test.ts; test/db-rpc-claim-queue-entry.test.ts; test/db-rpc-outreach-attempt.test.ts; test/atomic-manual-dial-claims.integration.test.ts
- Missing tests: No legacy-auth SQL guard is present on dev. Existing queue contract tests need latest-definition and actor/no-actor coverage. Database state was not queried in this read-only code audit.
- Done when: A dependency guard fails before any destructive operation when non-auth functions, policies, views or other schema objects still depend on auth.; Production dependencies and data-retention requirements are verified before the schema drop.; Guard and schema drop follow the separate release steps recorded in the issue.; The two rewritten RPC flows retain actor and missing-actor behavior.; A fresh bootstrap does not recreate auth.uid() after retirement.
- Tracker: Blocked / split first. Chunks 1–2 shipped in #1966. The 2026-09-28 issue comment explicitly requires production checks and separate guard/drop release work; do not merge the old chunk-3 branch as-is. Related PR evidence: #1966, #1887. A PR reference alone does not prove deployed behavior.

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

### [#2010](https://github.com/chester-hill-solutions/callcaster/issues/2010) auth pages: scrollbar appears even though the page fits the viewport
- Verdict: **Blocked / split first** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-27
- The sign-in and sign-up pages show a scrollbar even though the content fits within the viewport height. Grouped under the auth-pages epic (#2057).
- Current behavior: A vertical scrollbar renders on pages whose content should fit.
- Root cause: Most likely an over-sized form container rather than genuinely long content.
- Resolution: Blocked by #2013. Fix the shared container geometry first, then re-check. If the scrollbar is gone, close this as resolved-by rather than carrying a separate fix for a symptom that no longer exists. If it persists, reopen with the specific remaining cause rather than assuming it is the same issue.
- Look in: `app/routes/account.sign-in.*`, `app/routes/account.sign-up.*`, `app/components/shared/AuthCard.tsx`
- Blocked by: [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013)
- Missing tests: no scrollbar at 1x viewport height; regression guard once the container is fixed
- Done when: No scrollbar at the supported viewport range; Either closed as resolved by #2013, or reopened with the specific remaining cause
- Tracker: Suspect this closes for free with #2013. Do not fix it first — a scrollbar fix that is really a layout fix will be undone by the next alignment change.

### [#2031](https://github.com/chester-hill-solutions/callcaster/issues/2031) Sweep: authorization checks a permission, not a broad role
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
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

### [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030) Spike: weigh permission models against what the auth system already provides
- Verdict: **Blocked / split first** · Size: M · Risk: low · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- The root of the authorization cluster and the first thing that must land. The issue text is explicit: before making implementation and architecture decisions, weigh the options and investigate what systems the codebase already has in place, and what the tools being used — better-auth — can provide. Everything else in the cluster is unspecified until this reports.
- Current behavior: Unknown until investigated. The risk is building a hand-rolled permission layer over an auth system that already has an administration/permission plugin, which is the most expensive possible outcome here because it doubles the model and leaves two sources of truth.
- Root cause: Roles were adopted as the model without first checking whether a permission primitive was available.
- Resolution: Produce a written recommendation, not code. Cover: what better-auth already provides for roles and permissions, including its admin plugin, and whether it is already installed or only nominally a dependency; what the codebase already has, since the tenant-scoped client and the middleware boundary are a de facto authorization layer; the realistic options with their migration cost; and a recommendation with the reason. State explicitly what was ruled out and why, so the next person does not re-derive it.
- Look in: `package.json (better-auth version and plugins in use)`, `app/lib/admin-middleware.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/server/tenant-db.ts`, `app/lib/data-plane-middleware.server.ts`
- Done when: A written recommendation exists, reviewed before any implementation begins; better-auth permission capabilities are established from the installed version, not from documentation memory; Existing in-repo authorization is inventoried so it is extended rather than duplicated; Ruled-out options are recorded with reasons
- Tracker: Highest value-per-size item in the entire board, and it blocks five others. Do this before writing any authorization code anywhere. Sizing is M because it is investigation, not implementation — the implementation is the XL.

### [#2011](https://github.com/chester-hill-solutions/callcaster/issues/2011) auth pages: sign-up is missing the background mural that sign-in has
- **IN PROGRESS** · Verdict: **Blocked / split first** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-25
- The sign-up page lacks the background mural treatment the sign-in page already uses. Grouped under the auth-pages epic (#2057).
- Current behavior: Sign-in has a background mural; sign-up does not.
- Root cause: The treatment was applied to one route only.
- Resolution: Blocked by #2013 so the final visual pass sees the finished layout. Apply the same treatment to sign-up, ideally by extracting it so the two pages cannot drift apart again.
- Look in: `app/routes/account.sign-in.*`, `app/routes/account.sign-up.*`
- Blocked by: [#2013](https://github.com/chester-hill-solutions/callcaster/issues/2013)
- Missing tests: both routes render the mural treatment
- Done when: Sign-up renders the same mural treatment as sign-in; The treatment is shared, not duplicated per route
- Tracker: Trivial, but land it after #2013 so nobody has to re-verify alignment afterwards.

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
- Resolution: Blocked by #2030, which supplies the permission vocabulary. Then: write the default capability set down as data, not as scattered conditionals; enforce at the route for every surface in the set, so hiding the sidebar and refusing the URL are the same rule applied twice; and confirm the 403 requirement, noting it differs from the 404-for-non-members convention in AGENTS.md — that convention is about workspace membership, whereas this is about a known member lacking a capability, so 403 is defensible here. Worth deciding that boundary explicitly rather than by accident.
- Look in: `app/components/layout/WorkspaceSidebar.tsx`, `app/lib/workspace-middleware.server.ts`, `app/routes/workspaces+/$id/**`, `app/db/workspace-scoped-tables.ts`
- Blocked by: [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030)
- Missing tests: each capability has a route-level enforcement test; sidebar visibility and route enforcement agree
- Done when: The Agent capability set is written down as data, not scattered conditionals; Every denied surface returns 403 on a direct URL attempt, not only when hidden; The 403-versus-404 boundary is decided and documented rather than incidental; Sidebar visibility and route enforcement read from the same source
- Tracker: This is the product decision the cluster is really waiting on. The defaults in the issue are a proposal, not a decision — get them confirmed before building enforcement, or the enforcement work gets thrown away when the policy changes.

### [#2003](https://github.com/chester-hill-solutions/callcaster/issues/2003) Agent role can reach the billing page by URL even though the sidebar link is hidden
- Verdict: **Blocked / split first** · Size: S · Risk: medium · Labels: business-logic · Assignee: none · Updated: 2026-09-25
- A concrete live instance of the gap the cluster is about. The Credits entry is correctly absent from the sidebar for the Agent role, but an Agent who types the billing path directly reaches the page. Hiding a link is not access control.
- Current behavior: Sidebar hides the link; the route does not enforce the permission. The route renders.
- Root cause: UI visibility was treated as the control. The route has no permission check for this resource.
- Resolution: Blocked by #2030, because the right fix is a permission check and which permission depends on the model. When it lands: the route must enforce, not merely render, and a direct URL request must be refused. Note the existing convention from AGENTS.md — a non-member gets a uniform 404 rather than a 403, to avoid workspace-id inference, so match whatever the sibling billing routes already do rather than inventing a response shape.
- Look in: `app/routes/workspaces+/$id/billing.*`, `app/components/layout/WorkspaceSidebar.tsx`, `app/lib/workspace-middleware.server.ts`
- Blocked by: [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030)
- Missing tests: an Agent requesting the billing path directly is refused
- Done when: An Agent requesting the billing path by URL is refused; The refusal matches the convention used by sibling routes (404 for non-members); The check is a permission check at the route, not a UI-visibility check
- Tracker: The smallest concrete instance of the cluster and the easiest to verify, so it makes a good first implementation once #2030 reports. Keep it separate from the model work so the model is not judged by one route.

### [#2002](https://github.com/chester-hill-solutions/callcaster/issues/2002) epic(authz): permission-based authorization instead of role checks
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: ux, business-logic · Assignee: none · Updated: 2026-09-25
- Parent of the authorization cluster. The product currently gates on three broad roles — Admin sees and edits everything, Coordinator sees and edits campaigns and agents, Agent can join campaigns — and the request is to move to permissions applied to people, with the existing roles kept as default groupings. Explicitly excludes UX around building grouped access policies: plan and implement the permission model first.
- Current behavior: Access is decided by comparing a role string. Route loaders and actions check the role, not whether the specific action is permitted.
- Root cause: Authorization was modelled as a role comparison from the start and every check since has followed that shape.
- Resolution: Do not start here. Blocked by #2030, because the issue text for #2030 is explicit that the implementation and architecture decisions need the options weighed first against what better-auth already provides. The sequencing is: #2030 investigates and recommends, then #2003 and #2008 can be specified, #2009 builds on #2008, and #2031 is the codebase-wide consistency sweep that lands last because it depends on the model existing everywhere.
- Look in: `app/lib/admin-middleware.server.ts`, `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/auth-layout.server.ts`, `eslint.config.mjs (no-restricted-imports, tenant boundary)`
- Blocked by: [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030)
- Missing tests: permission model exists; each permission has a test at the route that enforces it
- Done when: A permission model exists that roles map onto as default groupings; Authorization checks a permission rather than comparing a role string; Existing roles continue to work as groupings without a migration per user; No route is left checking a broad role where a specific permission is meant
- Tracker: Parent epic. Explicitly out of scope per the issue text: the UX for building grouped access policies. Do not begin implementation before #2030 reports.

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

### [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) Provision a CallCaster-qa Twilio account and point qa.callcaster.ca at it
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Create a dedicated Twilio account for QA (ideally via IaC) and repoint qa.callcaster.ca to use it.
- Current behavior: QA has no dedicated Twilio account; #1357 is open and is the prerequisite.
- Root cause: Environment-level Twilio credential separation has not been provisioned; blocked by the DNS/IaC task #1357 (itself blocked by #1355).
- Resolution: Decide manual vs IaC provisioning, create the CallCaster-qa Twilio account, store credentials as environment secrets/vars, and update the qa environment config. Then unblock #1828.
- Look in: `.railway/environments/`, `.railway/railway.ts`, `docs/twilio-runtime-inventory.md`, `docs/twilio-parent-ops-runbook.md`, `.github/workflows/railway-iac.yml`
- Blocked by: [#1357](https://github.com/chester-hill-solutions/callcaster/issues/1357)
- Missing tests: n/a (operations task)
- Done when: CallCaster-qa Twilio account exists and is documented; qa.callcaster.ca uses the QA account credentials; Credentials are stored as secrets/vars, not in the repo; IaC-vs-manual decision is recorded
- Tracker: blocked-epic: #1357 (qa DNS/IaC, blocked by #1355). Confirm the IaC-vs-manual decision when unblocked; this unblocks #1828.

### [#1828](https://github.com/chester-hill-solutions/callcaster/issues/1828) QA-environment PR acceptance suite against the smart test audience
- Verdict: **Blocked / split first** · Size: L · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
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

### [#1827](https://github.com/chester-hill-solutions/callcaster/issues/1827) Provision a CallCaster-dev Twilio account and point dev.callcaster.ca at it
- Verdict: **Blocked / split first** · Size: M · Risk: medium · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Create a dedicated Twilio account for the dev environment (ideally via IaC) and update dev.callcaster.ca to use it.
- Current behavior: There is no dedicated CallCaster-dev Twilio account; dev falls back to shared or main-account credentials. #1356 is open.
- Root cause: Environment-level Twilio credential separation has not been provisioned; blocked by the DNS/IaC task #1356.
- Resolution: Create the CallCaster-dev Twilio account, store the credentials as dev environment secrets/vars, and update the dev.callcaster.ca config. Then unblock #1826.
- Look in: `.railway/environments/dev.ts`, `.railway/railway.ts`, `docs/twilio-runtime-inventory.md`, `docs/twilio-parent-ops-runbook.md`
- Missing tests: n/a (operations task)
- Done when: CallCaster-dev Twilio account exists and is documented; dev.callcaster.ca uses the dev account credentials; Credentials are stored as secrets/vars, not in the repo; IaC-vs-manual decision is recorded
- Tracker: blocked-epic: #1356 (dev DNS/IaC) first. Confirm the IaC-vs-manual decision when unblocked; this unblocks #1826.

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

### [#1329](https://github.com/chester-hill-solutions/callcaster/issues/1329) feat(twilio-iac): add ownership manifest and read-only environment plan
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Roadmap for the Twilio environment program (IaC controller, accounts, cost, testing). Railway IaC is separate and done; no Twilio controller exists. Sub-issues were folded into this issue and are not implemented.
- Current behavior: Twilio operations are imperative workspace actions; workspace provisioning owns dynamic resources; no ownership manifest, plan artifact, or drift workflow.
- Root cause: Roadmap not started; too large for one agent.
- Resolution: First slice only: ownership manifest + read-only 'plan' command (no apply/delete/rental/prune). Later: account separation, state import, drift guardrails, cost inventory, Test Credentials + smoke tests.
- Look in: `app/routes/admin+/workspaces/$workspaceId/twilio.actions.server.ts`, `app/lib/platform-workspace-numbers.server.ts`, `scripts/railway/`, `.railway/README.md`
- Existing tests: none
- Missing tests: plan fixtures; destructive-change rejection; read-back verification
- Done when: Every managed resource has one env/owner/cleanup rule; Read-only plan compares declared vs actual; Plan cannot create/delete/rent; Secrets outside source and output
- Tracker: Split; first slice is M/medium. #1195 overlaps its testing section.

### [#1328](https://github.com/chester-hill-solutions/callcaster/issues/1328) feat(telephony): add provider factory and synthetic SMS transport (split further)
- Verdict: **Blocked / split first** · Size: XL · Risk: high · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- Build a gateway seam between CallCaster call/SMS paths and the provider, with a synthetic provider for local dev/tests (no Twilio credentials). Consolidates #1156/#1194/#1161.
- Current behavior: Workspace Twilio client hard-wired; IVR/number-rental call Twilio directly; SMS has a client-like seam; E2E mocks intercept browser HTTP only; Compose uses placeholder creds + disabled webhook validation.
- Root cause: No server-side provider abstraction.
- Resolution: Introduce a provider factory + synthetic SMS transport first; add voice and number rental as later slices. Provider selection explicit and fail-closed by environment.
- Look in: `app/lib/database/workspace.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/lib/platform-workspace-numbers.server.ts`, `app/lib/sms-send.server.ts`, `e2e/fixtures/twilio-mocks.ts`
- Existing tests: e2e mocks (browser-level only)
- Missing tests: server-side synthetic contract; status callback delivery; no external Twilio request assertion; synthetic number lifecycle
- Done when: Provider selection explicit and fail-closed; Synthetic sends create deterministic events without creds; Tests prove no Twilio network call; Real Twilio unchanged
- Tracker: Split: factory+SMS, voice, rental. Dependencies #1157/#1192/#1193.

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

### [#1157](https://github.com/chester-hill-solutions/callcaster/issues/1157) epic(testing): controlled synthetic campaign audiences
- Verdict: **Blocked / split first** · Size: L-XL · Risk: high · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
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
- Investigation spike to keep, replace, or front-run Twilio AMD. Acceptance requires measured time-to-first-audio and accuracy on the same call set, which depends on the instrumentation in #1842 and the live AMD scope in #1845.
- Current behavior: Every outbound path sends synchronous machineDetection: 'Enable'. No async AMD, no local classifier, no shadow mode.
- Root cause: Synchronous AMD adds seconds of dead air and caps accuracy at Twilio's engine; there is no measured baseline.
- Resolution: After #1842 instrumentation and #1845 land, run the spike: measure Twilio async AMD and one local/managed option on the same call set, evaluate the media-stream fork limit, write the report and an ADR with the accuracy/latency threshold, then a phased shadow-mode plan.
- Look in: `app/lib/auto-dial.server.ts`, `app/lib/campaign-ivr-dispatch.server.ts`, `app/lib/ivr-initiate.server.ts`, `app/routes/api+/dial/status.action.server.ts`, `app/db/schema.ts`, `docs/adr/0030-media-stream-bun-service-third-railway-process.md`, `docs/live-transcription-coaching-plan.md`
- Blocked by: [#1842](https://github.com/chester-hill-solutions/callcaster/issues/1842), [#1845](https://github.com/chester-hill-solutions/callcaster/issues/1845)
- Missing tests: Measured time-to-first-audio for sync vs async AMD and a local classifier; Classifier accuracy on human/machine/screening/beep/silence/fax; Media-stream fork/concurrency budget at target volume
- Done when: Written report with measured latency and accuracy for Twilio async AMD and one local option on the same call set; Recommendation with an accuracy-latency threshold and reconciliation/fallback policy; If replacing: an ADR and a phased plan starting in shadow mode
- Tracker: Blocked on #1842 instrumentation and #1845. Run as a scoped spike after those land; produce an ADR before any implementation.

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

### [#1645](https://github.com/chester-hill-solutions/callcaster/issues/1645) Campaigns: first-class "send a test to this number" for every campaign type
- Verdict: **Blocked / split first** · Labels: none · Assignee: none · Updated: 2026-09-25
- Message tests shipped in #1648 and voice/IVR tests in #1654. The remaining slice is live-call rehearsal.
- Resolution: Scope a separate live-call issue with isolation from queue, results and normal campaign metrics. Do not rebuild the shipped test-send paths.

### [#1357](https://github.com/chester-hill-solutions/callcaster/issues/1357) Point qa.callcaster.ca at the staging/qa environment (DNS + IaC)
- Verdict: **Blocked / split first** · Labels: devops/admin · Assignee: none · Updated: 2026-09-25
- The qa custom domain depends on the environment naming decision and DNS access. Staging continues to track master.
- Resolution: Resolve the naming decision, attach the domain through IaC, set DNS, and verify readyz externally.
- Look in: `.railway/environments/staging.ts`
- Blocked by: [#1355](https://github.com/chester-hill-solutions/callcaster/issues/1355)

### [#1752](https://github.com/chester-hill-solutions/callcaster/issues/1752) Standardize campaign completion exports (SMS report format)
- Verdict: **Blocked / split first** · Size: S · Risk: medium · Labels: none · Assignee: none · Updated: 2026-09-25
- Large multi-part export feature (PDF report with appendices + CSV + run/aggregation + inbound detail) referencing the Lee Fairclough format. Too large for one ticket — split PDF pipeline, CSV, and aggregation layers first.
- Done when: See rationale in .agent/board-dig-results.md
- Tracker: Lane set by 2026-09-12 board triage — confirm before implementing.

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

---

## Duplicates — 3

Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.

### [#2000](https://github.com/chester-hill-solutions/callcaster/issues/2000) Invite-accepted confirmation is an inline banner in the destructive tone; it should be a one-time green success toast
- Verdict: **Duplicates** · Size: XS · Risk: low · Labels: design · Assignee: @sai-sy · Updated: 2026-09-27
- Duplicate of: [#2032](https://github.com/chester-hill-solutions/callcaster/issues/2032)
- Same surface as #2032, and #2032 removes it. The invite acceptance renders through QueryParamBanner (app/routes/workspaces+/index.tsx:272-280), which draws a dismissible Alert with no variant (app/components/shared/QueryParamBanner.tsx:43-56). The Alert default is `border-brand-tertiary bg-brand-wash`, and in dark mode --brand-wash is hsl(340 28% 18%), a maroon, so a success message reads as a red error banner. That is the 'should be green' report exactly. Doing it as a colour change would only make the banner green and leave it persistent, shareable through the URL, and inconsistent with the toast pattern the rest of the app uses. One extra finding from the same code: the banner is an Alert, so it carries role="alert" and is beaconed by app/lib/flash-telemetry.client.ts to /api/workspaces/:id/client-flash as an error flash, so a successful invite acceptance is currently logged as an error.
- Current behavior: A maroon, dismissible, URL-replayable inline banner on the workspaces page announcing a successful invite acceptance.
- Root cause: One-time success state is carried in a shareable query parameter because there is no server-owned flash mechanism, and the tone is left to a primitive default that happens to be crimson in dark mode.
- Resolution: Do not implement separately. Fold the tone question into #2032 and close this one. #2032 replaces the banner with a server-owned, signed, one-time session flash that renders as toast.success, which is green by construction and drops the URL-replay and the false error-flash beacon at the same time. A colour-only fix here would be thrown away when #2032 lands. If #2032 is deprioritised and the banner has to stay for a while, the minimal correct interim is variant="success" on that Alert plus removing the role="alert" beacon pollution, and it should be filed as a comment on #2032 rather than a second PR.
- Look in: `app/routes/workspaces+/index.tsx:272-280 (the invite QueryParamBanner)`, `app/components/shared/QueryParamBanner.tsx:43-56 (the Alert with no variant)`, `vendor/chester-hill-solutions/shad-cc/src/components/ui/alert.tsx (default variant = border-brand-tertiary bg-brand-wash)`, `vendor/chester-hill-solutions/shad-cc/src/styles/theme.css:161 (--brand-wash dark = hsl(340 28% 18%))`, `app/lib/flash-telemetry.client.ts (role=alert surfaces are beaconed as error flashes)`
- Existing tests: test/accept-invite.route.test.ts:172 (asserts the current redirect URL, updated by #2032)
- Missing tests: no test asserts the invite success surface is a toast rather than a banner, so it can regress back without failing anything; no test asserts that a success surface is not beaconed to client-flash as an error
- Done when: Invite acceptance shows a green one-time success toast; The message does not replay on refresh or revisit; The success surface is no longer beaconed to client-flash as an error; No colour-only change is shipped on its own
- Tracker: Duplicate of #2032. Same component, same redirect, same root cause, and #2032 deletes the surface rather than recolouring it. Implement once, in #2032, and close this.

### [#1843](https://github.com/chester-hill-solutions/callcaster/issues/1843) IVR step no-input wait + next/goto (folds into #1883 and #1884)
- Verdict: **Duplicates** · Size: S · Risk: low · Labels: business-logic · Assignee: @wra-sol · Updated: 2026-09-25
- Duplicate of: [#1883](https://github.com/chester-hill-solutions/callcaster/issues/1883)
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

## Needs triage — 6

Open and not yet audited — no enrichment record. Assign a verdict in scripts/issue-board-enrichment/ before picking up.

### [#2303](https://github.com/chester-hill-solutions/callcaster/issues/2303) Extract safe-outbound-url to a shared package — three repos now need it, and two have written their own half
- Status: No status · Labels: none · Assignee: none · Updated: 2026-10-03
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2298](https://github.com/chester-hill-solutions/callcaster/issues/2298) Remove obsolete STRIPE_API_KEY configuration
- Status: No status · Labels: devops/admin · Assignee: none · Updated: 2026-10-03
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1832](https://github.com/chester-hill-solutions/callcaster/issues/1832) workspace setup sms goal continue with local number selected isn't visible on dark mode
- Status: No status · Labels: design · Assignee: @sai-sy · Updated: 2026-10-02
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#1668](https://github.com/chester-hill-solutions/callcaster/issues/1668) Error toasts should have sensible defaults for spacing. Adding an audio reveals lacking bottom spacing
- Status: No status · Labels: design · Assignee: none · Updated: 2026-10-02
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2239](https://github.com/chester-hill-solutions/callcaster/issues/2239) e2e toolchain step times out on a 62.8 MB ffmpeg apt download
- Status: No status · Labels: none · Assignee: none · Updated: 2026-10-01
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._

### [#2176](https://github.com/chester-hill-solutions/callcaster/issues/2176) The campaign-queue contact-id workspace guard exists in four places with three status codes, and two falsely reject a repeated id
- Status: No status · Labels: none · Assignee: none · Updated: 2026-09-28
- _No enrichment record yet — assign a verdict in `scripts/issue-board-enrichment/`._
