# ScriptDocument v2 as a channel-neutral interaction model in a new package

Interactive SMS/MMS reuses the Script concept, but the existing `ScriptDocument` v1 (in
`scriptkit-call-script-core`) is not channel-neutral: its block types are UI widgets
(`textarea`, `select`, `radio`, `checkbox`), it embeds voice fields (`audioFile`,
`speechType`, IVR `recorded`/`synthetic`/`say`), and its routing is split between
`routingRules` and `option.next`. Reusing it for SMS would force voice and widget semantics
into every channel. We therefore define a new `ScriptDocument v2` in a new
`@chester-hill-solutions/scriptkit-interaction-core` package: typed channel-neutral
operations (`send`, `collect`, `action`, `wait(timer)`, `handoff`, `complete`), typed
transitions with bounded cycles, inline per-channel presentation overrides, and strict
publish validation. The new package is provider- and framework-neutral (no Twilio,
Drizzle, React, logging, or network). Existing call/IVR Scripts stay on v1; they enter v2
only through an explicit, non-destructive `convertV1ToV2` that reports warnings and never
auto-migrates or silently changes behavior.

## Considered Options

- **Extend v1 block types.** Kept one package and migration surface, but perpetuated
  voice/UI coupling and ambiguous block semantics across all channels. Rejected.
- **Separate SMS Script model.** Isolated SMS but broke the shared Script concept and
  duplicated editor/runtime infrastructure. Rejected.
- **Channel-specific Scripts sharing an editor.** Lost a single semantic model. Rejected.

## Consequences

Existing `scriptkit-call-script-*` packages stay unchanged. The app keeps Twilio, billing,
consent, persistence, and worker concerns; the package owns document validation and reducer
semantics. Vendored under `vendor/scriptkit/` until semver stabilizes. See delivery plan
`docs/interactive-sms-delivery-plan.md`.

## References

- `vendor/scriptkit/scriptkit-call-script-core/src/types.ts`, `src/routing.ts`
- `docs/script-json-format.md`
