# Local Development

## Quick start

```bash
make up           # start Postgres and Inbucket without changing database data
make storage      # start Stow and ensure the object-storage bucket
make app          # starts in background; logs: make app-logs
make tunnel       # starts in background; logs: make tunnel-logs
make calling:sync-local
make worker       # starts in background; logs: make worker-logs
# Optional: live dashboard audio, transcription, and coaching
make media-stream
```

This is for returning developers with `.env.local`, `DEV_NAME`, `ENV`, and an
already-created named Cloudflare Tunnel configured. For first-time setup, use
[Environment Setup](#environment-setup).

Verify the setup:

```bash
npm run typecheck   # react-router typegen + tsc
npm run lint
npm test            # vitest node + UI suites, plus bun server-runtime tests
make e2e            # full Playwright run against compose Postgres + Stow
```

## Environment Setup

### Prerequisites

- Node `22.x` (the repo pins it and CI uses it; other majors produce test failures that do not reproduce in CI) and Bun `>=1.2.15`
- Docker Desktop or another Docker runtime
- `cloudflared` for the named Cloudflare Tunnel workflow
- A Twilio account with:
  - an account SID and auth token
  - at least one phone number if you want to test inbound or outbound calling

#### WSL2: install `cloudflared`

You can use either a native Windows installation or a Linux installation inside
WSL2. WSL2 can run `cloudflared.exe` through Windows interop when the Windows
PATH is inherited. This is often the simplest option when `cloudflared` is
already installed on Windows.

From WSL2, verify the Windows executable:

```bash
cloudflared.exe --version
```

If the Windows PATH is not available, or if you want the tunnel process to run
fully inside WSL2, install the Linux package instead:

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install cloudflared
cloudflared --version
```

The `make tunnel` launcher supports the executable available in
the developer's environment, either `cloudflared` or `cloudflared.exe`.
Regardless of which binary is used, keep the app and tunnel origin reachable
from the same machine. If the app runs in WSL2, test
`http://127.0.0.1:3000` from the shell that starts the tunnel. Docker Desktop
must have WSL integration enabled for the distribution that runs `make init`.

### Local Services And Ports

The local stack uses these endpoints:

- App: `http://localhost:3000`
- Postgres: `127.0.0.1:5433` (user/pass/db: `callcaster`)
- Stow S3 API: `http://127.0.0.1:9000`
- Inbucket email UI: `http://127.0.0.1:9002`

### Setup Steps

Run the setup in this order:

```bash
npm install                 # once after cloning, or after dependencies change
cp -n .env.example .env.local  # create the developer-specific override
```

The local TwiML App is named `env:sai-local`. Use a different `DEV_NAME` for
each developer so one local tunnel cannot repoint another developer's app.
Set your local values in `.env.local`:

```env
DEV_NAME=sai
ENV=local
BASE_URL=https://sai-local.callcaster.ca
TWILIO_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+15555550100
# Required for startup; a placeholder is fine until billing is tested.
STRIPE_SECRET_KEY=placeholder
# Required for startup; a placeholder is fine until email is tested.
RESEND_API_KEY=placeholder
```

`make init` creates the shared `.env` and does not read `.env.local`.

#### Create and verify the named Cloudflare Tunnel

The development domain is already managed by Cloudflare. Each developer gets
one named tunnel and hostname based on `DEV_NAME` and `ENV`:

```text
DEV_NAME=sai, ENV=local
Tunnel:   sai-local
Hostname: sai-local.callcaster.ca
Origin:   http://127.0.0.1:3000
```

Run this once from the environment where `cloudflared` will run. Sign in to
Cloudflare first; the browser flow lets you select the managed domain:

```bash
cloudflared tunnel login
```

Then run the repository setup command:

```bash
make tunnel-setup
```

Set the stable public URL in `.env.local`:

```env
BASE_URL=https://sai-local.callcaster.ca
```

Start the app before starting the tunnel. Both commands return immediately:

```bash
make app
make tunnel
make local-status
```

Follow process logs when needed:

```bash
make app-logs
make worker-logs
make tunnel-logs
make local-logs   # follow all local process logs
```

Stop the local processes with:

```bash
make local-stop
```

Verify the public route from another terminal:

```bash
curl -I https://sai-local.callcaster.ca/
```

The hostname must remain `sai-local.callcaster.ca` for this developer. Do not
create a second tunnel for the same developer and hostname. A Cloudflare
connector reconnect does not change the hostname or require Twilio callback
resynchronization.

Initialize the local services after setting the local environment values. For
returning developers, use the non-destructive commands:

```bash
make up                    # start Postgres and Inbucket; preserves database data
make storage               # start Stow and ensure the bucket
make app                   # terminal 1
```

Use `make init` only for first-time setup or when you intentionally want to
reset the local database. It drops and recreates the local database schemas,
then applies the schema and seed data.

Create the local TwiML App and sync local workspaces:

```bash
make twiml
make calling:sync-local
```

The worker and media-stream are optional and do not need the tunnel URL:

```bash
make worker                # background process, when needed
make media-stream          # optional background process
```

#### Sync Twilio To The Current Tunnel

This repo includes helpers to create the local environment TwiML App and update
Twilio when callback configuration changes.

Sync one workspace:

```bash
make calling:sync WORKSPACE_ID=<workspace-id>
```

Pass the stable Cloudflare URL explicitly when needed:

```bash
BASE_URL=https://sai-local.callcaster.ca make calling:sync WORKSPACE_ID=<workspace-id>
```

The local wrapper requires `ENV=local`, refuses Railway environments, ignores
seeded fake credentials, and delegates callback updates to the existing sync
script. It does not sync hosted workspaces.

What the script updates:
- the TwiML App referenced by `TWILIO_APP_SID` so browser/device calls keep using `${BASE_URL}/api/call`
- Twilio incoming phone number webhooks for the selected workspace(s)
- stored onboarding callback metadata in the workspace `twilio_data`

> **Use your own TwiML App for local dev.** A TwiML App holds exactly one voice
> URL, so pointing a shared app at your tunnel breaks browser calling for every
> environment using it — and keeps it broken after your tunnel closes, with
> Twilio only ever saying "an unexpected error has occurred" (error 11200).
> Create a personal TwiML App in the
> [Twilio console](https://console.twilio.com/us1/develop/voice/manage/twiml-apps)
> and use its credentials in `.env.local` before running these commands.

The Make targets read `BASE_URL` from `.env.local` or `.env`. A named Cloudflare
Tunnel keeps the same hostname after connector reconnects, so callback sync is
not needed after every tunnel restart.

#### Why Resync Is Required

Twilio webhook validation uses the exact incoming request URL. If the public
hostname or callback configuration changes, webhook validation will fail until
the callbacks are updated. A Cloudflare connector reconnect does not change the
hostname.

Relevant runtime wiring:
- incoming numbers point to `${BASE_URL}/api/inbound`, `${BASE_URL}/api/inbound-sms`, and `${BASE_URL}/api/caller-id/status`
- browser/device calls rely on `TWILIO_APP_SID`, which should point at `${BASE_URL}/api/call`

## Service control

The `Makefile` wraps `docker compose -f docker-compose.dev.yml` and the npm scripts. A service name before the action scopes it; no service means all of them.

| Command | What it does |
|---|---|
| `make up` / `make down` / `make logs` | Start, stop, or follow logs for Postgres and Inbucket |
| `make postgres up`, `make postgres logs` | Start or follow logs for a selected Compose service |
| `make storage` / `make storage down` | Start or stop the Stow S3-compatible object store; `make storage` also ensures the bucket exists |
| `make postgres init` | Start Postgres and reset/bootstrap the local schema; destructive to local database data |
| `make ps` | Compose status |
| `make app` | Run the React Router web app in the foreground |
| `make worker` | Run the background job worker in the foreground; required for list uploads and other queued work |
| `make media-stream` | Run the optional media-stream WebSocket service in the foreground; needed for dashboard audio, live transcription, and coaching |
| `make help` | This list |

Tail an app process by running it in its own terminal; the compose services are the only ones behind `make logs`.

## TwiML Apps In Deployed Environments

Production sets `TWILIO_APP_SID` explicitly and owns the `calldiv` app.

Every other Railway environment (PR previews, `dev`, `qa`) provisions its own
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

`vendor/` carries generated `dist/` output for `shad-cc` and the two `scriptkit` packages, and the app imports that dist. Editing a package's `src/` does nothing until you rebuild (`npm run vendor:build` for scriptkit; `npm --prefix vendor/chester-hill-solutions/shad-cc run build` for shad-cc) and commit the rebuilt `dist/` with it; never edit `dist/` by hand. `npm run check:vendor-dist` (first step of `ci:local`, and a CI quality step) rebuilds all three packages. A failed build or any byte difference fails the check and names the affected package and files. Review and commit the rebuild with the source change. The guard does not reset files or clean Git changes. The UI build uses sorted named entries, esbuild bundling and one native TypeScript declaration emit. Final consumer builds perform tree shaking; do not restore tsup's extra per-file Rollup passes, which changed import and union-member order from unchanged source.

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

## E2E tests (Playwright)

For browser end-to-end tests without Twilio tunneling, see **[e2e-testing.md](e2e-testing.md)**. Summary:

```bash
npm run test:e2e:compose   # compose-first: starts services, bootstraps, seeds, builds, runs Playwright
```

E2E uses mocked Twilio/Stripe and runs in CI on main/nightly only.

## What `make init` does

`make init` is the complete first-time or intentional local database reset
setup. It does not preserve existing local database rows. It does not install
dependencies or start the app, worker, or media-stream process.

It runs these steps:

1. Create `.env` from `.env.example` if `.env` does not exist. Existing `.env`
   files are left unchanged.
2. Start the Postgres and Inbucket Compose services.
3. Start Stow as a local process and wait for its S3 endpoint.
4. Wait for Postgres to accept connections.
5. Drop and recreate the local database schemas, then apply the local database schema.
6. Ensure the Stow bucket exists.
7. Seed test users, workspaces, and campaigns.

For returning developers who need to preserve local data, use `make up` and
`make storage` instead of `make init`.

The Make targets for the common individual service operations are listed in
[Service control](#service-control). In particular, use `make up` for Compose
services, `make storage` for Stow and its bucket, and `make postgres init` for
the Postgres bootstrap. For a full repair, use `make init` instead of running
the underlying Node scripts by hand.

The optional media-stream service listens on `MEDIA_STREAM_PORT` (default
`3001`). Set `MEDIA_STREAM_SECRET` and `MEDIA_STREAM_HOST` in `.env` if you
need to change its defaults.

Transcription and coaching use optional API keys:

- `ELEVENLABS_API_KEY` enables live speech-to-text and the post-call batch
  transcription job. Without it, live STT is skipped and the batch job can
  dead-letter.
- `COHERE_API_KEY` enables live coaching cues. Without it, coaching cues are
  skipped.

## Troubleshooting

`Missing required environment variables`
- Fill in every required variable from `.env.example`
- Restart the app after changing `.env`

`Invalid Twilio signature`
- Make sure `BASE_URL` is `https://<DEV_NAME>-<ENV>.callcaster.ca`
- Re-run `make calling:sync-local` after changing the hostname or callback path
- Confirm the Twilio auth token in `.env` matches the account being used

Calling loads but webhooks do not fire
- Verify `cloudflared` is forwarding the named hostname to port `3000`
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
