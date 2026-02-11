# Create campaign with script and phone number (one-shot API)

## Overview

This endpoint creates a call campaign in a single request: it can create a script, create the campaign with a caller ID (phone number), and attach audiences (with optional contact enqueue). Use it for programmatic or API-key–driven setup without multiple round-trips.

**Endpoint:** `POST /api/campaigns/create-with-script`

**Authentication:** Session (cookie) or workspace API key.

---

## Authentication

- **Session:** Send the usual session cookie. `workspace_id` is **required** in the body and must be a workspace the user can access.
- **API key:** Send `X-API-Key: cc_...` or `Authorization: Bearer cc_...`. The workspace is taken from the key; if you send `workspace_id` in the body it must match the key’s workspace.

---

## Request

**Content-Type:** `application/json`

**Method:** `POST`

### Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspace_id` | string (UUID) | Required for session; optional for API key | Workspace to create the campaign in. Must match API key when using API key auth. |
| `title` | string | Yes | Campaign title. |
| `type` | string | Yes | One of: `live_call`, `robocall`, `simple_ivr`, `complex_ivr`. |
| `caller_id` | string | Yes | Outbound caller ID. Must be a phone number that belongs to the workspace (e.g. from workspace numbers). |
| `script` | object | One of `script` or `script_id` | Inline script to create and attach. |
| `script.name` | string | If using `script` | Script display name. |
| `script.type` | string | No | `script` (live_call) or `ivr` (IVR types). Defaults from campaign `type` if omitted. |
| `script.steps` | object | If using `script` | Script content (e.g. `pages`, `blocks`). See [Script JSON Format](./script-json-format.md). Defaults to `{ "pages": {}, "blocks": {} }` if omitted. |
| `script_id` | number | One of `script` or `script_id` | ID of an existing script in the workspace to attach. |
| `audience_ids` | number[] | No | Audience IDs to attach. Must belong to the workspace. |
| `enqueue_audience_contacts` | boolean | No | If `true` (default), contacts from attached audiences are enqueued for the campaign. If `false`, only the campaign–audience link is created. |
| `status` | string | No | Campaign status (e.g. `draft`, `active`). Default: `draft`. |
| `is_active` | boolean | No | Whether the campaign is active. |
| `start_date` | string \| null | No | Campaign start date. |
| `end_date` | string \| null | No | Campaign end date. |
| `schedule` | object | No | Campaign schedule payload. |

### Example (inline script + audiences)

```json
{
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Q1 outbound campaign",
  "type": "live_call",
  "caller_id": "+15551234567",
  "script": {
    "name": "Main script",
    "type": "script",
    "steps": {
      "pages": {
        "page_1": {
          "id": "page_1",
          "title": "Intro",
          "blocks": ["block_1"]
        }
      },
      "blocks": {
        "block_1": {
          "id": "block_1",
          "type": "textarea",
          "title": "Opening",
          "content": "Hello, this is [Company].",
          "options": [],
          "audioFile": ""
        }
      }
    }
  },
  "audience_ids": [1, 2],
  "status": "draft",
  "enqueue_audience_contacts": true
}
```

### Example (existing script, API key)

When using an API key, `workspace_id` can be omitted (workspace comes from the key):

```json
{
  "title": "Follow-up campaign",
  "type": "robocall",
  "caller_id": "+15559876543",
  "script_id": 42,
  "audience_ids": [3],
  "status": "draft"
}
```

---

## Response

### Success (201 Created)

**Body:**

| Field | Type | Description |
|-------|------|-------------|
| `campaign` | object | Created campaign row (e.g. `id`, `title`, `workspace`, `type`, `caller_id`, `status`). |
| `campaignDetails` | object | Type-specific details (e.g. `live_campaign` / `ivr_campaign`) including `campaign_id`, `script_id`. |
| `script` | object | Present only when a script was created in this request. Contains `id`, `name`, `type`, `steps`. |
| `audiences_linked` | number | Number of campaign–audience links created. |
| `contacts_enqueued` | number | Total contacts added to the campaign queue. |

**Example:**

```json
{
  "campaign": {
    "id": 123,
    "title": "Q1 outbound campaign",
    "workspace": "550e8400-e29b-41d4-a716-446655440000",
    "type": "live_call",
    "caller_id": "+15551234567",
    "status": "draft"
  },
  "campaignDetails": {
    "campaign_id": 123,
    "script_id": 456
  },
  "script": {
    "id": 456,
    "name": "Main script",
    "type": "script",
    "steps": { "pages": {}, "blocks": {} }
  },
  "audiences_linked": 2,
  "contacts_enqueued": 150
}
```

### Errors

| Status | Meaning |
|--------|--------|
| 400 | Validation: missing/invalid body, invalid `type`, missing `script`/`script_id`, invalid `caller_id` or `audience_ids`, or campaign/script creation failed. |
| 401 | Missing or invalid session / API key. |
| 403 | API key used but `workspace_id` in body does not match the key’s workspace. |
| 405 | Method not POST. |

Error responses are JSON with an `error` string, e.g.:

```json
{ "error": "caller_id must be a phone number that belongs to this workspace" }
```

---

## Validation rules

- **caller_id:** Must appear in the workspace’s phone numbers (e.g. `workspace_number` for that workspace).
- **audience_ids:** Each ID must be an audience in the same workspace.
- **type:** Only script-based campaign types are allowed: `live_call`, `robocall`, `simple_ivr`, `complex_ivr`.
- **script vs script_id:** Exactly one of `script` (inline script) or `script_id` (existing script) must be provided.

---

## Related docs

- [Script JSON format](./script-json-format.md) – structure of `script.steps` (pages, blocks).
- **Interactive API docs** – OpenAPI 3.0 spec and try-it-out UI at `/docs` (Scalar). Raw spec: `/api/docs/openapi`.
- Workspace API keys: create and manage keys in the workspace settings; use the key as `X-API-Key` or `Authorization: Bearer <key>` for this endpoint.
