# Next scoped Effect adoption: call-status polling

The campaign export pilot shipped and is proven ([ADR-0035](./0035-scoped-effect-export-polling-pilot.md),
[PR #2713](https://github.com/chester-hill-solutions/callcaster/pull/2713),
[Bug #2712](https://github.com/chester-hill-solutions/callcaster/issues/2712)). ADR-0035 limits
Effect to campaign exports and requires a separate decision and regression evidence for each later
adoption. This ADR is that decision. It records a verdict for every ranked candidate and selects one
next slice. Implementation rides separate atomic tickets and pull requests.

Source reviewed: `cfab7058448bd19d14a321a1db59340043e0efe5`.

## Decision

Adopt Effect 4.0.5 (the `effect-runtime` alias) for **call-status polling** in
[`app/hooks/call/useCallStatusPolling.ts`](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/hooks/call/useCallStatusPolling.ts#L31),
and reuse the export pilot's task shape.

The current hook polls through `useInterval` with an `inFlightRef` guard. The guard stops overlapping
requests, but it does not cancel a pending fetch and it does not reject a stale `onStatus` after the
call changes. A read that started for call A can resolve after the screen moved to call B, and that
old callback then drives `acceptCustomerStatus(oldSid, …)` — the session owner accepts provider
status for a call it no longer shows.

The Effect task removes both gaps structurally:

- The task owns one committed identity: Workspace, call SID (or agent-leg SID), and the resolved
  polling target. A change to any of them starts a new task and interrupts the old one.
- The task waits, reads one status, publishes, then repeats only after that read completes.
  Publication sits outside the wrapped Promise, so an interrupted task cannot apply a late result.
- A React effect owns the `AbortController`. Cleanup interrupts the Effect and aborts fetch.

This is not a pass-through. The task controls cancellation and owner identity, and the cancellation
reaches the real adapter (fetch abort). A plain abort-aware loop can also close both gaps, so it
stays the fallback. Effect is chosen because the pilot already selected it for this problem class,
and one correct pattern for client polling is safer than two.

## Scope and preserved behavior

- Keep the hook's options and its `void` return. The caller (`useCampaignCallFlow`) stays unchanged.
- Keep the 5000 ms default interval, status normalization (`normalizeProviderStatus`), customer-leg
  resolution, the SSE fallback, and the canonical call-session owner.
- Keep Effect types inside the hook module.
- Do not add a second cancellation mechanism beside the SDK and SSE owners.
- Do not change the `/api/call-status-poll` contract.

## Regression evidence

- Delay call A, switch to call B, then resolve A as completed. B must stay unchanged; A's late status
  must not reach `acceptCustomerStatus`.
- Serial reads: a slow read must not overlap the next tick.
- Disable while enabled, unmount mid-read, transient read error then recovery, and a suspended React
  transition.

## Ranked candidate outcomes

| Order | Candidate | Outcome |
| --- | --- | --- |
| 1 | [Call status polling](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/hooks/call/useCallStatusPolling.ts#L31) | **Adopt next** (this ADR) |
| 2 | [Audience Upload Status polling](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/components/audience/use-audience-upload-progress.ts#L214) | Approved next, after its response contract is corrected |
| 3 | [Audio conversion lifetime](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/lib/audio.server.ts#L144) | Defer; first server candidate |
| 4 | [Recording download and copy](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/lib/call-recording-storage.server.ts#L64) | Defer |
| 5 | [Post-call Credits reconciliation](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/hooks/billing/useCreditReconciliation.ts#L44) | Defer; needs a prerequisite split |
| 6 | [Optional Live Coaching requests](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/services/media-stream/coaching-llm.ts#L36) | Defer |
| 7 | [Speaker-test resource ownership](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/hooks/call/useAudioDeviceTest.ts#L128) | Reuse existing code |
| 8 | [Handset Session and Device recovery](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/hooks/call/useTwilioConnection.ts#L156) | Defer; split first |

### Audience Upload Status polling

Approved as the following slice, with the same pattern. Keep the immediate first read, the
upload-attempt and Workspace guards, the shared SSE subscription, the snapshot reducer, the warning
policy, and exactly one completion handoff. Preserve the different error policies for the two
consumers.

Correction required first: the
[Audience detail poll](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/routes/workspaces%2B/%24id/audiences/%24audience_id.route.tsx#L61)
reads flat `data.status`, while the
[status loader](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/routes/api%2B/audience-upload-status.loader.server.ts#L43)
returns `{ ok, snapshot }`. A completed or failed upload therefore never stops this poll. Correct and
test that response contract on its own, independently of the Effect choice.

### Audio conversion lifetime

Defer. This is the first server candidate and the strongest resource-scope case: one conversion owns
a temporary file, a child process, three streams, a deadline, and cleanup. Today that ownership is
spread across `transcodeAudioBuffer`, `transcodeToWavBuffer`, and `runAudioTool`, and the process
helper has no cancellation or deadline input. Adopt only after a separate decision that keeps
seekable MP4/M4A input and current MP3/WAV behavior, decides cancellation ownership (cancel kills the
child), and measures the server cost. Server-side Effect does not raise the client bundle.

### Recording download and copy

Defer. Scope Effect to one attempt only. Keep persisted recording identity, stable object keys,
attempt limits, and failures that must reach the durable worker. Durable retries stay in Postgres;
local interruption cannot replace cross-process guarantees.

### Post-call Credits reconciliation

Defer, with a prerequisite. `reconcileFromServer` publishes inside its Promise, so an Effect wrapper
alone cannot suppress a late balance update. Separate snapshot reading from publication first. Keep
the 30-second window and the balance-moved convergence rule.

### Optional Live Coaching requests

Defer. A simple request deadline may be sufficient. Do not retry chargeable generation and do not
rewrite the media-stream service.

### Speaker-test resource ownership

Reuse existing code. Extend the existing tone-player adapter
([`app/lib/call-tone-player.client.ts`](https://github.com/chester-hill-solutions/callcaster/blob/cfab7058448bd19d14a321a1db59340043e0efe5/app/lib/call-tone-player.client.ts#L17))
first; its stop path already stops every oscillator, closes the context, and stops the output
element's tracks. Effect is optional if a small owner fix is sufficient. Retain the borrowed
microphone stream.

### Handset Session and Device recovery

Defer, split first. Separate registration and retry lifetime from pending connect/hangup work. Keep
ADR-0024's canonical call owner, active/held call gates, token refresh behavior, and existing safe
teardown. Recent fixed faults are regression controls, not new findings.

## Considered options

- **A shared polling framework.** Rejected for now. ADR-0035 kept the pattern export-specific
  "before the first consumer has proved useful". The second consumer is the point to test the
  pattern, not to generalize it. Decide a shared helper only after two consumers use the same shape.
- **A plain abort-aware loop for call-status polling.** Viable and smaller in dependencies. Recorded
  as the fallback (see Stop rules). Rejected as the primary because the pilot already chose Effect
  for this problem class.
- **Server-first (audio conversion).** Deferred. It is stronger for resource scope but needs its own
  cost measurement and a cancellation-ownership decision. Kept as the next distinct adoption.

## Stop rules

- Fall back to a plain `AbortController` loop if the Effect task needs an extra pass-through to
  control cancellation, or if the measured client bundle delta is not acceptable.
- Revert if the hook interface, normalization, customer-leg resolution, or SSE fallback must change
  to make Effect fit.
- Keep one cancellation owner. Do not keep the `inFlightRef` guard beside the Effect task.

## Required before the implementation merge

- Full `npm run ci:local`, the applicable remote checks, and a measured client bundle/chunk
  comparison against the same build configuration.
- Keep the npm and Bun locks synchronized for any dependency change. None is expected: the
  dependency already ships in `package.json`.

## References

- [Effect pilot for campaign export polling (ADR-0035)](./0035-scoped-effect-export-polling-pilot.md)
- [Issue #2716 — Decide the next scoped Effect adoption](https://github.com/chester-hill-solutions/callcaster/issues/2716)
- [Bug #2712 — campaign export polling](https://github.com/chester-hill-solutions/callcaster/issues/2712)
- [Effect 4 resource scopes](https://effect.website/docs/v4/resource-management/scope)
- [Effect 4 schedules](https://effect.website/docs/v4/scheduling/using-schedules)
