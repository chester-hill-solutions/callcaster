# Shed Supabase-the-product, keep Postgres on Railway

Postgres-the-database stays, hosted on Railway (branchable for cutover rehearsal). Every Supabase-product surface is shed: Auth, Realtime, Storage, Edge Functions, RLS, pg_cron, table triggers, the Supabase JS client (`@supabase/supabase-js`, `@supabase/ssr`), and the 3,093-line `database.types.ts` (173 files import it). Adopt Drizzle + Better Auth + S3-compatible storage (Railway Buckets) from existing `@chester-hill-solutions/*` packages. Fixes the debt of excessive DB-side magic, low type adoption, and unwieldy tables.

## Considered Options

- **Drop Postgres too** — multi-quarter rewrite; all chs packages are Postgres-based, so this contradicts the "reuse our packages" direction.
- **Keep Supabase Postgres hosting** — keeps a Supabase dependency the operator wants gone.

## References

- `package.json:56` (`@electric-sql/pglite` — phantom dep, used nowhere), `package.json:73-74` (`@supabase/ssr`, `@supabase/supabase-js`)
- `supabase/config.toml` (Edge functions config), `app/lib/database.types.ts` (3093 lines)
- chs `packages/auth-postgres/` (Better Auth + Drizzle, ready), chs `packages/cms-store-postgres/` (S3-compatible storage pattern)
