# CallCaster

CallCaster is a contact-center platform for calling and SMS campaigns: campaign scripts and IVR, live power dialing, surveys, audiences/contacts, billing by credits, and a public integrator API. Built with React Router 7, a Bun production server, Railway Postgres (Drizzle ORM), S3-compatible object storage, Twilio, Stripe, and Resend.

## Quickstart

Prerequisites: **Node >= 20**, **Bun >= 1.2.15**, and Docker.

```bash
# 1. Install dependencies
npm install

# 2. Start local services (Postgres on :5433, MinIO on :9000, Inbucket mail on :9002)
docker compose -f docker-compose.dev.yml up -d

# 3. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, BETTER_AUTH_SECRET, S3_*, TWILIO_*, BASE_URL,
# STRIPE_SECRET_KEY, RESEND_API_KEY — placeholders are fine until you
# exercise the corresponding integration. See docs/local-development.md.

# 4. Run the app (validates env, then starts react-router dev on :3000)
npm run dev
```

Verify your setup:

```bash
npm run typecheck   # react-router typegen + tsc
npm run lint
npm test            # vitest node + UI suites, plus bun server-runtime tests
npm run test:e2e:compose   # full E2E against compose Postgres + MinIO
```

Production entry points: `npm start` (Bun server, `server/bun.ts`) and `npm run worker` (job worker, `worker/index.ts`); images build from `Dockerfile` and `Dockerfile.worker`.

## Documentation

- **[Docs index](docs/README.md)** - Central index for active docs and archived root notes.
- **[Archive index](archive/README.md)** - Location and purpose of deprecated/legacy files moved out of root.
- **[Local development](docs/local-development.md)** - Run the app locally, including Postgres, Localtunnel, and Twilio calling setup.
- **[Script structure](docs/script-structure.md)** – How campaign scripts are stored (`steps`), pages vs blocks, and IVR navigation.
- **[Script JSON format](docs/script-json-format.md)** – Script structure for campaigns (pages, blocks); field reference and examples.
- **[API overview](docs/api-overview.md)** – Public integrator API boundary, auth, and endpoint list.
- **[Complete API surface](docs/api-surface-inventory.md)** – Generated inventory of all callable `/api` routes; Scalar at [`/docs?spec=complete`](/docs?spec=complete).
- **[Create campaign with script (one-shot API)](docs/api-create-campaign-with-script.md)** – `POST /api/campaigns/create-with-script`: create a campaign with script, caller ID, and audiences in a single request (session or API key).
- **[Send SMS](docs/api-send-sms.md)** – `POST /api/chat_sms` and `POST /api/sms` public messaging endpoints.
- **[Public API test drift](docs/public-api-test-drift.md)** – Tracked gaps and verification commands for the integrator API surface.
- **Interactive API docs** – Public spec at **[`/docs`](/docs)**; complete classified surface at **[`/docs?spec=complete`](/docs?spec=complete)**. Raw JSON: `/api/docs/openapi`, `/api/docs/openapi/all`.
- **[Stripe webhook](docs/stripe-webhook.md)** – Configure Stripe to send `checkout.session.completed` to `/api/stripe-webhook`; requires `STRIPE_WEBHOOK_SECRET`.
- **[Link shortening](docs/link-shortening.md)** – One-time Twilio Console setup that activates the already-shipped `shortenUrls` support (halves segments on link-bearing sends).
