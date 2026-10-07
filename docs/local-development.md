# Local Development

This app runs as a React Router 8 app on `http://localhost:3000`, backed by Postgres (Drizzle ORM), an S3-compatible object store (Stow locally), and Better Auth. Local services run via Docker Compose. Calling flows also need a public HTTPS URL so Twilio can reach your local webhook endpoints.

## Quick start

This is the normal startup flow for a local environment that has already been
initialized. If this is your first local environment, complete
[Initial environment setup](#initial-environment-setup) first.

```bash
# Terminal 1: start a new public HTTPS URL for this session
make tunnel

# Update BASE_URL in .env.local and .env with the URL printed by Localtunnel.
# Keep the tunnel terminal running.

# Terminal 2: create or update env:<DEV_NAME>-<ENV>, then start the app
make twiml
make app

# Terminal 3: background jobs, including list uploads
make worker

# Terminal 4, optional: dashboard audio, transcription, and coaching
make media-stream

# After the app is running, update the phone callbacks for all local workspaces.
make calling:sync-local
```

The tunnel URL can change each session. `make twiml` updates the same
environment-level TwiML App, and `make calling:sync` updates the selected
workspace's phone callbacks. `make calling:sync-local` discovers all workspaces
in the local database that have real Twilio account credentials. Restart the
app, worker, or media-stream process after changing environment files. Do not
use `--all-workspaces` for normal development.

`make init` is not part of this daily flow. It starts Postgres, Stow object
storage, and mail, applies the schema, creates the bucket, and seeds test users
and workspaces. It does not start the app, worker, or media-stream process.
Sign in with a seeded account from [`e2e/fixtures/seed.ts`](../e2e/fixtures/seed.ts).

Verify the setup:

```bash
npm run typecheck   # react-router typegen + tsc
npm run lint
npm test            # vitest node + UI suites, plus bun server-runtime tests
make e2e            # full Playwright run against compose Postgres + Stow
```

## Redirect target checks

`npm run check:redirect-targets` compares literal local redirects with the actual registered JSON route tree. It composes parent, pathless, index, parameter and wildcard routes through React Router's matcher. Query strings and hashes do not change the target page. All registered modules are scanned, including the root. Static imports and re-exports are followed within `app/routes/` and for direct `app/` siblings such as the root loader; directory index modules are resolved too. Imported assets are excluded from script discovery. Named `redirect`/`redirectDocument` imports, aliases, namespace imports, multiline calls and literal templates are supported. Lexical bindings keep shadowed names, comments and string examples out of the check.

The gate does not validate runtime-computed arguments, interpolated templates, dynamic imports or helpers outside those source boundaries. External URLs and other non-absolute references remain unchecked. An auth wildcard proves route registration, not whether Better Auth accepts that endpoint. Keep runtime and end-to-end checks for those cases. The existing relative-redirect gate remains separate. Both gates run in full local CI and the quality workflow; absent literal targets fail without a suppression baseline.

The CLI's `--routes-json <file>` option supplies a registered tree for isolated fixtures. Normal CI always reads the current tree from `react-router routes --json` and fails on empty output or a missing registered source file.

## Service control

The `Makefile` wraps `docker compose -f docker-compose.dev.yml` and the npm scripts. A service name before the action scopes it; no service means all of them.

| Command | What it does |
|---|---|
| `make up` / `make down` / `make logs` | Start, stop, or follow logs for Postgres and Inbucket |
| `make postgres up`, `make postgres logs` | Start or follow logs for a selected Compose service |
| `make storage up` / `make storage down` | Start or stop the Stow S3-compatible object store |
| `make postgres init` | Start Postgres and bootstrap the schema only (`make storage init` creates the bucket) |
| `make ps` | Compose status |
| `make app` | Run the React Router web app in the foreground |
| `make worker` | Run the background job worker in the foreground; required for list uploads and other queued work |
| `make media-stream` | Run the optional media-stream WebSocket service in the foreground; needed for dashboard audio, live transcription, and coaching |
| `make help` | This list |

Tail an app process by running it in its own terminal; the compose services are the only ones behind `make logs`.

## Prerequisites

- Node `22.x` (the repo pins it and CI uses it; other majors produce test failures that do not reproduce in CI) and Bun `>=1.2.15`
- Docker Desktop or another Docker runtime
- Localtunnel (only for live Twilio calling)
- A Twilio account with:
  - an account SID and auth token
  - a TwiML App SID for Voice SDK/browser calling
  - at least one phone number if you want to test inbound or outbound calling

## Local Services And Ports

The local stack uses these endpoints:

- App: `http://localhost:3000`
- Postgres: `127.0.0.1:5433` (user/pass/db: `callcaster`)
- Stow S3 API: `http://127.0.0.1:9000`
- Inbucket email UI: `http://127.0.0.1:9002`

## Initial Environment Setup

Complete this once for each local developer/environment identity. It creates
the local services, the environment-level TwiML App, and the first local
database. A workspace is created separately in the app because `make twiml`
does not need or use a workspace.

1. Copy the template to the local override file:

```bash
cp .env.example .env.local
```

2. Update `.env.local`. Set these values for your developer:

```env
DEV_NAME=developer-name
ENV=local
```

Also set the real parent Twilio credentials and any other required values.

3. Install dependencies:

```bash
npm install
```

4. Start Localtunnel in a separate terminal and keep it running:

```bash
make tunnel
```

5. Set the HTTPS URL printed by Localtunnel as `BASE_URL` in `.env.local`.

6. Copy the completed local configuration to the file used by existing local
commands:

```bash
cp .env.local .env
```

7. Initialize the local services and database:

```bash
make init
```

8. Create or update the environment-level TwiML App:

```bash
make twiml
```

This creates or updates `env:${DEV_NAME}-${ENV}` in the parent Twilio account
and writes its SID to `.env.local` and `.env`. It does not need a workspace.

9. Start the app, worker, and optional media-stream service in separate
terminals:

```bash
make app
make worker
make media-stream
```

10. Sign in and create a real workspace in the app. If the workspace already
has a Twilio number, use the [daily calling sync](#sync-twilio-to-the-current-tunnel)
after the app is running. Newly rented numbers receive callbacks from the
current `BASE_URL` during number purchase.

Notes:
- The `DATABASE_URL` and `S3_*` defaults in `.env.example` match the compose dev stack as-is.
- `TWILIO_*` values must be real if you want actual calling, SMS, or Twilio webhook validation to work.
- `STRIPE_SECRET_KEY` and `RESEND_API_KEY` are required by app startup, but placeholder values are fine until you test those integrations.
- `OPENAI_API_KEY` is optional.

## What `make init` does, step by step

Use these when you want to run one step by hand (for example after `make postgres down` and a volume wipe). `make init` runs all of them.

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

4. Create the object-storage bucket (stow runs as a local binary, not a container):

```bash
node scripts/e2e/start-stow.mjs --start
node scripts/e2e/ensure-bucket.mjs
```

5. The service processes are not part of `make init`. Start them using the
commands in [Initial environment setup](#initial-environment-setup) or the
[Quick start](#quick-start).

The media-stream service listens on `MEDIA_STREAM_PORT` (default `3001`). Set
`MEDIA_STREAM_SECRET` and `MEDIA_STREAM_HOST` in `.env` if you want to change
defaults.

Transcription and coaching need two optional API keys (both are skipped when unset, so local demos run without them):

- `ELEVENLABS_API_KEY` — live speech-to-text (`scribe_v2_realtime`) and the post-call `elevenlabs_batch_transcribe` worker job (`scribe_v2`). If unset, live STT is skipped and the batch job throws and dead-letters roughly every 15 minutes, so set it wherever the worker runs.
- `COHERE_API_KEY` — live coaching cues (`api.cohere.com`). If unset, coaching cues are skipped.

6. Confirm the local services are up:
   - app at `http://localhost:3000`
   - media-stream at `http://localhost:3001/healthz`
   - Stow S3 API at `http://127.0.0.1:9000`
   - Inbucket at `http://127.0.0.1:9002`

7. Start the app, worker, and media-stream service separately when needed.

## Calling Setup With Localtunnel

Twilio cannot call back into `localhost`, so calling features need a public HTTPS base URL.

1. Install the repository dependencies. Localtunnel is a repository dev
dependency; do not install it globally:

```bash
npm install
```

2. Start Localtunnel against the local app:

```bash
make tunnel
```

3. Copy the HTTPS forwarding URL from Localtunnel.

4. Set `BASE_URL` in `.env` to that HTTPS URL.

   If `.env.local` exists, update or remove its `BASE_URL` too. Bun loads
   `.env.local` as an override, so its localhost value takes precedence over
   the tunnel URL in `.env`.

Example:

```bash
BASE_URL=https://your-subdomain.loca.lt
```

5. Restart the app after changing `.env`.

Localtunnel quickstart reference:
- [Localtunnel docs](https://theboroer.github.io/localtunnel-www/)

## Sync Twilio To The Current Tunnel

This repo includes a helper script to update Twilio when your tunnel URL changes.

Create or update the environment-level TwiML App. This is separate from a
workspace and is safe to run before a workspace exists:

```bash
make twiml
```

Sync one workspace's phone callbacks:

```bash
make calling:sync WORKSPACE_ID=<workspace-id>
```

Sync every credential-bearing workspace in the local database:

```bash
make calling:sync-local
```

This is the normal command after a new Localtunnel URL. It discovers the
workspaces in the local database, so you do not need to remember their IDs.
It refuses to run in Railway environments and requires `ENV=local`.

Sync every workspace with stored Twilio credentials:

```bash
npm run dev:calling:sync -- --all-workspaces
```

Pass the current Localtunnel URL explicitly:

```bash
make calling:sync WORKSPACE_ID=<workspace-id> BASE_URL=https://your-subdomain.loca.lt
```

What the script updates:
- the environment TwiML App named `env:${DEV_NAME}-${ENV}` so browser/device calls keep using `${BASE_URL}/api/call`
- Twilio incoming phone number webhooks for the selected workspace(s)
- stored onboarding callback metadata in the workspace `twilio_data`

> **Use your own environment TwiML App for local dev.** `make twiml` creates or
> reuses `env:${DEV_NAME}-${ENV}`. A TwiML App holds exactly one voice URL, so
> pointing a shared app at your tunnel breaks browser calling for every
> environment using it.

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

## TwiML Apps In Deployed Environments

Production sets `TWILIO_APP_SID` explicitly and owns the `calldiv` app.

Every other Railway environment (PR previews, `dev`, `staging`) provisions its own
TwiML App at boot via `app/server/environment-twiml-app.server.ts`, named
`env:<railway-environment-name>` and pointed at that environment's own
`${BASE_URL}/api/call`. This runs before the required-env check, and deliberately
overrides any inherited `TWILIO_APP_SID`: Railway clones variables from the base
environment, and only production owns an app, so without the override a
non-production deployment would mint Voice SDK tokens against production's app and
place its calls through production's code, database, and caller ID.

Closed PRs leave their apps behind. Reconcile Twilio against the environments
Railway still reports (dry-run by default):

```bash
bun ./scripts/local/prune-environment-twiml-apps.mjs
bun ./scripts/local/prune-environment-twiml-apps.mjs --apply
```

Run these with `bun`, not `node`: the `twilio` package pulls in
`buffer-equal-constant-time`, which reads `SlowBuffer` and throws on import under
Node 24+.

## Vendored packages

`vendor/` carries generated `dist/` output for `shad-cc` and the two `scriptkit` packages, and the app imports that dist. Editing a package's `src/` does nothing until you rebuild (`npm run vendor:build` for scriptkit; `npm --prefix vendor/chester-hill-solutions/shad-cc run build` for shad-cc) and commit the rebuilt `dist/` with it; never edit `dist/` by hand. `npm run check:vendor-dist` (first step of `ci:local`, and a CI quality step) rebuilds the scriptkit packages and fails, naming the files, when the committed dist is not what the committed source produces. shad-cc runs in warn-only mode until its build is proven reproducible in CI (#1615).

## Build, Typegen, And Production Server

- `npm run dev` validates the environment then runs `react-router dev`, so local edits use Vite HMR/SSR module loading instead of rebuilding `build/`.
- `npm run build` runs `react-router build` (client + server bundles under `build/`).
- `npm run typecheck` runs `react-router typegen` then `tsc`.
- `npm start` runs the Bun production server (`server/bun.ts`) against `build/server/index.js`.
- `npm run worker` runs the background job worker (`worker/index.ts`). In long-running mode, general jobs and customer webhook delivery use separate claim loops. One delivery can run at a time; a slow destination does not take the general loop. Drain mode still processes one job.
- Railway-style probes: `GET /healthz` (liveness), `GET /readyz` (readiness; 503 until the RR build is loaded, when the database is unreachable, or during graceful shutdown).
- Optional: `PROCESS_FATAL_ON_REJECTION=1` exits the process on unhandled promise rejections (default logs only).
- HTTPS for the optional dev websocket server (`scripts/dev/websocket-server.js`) uses self-signed certs in `scripts/dev/certs/` (gitignored). Regenerate with:
  `openssl req -x509 -newkey rsa:2048 -nodes -keyout scripts/dev/certs/server.key -out scripts/dev/certs/server.cert -days 365 -subj "/CN=localhost"`

## Suggested Daily Workflow

1. Start Localtunnel with `make tunnel`
2. Update `BASE_URL` in `.env.local` and `.env` if the tunnel changed
3. Run `make twiml`
4. Start the app with `make app` and the worker with `make worker` when needed
5. Run `make calling:sync-local`
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
- Ensure Docker is running and the compose Postgres is up (`make ps`)
- Re-run the schema bootstrap on a fresh database (`make postgres init`)
- The server refuses to boot if the ledger RPC is missing or legacy Supabase triggers remain (see `app/server/db-health.server.ts`)

Email or billing features fail locally
- `RESEND_API_KEY` and `STRIPE_SECRET_KEY` can be placeholders for general app boot
- Use real values only when you need to exercise those integrations
