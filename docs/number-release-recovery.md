# Number release recovery

Number release saves a workspace-scoped `workspace_number_release` record before it changes provider resources. The record keeps the original local ID, creation time, phone, provider account, provider resource IDs and Messaging Service IDs. A completed record stays available for repeated requests after the local number row is gone.

The phases are:

1. `prepared`: save the release identity and verify the provider targets.
2. `releasing`: commit removal from the onboarding sender list before provider deletion. Detach the verified sender from its Messaging Services, then remove the verified caller IDs and incoming number.
3. `released`: provider removal is confirmed, including a known missing resource in the original account. Finish local cleanup without another provider call.
4. `completed`: local row deletion and completion commit in one transaction.

Provider calls run outside database transactions. Each attempt checks the release lease and original account. A five-minute lease stops concurrent requests from running the same release. Expired work is claimed by the `number_release_recovery` worker, in batches of 25. Its scheduled tick runs once a minute and schedules the next tick even if recovery fails.

A failure keeps the saved identity and releases its lease for retry. DELETE `/api/workspaces/{workspaceId}/numbers/{numberId}` returns HTTP 409 with `Release incomplete for {phone}. Retry to finish sender cleanup and number release.` The phone-number form returns the same status and message through its existing feedback path. A known completed release returns the normal success response. An unknown or foreign number does not receive a completed-release response.

Sender bookkeeping reads fresh onboarding state under the workspace lock. It removes only the released phone and keeps other senders and settings. If the Messaging Service changes during provider deletion, completion saves another `releasing` phase and returns the incomplete state. Retry cleans the newly recorded service before it deletes the local row. A missing retry credential keeps the incomplete state; it does not claim that provider deletion never occurred.

After a sender cleanup failure, readiness identifies the exact missing or unexpected phone. The existing SMS readiness gate stays in force until the sender pool matches.

Run the real database cases with `DATABASE_URL=... npm run test:integration-db -- test/integration-db/number-release-recovery.test.ts`. The suite also accepts `INTEGRATION_DB_URL` as an override. It uses actual persistence and HTTP handlers with a simulated Twilio SDK boundary. It does not delete live numbers, send messages or notify customers.

The hand-written migration is `client/migrations/20261006000001_number_release_recovery.sql`. Both database bootstrap paths include it. Do not delete an unfinished release record to clear an error: it is the identity needed for safe recovery. A replaced local number or changed provider account requires operator review.
