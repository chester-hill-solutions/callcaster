# Release test guide — 2026-09-07 (release [#1638](https://github.com/chester-hill-solutions/callcaster/pull/1638))

Manual verification for every customer- and operator-facing entry in the [2026-09-07 changelog section](./CHANGELOG.md#2026-09-07--release-1638). Each row names the PR it checks. Automated coverage for the same change is listed at the end so you can skip rows that CI already proves when time is short.

**Where to run it:** staging first (tracks `master`, so run after the release PR merges and Railway redeploys), then the same smoke rows on production. Rows marked **API** use `curl` with a bearer session token; rows marked **ops** need Railway logs or database access.

**Accounts you need:** an owner, an admin, and a member of one workspace; a second workspace you own; a phone that can receive texts and calls; Stripe test mode on staging.

**Recording results:** copy this file into the release PR thread or a checklist issue and fill the Status column with pass, fail, or skipped (with the reason).

## 0. Deploy smoke

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| S1 | `curl -s https://<host>/readyz` | 200 | | |
| S2 | Boot log (ops) | One `client-migration bootstrap applied` line each for `20260905120000_message_client_ref`, `20260906120000_campaign_allow_bulk_local_send`, `20260906130000_sample_content_marker`; `20260814000000_drop_supabase_era_orphans` either applied or logged as skipped per object, never a boot failure | #1549, #1602 | |
| S3 | Boot log (ops) on a two-replica deploy | Only one instance logs the migration pass; the other logs that the advisory lock was held | #1549 | |
| S4 | Open the app in light and dark mode | Pages render; no missing colours on status text or badges | #1632 | |
| S5 | `GET /workspaces/<id>/design` in production | 404 unless `DESIGN_GALLERY_ENABLED=1` | #1617 | |

## 1. Auth and account

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| A1 | Sign in as an owner or admin | No authenticator code prompt; no enrollment nag | #1569 | |
| A2 | Account → Security | Notice that two-factor authentication is currently off; existing enrollment not deleted | #1569 | |
| A3 | Forgot password → open the link → set a password with a leading space | Success; sign in works only with the leading space included | #1562 | |
| A4 | Reuse the same reset link | Page reports the link is invalid or expired; does not say success | #1562 | |
| A5 | Sign in on two browsers, reset the password from one | The other browser's session is signed out on its next request | #1565 | |
| A6 | **API** `POST /api/auth/reset-password` with `{ token, newPassword }` and no cookie | 200; the password changes | #1568 | |
| A7 | **API** `POST /api/auth/sign-out` with `Authorization: Bearer <token>` then reuse the token | The second call is 401 | #1566 | |
| A8 | Settings → Members as a **member**: invite someone as admin | Refused; a member can invite only at or below member | #1546 | |
| A9 | Settings → Members as an owner: invite with a made-up role value (edit the form) | 400; no invite row | #1546 | |
| A10 | With `SIGNUP_OPEN` off, open an accept-invite link for an address with no account | "Registration is closed." refusal, no account created | #1552 | |
| A11 | Settings → transfer ownership from the form | Succeeds while 2FA is off; with `TWO_FACTOR_ENABLED=1` a new owner without 2FA is refused on both the form and the API | #1525 | |

## 2. Tenant isolation

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| T1 | **API** `POST /api/contacts` authorized for workspace A with `workspace: <B>` in the body | The contact is created in A; B is untouched | #1545 | |
| T2 | **API** `PATCH` any workspace-scoped record with `workspace_id: <B>` in the payload | The row stays in A; the field is ignored | #1544 | |
| T3 | Register the same external caller ID in two workspaces; complete verification in one | Only that workspace's number row changes capabilities (ops: check `workspace_number` for both) | #1523 | |
| T4 | Try to verify, as a caller ID, a number the workspace rents | Refused before any Twilio call; the number keeps type `rented` | #1527 | |
| T5 | **ops** Start a live call with transcription; replay the media-stream start frame with another call SID | The socket is rejected; no transcript rows appear on the other call | #1530 | |

## 3. Campaign lifecycle

Prerequisites: a message campaign with a small call list, a workspace with a low balance you can adjust in Stripe test mode or the admin ledger.

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| C1 | New campaign → Setup → Schedule | Calling hours default to 09:00–21:00; enabling a day or "Apply to Weekdays / All Days" uses the same default | #1590 | |
| C2 | Setup page: edit a field, scroll to the bottom | A save bar with **Discard changes** / **Save changes** is visible at the bottom as well as the top; **Next** is inert with an explanation until saved | #1613 | |
| C3 | Schedule, Send later picker, Billing → Activity | Every time control and timestamp shows the browser time zone | #1593 | |
| C4 | Set an overnight window 23:00–02:00; check the launch ETA at 01:00 and at 22:00 the same day | 01:00 is inside the window only when the previous day is enabled; the ETA says if the queue may not finish before the end date | #1618, #1620 | |
| C5 | Launch a message campaign with balance for about half the list | Sends stop at the balance; unsent rows stay queued; the campaign is **paused**; the launch page reports insufficient credits | #1600, #1634 | |
| C6 | Top up, then press **Kick off** on the paused campaign | Status returns to running and dispatch resumes; a second press reports "already running" | #1635 | |
| C7 | Launch a live-call session with a balance near the floor; dial a few contacts | The dialer stops when the floor is reached and the claimed contact is released, not dialled into negative | #1524 | |
| C8 | Let a campaign process its last queued contact through any path (an agent's call, an opt-out, a sent text) | Status flips to complete without waiting for a worker tick | #1601 | |
| C9 | Set a campaign end date in the past with contacts still queued; wait for the next dispatch tick | Status becomes complete; a paused campaign with a past end date stays paused | #1532 | |
| C10 | Add a contact with an unroutable number (Twilio test magic number) to a message campaign; launch | The row records failed attempts and is dead-lettered at the limit; the campaign completes instead of retrying forever | #1603 | |
| C11 | Automated phone menu campaign with two contacts that share one phone number | The number is dialled once | #1529 | |
| C12 | Message campaign with 500+ contacts on a Canadian local number | Launch is blocked with the bulk safeguard; an admin can acknowledge the risk and override for this campaign; the override shows while active and can be removed | #1623 | |
| C13 | Results page of a message campaign that sent two texts to one contact | "Total Messages" shows the message count with no "of N" denominator; contact progress counts the contact once | #1633 | |
| C14 | Call list screens, queue picker, onboarding step | Copy says **Call list**, never "Audience" | #1591 | |
| C15 | Campaign type and goal pickers | The automated calling goal is **Automated phone menu** everywhere; no "IVR" or "Robocall" labels | #1594 | |
| C16 | Open a call room in two tabs while another agent's access is revoked | Both tabs share one event connection; the revoked agent is disconnected instead of retrying every few seconds | #1531 | |
| C17 | **API** `PATCH /api/campaign-queue` with `action: "update_status"` and no `status` | 400 naming the missing field; a complete body behaves as before | #1614 | |
| C18 | **API** `POST /api/sms` outside the send window, then inside it, then with no balance | Deferred 200 (`deferred`, `reason`, `nextOpenAt`); dispatched 200 with `creditsExhausted`; 402 | #1625 | |

## 4. SMS outbox and chat

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| M1 | Send one campaign text; inspect the `message` row immediately (ops) | A row exists before the status callback with a `client_ref` and a `pending:` sid; after the callback it carries the real `SM…` sid | #1584 | |
| M2 | Send a one-off chat text | Same intent-then-resolve behaviour as M1 | #1587 | |
| M3 | Block the status callback (ops: pause the webhook route or use a test number that never reports); wait for the open-sync sweep | The pending intent is matched to the Twilio record and billed, or marked failed with no charge when Twilio has no record | #1585 | |
| M4 | Force a message-row write failure after Twilio accepts (ops only, staging) | An operations alert fires naming the message; the send is not silently lost | #1583 | |
| M5 | Make a message reach a terminal state through open sync | The billing job is queued before the terminal status is written; the ledger shows the debit | #1574 | |
| M6 | Text a photo to a workspace number | The image renders in the conversation view | #1558 | |

## 5. Billing

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| B1 | Send one SMS segment and one MMS; check the ledger | 2 credits and 4 credits debited; the pricing page and campaign estimates show the same rates | #1540 | |
| B2 | Billing → Activity filter | "Purchases and credits" hides usage rows; "Usage" hides purchases | #1595 | |
| B3 | Buy credits in Stripe test mode, then Billing → Activity | The purchase row has a **Receipt** link that opens the Stripe-hosted receipt in a new tab; a purchase with no receipt yet says so | #1596 | |
| B4 | **ops** Run the number-rental sweep with a workspace whose balance lookup fails | That number is skipped for the day; no warn, suspend, or release step is taken | #1556 | |
| B5 | Attach the same image to two campaigns; remove it from one | The other campaign still shows the image; removing it from the last campaign deletes the file | #1576 | |
| B6 | Poll the export status URL of a deleted export | 404, not 500 | #1579 | |
| B7 | Workspace that has never had campaigns, numbers, or lists | Banner reads "No credits yet. Add credits to start campaigns and calls." | #1609 | |

## 6. Onboarding and import

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| O1 | Create a brand-new workspace | Owner lands on `/onboarding`; the wizard's Campaign and Script steps are not marked done by the sample content | #1604, #1629 | |
| O2 | Choose the texting goal | The sample campaign becomes a message campaign with sample copy; the phone-menu goal makes it an IVR campaign on the sample script; live calling keeps the live sample | #1630 | |
| O3 | Identity step: save the legal business name only | The step shows complete | #1589 | |
| O4 | Number step | "Rent a Canadian number" and "Verify your own number" titles are not struck through by the box edge | #1592 | |
| O5 | SMS program details step: **Save & continue** after intake is already complete | Moves to the next step instead of staying put | #1606 | |
| O6 | Onboarding SMS goal guidance | No tooltip repeating the visible text; other tooltips wrap at a readable width | #1608 | |
| O7 | Import a CSV with no header row whose first row is a phone number (also try one with an extension, an email, a street address, a postal code) | The first contact is kept; columns are named "Column 1", "Column 2"; the wizard preview and the server import agree | #1622 | |

## 7. Theme and accessibility

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| U1 | Queue table chips, success/warning/error messages, in light mode | Text is readable against white and against tinted cards (darker than the badge colours) | #1632 | |
| U2 | Same in dark mode | Text is lighter than the badge colours and readable | #1632 | |
| U3 | Solid badges and buttons in both modes | Unchanged from the previous release | #1632 | |
| U4 | Hover a long tooltip | It wraps and scrolls past a modest height instead of spanning the page | #1608 | |

## 8. Worker and operations (ops)

| # | Step | Expected | PR | Status |
|---|------|----------|----|:------:|
| W1 | Stall a worker past its claim timeout while a peer takes the job | The stalled worker's complete/fail/heartbeat log `worker.claim_lost`; the peer's result stands | #1551 | |
| W2 | Make a self-scheduling job's successor enqueue fail once | The watchdog re-seeds the chain within minutes and an alert is sent | #1572 | |
| W3 | Open and abort many SSE connections; hit `/readyz` repeatedly | `pg_stat_activity` shows no growth in LISTEN sessions | #1528 | |
| W4 | Run the compose reset script with `DATABASE_URL` pointing at a non-local host | The script refuses | #1554 | |
| W5 | `npm run check:twilio-webhooks` in CI | Reports the derived route count (26 at the time of writing) and fails if it ever derives zero | #1522 | |

## Automated coverage that backs these rows

| Area | Suite or spec | Rows it covers |
|------|---------------|----------------|
| Sign-up and onboarding redirect | `e2e/specs/signup-flow.spec.ts`, `e2e/specs/onboarding-redirect.spec.ts` (#1605, #1604) | O1 |
| Twilio webhook signatures | `e2e/specs/twilio-webhook-auth.spec.ts` (#1598) | S-level auth boundary for every webhook row |
| Design preview a11y in both themes | `e2e/specs/design-preview-a11y.spec.ts` (#1619) | U1–U3 |
| Token contrast ratios | `test/theme-contrast.test.ts` (#1632) | U1–U3 |
| SMS dispatch contract and credit budget | `test/campaign-sms-dispatch-contract.test.ts`, `test/campaign-dispatch-worker.test.ts` (#1600, #1625, #1634, #1635) | C5, C6, C18 |
| Queue completion and dead-lettering | `test/campaign-queue-throughput.integration.test.ts`, `test/campaign-dispatch-worker.test.ts` (#1601, #1603) | C8, C10 |
| Twilio error codes and request shape | `npm run test:integration-twilio` with test credentials (#1607) | C10 |
| Auth flows | `test/reset-password.route.test.ts`, `test/api-reset-password.route.test.ts`, `test/signout.route.test.ts`, `test/accept-invite.route.test.ts`, invite role tests (#1562–#1568, #1546, #1552) | A3–A10 |

## Rollback

Standard revert-merge on `master`. The three new columns and the `client_ref` column are additive and can stay; no data migration reverses.
