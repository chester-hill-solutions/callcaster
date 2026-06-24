# Telephony Provisioning API

Workspace-scoped JSON routes for Twilio compliance, numbers, caller ID, and inbound routing.

Auth: `Authorization: Bearer <access_token>` or session cookie. Workspace admin required for mutations.

## Onboarding

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/onboarding` | State, A2P blocking issues, credits |
| PATCH | `/api/workspaces/:workspaceId/onboarding` | Partial state update |
| POST | `/api/workspaces/:workspaceId/onboarding/actions` | Wizard actions |

### Actions (`POST .../onboarding/actions`)

Body includes `"action"` and action-specific fields:

- `save_channels`
- `bootstrap_messaging_service`
- `save_business_profile`
- `review_emergency_voice`
- `provision_a2p`
- `save_rcs`
- `advance_step`
- `skip_first_number`
- `verify_caller_id`

Poll `GET .../onboarding` until `status` indicates readiness.

## Numbers

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/numbers` | List owned numbers |
| GET | `/api/workspaces/:workspaceId/numbers?available=1&...` | Search available numbers |
| POST | `/api/workspaces/:workspaceId/numbers` | Purchase `{ "phone_number": "+1..." }` |
| PATCH | `/api/workspaces/:workspaceId/numbers/:numberId` | Inbound config |
| DELETE | `/api/workspaces/:workspaceId/numbers/:numberId` | Release number |

Flat aliases: `GET/POST /api/numbers` (search/purchase with JSON body).

## Caller ID

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/caller-id` | Start verification `{ workspace_id, phone_number, friendly_name }` |

## Inbound queues

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST/PUT/PATCH/DELETE | `/api/inbound-queue` | Queue CRUD (JSON body with `workspace_id`) |

Assign queues to numbers via `PATCH .../numbers/:numberId` with `inbound_queue_id`.

## Webhook (outbound events)

| Method | Path | Purpose |
| --- | --- | --- |
| GET/PUT | `/api/workspaces/:workspaceId/webhook` | Read/update destination URL |
| POST | `/api/workspaces/:workspaceId/webhook` | Test delivery |

## See also

- [Agent quickstart](./api-agent-quickstart.md)
- [Live operations](./api-live-operations.md)
