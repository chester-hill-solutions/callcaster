# Effect pilot for campaign export polling

Campaign export polling used an async interval. Slow requests overlapped, and
the export owner could change before a start or status response arrived.

Use Effect 4.0.5 for the export-specific polling task behind `useCampaignExport`.
Install it as the `effect-runtime` package alias to preserve OpenCode's exact
development-only Effect prerelease and its peer dependencies.
The task waits two seconds, reads one status, publishes the result, and repeats
only after that read completes. A terminal status ends the task. A React effect
owns its AbortController; cleanup interrupts the Effect and aborts fetch. Publish
outside the wrapped Promise so a dependency that ignores abort cannot apply a
late result. The hook separately owns the POST and checks attempt identity.
Commit owner identity in the effect; an abandoned or suspended render must not
invalidate the export that remains visible.

Keep Effect types inside this client boundary. React Router continues to own
loaders and navigation. The pilot does not change upload polling, call sessions,
billing, shared platform packages or durable worker scheduling. Effect's local
task lifetime is not a durable job or a replacement for transaction idempotency.

## Considered options

- An async loop with AbortController can also fix the overlap. It has a smaller
  dependency cost. Keep it as the fallback if the pilot's runtime cost or
  maintenance cost is too high.
- A shared polling framework would broaden the change before the first consumer
  has proved useful. Keep this implementation export-specific.
- A broad Effect migration would combine unrelated resource policies. Require a
  separate decision and regression evidence for each later adoption.

## Acceptance and cost

The lifecycle tests cover delayed requests, cancellation, replacement, retries,
terminal states and normal downloads through the real hook and installed Effect.
The original source fails four of these cases while eight controls pass.
Compare the baseline and candidate production JavaScript totals, raw and gzip,
with the same build configuration. Record the measured cost in the PR before
extending adoption. Effect was already present as a development-only transitive
dependency of OpenCode; this pilot adds the first direct app dependency.

## References

- [Bug #2712](https://github.com/chester-hill-solutions/callcaster/issues/2712)
- [Effect task interruption](https://effect.website/docs/v4/getting-started/creating-effects)
- [Effect repetition](https://effect.website/docs/v4/scheduling/using-schedules)
