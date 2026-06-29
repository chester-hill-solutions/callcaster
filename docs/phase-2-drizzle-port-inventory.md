# Phase 2 — Drizzle port inventory

**Goal:** All tenant data via `createTenantDb`; delete `app/lib/database.types.ts`.  
**Plan:** [`supabase-postgres-migration-plan.md`](./supabase-postgres-migration-plan.md) Phase 2  
**Updated:** 2026-06-29

## Summary metrics

| Metric | Count |
|--------|------:|
| App files importing `database.types` | **166** |
| App files with literal `supabase.from()` | **13** (24 calls) |
| Route files with literal `supabase.from()` | **7** (12 calls) |
| `app/lib/database/*.server.ts` using `SupabaseClient` | **11** of 13 |
| Production `createTenantDb` call sites | **0** |

## `database.types` imports by directory

| Directory | Files |
|-----------|------:|
| `app/lib/` | 73 |
| `app/routes/` | 65 |
| `app/components/` | 20 |
| `app/hooks/` | 7 |
| `app/root.tsx` | 1 |

## `app/lib/database/*.server.ts` modules

| File | Lines | SupabaseClient | Port priority |
|------|------:|:--------------:|:-------------:|
| `workspace.server.ts` | 873 | Yes | **1** |
| `campaign.server.ts` | 557 | Yes | **2** |
| `campaign-stats.server.ts` | 371 | Yes | **2** |
| `workspace-twilio-config.server.ts` | 379 | Yes | 8 |
| `workspace-conversations.server.ts` | 367 | Yes | 5 |
| `workspace-twilio-sync.server.ts` | 277 | Yes | 8 |
| `workspace-twilio-portal-snapshot.server.ts` | 221 | Yes | 8 |
| `contact.server.ts` | 285 | Yes | **4** |
| `stripe.server.ts` | 96 | Yes | **6** |
| `workspace-media.server.ts` | 70 | Yes | 5 (ties to 3E) |
| `contact-audience.server.ts` | 56 | Yes | **4** |
| `workspace-twilio-recommendations.server.ts` | 196 | No | N/A |
| `workspace-twilio.server.ts` | 27 | No | barrel |

Also: `app/lib/database.server.ts` (~467 lines) — barrel; port after modules.

## Recommended port order

1. `workspace.server.ts` — foundation
2. `campaign.server.ts` + `campaign-stats.server.ts`
3. Queue/dial: `auto-dial.server.ts`, `call-screen.server.ts`, `ivr-initiate.server.ts`, `queue-status.ts`
4. Contacts: `contact.server.ts`, `contact-audience.server.ts`, audience upload helpers
5. Messaging: `workspace-conversations.server.ts`, `chat-sms.server.ts`, `sms-send.server.ts`
6. Billing: `transaction-history.server.ts`, `stripe.server.ts`, reconciliation modules
7. Telephony adjunct: `agent-status.server.ts`, handset, inbound queue
8. Twilio config split modules
9. Platform facades (`platform-data.server.ts` ~39 `.from(` calls)
10. Admin (`admin-db.ts` only for cross-workspace)
11. Route stragglers (7 + 5 files)
12. UI/hooks type cleanup (27 files)

**Exit:** delete `database.types.ts`; zero PostgREST `.from()` in `app/`.

## Route stragglers (literal `supabase.from()`)

| File | Calls |
|------|------:|
| `api+/auto-dial/$roomId.action.server.ts` | 4 |
| `api+/dial.action.server.ts` | 2 |
| `api+/inbound-sms.action.server.ts` | 2 |
| `api+/auto-dial.action.server.ts` | 1 |
| `api+/ivr/.../response.action.server.ts` | 1 |
| `api+/media.action.server.ts` | 1 |
| `api+/ivr.action.server.ts` | 1 |

## Per-module checklist template

Use in PR descriptions:

- [ ] Replace `SupabaseClient` param with `createTenantDb(workspaceId)` or accept `TenantDb`
- [ ] Replace `.from()` with `tdb.<table>.findMany|findFirst|insert|update|delete`
- [ ] RPCs → `app/server/rpc/` typed wrappers + `withAppCurrentUser` where needed
- [ ] Update callers to pass `tdb` or `workspaceId`
- [ ] PGlite or integration test added/updated
- [ ] Remove `database.types` imports from module + callers
