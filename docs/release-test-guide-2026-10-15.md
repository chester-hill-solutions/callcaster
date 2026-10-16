# Release checks — 2026-10-15

Release: [#2668](https://github.com/chester-hill-solutions/callcaster/pull/2668).

After production deploy, use a fresh page load. Record the environment and deployed commit for each check. Automated tests and code review do not replace live acceptance.

## Campaign call cleanup — #1292

PR [#2604](https://github.com/chester-hill-solutions/callcaster/pull/2604) continues cleanup after an SDK disconnect error.

1. Use an agreed test recipient and an authorized call.
2. End the call from the recipient side.
3. Check that the completed call returns the controls to Dial, even if SDK disconnect cleanup reports an error.
4. Check that a later Dial click does not reconnect the ended call.

Do not place a live call until the test recipient and purpose are agreed.

## Campaign media preview — #2655

PR [#2666](https://github.com/chester-hill-solutions/callcaster/pull/2666) updates the preview and estimate after uploads and removals.

1. Upload an image to a campaign message. Check that the preview and SMS/MMS estimate update without a page reload.
2. Remove the image. Check that the preview and estimate update.
3. Add media, change message text, then discard the unsaved text. Check that the accepted media stays saved.

## Call-list selection — #2634

PR [#2665](https://github.com/chester-hill-solutions/callcaster/pull/2665) scopes selection to the visible page.

1. Select contacts, then change page, page size, search, sort, and list data. Check that selection follows the visible rows.
2. Try a bulk removal that fails. Check that selected contacts remain available for retry.
3. Check that the bulk action submits only visible selected contacts.

## SMS segment calculator — #2663

PR [#2664](https://github.com/chester-hill-solutions/callcaster/pull/2664) adds estimates from Pricing.

1. Open the calculator from Pricing.
2. Try text that uses GSM-7 and text that needs UCS-2. Check the encoding and segment count.
3. Check the estimated credit cost and the manual encoding choices.

## Password reset — #2605

PR [#2606](https://github.com/chester-hill-solutions/callcaster/pull/2606) returns users to Sign In only after the new password is saved.

1. Use a designated test account and complete a reset.
2. Check that Sign In opens with one password-updated confirmation.
3. Check that the recovery token is no longer in the current URL and that refresh does not replay the confirmation.

## Script builder — #2596

PR [#2600](https://github.com/chester-hill-solutions/callcaster/pull/2600) improves live-call and IVR script editing.

1. Open a live-call and an IVR script. Check that titles can be edited and add-block controls stay easy to reach.
2. Change a block from select to textarea and back. Check that prompts and response options remain.
3. Check that IVR playback selection and validation feedback are clear.

## Campaign setup — #2503, #2504, #2505

PRs [#2579](https://github.com/chester-hill-solutions/callcaster/pull/2579), [#2602](https://github.com/chester-hill-solutions/callcaster/pull/2602), [#2577](https://github.com/chester-hill-solutions/callcaster/pull/2577), [#2601](https://github.com/chester-hill-solutions/callcaster/pull/2601), and [#2583](https://github.com/chester-hill-solutions/callcaster/pull/2583) update campaign setup.

1. Check that campaign pages use breadcrumbs and status navigation without duplicate headers.
2. At desktop and narrow widths, check that Campaign type, Send using, and Outbound number use the responsive three-column field layout.
3. Check that the message-body guidance does not repeat the Content edit action.

## SMS search and settings details — #2513, #2510, #2517

1. In Chats, search the conversation list. Check that scrolling does not keep loading unrelated pages. Clear the search and check that normal paging still works.
2. Open the SMS bulk confirmation. Check that the checkbox aligns with the first line when the text wraps.
3. Open call settings. Check that test and mute buttons do not show redundant icons.

PRs: [#2580](https://github.com/chester-hill-solutions/callcaster/pull/2580), [#2575](https://github.com/chester-hill-solutions/callcaster/pull/2575), [#2578](https://github.com/chester-hill-solutions/callcaster/pull/2578).

## Admin workspace links and terminology — #2508, #1347

1. In Admin → Workspaces, select a workspace name. Check that its workspace details open.
2. Check customer-facing campaign and billing copy for IVR terminology. Technical identifiers stay unchanged.

PRs: [#2582](https://github.com/chester-hill-solutions/callcaster/pull/2582), [#2581](https://github.com/chester-hill-solutions/callcaster/pull/2581).

## Auth-page layout — #2010

PR [#2572](https://github.com/chester-hill-solutions/callcaster/pull/2572) removes unnecessary page overflow.

1. Open Sign In and Sign Up at a short viewport where the content fits.
2. Check that no vertical scrollbar appears until content needs it.

## Release verification

- Confirm the release PR passes the exact-head checks and both app and worker preview deployments.
- Confirm the production app and worker deploy the release merge commit.
- This release has no database migration or lockfile changes. Verify this against the final comparison before merge.
- Recheck all production behavior after deploy. The live call check needs the agreed recipient and purpose.
