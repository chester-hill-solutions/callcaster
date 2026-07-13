# Wave 1 — Canonical Membership Migration Design

**Generated:** 2026-07-13  
**Branch context:** `chore/improvements`  
**CHS packages:** `@chester-hill-solutions/auth@0.2.0`, `auth-postgres@0.3.0`, `auth-react-router@0.2.0`  
**Prerequisite:** [wave0-migration-manifest-2026-07-13.md](./wave0-migration-manifest-2026-07-13.md), [wave0-auth-gap-analysis-2026-07-13.md](./wave0-auth-gap-analysis-2026-07-13.md)

## Goal

Replace CallCaster’s legacy `workspace_users` / `workspace_invite` model with CHS auth-postgres canonical membership, role, feature-permission, and email-first invitation tables **before customer cutover** onto Railway Postgres. Target is not serving customers yet — prefer an atomic target schema with an expand → backfill → reader-switch → drop-legacy rehearsal path on review env, **not** a permanent dual-write adapter.

**This wave’s scaffold (safe now):** additive DDL only. Readers/writers stay on `workspace_users`. SEC-07 in-app role→capability matrix keeps working mid-flight.

---

## 1. Current vs target table map

| Concern | Current (CallCaster) | Target (CHS auth-postgres 0.3.0) | Notes |
|--------|----------------------|----------------------------------|-------|
| Membership row | `workspace_users` (`id` bigserial, `workspace_id` uuid, `user_id` uuid, `role` enum/text, `last_accessed`) | `workspace_member` (`id` text, `workspace_id` text, `user_id` **text**, `role_id` text, `invited_by`, `created_at`) | Preserve user UUID string into `user_id`; map role → `role_id` |
| Role vocabulary | PG enum `workspace_role` + column on `workspace_users` | Table `workspace_role` (`id` text PK, optional `workspace_id`, `rank`) | **Name collision:** enum and table cannot coexist — rename enum first (see Phase A) |
| Feature / capability ACL | In-app `CALLCASTER_ROLE_CAPABILITY_MATRIX` ([`app/lib/capabilities.ts`](../../app/lib/capabilities.ts)) | `workspace_feature` + `workspace_feature_permission` + RPC `check_workspace_feature_permission` | SEC-07 reads matrix until reader switch seeds DB matrix |
| Invitation | `workspace_invite` (user_id-bound nonce, `role` enum, `isNew`) | `workspace_invitation` (email-first, `token_hash`, status/expiry, CAS redeem) | SEC-03 attaches after tables exist; keep stopgap on legacy until write-switch |
| Workspace identity | `workspace.id` **uuid** | Package DDL assumes `workspace.id` **text** | Scaffold omits FKs to `workspace(id)`; store uuid as text |
| Auth user | `auth_user` / `public.user` (uuid profile) | Package testing DDL uses `"user"(uuid)` | CallCaster keeps `auth_*` prefixes (ADR-0010) — open risk below |
| Owner marker | `workspace.owner` uuid + `workspace_users.role = 'owner'` | `workspace_member.role_id = 'owner'` (+ retain `workspace.owner` until ownership UX cut over) | Dual source until settings writers switch |

**Package DDL sources (published):**

| Export | Module | Creates |
|--------|--------|---------|
| `WORKSPACE_FEATURE_AUTHZ_DDL` | `@chester-hill-solutions/auth-postgres` | `workspace_role`, `workspace_feature`, `workspace_feature_permission`, `check_workspace_feature_permission` |
| `WORKSPACE_INVITATION_DDL` | same | `workspace_invitation` + pending (workspace, email) unique |
| Testing `DDL` fragment | `auth-postgres/dist/testing/sql.js` | `workspace_member` (not a public named export — copy equivalent) |
| `WORKSPACE_MEMBER_ROLE_ID_MIGRATION_DDL` | same | **Skip** if creating `role_id` from day one |
| `PRODUCT_ROLE_IDS` / `seedProductRoleCapabilityMatrix` | `product-role-seeds` | `owner` / `admin` / `member` / `caller` ranks + capability upserts |

**Scaffold files:**

- [`drizzle/0008_chs_workspace_membership.sql`](../../drizzle/0008_chs_workspace_membership.sql)
- [`client/migrations/20260713180000_chs_workspace_membership.sql`](../../client/migrations/20260713180000_chs_workspace_membership.sql) (ledger mirror)

---

## 2. Migration phases

### Phase A — DDL apply (this PR / scaffold)

1. Rename PG enum `workspace_role` → `workspace_users_role` so the CHS **table** `workspace_role` can be created.
2. Create `workspace_member`, `workspace_role`, `workspace_feature`, `workspace_feature_permission`, `workspace_invitation`, and `check_workspace_feature_permission` **alongside** `workspace_users` / `workspace_invite`.
3. Seed global product roles (`owner`/`admin`/`member`/`caller` with ranks from `PRODUCT_ROLE_RANKS`).
4. **Do not** drop legacy tables, switch readers, or dual-write membership mutations.
5. Hand-sync [`app/db/schema.ts`](../../app/db/schema.ts): enum → `workspace_users_role`; add Drizzle stubs for CHS tables (`workspace_member`, `workspace_role_row`, features, `workspace_invitation`). Done with scaffold; readers still ignore those tables.

**SEC-07 invariant:** capability actors still resolve session role from `workspace_users.role` via `capabilityIdsForRole` / `sessionActorFromMembership`. Empty target tables are unused.

### Phase B — Expand / backfill (review rehearsal; pre-cutover)

1. Backfill script (or import transform): for each `workspace_users` row → `workspace_member`:
   - `id` = stable deterministic text (e.g. `wm:{workspace_id}:{user_id}` or uuidv5).
   - `workspace_id` = `workspace_id::text`.
   - `user_id` = `user_id::text` (**preserve UUID**).
   - `role_id` = mapped product role (see §3).
2. Optionally run `seedProductRoleCapabilityMatrix(db, CALLCASTER_ROLE_CAPABILITY_MATRIX)` so DB feature rows mirror the in-app matrix before reader switch.
3. Parity checks: count members per workspace; role histogram; spot-check owners; refuse cutover on missing `owner` or unmapped roles.
4. **No permanent dual-write.** For review-only live edits before switch, prefer freeze membership mutations or one-shot re-backfill from legacy (unused target).

### Phase C — Reader / writer switch (separate implement PR)

1. Point membership reads (`requireWorkspaceAccess`, settings members, MFA privileged-role query, platform members, etc.) at `workspace_member` + `role_id`.
2. Writers insert/update/delete `workspace_member` only.
3. Flip SEC-07 session capability resolution to `check_workspace_feature_permission` **or** keep matrix as cache with DB as SoT — prefer DB SoT after seed parity.
4. Wire SEC-03 to `createInvitation` / `redeemInvitation` (see §6); stop writing `workspace_invite`.
5. Keep `workspace_users` readable for one release for rollback evidence; mark writes fail-closed.

### Phase D — Drop legacy (contract)

1. After smoke + parity on review and cutover success: drop `workspace_users`, `workspace_invite`, unused JWT claim RPCs, and eventually rename leftover enum if unused.
2. Uncomment / implement drop in [`scripts/schema-transform/09-drop-legacy-presence.sql`](../../scripts/schema-transform/09-drop-legacy-presence.sql) only after Phase C verified — do **not** rename already-applied migration files.
3. Remove `workspace_users` from tenant scoped tables and generated types.

**Atomic cutover stance:** Phases A–D complete on Railway before customers move. Customer flip is data authority switch after final Supabase delta import already writing CHS shapes.

---

## 3. `field_director` → `admin` policy

**Policy (explicit, approved as plan default):**

| Source role | Target `role_id` | Rationale |
|-------------|------------------|-----------|
| `owner` | `owner` | 1:1 |
| `admin` | `admin` | 1:1 |
| `member` | `member` | 1:1 |
| `caller` | `caller` | 1:1 |
| `field_director` | **`admin`** | Privileged MFA tier today (`PRIVILEGED_WORKSPACE_ROLES`); omitted from PRODUCT_ROLE_IDS; never silent drop |
| anything else | **fail import** | Log + abort; no silent `caller` downgrade |

- Preflight Supabase / dump: `SELECT role, count(*) FROM workspace_users GROUP BY 1` — block if unmapped roles or if cutover owner requests per-user exceptions.
- Per-user lower mapping requires cutover-owner sign-off table; default is **all** `field_director` → `admin`.
- After map, MFA privileged set becomes `owner` | `admin` (drop `field_director` from code once no rows remain).
- Capability matrix: mapped `admin` receives admin capabilities (includes `members.invite`); never inherit owner-only `audit.read` via this map.

---

## 4. Import transform changes needed

| Path | Change |
|------|--------|
| [`scripts/schema-transform/README.md`](../../scripts/schema-transform/README.md) | Document new membership step in apply order + cutover blocker status |
| **New** `scripts/schema-transform/11-chs-membership-backfill.sql` (recommended) | Idempotent INSERT into `workspace_member` / role seeds from `workspace_users` with §3 CASE map |
| [`scripts/schema-transform/09-drop-legacy-presence.sql`](../../scripts/schema-transform/09-drop-legacy-presence.sql) | Keep drops commented until Phase D; uncomment `DROP TABLE workspace_users` only after reader switch |
| [`scripts/schema-transform/10-verify.sql`](../../scripts/schema-transform/10-verify.sql) | Add parity assertions: member counts, role histogram, every workspace has ≥1 `owner`, zero unknown `role_id` |
| [`scripts/schema-transform/apply-all.sh`](../../scripts/schema-transform/apply-all.sh) | Include `11-…` when ready; do not auto-run drop step |
| Export/import pipeline docs ([`docs/supabase-postgres-migration-plan.md`](../supabase-postgres-migration-plan.md), cutover runbook) | Final customer import must **emit CHS rows directly** (skip long-lived legacy on target) |
| E2E / seed fixtures | Create `workspace_member` rows once Phase C lands |

Preserve user UUIDs end-to-end (SEC-08): Supabase `auth.users.id` → `auth_user.id` / `public.user.id` → `workspace_member.user_id` (text form of same uuid).

---

## 5. Rollback / resume-Supabase notes

| Stage | Failure mode | Action |
|-------|--------------|--------|
| Phase A DDL on review | Migration fails | Fix forward SQL; do **not** rename applied version prefixes |
| Phase B backfill | Parity fail | Truncate target membership tables; re-run backfill; keep app on `workspace_users` |
| Phase C app deploy | Regressions | Revert app to legacy readers **without** dropping CHS tables; re-enable `workspace_users` writers |
| Pre-traffic cutover gate | Import/parity/smoke fail | **Resume Supabase** as SoT; Railway remains non-customer staging. No mixed production |
| Post first accepted Postgres write | Corruption / auth outage | Roll-forward or Postgres PITR; Supabase retained read-only ≤90 days — never re-open Writable Supabase without a reverse-migration project |

DDL scaffold is reversible by dropping empty CHS tables and renaming enum back **only if** no app readers depend on them — prefer leaving tables in place.

---

## 6. SEC-03 email-first invites (after tables exist)

Attach in a **follow-on PR** once Phase A is on review:

1. Prefer package APIs: `createInvitation`, `resendInvitation`, `cancelInvitation`, `redeemInvitation`, `listPendingInvitations` from `@chester-hill-solutions/auth-postgres`.
2. Replace [`app/lib/invite-user-by-email.server.ts`](../../app/lib/invite-user-by-email.server.ts) writers to insert `workspace_invitation` (normalized email, `role_id`, `token_hash`, expiry); stop requiring pre-existing `user_id`.
3. Replace [`accept-invite`](../../app/routes/accept-invite.action.server.ts) redemption with verified-email match + CAS; insert `workspace_member` in the same transaction (`redeemInvitation`).
4. Gate invite create with `members.invite` + `invitationalRolesFor`; owner never invitational.
5. Magic-link / Better Auth callbacks: new-user vs existing-user; do not store raw tokens.
6. Migrate or abandon outstanding `workspace_invite` rows (email lookup via `public.user`) before dropping the legacy table.
7. Keep current IDOR stopgap until redeem path is live; do not partially wire create/redeem across two tables in production paths.

---

## 7. Open risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **`auth_*` Better Auth vs CHS factory defaults** — CallCaster uses `auth_user` / `auth_session` / … ([`drizzle/0004_better_auth.sql`](../../drizzle/0004_better_auth.sql)); package testing DDL expects `"user"` / `"session"`. | High (auth adopt) | Keep CallCaster-prefixed tables; configure Better Auth `modelName` / schema map; do not blindly apply testing `DDL` user tables |
| **`workspace_member.user_id` still `text` in published package** — CallCaster `public.user.id` / membership historically uuid. | Medium | Store uuid::text; defer package UUID FK upgrade; document until CHS ships uuid column |
| **`workspace.id` uuid vs package text FK** | Medium | Scaffold omits `REFERENCES workspace(id)`; integrity via app + unique (workspace_id, user_id); optional later CHECK/trigger |
| **Enum ↔ table name collision on `workspace_role`** | High if unhandled | Phase A renames enum → `workspace_users_role` before `CREATE TABLE workspace_role` |
| **SEC-07 mid-flight** | Contained | No reader switch in scaffold; matrix over `workspace_users` remains SoT |
| **Legacy plpgsql still casting `::workspace_role`** | Low on Railway app path | Audit JWT claim helpers after rename; fix or drop unused RPCs in later migration |
| **Dual ledger** (`client/migrations` vs `drizzle/`) | Process | Keep mirrored forward files until AUTH_migrations fully adopted on review |
| **`workspace_permissions` legacy table** vs CHS feature permissions | Confusion | Different product; do not confuse RLS-era permissions with `workspace_feature_permission` |

---

## 8. Recommended next implement PRs

1. **This scaffold** — design doc + additive DDL (done / in-flight). Apply on review PG18; verify tables empty + roles seeded.
2. **Hand-sync schema + optional backfill SQL** — `app/db/schema.ts` + `11-chs-membership-backfill.sql` + verify assertions.
3. **Reader/writer cutover** — membership DB accessors, MFA role list, capability SoT optional flip; keep legacy readable.
4. **SEC-03** — email-first invite adopt on CHS tables.
5. **Import pipeline + drop legacy** — transform writes CHS only; Phase D drops.

---

## Success criteria (Wave 1 membership track)

- [x] Written cutover design (this doc)
- [x] Additive DDL scaffold creating CHS tables beside `workspace_users`
- [ ] Review env applies DDL without breaking SEC-07
- [ ] Backfill + parity rehearsal
- [ ] Reader switch PR
- [ ] SEC-03 on `workspace_invitation`
- [ ] Legacy drop after cutover gate
