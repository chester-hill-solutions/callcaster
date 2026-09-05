# CI Load-Reduction Next Steps

## Purpose

Continue reducing CI runner load and PR latency while moving correctness into
small, testable code modules. Do not weaken the full validation bar for changes
that can affect production behavior.

## Current Baseline

Completed and merged:

- `#1389`: replaced catastrophic backtracking in `check:effects` with a linear scan.
- `#1390`: reused the warm ESLint cache in `check:lint-ratchet`.
- `#1391`: added run cancellation, nightly coverage, path-scoped jobs, and Playwright caching.
- `1079785f`: added the test checklist at `docs/ci-load-reduction-test-checklist.md`.

Observed results:

- `check:effects`: approximately 100 seconds in CI to less than 1 second.
- `check:lint-ratchet`: 104 seconds in CI to approximately 3 seconds.
- Quality job: approximately 8 minutes to approximately 6 minutes, subject to runner variance.
- Coverage is no longer part of normal pull-request latency.
- Documentation and board-only changes skip E2E and bundle guard.

## Delivery Rules

- Keep one logical concern per pull request.
- Put reusable decision logic in tested code, not inline workflow shell.
- Fail closed for uncertain path scope: unresolved scope runs all affected jobs.
- Keep `quality` unconditional for pull requests.
- Run full `npm run ci:local` before every push or pull request.
- Do not merge a change that skips a required check without proving the branch-protection behavior.
- Preserve the dual lockfile requirement: update both `package-lock.json` and `bun.lock` when dependencies change.

## Phase 1: Validate the New CI Shape

### 1.1 Monitor skipped-job behavior

**Priority:** P0  
**Effort:** 1 SP

Confirm that skipped `coverage`, `bundle-guard`, and E2E jobs satisfy the
repository's required checks. Test at least one documentation-only pull request
and one board-only pull request.

Acceptance:

- Skipped jobs do not block merge.
- A failed `changes` job does not allow dependent jobs to pass silently.
- An unresolved or empty diff runs all scoped jobs.

### 1.2 Confirm scheduled coverage health

**Priority:** P0  
**Effort:** 1 SP

Run the workflow manually and inspect the first scheduled run.

Acceptance:

- Manual and scheduled runs execute `coverage`.
- Pull-request and ordinary push runs skip `coverage`.
- Coverage still runs both test suites and publishes the expected artifacts.
- A coverage failure remains visible to maintainers.

### 1.3 Measure runner-minute savings

**Priority:** P1  
**Effort:** 1 SP

Record job durations and runner minutes for one application PR, one E2E-only
PR, and one documentation-only PR. Compare them with the pre-`#1391` baseline.

Acceptance:

- The repository has a short before/after measurement.
- The team decides whether further optimisation targets wall time, runner cost,
  or both.

## Phase 2: Strengthen Code-Side Guardrails

### 2.1 Add a fast local feedback command

**Priority:** P1  
**Effort:** 2 SP

Add a documented `ci:fast` command for inner-loop work. It should run the
highest-signal local checks without pretending to replace `ci:local`.

Suggested scope:

- Typecheck.
- Cached lint.
- Lint ratchet.
- Targeted node and UI tests selected by the developer or agent.

Acceptance:

- The command finishes quickly on a warm workspace.
- Its output clearly states that full `npm run ci:local` is still required before push.
- It does not change baselines or generated files.

### 2.2 Add optional pre-push enforcement

**Priority:** P1  
**Effort:** 3 SP

Provide an explicit installation command for a pre-push hook. The hook should
run the full gate or refuse to run until the developer chooses the full gate.
Do not install hooks silently during `npm install`.

Acceptance:

- Hook installation is opt-in and documented.
- The hook cannot mutate user files or use a shared stash.
- Developers can bypass the hook only through an explicit, visible command.
- CI remains the final independent verification.

### 2.3 Replace the test-mock regex guard with AST analysis

**Priority:** P1  
**Effort:** 5 SP

Replace `scripts/check-test-mock-coverage.mjs` regex matching with a
TypeScript-aware AST rule. Cover `vi.mock` and `vi.doMock`, alias and relative
imports, and verify that the original module is actually spread.

Acceptance:

- Parenthesized and expression-body factories are detected.
- Relative shared-module mocks are detected.
- `vi.doMock` is detected.
- Binding but not using `importOriginal` fails.
- Existing valid passthrough mocks pass.
- Focused unit fixtures cover every supported syntax.

### 2.4 Make the lint ratchet identity-based

**Priority:** P1  
**Effort:** 5 SP

Replace aggregate per-rule counts with stable violation identities based on
rule, file, and containing symbol where possible. Consume ESLint suppression
metadata instead of scanning source text for disable comments.

Acceptance:

- A new violation in one file cannot be hidden by removing one in another.
- Stale baseline entries fail the check.
- Disable comments cannot silently zero a warning.
- ESLint still runs only once per quality job.

### 2.5 Remove deprecated lint debt

**Priority:** P2  
**Effort:** 1 SP

Remove `no-return-await` from `.eslintrc.cjs` and delete its baseline entries.

## Phase 3: Fix Product Correctness Exposed by the Review

### 3.1 Unify campaign schedule projection

**Priority:** P0  
**Effort:** 8 SP

Create a canonical absolute-interval engine for weekly schedules. Use it for
current eligibility, next-open scheduling, SMS ETA, and IVR ETA.

Required behavior:

- Include an overnight interval that started on the previous day.
- Handle week rollover.
- Handle multiple and overlapping intervals.
- Preserve unrestricted schedules.
- Respect IVR start and end dates.

Acceptance:

- Dispatch and ETA use the same interval model.
- SMS and IVR policies have explicit adapters.
- No schedule cast is needed in `CampaignLaunchExtras.tsx`.
- Tests cover overnight, boundary, empty, and date-range cases.

### 3.2 Restore the SMS API contract

**Priority:** P1  
**Effort:** 2 SP

Document the deferred response, including `deferred`, `reason`, and
`nextOpenAt`, in OpenAPI. Regenerate generated clients and add a contract test.

Acceptance:

- Runtime response and OpenAPI schema match.
- Generated types support dispatched and deferred variants.
- `npm run ci:codegen:verify` passes.

### 3.3 Make issue-board pruning atomic

**Priority:** P1  
**Effort:** 3 SP

Make pruning pure and stage all writes until every enrichment record and board
dependency validates successfully.

Acceptance:

- Malformed records are reported without being deleted.
- Dangling `blockedBy` edges fail without partial writes.
- Successful runs prune closed records and update the board atomically.
- Tests cover failed and successful multi-file generation.

## Phase 4: Repair Theme and Accessibility Ownership

### 4.1 Separate semantic surface and text tokens

**Priority:** P0  
**Effort:** 3 SP

Use separate tokens for solid surfaces, washes, icons, and standalone text.
Fix dark info-toast contrast and light standalone success text.

Acceptance:

- Normal text meets WCAG AA in both themes.
- Badges and solid tone surfaces retain readable foregrounds.
- All standalone semantic tone usages are audited.

### 4.2 Exercise rendered accessibility states

**Priority:** P0  
**Effort:** 3 SP

Update the axe test to open each toast and scan real interactive states.

Acceptance:

- Success, info, warning, and error toasts are rendered before scanning.
- Light and dark root themes are asserted.
- Focused, selected, disabled, invalid, loading, and open states are covered.
- A contrast regression fails the test.

### 4.3 Move the gallery out of the product route

**Priority:** P1  
**Effort:** 5 SP

Move the design gallery to the shared CHS UI-kit workbench, or isolate it to a
test/development build. Remove duplicate control IDs and direct theme mutation.

Acceptance:

- Workspace users cannot access a test-only gallery in production.
- Theme changes use the canonical theme provider.
- One theme is rendered per test context; no mixed light/dark subtree exists.

### 4.4 Add vendor source/dist drift verification

**Priority:** P1  
**Effort:** 2 SP

Make the `shad-cc` source repository the clear owner of shared component
behavior. Add deterministic source-to-dist verification if generated output
remains vendored here.

Acceptance:

- A source edit without a matching dist update fails deterministically.
- Package-level tests cover the changed behavior.
- Ownership and sync expectations are documented.

## Phase 5: Remove Type and Abstraction Debt

### 5.1 Use a discriminated queue-action schema

**Priority:** P2  
**Effort:** 3 SP

Replace the `.refine()` action schema with a discriminated union. Remove
repeated action-specific presence checks from `platform-data.server.ts`.

Acceptance:

- Each action has its required fields in its type.
- The service switch narrows without casts or defensive duplicates.
- Invalid payloads fail at the request boundary.

### 5.2 Strengthen call-screen return types

**Priority:** P2  
**Effort:** 3 SP

Return non-null workspace and campaign data from `getCallScreenData()` after
validation. Remove downstream unreachable guards and cast-heavy result shapes.

Acceptance:

- Callers do not re-check guaranteed values.
- No `as unknown as` is required for the result.
- Error handling remains explicit and preserves prior failure behavior.

### 5.3 Consolidate invariant helpers

**Priority:** P2  
**Effort:** 2 SP

Create one typed weekday accessor and one shared non-empty SQL combinator.
Remove copied `andConditions` helpers and impossible interval guards.

Acceptance:

- Each invariant has one failure policy.
- Empty SQL condition lists are rejected by the type boundary.
- Schedule comparison uses direct, bounded iteration.

## Recommended Sequence

1. Phase 1.1 and 1.2: validate skipped checks and nightly coverage.
2. Phase 3.3: make issue-board writes atomic.
3. Phase 4.1 and 4.2: fix and test active accessibility regressions.
4. Phase 3.1: unify schedule projection before adding more ETA behavior.
5. Phase 3.2: restore the public SMS contract.
6. Phase 2.3 and 2.4: replace weak quality gates with trustworthy code-side rules.
7. Phase 2.1 and 2.2: improve local developer enforcement.
8. Phase 4.3 and 4.4: move and harden the shared component workbench.
9. Phase 5: remove remaining type and invariant debt.

## Definition Of Done

- [ ] Every item has a focused pull request.
- [ ] Every pull request passes full `npm run ci:local`.
- [ ] New local scripts have focused tests.
- [ ] CI skips only jobs proven irrelevant by tested path logic.
- [ ] Unknown path scope runs all affected jobs.
- [ ] Coverage has a healthy scheduled and manual signal.
- [ ] No production behavior relies on the test-only design gallery.
- [ ] No public response differs from its OpenAPI contract.
