# Archived Supabase migrations (reference only)

Copies of `supabase/migrations/` as of **2026-06-29**, after Phase 1 schema transform on Railway review.

- **Do not apply** these to Railway review — schema is now defined by [`drizzle/0000_baseline.sql`](../../drizzle/0000_baseline.sql) + forward `drizzle-kit generate`.
- **Hosted Supabase prod** still uses the live `supabase/migrations/` folder until big-bang cutover (schema frozen).
- Forward DDL: `drizzle-kit generate` only.

See [`docs/supabase-postgres-migration-plan.md`](../supabase-postgres-migration-plan.md).
