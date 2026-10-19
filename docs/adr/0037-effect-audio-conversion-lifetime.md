# Effect adoption: audio conversion lifetime

[ADR-0036](./0036-next-scoped-effect-adoption-call-status-polling.md) defers audio conversion as the
first *server* candidate, to adopt only after a separate decision that keeps seekable MP4/M4A input
and current MP3/WAV behavior, decides cancellation ownership, and measures the server cost. This ADR
is that decision.

Source reviewed: `d4d775c333e98c64a8141cc35ebfe73ce858a8ed`.

## Decision

Adopt Effect 4.0.5 (the `effect-runtime` alias) for the audio conversion process scope in a new
client-free module, `app/lib/audio-process.server.ts`, and route the existing conversions through it.

One conversion now owns its staged input file, child process, stdout/stderr, deadline, and cleanup
inside a single `Effect.scoped` program:

- The staged input file is an `Effect.acquireRelease` whose release removes that exact path. The path
  is registered before the write, so a partial write is still removed.
- The child process is an `Effect.acquireRelease` whose release kills it, so interruption and the
  deadline both stop the process instead of leaving it running.
- `Effect.timeout` enforces the deadline.

Before this change that ownership was spread across `transcodeAudioBuffer`, `transcodeToWavBuffer`,
and `probeAudioDurationMs` (each with its own `try/finally rm`) and `runAudioTool`, which had no
cancellation and no deadline — a wedged ffmpeg held the upload action open forever.

## Cancellation ownership (explicit)

The conversion is the only owner that kills the child. Two events kill it:

- the caller's `AbortSignal` (wired through `Effect.runPromise`'s `signal`), and
- the deadline.

No route currently passes a signal, so the deadline is the trigger in production. The `signal` input
exists so a caller can cancel without a second mechanism.

## Deadline (explicit)

`AUDIO_PROCESS_TIMEOUT_MS` is a **wedge guard, not a performance budget**. It is deliberately
generous (ten minutes): a short deadline would break a legitimate large conversion, which is a worse
failure than a slow one. The guard only stops an ffmpeg/ffprobe that never exits. On expiry the child
is killed and the conversion fails with the caller's `failed` message plus `(timed out).`.

## Considered options

- **A plain owner fix (no Effect).** A `try/finally` plus a `setTimeout` kill is smaller in
  dependencies and was the fallback. Rejected because the reworked ownership is exactly a resource
  scope, and Effect makes the child, the staged file, and the deadline share one guaranteed release
  order. This slice also proves Effect on the server, where the export-pilot cost does not apply.
- **Move staging only, with no deadline.** Rejected: the deadline is the actual robustness gain. The
  repeated `try/finally` cleanup was already correct.
- **Thread a request-abort signal through every route action.** Out of scope. React Router does not
  hand the action an abort signal, so there is nothing to thread today; the `signal` input is ready
  for the caller that has one.

## Consequences

- `runAudioTool` keeps its signature and error mapping; it now delegates to the scoped runner in
  stdin mode. Trim and probe behavior is unchanged.
- `probeAudioDurationMs`'s dependency seam becomes `runAudioProcess` instead of `runAudioTool`.
- The child is killed on scope exit even after a normal exit. `ChildProcess#kill` on an exited child
  is a no-op.
- Server-side Effect does not enter the client bundle. Its cost is a server-bundle delta, measured in
  the implementation PR.

## References

- [ADR-0036](./0036-next-scoped-effect-adoption-call-status-polling.md)
- [Issue #2724](https://github.com/chester-hill-solutions/callcaster/issues/2724)
- [Effect resource scopes](https://effect.website/docs/v4/resource-management/scope)
