# Role checks become capability checks, extending the layer that already exists

> **Status: proposed for review (2026-10-19).** No implementation starts until
> this is reviewed. Raised by #2030, which asks for fine-grained permission
> checks instead of broad role checks, and asks for the options to be weighed
> against what the tooling already provides before anything is built.

The product gates on four workspace roles: `owner`, `admin`, `member`, `caller`
(`app/lib/member-role.ts`). The UI presents them as Administrator, Coordinator
and Agent (`app/lib/workspace-role-display.ts`). Access is decided by comparing
those roles, so the shape of every check is "is this person at least an Admin",
never "may this person publish a campaign".

The second half of the issue is what decides the work: weigh the options, and
investigate what the codebase and the auth tooling already provide before settling
on an architecture. That investigation is below, and it changes the shape of the
answer. A capability layer already exists in this repository and in the shared CHS
packages. It is only partly adopted, so the remaining work is coverage rather than
design.

## Decision

1. Keep the capability model as the single source of truth for what is allowed.
   Do not add a second evaluator.
2. Grow the capability catalog until it expresses the distinctions the routes
   already make, then convert the inline broad-role checks to capability checks.
   Each converted route gets a route-level enforcement test.
3. Drive the grandfathered capability baseline from 7 to 0 through the ratchet
   that already measures it.
4. Collapse the duplicate role lists and the duplicate rank sources to one.
5. Leave tenant isolation as it is. It composes with capability checks and does
   not replace them.
6. Treat workspace-customized permissions as a separate, later decision.

## What already exists

Nothing permission-shaped needs to be invented.

| Layer | What it is | Where |
| --- | --- | --- |
| Capability catalog | 8 capability ids: `campaigns.read`, `campaigns.write`, `campaigns.dispatch`, `calls.start`, `calls.control`, `messages.send`, `members.invite`, `audit.read` | `app/lib/capabilities.ts` |
| Role to capability defaults | A matrix mapping `owner`/`admin`/`member`/`caller` to those ids, plus `capabilityIdsForRole()` | `app/lib/capabilities.ts` |
| Actor and set algebra | `AuthorizationActor`, `CapabilityId`, `capabilitySetFromIds`, `asCapabilityId` | `@chester-hill-solutions/auth` 0.2.0, `@chester-hill-solutions/auth-postgres` 0.3.0 |
| Actor adapters | `sessionActorFromMembership`, `apiKeyActorFromScopes`, `actorHasProductCapability` | `app/lib/capability-actor.server.ts` |
| Enforcement | Capability-branded auth strategies and guards: `dataPlaneCapabilityAuth`, `requireDataPlaneRouteCapability`, `requireDualAuthCapability`, `defineDataPlaneListLoader` | `app/lib/capability-guard.server.ts` |
| Structural ratchet | An API surface's declared `capability` must be the capability the route enforces. Measured today: 32 declared capabilities across 199 operations, 25 linked to a capability-carrying strategy, **7 grandfathered preambles ratcheting to 0** | `scripts/check-handlers.mjs`, `scripts/lib/capability-linkage.mjs`, `scripts/capability-baseline.json` |
| Membership and tenancy | Three middleware trees, and `createTenantDb()` scoping every read and write of 34 registered tenant tables | `app/lib/*-middleware.server.ts`, `app/server/tenant-db.ts`, `app/db/workspace-scoped-tables.ts` |

The role-to-capability matrix is already the thing the issue asks for, in data:
"roles are wrappers around sensible permissions".

## The gap, measured

- **29 route server files still compare roles inline**: 19 call
  `hasMinRole(...)`, 10 compare `userRole ===/!==`. These are the broad role
  checks the issue names.
- **The catalog is too small for the checks the routes make.** Eight
  capabilities cannot express the distinctions behind 29 files, so routes that
  have no matching capability keep their role comparison.
- **Seven preambles enforce a capability by hand** rather than through a branded
  strategy (`scripts/capability-baseline.json`: `GET`/`DELETE`/`PATCH
  /api/audiences`, `POST /api/campaigns/create-with-script`, `POST /api/chat_sms`,
  `POST /api/sms`, `POST /api/workspaces/:workspaceId/members`).
- **Four role lists and two rank sources drift apart.** The values live in
  `MemberRole`, `PRODUCT_ROLE_IDS`, `WORKSPACE_MEMBERSHIP_ROLES`, and an inline
  array in `app/lib/workspace-route.server.ts:116`. Ordering lives in
  `WORKSPACE_ROLE_RANK` in code and in `workspace_role_row.rank` in the database,
  which is seeded but never read.
- **Two min-role middleware factories are dead code**
  (`createWorkspaceMiddlewareWithMinRole`, `createDataPlaneMiddlewareWithMinRole`).
- **The per-workspace customization tables are unused.** `workspace_feature` and
  `workspace_feature_permission` exist in `app/db/schema.ts` and no application
  code reads them. The matrix documents itself as temporary until those tables
  are cut over.

## Considered options

- **Adopt the better-auth admin plugin.** Rejected. Its schema puts `role` on the
  global `user` (`node_modules/better-auth/dist/plugins/admin/schema.mjs`), but
  authorization here is per workspace: the same person is an Admin in one
  workspace and an Agent in another. Its built-in statements cover `user` and
  `session` administration only, so no product capability would use it.
- **Adopt the better-auth organization plugin.** Rejected. It requires six tables
  (organization, member, invitation, team, teamMember, organizationRole). We
  already have `workspace` and `workspace_member`, so adopting it means remapping
  live tenant tables and running two sources of truth through the migration.
- **Move the evaluator onto `createAccessControl` from
  `better-auth/plugins/access`.** Rejected for now. The primitive is generic and
  would work: `createAccessControl(statements).newRole(...).authorize(request,
  connector)` returns `{ success, error }` and is in-memory. But the actor and set
  layer already exists in the shared CHS packages and is wired into the guards and
  the capability ratchet. Swapping it forks the model for no gain. Revisit only if
  the catalog outgrows set membership, for example if it needs conditions or
  attributes.
- **Write a new permission engine.** Rejected. It would duplicate
  `app/lib/capabilities.ts`, the guards, and the ratchet.

Weighing the issue's question directly: better-auth's *permission primitive* is
real and usable, but its *permission models* are for user administration and
organization membership. Neither is this domain. The primitive's role is also
already filled by the shared CHS packages, which are versioned and wired in.

## Consequences

- The issue's ask is delivered incrementally. Each converted route removes one
  broad role check, and the existing ratchet proves the conversion rather than a
  reviewer's word.
- Adding one capability per route would recreate the problem at a finer
  granularity. Capabilities must be grouped per resource and action.
- The role lists converging on one source is a prerequisite for the later
  conversion work, not a cleanup that can be deferred to the end.
- A wrong capability mapping is a security defect. Every converted route needs a
  test that fails when the capability is removed, not only a test that passes.

## Follow-up

The cluster recorded against this issue sequences from here: #2008 defines the
Agent capability surface, #2009 makes campaign membership grant campaign-level
access, #2031 is the codebase-wide sweep, and #2002 is the parent.

## References

- `app/lib/capabilities.ts`, `app/lib/capability-actor.server.ts`,
  `app/lib/capability-guard.server.ts`
- `app/lib/member-role.ts`, `app/lib/workspace-role-display.ts`,
  `app/lib/workspace-membership.server.ts`
- `scripts/check-handlers.mjs`, `scripts/lib/capability-linkage.mjs`,
  `scripts/capability-baseline.json`, `scripts/check-route-authz.mjs`
- Installed packages, read from disk: `better-auth` 1.6.23,
  `@chester-hill-solutions/auth` 0.2.0, `@chester-hill-solutions/auth-postgres`
  0.3.0
