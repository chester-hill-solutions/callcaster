# Predictive machine callback recovery

The initial voice URL uses synchronous AMD. The machine path returns Pause,
Play and a signed POST Redirect from that URL. It does not replace live call
instructions with a REST Calls update.

The `predictive_machine_operation` row binds the workspace, call, outreach
attempt, campaign, conference and actor. It also keeps the selected audio and
acknowledgement URL. A changed URL, foreign attempt or expired owner cannot
issue the same audio again.

| State | Meaning and permitted recovery |
| --- | --- |
| prepared | No Play response is committed. A signed callback can replace an expired 10-second preparation owner while the stored call and attempt remain live. |
| issued | One response containing Play is committed. Replays poll its saved operation and cannot emit another Play. A retry poll ends after 30 seconds and records uncertainty. This wait limit does not truncate the original Play response. |
| acknowledged | The signed post-Play callback committed the operation, preserved a newer operator disposition and queued one continuation in the same transaction. |
| dropped | Audio was disabled or absent. The operation committed no-answer and one continuation without playback. |
| continuing | One worker owns a 120-second continuation lease. It verifies the assigned queue row and new outreach attempt before reserving a provider send. |
| continued | The next turn finished. Worker retries return without another send. |
| uncertain | Instructions or a successor send lack enough confirmation. Keep the record and its failure visible. Do not replay audio or clear the send reservation to force another call. |

## Evidence and billing

A post-Play callback proves that Twilio reached the next instruction URL. It
cannot prove that a person heard the audio. XML construction, a successful
Calls create response and a terminal call status are different evidence.
The machine operation does not own the terminal call-status claim or billing.
The status callback still records and bills provider outcomes; when a machine
operation exists, it does not start a second continuation.

Playback reconciliation reads the original provider call. Its SID and account
must match the stored call. Legacy rows with no account cannot supply this
recovery proof. A live call schedules another check. For an ended call, event
history is checked no earlier than 15 minutes and 30 seconds after its end.
Only the exact saved POST acknowledgement URL and call SID can recover a
missing local acknowledgement. The read is bounded to 1,000 events; absent,
incomplete or mismatched evidence remains uncertain.

Twilio documents event availability in the
[Call Event resource](https://www.twilio.com/docs/voice/api/call-event-resource).
The [Redirect verb](https://www.twilio.com/docs/voice/twiml/redirect) transfers
control after earlier verbs. The retry token in the
[connection override reference](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides)
distinguishes retry attempts; it is not the operation's idempotency key.

## Worker failure and operator recovery

The existing job queue stores `predictive_machine_continue` and
`predictive_machine_reconcile`. Both use the existing retry and dead-letter
policy and ops paging. The admin dead-letter page shows exhausted jobs.
Requeueing a job preserves the operation's send fence.

- Before send reservation, an expired worker can be replaced safely.
- A definite 4xx provider rejection releases the queue claim and permits a
  normal job retry. A network failure or 5xx response stays uncertain.
- A saved successor call and its journal SID commit together. A replacement
  worker can finish its queue cleanup without calling the provider again.
- If a send started but no successor SID was saved, neither a job requeue nor
  a stale queue sweep can authorize redial. Inspect provider records and the
  stored operation. Use the verified adoption command below when a candidate
  call exists. Absence from a provider list does not prove no send; that case
  stays fenced. No blind state reset is supported.
- A late valid post-Play acknowledgement can recover issued playback
  uncertainty while no successor send has started.

Use the call SID, workspace and operation ID to find the provider record,
operation and related jobs. Preserve the actor, queue and attempt bindings.
Do not change the call's provider status to make the machine operation finish.

## Verified successor adoption

Each reserved successor gets saved voice and status callback URLs with the
operation, attempt and workspace identifiers. A terminal callback is validated
with the real signature validator before unknown-call handling. Its exact URL,
workspace, operation, attempt, original account, outbound direction and SID must
match the reservation. The signed evidence and one reconciliation job commit
together. Conflicting SIDs are rejected. The job cannot replace a live send
owner. If the original create owner later saves the child successfully, that
save also queues the missed terminal lifecycle in the same transaction. To recover a send whose local call ID was lost, run
`bun run scripts/db/recover-predictive-successor.ts WORKSPACE_UUID OPERATION_UUID CALL_SID`
with the app environment. This reports the target without changing it. Add
`--apply` to queue its existing reconciliation worker. The command does not
place a call.

The worker reads the candidate from the workspace provider account. It requires
the exact candidate SID, the stored parent account, an outbound API call and a
terminal status. A saved signed terminal callback for that SID and status proves
the reservation without voice event history or an end timestamp. This supports
busy, failed and unanswered calls, which do not request the voice URL and can
have an empty end time. The [Call resource](https://www.twilio.com/docs/voice/api/call-resource)
documents these terminal callbacks and timestamp limits.

Without saved signed evidence, recovery requires POST event history at the
saved voice URL with that SID, at least 15 minutes and 30 seconds after a usable
end time. Missing or wrong evidence fails visibly and preserves the send fence.
An active send owner cannot be replaced. If both callback delivery and usable
provider evidence are absent, recovery remains fenced; a terminal status alone
does not authorize redial.

Verified adoption saves the child call, its journal ID and one existing status
sync job in the same transaction. That job owns the provider terminal status
and billing. Queue cleanup then completes without another provider send.
Repeated recovery cannot replace the saved child. For a failed, busy or no-answer
child, adoption also saves one child continuation journal and its worker job in
that transaction. The terminal callback uses the same outcome policy and sees
that journal, so it cannot start a second turn. Completed and canceled children
keep their stop behavior. Status sync retains billing ownership.

Before an unsent continuation, paused or waiting campaigns schedule another
check without changing campaign status. A campaign that has stopped ends the
continuation. The send reservation also checks that the campaign is running.

## Verification scope

The signed-route database tests use the actual TwiML builder, signature
validator and transaction state. The continuation database tests use the
actual dialer and queue RPCs with a stubbed provider, including fresh-process
replays. These tests do not replace full CI, the exact PR head checks, deployed
migration and worker checks, or release QA with a test Twilio account.
