# Telephony & Dialer Control API Routes

Session and internal telephony control for live calling, IVR, auto-dial, and handset flows. Provider callbacks are documented in [api-webhooks.md](./api-webhooks.md).

Public spec: [`/api/docs/openapi`](/api/docs/openapi) · UI: [`/docs`](/docs) · Webhooks: [complete surface](/docs?spec=complete)

## Browser dialer / tokens

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/token` | Twilio client access token |
| GET | `/api/handset-token` | Handset-specific access token |
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
