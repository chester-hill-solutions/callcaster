# CallCaster Public API Overview

## Purpose

CallCaster documents **user-facing HTTP APIs** at [`/docs`](/docs): everything a signed-in user (session cookie) or workspace API key can call to run a workspace — campaigns, contacts, audiences, scripts, dialer/call-screen, messaging, exports, and workspace admin.

**Integrator automation** (API-key JSON endpoints with detailed schemas) is a subset documented under the **Integrator API** tag. **Webhooks, internal telephony workers, and security gaps** are in the [complete surface spec](/docs?spec=complete) only.

## Interactive docs

- **Public API (Scalar):** [`/docs`](/docs) — workspace control, campaigns, contacts, telephony, messaging (session or API key)
- **Complete API surface:** [`/docs?spec=complete`](/docs?spec=complete) — webhooks, internal routes, security gaps
- **Public OpenAPI JSON:** [`/api/docs/openapi`](/api/docs/openapi)
- **Complete OpenAPI JSON:** [`/api/docs/openapi/all`](/api/docs/openapi/all)

Human guides: [API auth matrix](./api-auth-matrix.md), [complete inventory](./api-surface-inventory.md), [workspace admin](./api-workspace-admin.md), [webhooks](./api-webhooks.md), [internal/unsupported](./api-internal-unsupported.md).

---

## Quickstart

Set `BASE_URL` to your CallCaster origin (e.g. `https://app.example.com`).

```bash
export BASE_URL="https://app.example.com"
export API_KEY="cc_live_your_key_here"
export WORKSPACE_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X POST "$BASE_URL/api/campaigns/create-with-script" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "title": "API test campaign",
    "type": "live_call",
    "caller_id": "+15551234567",
    "script_id": 42,
    "status": "draft"
  }'
```

With API key auth, `workspace_id` is optional (inferred from the key). With session cookie auth, include `workspace_id` in every request body.

---

## Authentication

### Session (browser)

Send the session cookie (`sb-access-token`). Public routes require `workspace_id` in the JSON body and enforce workspace access via `requireWorkspaceAccess`.

### Workspace API key (server/scripts)

Send either:

- `X-API-Key: cc_live_...`
- `Authorization: Bearer cc_live_...`

The workspace is inferred from the key. If you send `workspace_id` in the body, it **must match** the key's workspace or the request returns `403`.

### API key setup

API keys are created in the workspace **Settings** UI (session required). The admin endpoint `POST /api/workspace-api-keys` is **not** part of the public integrator API.

1. Sign in to CallCaster in a browser.
2. Open workspace **Settings** and create an API key.
3. Copy the key once (shown only at creation); store it securely.
4. Use the key as `X-API-Key` or `Authorization: Bearer` in server-side scripts.

Never commit API keys to source control.

---

## Error shape

JSON errors use a consistent shape:

```json
{ "error": "Human-readable message" }
```

Validation errors from Zod-backed public routes may include field paths, e.g. `title: String must contain at least 1 character(s)`.

### Error catalog (public routes)

| Status | Typical cause | Examples |
|--------|---------------|----------|
| `400` | Validation or business rule | Missing `title`; invalid UUID; both `script` and `script_id` sent; `caller_id` not in workspace; `user_id` required for API key on `/api/sms` |
| `401` | Missing or invalid auth | Invalid API key; no session cookie |
| `403` | Workspace mismatch | `workspace_id` in body does not match API key workspace |
| `404` | Not found (chat SMS) | Invalid phone number normalization |
| `405` | Wrong HTTP method | Non-POST to action route |
| `500` | Server/Twilio failure | Twilio send error; database error |

---

## Public endpoints (OpenAPI)

The public spec at [`/api/docs/openapi`](/api/docs/openapi) documents **all user-facing routes** grouped by area (Campaigns, Workspace, Contacts, Telephony, etc.).

### Integrator API (detailed schemas + SDK)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/campaigns/create-with-script` | One-shot campaign creation with script, caller ID, audiences |
| `POST` | `/api/chat_sms` | Send a single SMS to a contact |
| `POST` | `/api/sms` | Dispatch SMS to queued contacts on a message campaign |

See dedicated guides:

- [Create campaign with script](./api-create-campaign-with-script.md)
- [Send SMS](./api-send-sms.md)

### Session workspace control (also in public spec)

Campaign CRUD, contacts, audiences, scripts, dialer/call-screen, exports, workspace settings, and API key management — browse by tag in Scalar or see [workspace admin](./api-workspace-admin.md), [data management](./api-data-management.md), [telephony control](./api-telephony-control.md), [analytics & export](./api-analytics-export.md).

---

## Generated SDK (Hey API)

Codegen uses **`openapi/integrator-api.json`** (integrator paths only). After `npm run tools:api:codegen`:

```ts
import { createCampaignWithScript } from "@/lib/api-generated/sdk.gen";

const { data, error } = await createCampaignWithScript({
  body: {
    title: "My campaign",
    type: "live_call",
    caller_id: "+15551234567",
    script_id: 42,
  },
  headers: { "X-API-Key": process.env.CALLCASTER_API_KEY! },
});
```

Generated types live under [`app/lib/api-generated/`](../app/lib/api-generated/). Route validation still uses hand-written Zod in [`app/lib/schemas/api/`](../app/lib/schemas/api/) for rules OpenAPI cannot express (e.g. script XOR).

---

## Route categories (complete spec only)

| Category | Examples | Documentation |
|----------|----------|---------------|
| Twilio webhooks | `/api/call-status`, `/api/sms/status`, `/api/ivr/*` | [Webhooks map](./api-webhooks.md) |
| Stripe webhook | `/api/stripe-webhook` | [Stripe webhook](./stripe-webhook.md) |
| Internal / security gaps | `/api/auto-dial/dialer`, `/api/queues`, legacy outreach | [Internal & unsupported](./api-internal-unsupported.md) |

User-facing dialer, campaign, and workspace routes are in the **public** spec, not this table.

## Script JSON

Campaign scripts use a pages/blocks JSON structure. See [Script JSON format](./script-json-format.md).

## Coverage note

The public OpenAPI spec documents user-facing session and integrator routes. The [complete inventory](./api-surface-inventory.md) adds webhooks, internal workers, and security gaps.

## CORS

Browser clients should use session cookies on the app origin. Public JSON APIs are intended for server-to-server integration; cross-origin browser access is not enabled at the Express layer by default.
