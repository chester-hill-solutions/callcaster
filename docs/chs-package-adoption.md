# CHS package adoption evaluation (WS-G)

**Date:** 2026-07-14  
**Scope:** Phase 3 planned packages — `jobqueue`, `pg-realtime`, `media-library`, `contact-import`  
**Related:** [AGENT-PLATFORM-GUIDE.md](./AGENT-PLATFORM-GUIDE.md), [phase-3-stack-gap-analysis.md](./phase-3-stack-gap-analysis.md), [remediation/wave0-worker-matrix-2026-07-13.md](./remediation/wave0-worker-matrix-2026-07-13.md)

## Search summary

| Package | `package.json` | `vendor/chester-hill-solutions/` | npm / GitHub Packages |
|---------|:--------------:|:--------------------------------:|:---------------------:|
| `auth` | ✅ vendored | ✅ | — |
| `auth-postgres` | ✅ vendored | ✅ | — |
| `auth-react-router` | ✅ vendored | ✅ | — |
| `scriptkit-call-script-*` | ✅ vendored | — (`vendor/scriptkit/`) | — |
| **`jobqueue`** | ❌ | ❌ | ❌ not published |
| **`pg-realtime`** | ❌ | ❌ | ❌ not published |
| **`media-library`** | ❌ | ❌ | ❌ not published |
| **`contact-import`** | ❌ | ❌ | ❌ not published |

Phase 3 packages are **not available** in this repo or as installable dependencies. Only auth and scriptkit packages are vendored today.

## Current CallCaster implementations

| Concern | Local module(s) | Notes |
|---------|-----------------|-------|
| Job worker | `app/lib/worker/poll-jobs.server.ts`, `worker/index.ts` | `job` table, claim/complete/fail, heartbeat, dead-letter |
| Realtime SSE | `app/lib/workspace-events.server.ts`, `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts` | `workspace_events` + LISTEN/NOTIFY + adaptive poll (ADR-0005) |
| Object storage | `app/lib/object-storage.server.ts` | S3/MinIO with logical buckets (`workspaceAudio`, `messageMedia`, …) |
| Audience / CSV import | `app/lib/audience-upload-process.server.ts`, `app/lib/csv.ts` | Chunked `audience_upload` pipeline, voter-list source normalization |

## Recommendations

### `jobqueue` — **defer; use adapter**

**Recommendation:** Keep the local poller. Do **not** extend bespoke job primitives beyond bugfixes until `@chester-hill-solutions/jobqueue` is published with the approved extension API (claim-token fencing, lease heartbeat, idempotency keys, recurrence, typed registry — see [wave0-worker-matrix](./remediation/wave0-worker-matrix-2026-07-13.md)).

**Risk if we build ahead of the package:** Duplicate job semantics, a second migration from local `job` table handlers, and drift from quick-canvass / other CHS apps.

**Mitigation:** `app/lib/adapters/jobqueue.adapter.server.ts` re-exports `claimJob` / `completeJob` / `failJob` from the local poller. Worker entry (`worker/index.ts`) imports the adapter.

### `pg-realtime` — **defer; keep hand-rolled SSE**

**Recommendation:** Continue using the in-repo SSE stack (`workspace_events`, events loader, NOTIFY channel). The table and route already exist; extracting to `@chester-hill-solutions/pg-realtime` is a publish-and-swap task, not a greenfield build.

**Risk:** Client hook (`useWorkspaceEvents`) and LISTEN listener may diverge from quick-canvass until the package lands.

**Mitigation:** No adapter file yet — the local modules are already the fallback. When the package publishes, replace `workspace-events.server.ts` internals and the events loader with package imports; route URL and auth middleware stay in CallCaster.

### `media-library` — **defer; use adapter**

**Recommendation:** Keep `object-storage.server.ts` as the implementation. Wrap media bucket put/get/sign via `app/lib/adapters/media-library.adapter.server.ts`.

**Risk:** Direct S3 imports scattered across routes make a future package swap noisy.

**Mitigation:** New and migrated media call sites should import `putMediaObject` / `getSignedMediaUrl` from the adapter. `uploadWorkspaceAudioApi` is wired as the first call site.

### `contact-import` — **defer; use adapter**

**Recommendation:** Keep `audience-upload-process.server.ts` and the `audience_upload` table. The CHS package will share parse/map/chunk logic, not table shape (see [archive/opencode-plans/package-extraction.md](../archive/opencode-plans/package-extraction.md)).

**Risk:** Voter-list source aliases and CallCaster-specific column mapping stay product-local even after package adoption.

**Mitigation:** `app/lib/adapters/contact-import.adapter.server.ts` exposes `processContactImport` and `markImportInterruptedIfStale`. Route handlers should migrate imports to the adapter before the package ships.

## Adapter map (swap boundary)

| Adapter | Target package | Wired call site(s) |
|---------|----------------|-------------------|
| `app/lib/adapters/jobqueue.adapter.server.ts` | `@chester-hill-solutions/jobqueue` | `worker/index.ts` |
| `app/lib/adapters/media-library.adapter.server.ts` | `@chester-hill-solutions/media-library` | `app/lib/platform-media.server.ts` (`uploadWorkspaceAudioApi`) |
| `app/lib/adapters/contact-import.adapter.server.ts` | `@chester-hill-solutions/contact-import` | *(ready; routes still import process module directly)* |

## Adoption sequence (when packages publish)

1. Add package to `package.json` (or vendor under `vendor/chester-hill-solutions/`).
2. Replace adapter re-exports with package imports; run `npm run ci:local`.
3. Delete redundant local code only after parity tests pass (worker lifecycle, SSE resume, media upload, audience import).
4. Update this doc — move row from **defer** to **adopted**.

## Already adopted (reference)

| Package | Status |
|---------|--------|
| `@chester-hill-solutions/auth` | Vendored; gradual route migration |
| `@chester-hill-solutions/auth-postgres` | Vendored |
| `@chester-hill-solutions/auth-react-router` | Vendored; `auth-layout.server.ts` bridge until RR guards install cleanly |
| `@chester-hill-solutions/scriptkit-call-script-core` | Vendored |
| `@chester-hill-solutions/scriptkit-call-script-react` | Vendored |
