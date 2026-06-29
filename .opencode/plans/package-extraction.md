# Package extraction — 2+ consumers rule

## Confirmed extractions (5 packages)

All 5 are used by both CallCaster v2 and quick-canvass. Extract to `@chester-hill-solutions/*` packages, contribute back to the chs monorepo.

### 1. @chs/pg-realtime
**What:** SSE event stream + `workspace_events` table schema + Postgres LISTEN/NOTIFY listener + cursor resume via Last-Event-ID + EventSource client hook + adaptive poll fallback.
**Source:** quick-canvass `app/features/workspace-events/` (client) + `app/server/workspace-events-stream.server.ts` (server) + `app/server/workspace-events-listen.server.ts` (NOTIFY) + `app/db/schema.ts` (`workspaceEvents` table).
**Consumers:** quick-canvass (has it), CallCaster v2 (needs it per ADR-0005).
**ADR impact:** ADR-0005 already proposes this. Add note: "Extracted from quick-canvass proven pattern; both apps consume."

### 2. @chs/job-worker
**What:** `backgroundJobs` table schema + `buildJobIdempotencyKey` (SHA-256 hash of type+workspaceId+payload) + `queueBackgroundJob` (enqueue with idempotency) + `processBackgroundJobByName` (type-dispatched handler registry) + `job-worker.ts` (claim loop) + `job-worker-http.server.ts` (HTTP wake server with `/internal/jobs/wake` + `/health`) + `worker-wake.server.ts` (debounced wake trigger) + `job-policy.server.ts` (per-type authorization).
**Source:** quick-canvass `app/server/job-enqueue.server.ts`, `job-processor.ts`, `job-worker.ts`, `job-worker-http.server.ts`, `worker-wake.server.ts`, `job-policy.server.ts`, `jobs.ts`, `app/db/schema.ts` (`backgroundJobs` table). Plus `packages/worker/` (worker build entry point + Dockerfile.worker).
**Consumers:** quick-canvass (has it), CallCaster v2 (needs it per ADR-0007).
**CallCaster addition:** `claimed_until` timestamptz for ACD/predictive time-sensitive claims (superset of quick-canvass's status-only pattern).
**ADR impact:** ADR-0007 revised to use this package. The HTTP wake pattern (not LISTEN/NOTIFY) is the proven approach.

### 3. @chs/workspace-schema
**What:** Shared Drizzle schema definitions for the 6 tables every chs Postgres app needs:
- `workspaces` (base: id, name, status, ownerId, createdAt, updatedAt — app-specific columns via extension)
- `workspaceMembers` (id, workspaceId, userId, role, createdAt — role enum is app-specific: CallCaster uses owner/admin/member/caller, quick-canvass uses admin/organizer/canvasser)
- `workspaceMemberInvites` (id, workspaceId, email, role, status, createdAt)
- `workspaceEvents` (id, workspaceId, kind, payload, createdAt)
- `workspaceActivityLog` (id, workspaceId, actorUserId, action, entityType, entityId, metadata, source, createdAt)
- `backgroundJobs` (id, type, status, payload, workspaceId, userId, idempotencyKey, error, result, createdAt, updatedAt + CallCaster's `claimed_until`)

**Source:** quick-canvass `app/db/schema.ts` (lines 109-235) + `app/db/auth-schema.ts`.
**Consumers:** quick-canvass (has them), CallCaster v2 (needs them), any future chs Postgres app.
**Extension pattern:** App-specific columns (CallCaster's `credits`, `twilio_data`, `stripe_id`, `key`, `token`; quick-canvass's `defaultCity`, `defaultProvince`, `walkInviteLandingEnabled`, `canvassSwipeQuickActions`, `deletionScheduledAt`) are added via Drizzle's `.$extend()` or by composing the base table with app-specific columns in the app's own schema.
**Role enum:** Package exports a `workspaceRoleEnum` factory that takes the app's role values. CallCaster: `["owner", "admin", "member", "caller"]`. quick-canvass: `["admin", "organizer", "canvasser"]`.
**ADR impact:** ADR-0003 (Drizzle) and ADR-0008 (strangler-fig) reference this package for the shared schema base.

### 4. @chs/csv-import
**What:** CSV parsing utilities + column mapping presets + chunked processing pipeline + import status tracking + formula injection protection (CSV injection guard).
**Source:** quick-canvass `app/features/import/csv.ts` (parsing) + `app/features/import/contact-import-wizard.schema.ts` (column mapping) + `app/server/job-handlers/process-contact-import.server.ts` (chunked processing) + `app/db/schema.ts` (`contactImportProfiles`, `contactImports`, `contactImportErrors` tables). CallCaster: `app/lib/csv.ts` (CSV utils with injection protection) + `app/lib/audience-upload-process.server.ts` (chunked processing) + `audience_upload` table.
**Consumers:** quick-canvass (has it), CallCaster (has it, different table shape).
**What to extract:** The shared pipeline logic (parse → map columns → chunk → insert → track status → report errors). NOT the tables — table shapes differ. The package provides: `parseCsvText()`, `escapeCsvCell()` / `protectFromInjection()`, column mapping types, chunked insert helper, import status enum.
**ADR impact:** ADR-0007 (worker) — the audience-upload job uses this package for CSV processing.

### 5. @chs/household
**What:** `households` table schema (base: id, workspaceId, householdKey, address components, createdAt, updatedAt) + household key generation (deterministic from address) + address normalization + household-to-contacts relationship pattern.
**Source:** quick-canvass `app/db/schema.ts` (lines 312-340) — full `households` pgTable with geocode/ward. CallCaster v2 needs households per ADR-0021.
**Consumers:** quick-canvass (has it with geocode/ward), CallCaster v2 (needs it with phone/voter fields).
**Extension pattern:** Base `households` table (id, workspaceId, householdKey, originalAddress, houseNumber, unitNumber, street, city, province, postalCode, createdAt, updatedAt). App-specific columns via extension:
- quick-canvass: `wardNumber`, `importLatitude/Longitude`, `location` (PostGIS), `geocodeStatus`, `geocodeMetadata`
- CallCaster: `phone` (primary household phone), `doNotKnock`, `doNotCall`, `lastContactedAt`
**ADR impact:** ADR-0021 (household as domain entity) references this package.

## NOT extracted (1 consumer only)

These stay in CallCaster's `shared/` directory (repo-local, not packages):

| What | Why not extract |
|---|---|
| Twilio webhook validation (`twilio-webhook.server.ts`) | CallCaster only — quick-canvass doesn't use Twilio |
| Twilio workspace credentials (`twilio-workspace-credentials.ts`) | CallCaster only |
| SMS/IVR status logic (`sms-status-logic.ts`, `ivr-status-logic.ts`) | CallCaster only |
| Campaign dispatch (`campaign-dispatch.ts`) | CallCaster only |
| ACD router (`acd-router.ts`, `acd-utils.ts`) | CallCaster only |
| Queue policy (`queue-policy.ts`) | CallCaster only |
| Throughput config (`throughput-config.ts`) | CallCaster only |
| Pricing/billing/credits/ledger (`pricing.ts`, `campaign-billing.ts`, `billing-reconciliation.ts`) | CallCaster only — quick-canvass doesn't bill |
| Script engine runtime (TwiML rendering) | CallCaster only — quick-canvass uses scriptkit for door scripts, not IVR |
| Caller ID verification | CallCaster only |
| Number rental billing | CallCaster only |

## ADR count update

The extraction doesn't add new ADRs — it modifies existing ones:
- ADR-0005 → references `@chs/pg-realtime` (already proposed)
- ADR-0007 → references `@chs/job-worker` (revised from LISTEN/NOTIFY to HTTP wake)
- ADR-0003 → references `@chs/workspace-schema` for shared table base
- ADR-0021 → references `@chs/household` for household entity schema
- ADR-0008 → mentions all 5 packages as part of the strangler-fig migration (extract as you adopt)

**Total remains: 25 ADRs + CONTEXT.md.** The extractions are implementation details within existing ADRs, not separate decisions.

## Strangler-fig extraction order

The 5 packages should be extracted in this order during the strangler-fig:

1. **@chs/workspace-schema** (step 2 — Drizzle adoption) — needed first, the schema base
2. **@chs/pg-realtime** (step 3 — pg-realtime) — extract from quick-canvass, both apps consume
3. **@chs/job-worker** (step 1 — worker + job table) — extract from quick-canvass, CallCaster adopts
4. **@chs/csv-import** (step 1 or 2 — when audience-upload moves to worker) — extract shared CSV utils
5. **@chs/household** (step 2 — Drizzle adoption, or when household entity is added) — extract from quick-canvass, CallCaster adopts with phone/voter extensions

## Package dependency graph

```
@chs/workspace-schema
  ├── @chs/auth-postgres (user table from auth-schema)
  └── drizzle-orm

@chs/pg-realtime
  ├── @chs/workspace-schema (workspaceEvents table)
  ├── drizzle-orm
  └── react (for the EventSource client hook)

@chs/job-worker
  ├── @chs/workspace-schema (backgroundJobs table)
  ├── drizzle-orm
  └── postgres (for the worker's DB connection)

@chs/csv-import
  ├── csv-parse (or built-in)
  └── drizzle-orm (for status tracking types)

@chs/household
  ├── @chs/workspace-schema (workspaceId FK)
  └── drizzle-orm
```
