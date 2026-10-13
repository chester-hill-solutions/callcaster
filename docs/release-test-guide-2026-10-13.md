# Release test guide 2026-10-13

Use a test workspace and test contacts. Check these flows after promotion. Keep the listed issues open until their remaining acceptance checks pass.

| Flow | Check | Expected result |
| --- | --- | --- |
| SMS report | As an owner or admin, export a completed message campaign with replies and staff replies. Download PDF and CSV files. | Files open. Text and counts match the saved messages. Other receiving numbers and later campaigns do not enter the report. |
| Report access | Request the same export and download links as a member, then from another workspace. | Member receives 403. Non-member receives 404. No private download link is returned. |
| Report window | Use a campaign whose messages were queued before their send time. | The active window uses send time. An unsent later campaign does not cut off replies. |
| Upload polling | Open a completed call-list upload and poll it through the workspace API. | Both paths show the saved completion and row counts. |
| Chats | Open a large list, scroll, choose Recent activity, and send a reply. | The list stays responsive. The chosen sort stays active. One saved message bubble replaces the pending message. Two staff sessions sending identical text retain both saved messages. Page refreshes before or after live events do not restore a pending entry. |
| Contacts | As a member, delete one test contact. Repeat as a caller. | Member can delete the contact. Caller cannot use the write action. |
| Manual calling | Use two callers and a household of 11 contacts. | The household stays with one caller. The next caller receives different contacts. |
| Call audio | Connect a test call, reach voicemail, and leave the call page. | Ringback stops. Leaving waits for hangup and stops microphone tracks. |
| Script text | View a call script with paragraphs and a list. | Authored line breaks remain visible. |
| SMS launch | Open a large local-number send. | One bulk warning retains split and override actions. Readiness still blocks an unsafe launch. |
| Onboarding | Check default and selected action buttons in dark mode. | Labels remain visible in the exact SMS setup flow. |
| Local tools | Check service status and the full stop action on a local test stack. | Status lists all services. Stop actions finish in dependency order. |

## Recorded release checks

- Separate standards and specification reviews cover the promotion diff. SMS report defects found by review were repaired in a separate PR.
- The full local CI result and GitHub checks are recorded in the release PR.
- Temporary PostgreSQL checks cover upload recovery, campaign result counts, and SMS report generation.
- A real SQL claim kept an 11-contact household together and gave the next caller 10 different contacts.
- A rendered PDF displays Thai, Chinese, Cyrillic, and emoji text. Extraction retains the original replies. Complex-script shaping and combined emoji remain font limitations.

## Checks that still need live evidence

- #1292: repeat the current remote-disconnect flow. Earlier fixes failed live checks.
- #2524: repeat the Helium Browser / Windows 11 campaign-join sequence.
- #2034: repeat the original zero-contact and stuck Hang Up sequence.
- #1832: check button visibility in the exact SMS setup flow.
- #1857: use IVR timing logs to locate the reported delay.
- #1752: finish the remaining report presentation, inbound daily-volume and campaign-health acceptance work.
- #2168: finish the subaccount name backfill and repeat the cull policy checks.
