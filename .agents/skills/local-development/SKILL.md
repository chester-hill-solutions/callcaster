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

## Check cadence

For outbound estimates, trace the current batch size, successor schedule and
worker polling cadence together. A configured provider rate alone does not
describe queue progress. Confirm when rows dequeue before calling an estimate
"call completion", and keep rendered rate units consistent with the calculation.
Use a worker timing test plus the reported queue counts to verify the projection.

Before `ci:local`, check `node --version` and `bun --version` in the same
command-scoped PATH. A missing Bun executable can be reported as lockfile
drift; verify tool availability before changing either lockfile.

Run only one full local gate per host at a time, including across worktrees.
Concurrent suites can exhaust host resources and fail short UI waits. If this
happens, retain the failure log, stop overlapping gates, rerun only failed cases,
then run the full gate again on the final clean commit.

If guard child processes time out under the default worker count, rerun the
failed cases first. When they pass alone, rerun the complete gate with command-scoped
`VITEST_MAX_WORKERS=2 npm run ci:local:full` before changing tracked worker or time limits.

Do not run `npm run ci:local` after each edit. During implementation, run the
smallest check that proves the changed behavior, plus `git diff --check`:

- documentation or Makefile text: `make -n <target>` when a target changed;
- Node or Bun script: syntax check and focused test;
- TypeScript or Vite config: focused lint and `npm run typecheck`;
- route or service behavior: the affected focused Vitest file.

Use `npm run test:node:vitest -- <file>` for a focused Node test, and
`npm run test:ui -- <file>` for a focused UI test. The `test:watch:node` and
`test:watch:ui` commands keep the relevant suite open during edits. Use
`npm run ci:local` for type, lint and guard feedback before each push or PR.
Both gates share `scripts/lib/local-gate-plan.mjs`; update that plan when a
required check changes. Keep vendor builds, typegen and the shared ESLint cache
in sequence. The optional `ci:local:full` run keeps tests and the production
build in sequence; runtime tests, bundle checks and codegen retain their order.
`vitest.config.ts` reuses both suite configs with one bounded worker pool and
file isolation. Its inventory test must preserve the exact suite union.
For a busy host, pass `-- --jobs=1` and set `VITEST_MAX_WORKERS=2` to bound the
whole test pool. Inspect per-check logs and times before changing concurrency.
Benchmark through npm so child CLI fixtures receive the npm execution context.
Compare normal default runs as well as any explicit worker limits; do not
attribute a worker-count change to a faster test implementation.
Check composed Vitest configs against the installed TypeScript and Vitest types;
the app TypeScript program does not include root configuration files.
Before adding an `admin-db` or unscoped `db` import, run
`npm run check:unscoped-db-imports`. Shared auth code must keep global workspace
query construction in the server data layer; a typed predicate can stay inside
the scoped membership query. Do not increase the debt baseline for a new import.

For read-only history triggers, test foreign-key `SET NULL` and cascade actions.
Blocking those updates can leave invalid references. Allow only the required
reference-column changes; keep lifecycle state, dates and other data fixed.
Verify direct and nested stale writers as well as normal deletion cleanup.

Full test suites and production validation run in CI before merge.
`ci:local:full` is optional for local diagnosis; do not require it before a push.

Inspect warning counts in focused lint results. ESLint can exit zero while a
ratchet still rejects new warnings. For nested fields, use the canonical
`FormFieldControl` contract instead of overriding spacing owned by `FormField`.
Keep layout-only wrappers outside the control association.

Before a push or pull request, run `npm run ci:local` and the focused tests
for changed behavior. CI owns the complete Node, UI and Bun suites, production
build, bundle scan and codegen verification. Require green CI before merge.
Use `npm run ci:local:full` only when a full local diagnostic run is useful.
After later source changes, repeat the affected tests and local gate. For a
documentation-only correction, run `git diff --check` and the relevant link or
command check. Do not run a full local suite merely to publish documentation.

Before a full gate, confirm the installed dependency tree matches the lockfile
with `npm ci --ignore-scripts --no-audit --no-fund` when dependencies were
changed or tools report versions that differ from the lockfile. A stale install
can produce false lint-ratchet failures.

For temporary Playwright configuration under `node_modules`, use JavaScript
(`.mjs`) rather than TypeScript. Node 22 refuses TypeScript stripping in that
directory before tests collect. Keep local-only browser/channel overrides out
of tracked product configuration, and require the expected case count and a
completed browser run before claiming geometry acceptance.

Put standalone Vite JSX fixtures outside `node_modules`, and load the app's
`public/buffer-polyfill.mjs` before app imports. The utils barrel loads CSV code
that reads Buffer at startup. A fixture startup failure is not geometry proof.
Give concurrent baseline/candidate Vite fixtures separate cache directories.
Create fixture source with file tools or a saved script. Nested JavaScript quotes
inside an inline shell argument can silently corrupt the fixture. Inspect the
rendered scene and require the intended controls before accepting browser proof.
Render panels with nested Forms or fetchers through a real data router, even
when the assertion only concerns a notice. Keep their actions isolated.
Trace conditional notice tones to their data producer before choosing fixtures;
a boolean type alone does not prove that a proposed warning state is reachable.
For `shadcn/no-unknown-classes` false positives on domain `*Class` props,
allow only the known domain values in an exact-file ESLint override with a reason.
Do not add fake Tailwind utilities or hide the prop values from the rule.
Wait for the overlay's entering state to clear and its CSS animations to finish
before measuring controls. Scope background landmarks and include hidden roles
when a modal makes the page inert; required field names can include an asterisk.

When a service gains a scoped tenant-client read, update its orchestration
fixtures at that boundary. Prove cross-workspace denials against the real
database; a permissive query mock is not authorization evidence.

The route-membership guard follows local imports one hop. Keep the canonical
workspace check visible at the HTTP boundary when transaction services place
their membership recheck deeper. Preserve the locked service check as well;
do not add a public-route exception or deepen the crawl to clear the guard.

When a pipeline gains caller-dependent authorization, inventory HTTP and worker
callers. Pass the authenticated user for requests and explicit system authority
for trusted jobs without a user. Test identity forwarding separately from SQL
row filtering; an all-users fixture cannot prove those boundaries.
For role-floor changes, search route and permission tests as well as function
callers. Tests for a related artifact can pin old access on the same surface.

For a rejected-input test, keep all other required inputs valid. A missing
companion record can hide a broken unit or identity check. Remove the specific
guard in an isolated source copy and require an executed failure; keep the
working branch unchanged while other reviews or gates read it.

Before another isolated install or full gate in a long audit, check available
disk space. Remove only reproducible dependencies/build output in owned
temporary worktrees whose readers have stopped; keep source, proof artifacts
and user files. A disk-space failure is not a green gate: rerun the full gate
after recovery.

Scope an isolated integration fixture's DATABASE_URL, DATABASE_DIRECT_URL and
INTEGRATION_DB_URL to its bootstrap and database test commands. Set all three to
the owned fixture so lazy direct connections cannot use another environment. The reset compose fixture deliberately has no deployment ledger. Do not
carry that test URL into ci:local and then claim its ledger failure is code drift.
Keep the full normal-environment CI result and the real database proof separate;
never mark missing migrations as applied merely to pass the ledger guard.

Give each real-database provider fixture a unique account SID. Delete its queued
jobs before its workspace, including after deliberate faults: a fault can enqueue
work that a passing control never creates. A mutation proof requires the expected
failed assertions, passing controls, and no suite or cleanup-hook failure.
Vitest promise assertions can be reported as `Error` rather than `AssertionError`.
Require the named test and an executed `__VITEST_RESOLVES__` or
`__VITEST_REJECTS__` assertion frame when accepting that form. A raw product or
hook exception alone does not prove the intended assertion failed.

When extracting shared Vitest fixtures, keep `vi.hoisted` declarations private
and export their bindings with a separate `export { ... }` statement. A direct
`export const value = vi.hoisted(...)` fails before test collection. Import the
fixture before product modules so its mocks are installed first. Compare the
combined executed case names and count with the original suite after splitting.

Keep funded settlement in admission's workspace-before-reservation lock order;
continuation and source-generation checks need that same workspace fence.
Recording nonce preparation needs only the reservation lock. Prove
cross-service races at the real ledger boundary and wait for `pg_blocking_pids`
before releasing the barrier; a timing-only overlap can miss a deadlock.

Twilio inbound and outbound media share one timestamp clock. Test simultaneous
tracks against fixed G.711 vectors and one mono duration; byte concatenation
doubles elapsed audio. Keep startup and jitter buffers bounded, own every timer
through stop/close, and flush before closing STT. Delay upstream open and coaching
cleanup separately: early media must survive, a late open must stay retired, and
cleanup time must not extend the completed transcription debit.

Bun checks must run where Bun can write its temporary files. A permission
failure is not lockfile drift: retain the dependency files and rerun the full
gate with the required permissions. The vendor guard leaves rebuilt output for
review; it does not reset or clean files. Record a clean starting tree before
testing build reproducibility. Save a failing diff, then restore only generated
files proved to come from that owned build. Check repeated unchanged-source
builds for import/chunk and declaration-union ordering before calling drift a
source defect. A quiet run alone does not prove a previously variable builder is
stable; fix its ordering and require complete repeated byte snapshots.

For process checks on macOS, use PID/parent-ID fields and an exact `lsof`
working-directory check. Do not use `pgrep -fl`: it can print environment
credentials with the process command. Stop only a verified owned process tree.

## Locked project tools

For CI performance work, compare queue, install and execution times separately.
Use E2E phase summaries to distinguish the database suite from browser tests.
Run those suites on separate databases when testing job parallelism. Preserve
the required aggregate check name and make it fail for failed, cancelled or
unexpectedly skipped child jobs. Vitest phase totals include parallel workers;
do not add those totals to wall time. Benchmark shared test state and alternate
linters separately, with the same executed cases and enforced rules.
The compose bootstrap grants privileges to the `callcaster` role. Create that
role in an owned native Postgres fixture before applying its reset SQL, even
when the fixture's initial superuser has a different name.
When a configuration catalog gains a key, regenerate its reports before the
full gate. The Node suite checks catalog and generated-summary consistency.
During a rebase, merge the catalog against the live source reads. Preserve
current CI inputs and remove keys whose last reader was deleted. Update dynamic
boundary line locations only when the source file, expression and callsite count
are unchanged; keep their approval metadata. Regenerate the reports from source
instead of selecting one side of a generated-file conflict.

The compose migration fixture grants its public schema to the `callcaster`
role. Create disposable Postgres with that role, or create it inside the owned
database before bootstrapping. Keep both database URLs command-scoped to that
local database for integration tests; do not carry them into the normal gate.

Before adding a second runtime version, inspect existing transitive peer
requirements. An npm alias can isolate the app version while preserving an
exact development-tool peer. Verify both lockfiles and a clean `npm ci`, then
require `npm ls` to accept both versions. For async React owners, test a
suspended identity transition: changing an owner ref during render can cancel
work that still belongs to the committed screen.
For lazy SDK and media tests, wait for observable registration or capture
readiness. A fixed number of Promise.resolve turns does not prove that an
import or a microphone request has completed. Keep cancellation tests separate
so late setup must still be rejected after the owner is suspended or removed.

Discover uncertain module paths with `rg --files` before reading them. An ADR's
planned layout can differ from the active source. A referenced skill can also
exist only as a user file in the shared checkout; read it there without copying
it into a worktree or replacing the user's file.

Quote literal route paths containing `$` or shell glob characters; otherwise
the shell can remove a route segment before the command runs. Read script names
from `package.json` and discover helper files before reading them. Do not guess
filenames from an exported function or an npm script's display name.
When a route gains a reservation ownership lookup, legacy unit fixtures must
declare their unfunded state at that lookup. Spreading `importOriginal` preserves
exports but still runs the real database lookup unless it is replaced. Keep
funded identity and security proof in the real-database suite; do not replace
its binder with a fixed successful result.

When extracting a legacy tenant-data helper, use `createTenantDb` in its new
module. Moving an old unscoped database import creates new guard debt even
when the query already has a workspace predicate. Verify the scoped read
against the existing real-database controls.

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

Run metadata proof and audit dispatch in one script that stops if proof fails.
Keep a proof failure separate from an audit exit code that reports findings;
require complete JSON results from both audits.

An audit command can export dependency names and versions to its registry.
If automatic approval review rejects that export, keep it held and request
approval for the exact inventory and destination. Do not run it through another
executor. For authorized install work while the audit is held, use npm's
`--no-audit` option so installation does not submit that inventory. Public
advisory reads and local version comparisons do not replace a full audit.

When publication is held, do not predict a PR number in the changelog. Keep
the issue link during local preparation, add the verified PR link before final
publication, then repeat full gates and source reviews for those exact bytes.

For a security update, inspect every locked peer consumer, including local
`file:` packages. Bun can retain an affected root peer while installing a fixed
private copy for the parent. `npm ls` proves only the npm tree. A targeted
`bun update` can add a direct dependency; review the manifest, keep only intended
declarations, and require both frozen install trees to use the fixed peer.

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

If a read-only `tsx` check fails because the sandbox denies its IPC socket,
run the same script with Node 22 and `node --import tsx <script>` from the
worktree. Confirm that its normal result completes. A socket failure is not an
API or source failure.

Vite `mergeConfig` concatenates `test.include` arrays. For an isolated database
probe, assign its final `include` after merging and pass the exact fixture path
to Vitest. Check reported file and case counts before claiming focused proof.

For a new owned Postgres container, verify readiness over TCP before bootstrap.
The image can accept socket connections on its temporary initialization server,
then stop that server. A successful socket `pg_isready` is not final readiness.

Raw postgres.js fixture reads keep PostgreSQL bigint values as strings. Decode
queue counters explicitly, or cast bounded test counters to integer in SQL
before comparing them with numeric expectations.

The UI test config aliases `@twilio/voice-sdk` to a mock. For SDK resource
lifetime changes, exercise the installed SDK at that boundary as well. Use
`createRequire` to resolve its actual entry where the alias would hide it.
Inventory every `setInputDevice` caller, including effects and user handlers.
Delay microphone acquisition across unmount and device replacement; require
tracks and polling to stop. A `destroy()` call count alone does not prove
cleanup completed. Keep a normal-completion control.
For initial effect replay in hook tests, use the render root's
`reactStrictMode: true` option. In React 19, a StrictMode child wrapper can omit
that initial replay. Delay cleanup and prove the next owner waits before capture.

After the worktree's locked install completes, run project tools with
`npx --no-install`. Plain `npx` can fetch a different tool version when the shared
checkout has no dependencies. Use the prepared worktree instead of fetching a
missing tool into a read-only audit.

After repairing a baseline-listed shared-module mock with `importOriginal`,
run `npm run tools:test-mocks:baseline`; require only the repaired entry to
shrink, then rerun full CI. The guard rejects stale debt as well as new debt.

Runtime startup and the compose/fresh bootstrap scripts have separate SQL
execution paths. When changing startup, test `applyClientMigrationsOnBoot` on
an owned fresh database and a tracked partial baseline. A green compose
bootstrap does not prove runtime session state or per-file recovery.

## Call teardown regressions

SDK call and device teardown can throw before local session cleanup runs. Test
the real session hook and call controls together: a provider terminal event
must remove Hang Up even when either teardown throws. Keep an unrelated-call
event as a control and verify that the replacement Dial still consumes the
first confirmation click. A mocked hangUp callback or a manually completed
callState cannot prove that the session cleanup path reaches the controls.

## Route authentication tests

For readiness notices, check missing fields, complete pending or invalid
validation, validated input with an unavailable capability, and full readiness.
Keep owner/admin and restricted-role controls. Complete input does not prove
that the capability is ready; use the server's readiness result for its remedy.

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

For error redaction, trace returned error strings and payload error fields through
both UI and API adapters. A safe shared responder does not protect a separate
service catch or payload mapper. Weaken each distinct output boundary and require
its regression to fail while intentional product messages remain visible.

If a guarded action's inferred result is `unknown`, give `useActionData` an
explicit form response contract and test its server metadata and page handling.
Do not replace the missing boundary with `any` or classify errors by message text.

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

A jsdom `File` passed through Node `Request.formData()` can retain its bytes but
lose its filename. For UI payload checks, inspect the original `FormData` at the
fetcher submission boundary while retaining real router transitions. Use a native
browser `File` through the multipart reader for wire-filename claims. Do not
change application upload code to compensate for this fixture conversion.

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

For a production hydration error, record the exact rejected DOM node before
assuming the theme is at fault. Check server and browser stylesheet URLs.
Use the React Router route CSS manifest for root styles; test the frozen Bun
build and an actual deployed page, since a Node developer build can pass.
Match the Docker source context, including its excluded `.gitignore`. Tailwind
source discovery can otherwise hide a server/client asset disagreement.

## UI fixture contracts

When mixing Radix portals and React Aria overlays, test real selection, focus,
background isolation and Escape order. A role query can hide a parent while the
child list is active; check retained DOM separately and wait for exit animation
and focus return before reading the final role. Bound negative browser waits and
run an original-source focus-conflict probe in an owned child with a deadline:
competing focus traps can recurse without reaching a test timeout. Stop only its
verified owned process if it loops, then use a completed browser reproduction.

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

For workspace-event UI regressions, start with pending loader data, deliver the
event through the real shared EventSource subscription, and observe the nested
loader refresh and displayed result. Use
`test/ui/workspace-realtime-revalidation.test.tsx` as the fixture. Passing an
already-completed value into component props proves only the rendering branch.

An INSERT matcher cannot safely match every row in a loader snapshot. Check new
saved-row identity and suitable time before replacing optimistic state. Test a
repeated reply against known, older and unknown-time rows; it must remain present
and still accept a send-failure update. Keep a valid saved-row precision control.

## SQL query regressions

Raw SQL parameters bypass a column's value encoder. For a JavaScript Date
inside a SQL expression, use the timestamp column encoder with `sql.param`.
Verify capture, replacement and null input against real Postgres; mocked
updates cannot prove driver serialization or first-write preservation.
Raw `execute` results do not use Drizzle column decoders. Timestamp values
can be strings even when a cast says Date. Prefer scoped relational reads, or
decode each selected timestamp and prove it against the installed driver.

For real RPC fixtures, inspect and seed each required foreign-key actor.
Membership or an auth identity may not supply the legacy user-profile row.
A fixture or constraint error before the target assertion is not defect proof.
Assert PostgreSQL constraint codes at the actual driver boundary: raw
postgres.js errors expose `code`, while Drizzle query errors expose
`cause.code`. Require the owned row to remain unchanged after rejection.
After direct fixture SQL changes `workspace.twilio_data`, call
`invalidateWorkspaceTwilioData` before callback checks. Keep a valid callback
for the replacement account as a control. A stale cached token can otherwise
make a missing original-account guard appear to work.
For funding and queue metadata updates that preserve referenced keys, use
`FOR NO KEY UPDATE` to serialize writers while permitting foreign-key checks.
Prove that a real call insert can reference the locked workspace and queue,
and that a concurrent requeue still cannot change the intent. `FOR UPDATE`
can block the key-share locks from those inserts and create a lock cycle.
See [PostgreSQL row lock modes](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS).

For durable provider recovery, remove referenced product data both before the
create reply and after call persistence. A saved SID does not prove its call row
survived a cascading delete. Restore only verified provider records, keep missing
links null, scope surviving links to the tenant and lock them through insertion.
Prove signed callbacks, lost replies, known-SID recovery and repeated settlement;
do not infer a rejection or send another call because a local link disappeared.

For a new-operation fixture, generate a fresh intent UUID and assert a new ID
and prepared state before testing its send. Reusing an earlier intent exercises
accepted replay, even when the target call is the same.

Use command-scoped `VITEST_MAX_WORKERS=1` for shared real-database suites.
Vitest applies this environment override after `fileParallelism: false`, so a
broader gate's two-worker setting can let a global recovery scan claim another
file's dummy holds. Keep exact recovery assertions; serialize the fixtures.

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

For an owned temporary PostgreSQL fixture on macOS, initialize it with an
explicit locale and encoding (`initdb --locale=C --encoding=UTF8`). Shell locale
settings can be invalid for the installed server. Use a dedicated directory and
loopback port, and stop only that owned cluster after its readers finish.

The compose bootstrap grants its public schema to the `callcaster` role. Use
that role for an owned Docker fixture, or create it in that fixture before
bootstrap. Verify the recorded container ID, label and loopback port before
any schema reset; a missing fixture role is not an application failure.

For the full real-Postgres suite, set `DATABASE_URL`, `DATABASE_DIRECT_URL` and
`INTEGRATION_DB_URL` to the owned fixture in the command environment. Some suites
gate on the app URL or import its direct client. The integration override alone
can produce skipped tests and startup failures. Require the full count and zero
skips before treating the run as proof.

JavaScript fake timers do not change Postgres `now()` or column defaults.
Keep real database I/O on real timers when testing a provider deadline. Signal
that the provider read has started, await its bounded rejection, then release
the late response. Faking all timers can stall the SQL client's socket work and
the test teardown. Seed negative fixtures that satisfy the other SQL constraints;
an insert/update constraint error is not evidence that the product rejected them.
After stopping an owned integration worker, check its exact fixture IDs before
running global recovery-count assertions. A skipped teardown can leave an expired
operation for the next worker. Remove only verified dummy rows in the owned
database, require no unexpected customer or ledger data, and read back cleanup.
Use a block body when a Vitest setup hook configures a mock. Returning the mock
function registers it as hook cleanup, so Vitest calls it later without arguments.
Count provider reads after fixture readiness checks, or capture a baseline; the
fixture's own physical verification is not a callback-authentication side effect.
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


For historical production assessments, resolve the app, environment and database
service before reading data; compare their resolved connection identities without
printing credentials. Use a server-enforced read-only snapshot and bounded
statements. Return aggregate populations and check RLS/role visibility before
interpreting zero counts. An unlogged failed request is unknown, even when no
stored rows remain. Keep repeated legitimate visits distinct in query controls;
a shared contact, survey or time window is not proof of one broken attempt.

Select deployment IDs, revisions, times and status from structured metadata
before printing it; commit messages can be very large. Deployment creation time
is not an exact traffic switch time. Preserve that limit in historical reports.

For a render timeout during concurrent full gates, wait for the other gate
to stop, rerun the failing cases for diagnosis, then rerun the complete gate.
A passing focused rerun does not prove a full `ci:local:full` diagnostic run; do not weaken assertions
or raise a baseline to treat a timeout as green.
If different router-mount cases time out under memory pressure but pass alone,
run the full gate with `VITEST_MAX_WORKERS=1`. This Vitest environment setting
overrides both suites' worker limits. Keep assertions and timeouts unchanged.
Vitest 4 supports `VITEST_MAX_WORKERS`. On a busy local machine, use a
command-scoped limit such as `VITEST_MAX_WORKERS=2 npm run ci:local:full`; retain
all cases and timeouts. Keep `lint` and `check:lint-ratchet` sequential because
they write the same ESLint cache.

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

For every new SQL migration, register its real execution in both
`scripts/db/bootstrap-fresh-db.mjs` and
`scripts/e2e/bootstrap-compose-db.mjs` in the same change. Run the bootstrap
coverage guard and apply the fresh path to an empty owned database. An upgrade
on an existing fixture does not prove that fresh installs include the table.

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

For raw-array HTTP header fixtures, supply Host explicitly. Node can reject an
array without it before the request handler runs. Require a completed HTTP 200
and captured destination headers before claiming a stripping result; keep a
same-origin credential control and a public-header control.

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
Twilio's `RequestClient` receives lower-case method names. Normalize their case
for read-only assertions. Give every SDK fixture, including replacement-account
clients, the owned mock HTTP transport so a removed guard cannot reach the network.

When an SDK method changes, inventory its caller fixtures in every test tier.
`ci:local` omits the real database tier. Run the affected database cases before
push; run the full tier if the caller inventory is not complete.

For React Aria controls, a DOM click can miss the native press action. If the
control stays unchanged, inspect the current browser state and try native input.
Confirm the dialog or selected value before claiming an interactive check.
For native time inputs, a scripted fill can return without committing a change.
Use native keyboard input when needed, then verify both the displayed time and
the saved field or resulting summary before claiming an edit passed.

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

For real-router write fixtures, update the fixture store before the action returns.
Wait for revalidation to finish before checking the final rows. A static loader can
restore deleted rows and turn an optimistic-state assertion into a timing race.

For optimistic fetcher recovery, test real-browser fast results and first-send
redirects, as well as delayed failures. A busy render can be skipped, and a
redirect can complete without result data. Distinguish retained prior data from
a fresh result; verify a second send and later user edits.

For exit confirmations, keep the submit guard active until navigation completes.
Await the data router's navigation promise and test a delayed destination loader
with the real router. An immediate mocked navigate function can hide a second
release request and a second history change while the old screen remains visible.

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

For a Drizzle rollback test with postgres.js, use `drizzle(client).transaction()`
and pass its transaction executor to the app. Do not construct `drizzle(tx)`
from a raw `postgres.begin()` callback; that client lacks driver options.

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
`npm run tools:api:surface:report` before full CI. **Declaring or changing a
capability is an API surface change**: an entry in
`scripts/capability-baseline.json` is emitted into
`app/lib/api-surface-generated.ts` and into `openapi/*.json`, so both generators
must run. `ci:codegen:verify` catches the omission at the end of the gate, after
the minutes. Review and stage the expected
generated files. Run `git diff --cached --check` after staging so new files
receive the same whitespace check as existing files. `ci:codegen:verify` compares unstaged output with the index;
an intended un-staged API delta otherwise fails the final gate. Do not stage
drift without its matching reviewed source change.

## Twilio SDK teardown tests

Use the installed SDK at the transport boundary. Its WebSocket transport catches
send exceptions and returns false; PStream then emits an error which Device
forwards. A stub that throws directly from `hangup` tests a different failure.
Keep a normal send-success control beside the real send-false control. Detach
application callbacks before teardown, then keep safe Device and Call error
listeners until public SDK cleanup finishes, so errors cannot trigger reconnect
or interrupt EventEmitter dispatch. Include app-owned active and held calls:
`Device.calls` contains pending incoming calls and omits those legs. Verify media,
signaling and audio closure, repeat cleanup and late registration rejection.
After failed cleanup, test an external call close before retrying cleanup.
Remove only the helper's error guards; preserve existing listeners.
A direct unexpected SDK exception can still stop public `destroy`; report that
incomplete result and stop replacement registration instead of claiming closure.

Do not overlap a source-hash proof with the vendor distribution check or other
generated-file writers. Run focused proofs after those writers stop, then
require matching source hashes; a passing test report alone is insufficient.

For long-running checks, keep head hashes, completed reports and ownership
metadata in a persistent task artifact folder. A process handle or temporary
log is not a passing result after an interruption. Check the same process or
its authoritative result before restarting it.

When Docker is unavailable, an installed native PostgreSQL can run an owned
loopback fixture. Record its actual version. On macOS, use an explicit valid
locale and UTF-8 encoding; long artifact paths can exceed the Unix socket
103-byte limit. Set a short task-owned socket directory with `pg_ctl -o "-k /private/tmp/<owned-dir>"`; keep clients on explicit loopback TCP. Verify the server PID, data directory, port and database
before cleanup. An empty fixture can use `scripts/db/bootstrap-fresh-db.mjs`:
it applies the SQL before recording and checking both ledgers. Keep this local
proof separate from deployed verification; never write ledger rows merely to
clear a check.

## Node CI shards

For Node CI sharding, collect the unsharded file inventory from the same config
and require the passing shard reports to cover every file exactly once. Reject
missing, duplicate, empty or failed reports, and keep the required `test-node`
check name. Run the Bun runtime tier once. Keep file isolation when suites use
different module mocks; resetting mock calls does not reset imported modules.

## Entry points

- First run or repair: `make init` (`npm run setup`, idempotent). Services already running elsewhere: `npm run setup -- --skip-docker`.
- Services: `make up | down | logs | ps`; scope with a service name first (`make postgres logs`, `make postgres minio up`). Service names come from `docker-compose.dev.yml`.
- Processes: `make app` (dev server on :3000), `make worker` (job worker), `make media-stream`. Run each in its own terminal so its log stays visible.
- Checks: `npm run typecheck`, `npm run lint`, `npm run check:lint-ratchet`, `npm test`, `make e2e`. Node-tier tests need the node config: `npx --no-install vitest run -c vitest.node.config.ts <file>`; UI tests use `vitest.ui.config.ts`.

## Dependency cache verification

For an installed-dependency cache, include nested vendor `node_modules` and
verify local package links after restoration. Require an exact lockfile,
manifest, OS, architecture and Node-version key before skipping `npm ci`.
Seed the PR base branch as well as PR runs. For local archive benchmarks,
use `zstd -d` when restoring through tar's external compression program, and
require successful extraction before accepting a restore time.

## Tailing logs

- Compose services: `make logs` or `make <service> logs` (follows, last 200 lines). One-shot: `docker compose -f docker-compose.dev.yml logs --tail=100 postgres`.
- App and worker: they log JSON lines to the terminal they run in. Never pipe the worker through `head` or `tail` while it runs; redirect to a file and read that.
- Local Postgres is `127.0.0.1:5433` (`callcaster`/`callcaster`), MinIO console `:9001`, Inbucket `:9002`.

## Git in this repository

- `dev` is the trunk; `master` is the release branch and only moves by a dev → master release PR. Check `git log origin/dev` before starting an "open" issue: it may already be fixed.
- For product work, create or update the GitHub issue before starting work. One issue, one concern, one PR; put `Closes #N` in the PR body, never close issues by hand. User-authorized repository maintenance follows the [Git skill](../git/SKILL.md) exception and uses the `no-issue` PR label.
- The `dev → master` release PR must list every promoted issue with a closing keyword so GitHub closes them on promotion. A bare `(#N)` mention closes nothing, which is why shipped issues used to stay open; `release-close-issues.yml` gates this, with a `no-issue` label for a genuinely issue-free release.
- **One keyword per issue.** GitHub closes one issue per closing keyword, so `Closes #1, #2, #3` closes only `#1`. Write `Closes #1, closes #2, closes #3`. The gate now rejects the grouped form and names the numbers it would strand: `scripts/check-release-closing-references.mjs` fails when a keyword is followed by a comma list, and its test pins the body of release PR #2668, which closed one issue out of seventeen.
- Before committing, strip comments that narrate the code. A comment must state a reason the code cannot ("keep this in UTC", "auth.uid() has no shim") — not describe what the next line does. If deleting the comment (or the line under it) changes nothing for a reader, delete the comment. `callcaster/no-useless-comments` catches number-only and punctuation-only comments; the rest is a review standard, not a lint rule (#1978).
- Every PR that changes behaviour adds a line under `## [Unreleased]` in `docs/CHANGELOG.md`.
- Work in a worktree off `origin/dev` (`git worktree add <dir> -b <branch> origin/dev`); the main checkout is shared and can be reset under you. Commit each slice immediately.
- Merge on green with `gh pr merge N --squash --delete-branch`, then `git remote prune origin` and remove the worktree.
- Load the `github-cli` and `github-issues` skills for `gh` specifics.

Before production release checks, resolve app and worker service IDs from that
environment's service instances. A PR preview can use a different app service.
An empty deployment list for a copied preview service ID is unknown, not a
production failure. Require both actual production deployments at the release
commit.

Route modules must export only route-facing handlers and components. Import
server helpers directly in their tests. A helper re-export from a route can
retain its server dependency graph in the browser build, even with a `.server`
filename. Confirm the production build and client bundle guard after changing
server imports.

For exact-file import identity and coordinates, test the real multipart upload
boundary through its queued worker bytes. A decoder/encoder round trip can strip
a UTF-8 BOM or replace invalid bytes while direct parser tests stay green. Keep
worker and stored-original bytes equal, and reject invalid UTF-8 before writes.

For live chat send reconciliation, server `pending:` rows are separate durable
intents. Preserve `client_ref` when provider fields replace the SID. Match server
updates by that identity; limit content matching to one browser optimistic row.
Test identical concurrent sends with reversed completion order.

Loader revalidation can beat SSE delivery. Reconcile durable chat intents by
client reference on loader reads, late INSERT events and exact-SID UPDATE events.
Test this with a real router fetcher action, including delayed event delivery.
A stale loader can also arrive after SSE resolution: discard incoming intents
whose identity is already resolved. Historical rows without a client reference
must never consume a server intent through content matching.

Keep throwaway browser fixtures outside the repository checkout. A Git-ignored
`.local/` file can still enter the full ESLint scan and lint ratchet. Point the
fixture's aliases at the owned worktree, and keep its dependencies and cache in
its own temporary directory.
