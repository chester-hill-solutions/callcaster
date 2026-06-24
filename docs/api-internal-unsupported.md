# Internal & Unsupported API Routes

Routes that are callable over HTTP but **not supported for external integrators**. Some are internal telephony helpers; others are documented **security gaps** pending hardening.

Complete spec: [`/api/docs/openapi/all`](/api/docs/openapi/all) (tags: **Internal Trusted**, **Security Gap**, **Public Form**)

## Internal trusted (service role / flow trust)

| Method | Path | Risk / notes |
| --- | --- | --- |
| POST | `/api/auto-dial/dialer` | No user auth; trusts `workspace_id` / `user_id` in JSON |
| POST | `/api/call` | Twilio Voice URL; handset cookie lookup; no Twilio signature |
| POST | `/api/inbound-verification` | Call-in verification TwiML; service role; no Twilio signature |
| POST | `/api/verify-pin-input` | Twilio gather callback; service role; no Twilio signature |

## Security gaps (weak / unknown auth)

| Method | Path | Risk / notes |
| --- | --- | --- |
| POST | `/api/dial/:number` | TwiML sub-route without Twilio signature validation |
| POST | `/api/disconnect` | Twilio Device disconnect; account credentials only |
| POST | `/api/queues` | Session client without mandatory user check on all paths |
| POST | `/api/outreach_attempts/:id` | Duplicate legacy routes; weak session client (×2 modules) |
| GET/POST | `/api/verify-audio-session` | POST action returns TwiML without auth |

**Remediation:** add signature validation or session checks before promoting any of these to supported APIs.

## Public unauthenticated forms (not SDK)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/contact-form` | Marketing contact form email |
| POST | `/api/survey-answer` | Public survey respondent |
| POST | `/api/survey-complete` | Public survey completion |
| GET | `/api/verify-audio-pin/:pin` | Verification TwiML entry |

## Legacy duplicate

Two modules register **`POST /api/outreach_attempts/:id`**:

1. `app/routes/api+/outreach_attempts/$id.route.tsx`
2. `app/routes/api.outreach_attempts.$id.js` (legacy; typo table name)

Prefer **`POST /api/outreach-attempts`** for new work.

## Unsupported exposure class

Inventory entries marked `unsupported` or `internalOnly` include `x-callcaster-supported: false` in the complete OpenAPI spec.

## See also

- [Auth matrix](./api-auth-matrix.md)
- [Webhooks (properly signed)](./api-webhooks.md)
- [Complete inventory](./api-surface-inventory.md)
- [Public API overview](./api-overview.md)
