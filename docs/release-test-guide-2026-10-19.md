# Release checks — 2026-10-19

After the production deploy, use a fresh page load. Record the environment and deployed commit for each check. Automated tests and code review do not replace live acceptance.

## Access form notices — #2459

PR [#2730](https://github.com/chester-hill-solutions/callcaster/pull/2730) stops the Access form showing two success notices for one recovery click.

1. Open a workspace, go to the Access tab, and restore a member's role.
2. Check that exactly one success notice appears.
3. Check that a second, different action still shows its own notice.

## Call-in verification number — #2519

PR [#2726](https://github.com/chester-hill-solutions/callcaster/pull/2726) stores the call-in verification number in the database instead of an environment variable.

1. Check that the verification number is set in Admin and is the number agents are told to dial.
2. Check that calling the number reaches the verification flow, and that a wrong code is rejected.
3. Check that the platform shows the number as unconfigured, and that the verification session route reports the feature as unavailable, when no number is active.

**Production has no verification number today.** It has no `VERIFICATION_PHONE_NUMBER` in its environment and no row in the table, so the feature is unavailable before this release and unavailable after it. What changed is the failure mode: the old getter threw, the new one returns "not configured" and the route answers 503. To turn the feature on, register a number in Admin after the deploy and check it again.

## SMS dispatch window and pacing — #1791, #1792

PRs [#1796](https://github.com/chester-hill-solutions/callcaster/pull/1796) keep campaign sends window-aware and fair.

1. Set a campaign window that closes mid-batch, with a slow send rate.
2. Check that no message starts after the window closes, and that the remaining rows stay queued rather than being sent.
3. At one message per second, check that the provider sees the requests spaced by about a second, including across batch boundaries.
4. Check that a workspace on a higher rate still sends at its own rate.

## Campaign schedule concurrency — #1794

PR [#1797](https://github.com/chester-hill-solutions/callcaster/pull/1797) guards concurrent campaign status updates.

1. Pause a scheduled campaign while its schedule sweep is running.
2. Check that the campaign stays paused and that the sweep does not report a transition to running.
3. Check that a campaign left to expire still reports waiting or complete correctly.

## Power-dial leave — #2702

PR [#2708](https://github.com/chester-hill-solutions/callcaster/pull/2708) releases only the caller's own assignment on leaving a campaign.

1. In a predictive campaign, leave the campaign.
2. Check that the queue assignment for the leaving caller is released and that other callers keep theirs.
3. Check that the dialer stops for that caller.

## Workspace event stream — #2703, #2704

PRs [#2707](https://github.com/chester-hill-solutions/callcaster/pull/2707) and [#2709](https://github.com/chester-hill-solutions/callcaster/pull/2709) serialize the event stream and coalesce revalidation.

1. With two browser tabs on the same workspace, make a change in one.
2. Check that the other tab updates, and that no duplicate event is delivered.
3. Open a workspace while a burst of events arrives, and check that the page finishes loading.

## Calling screen cleanup — #2705, #2706

PRs [#2710](https://github.com/chester-hill-solutions/callcaster/pull/2710) and [#2711](https://github.com/chester-hill-solutions/callcaster/pull/2711) release the microphone and finish the phone teardown.

1. Start a call, then leave the calling screen before the microphone selection resolves.
2. Check that the browser's microphone indicator goes out.
3. Check that a transport error during teardown still leaves the call finished and the controls back on the dialer.

## Call-status polling — #2718

PR [#2721](https://github.com/chester-hill-solutions/callcaster/pull/2721) scopes call-status polling to the current call.

1. Start a call and let it run.
2. Check that the call screen stays current, and that a second call in another tab does not disturb it.
3. Check that leaving the call stops the polling.

## Audience upload polling — #2719, #2722

PRs [#2720](https://github.com/chester-hill-solutions/callcaster/pull/2720) and [#2723](https://github.com/chester-hill-solutions/callcaster/pull/2723) stop the polls when they are done.

1. Upload a call list and open its detail page.
2. Check that the progress updates while the upload runs and that it stops when the upload finishes.
3. Check that the detail page stops polling when you navigate away.

## Campaign export polling — #2712

PR [#2713](https://github.com/chester-hill-solutions/callcaster/pull/2713) serializes the export status requests.

1. Start a campaign export.
2. Check that the progress updates without overlapping status requests, and that it settles on a result.
3. Check that starting a second export while one is running does not interleave their status.

## Audio conversion — #2724

PR [#2725](https://github.com/chester-hill-solutions/callcaster/pull/2725) bounds the audio conversion child process.

1. Upload an audio file that is long enough to take a while to convert.
2. Check that the conversion completes and the clip appears.
3. Check that a conversion that cannot finish does not leave the page waiting forever, and that the temporary file does not stay behind.

## Railway variable preservation — #2714

PR [#2715](https://github.com/chester-hill-solutions/callcaster/pull/2715) preserves an existing variable in the modeled environments.

1. Run the Railway plan for the project.
2. Check that the plan does not propose deleting a variable that already exists outside the model.

## Twilio resource inventory — #1165

PR [#2733](https://github.com/chester-hill-solutions/callcaster/pull/2733) adds a read-only report of the Twilio resources that may belong to a dead environment.

1. Run `npm run tools:twilio:prune-report` with the production database URL.
2. Check that it reports the live accounts, the TwiML Apps, the phone numbers and the subaccounts.
3. Check that the Chester Hill Solutions business line appears as held, and that no long-lived environment appears as stale.
4. Check that the report changes nothing. It has no delete path.

## Permission model decision — #2030

PR [#2729](https://github.com/chester-hill-solutions/callcaster/pull/2729) records the decision that role checks become capability checks. There is no live check. The decision is in `docs/adr/0039-role-checks-become-capability-checks.md`.

## Release verification

- Confirm the release PR passes the exact-head checks and both app and worker preview deployments.
- Confirm the production app and worker deploy the release merge commit.
- **This release adds a migration**: `client/migrations/20261019000001_verification_number.sql` creates the `verification_number` table and its single-active unique index. It is additive, touches no existing table, and inserts no row. Check that the production database has the table after the deploy; the feature stays unavailable until an operator registers a number in Admin.
- **This release adds a dependency**: `effect-runtime` (an alias of `effect@4.0.5`). Confirm the app and worker images build and boot with it.
- Confirm the release PR body names every promoted issue with its own closing keyword. The release gate fails when a keyword is followed by a comma list, because GitHub closes one issue per keyword.
- Recheck all production behavior after deploy. The live call check needs the agreed recipient and purpose.
