# Local Development

This app runs as a React Router v7 app on `http://localhost:3000`, backed by Postgres (Drizzle ORM), an S3-compatible object store (MinIO locally), and Better Auth. Local services run via Docker Compose. Calling flows also need a public HTTPS URL so Twilio can reach your local webhook endpoints.

## Prerequisites

- Node `>=20` and Bun `>=1.2.15`
- Docker Desktop or another Docker runtime
- `psql` (Postgres client, used by the schema bootstrap script)
- Localtunnel (only for live Twilio calling)
- A Twilio account with:
  - an account SID and auth token
  - a TwiML App SID for Voice SDK/browser calling
  - at least one phone number if you want to test inbound or outbound calling

## Local Services And Ports

Started with `docker compose -f docker-compose.dev.yml up -d`:

- App: `http://localhost:3000`
- Postgres: `127.0.0.1:5433` (user/pass/db: `callcaster`)
- MinIO S3 API: `http://127.0.0.1:9000`; console: `http://127.0.0.1:9001`
- Inbucket email UI: `http://127.0.0.1:9002`

## Environment Setup

1. Copy the template and fill in your values:

```bash
cp .env.example .env
```

2. Update the required values in `.env`.

Notes:
- The `DATABASE_URL` and `S3_*` defaults in `.env.example` match the compose dev stack as-is.
- `TWILIO_*` values must be real if you want actual calling, SMS, or Twilio webhook validation to work.
- `STRIPE_SECRET_KEY` and `RESEND_API_KEY` are required by app startup, but placeholder values are fine until you test those integrations.
- `OPENAI_API_KEY` is optional.

## First-Time Local Boot

1. Install dependencies:

```bash
npm install
```

2. Start the local services:

```bash
docker compose -f docker-compose.dev.yml up -d
```

3. Bootstrap the database schema (fresh Postgres only):

```bash
node scripts/e2e/bootstrap-compose-db.mjs
```

4. Create the MinIO bucket:

```bash
node scripts/e2e/ensure-minio-bucket.mjs
```

5. Start the media-stream Bun service (optional; needed for the dashboard audio stream):

```bash
bun run services/media-stream/index.ts
```

The service listens on `MEDIA_STREAM_PORT` (default `3001`). Set `MEDIA_STREAM_SECRET` and `MEDIA_STREAM_HOST` in `.env` if you want to change defaults.

6. Start the app:

```bash
npm run dev
```

7. Confirm the local services are up:
   - app at `http://localhost:3000`
   - media-stream at `http://localhost:3001/healthz`
   - MinIO console at `http://127.0.0.1:9001`
   - Inbucket at `http://127.0.0.1:9002`

## Calling Setup With Localtunnel

Twilio cannot call back into `localhost`, so calling features need a public HTTPS base URL.

1. Install Localtunnel if you do not already have it:

```bash
npm install -g localtunnel
```

2. Start Localtunnel against the local app:

```bash
lt --port 3000
```

3. Copy the HTTPS forwarding URL from Localtunnel.

4. Set `BASE_URL` in `.env` to that HTTPS URL.

Example:

```bash
BASE_URL=https://your-subdomain.loca.lt
```

5. Restart the app after changing `.env`.

Localtunnel quickstart reference:
- [Localtunnel docs](https://theboroer.github.io/localtunnel-www/)

## Sync Twilio To The Current Tunnel

This repo includes a helper script to update Twilio when your tunnel URL changes.

Sync one workspace:

```bash
npm run dev:calling:sync -- --workspace-id <workspace-id>
```

Sync every workspace with stored Twilio credentials:

```bash
npm run dev:calling:sync -- --all-workspaces
```

Pass the current Localtunnel URL explicitly:

```bash
npm run dev:calling:sync -- --workspace-id <workspace-id> --base-url https://your-subdomain.loca.lt
```

What the script updates:
- the TwiML App referenced by `TWILIO_APP_SID` so browser/device calls keep using `${BASE_URL}/api/call`
- Twilio incoming phone number webhooks for the selected workspace(s)
- stored onboarding callback metadata in the workspace `twilio_data`

The script reads the public URL in this order:
- `--base-url`
- `BASE_URL` from the environment

Because Localtunnel does not expose the same local tunnel API flow as ngrok, prefer either:
- setting `BASE_URL` in `.env`
- passing `--base-url` directly to the sync command

## Why Resync Is Required

Twilio webhook validation uses the exact incoming request URL. If your Localtunnel hostname changes but Twilio is still sending requests to the old URL, webhook validation will fail until the callbacks are updated.

Relevant runtime wiring:
- incoming numbers point to `${BASE_URL}/api/inbound`, `${BASE_URL}/api/inbound-sms`, and `${BASE_URL}/api/caller-id/status`
- browser/device calls rely on `TWILIO_APP_SID`, which should point at `${BASE_URL}/api/call`

## Build, Typegen, And Production Server

- `npm run dev` validates the environment then runs `react-router dev`, so local edits use Vite HMR/SSR module loading instead of rebuilding `build/`.
- `npm run build` runs `react-router build` (client + server bundles under `build/`).
- `npm run typecheck` runs `react-router typegen` then `tsc`.
- `npm start` runs the Bun production server (`server/bun.ts`) against `build/server/index.js`.
- `npm run worker` runs the background job worker (`worker/index.ts`).
- Railway-style probes: `GET /healthz` (liveness), `GET /readyz` (readiness; 503 until the RR build is loaded, when the database is unreachable, or during graceful shutdown).
- Optional: `PROCESS_FATAL_ON_REJECTION=1` exits the process on unhandled promise rejections (default logs only).
- HTTPS for the optional dev websocket server (`scripts/dev/websocket-server.js`) uses self-signed certs in `scripts/dev/certs/` (gitignored). Regenerate with:
  `openssl req -x509 -newkey rsa:2048 -nodes -keyout scripts/dev/certs/server.key -out scripts/dev/certs/server.cert -days 365 -subj "/CN=localhost"`

## Suggested Daily Workflow

1. Start services with `docker compose -f docker-compose.dev.yml up -d`
2. Start the app with `npm run dev`
3. Start Localtunnel with `lt --port 3000`
4. Update `BASE_URL` in `.env` if the tunnel changed
5. Run `npm run dev:calling:sync -- --workspace-id <workspace-id> --base-url <your-localtunnel-url>`
6. Test the calling flow

## E2E tests (Playwright)

For browser end-to-end tests without Twilio tunneling, see **[e2e-testing.md](e2e-testing.md)**. Summary:

```bash
npm run test:e2e:compose   # compose-first: starts services, bootstraps, seeds, builds, runs Playwright
```

E2E uses mocked Twilio/Stripe and runs in CI on main/nightly only.

## Troubleshooting

`Missing required environment variables`
- Fill in every required variable from `.env.example`
- Restart the app after changing `.env`

`Invalid Twilio signature`
- Make sure `BASE_URL` exactly matches the current Localtunnel URL
- Re-run the sync script after every tunnel rotation
- Confirm the Twilio auth token in `.env` matches the account being used

Calling loads but webhooks do not fire
- Verify Localtunnel is forwarding to port `3000`
- Check that the script updated the right workspace or all workspaces
- Confirm the relevant number exists in the workspace and in Twilio

App starts but calling still does not work
- `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_APP_SID`, and `TWILIO_PHONE_NUMBER` must be real values
- Workspace-specific Twilio credentials stored in the database must also be valid for number-level webhook sync

Database errors on startup
- Ensure Docker is running and the compose Postgres is up (`docker compose -f docker-compose.dev.yml ps`)
- Re-run the schema bootstrap on a fresh database (`node scripts/e2e/bootstrap-compose-db.mjs`)
- The server refuses to boot if the ledger RPC is missing or legacy Supabase triggers remain (see `app/server/db-health.server.ts`)

Email or billing features fail locally
- `RESEND_API_KEY` and `STRIPE_SECRET_KEY` can be placeholders for general app boot
- Use real values only when you need to exercise those integrations
