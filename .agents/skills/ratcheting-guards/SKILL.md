---
name: ratcheting-guards
description: "Use when creating or changing source-quality guards with checked-in debt baselines."
---

# Ratcheting Guards

Read [the quality policy](../../../docs/lint-ratchet-rules.md) and the actual
runner before changing a guard. Keep one concern per issue and PR.

- Scan syntax across the whole file when a rule concerns calls; comments and
  string samples are not executable occurrences.
- Record occurrence counts per stable file/rule identity. A second violation
  must not disappear into a set containing the first.
- Fail new or increased violations. Fail missing or reduced baseline entries
  with the exact rewrite command; repaired debt must stay repaired.
- For a baseline format migration, measure the pinned base, remove stale keys,
  and verify no new source exceptions were added. Do not raise a baseline to
  clear a new violation.
- Test actual CLI exit status in isolated fixture roots. Include rejection,
  passing controls, rewrite-and-rerun, and occurrence growth or removal.
- Remove each safeguard separately and prove its regression test fails while
  controls still pass. Restore all source bytes before full gates and reviews.

The redirect and mock guards accept `--root=<fixture>` for isolated CLI tests.
Apply a root override to scans, baseline reads and baseline writes. Verify that
fixture rewrites leave the repository baseline bytes unchanged. Their default
roots and rewrite commands remain the repository contract. Run
full `npm run ci:local` before every push; preserve generated files and both
lockfiles.
