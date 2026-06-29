# Phase 3 — Staging stack gap analysis

**Goal:** Better Auth, SSE, worker, Bun webhooks, Buckets, Bun runtime on Railway review.  
**Plan:** [`supabase-postgres-migration-plan.md`](./supabase-postgres-migration-plan.md) Phase 3  
**Updated:** 2026-06-29

## Summary matrix

| Track | Status | First file to touch | Blocks gate? |
|-------|--------|---------------------|:------------:|
| 3A Better Auth | Not started | `app/server/auth-instance.ts` (create) | Yes |
| 3B SSE realtime | Not started | `app/db/schema.ts` — `workspace_events` | Yes |
| 3C Job worker | Not started | `app/db/schema.ts` — `job` table | Yes |
| 3D Edge → Bun | Partial | `app/routes/api+/sms/status.action.server.ts` | Yes |
| 3E Storage | Not started | `app/lib/database/workspace-media.server.ts` | **Hard gate** |
| 3F Bun runtime | Not started | `package.json` start script | Yes |

## 3A — Better Auth

**Exists:** Supabase auth in `supabase.server.ts`, `platform-auth.server.ts`, ~100+ route usages, API keys in `api-auth.server.ts`, ADR-0010.

**Missing:** CHS auth packages, `auth-schema.ts`, `auth-instance.ts`, bcrypt user import, 2FA.

**Packages to add:** `@chester-hill-solutions/auth`, `auth-postgres`, `auth-react-router`, `better-auth`.

## 3B — SSE realtime

**Exists:** `useSupabaseRoom`, `useSupabaseRealtime`, `useChatRealtime`; `agent_status` tables.

**Missing:** `workspace_events`, `workspace_activity_log`, SSE route, `@chester-hill-solutions/pg-realtime`, LISTEN/NOTIFY.

**Prerequisite:** Drop `user.activity` / `workspace.users` (Phase 1 step 09).

## 3C — Job worker

**Exists:** pg_cron migrations → Edge (`twilio-open-sync`, `number-rental-billing`, `twilio-billing-reconcile`); Edge queue/upload fns; Deno tests.

**Missing:** `job` table, Bun worker service, processor registry, HTTP wake, `Dockerfile.worker`.

**Must complete before Phase 4:** all 3 pg_cron jobs replaced.

## 3D — Edge → Bun (P0 webhooks)

| Function | Edge | App route | Notes |
|----------|:----:|:---------:|-------|
| `ivr-flow` | Yes | Partial Remix | `TWILIO_IVR_RUNTIME` switch |
| `ivr-status` | Yes | Legacy Remix | |
| `ivr-recording` | Yes | Stub `/api/recording` | |
| `sms-status` | **Canonical** | Legacy shim | Promote Remix + merge Edge logic |
| `acd-router` | Yes | **None** | New route required |

**First merge target:** `sms/status.action.server.ts` + `chat-sms.server.ts` callback URLs.

## 3E — Storage

**Exists:** Supabase Storage in ~15+ sites; MinIO in `docker-compose.dev.yml` (unwired).

**Missing:** S3 adapter, bulk copy script, DB URL rewrite, local MinIO wiring.

**Gate:** flip blocked until staging copy verified.

## 3F — Bun runtime

**Exists:** Express `server/index.js`, Node Dockerfile, buffer-polyfill build.

**Target:** `bun react-router-serve ./build/server/index.js`, `oven/bun` Dockerfile.

## Parallelism

- **3C + 3D** can run parallel with Phase 2 once schema stable.
- **3A** needs auth schema in baseline.
- **3E** is independent bulk work — start copy script early on staging buckets.
