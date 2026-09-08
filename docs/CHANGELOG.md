# Changelog

Customer- and operator-facing changes, newest first. Every PR that changes app behavior adds a line under **Unreleased**; each dev → master release PR moves those lines into a dated section headed by the release PR. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Automated phone menu and advanced IVR scripts are edited as audio steps. Each step is a spoken step or a recording step and shows exactly what the caller hears: the text and voice to speak, or a library recording you can play back in the editor. Caller responses are keypad presses or any spoken reply, and adding a step no longer creates a silent form block. A step with no audio is flagged before you save ([#1325](https://github.com/chester-hill-solutions/callcaster/issues/1325)).

### Fixed

- A campaign URL with a malformed id (for example `/campaigns/blah`) now shows **Page not found** inside the workspace instead of "Something went wrong · Unexpected Server Error". The campaign, queue, settings, script editor, call screen and audience-upload loaders reject a non-numeric id before querying ([#1682](https://github.com/chester-hill-solutions/callcaster/issues/1682)).
- Voicemail notification emails: the recording is now fetched from Twilio with the workspace's API Key, the same credentials live calls use, falling back to the subaccount Auth Token only when no key exists. A workspace whose stored Auth Token had gone stale lost every voicemail email while its calls kept working; the failure is also logged with the HTTP status and which credentials were used ([#1224](https://github.com/chester-hill-solutions/callcaster/issues/1224)).
- Call settings sheet: controls are grouped under the device they belong to (test and mute under Microphone, test under Speaker, Add Phone Number beside Calling device) and no longer overflow the sheet at either edge. The duplicate headings above each button are gone ([#1338](https://github.com/chester-hill-solutions/callcaster/issues/1338)).
- Call screen: when the contact hangs up first, the agent's own leg is dropped as soon as the status reads Call Completed, so the Dial button returns instead of a Hang Up button that only cycles its confirmation. Hang Up with no live call now clears the stale in-call state as well ([#1292](https://github.com/chester-hill-solutions/callcaster/issues/1292)).
- A mistyped or stale link under a workspace now shows **Page not found** inside the workspace, with the sidebar and your theme intact, instead of a bare light-mode page. The full-page error document also keeps dark mode after it loads; it previously lost the theme class during hydration ([#1397](https://github.com/chester-hill-solutions/callcaster/issues/1397)).
- Call screen: the coloured header strip on each panel now meets the panel's rounded border cleanly. The strip previously drew its own smaller curve, which left a visible sliver at the corners, most noticeably in dark mode ([#1344](https://github.com/chester-hill-solutions/callcaster/issues/1344)).
- Primary action buttons (Upload Audio, Next, Create, Sign up, Save) no longer turn light blue with white text on hover. They use the shared primary button style, so the label stays legible in both themes ([#1319](https://github.com/chester-hill-solutions/callcaster/issues/1319)).
- Number search: the Ajax–Pickering rate centre now reads **Ajax-Pickering, ON** in the number picker and the onboarding wizard. Twilio returns it as "Ajaxpickering" with a single capital, so the earlier CamelCase split never applied; known run-together rate-centre names are now mapped by name ([#1321](https://github.com/chester-hill-solutions/callcaster/issues/1321)).
## 2026-09-08 — release [#1661](https://github.com/chester-hill-solutions/callcaster/pull/1661)

Four PRs on `dev` since the 2026-09-07 release.

### Added

- Robocall and phone menu campaigns: the launch page's test control places a **Test call** to one number through the campaign's real flow, so you can hear it and walk the menu. The call carries no outreach attempt, so it stays out of results, exports, and analytics; the voicemail drop still plays on a test call that reaches voicemail ([#1653](https://github.com/chester-hill-solutions/callcaster/issues/1653), slice 2 of [#1645](https://github.com/chester-hill-solutions/callcaster/issues/1645)). PR [#1654](https://github.com/chester-hill-solutions/callcaster/pull/1654).
- Chat: template tags typed in the conversation composer now fill in from the linked contact, or from the single contact matching the number; text with no match is sent as typed, and the composer says so when a contact is linked ([#1650](https://github.com/chester-hill-solutions/callcaster/issues/1650)). PR [#1651](https://github.com/chester-hill-solutions/callcaster/pull/1651).
- Admin: a **Re-authenticate Twilio** button on the workspace Twilio Health panel repairs a subaccount stuck in an authentication failure — it mints a fresh API Key from the subaccount's Auth Token, and refetches that Auth Token from our master Twilio account first if it too has been rejected ([#1655](https://github.com/chester-hill-solutions/callcaster/issues/1655)). PR [#1660](https://github.com/chester-hill-solutions/callcaster/pull/1660).

### Fixed

- A workspace whose Twilio credentials are actually invalid no longer sees "add credits, then try again" — Twilio's authentication-failure code (20003) now surfaces its own message pointing at re-authenticating the subaccount, instead of being mislabeled as an insufficient-credits error ([#1656](https://github.com/chester-hill-solutions/callcaster/issues/1656)). PR [#1658](https://github.com/chester-hill-solutions/callcaster/pull/1658).

## 2026-09-07 — release [#1638](https://github.com/chester-hill-solutions/callcaster/pull/1638)

Ninety-three commits on `dev` since the 2026-09-02 release. Manual verification steps for every entry are in [the release test guide](./release-test-guide-2026-09-07.md).

### Fixed

- SMS template tags: the parser now accepts the `{{field}}` and `{{field|"fallback"}}` syntax the message editor inserts, strips fallback quotes, and renders `{{contact_id}}`; previously tags reached recipients with braces attached ([#1641](https://github.com/chester-hill-solutions/callcaster/issues/1641)). PR [#1643](https://github.com/chester-hill-solutions/callcaster/pull/1643).
- The live-call auto-dialer re-checks the workspace credit floor before every dial, not only when the conference starts. A session that reaches the floor releases the contact it just claimed and stops, instead of dialling the rest of its queue into a negative balance ([#1508](https://github.com/chester-hill-solutions/callcaster/issues/1508)). PR [#1524](https://github.com/chester-hill-solutions/callcaster/pull/1524).
- Verifying a workspace number you already rent as a caller ID is refused before any call to Twilio, so verification can no longer downgrade a rented number and strip its voicemail and emergency eligibility ([#1518](https://github.com/chester-hill-solutions/callcaster/issues/1518)). PR [#1527](https://github.com/chester-hill-solutions/callcaster/pull/1527).
- Automated phone menu campaigns no longer dial the same phone number twice in one campaign when two contacts share it, matching the guard text campaigns already had ([#1517](https://github.com/chester-hill-solutions/callcaster/issues/1517)). PR [#1529](https://github.com/chester-hill-solutions/callcaster/pull/1529).
- A campaign whose end date has passed is marked complete the next time dispatch looks at it, even when contacts are still queued or its scheduled start never arrived. Paused, draft, and archived campaigns are left alone ([#1512](https://github.com/chester-hill-solutions/callcaster/issues/1512)). PR [#1532](https://github.com/chester-hill-solutions/callcaster/pull/1532).
- The call room subscribes through the workspace's shared event connection instead of opening its own, so a busy call screen no longer exhausts the browser's connection pool, and an agent whose access is revoked mid-call is disconnected instead of retrying forever ([#1516](https://github.com/chester-hill-solutions/callcaster/issues/1516)). PR [#1531](https://github.com/chester-hill-solutions/callcaster/pull/1531).
- Server-side event subscriptions are released when a client disconnects during setup or when the readiness probe times out, closing a slow leak of database listeners ([#1515](https://github.com/chester-hill-solutions/callcaster/issues/1515)). PR [#1528](https://github.com/chester-hill-solutions/callcaster/pull/1528).
- Campaign results show message totals and contact progress as separate numbers, so a contact who received several messages no longer counts several times toward progress. PR [#1633](https://github.com/chester-hill-solutions/callcaster/pull/1633).
- A campaign whose workspace runs out of credits is paused instead of staying marked as running after dispatch stops. Relaunch it after topping up. PR [#1634](https://github.com/chester-hill-solutions/callcaster/pull/1634).
- A brand-new workspace is no longer told it already has a campaign and a script. The sample campaign and sample script every workspace starts with are marked as samples and no longer count toward the setup wizard's Campaign and Script steps or the launch checklist ([#1070](https://github.com/chester-hill-solutions/callcaster/issues/1070)). PR [#1629](https://github.com/chester-hill-solutions/callcaster/pull/1629).
- The sample campaign every new workspace starts with now follows the goal chosen in onboarding: a texting goal turns it into a message campaign with sample copy, an automated phone menu goal into an IVR campaign on the sample script, and live calling keeps the live-call sample ([#1323](https://github.com/chester-hill-solutions/callcaster/issues/1323)). PR [#1630](https://github.com/chester-hill-solutions/callcaster/pull/1630).
- Campaign SMS dispatch stops starting sends once the remaining balance cannot cover the next message's estimated cost. Unaffordable rows stay queued for a relaunch after a top-up, and the worker stops the chain instead of scheduling another tick ([#1483](https://github.com/chester-hill-solutions/callcaster/issues/1483)). PR [#1600](https://github.com/chester-hill-solutions/callcaster/pull/1600).
- A campaign now completes as soon as its last queued contact is dequeued, whichever path did it: an agent's final call, an opt-out, a duplicate, a landline, or a sent text. Completion used to depend on a worker dispatch tick observing an empty queue, so campaigns stayed running after all their contacts were processed ([#1484](https://github.com/chester-hill-solutions/callcaster/issues/1484)). PR [#1601](https://github.com/chester-hill-solutions/callcaster/pull/1601).
- The Supabase-era orphan cleanup migration now runs each drop in its own guarded block. On a long-lived database where another object still depends on one of them, that drop is skipped with a warning naming it and the rest of the file applies and is recorded, instead of the whole file failing and being retried on every boot ([#1450](https://github.com/chester-hill-solutions/callcaster/issues/1450)). PR [#1602](https://github.com/chester-hill-solutions/callcaster/pull/1602).
- **Save & continue** on the onboarding SMS program details step now moves to the next step. It used to save and stay put because the Identity step had already completed intake, which sent the save back to the same screen ([#1471](https://github.com/chester-hill-solutions/callcaster/issues/1471)). PR [#1606](https://github.com/chester-hill-solutions/callcaster/pull/1606).
- Campaign SMS and automated-call dispatch now record each failed attempt on the queue row and dead-letter rows that reach the attempt limit, so one undeliverable number no longer keeps a campaign running forever with its dispatch job retrying until it dies ([#1513](https://github.com/chester-hill-solutions/callcaster/issues/1513)). PR [#1603](https://github.com/chester-hill-solutions/callcaster/pull/1603).
- Importing a CSV that has no header row keeps its first contact. The upload wizard and the server now agree on when a first row is data (a phone number, including one with an extension, an email, a street address, or a postal code) and both name the columns "Column 1", "Column 2", and so on ([#1481](https://github.com/chester-hill-solutions/callcaster/issues/1481), [#1511](https://github.com/chester-hill-solutions/callcaster/issues/1511)). PR [#1622](https://github.com/chester-hill-solutions/callcaster/pull/1622).
- On the onboarding **Number** step, the "Rent a Canadian number" and "Verify your own number" titles no longer have the box edge drawn through them ([#1113](https://github.com/chester-hill-solutions/callcaster/issues/1113)). PR [#1592](https://github.com/chester-hill-solutions/callcaster/pull/1592).
- The **Identity** step in onboarding now shows as complete once the legal business name is saved. It previously stayed marked unfinished because it was judged against the messaging-program fields collected on a later step ([#1204](https://github.com/chester-hill-solutions/callcaster/issues/1204)). PR [#1589](https://github.com/chester-hill-solutions/callcaster/pull/1589).
- One-off chat texts are recorded before they are handed to Twilio, the same protection campaign texts gained, so a write failure after sending can no longer leave a sent text unbilled and missing from the conversation ([#1586](https://github.com/chester-hill-solutions/callcaster/issues/1586)). PR [#1587](https://github.com/chester-hill-solutions/callcaster/pull/1587).
- The Twilio status recovery sweep finishes pending campaign texts that never received a delivery callback: it matches them to the provider record and bills them, or marks them failed without a charge when the provider has no record ([#1578](https://github.com/chester-hill-solutions/callcaster/issues/1578)). PR [#1585](https://github.com/chester-hill-solutions/callcaster/pull/1585).
- Campaign texts are recorded before they are handed to Twilio, so a send can no longer go out unrecorded and unbilled if the write after sending fails; the delivery callback attaches the provider ID to the pending record. A contact whose send Twilio refused stays eligible for the next attempt ([#1582](https://github.com/chester-hill-solutions/callcaster/issues/1582)). PR [#1584](https://github.com/chester-hill-solutions/callcaster/pull/1584).
- A campaign text that Twilio accepted but whose record could not be saved is now reported to operations immediately instead of disappearing from billing and the conversation view unnoticed ([#1581](https://github.com/chester-hill-solutions/callcaster/issues/1581)). PR [#1583](https://github.com/chester-hill-solutions/callcaster/pull/1583).
- Polling the status of a campaign export that no longer exists returns "not found" instead of a server error ([#1577](https://github.com/chester-hill-solutions/callcaster/issues/1577)). PR [#1579](https://github.com/chester-hill-solutions/callcaster/pull/1579).
- The `POST /api/auth/reset-password` endpoint works again: it accepts the reset `token` in the body and no longer requires a signed-in session to reset a forgotten password ([#1560](https://github.com/chester-hill-solutions/callcaster/issues/1560)). PR [#1568](https://github.com/chester-hill-solutions/callcaster/pull/1568).
- The Twilio status recovery sweep now queues an SMS's billing job before marking the message delivered or failed. Previously a failure between those two steps left the message marked terminal and never billed ([#1571](https://github.com/chester-hill-solutions/callcaster/issues/1571)). PR [#1574](https://github.com/chester-hill-solutions/callcaster/pull/1574).
- Removing an image from one campaign's message no longer deletes the file while another campaign in the workspace still uses it. The file is only deleted when no campaign references it ([#1575](https://github.com/chester-hill-solutions/callcaster/issues/1575)). PR [#1576](https://github.com/chester-hill-solutions/callcaster/pull/1576).
- Background schedules (billing reconciliation, number rental billing, low-credit notices, campaign schedule sweeps) now restart themselves within minutes if a run fails to queue its next occurrence, and ops is alerted when that happens. Previously one such failure silently paused the schedule until the worker was redeployed ([#1570](https://github.com/chester-hill-solutions/callcaster/issues/1570)). PR [#1572](https://github.com/chester-hill-solutions/callcaster/pull/1572).
- Confirming a new authenticator code on **Account → Security** now keeps you verified. The confirmation response was missing the cookie that records the check, so the next protected page could send you back to the code screen ([#1564](https://github.com/chester-hill-solutions/callcaster/issues/1564)). PR [#1573](https://github.com/chester-hill-solutions/callcaster/pull/1573).
- The monthly number-rental sweep no longer treats its own errors as non-payment. A failed balance lookup, an unknown balance, or a failed ledger write skips that number for the day and retries on the next sweep, instead of warning, suspending, or releasing a number whose owner did nothing wrong ([#1555](https://github.com/chester-hill-solutions/callcaster/issues/1555)). PR [#1556](https://github.com/chester-hill-solutions/callcaster/pull/1556).
- The **Reset password** page now tells you when a reset link is invalid or expired instead of reporting success, and it no longer strips spaces from the start or end of the new password ([#1559](https://github.com/chester-hill-solutions/callcaster/issues/1559)). PR [#1562](https://github.com/chester-hill-solutions/callcaster/pull/1562).
- A background worker that stalls past its claim timeout can no longer complete, retry, dead-letter, or extend a job that another worker has since taken over. Those writes are fenced to the claiming worker and log `worker.claim_lost` instead ([#1548](https://github.com/chester-hill-solutions/callcaster/issues/1548)). PR [#1551](https://github.com/chester-hill-solutions/callcaster/pull/1551).
- The boot-time migration bootstrap takes a database advisory lock for the whole pass, so two app instances starting at once no longer replay the same migration files concurrently ([#1547](https://github.com/chester-hill-solutions/callcaster/issues/1547)). PR [#1549](https://github.com/chester-hill-solutions/callcaster/pull/1549).
- Photos and other attachments on **inbound** text messages now show in the chat view. They were stored correctly but never given a viewable link, so only the message text appeared ([#1557](https://github.com/chester-hill-solutions/callcaster/issues/1557)). PR [#1558](https://github.com/chester-hill-solutions/callcaster/pull/1558).

### Changed

- The public API reference for `POST /api/sms` now documents all three responses: a dispatched body (with `creditsExhausted`), a deferred body when the send window is closed (`deferred`, `reason`, `nextOpenAt`), and a 402 when the workspace has no credits. Generated clients carry the union. PR [#1625](https://github.com/chester-hill-solutions/callcaster/pull/1625).
- `PATCH /api/campaign-queue` validates each action against its own schema: a missing `status`, `contact_ids`, `audience_id`, or selection now returns the parser's 400 with the field named. Valid requests behave as before. PR [#1614](https://github.com/chester-hill-solutions/callcaster/pull/1614).
- Status colours used as plain text (success, warning, info, and error messages, and the chips in the queue table) are darker in light mode and lighter in dark mode so they meet contrast guidelines; the info badge is slightly darker in light mode for the same reason. Solid badges, buttons, and icons keep their colours. PR [#1632](https://github.com/chester-hill-solutions/callcaster/pull/1632).
- Tooltips wrap at a readable width and scroll past a modest height instead of spanning the page; individual tooltips can widen or unbound themselves. The SMS goal guidance in onboarding no longer repeats its own text in a tooltip ([#1148](https://github.com/chester-hill-solutions/callcaster/issues/1148)). PR [#1608](https://github.com/chester-hill-solutions/callcaster/pull/1608).
- A workspace that has never had campaigns, numbers, or audiences now sees "No credits yet. Add credits to start campaigns and calls." instead of a banner saying its balance is depleted and campaigns can resume ([#1069](https://github.com/chester-hill-solutions/callcaster/issues/1069) copy nit). PR [#1609](https://github.com/chester-hill-solutions/callcaster/pull/1609).
- Campaign Setup shows its save bar at the bottom of the form as well as the top, the bar's buttons now read **Discard changes** and **Save changes**, and **Next** is inert with an explanation while there are unsaved changes instead of opening the discard dialog ([#1128](https://github.com/chester-hill-solutions/callcaster/issues/1128)). PR [#1613](https://github.com/chester-hill-solutions/callcaster/pull/1613).
- The design preview page under a workspace (`/design`, a tone-system workbench for automated accessibility scans) answers 404 in production unless `DESIGN_GALLERY_ENABLED` is set. It stays available in development and the E2E harness. PR [#1617](https://github.com/chester-hill-solutions/callcaster/pull/1617).
- Calling hours and SMS send windows now follow one rule for overnight intervals: an interval such as 23:00–02:00 applies from its start day into the next morning, and no longer also matches the early hours of its own start day. The launch page ETA also says when a queue may not finish before the campaign end date. PR [#1618](https://github.com/chester-hill-solutions/callcaster/pull/1618), [#1620](https://github.com/chester-hill-solutions/callcaster/pull/1620).
- E2E webhook fixtures sign every Twilio callback with the seeded subaccount token; both E2E harnesses now run with `TWILIO_VALIDATE_WEBHOOKS=true`, the surface probe runs strict there, and `twilio-webhook-auth.spec.ts` covers missing, foreign-token, and tampered signatures ([#1190](https://github.com/chester-hill-solutions/callcaster/issues/1190)). PR [#1598](https://github.com/chester-hill-solutions/callcaster/pull/1598).
- The automated calling goal is called **Automated phone menu** everywhere: the onboarding goal picker no longer says "IVR" and campaign labels no longer say "Robocall". Advanced IVR keeps its own name ([#1347](https://github.com/chester-hill-solutions/callcaster/issues/1347)). PR [#1594](https://github.com/chester-hill-solutions/callcaster/pull/1594).
- Every place that shows or edits a time now says which time zone it uses: the campaign schedule's Start and End columns, the chat "Send later" picker, and the billing activity date column all show your browser's time zone alongside the value ([#969](https://github.com/chester-hill-solutions/callcaster/issues/969)). PR [#1593](https://github.com/chester-hill-solutions/callcaster/pull/1593).
- Contact, call-list, and onboarding screens now consistently say **Call list** where some labels still said "Audience" (headings, the queue picker placeholder, the add-list page, and the onboarding step) ([#1067](https://github.com/chester-hill-solutions/callcaster/issues/1067)). PR [#1591](https://github.com/chester-hill-solutions/callcaster/pull/1591).
- New campaigns default to calling hours of **09:00 to 21:00** local (was 09:00 to 17:00), and the same default applies when you enable a day or use the "Apply … to Weekdays / All Days" buttons. Saved schedules are unchanged ([#1127](https://github.com/chester-hill-solutions/callcaster/issues/1127)). PR [#1590](https://github.com/chester-hill-solutions/callcaster/pull/1590).
- Two-factor authentication is turned off for all accounts for now. Sign-in no longer asks for an authenticator code, owners and admins are not asked to enroll, and **Account → Security** says so. Existing enrollments are kept and everything returns when the `TWO_FACTOR_ENABLED` setting is switched on ([#1567](https://github.com/chester-hill-solutions/callcaster/issues/1567)). PR [#1569](https://github.com/chester-hill-solutions/callcaster/pull/1569).
- The compose e2e scripts that drop the database schema and purge the MinIO bucket now refuse any `DATABASE_URL` or `S3_ENDPOINT` that is not the local stack, so a stray exported variable cannot point them at a real environment ([#1553](https://github.com/chester-hill-solutions/callcaster/issues/1553)). PR [#1554](https://github.com/chester-hill-solutions/callcaster/pull/1554).
- Outbound messages now cost **2 credits per SMS segment** ($0.04) and **4 credits per MMS** ($0.08), up from 1 and 2. The billing page, campaign cost estimates, and the Twilio reconciliation report all follow the new rate ([#1533](https://github.com/chester-hill-solutions/callcaster/issues/1533)). PR [#1540](https://github.com/chester-hill-solutions/callcaster/pull/1540).

### Security

- Caller-ID verification status callbacks from Twilio update only the workspace that owns the verifying subaccount. The write used to match on phone number alone, so one workspace's callback could change every workspace that had registered the same number ([#1509](https://github.com/chester-hill-solutions/callcaster/issues/1509)). PR [#1523](https://github.com/chester-hill-solutions/callcaster/pull/1523).
- Live-call transcription and coaching writes are bound to the call named in the signed media-stream token; a client that names a different call is rejected, so transcripts can no longer be injected into another workspace's call ([#1514](https://github.com/chester-hill-solutions/callcaster/issues/1514)). PR [#1530](https://github.com/chester-hill-solutions/callcaster/pull/1530).
- Transferring workspace ownership from the settings form now enforces the same new-owner two-factor requirement as the API path. With two-factor authentication switched off for this release the check is inert, and it returns with the feature ([#1519](https://github.com/chester-hill-solutions/callcaster/issues/1519)). PR [#1525](https://github.com/chester-hill-solutions/callcaster/pull/1525).
- Signing out through the API with a bearer token now revokes that token's session; it previously only cleared the browser cookie ([#1563](https://github.com/chester-hill-solutions/callcaster/issues/1563)). PR [#1566](https://github.com/chester-hill-solutions/callcaster/pull/1566).
- Resetting your password now signs out every other session on the account, so a session that was already open elsewhere stops working ([#1561](https://github.com/chester-hill-solutions/callcaster/issues/1561)). PR [#1565](https://github.com/chester-hill-solutions/callcaster/pull/1565).
- Workspace-scoped database updates now drop the workspace column from the update payload at runtime, so no code path can move a row to another workspace ([#1542](https://github.com/chester-hill-solutions/callcaster/issues/1542)). PR [#1544](https://github.com/chester-hill-solutions/callcaster/pull/1544).
- The contacts API creates a new contact in the workspace the caller was authorized for, ignoring any other workspace named in the request body ([#1541](https://github.com/chester-hill-solutions/callcaster/issues/1541)). PR [#1545](https://github.com/chester-hill-solutions/callcaster/pull/1545).
- Workspace invites from **Settings → Members** validate the requested role and refuse a role above the inviter's own, so a member can no longer invite someone as admin or owner ([#1543](https://github.com/chester-hill-solutions/callcaster/issues/1543)). PR [#1546](https://github.com/chester-hill-solutions/callcaster/pull/1546).
- The accept-invite page no longer creates accounts while registration is closed. It now returns the same "Registration is closed." refusal as the signup page ([#1550](https://github.com/chester-hill-solutions/callcaster/issues/1550)). PR [#1552](https://github.com/chester-hill-solutions/callcaster/pull/1552).

### Added

- Message campaigns: a "Send test" button on the launch page sends the campaign message to one phone number through the real SMS path, with template tags rendered for the matching contact or a sample contact; the test row carries no campaign ID so it stays out of campaign results ([#1647](https://github.com/chester-hill-solutions/callcaster/issues/1647), slice 1 of [#1645](https://github.com/chester-hill-solutions/callcaster/issues/1645)). PR [#1648](https://github.com/chester-hill-solutions/callcaster/pull/1648).
- SMS message editor: a hint below the message body explains personalization tags and opens the picker, and a live preview renders the body for a sample contact so users can check templates before sending ([#1640](https://github.com/chester-hill-solutions/callcaster/issues/1640)). PR [#1646](https://github.com/chester-hill-solutions/callcaster/pull/1646).
- A "Kick off" button on the campaign launch page restarts automated dispatch for a running or paused message or automated-voice campaign whose sending stopped. Pressing it while dispatch is already running does nothing and says so. PR [#1635](https://github.com/chester-hill-solutions/callcaster/pull/1635).
- Workspace admins can override the "large bulk send on a local number" safeguard for one campaign from the launch page, after acknowledging the deliverability risk. The safeguard stays on by default, the override is recorded on the campaign and shown while active, and it can be removed again ([#1482](https://github.com/chester-hill-solutions/callcaster/issues/1482)). PR [#1623](https://github.com/chester-hill-solutions/callcaster/pull/1623).
- **Billing → Activity** shows a **Receipt** link on each credit purchase that opens the Stripe-hosted invoice or receipt. Receipts are looked up per workspace, and a purchase that has no receipt yet says so instead of failing ([#1322](https://github.com/chester-hill-solutions/callcaster/issues/1322)). PR [#1596](https://github.com/chester-hill-solutions/callcaster/pull/1596).
- **Billing → Activity** can be filtered to purchases and credits, or to usage only, so receipts are easy to find once the ledger fills with campaign activity ([#1322](https://github.com/chester-hill-solutions/callcaster/issues/1322)). PR [#1596](https://github.com/chester-hill-solutions/callcaster/pull/1596), [#1595](https://github.com/chester-hill-solutions/callcaster/pull/1595).

### Removed

- SMS message editor: the template-tag picker no longer offers `survey(...)` links or a survey-link preview; nothing rendered them, so recipients received the literal function text ([#1642](https://github.com/chester-hill-solutions/callcaster/issues/1642)). PR [#1644](https://github.com/chester-hill-solutions/callcaster/pull/1644).

### Internal

Tooling, tests, and docs that ship in this release with no customer-visible change.

- CI: the Twilio webhook coverage gate scanned zero routes and passed; it now derives the route set from the generated API surface and fails if that set is empty ([#1510](https://github.com/chester-hill-solutions/callcaster/issues/1510)). PR [#1522](https://github.com/chester-hill-solutions/callcaster/pull/1522).
- E2E: a truly empty "E2E Fresh Workspace" fixture and an onboarding-redirect spec ([#1069](https://github.com/chester-hill-solutions/callcaster/issues/1069), PR [#1604](https://github.com/chester-hill-solutions/callcaster/pull/1604)); a headless sign-up spec plus `npm run test:e2e:signup:headed` for supervised runs ([#1167](https://github.com/chester-hill-solutions/callcaster/issues/1167), PR [#1605](https://github.com/chester-hill-solutions/callcaster/pull/1605)); an accessibility scan of the design preview with every interactive state open in both themes (PR [#1619](https://github.com/chester-hill-solutions/callcaster/pull/1619)); a stylesheet contrast test for every tone token (PR [#1632](https://github.com/chester-hill-solutions/callcaster/pull/1632)).
- Tests: a Twilio test-credentials contract tier, `npm run test:integration-twilio`, skipped unless `TWILIO_TEST_ACCOUNT_SID` and `TWILIO_TEST_AUTH_TOKEN` are set ([#1195](https://github.com/chester-hill-solutions/callcaster/issues/1195), PR [#1607](https://github.com/chester-hill-solutions/callcaster/pull/1607)).
- Vendored packages: CI fails when a scriptkit dist no longer matches its source; the shad-cc dist check runs warn-only while evidence is gathered (PRs [#1616](https://github.com/chester-hill-solutions/callcaster/pull/1616), [#1621](https://github.com/chester-hill-solutions/callcaster/pull/1621)).
- Refactors with no behaviour change: one schedule interval engine (PR [#1618](https://github.com/chester-hill-solutions/callcaster/pull/1618)) with explicit SMS and IVR dispatch policies (PR [#1620](https://github.com/chester-hill-solutions/callcaster/pull/1620)); the inbound-queue tables split out of `schema.ts` (PR [#1626](https://github.com/chester-hill-solutions/callcaster/pull/1626)); a shared non-empty SQL combinator and total weekday accessor (PR [#1627](https://github.com/chester-hill-solutions/callcaster/pull/1627)); call-screen data validated once and returned typed (PR [#1628](https://github.com/chester-hill-solutions/callcaster/pull/1628)); issue-board generation staged so a failed run never rewrites enrichment files (PR [#1612](https://github.com/chester-hill-solutions/callcaster/pull/1612)).
- Developer setup: `make init | up | down | logs | ps | app | worker | e2e`, one consolidated `docs/local-development.md`, and a local-development agent skill ([#1159](https://github.com/chester-hill-solutions/callcaster/issues/1159), PR [#1610](https://github.com/chester-hill-solutions/callcaster/pull/1610)).
- Docs: ADR-0029 corrected to ElevenLabs Scribe ([#1520](https://github.com/chester-hill-solutions/callcaster/issues/1520), PR [#1526](https://github.com/chester-hill-solutions/callcaster/pull/1526)); agent pitfalls in `AGENTS.md` ([#1534](https://github.com/chester-hill-solutions/callcaster/issues/1534), PR [#1537](https://github.com/chester-hill-solutions/callcaster/pull/1537)); CI load-reduction, code-quality, and lint-ratchet plans ([#1535](https://github.com/chester-hill-solutions/callcaster/issues/1535), PR [#1538](https://github.com/chester-hill-solutions/callcaster/pull/1538)); the Supabase-exit hardening handoff and its status table ([#1536](https://github.com/chester-hill-solutions/callcaster/issues/1536), PRs [#1539](https://github.com/chester-hill-solutions/callcaster/pull/1539), [#1580](https://github.com/chester-hill-solutions/callcaster/pull/1580), [#1588](https://github.com/chester-hill-solutions/callcaster/pull/1588)); pull-request scope and issue-comment discipline in the github-issues skill ([#1360](https://github.com/chester-hill-solutions/callcaster/issues/1360), PR [#1611](https://github.com/chester-hill-solutions/callcaster/pull/1611)); changelog dating passes (PRs [#1599](https://github.com/chester-hill-solutions/callcaster/pull/1599), [#1624](https://github.com/chester-hill-solutions/callcaster/pull/1624), [#1631](https://github.com/chester-hill-solutions/callcaster/pull/1631), [#1636](https://github.com/chester-hill-solutions/callcaster/pull/1636)).

## 2026-09-02 — release [#1506](https://github.com/chester-hill-solutions/callcaster/pull/1506)

### Added

- CI blocks a release pull request into `master` whose behavior changes have no dated changelog entries or that leaves entries under Unreleased ([#1505](https://github.com/chester-hill-solutions/callcaster/pull/1505)).

### Fixed

- Campaigns launched with **Schedule** no longer start sending early. The worker holds a scheduled campaign until its start date, and a scheduled launch re-times any dispatch job already queued for the campaign ([#1502](https://github.com/chester-hill-solutions/callcaster/pull/1502), [#1501](https://github.com/chester-hill-solutions/callcaster/issues/1501)).
- **Duplicate campaign** works again and always creates a draft under a free title ("X (Copy)", "X (Copy 2)", …). It copies the queue and audience links, and a title race returns a clear conflict instead of a generic failure ([#1503](https://github.com/chester-hill-solutions/callcaster/pull/1503), [#1500](https://github.com/chester-hill-solutions/callcaster/issues/1500)).

## 2026-09-02 — release [#1499](https://github.com/chester-hill-solutions/callcaster/pull/1499)

### Added

- Workspace **Billing → Activity** rolls usage for the same campaign and calendar month into one expandable row showing the period, entry count, activity types, and total credits. Purchases, number rentals, and one-off usage stay as individual lines ([#1496](https://github.com/chester-hill-solutions/callcaster/pull/1496), [#1488](https://github.com/chester-hill-solutions/callcaster/issues/1488)).

### Fixed

- A chat SMS that Twilio accepted is never reported as a failed send. A send that uses up the balance shows a separate billing warning instead ([#1497](https://github.com/chester-hill-solutions/callcaster/pull/1497), [#1487](https://github.com/chester-hill-solutions/callcaster/issues/1487)).
- SMS usage debits now record the campaign they belong to, matching voice debits ([#1495](https://github.com/chester-hill-solutions/callcaster/pull/1495), [#1494](https://github.com/chester-hill-solutions/callcaster/issues/1494)).

## 2026-09-02 — release [#1493](https://github.com/chester-hill-solutions/callcaster/pull/1493)

### Added

- **Join** on the call screen now explicitly registers the phone device instead of registering on page load ([#1470](https://github.com/chester-hill-solutions/callcaster/pull/1470)).
- `db:schema:check` compares enum values against the live database, so a missing enum value fails the drift check ([#1479](https://github.com/chester-hill-solutions/callcaster/pull/1479)).
- Client migrations run on boot in the dev and staging environments, not only production ([#1478](https://github.com/chester-hill-solutions/callcaster/pull/1478)).

### Fixed

- **Add from Audience** on the campaign queue reports every outcome, including "already linked" and "no contacts with a phone number", and resets the picker so it cannot be double-submitted ([#1489](https://github.com/chester-hill-solutions/callcaster/pull/1489), [#1472](https://github.com/chester-hill-solutions/callcaster/issues/1472)).
- Twilio voice geo-permission updates send the complete per-country object; enabling permissions during onboarding no longer fails with error 20001 ([#1490](https://github.com/chester-hill-solutions/callcaster/pull/1490), [#1474](https://github.com/chester-hill-solutions/callcaster/issues/1474)).
- The `waiting` campaign status exists in every database lineage; the campaign schedule sync no longer dead-letters every minute and drained campaigns can complete ([#1491](https://github.com/chester-hill-solutions/callcaster/pull/1491), [#1476](https://github.com/chester-hill-solutions/callcaster/issues/1476)).
- Stripe webhook signatures verify under Bun, so credit purchases confirm again ([#1480](https://github.com/chester-hill-solutions/callcaster/pull/1480)).
- The call screen's only navigate-away action is **Leave Campaign** ([#1469](https://github.com/chester-hill-solutions/callcaster/pull/1469)).
- Add Audio and call-list upload zones share one drop zone component ([#1467](https://github.com/chester-hill-solutions/callcaster/pull/1467)).

## 2026-08-31 — release [#1466](https://github.com/chester-hill-solutions/callcaster/pull/1466)

### Added

- An audible end-of-call tone plays when either side hangs up ([#1461](https://github.com/chester-hill-solutions/callcaster/pull/1461), [#1363](https://github.com/chester-hill-solutions/callcaster/issues/1363)).

### Fixed

- The inactive-campaign dialog on the call screen navigates to the campaign page instead of history-back ([#1465](https://github.com/chester-hill-solutions/callcaster/pull/1465)).

## 2026-08-31 — release [#1460](https://github.com/chester-hill-solutions/callcaster/pull/1460)

### Added

- The workspace switcher is a searchable combobox, and long dropdowns cap to the viewport ([#1454](https://github.com/chester-hill-solutions/callcaster/pull/1454)).

### Fixed

- The dial tone keeps ringing for the whole dialing window; unmuting no longer silences it ([#1457](https://github.com/chester-hill-solutions/callcaster/pull/1457)).
- The call-screen header holds the just-called contact until the agent hands off ([#1459](https://github.com/chester-hill-solutions/callcaster/pull/1459)).
- Onboarding reports format errors as format errors, not "required" ([#1456](https://github.com/chester-hill-solutions/callcaster/pull/1456), [#1122](https://github.com/chester-hill-solutions/callcaster/issues/1122)).
- Onboarding wizard content width is capped, except on the first-number step ([#1455](https://github.com/chester-hill-solutions/callcaster/pull/1455)).

## v2 platform cutover — 2026-08-31 and earlier

Production moved from the Supabase-era app to the v2 platform on 2026-08-31. The entries below were accumulated during that migration and are kept as written.

### Added

- React Router v7 migration: Vite-based build (`react-router build`), `@react-router/express` custom server, and `data()` responses instead of Remix `json()`.
- Runtime server hardening: shared `validateRequiredEnv` (`app/lib/required-env-keys.mjs`), `/readyz` waits for `buildReady`, structured JSON request logs (excluding probes), security headers, and optional `PROCESS_FATAL_ON_REJECTION`.
- Supabase SQL migrations, `twilio-open-sync` Edge Function with pg_cron (`net.http_post` + service role JWT), shared open-sync candidate helpers and tests; `number-rental-billing` cron path documented for JWT-less invocation.
- Campaign SMS duplicate prevention (skip send when an equivalent queued/sent row exists), `onlyQueued` filtering on campaign queue reads, and tests.
- [docs/script-structure.md](script-structure.md) for campaign `script.steps` / IVR navigation, linked from README and docs index (see PR #963).
- Structured logging for `/api/inbound`, Twilio account JSON persistence helper for workspace creation.
- Inbound handset dial-end API, handset ringing toggle in phone settings, and call-handling hook improvements (auto-accept, connection management).

### Changed

- Route modules consolidated to single `route.tsx` files per URL (RR7 automatic client/server split); removed colocated `route.server.tsx` shims under `app/routes/`.
- Campaign result aggregation (`CampaignResultDisplay`, disposition components, key message metrics), optional caller ID for messaging-service campaigns, SMS send mode / messaging service resolution utilities, database types, and workspace navigation for campaigns.
- Twilio open sync default fetch limits (100, cap 250) and related tests.
- Tooling and config: `package.json`, `tsconfig`, Vitest UI config, and related env/docs touchpoints.

### Fixed

- Campaign readiness: validate schedule intervals with clock semantics (overnight and UTC-shifted windows), aligned with `isWithinCallingHours`, fixing false invalid-window / readiness errors ([#971](https://github.com/chester-hill-solutions/callcaster/issues/971), PR [#973](https://github.com/chester-hill-solutions/callcaster/pull/973)).
- Supabase migrations: replay-safe and idempotent changes (dequeue fields in timestamped migration, chunk export SQL fixes, cron job detection via `cron.job`, FK/policy tolerance, CLI-friendly migration filenames).
- Inbound Twilio: load workspace `twilio_data` when join omits it; subaccount vs env `TWILIO_AUTH_TOKEN` fallback; workspace ID extraction for logging (PRs #948–#950).
- Realtime and API routes: refactors in Supabase hooks, chat routes, queue status checks, and improved type safety on several API routes.

### Removed

- Legacy `app/routes/archive/**` and `old.*` IVR/dashboard routes; `app/lib/legacy-route.server.ts`. Route modules now live under nested folders (`workspaces+/$id/...`, `api+/...`) via remix-flat-routes.
- Legacy `twilio-serverless` JS assets (`flow.js`, `ivr.js`, `recording.js`, `status.js`, etc.) and root `websocket.server.js` removed in favor of current app and Edge Function paths.

### Security

- **Remix Twilio webhooks:** `validateTwilioWebhook` / `validateTwilioWebhookParams` in `app/twilio.server.ts` verify `X-Twilio-Signature` by default; set `TWILIO_VALIDATE_WEBHOOKS=false` (or `0`) for local tunnel dev only.
- **API auth:** `api.auto-dial.dialer`, `api.test-webhook`, `api.campaign_audience`, `api.outreach-attempts`, and `api.queues` enforce session auth and workspace access.
- **Cron:** `number-rental-billing` accepts optional `NUMBER_RENTAL_CRON_SECRET` via `x-cron-secret` when configured.
- **Legacy routes:** `app/routes/old.*` and `app/routes/archive/**` return HTTP 410 in production via `legacyRouteGoneResponse()`.

### 0.0.1

Base URL now passed in through env. Accessed in dashboard. No more NGROK.

---
