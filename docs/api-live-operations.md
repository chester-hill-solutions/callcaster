# Live Operations API

Bearer/session routes for dialer, call screen, handset, and call log. Not available with workspace API keys alone.

## Call log

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/calls` | Paginated call history |
| POST/DELETE | `/api/workspaces/:workspaceId/calls/listening` | Start/stop live listening |

## Handset

| Method | Path | Purpose |
| --- | --- | --- |
| GET/DELETE | `/api/workspaces/:workspaceId/handset/session` | Handset session state |
| GET | `/api/handset-token?workspace_id=` | Twilio token (legacy flat path) |

## Call screen

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/campaigns/:campaignId/call-session?workspace_id=` | Bootstrap queue, token, results |
| POST | `/api/campaigns/:campaignId/call-session/release` | Release assigned queue rows |

## Live call actions (session bearer)

Existing flat routes (see [Telephony control](./api-telephony-control.md)):

- `POST /api/dial`, `/api/hangup`, `/api/audiodrop`
- `POST /api/questions`, `/api/outreach-attempts`
- `POST /api/initiate-ivr`, `/api/ivr`
- `GET /api/call-status-poll`, `/api/token`
- `GET/POST /api/agent-status`

## See also

- [Telephony control](./api-telephony-control.md)
- [Telephony provisioning](./api-telephony-provisioning.md)
