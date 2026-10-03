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

## Table-driven tests

Use object rows when a `test.each` case contains an array input, for example
`[{ ids: [] }, { ids: ["id"] }]`. Vitest spreads a bare array row into positional
arguments; an empty row supplies no argument. Check the fixed positive cases
before running mutations so a fixture error cannot pass as regression evidence.

## SQL query regressions

Use the real Postgres tier for query predicates; a mocked duplicate helper
cannot check which rows the SQL counts. For a read-only query, a transaction-local
temporary table can isolate the required columns without changing stored app
rows. Restore injected clients in `finally`. Run the fixed cases before removing
or reversing the predicate, and retain a real-row positive control.

## RPC migration changes

Trace the latest function definition and both bootstrap lists before editing an
RPC. When extracting a function body, anchor to the SQL declaration at the start
of a line; migration comments can quote `CREATE OR REPLACE FUNCTION` too.
Compile the new migration on a disposable Postgres database before trusting
source-only checks. Test an upgrade from the old definition and both fresh
bootstrap paths, including the surviving overload signature.

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
Use `test/inbound-queue-entry.route.test.ts` for callback and guard controls and
`test/integration-db/inbound-queue-lookup.test.ts` for actual workspace selection.

Agent-offer changes also need real SDK setup failure and release-state coverage
(`test/integration-db/acd-offer-cleanup.test.ts`). Mocking `calls.create` alone
omits failures that occur before it.

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
