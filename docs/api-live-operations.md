# Live Operations API

Bearer/session routes for dialer, call screen, handset, and call log. Dialer start also accepts a workspace API key with an authorized `agentUserId`. The other routes below require a user session.

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

`POST /api/workspaces/:workspaceId/campaigns/:campaignId/dialer/start` accepts `caller_id`, `selected_device`, and an optional UUID `dial_intent_id`. Use the same intent ID when retrying a request whose result is unknown. Use a new ID for a new call session. Workspace API keys also require `agentUserId`; the selected agent must have the caller role or above.

The start reserves four available credits for the first eligible recipient before it calls the agent. The setup and first recipient share this hold. The recipient call starts when the agent joins the conference. Later recipients each need a new hold. A credit refusal returns 402 before any provider call. An uncertain provider result retains its hold for recovery.

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

## Credits

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/credits` | Current credit balance for the workspace |

`GET /api/workspaces/:workspaceId/credits` — Returns the workspace's current credit balance. Response: `{ credits: number }`. Not exposed in the integrator OpenAPI surface.

Auth is session-only: a browser session cookie or a user bearer token. Workspace API keys are rejected with 401. Any workspace member may read the balance, including the `caller` role — the campaign call screen polls this endpoint to reconcile credits after a call.

## See also

- [Telephony control](./api-telephony-control.md)
- [Telephony provisioning](./api-telephony-provisioning.md)
