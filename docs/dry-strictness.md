# DRY strictness

A ratcheting duplication gate. Enforces "**2+ consumers → centralize**"
structurally: copy-pasted code can't accumulate.

## The gate

`npm run check:dry` (in `ci:local`) runs [jscpd](https://github.com/kucherenko/jscpd)
over `app/`, `server/`, `worker/`, `shared/` (config in `.jscpd.json`) and compares
the **clone count** and **duplicated-line count** to a checked-in baseline
(`scripts/dry-baseline.json`). Both may only ratchet **down** — net-new duplication
fails CI.

- Current baseline: **266 clones / 3,537 duplicated lines (3.14%)**.
- `minTokens: 50` — blocks meaningful copy-paste, not incidental 2-line overlaps.
- After extracting a shared function/module/hook, run `npm run tools:dry:baseline`
  to lower the number.

## Fixing a failure

The gate points at the clones (see the jscpd report under
`node_modules/.cache/jscpd/`). Extract the duplicated block into a shared
function, hook, or module and import it from both sites — then ratchet the
baseline down.

Known duplication worth extracting (surfaced by earlier strictness cycles):
- `AdminAsyncExportButton.tsx` / `AsyncExportButton.tsx` — near-identical export
  polling; extract a shared hook (also flagged `CANDIDATE-REMOVE` for the effects
  migration).
- `useDebouncedSave` / `useOptimisticMutation` — both re-implement
  `useFetcherOnIdle`'s busy→idle edge detection; reuse it.

## Next strengthen step

Drive the baseline down by extracting the known clones above, then lower
`minTokens` once the count is small — tightening what counts as duplication.
