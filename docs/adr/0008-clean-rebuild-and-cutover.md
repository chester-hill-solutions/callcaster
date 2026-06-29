> **Superseded (2026-06-29):** In-place big-bang on `callcaster/` per [`supabase-postgres-migration-plan.md`](../supabase-postgres-migration-plan.md). The `callcaster-v2` fork narrative below is **deprecated** — retained for historical context until Phase 6 revises this ADR.

# Clean rebuild in callcaster-v2, one-shot cutover

v2 is built clean in the `callcaster-v2` repo (fresh start from the React Router 8 template, zero Supabase code from day one). Live v1 continues running on Supabase until v2 is ready. One maintenance-window cutover: export Supabase Postgres → transform (drop vestigial tables, consolidate campaign types, SID→ID, normalize queue status, add domain columns, create household table, normalize twilio_data) → import to Railway Postgres → run Drizzle migrations → create Better Auth users (bcrypt preservation) → repoint Twilio webhook URLs → DNS switch. v1 stays running as fallback. Full feature parity required (drop RCS only, which is already feature-flagged off). The `callcaster-v2` repo is currently a bare RR7 template — it gets upgraded to RR8 and built from scratch.

## Build order (11 phases)

1. **Schema** — MCP-aided Drizzle schema generation from live Supabase Postgres, with all pruning + domain columns
2. **Auth** — Better Auth + Drizzle adapter + 2FA for voter-data roles + `ensureProfileForUser` hook
3. **Data layer** — Drizzle repos, scoped tenant client, `withAppCurrentUser`, `requireWorkspaceAccess`
4. **Worker + job table** — `@chs/job-worker`, HTTP wake, all job handlers (exports, audience-upload, reconciliation, open-sync, number-rental-billing, campaign-dispatch, queue-next)
5. **Realtime** — `@chs/pg-realtime`, SSE route, workspace_events, LISTEN/NOTIFY
6. **Twilio routes** — all webhook handlers, signature validation, IVR, ACD, recording, voicemail, caller-id
7. **API routes** — public API (integrator endpoints, doc-first OpenAPI, API key auth), platform API
8. **UI routes** — workspace shell, campaigns, call screen + softphone (17 hooks), chats, analytics, admin portal, onboarding, settings, survey (inline, minimal coupling)
9. **Tests** — PGlite per file (replaces 53 PostgREST mock factories with real DB queries), Vitest node + ui, E2E with Playwright
10. **Deployment** — Dockerfile (web) + Dockerfile.worker + railway.web.toml + railway.worker.toml + Railway Postgres + Railway Buckets
11. **Cutover** — data migration script, user migration, Twilio repoint, DNS switch, maintenance window

## Cutover plan

1. Export Supabase Postgres (`pg_dump`)
2. Transform: drop vestigial tables, consolidate campaign types, SID→ID, normalize queue status, add domain columns, create household table, normalize twilio_data to typed tables
3. Import to Railway Postgres
4. Run Drizzle migrations
5. Create Better Auth users (bcrypt hash preservation from Supabase `auth.users`)
6. Repoint Twilio webhook URLs (`${SUPABASE_URL}/functions/v1/*` → `${BASE_URL}/api/*`)
7. DNS switch (callcaster domain → v2 Railway service)
8. v1 stays running as fallback; if v2 breaks, repoint DNS/Twilio back

Rehearse the cutover on a Railway branch environment first (full-data copy). Maintenance window: Sunday 2-6am EST.

## Considered Options

- **Strangler-fig on live app** — incremental, lower risk, but you're in a "chance to do everything perfectly" window and want zero Supabase code from day one.
- **Fork of callcaster** — keeps git history but starts with a deletion exercise instead of writing code.

## References

- `callcaster-v2/` (bare RR7 template, upgrade to RR8), quick-canvass as reference implementation for every pattern
- `supabase/migrations/` (27 migrations — frozen as baseline, transformed during cutover)
- `app/lib/database.types.ts` (3093 lines, 173 importing files — not copied to v2)
