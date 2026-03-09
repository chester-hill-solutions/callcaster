# Local Development

This app runs as a Remix server on `http://localhost:3000` and uses local Supabase for database/auth/storage services. Calling flows also need a public HTTPS URL so Twilio can reach your local webhook endpoints.

## Prerequisites

- Node `>=18` or Bun `>=1.2.15`
- Docker Desktop or another Docker runtime
- Supabase CLI
- Localtunnel
- A Twilio account with:
  - an account SID and auth token
  - a TwiML App SID for Voice SDK/browser calling
  - at least one phone number if you want to test inbound or outbound calling

## Local Services And Ports

- App: `http://localhost:3000`
- Supabase API: `http://127.0.0.1:54321`
- Supabase Postgres: `54322`
- Supabase Studio: `http://127.0.0.1:54323`
- Inbucket email UI: `http://127.0.0.1:54324`

## Environment Setup

1. Copy the template and fill in your values:

```bash
cp .env.example .env
```

2. Update the required values in `.env`.

Notes:
- `SUPABASE_*` values should match your local Supabase project after `supabase start`.
- `TWILIO_*` values must be real if you want actual calling, SMS, or Twilio webhook validation to work.
- `STRIPE_SECRET_KEY` and `RESEND_API_KEY` are required by app startup, but placeholder values are fine until you test those integrations.
- `OPENAI_API_KEY` is optional.

## First-Time Local Boot

1. Install dependencies:

```bash
npm install
```

2. Start Supabase:

```bash
supabase start
```

3. Start the app:

```bash
npm run dev
```

4. Confirm the local services are up:
   - app at `http://localhost:3000`
   - Supabase Studio at `http://127.0.0.1:54323`
   - Inbucket at `http://127.0.0.1:54324`

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

## Suggested Daily Workflow

1. Start Supabase with `supabase start`
2. Start the app with `npm run dev`
3. Start Localtunnel with `lt --port 3000`
4. Update `BASE_URL` in `.env` if the tunnel changed
5. Run `npm run dev:calling:sync -- --workspace-id <workspace-id> --base-url <your-localtunnel-url>`
6. Test the calling flow

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

Supabase errors on startup
- Ensure Docker is running
- Re-run `supabase start`
- Use `supabase status` to confirm the local project is healthy

Email or billing features fail locally
- `RESEND_API_KEY` and `STRIPE_SECRET_KEY` can be placeholders for general app boot
- Use real values only when you need to exercise those integrations
