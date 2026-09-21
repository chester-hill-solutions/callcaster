## What

Describe the change in one paragraph.

## Why

Reference the issue and the decision this PR serves (`Closes #N` / `Issues: #N`).

## Risk surface

- **Files touched:** list the main files.
- **Risk class:** UI · worker · API · DB · scripts-only
- **Structural review:** done · not-needed: <reason>

The `review-coverage` workflow requires a `Structural review:` line when the PR
touches high-risk code (`app/lib/worker`, `app/server`, `app/db`, migrations)
or crosses ~500 changed lines. "done" means a structural review pass
(`code-review` or `thermo-nuclear-code-quality-review` skill) was run on this
diff; "not-needed" must state why (e.g. "docs-only").

## Tests

Which suites cover this, and how was behavior verified?

## Notes

Anything a reviewer should know.