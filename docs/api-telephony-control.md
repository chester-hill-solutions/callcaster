# Telephony & Dialer Control API Routes

Session and internal telephony control for live calling, IVR, auto-dial, and handset flows. Provider callbacks are documented in [api-webhooks.md](./api-webhooks.md).

Public spec: [`/api/docs/openapi`](/api/docs/openapi) · UI: [`/docs`](/docs) · Webhooks: [complete surface](/docs?spec=complete)

## Authentication (bearer policy)

Dialer, handset, and agent-presence routes require an authenticated user via **session cookie** or **`Authorization: Bearer <supabase_access_token>`** (`requireJsonAuth`). Workspace API keys (`cc_…`) are **not** accepted on these routes — use a bearer token from `POST /api/auth/token` for headless dialer clients.

| Auth | Accepted on dialer routes |
| --- | --- |
| Session cookie (`sb-access-token`) | Yes |
| Bearer Supabase access token | Yes |
| Workspace API key | No |

## Workspace telephony (Phase 6)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/calls` | Paginated call log (query filters match UI) |
| POST/DELETE | `/api/workspaces/:workspaceId/calls/listening` | Start/stop inbound call listening on handset |
| GET/DELETE | `/api/workspaces/:workspaceId/handset/session` | Handset session state / end session |
| GET | `/api/campaigns/:campaignId/call-session` | Call-screen bootstrap (token, queue, campaign) |
| POST | `/api/campaigns/:campaignId/call-session/release` | Release assigned queue contacts |

`GET/POST/DELETE /api/queues` requires bearer or session auth plus workspace access (campaign must belong to the caller's workspace).

## Browser dialer / tokens

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/token` | Twilio client access token (`?workspace=`) — bearer or session |
| GET | `/api/handset-token` | Handset-specific access token — bearer or session |
| GET/POST | `/api/agent-status` | Read/update agent dialer status — bearer or session |
| POST | `/api/connect-phone-device` | Connect browser device to campaign conference |

## Outbound dial & hangup

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/dial` | Initiate campaign dial (returns TwiML) |
| POST | `/api/hangup` | Hang up active call leg |
| POST | `/api/audiodrop` | Voicemail drop |
| POST | `/api/caller-id` | Start caller-ID verification |

## IVR (session initiation)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ivr` | Outbound IVR dial initiation |
| POST | `/api/initiate-ivr` | Structured IVR initiate (JSON/Zod) |

## Auto-dial

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auto-dial` | Start auto-dial session |
| POST | `/api/auto-dial/end` | End auto-dial session |
| POST | `/api/auto-dial/dialer` | **Internal** predictive dial worker (service role) |

## Inbound queue (session CRUD)

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST/PUT/PATCH/DELETE | `/api/inbound-queue` | Manage inbound queue members |

## Outreach & disposition

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/outreach-attempts` | Create outreach attempt (preferred path) |
| POST | `/api/questions` | Call disposition / script questions |

## Verification flows

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/verify-call-in-session` | Start call-in verification session |
| GET/POST | `/api/verify-audio-session` | Outbound audio verification (split auth on POST — see internal doc) |
| GET | `/api/verify-audio-pin/:pin` | Public TwiML gather entry |

## Internal / weak routes

Documented in [api-internal-unsupported.md](./api-internal-unsupported.md):

- `POST /api/disconnect` — Twilio Device disconnect
- `POST /api/dial/:number` — TwiML sub-route without signature
- Legacy `POST /api/outreach_attempts/:id`

## See also

- [Webhooks map](./api-webhooks.md)
- [Complete inventory](./api-surface-inventory.md)
