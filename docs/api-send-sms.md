# Send SMS (Public API)

CallCaster exposes two SMS endpoints for integrators. Both support **session cookie** or **workspace API key** authentication.

- **Interactive docs:** [`/docs`](/docs)
- **Overview:** [API overview](./api-overview.md)

---

## Direct SMS — `POST /api/chat_sms`

Send a single SMS to one phone number. Optional `contact_id` enables template tag substitution from the contact record.

### Request

**Content-Type:** `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspace_id` | UUID | Yes | Workspace scope. Must match API key when using key auth. |
| `to_number` | string | Yes | Recipient phone (E.164 recommended). |
| `caller_id` | string | Yes | Workspace outbound number. |
| `body` | string | Yes | Message text (may be empty string). |
| `contact_id` | string | No | Contact ID for `[tag]` substitution. |
| `media` | string | No | Media URL/path for MMS. |
| `message_intent` | string | No | Twilio message intent. |
| `messaging_service_sid` | string | No | Messaging Service SID override. |

### Example (API key)

```bash
curl -X POST "$BASE_URL/api/chat_sms" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: cc_live_..." \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "to_number": "+15551234567",
    "caller_id": "+15559876543",
    "body": "Hello from CallCaster"
  }'
```

### Responses

| Status | Meaning |
|--------|---------|
| `201` | Message sent (`data`, `message` in body) |
| `400` | Validation error |
| `401` | Missing/invalid auth |
| `403` | `workspace_id` mismatch with API key |
| `404` | Invalid phone number |
| `500` | Twilio or server error |

---

## Campaign SMS dispatch — `POST /api/sms`

**Legacy batch path:** sends SMS to all **queued** contacts on a **message campaign**. Processes template tags per contact and respects campaign media/settings.

### Caveats

- Dispatches to the campaign queue in batches (not the primary queue-next dispatcher).
- Duplicate sends to the same number are skipped and the queue row is dequeued.
- When using **API key** auth, `user_id` is **required** for outreach attribution.
- `caller_id` may be required depending on campaign `sms_send_mode`.

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspace_id` | UUID | Yes | Workspace scope. |
| `campaign_id` | string | Yes | Message campaign ID. |
| `user_id` | string | API key only | User UUID for outreach records. |
| `caller_id` | string | Conditional | Required when campaign send mode requires caller ID. |
| `message_intent` | string | No | Twilio intent override. |
| `messaging_service_sid` | string | No | Messaging Service SID override. |

### Example (API key)

```bash
curl -X POST "$BASE_URL/api/sms" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: cc_live_..." \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "campaign_id": "123",
    "user_id": "user-uuid-here",
    "caller_id": "+15559876543"
  }'
```

### Response

`200` with `{ "responses": [ ... ] }` — array of per-contact result objects keyed by `contact_id`.

---

## Authentication

See [API overview — Authentication](./api-overview.md#authentication).

## Related

- [Create campaign with script](./api-create-campaign-with-script.md)
- [Script JSON format](./script-json-format.md)
