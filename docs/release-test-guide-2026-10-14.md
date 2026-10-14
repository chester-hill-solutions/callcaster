# Release checks — 2026-10-14

Use a fresh page load after deployment. Record the environment and deployed commit with each result. Automated tests and code review do not replace the live checks below.

## Campaign call audio — #2532

PR [#2567](https://github.com/chester-hill-solutions/callcaster/pull/2567) removes the app-generated ringing loop. The previous stop-on-connect repair retained that loop. The user reported that the overlap remained on master.

1. Reload the call page. Select computer calling, then start an authorized call to an agreed test recipient.
2. While the call connects, check that no app-generated ringing loop plays. Available call media can supply progress audio; some call paths can be quiet.
3. Answer the call. Check that speech has no extra ringing over it. Check mute, DTMF, hang-up and microphone cleanup.
4. With an agreed test recipient, repeat through voicemail. Check that the greeting has no extra ringing over it.
5. Repeat with a verified handset. Check that the selected handset and call routing remain correct.
6. Check the explicit speaker test and the end-of-call signal. These remain available.

No live call was placed during implementation. Live checks require an agreed recipient and purpose.

## SMS unread count — #2511

PR [#2566](https://github.com/chester-hill-solutions/callcaster/pull/2566) refreshes the navigation count after a successful local read.

1. Start with unread messages in at least two conversations. Open one conversation. Check that the complete navigation total falls after the read succeeds, without waiting for the next poll.
2. Open the same conversation again. Check that it does not subtract twice.
3. Check a single-message read and a delayed read. The badge changes after success; a failed read retains the saved count.
4. Change workspaces while a read or count is pending. Check that a late response cannot replace the new workspace's count.

## Calling-device dropdown — #2518

PR [#2565](https://github.com/chester-hill-solutions/callcaster/pull/2565) keeps the parent settings dialog open during dropdown selection.

1. Open calling settings and select a device from the dropdown. Check that the settings dialog stays open and shows the selection.
2. Reopen the dropdown and press Escape. Check that the dropdown closes first. A second Escape can close the dialog.
3. Check keyboard focus and interaction at a narrow viewport and in both themes.

## Settings errors — #2306

PR [#2558](https://github.com/chester-hill-solutions/callcaster/pull/2558) sends email validation to the Email field and other action failures to one toast.

1. Leave Email empty and submit Invite. Check that the missing-email validation appears beside Email and entered values remain available for retry.
2. Exercise an authorized non-email failure. Check for one toast and no incorrect Email error.
3. Retry after correction. Check that old feedback does not replay or move the page unexpectedly.

## Notices and telemetry — #2061, #2062

PRs [#2561](https://github.com/chester-hill-solutions/callcaster/pull/2561) and [#2562](https://github.com/chester-hill-solutions/callcaster/pull/2562) separate neutral styling from warning and error severity.

1. Check neutral notices in both themes. Check campaign safeguards, authenticator setup and Twilio warnings for their explicit warning tone.
2. In the configured telemetry environment, confirm that neutral and success notices do not become warning or error records.
3. Confirm that changed notices are captured and same-text errors retain their error severity without duplicate replay.

## Vendored UI build — #1615

PRs [#2563](https://github.com/chester-hill-solutions/callcaster/pull/2563) and [#2564](https://github.com/chester-hill-solutions/callcaster/pull/2564) enforce drift checks and stabilize generated output order.

Confirm the release's exact-head quality log passes `check:vendor-dist`, including all 263 `shad-cc` generated files. This is build evidence, not a live UI check.

## Release verification

- Review the final `master...dev` comparison for source, documentation and requirements.
- Require a complete local `npm run ci:local` pass before each push or PR.
- Require the applicable exact-head GitHub checks and actual app and worker preview successes before merge.
- Confirm both production services deploy the release merge commit successfully.
- This release changes no database schema or migration files. Verify that statement against the final comparison before promotion.
- Keep the seven promoted issue references in the release PR. Do not close other reports based on this release.
