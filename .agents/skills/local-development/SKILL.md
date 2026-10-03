---
name: local-development
description: "Use when setting up, running, repairing, or tailing logs for the CallCaster app locally, or when preparing git work in this repository (branches, commits, pull requests)."
---

# Local development

The single source of truth is `docs/local-development.md`. Read the relevant section before running commands; this skill only says where to look and which entry points exist.

## Node runtime

Use a working Node 22 runtime for local checks. Run `node --version` before
installing dependencies. If Homebrew Node fails with a missing shared library,
use an installed NVM Node 22 version for this task instead of changing global
libraries or using a different Node major.

For temporary Playwright configuration under `node_modules`, use JavaScript
(`.mjs`) rather than TypeScript. Node 22 refuses TypeScript stripping in that
directory before tests collect. Keep local-only browser/channel overrides out
of tracked product configuration, and require the expected case count and a
completed browser run before claiming geometry acceptance.

Before another isolated install or full gate in a long audit, check available
disk space. Remove only reproducible dependencies/build output in owned
temporary worktrees whose readers have stopped; keep source, proof artifacts
and user files. A disk-space failure is not a green gate: rerun the full gate
after recovery.

## Locked project tools

After the worktree's locked install completes, run project tools with
`npx --no-install`. Plain `npx` can fetch a different tool version when the shared
checkout has no dependencies. Use the prepared worktree instead of fetching a
missing tool into a read-only audit.

## Route authentication tests

The node suite installs a shared `api-auth.server` mock in
`test/setup-route-auth-mock.ts`. To test real route authentication, opt out with
`vi.unmock("@/lib/api-auth.server")` and mock only the session/provider boundary.
Otherwise a test can receive the suite's default 401 and never reach its target.
Keep shared server module mock factories additive with `importOriginal`.
Use `setJsonAuthSession` for a shared default that a case must replace. A default
queued with `queueJsonAuthSession` runs before a later queued denial; use queues
only when the test needs multiple calls in that exact order.

## API and form response adapters

API services should call the domain service, then map its result or exception to
JSON. A React Router form helper returns a data wrapper; checking a top-level
`error` can miss `result.data.error` and falsely return success. Verify the real
API error response and absence of a success audit when the domain write fails.

## Table-driven tests

Use object rows when a `test.each` case contains an array input, for example
`[{ ids: [] }, { ids: ["id"] }]`. Vitest spreads a bare array row into positional
arguments; an empty row supplies no argument. Check the fixed positive cases
before running mutations so a fixture error cannot pass as regression evidence.
Confirm the collected case count after adding controls; every test must be at
suite level, outside test and fixture callbacks.
For filtered mutation runs, use the collected `fullName` from the JSON report.
Vitest can quote values substituted into table titles; a guessed filter can skip
every case and still exit zero. Require at least one executed case and the
expected regression failure before accepting proof.
Use a block body for setup hooks that call a mock method. Returning a mock
function from `beforeEach` registers it as cleanup; Vitest then calls it after
the test, which can create a false failure or an unintended second effect.

## UI fixture contracts

Read the component export and prop contract before building a UI fixture.
Tests are excluded from the app TypeScript program, so a green typecheck does
not detect a wrong default/named import or a wrong event field in a test.
Run the actual component test before using it as regression evidence.
For route UI tests, mock the one-off server loader/action re-export boundary
when router data is supplied by the fixture. Importing the real server graph can
fail database startup before UI cases collect; retain the actual browser hooks.

## Custom-control busy proofs

For the [shared Checkbox](../../../app/components/ui/checkbox.tsx), pass its
`disabled` prop when writes are pending. A disabled native fieldset does not
supply the React Aria control's `isDisabled` state. Drive the control's own label
or indicator press surface with `userEvent`; a separate native label can bypass
the press path being tested. Assert the input's explicit `disabled` attribute:
`toBeDisabled()` alone can pass because an ancestor fieldset is disabled.
Hold the write acknowledgement, attempt the second click and check that the
value and request count stay correct. Then remove the control's busy guard and
confirm that the behavior test fails. If the fault still passes, strengthen the
proof before claiming coverage. Use the measured test report counts.

## Realtime snapshot reconciliation

An INSERT matcher cannot safely match every row in a loader snapshot. Check new
saved-row identity and suitable time before replacing optimistic state. Test a
repeated reply against known, older and unknown-time rows; it must remain present
and still accept a send-failure update. Keep a valid saved-row precision control.

## SQL query regressions

Use the real Postgres tier for query predicates; a mocked duplicate helper
cannot check which rows the SQL counts. For a read-only query, a transaction-local
temporary table can isolate the required columns without changing stored app
rows. Restore injected clients in `finally`. Run the fixed cases before removing
or reversing the predicate, and retain a real-row positive control.

Projection guards need a valid positive `Pick` control, plus a secret-bearing
`Pick` rejection. A full-row type inside an explicit safe field selection does
not itself expose the full row. Check serialized nested payloads separately.

For global-table mutations, verify the actual UPDATE predicate with foreign and
owned rows, then exercise the real API/form error responses. Access checks before
a bare-ID write do not impose tenant scope. Keep a permitted-role and an explicit
global-admin control when their policies differ.

## RPC migration changes

Trace the latest function definition and both bootstrap lists before editing an
RPC. When extracting a function body, anchor to the SQL declaration at the start
of a line; migration comments can quote `CREATE OR REPLACE FUNCTION` too.
Compile the new migration on a disposable Postgres database before trusting
source-only checks. Test an upgrade from the old definition and both fresh
bootstrap paths, including the surviving overload signature.

Legacy bigint rows can reach a `serial()` Drizzle column as strings, while a
related `bigint({ mode: "number" })` column maps to numbers. Normalize trusted
identity values before signing or comparing them. Verify contact resume with a
second later response so a type mismatch cannot silently switch the saved ID.

## Network resource tests

Use real Node readable streams when testing response limits and cleanup. The
request adapter must include the real `ClientRequest` lifecycle, including
`destroy()`. Assert that rejected responses close both resources and that late
stream events cannot allocate or resolve a response after rejection.

## Inbound queue TwiML tests

For queue-route changes, keep the real builder from `app/lib/twilio-twiml.server.ts`.
Check the emitted XML: the queue name is Enqueue text supplied by
`enqueue(attributes, name)`, not a nested Queue or a method on the Enqueue builder.
Check both ACD URLs and decoded query values through the real route actions;
a builder mock can accept methods that the installed SDK does not provide.
When a fixture changes `workspace.twilio_data` outside the real writer, call
`invalidateWorkspaceTwilioData` for that workspace. Resetting mock calls does not
clear the production read cache. Check each state case alone and in the suite
before treating its result as behavior evidence.
Use `test/inbound-queue-entry.route.test.ts` for callback and guard controls and
`test/integration-db/inbound-queue-lookup.test.ts` for actual workspace selection.

Agent-offer changes also need real SDK setup failure and release-state coverage
(`test/integration-db/acd-offer-cleanup.test.ts`). Mocking `calls.create` alone
omits failures that occur before it.

## IVR saved flow tests

Check both manual and machine dispatch with the real URL resolver, then check
emitted TwiML for entry and next-page order. Editor round-trip tests alone cannot
prove caller flow. Campaign launch must check a declared raw entry before the
editor migration can repair it. Keep legacy and explicit-page controls.

## Scripted source edits

Use checked subprocesses or `set -e` when a shell step contains a required check
followed by another command. A later successful command can hide the failed
check in the shell exit status. Inspect each required result before reporting it.

Before inserting a constant beside an export, find its first runtime use. An
exported table can aggregate an earlier private table, so shared constants must
precede that first construction. Anchor replacements to whole lines or complete
declarations, and require a unique match before writing. Run the affected module
tests after the edit.
Baseline experiments after staging must include staged and unstaged runtime
changes against the pinned commit (`git diff HEAD`), not only the worktree diff.
Restore each tracked runtime file from that commit and check the actual collected
failure/control counts. Keep restoration in `finally`.

## Structural guard fixtures

Guard regressions must include multiline imports, import aliases, unused
strategies/provider helpers and single-line exported handlers. Removing only
lines that start with `import` leaves names from multiline imports as false
proof. Parse whole statements and retain valid called-service/auth controls.

## Generated API files

For API surface changes, generate with `npm run tools:api:codegen` and
`npm run tools:api:surface:report` before full CI. Review and stage the expected
generated files. `ci:codegen:verify` compares unstaged output with the index;
an intended un-staged API delta otherwise fails the final gate. Do not stage
drift without its matching reviewed source change.

## Entry points

- First run or repair: `make init` (`npm run setup`, idempotent). Services already running elsewhere: `npm run setup -- --skip-docker`.
- Services: `make up | down | logs | ps`; scope with a service name first (`make postgres logs`, `make postgres minio up`). Service names come from `docker-compose.dev.yml`.
- Processes: `make app` (dev server on :3000), `make worker` (job worker), `make media-stream`. Run each in its own terminal so its log stays visible.
- Checks: `npm run typecheck`, `npm run lint`, `npm run check:lint-ratchet`, `npm test`, `make e2e`. Node-tier tests need the node config: `npx --no-install vitest run -c vitest.node.config.ts <file>`; UI tests use `vitest.ui.config.ts`.

## Tailing logs

- Compose services: `make logs` or `make <service> logs` (follows, last 200 lines). One-shot: `docker compose -f docker-compose.dev.yml logs --tail=100 postgres`.
- App and worker: they log JSON lines to the terminal they run in. Never pipe the worker through `head` or `tail` while it runs; redirect to a file and read that.
- Local Postgres is `127.0.0.1:5433` (`callcaster`/`callcaster`), MinIO console `:9001`, Inbucket `:9002`.

## Git in this repository

- `dev` is the trunk; `master` is the release branch and only moves by a dev → master release PR. Check `git log origin/dev` before starting an "open" issue: it may already be fixed.
- For product work, create or update the GitHub issue before starting work. One issue, one concern, one PR; put `Closes #N` in the PR body, never close issues by hand. User-authorized repository maintenance follows the [Git skill](../git/SKILL.md) exception and uses the `no-issue` PR label.
- The `dev → master` release PR must list every promoted issue with a closing keyword (`Closes #N, #M`) so GitHub closes them on promotion. A bare `(#N)` mention closes nothing, which is why shipped issues used to stay open; `release-close-issues.yml` gates this, with a `no-issue` label for a genuinely issue-free release.
- Before committing, strip comments that narrate the code. A comment must state a reason the code cannot ("keep this in UTC", "auth.uid() has no shim") — not describe what the next line does. If deleting the comment (or the line under it) changes nothing for a reader, delete the comment. `callcaster/no-useless-comments` catches number-only and punctuation-only comments; the rest is a review standard, not a lint rule (#1978).
- Every PR that changes behaviour adds a line under `## [Unreleased]` in `docs/CHANGELOG.md`.
- Work in a worktree off `origin/dev` (`git worktree add <dir> -b <branch> origin/dev`); the main checkout is shared and can be reset under you. Commit each slice immediately.
- Merge on green with `gh pr merge N --squash --delete-branch`, then `git remote prune origin` and remove the worktree.
- Load the `github-cli` and `github-issues` skills for `gh` specifics.
