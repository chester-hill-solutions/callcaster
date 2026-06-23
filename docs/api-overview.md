# CallCaster Public API Overview

## Purpose

CallCaster exposes a **small, documented public API** for programmatic integration (scripts, partners, automation). Most routes under `/api/*` are **internal**: dialer controls, Twilio webhooks, React Router form actions, and UI fetchers. Those are intentionally **not** listed in OpenAPI.

## Interactive docs

- **Scalar UI:** [`/docs`](/docs) — try-it-out API reference
- **Raw OpenAPI 3.0 spec:** [`/api/docs/openapi`](/api/docs/openapi)

## Authentication

### Session (browser)

Send the session cookie (`sb-access-token`). Most session-authenticated routes require `workspace_id` in the JSON body and enforce workspace access via `requireWorkspaceAccess`.

### Workspace API key (server/scripts)

Send either:

- `X-API-Key: cc_live_...`
- `Authorization: Bearer cc_live_...`

The workspace is inferred from the key. If you send `workspace_id` in the body, it **must match** the key's workspace or the request returns `403`.

Create API keys in the workspace settings UI (session only): `POST /api/workspace-api-keys` is **not** part of the public integrator API.

## Error shape

JSON errors use a consistent shape:

```json
{ "error": "Human-readable message" }
```

Validation errors from Zod-backed public routes may include field paths, e.g. `title: String must contain at least 1 character(s)`.

## Public endpoints (OpenAPI)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/campaigns/create-with-script` | One-shot campaign creation with script, caller ID, audiences |
| `POST` | `/api/chat_sms` | Send a single SMS to a contact |
| `POST` | `/api/sms` | Dispatch SMS to queued contacts on a message campaign |

See dedicated guides:

- [Create campaign with script](./api-create-campaign-with-script.md)
- [Send SMS](./api-send-sms.md)

## Route categories (not public)

| Category | Examples | Documentation |
|----------|----------|---------------|
| Twilio webhooks | `/api/call-status`, `/api/sms/status`, `/api/ivr/*` | [Twilio webhook auth](./twilio-webhook-auth.md) |
| Stripe webhook | `/api/stripe-webhook` | [Stripe webhook](./stripe-webhook.md) |
| Dialer / IVR / queue UI | `/api/auto-dial`, `/api/dial`, `/api/campaign_queue` | Internal only |
| Session-only CRUD | `/api/scripts`, `/api/audiences`, `/api/contacts` | App UI only |
| API key admin | `/api/workspace-api-keys` | Workspace settings (session) |

## Script JSON

Campaign scripts use a pages/blocks JSON structure. See [Script JSON format](./script-json-format.md).

## Coverage note

OpenAPI documents **integrator-facing JSON APIs** only. Full `/api/*` route coverage is intentionally low (~80 internal routes vs 3 public endpoints) by design.

## Follow-up (not yet implemented)

- **Hey API codegen** (`@hey-api/openapi-ts`): generate Zod/types/SDK from the OpenAPI spec once the public endpoint set stabilizes. See [`.cursor/skills/hey-api-openapi/SKILL.md`](../.cursor/skills/hey-api-openapi/SKILL.md).
