# Analytics & Export API Routes

Session and bearer JSON endpoints for workspace analytics, exports, and survey CSV download. Documented in the **public** OpenAPI spec.

Spec: [`/api/docs/openapi`](/api/docs/openapi) · UI: [`/docs`](/docs)

Auth: `requireJsonAuth` (session cookie or `Authorization: Bearer <access_token>`). Workspace API keys are not used on these routes.

## Workspace analytics & media

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/analytics` | Workspace operator analytics (`from`, `to`, `userId` query params) |
| GET/POST | `/api/workspaces/:workspaceId/audios` | List workspace audio library / upload (multipart `name`, `file`) |
| GET | `/api/workspaces/:workspaceId/voicemails` | List voicemail recordings |
| GET | `/api/campaigns/:campaignId/results` | Campaign disposition stats |
| GET/POST | `/api/workspaces/:workspaceId/exports` | Export job history / start async campaign CSV export (JSON `campaign_id`) |
| GET | `/api/surveys/:surveyId/responses/export` | Survey responses CSV (`workspace_id` query required) |

## Campaign export (legacy flat path)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/campaign-export` | Start async campaign CSV export (form body; prefer workspace exports POST) |
| GET | `/api/campaign-export-status` | Poll export job by `exportId` |

Request/export contract: [csv-export-contract.md](./csv-export-contract.md)

## Call status polling

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/call-status-poll` | Poll Twilio call status for call-screen UI |

Used by the live call UI; requires session and workspace scope.

## Related session analytics

Outreach and disposition data are written via telephony session routes (see [telephony control](./api-telephony-control.md)):

- `POST /api/outreach-attempts`
- `POST /api/questions`

## See also

- [Complete inventory](./api-surface-inventory.md)
- [Public API overview](./api-overview.md) (integrator boundary)
