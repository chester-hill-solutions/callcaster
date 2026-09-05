# Strict Checks Agent Brief

Use this document to add strict, ratcheting quality checks to a TypeScript
React Router repository. Do not copy CallCaster's debt counts. Measure the
target repository, record its current debt once, and prevent that debt from
growing.

Reference implementation: CallCaster `origin/dev` at `0ed8aac4`, fetched
2026-08-28.

## Core Policy

- New violations must fail CI.
- Existing violations may be grandfathered in a checked-in baseline.
- Baselines may only decrease. Never raise a baseline to make a change pass.
- A suppression comment must not silently remove a violation from the count.
- Every new exemption must be narrow and include a reason.
- Run all checks in one local command that matches CI.
- Keep generated route, API, and report files clean under `git diff`.

## Lint Ratchet

Add a `check:lint-ratchet` script that runs ESLint once with JSON output and a
shared cache. Track these rules as warnings in the editor, but enforce their
counts in the ratchet:

| ESLint rule | Recommended limit |
| --- | ---: |
| `max-lines-per-function` | 200 lines |
| `complexity` | 20 |
| `@typescript-eslint/no-non-null-assertion` | 0 new assertions |
| `max-params` | 5 parameters |
| `max-depth` | 4 levels |
| `import/no-cycle` | Maximum cycle depth 4 |
| `no-return-await` | 0 new uses |
| `no-console` | 0 new direct calls |

The baseline must be per rule at minimum. Prefer stable identities based on
rule, file, and containing symbol so that removing one violation cannot hide a
new violation somewhere else. Stale baseline entries must fail the check.
Consume ESLint suppression metadata when possible. If source scanning is used,
count `eslint-disable` and `eslint-disable-next-line` comments for tracked
rules as violations.

Reference counts from the latest CallCaster baseline are 59, 87, 125, 9, 21,
16, 24, and 11 in the table order above. These numbers are reference data
only, not requirements for the target repository.

## TypeScript Strictness

Require, where supported by the repository:

- `strict: true`
- `noImplicitAny`
- `noImplicitReturns`
- `noUncheckedIndexedAccess`
- `noImplicitOverride`

Ban `@ts-ignore` and `@ts-nocheck` in active application code. Require a
description on `@ts-expect-error`. Add a type-escape ratchet for `as any`,
`as unknown as`, and explicit `any`; the count must not increase.

## React Router Checks

Add structural checks for the repository's route convention. Adapt paths and
names to the target repository, but preserve the guarantees:

- The generated route tree must match a checked-in route baseline.
- Every route `loader` and `action` must use the approved handler factory.
- Every route that touches tenant data must prove membership before access.
- Workspace writes must enforce the required role.
- Protected route families must use typed middleware context, not ad hoc inline
  authentication.
- Public, user-scoped, webhook, and hybrid routes must have explicit reasons
  for any auth exception.
- API-key routes must reject unbound keys or prove the key's workspace binding.
- Route modules must not import server-only code into the client bundle.
- Client-visible loaders must return a safe projection, not secret columns.
- A request body must not be consumed twice or re-parsed after consumption.
- Twilio or other signed webhooks must verify the signature before processing.
- Generated API clients, OpenAPI files, route metadata, and capability reports
  must agree and produce no diff.

For React Router 8 with split route modules, keep server loaders and actions in
the repository's ignored server-file suffixes. Verify that those files are not
registered as routes. Use the repository's route-tree tool as the source of
truth instead of hand-maintained route lists.

## Additional Ratchets

Add checks for the following when the target repository has these concerns:

- React effects: require a short annotation describing the effect, its
  dependencies, and its external side effects. Ratchet unannotated effects.
- Duplication: use a detector such as jscpd and ratchet clone and duplicated
  line counts downward.
- Test mocks: shared server-module mocks must preserve the original export
  surface with `importOriginal` or the equivalent passthrough mechanism.
- Database access: tenant access must use one scoped accessor. Every called RPC
  must be created by a migration.
- Billing or credits: direct balance mutations must be forbidden outside the
  atomic ledger path.
- Handlers: declarations for side effects, billing, and queue work must match
  detected behavior.
- File size: new application files over 800 lines should fail; grandfathered
  exceptions must be explicit and ratcheted down.
- Client bundle: fail if server markers, database imports, or secrets appear in
  built client assets.

## Required Agent Workflow

1. Inspect the target repository's framework, route layout, scripts, and CI.
2. Add strict ESLint and TypeScript rules without changing existing behavior.
3. Write deterministic check scripts with actionable failure messages.
4. Generate initial baselines from the current tree and commit them separately
   from unrelated fixes.
5. Add tests that fail when each gate is inverted or bypassed.
6. Add one `ci:local` command that runs typecheck, lint, ratchets, tests, route
   verification, production build, bundle checks, and generated-file checks.
7. Run the full command. Fix every new violation. Do not stop at a partial gate.
8. Document each remaining baseline and the command that lowers it.

## Failure Message Contract

Every check must report:

- The violated rule.
- The current value and permitted baseline.
- The file and line or stable identity.
- The exact command to run for more detail.
- The remediation path.

## Source Reference

- Lint gate: `scripts/check-lint-ratchet.mjs`
- Lint baseline: `scripts/baselines/lint-ratchet.json`
- ESLint configuration: `.eslintrc.cjs`
- CI composition: `package.json` `ci:local` script
