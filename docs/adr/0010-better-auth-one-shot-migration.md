# One-shot auth migration to Better Auth; keep custom API key auth

All users are exported from Supabase `auth.users` (emails + bcrypt password hashes + metadata) and imported into Better Auth Drizzle tables (per `@chester-hill-solutions/auth-postgres` schema), preserving bcrypt hashes so users don't reset passwords. Cut over in one deploy: swap `verifyAuth` to Better Auth's `createSessionReader`, swap the session cookie, remove Supabase Auth calls. All existing sessions invalidate — users re-login once with the same credentials. 2FA is enforced for voter-data-accessing roles (owner, admin, field_director) per the campaign information security baseline. A `databaseHooks.user.create.after` hook creates a `profiles` row on signup (profiles are not managed by Better Auth). Better Auth session cookies rotate on `updateAge` (5 min) — every loader/action that calls `auth.api.getSession({returnHeaders: true})` must merge headers via `mergeBetterAuthSetCookieHeaders`. Custom API key auth (sha256 + `timingSafeEqual`, workspace-scoped via `workspace_api_key` table) stays — Better Auth's API key plugin is user-scoped, not workspace-scoped, so it would require layering workspace logic on top anyway. The `test/api-auth.test.ts` suite stays.

## Considered Options

- **Dual-auth period** — per-request complexity for weeks to avoid one re-login; bad trade for B2B.
- **Adopt Better Auth API key plugin** — user-scoped, loses workspace scoping + existing test coverage.
- **Keep Supabase Auth permanently** — contradicts "no Supabase whatsoever."

## References

- `app/lib/platform-auth.server.ts:55,100,189,208` (Supabase auth calls), `app/lib/api-auth.server.ts:5-18` (sha256 + timingSafeEqual — stays)
- chs `packages/auth-postgres/` (Better Auth factory, session reader, Drizzle schema, magicLink plugin), chs `packages/auth-react-router/` (`createRequireSessionUserId`, `createAuthLayoutLoader`)
- quick-canvass `app/server/auth-instance.ts` (Better Auth config), `app/db/auth-schema.ts` (Drizzle auth tables), `app/lib/better-auth-headers.server.ts` (Set-Cookie merging)
