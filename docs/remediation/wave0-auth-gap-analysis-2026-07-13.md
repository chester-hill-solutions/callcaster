# Wave 0 — CHS Auth Gap Analysis

**Generated:** 2026-07-13

## CHS package inventory

| Package | Version (monorepo) | Ships today | Plan expects |
|---------|-------------------|-------------|--------------|
| `@chester-hill-solutions/auth` | 0.1.1 | Session types, redirects, cookies, Postgres actor helpers | Capability actor contracts, email/token primitives |
| `@chester-hill-solutions/auth-postgres` | 0.2.0 | Better Auth factory, `workspace_member`, feature permission RPC | CallCaster role seeds, invitation schema/service |
| `@chester-hill-solutions/auth-react-router` | 0.1.1 | Session middleware, layout loaders | Capability guards, invite-completion adapters |

**Not installed in CallCaster** — local shim at `app/lib/auth-layout.server.ts` duplicates RR helpers.

## Gaps (plan vs reality)

| Requirement | CHS | CallCaster |
|---|---|---|
| Capability IDs (`campaigns.read`, …) | Generic feature strings only | No registry; `requireDualAuth` has no capability check |
| Roles `owner/admin/member/caller` | Seeds `admin/editor/sender` | Enum `workspace_role` + text column on `workspace_users` |
| Email-first invitations | Missing | `workspace_invite` requires pre-existing user; no email send |
| Invite redemption | Missing | Accept by invite ID only — SEC-03 IDOR |
| API key scopes | N/A (CallCaster-owned) | No scope/expiry columns on `workspace_api_key` |
| Canonical membership tables | Partial (`workspace_member` text user_id) | Legacy `workspace_users`; no feature tables in baseline |
| Better Auth integration | Factory available | Direct `betterAuth()` with `auth_*` prefixed tables |

## Three-package API proposal (pending approval)

### `@chester-hill-solutions/auth`

- `CapabilityId` branded type + product-agnostic actor interface
- `AuthorizationActor` union: session user | API key actor (adapter contract)
- Email normalize, opaque token generate/hash/verify (constant-time)
- Shared authz error vocabulary

### `@chester-hill-solutions/auth-postgres`

- Invitation table: normalized email, role template, token hash, expiry, status
- `createInvitation`, `resendInvitation`, `cancelInvitation`, `redeemInvitation` (CAS)
- CallCaster role seed migration: owner/admin/member/caller + capability matrix
- UUID FK standardization for `workspace_member.user_id`

### `@chester-hill-solutions/auth-react-router`

- `createRequireCapability(capabilityId)` middleware
- Invite completion loaders (new vs existing user magic-link callbacks)
- Verified-email binding for redemption

### CallCaster retains

- Product capability ID registry and seeds
- `workspace_api_key` storage, expiry, immutable scope allowlists
- Adapter presenting scoped API key as `AuthorizationActor`

## Publish / adoption sequence

1. Implement extensions in CHS monorepo; package-level tests. — **done:** [PR #22](https://github.com/chester-hill-solutions/chester-hill-solutions/pull/22) (`feat/auth-capability-invite`: auth 0.2.0, auth-postgres 0.3.0, auth-react-router 0.2.0).
2. Publish all three packages to GitHub Packages. — **done** (2026-07-13 afternoon): PR #22 merged; tag **v0.1.8** published (auth 0.2.0, auth-postgres 0.3.0, auth-react-router 0.2.0).
3. CallCaster: install packages; replace local auth-layout shim. — **next** (adopt pending).
4. Drizzle forward migration: atomic replace `workspace_users` → CHS membership tables.
5. Update Supabase→Postgres transform to write canonical structures.
6. Implement SEC-07 capability guard; then SEC-03 invite flow. — SEC-03 IDOR stopgap landed; full SEC-07/SEC-03 adopt still pending.

## Cutover blockers

1. ~~CHS auth extensions unpublished~~ — published v0.1.8; CallCaster adopt next
2. Canonical membership schema absent from Drizzle baseline
3. Import transform not writing CHS structures
4. Auth table shape mismatch (`auth_*` vs CHS defaults)
5. SEC-07 / SEC-03 — IDOR stopgap landed; full capability guard + invite binding still pending
6. `field_director` → `admin` mapping policy at data layer
