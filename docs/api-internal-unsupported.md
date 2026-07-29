# Internal & Unsupported API Routes

Routes that are callable over HTTP but **not supported for external integrators**. Some are internal telephony helpers; the historical "security gaps" in this doc were closed by the Wave 1 hard-cuts (#1039) and the 2026-07-29 pre-ship pass — the tables below reflect verified current state.

Complete spec: [`/api/docs/openapi/all`](/api/docs/openapi/all) (tags: **Internal Trusted**, **Public Form**)

## Internal trusted (service role / flow trust)

| Method | Path | Auth / notes |
| --- | --- | --- |
| POST | `/api/call` | Twilio Voice URL; `requireTwilioSignature` + handset session lookup |
| POST | `/api/inbound-verification` | Call-in verification TwiML; Twilio signature validated (SEC-06) |
| POST | `/api/twilio/a2p/events` | Event Streams sink (JSON); gated by `TWILIO_EVENTS_SINK_SECRET` (`?token=…` on the sink URL) |

## Formerly documented security gaps — all closed

| Method | Path | Current state |
| --- | --- | --- |
| POST | `/api/dial/:number` | `requireTwilioSignature` in the action's `auth` (validated against the call's workspace subaccount) |
| POST | `/api/disconnect` | **Deleted** (SEC-05). Replacement: `POST /api/workspaces/:workspaceId/calls/:callSid/disconnect` with `calls.control` capability |
| POST | `/api/auto-dial/dialer` | **Deleted** (SEC-02). Replacement: `POST /api/workspaces/:workspaceId/campaigns/:campaignId/dialer/start` (authenticated) |
| POST | `/api/queues` | `requireJsonAuth` + `requireWorkspaceAccess` on every branch; workspace resolved server-side |
| POST | `/api/outreach_attempts/:id` | `requireJsonAuth` + workspace check via `authForOutreachAttempt`; the legacy duplicate flat-route module no longer exists |
| GET/POST | `/api/verify-audio-session`, `/api/verify-pin-input`, `/api/verify-audio-pin/:pin` | Retired; return 410 |

## Public unauthenticated forms (not SDK)

| Method | Path | Purpose / protections |
| --- | --- | --- |
| POST | `/api/contact-form` | Marketing contact email; honeypot + DB-backed rate limit (5/min/IP) |
| POST | `/api/survey-answer` | Public survey respondent; rate limit + honeypot + signed respondent token |
| POST | `/api/survey-complete` | Public survey completion; rate limit + honeypot + signed respondent token |

## Unsupported exposure class

Inventory entries marked `unsupported` or `internalOnly` include `x-callcaster-supported: false` in the complete OpenAPI spec.

## See also

- [Auth matrix](./api-auth-matrix.md)
- [Webhooks (properly signed)](./api-webhooks.md)
- [Complete inventory](./api-surface-inventory.md)
- [Public API overview](./api-overview.md)
