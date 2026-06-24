# Webhook API Routes (Twilio & Stripe)

Provider callbacks authenticated by **signature**, not session or API keys. Configure these URLs in Twilio/Stripe dashboards — they are **not** customer integrator APIs.

Complete spec: [`/api/docs/openapi/all`](/api/docs/openapi/all) (tag: **Provider Webhook**)

## Twilio voice & status

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound` | Inbound call routing (TwiML) |
| POST | `/api/call-status` | Outbound/inbound call status |
| POST | `/api/dial/status` | AMD / dial status |
| POST | `/api/recording` | Recording status |
| POST | `/api/email-vm` | Voicemail email notification |

## Twilio SMS

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound-sms` | Inbound SMS |
| POST | `/api/sms/status` | Outbound SMS delivery status |

## Twilio IVR (outbound campaign)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ivr/status` | IVR call status |
| POST | `/api/ivr/:campaignId/:pageId` | IVR page TwiML |
| POST | `/api/ivr/:campaignId/:pageId/:blockId` | IVR block TwiML |
| POST | `/api/ivr/:campaignId/:pageId/:blockId/response` | IVR gather response |

## Twilio inbound IVR

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound-ivr/:numberId/:pageId` | Inbound IVR page |
| POST | `/api/inbound-ivr/:numberId/:pageId/:blockId` | Inbound IVR block |
| POST | `/api/inbound-ivr/:numberId/:pageId/:blockId/response` | Inbound gather response |

## Handset & auto-dial callbacks

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound-handset` | Inbound handset TwiML |
| POST | `/api/inbound-handset-dial-end` | Handset dial end |
| POST | `/api/auto-dial/:roomId` | Conference/AMD TwiML |
| POST | `/api/auto-dial/status` | Auto-dial status |
| GET | `/api/connect-campaign-conference/:workspaceId/:campaignId` | Conference connect voice URL |
| POST | `/api/caller-id/status` | Caller ID verification status |

## Stripe

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/stripe-webhook` | Billing events (`Stripe-Signature` required) |

Setup: [stripe-webhook.md](./stripe-webhook.md)

## Signature requirements

- **Twilio**: `X-Twilio-Signature` validated against the full URL and form body (or GET query for voice URLs).
- **Stripe**: `Stripe-Signature` validated with `STRIPE_WEBHOOK_SECRET` on the raw request body.

## See also

- [Internal routes without signatures](./api-internal-unsupported.md)
- [Complete inventory](./api-surface-inventory.md)
