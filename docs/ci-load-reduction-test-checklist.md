# CI Load-Reduction Test Checklist

Use this checklist when changing or validating the CI load-reduction workflow.

## Automated Checks

- [ ] Run `npm run ci:local` on the candidate commit.
- [ ] Confirm `test/ci-changes.test.ts` passes all tests.
- [ ] Confirm `npm run lint` has zero errors.
- [ ] Confirm `npm run check:lint-ratchet` reports no growth.
- [ ] Confirm generated files are clean after the full local gate.
- [ ] Confirm the CI `changes` job completes successfully.
- [ ] Confirm the CI `quality` job runs on every application and tooling PR.

## Path Classification

- [ ] Change an application file such as `app/routes/example.tsx`; confirm `app=true` and `e2e=true`.
- [ ] Change an application dependency or lockfile; confirm `app=true` and `e2e=true`.
- [ ] Change an E2E test only; confirm `app=false` and `e2e=true`.
- [ ] Change a compose, Docker, migration, worker, server, or seed file; confirm `app=false` and `e2e=true` unless the file also matches an app pattern.
- [ ] Change only `ISSUE_BOARD.md` and board enrichment or board-generator files; confirm `app=false` and `e2e=false`.
- [ ] Change only documentation; confirm `app=false` and `e2e=false`.
- [ ] Use an unresolvable base revision; confirm the script reports its fail-safe mode and returns `app=true`, `e2e=true`.
- [ ] Use an empty diff; confirm the script uses its fail-safe mode and returns `app=true`, `e2e=true`.
- [ ] Confirm paths with nested directories and lookalike prefixes do not classify incorrectly.

## Pull Request Workflow

- [ ] Push a second commit to an open PR while the first CI run is active; confirm the older PR run is cancelled.
- [ ] Confirm the latest PR run is not cancelled by a later scheduled or manual run.
- [ ] Confirm an application PR runs `bundle-guard`.
- [ ] Confirm an application or E2E PR runs the E2E workflow.
- [ ] Confirm a board, documentation, or unrelated tooling PR skips `bundle-guard` and E2E.
- [ ] Confirm skipped jobs satisfy branch protection requirements in the repository ruleset.
- [ ] Confirm a path-filtering failure does not silently skip a job; unresolved scope must run everything.

## Coverage Workflow

- [ ] Confirm the `coverage` job is skipped for pull requests.
- [ ] Confirm the `coverage` job is skipped for ordinary pushes.
- [ ] Trigger the workflow manually and confirm the `coverage` job runs.
- [ ] Confirm the scheduled run starts the coverage job.
- [ ] Confirm coverage still runs both test suites and publishes the expected result.
- [ ] Confirm coverage failures remain visible and do not become silently optional.

## E2E Browser Cache

- [ ] Run E2E with an empty Playwright cache; confirm Chromium installs successfully.
- [ ] Run E2E again with the same `package-lock.json`; confirm the cache is restored.
- [ ] Change the Playwright version in the lockfile; confirm the cache key changes.
- [ ] Confirm `npx playwright install --with-deps chromium` still verifies required OS packages after a cache hit.
- [ ] Confirm the E2E suite passes after both a cache miss and a cache hit.

## Failure and Safety Checks

- [ ] Confirm a new branch or invalid base revision defaults to running all scoped jobs.
- [ ] Confirm a failed `changes` job prevents dependent scoped jobs from running rather than falsely passing them.
- [ ] Confirm a cancelled superseded run does not publish stale status as the latest result.
- [ ] Confirm scheduled and manual coverage runs do not cancel each other unexpectedly.
- [ ] Confirm no workflow uses a shared stash, force-reset branch, or mutable main worktree.
- [ ] Confirm no temporary files from `tmp/`, `.agent/`, or `.opencode/` enter the change.

## Expected Baseline

- Quality job: approximately 5 to 7 minutes, depending on GitHub runner load.
- E2E job: approximately 3 to 4 minutes when scoped in.
- Bundle guard: approximately 1 minute when scoped in.
- Coverage: not part of normal pull-request latency.
- Tooling-only pull requests: E2E and bundle guard should be skipped.
