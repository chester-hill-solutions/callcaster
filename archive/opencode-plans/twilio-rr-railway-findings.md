# Twilio/RR/Railway doc analysis — plan revisions

## Summary

Read all Twilio docs (runtime inventory, callback maps, webhook auth, credential hardening), Railway docs (Dockerfile, quick-canvass DEPLOY.md, railway configs), and React Router configs (CallCaster + quick-canvass). These findings revise 3 ADRs and add implementation detail to 2 more.

## Revision 1: ADR-0001 — react-router-serve under Bun (not custom Bun.serve)

**Original proposal:** Write a custom `Bun.serve` handler replacing Express.
**Revised:** Drop the custom server entirely. Use `react-router-serve` (the standard RR7 server) running under Bun.

**Why:** quick-canvass (reference implementation) uses `react-router-serve` on Node 26 — no custom server. CallCaster's 277-line custom Express server (`server/index.js`) is an outlier. `react-router-serve` handles healthchecks, graceful shutdown, static serving. Bun provides the performance (faster HTTP, native Buffer, native TS). No custom server code to maintain.

**Concrete change:**
- `package.json` `start` script: `"start": "bun react-router-serve ./build/server/index.js"` (or `bun run start` if react-router-serve is in the path)
- Delete `server/index.js` (277 lines)
- Drop deps: `express`, `compression`, `cookie-parser`, `morgan`, `@react-router/express`, `tsx`
- Drop `buffer-polyfill` client + `build:buffer-polyfill` script (Bun has Buffer natively)
- Keep `@react-router/node` (needed by `entry.server.tsx` for `createReadableStreamFromReadable`)
- `react-router.config.ts`: adopt future flags from quick-canvass (`v8_viteEnvironmentApi`, `v8_middleware`, `v8_passThroughRequests`, `v8_trailingSlashAwareDataRequests`)
- `vite.config.ts`: the custom `resolveAppModuleSuffix` plugin may be replaceable by tsconfigPaths + RR7's built-in suffix resolution — verify during implementation

**Healthcheck:** `react-router-serve` serves the app at `/`; Railway's `healthcheckPath = "/"` works. For `/healthz`/`/readyz` specifically, add a simple route or middleware if Railway needs a dedicated probe path.

## Revision 2: ADR-0007 — HTTP wake instead of LISTEN/NOTIFY

**Original proposal:** LISTEN/NOTIFY bridge for event-driven job enqueue.
**Revised:** Use quick-canvass's private HTTP wake pattern.

**Why:** LISTEN/NOTIFY requires either DB triggers (banned by ADR-0006) or app-layer `pg_notify()` calls. HTTP wake is simpler, proven in production, and doesn't touch the DB at all. The web service sends `POST /internal/jobs/wake` with bearer auth to the worker service.

**Concrete architecture (from quick-canvass):**

Web service:
- `triggerWorkerWake()` — fire-and-forget `fetch(WORKER_WAKE_URL, { method: "POST", headers: { Authorization: `Bearer ${WORKER_WAKE_SECRET}` } })`
- Debounced (10s) to prevent wake storms
- Called after every `queueBackgroundJob()` insert
- Env vars: `WORKER_WAKE_URL`, `WORKER_WAKE_SECRET`

Worker service:
- HTTP server on port 8080 (`job-worker-http.server.ts`)
- `POST /internal/jobs/wake` → triggers `drainQueuedJobsOnce()` (auth: bearer secret)
- `GET /health` → healthcheck
- Two modes: `JOB_WORKER_MODE=server` (HTTP wake listener) or `JOB_WORKER_MODE=drain` (cron fallback every 15 min)
- `WORKER_FALLBACK_DRAIN_INTERVAL_MS=900000` (15 min fallback)

Railway:
- `railway.worker.toml`: `startCommand = "node build/job-worker/index.js"`, `healthcheckPath = "/health"`, `restartPolicyType = "ON_FAILURE"`
- `watchPatterns` to only rebuild worker when relevant files change

Job table (from quick-canvass `backgroundJobs`):
- `id` uuid PK, `type` text, `status` text (default "queued"), `payload` jsonb, `workspaceId` uuid FK, `userId` uuid FK, `idempotencyKey` text, `error` text, `result` jsonb, `createdAt`/`updatedAt` timestamps
- Idempotency: `buildJobIdempotencyKey({type, workspaceId, payload})` = SHA-256 hash → deterministic key
- **CallCaster addition:** `claimed_until` timestamptz (nullable) for ACD/predictive time-sensitive claims — superset of quick-canvass's status-only pattern

## Revision 3: ADR-0009 — callback map as migration checklist

The Twilio callback map (`docs/twilio-canonical-callback-map.md`) is the concrete migration checklist. Today: two URL bases. v2: one URL base.

| Today (Edge) | v2 (Bun) | Route exists? |
|---|---|---|
| `${SUPABASE_URL}/functions/v1/sms-status` | `${BASE_URL}/api/sms/status` | Yes (legacy shim → canonical) |
| `${SUPABASE_URL}/functions/v1/ivr-flow` | `${BASE_URL}/api/ivr/:campaignId/...` | Yes (Remix path) |
| `${SUPABASE_URL}/functions/v1/ivr-status` | `${BASE_URL}/api/ivr/status` | Yes (Remix path) |
| `${SUPABASE_URL}/functions/v1/ivr-recording` | `${BASE_URL}/api/ivr/recording` | **New route needed** |
| `${SUPABASE_URL}/functions/v1/acd-router` | `${BASE_URL}/api/acd/*` (TwiML) + worker job (tick) | **New routes + worker** |

App-side routes (already on `${BASE_URL}/api/...`) — unchanged:
- `/api/inbound`, `/api/inbound-sms`, `/api/call-status`, `/api/dial/status`, `/api/auto-dial/status`, `/api/auto-dial/:roomId`, `/api/connect-campaign-conference/*`, `/api/recording`, `/api/email-vm`, `/api/inbound-handset`, `/api/inbound-handset-dial-end`, `/api/caller-id/status`, `/api/ivr/status`, `/api/ivr/:campaignId/:pageId`, `/api/ivr/.../response`, `/api/ivr/.../:blockId`, `/api/initiate-ivr`, `/api/test-webhook`

After migration:
- `SUPABASE_URL` env var removed from all environments
- Twilio number/webhook configs updated to point at `${BASE_URL}/api/...` only
- `check-twilio-webhook-coverage.mjs` CI script stays (route paths unchanged)
- `docs/twilio-canonical-callback-map.md` updated: all rows = Bun, no Edge column

**Messaging Service inbound strategy** (document in CONTEXT.md): number-level inbound (`voiceUrl`/`smsUrl` on each purchased number), NOT Messaging Service-level inbound webhooks. MS is for outbound sender pool + compliance only.

## Revision 4: ADR-0008 — implementation details

### Dockerfile (multi-stage, based on quick-canvass)

```dockerfile
# Stage 1: dev deps + chs package builds
FROM oven/bun:1 AS development-dependencies-env
# or node:26-bookworm-slim if Bun decision reversed
COPY . /app
WORKDIR /app
RUN bun install  # or npm ci
# Build chs packages (auth, auth-postgres, auth-react-router, scriptkit-*)
# Vendor approach: copy to vendor/chester-hill-solutions/ and build dist

# Stage 2: prod deps
FROM oven/bun:1 AS production-dependencies-env
COPY package.json bun.lock /app/
WORKDIR /app
RUN bun install --production
# Copy chs dist from stage 1

# Stage 3: build
FROM oven/bun:1 AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN bun run build

# Stage 4: runtime
FROM oven/bun:1
COPY package.json bun.lock /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
# ffmpeg for audio normalization
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV BODY_SIZE_LIMIT=104857600
EXPOSE 3000
CMD ["bun", "react-router-serve", "./build/server/index.js"]
```

### Dockerfile.worker (separate)

Similar multi-stage, but:
- `CMD ["bun", "build/job-worker/index.js"]`
- `ENV PAITO_RUNTIME=worker` (or `CALLCASTER_RUNTIME=worker`)
- `ENV JOB_WORKER_MODE=server`
- `EXPOSE 8080` (worker HTTP server)

### Railway configs

`railway.web.toml`:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
preDeployCommand = ["bun run db:migrate"]
healthcheckPath = "/"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
```

`railway.worker.toml`:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.worker"
watchPatterns = ["/app/server/**", "/app/db/**", "/packages/worker/**", "/drizzle/**"]

[deploy]
startCommand = "bun build/job-worker/index.js"
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"

[env]
CALLCASTER_RUNTIME = "worker"
JOB_WORKER_MODE = "server"
WORKER_FALLBACK_DRAIN_INTERVAL_MS = "900000"
```

### chs package vendoring

CallCaster currently uses `file:../chester-hill-solutions/packages/...` in package.json. For Docker builds, vendor the packages:

```bash
# In Dockerfile dev stage or a setup script:
cp -r ../chester-hill-solutions/packages vendor/chester-hill-solutions/packages
# Build dist for each package
cd vendor/chester-hill-solutions/packages/auth && bun run build
cd vendor/chester-hill-solutions/packages/auth-postgres && bun run build
# etc.
```

Or use a `scripts/vendor-chs.sh` that copies + builds before Docker build.

### Env vars

New env vars for v2:
- `DATABASE_URL` (replaces `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` + `SUPABASE_ANON_KEY` + `SUPABASE_PUBLISHABLE_KEY`)
- `AUTH_SECRET` (Better Auth)
- `WORKER_WAKE_URL` (web → worker wake URL)
- `WORKER_WAKE_SECRET` (shared secret for wake auth)
- `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` (Railway Buckets / MinIO)
- `DATABASE_PREPARE_STATEMENTS=false` (PgBouncer on Railway)

Removed env vars:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

Kept env vars:
- `BASE_URL` (Twilio webhook URLs)
- `TWILIO_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_APP_SID` / `TWILIO_PHONE_NUMBER`
- `TWILIO_VALIDATE_WEBHOOKS` (dev only)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `OPENAI_API_KEY` (optional)
- `PORT` (Railway provides)

### RR7 future flags to adopt

```typescript
// react-router.config.ts (v2)
export default {
  ssr: true,
  serverModuleFormat: "esm",
  future: {
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
```

### Sentry observability (optional but recommended)

quick-canvass has Sentry for both web and worker. v2 should add:
- `@sentry/react-router` for web (build-time source map upload + runtime error capture)
- Sentry init in worker entry point
- `RAILWAY_GIT_COMMIT_SHA` as release identifier

## E2E testing changes

| Today | v2 |
|---|---|
| `supabase start` for local DB | `docker compose -f docker-compose.dev.yml up -d` (Postgres + MinIO + Inbucket) |
| Supabase auth seed users | Better Auth seed users (direct DB insert via Drizzle) |
| Custom Express E2E server on port 3100 | `react-router-serve` on port 3100 |
| `TWILIO_VALIDATE_WEBHOOKS=false` for mocks | Same |
| Playwright + mocked Twilio/Stripe | Same |
| `scripts/e2e/seed-database.mjs` seeds via Supabase admin | Seeds via Drizzle admin client |

## Twilio credential hardening (existing backlog, not new ADR)

`docs/twilio-credential-hardening-backlog.md` already tracks:
1. Prefer API keys (`workspace.key`/`workspace.token`) for Twilio REST instead of subaccount auth tokens
2. Minimize long-lived `authToken` persistence in `workspace.twilio_data`
3. Admin-initiated API key rotation with audit trail
4. Document rotation runbook

This is implementation work for ADR-0011 (subaccount-per-workspace) + ADR-0016 (per-workspace Voice SDK tokens), not a new ADR.

## Context for CONTEXT.md

Add: **Messaging Service** — used for outbound SMS sender pool and compliance (A2P 10DLC, toll-free verification), NOT for inbound webhooks. Inbound voice/SMS routes through number-level `voiceUrl`/`smsUrl` on each purchased `workspace_number`.
