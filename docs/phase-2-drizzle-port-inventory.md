# Phase 2 — Drizzle port inventory

**Goal:** All tenant data via `createTenantDb`; delete `app/lib/database.types.ts`.  
**Plan:** [`supabase-postgres-migration-plan.md`](./supabase-postgres-migration-plan.md) Phase 2  
**Updated:** 2026-06-29 (queue + survey ports)

## Summary metrics

| Metric | Count |
|--------|------:|
| PostgREST `.from("…")` call sites in `app/` | **308** |
| App files with PostgREST `.from("…")` | **122** |
| App files importing `database.types` | **162** |
| `app/lib/database/*.server.ts` using `createTenantDb` | **8** of 13 |
| Server `campaign_queue` PostgREST reads/writes | **0** (Drizzle via `campaign-queue-db.server.ts`; realtime hook only) |
| Survey route PostgREST | **2 stragglers** (`settings.loader`, `platform-analytics`) |

## `database.types` imports by directory

| Directory | Files |
|-----------|------:|
| `app/lib/` | ~73 |
| `app/routes/` | ~65 |
| `app/components/` | ~20 |
| `app/hooks/` | ~7 |
| `app/root.tsx` | 1 |

## `app/lib/database/*.server.ts` modules

| File | Status | Notes |
|------|--------|-------|
| `workspace.server.ts` | **Done** | tenant-db; Supabase for auth + RPCs |
| `campaign.server.ts` | **Done** | tenant-db |
| `campaign-stats.server.ts` | **Done** | tenant-db queue counts; RPC `get_campaign_stats` only |
| `contact.server.ts` | **Done** | tenant-db |
| `contact-audience.server.ts` | **Done** | tenant-db |
| `stripe.server.ts` | **Done** | tenant-db |
| `workspace-conversations.server.ts` | **Done** | tenant-db for reads |
| `workspace-twilio-portal-snapshot.server.ts` | **Partial** | tenant-db + Supabase callers |
| `workspace-twilio-config.server.ts` | Todo | Supabase |
| `workspace-twilio-sync.server.ts` | Todo | Supabase |
| `workspace-media.server.ts` | Todo | Supabase (ties to 3E storage) |
| `workspace-twilio-recommendations.server.ts` | N/A | No SupabaseClient |
| `workspace-twilio.server.ts` | N/A | barrel |

Also: `app/lib/database.server.ts` — barrel; port after modules.

## Sprint 2 helpers (reuse for remaining ports)

| Module | Role |
|--------|------|
| [`telephony-db.server.ts`](../app/lib/telephony-db.server.ts) | Unscoped `call` lookup; scoped call/outreach writes |
| [`survey-db.server.ts`](../app/lib/survey-db.server.ts) | Survey CRUD, public taker, response/answer upserts |
| [`campaign-queue-db.server.ts`](../app/lib/campaign-queue-db.server.ts) | Drizzle `campaign_queue` reads/writes |
| [`campaign-queue-search.server.ts`](../app/lib/campaign-queue-search.server.ts) | Queue list/filter/count for platform API |
| [`contacts/search.server.ts`](../app/lib/contacts/search.server.ts) | Shared contact search `where` builders |

## Port order (status)

| Step | Scope | Status |
|------|-------|--------|
| 1 | `workspace.server.ts` | **Done** |
| 2 | `campaign.server.ts` + `campaign-stats.server.ts` | **Done** |
| 3 | Queue/dial stack + `campaign-queue-db` | **Done** |
| 4 | Contacts + audiences | **Done** |
| 5 | Messaging + chats | **Done** |
| 6 | Billing + ledger | **Partial** — reconciliation on tenant-db; transaction-history RPC wrappers remain |
| 7 | Telephony adjunct | Todo — `agent-status`, handset, inbound queue |
| 8 | Twilio config modules | **Partial** — merge/config/snapshot on Drizzle; sync module remains |
| 9 | Platform facades | **Done** — `platform-data.server.ts`; Supabase storage for audience-upload download only |
| 10 | Route stragglers (queue + survey) | **Done** — survey stragglers below |
| 11 | Platform/admin bulk | Todo — see hotspots |
| 12 | UI/hooks type cleanup | Todo |
| 13 | Delete `database.types.ts` | Todo |

**Exit:** delete `database.types.ts`; zero PostgREST `.from("…")` in `app/`.

## Remaining PostgREST hotspots (by call count)

| File | Calls | Module |
|------|------:|--------|
| `app/lib/platform-admin.server.ts` | 17 | 2.9 / admin bulk |
| `app/lib/platform-members.server.ts` | 12 | 2.9 / admin bulk |
| `app/lib/workspace-settings/WorkspaceSettingUtils.server.ts` | 11 | workspace settings |
| `app/lib/audience-upload-process.server.ts` | 8 | audience upload |
| `app/lib/agent-status.server.ts` | 5 | **2.7** telephony adjunct |
| `app/routes/workspaces+/$id/settings/queues.*` | 8 | **2.7** inbound queue |
| `app/routes/workspaces+/$id/campaigns/$selected_id/settings.loader.server.ts` | 5 | survey straggler |
| `app/lib/platform-analytics.server.ts` | 4 | survey straggler |
| Admin routes (`admin+/…`) | ~30+ | admin bulk |

**Realtime-only `campaign_queue`:** [`useSupabaseRealtime.ts`](../app/hooks/realtime/useSupabaseRealtime.ts) — Phase 3B SSE.

## Per-module checklist template

Use in PR descriptions:

- [ ] Replace `SupabaseClient` param with `createTenantDb(workspaceId)` or accept `TenantDb`
- [ ] Replace `.from("…")` with `tdb.<table>.findMany|findFirst|insert|update|delete` or shared helper
- [ ] RPCs → `app/server/rpc/` typed wrappers + `withAppCurrentUser` where needed
- [ ] Update callers to pass `tdb` or `workspaceId`
- [ ] PGlite or integration test added/updated
- [ ] Remove `database.types` imports from module + callers
