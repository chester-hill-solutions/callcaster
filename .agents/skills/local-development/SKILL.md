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

Put standalone Vite JSX fixtures outside `node_modules`, and load the app's
`public/buffer-polyfill.mjs` before app imports. The utils barrel loads CSV code
that reads Buffer at startup. A fixture startup failure is not geometry proof.
Wait for the overlay's entering state to clear and its CSS animations to finish
before measuring controls. Scope background landmarks and include hidden roles
when a modal makes the page inert; required field names can include an asterisk.

For a rejected-input test, keep all other required inputs valid. A missing
companion record can hide a broken unit or identity check. Remove the specific
guard in an isolated source copy and require an executed failure; keep the
working branch unchanged while other reviews or gates read it.

Before another isolated install or full gate in a long audit, check available
disk space. Remove only reproducible dependencies/build output in owned
temporary worktrees whose readers have stopped; keep source, proof artifacts
and user files. A disk-space failure is not a green gate: rerun the full gate
after recovery.

Scope an isolated integration-test DATABASE_URL to the bootstrap and database test
commands. The reset compose fixture deliberately has no deployment ledger. Do not
carry that test URL into ci:local and then claim its ledger failure is code drift.
Keep the full normal-environment CI result and the real database proof separate;
never mark missing migrations as applied merely to pass the ledger guard.

Full `ci:local` must run where the vendor guard can restore its generated
files through Git and Bun can write its temporary files. A permission failure
is not lockfile drift: retain the dependency files, restore only the owned
generated output, then rerun the full gate with the required permissions.

For process checks on macOS, use PID/parent-ID fields and an exact `lsof`
working-directory check. Do not use `pgrep -fl`: it can print environment
credentials with the process command. Stop only a verified owned process tree.

## Locked project tools

Discover uncertain module paths with `rg --files` before reading them. An ADR's
planned layout can differ from the active source. A referenced skill can also
exist only as a user file in the shared checkout; read it there without copying
it into a worktree or replacing the user's file.

After changing a local file package's test dependencies, verify its lock metadata
and every installed consumer. Bun can retain the old local metadata after a
normal install; refresh only that package with `bun update <local-package-name>`
and verify a separate frozen install before accepting the lock.
npm can also retain an invalid test subtree for a linked local package after
a named update. Compare its declaration with `npm ls vitest --all`. Remove only
proven retired lock nodes in the owned worktree, regenerate with `npm install`,
and require a fresh `npm ci` and a valid installed tree before source freeze.
For untrusted source-map offset tests, prove constructor rejection before any
expansion. Keep valid position and source-content controls. Do not expand or
serialize malicious large maps in the test process; use a bounded owned child
if an expansion proof is necessary.

When retiring a package, search all test consumers, including `createRequire`
and `require.resolve` calls. Update fixtures to resolve the active installed
consumer; do not restore a retired dependency to make collection pass.

For a frozen install fixture, copy the tracked `.npmrc`, both locks,
`package.json` and the local vendor packages. Verify that auth fields remain
environment placeholders. Missing project settings can fail peer resolution
before a package check runs; repair the fixture context and require executed
checks before accepting the result.

If network access is blocked, use an owned fixture with npm's cached packages:
`npm ci --offline --no-audit --no-fund --ignore-scripts`. Bun 1.3.5 has no
`--offline` option. Run its frozen install under an OS rule that denies network
access to the process and its children. Verify that rule with an owned loopback
connection that fails with `EPERM`. Require completed consumer tests in both
fresh trees. These installs do not replace an audit or deployed checks.

Before an audit can export internal package metadata, check repository visibility
and compare the exact candidate name/version pairs with files fetched without
authentication from an immutable public commit. Public app metadata does not
make a private upstream repository public. After an approval rejection, retry
only with a safer action or new evidence that resolves the stated concern.

Read fresh audits for both dependency locks before the final source review and
full gate. A compiler version that matches a parent range can still have a new
advisory; check the primary patch range before freezing that source.

An audit command can export dependency names and versions to its registry.
If automatic approval review rejects that export, keep it held and request
approval for the exact inventory and destination. Do not run it through another
executor. For authorized install work while the audit is held, use npm's
`--no-audit` option so installation does not submit that inventory. Public
advisory reads and local version comparisons do not replace a full audit.

When publication is held, do not predict a PR number in the changelog. Keep
the issue link during local preparation, add the verified PR link before final
publication, then repeat full gates and source reviews for those exact bytes.

After running both npm and Bun for a dependency change, finish with `npm ci`
before Node checks. This restores npm links for local `file:` packages. A Bun
copy of a vendored package can prevent CSS import analysis from finding its
theme tokens and produce false design-system lint warnings. Keep both lockfiles;
do not raise the lint baseline to work around a package-resolution failure.

Run `npm ci` with registry and npm-cache access in a new worktree. If a silent
install cannot access those resources, verify and stop only its owned process
before retrying with the needed permissions. Keep the existing lockfiles.

Install locked dependencies before committing in a new worktree. The effects
pre-commit guard imports TypeScript even for a Markdown-only change.

For a focused Node test, run `npx --no-install vitest run -c vitest.node.config.ts`
with the file paths. `npm run test:node -- <file>` appends that path to the final
Bun command and still runs the entire Node suite.

After the worktree's locked install completes, run project tools with
`npx --no-install`. Plain `npx` can fetch a different tool version when the shared
checkout has no dependencies. Use the prepared worktree instead of fetching a
missing tool into a read-only audit.

## Route authentication tests

React Router 8 action and loader fixtures must include `url: new URL(request.url)`
with `request`. Missing `url` can trigger the error handler before login runs.

The node suite installs a shared `api-auth.server` mock in
`test/setup-route-auth-mock.ts`. To test real route authentication, opt out with
`vi.unmock("@/lib/api-auth.server")` and mock only the session/provider boundary.
Otherwise a test can receive the suite's default 401 and never reach its target.
Keep shared server module mock factories additive with `importOriginal`.
When a real service adds a transaction callback, update each calling fixture's
transaction and scoped-client boundary. Keep its existing behavior assertions;
prove rollback and persisted state in the real Postgres tier.
When extracting a transaction, keep storage and global claims in `app/server`.
Do not add an unscoped client allowance to a product adapter. Derive a shared
executor type from its existing database capability, and remove a stale guard
entry only after its import is gone.
Include route re-exports in a caller inventory. Older combined route tests can
import the route barrel without naming the service or its action server file.
Run those cases before relying on a focused caller result.
For route-to-service call checks, wrap the original service with `vi.fn` in an
additive module factory. A namespace spy installed after import can miss a
route's bound service call. Keep the real service logic and database access.
Weaken each route and service role check separately and require a failing test;
a service denial can hide a missing route check. An always-zero call counter
does not prove that the route stopped before the service.
When a canonical guard lets the API surface generator derive the auth class,
remove the route's manual `authClass` annotation. Regenerate the API files and
run `tools:api:surface:check`; matching duplicate declarations also fail the guard.
For several real logins in a production-build fixture, honor Better Auth's
`Retry-After` response. Shared loopback login requests can reach its rate limit;
wait before retrying instead of weakening auth or treating 429 as a login.
Use `setJsonAuthSession` for a shared default that a case must replace. A default
queued with `queueJsonAuthSession` runs before a later queued denial; use queues
only when the test needs multiple calls in that exact order.

For static role guards, trace the checked role to the handler's authenticated
context. A role-shaped identifier or enum constant is not actor proof. Include
constant, unrelated-field, changed-role (dot and indexed writes) and
shadowed-helper rejection controls, plus a permitted renamed auth binding,
before trusting a guard's floor result.

## API and form response adapters

`asRouteResponse` normalizes thrown Responses. To verify that an auth redirect
stays thrown, call the raw loader or action and inspect its rejected Response.
Normalize a middleware result only once, outside its `next` callback. A nested
response wrapper can become a JSON 200 and hide a real status or download. Keep
a streaming Response raw until the intended concurrent write has occurred; the
normalizer consumes its body and would hide a broken capture boundary.

API services should call the domain service, then map its result or exception to
JSON. A React Router form helper returns a data wrapper; checking a top-level
`error` can miss `result.data.error` and falsely return success. Verify the real
API error response and absence of a success audit when the domain write fails.

Before changing a shared client response adapter, search its exported function
name across app, test and e2e callers. Run every affected caller suite, including
older combined service tests. Use real `Response` objects for HTTP failure and
malformed JSON controls; partial response-shaped mocks can miss the parser
contract. Update old error expectations only after the new safe-message behavior
and the configured success path are proved.

## Table-driven tests

For native multipart tests, pass encoded bytes with an explicit Content-Type
boundary through the route's reader. Bun can derive a parsed File's MIME type
from its filename; `Response(FormData).formData()` can take a different path.
Check the parsed file's policy in both runtimes, not only a hand-built File.

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

For a focused temporary Vitest config, replace `test.include` explicitly after
loading the base config. `mergeConfig` appends arrays, which can run the full
suite alongside the intended fixture. Check the collected test count before
accepting a focused regression report.

Read the component export and prop contract before building a UI fixture.
Tests are excluded from the app TypeScript program, so a green typecheck does
not detect a wrong default/named import or a wrong event field in a test.
Run the actual component test before using it as regression evidence.
For route UI tests, mock the one-off server loader/action re-export boundary
when router data is supplied by the fixture. Importing the real server graph can
fail database startup before UI cases collect; retain the actual browser hooks.

For persistent Sonner notices, render the real shared root Toaster in the UI
fixture after the condition component. The host subscribes in an effect; a
synchronous child effect can emit before that subscription and lose the first
notice. Defer initial presentation until the mount subscriptions can run. Keep
an owned toast ID in a ref, update that ID while the notice is present, and
allocate a fresh ID after resolution or a new page lifetime. Dismissal uses
asynchronous removal; reusing the old ID can remove a newly opened notice.
Check direct mount, StrictMode, time beyond the default expiry, message updates,
resolution, page exit with the host retained and rapid resolve/reopen. Remove
each lifetime or subscription safeguard separately and require an executed,
failing case before accepting the proof. For browser checks, wait for entering
and exit animations to settle; test Cancel and Escape from separate fresh
modal states so one cannot satisfy the other's assertion.

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

Raw SQL parameters bypass a column's value encoder. For a JavaScript Date
inside a SQL expression, use the timestamp column encoder with `sql.param`.
Verify capture, replacement and null input against real Postgres; mocked
updates cannot prove driver serialization or first-write preservation.

For real RPC fixtures, inspect and seed each required foreign-key actor.
Membership or an auth identity may not supply the legacy user-profile row.
A fixture or constraint error before the target assertion is not defect proof.
Read current enum values before seeding companion rows. Script and campaign
types can use different vocabularies; a script type does not prove a valid
campaign enum.

The scoped client's delete method returns no rows. When compensation depends
on whether a row was removed, use a transaction-bound deletion with explicit
tenant scope and RETURNING. Prove the counter change through real Postgres.

For a target-user check, membership does not prove that the global user still
exists. Canonical `workspace_member` keys are text and have no global-user FK.
Test missing users both with and without a stale membership row through each
real route. Both must return a validation error before insert; keep a separate
database-failure control so infrastructure failures do not become validation.

For the full real-Postgres suite, set `DATABASE_URL`, `DATABASE_DIRECT_URL` and
`INTEGRATION_DB_URL` to the owned fixture in the command environment. Some suites
gate on the app URL or import its direct client. The integration override alone
can produce skipped tests and startup failures. Require the full count and zero
skips before treating the run as proof.

JavaScript fake timers do not change Postgres `now()` or column defaults.
When a test freezes the app's captured timestamp, set owned SQL fixture timestamps
explicitly after real billing writes. Keep the credit and cycle assertions and
include a real future-row exclusion control. Do not widen a production timestamp
filter to repair a fixture clock mismatch.
Apply this to every real ledger insert in the suite, including one-time purchases.
A rolling cash window can fail at UTC midnight even when the cycle checks pass.

For an owned native Postgres fixture, initialize with `--no-locale
--encoding=UTF8`. An inherited `LC_ALL=C.UTF-8` can fail on macOS. Keep the
fixture in a temporary directory and bind only loopback on an unused port;
do not change `.env` or the machine locale. Use the fixture's recorded database
superuser rather than assuming it matches the shell user. Require setup to
succeed before starting a bootstrap. Stop only the owned server after verification.

If sandbox process checks say a fixture stopped, verify the same PID and port
with the required permissions before restarting. A failed process probe does
not prove that the server stopped.

For query predicates with several exclusion guards, seed each rejected case
with only that guard's disqualifying value. Coexisting history or tenancy
markers can hide a removed predicate. Remove each guard separately and require
its corresponding real-row case to fail before accepting coverage.

Use the real Postgres tier for query predicates; a mocked duplicate helper
cannot check which rows the SQL counts. For a read-only query, a transaction-local
temporary table can isolate the required columns without changing stored app
rows. Restore injected clients in `finally`. Run the fixed cases before removing
or reversing the predicate, and retain a real-row positive control.

For a render timeout during concurrent full gates, wait for the other gate
to stop, rerun the failing cases for diagnosis, then rerun the complete gate.
A passing focused rerun does not replace `ci:local`; do not weaken assertions
or raise a baseline to treat a timeout as green.

The raw pool from app/server/db.ts is also used by Drizzle, which replaces
postgres.js JSON serializers. Bind JSON.stringify(value) with an explicit
::jsonb cast on that pool, then check the decoded object. Use client.json(value)
on a separate native fixture client with its default serializers. Check the
native column type; a legacy Drizzle text declaration can map to JSONB.

For postgres.js JSON fixtures, use `client.json(value)` and check the stored
JSON value or type. Passing `JSON.stringify(value)` to a `::jsonb` parameter can
store a JSON string instead of the intended object. Use the fixture identity
in unique columns such as workspace keys; a shared marker can fail setup before
any behavior case runs.

A postgres.js `begin` transaction client is not a supported `drizzle()`
constructor input. Use a Drizzle transaction, or compile the query through a
supported client and execute it through the transaction that owns the temporary
tables. A fixture adapter failure is not a failing behavior test. Require the
expected executed cases and passing controls before accepting regression proof.

The shared Vitest config restores spies before each case. Install observation
spies in `beforeEach`; a spy created in `beforeAll` can be removed before the
first case. Require executed cases and a passing result before using the proof.

For integration tests that start a worker process, install its actual runtime
in every runner of that tier. Use the project's pinned runtime version, including
the database-only workflow. Local PATH availability does not prove CI setup;
keep worker kill and restart cases enabled.

Real PostgreSQL suites must accept the compose runner's `DATABASE_URL`, with
`INTEGRATION_DB_URL` as an optional override. Verify the suite with
`DATABASE_URL` alone; skipped cases do not prove the remote database gate.
Bind the selected URL to both app pool variables before importing the runtime
database module, then restore the worker environment. Verify override-only
and differing-URL controls so the fixture cannot use the wrong database.

Capture owned app pools before importing a dependent runtime graph in a database
fixture. Attempt each pool and client close independently; restore worker
environment values in an innermost `finally`, even when a close fails. Collect
cleanup errors and report them after `finally`; do not throw from `finally`.

For database failure controls, keep the isolated relation present. Renaming it
can make an unqualified query resolve to a public table on the search path.
Use a failure inside the isolated relation, such as a rejecting trigger, and
keep a public-table control that must stay untouched.

For real worker-loop tests, isolate the job table with a fresh schema on the
fixture connection's search path. Workspace-owned fixture rows alone do not
scope a global claim loop: it can claim jobs left by another suite. Keep a
queued public-table control and verify that it remains untouched. Restore the
process-local database URLs, close the pools, and drop only the owned schema.

Projection guards need a valid positive `Pick` control, plus a secret-bearing
`Pick` rejection. A full-row type inside an explicit safe field selection does
not itself expose the full row. Check serialized nested payloads separately.

For global-table mutations, verify the actual UPDATE predicate with foreign and
owned rows, then exercise the real API/form error responses. Access checks before
a bare-ID write do not impose tenant scope. For callback context reads, select the
number by the stored call workspace as well as its phone. Test two workspace
rows with the same phone: a workspace check after a phone-only `LIMIT 1` can
block valid work after it selects the wrong row. Keep a permitted-role and an explicit
global-admin control when their policies differ.

For provider enums stored in onboarding JSON, exercise the actual normalizer,
partial form save, database round trip and installed SDK payload. An untyped
section can be discarded before a defensive provider read sees it. Include a
non-default explicit value, missing/invalid values and negated prose. Never let
a workflow description or an implicit default become an operator attestation.

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

## Package regression controls

Check the installed Python version before using newer standard-library arguments
in a fixture runner. Validate archive paths and entry types before extraction.
Keep temporary installed-package replacement and restoration in `try/finally`.

## Network resource tests

Use real Node readable streams when testing response limits and cleanup. The
request adapter must include the real `ClientRequest` lifecycle, including
`destroy()`. Assert that rejected responses close both resources and that late
stream events cannot allocate or resolve a response after rejection.

The node suite stubs global fetch before module imports. For real fetch-adapter
tests, restore native globals in `vi.hoisted` before the adapter captures fetch.
Pair a rejection case with a successful local response and check the rejection's
status or cause. A generic rejection can pass because the shared stub threw.

For local WebSocket fixtures, register client and peer close listeners before
terminating either socket. Await both close events before asserting that the
server client set is empty; the server close callback alone can run earlier.
Bound awaited transport events with a deadline so an old-package rejection
control cannot leave an open connection after a test timeout.

For loopback HTTP fixtures with several short-lived servers, disable the client
agent or close its pooled connections between servers. Node can reuse a socket
from a closed fixture when its port is allocated again. Resolve each dependency
from the installed consumer entry; npm can link a local package while Bun copies
it, so its source-directory resolver can silently test the wrong nested package.
For redirect-mock boundary fixtures, use a canonical temporary root and a fresh
module ID for each target. An earlier transformed module can hide a rejected or
accepted redirect in Vite's cache. Pair outside and denied in-root controls with
a working allowed redirect through the same actual installed consumer.
For optimized-dependency boundary cases, keep the dependency optimizer active.
A disabled optimizer can bypass the vulnerable handler and produce false proof.
Set the fixture cache directory to the path used by the traversal request. A
wrong cache path can return the SPA page without testing the map handler.

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

## Provider wire data

For provider money or period checks, test the raw API payload through the actual
SDK. An SDK can normalize an impossible calendar date or return an invalid date
as a string despite its declared Date type. Preserve the raw page payload for
validation; do not validate a value after this lossy conversion. Check raw scalar
types before string conversion: an array can stringify to a valid decimal despite
the SDK declaring a numeric field. Retain page
limits, later-page records, retry failures and valid zero controls.
Provider mocks must use the installed SDK's response envelope. For Resend,
success is `{ data: { id }, error: null }`; a top-level `{ id }` does not prove
a delivery receipt. Keep rejected-result and missing-receipt controls when a
write depends on provider success. A retry test must compare the actual repeated
payload and key, including generated dates and signed links.

When an SDK method changes, inventory its caller fixtures in every test tier.
`ci:local` omits the real database tier. Run the affected database cases before
push; run the full tier if the caller inventory is not complete.

For React Aria controls, a DOM click can miss the native press action. If the
control stays unchanged, inspect the current browser state and try native input.
Confirm the dialog or selected value before claiming an interactive check.

Finish full CI and codegen writers before live Vite browser acceptance.
Generated file rewrites can reload an active request fixture. Require a completed
stable browser run after those writers stop.

For upload progress, bind both successful snapshots and delayed warnings to the
current attempt and tenant. Reusing an upload ID must not reuse an attempt token.
Test delayed old success/failure responses and realtime row IDs before enabling
a saved-report action; API snapshots and database events can name IDs differently.
Keep legacy caller fixtures on the actual accepted upload ID, and retain a
foreign-ID rejection control. Key the uploader state to its workspace so tenant
navigation cannot reuse another workspace’s file draft or enabled report action.

For optimistic fetcher recovery, test real-browser fast results and first-send
redirects, as well as delayed failures. A busy render can be skipped, and a
redirect can complete without result data. Distinguish retained prior data from
a fresh result; verify a second send and later user edits.

Route tests use `asRouteResponse` from `test/helpers/route-result.ts`. It returns
a response-shaped adapter, not a native `Response`; narrow its documented fields
when inspecting mixed concurrent-write results.

## Scripted source edits

Keep formatter changes within the requested diff. A whole-file format can reorder
untouched classes and expand old test formatting. Restore only those unrelated
hunks from the pinned base; format edited blocks or new files, then inspect the
actual diff before source freeze.

Database fault controls can leave deliberately broken rows. Clean only the owned
fixture rows after each case, before the next control runs. A passing control
must not inherit orphan rows or missing receipts from the preceding mutation.

Run source faults only when no other test reads that worktree. Restore each
fault before starting the next reader, then rerun the fixed source. A passing
report from overlapping runs does not identify which source it tested.

Use checked subprocesses or `set -e` when a shell step contains a required check
followed by another command. A later successful command can hide the failed
check in the shell exit status. Inspect each required result before reporting it.

Before inserting a constant beside an export, find its first runtime use. An
exported table can aggregate an earlier private table, so shared constants must
precede that first construction. Anchor replacements to whole lines or complete
declarations, and require a unique match before writing. Check existing object
keys before adding a test fixture property; a repeated key can be only a build
warning when the test files are outside the TypeScript gate. Run the affected module
tests after the edit.
For an original-source experiment, record an immutable base SHA before editing.
Use `git show BASE_SHA:path`; the topic HEAD can already contain the fix.
Compare staged and unstaged runtime changes against that base, not only the
worktree diff. Record the base and collected failure/control counts. Restore the
saved candidate in `finally`, then verify its committed and live file hashes.

Before running an adapted proof or publication helper, verify its issue number,
branch, worktree, source identity and expected test counts. Derive these from one
explicit task configuration. Reject stale identity before any publication.

Pass the current tab handle into browser measurement helpers in a persistent
REPL. A closure can retain a closed tab after the outer binding changes. Check
the tab identity and count unique landmarks. A fixture-target failure is not a
product failure.

## Structural guard fixtures

Route discovery guards must include every registered source, including the root,
its server loader and route-local directory index imports. Keep missing-root and
invalid-target controls, plus a valid indexed-loader control that proves discovery.
Ignore imported assets; keep CSS and image controls beside the script controls.

For SQL write guards, cover raw SQL, conflict updates and tuple assignments.
Keep reads, non-order writes, quoted values and unrelated-statement controls.
Verify rejection through the actual CLI as well as the parser.
Include canonical lower-level writers in the bypass inventory. A public API
can call an entry RPC directly without the reservation helper. Cover renamed,
namespace and local aliases, with shadowed-helper controls.
Check SQL calls to the same writer, not only UPDATE/INSERT statements. Keep
reservation calls, ordinary reads and quoted/commented names as controls.

Guard regressions must include multiline imports, import aliases, unused
strategies/provider helpers and single-line exported handlers. Removing only
lines that start with `import` leaves names from multiline imports as false
proof. Parse whole statements and retain valid called-service/auth controls.

## Generated API files

For API surface changes, generate with `npm run tools:api:codegen` and
`npm run tools:api:surface:report` before full CI. Review and stage the expected
generated files. Run `git diff --cached --check` after staging so new files
receive the same whitespace check as existing files. `ci:codegen:verify` compares unstaged output with the index;
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

Route modules must export only route-facing handlers and components. Import
server helpers directly in their tests. A helper re-export from a route can
retain its server dependency graph in the browser build, even with a `.server`
filename. Confirm the production build and client bundle guard after changing
server imports.

For exact-file import identity and coordinates, test the real multipart upload
boundary through its queued worker bytes. A decoder/encoder round trip can strip
a UTF-8 BOM or replace invalid bytes while direct parser tests stay green. Keep
worker and stored-original bytes equal, and reject invalid UTF-8 before writes.
