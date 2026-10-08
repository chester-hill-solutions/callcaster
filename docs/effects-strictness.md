# Effects strictness

Every `useEffect` / `useLayoutEffect` in `app/` must document **what it is for**,
**what it depends on**, and **which side effects it performs**. This keeps a live,
reviewable [effects inventory](./effects-inventory.md) and forces the
"[you might not need an effect](https://react.dev/learn/you-might-not-need-an-effect)"
question to be answered in writing.

## The annotation

Put a JSDoc block **immediately above** the complete effect call, including any namespace prefix such as `React.`. The scanner collects actual direct and namespace calls; function declarations and hook-like text in comments or strings are not effects:

```tsx
/**
 * @effect Tick the call-duration counter once per second while connected.
 * @effect-deps callState (starts the timer on 'connected', resets otherwise)
 * @effect-side-effects timer (setInterval) + functional setState; cleared on unmount
 * @effect-why-not-loader Wall-clock elapsed time is live client state, not request data.
 */
useEffect(() => { /* … */ }, [callState]);
```

| Tag | Required | Meaning |
| --- | --- | --- |
| `@effect` | ✅ | One-line purpose. |
| `@effect-deps` | ✅ | The external state the effect reacts to (and why). |
| `@effect-side-effects` | ✅ | `subscription` / `timer` / `dom` / `analytics` / `fetch` / `none`. |
| `@effect-why-not-loader` | ✅ | Why this can't be a loader, fetcher, or derived value. Non-empty, or the effect must carry the `CANDIDATE-REMOVE` marker — see below. |

**If the answer to `@effect-why-not-loader` is "no reason", delete the effect** and
use a React Router loader/`useFetcher`/derived state instead. Data fetching does not
belong in an effect in this app.

`@effect-why-not-loader` is **required** (#1924): the point of the annotation is to
force the "could this be a loader / fetcher / derived render?" question in writing.
If an effect genuinely cannot answer it, prefix its `@effect` purpose with
`CANDIDATE-REMOVE` — that is the only escape, and it surfaces the effect in the
inventory as removal debt instead of letting it pass silently. `@effect-side-effects:
none` claims deserve scrutiny in review (a `none` claim can hide derived state), but
`none` is not automatically a candidate — the latest-ref and local-state patterns are
legitimate effects.

## Enforcement (ratchet)

- `npm run check:effects` — fails CI (part of `ci:local`) when a file has **more**
  un-annotated effects than its grandfathered baseline. New/changed effects must be
  annotated; the number only ratchets **down**.
- Existing debt is grandfathered in [`scripts/effects-baseline.json`](../scripts/effects-baseline.json).
  After annotating a grandfathered effect, run `npm run tools:effects:baseline` to
  lower the baseline (never raise it).
- `check:effects` regenerates [`docs/effects-inventory.md`](./effects-inventory.md);
  `ci:local`'s final `git diff --exit-code` catches an un-regenerated inventory.
- `react-hooks/exhaustive-deps` is **`error`** (promoted from `warn` once the baseline
  hit 0 and all dep warnings were resolved). Intentional omissions need an inline
  `eslint-disable-next-line` with a reason, mirrored in the `@effect-deps` tag.

## Dependency annotation checks

The guard compares the actual literal dependency array with dependency names in
`@effect-deps`. Use a bracket list for an exact declaration; explanations can
follow it. Wrapped tag values continue until the next tag or comment end. Prose
remains supported: every actual dependency must be named, and
ordinary explanatory words are not extra dependencies. `none` means an empty
array. Optional member access is normalized, so `entry?.isIntersecting` and
`entry.isIntersecting` name the same dependency. A member's name must match;
`fetcher.state` does not account for `fetcher.data`.

Unsupported array expressions or bracket declarations fail rather than silently
skip the check. Existing annotation mismatches are counted by file, containing
symbol and mismatch identity in
[`effects-deps-baseline.json`](../scripts/effects-deps-baseline.json).
The guard rejects new or increased mismatches and stale reduced or missing
allowances. The existing unannotated-effect baseline also rejects stale entries.
After correcting an annotation, run `npm run tools:effects:baseline` and review
both baselines plus the generated inventory. Never raise an existing allowance
to clear a new mismatch. The initial baseline is measured from the existing
source; it does not authorize future mismatches.

## Pre-commit enforcement

A checked-in `pre-commit` hook (`.githooks/pre-commit`, wired via
`git config core.hooksPath .githooks`, set automatically by `npm install` /
`npm run setup:githooks`) runs `check:effects` before a commit can be created.
An un-annotated effect therefore fails at the commit boundary, not just in CI.
The hook also lints the staged source files and checks whitespace.

The hook is a convenience, not a security boundary — it can be bypassed with
`git commit --no-verify`, which is why the CI `check:effects` gate remains the
source of truth.

## Status

The current baseline allows **2** unannotated effects in `app/hooks/call/useCampaignCallFlow.ts`.
All other collected effects are documented in the [inventory](./effects-inventory.md), including namespace calls.
Any new unannotated effect above its file allowance fails `check:effects`. Remaining work is the **`CANDIDATE-REMOVE`** effects (annotations
starting with that marker): effects that were really disguised data-fetching or
derived state and should migrate to loaders / `useFetcher` / derived values. Grep
`CANDIDATE-REMOVE` in the inventory for the current list.
