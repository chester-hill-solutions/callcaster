# Scoped Drizzle client, no RLS

`createTenantDb(workspaceId)` returns a Drizzle instance where every table with a `workspace` column is auto-scoped on every query. A separate admin client exists for cross-workspace ops (worker, cron, billing reconcile). `requireWorkspaceAccess` stays as the membership/role gate. The scoped client is the only exported tenant-data accessor for route code; the admin client is not importable from routes (separate module boundary). No RLS — testable, explicit, no Supabase magic. `withAppCurrentUser(userId, fn)` runs `fn` inside a `sql.begin()` transaction with `app.current_user_id` set via `set_config(..., true)` (transaction-local) so SECURITY DEFINER RPCs see the actor. Non-members get a uniform 404 (not 403) to reduce workspace ID inference.

## Considered Options

- **Keep RLS on raw Postgres** — conflicts with shedding magic; hard to test (existing test suite only tests the app-layer gate, not RLS).
- **App-layer only, no structural enforcement** — a single forgotten `.where(eq(workspace, id))` = cross-tenant leak with no backstop.

## References

- `app/lib/database/workspace.server.ts` (existing `requireWorkspaceAccess`), `test/authz.test.ts` (existing authz tests to extend)
- quick-canvass `app/server/workspace-access.server.ts` (uniform-404, `requireWorkspaceOrganizerForUser`, `resolveOrganizerAccess` soft gate), `app/server/db.ts` (`withAppCurrentUser`)
