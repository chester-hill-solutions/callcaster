# Effects strictness

Every `useEffect` / `useLayoutEffect` in `app/` must document **what it is for**,
**what it depends on**, and **which side effects it performs**. This keeps a live,
reviewable [effects inventory](./effects-inventory.md) and forces the
"[you might not need an effect](https://react.dev/learn/you-might-not-need-an-effect)"
question to be answered in writing.

## The annotation

Put a JSDoc block **immediately above** the effect:

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
| `@effect-why-not-loader` | optional | Why this can't be a loader, fetcher, or derived value. Fill it in for anything that touches data — if you can't, it probably shouldn't be an effect. |

**If the answer to `@effect-why-not-loader` is "no reason", delete the effect** and
use a React Router loader/`useFetcher`/derived state instead. Data fetching does not
belong in an effect in this app.

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

## Status

Baseline is **0** — every `useEffect`/`useLayoutEffect` is documented in the
[inventory](./effects-inventory.md). Any new un-annotated effect hard-fails
`check:effects`. Remaining work is the **`CANDIDATE-REMOVE`** effects (annotations
starting with that marker): effects that were really disguised data-fetching or
derived state and should migrate to loaders / `useFetcher` / derived values. Grep
`CANDIDATE-REMOVE` in the inventory for the current list.
