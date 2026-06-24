# Data Plane API

Read/write JSON routes for campaigns, contacts, audiences, scripts, surveys, and conversations.

Auth: `verifyApiKeyOrSession` — workspace API key, bearer JWT, or session cookie.

## Campaigns

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/campaigns` | List campaigns |
| GET | `/api/campaigns/:campaignId?workspace_id=` | Detail + queue counts |
| POST | `/api/campaigns/:campaignId?operation=duplicate` | Duplicate |
| POST | `/api/campaigns/:campaignId?operation=status` | Status transition |
| GET/PATCH | `/api/campaigns/:campaignId/queue` | Queue list / bulk update |

Legacy write routes remain: `POST/PATCH/DELETE /api/campaigns`, `/api/campaign_queue`, `/api/campaign_audience`.

## Contacts

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/contacts` | Paginated list |
| GET | `/api/contacts/:contactId?workspace_id=` | Detail |
| DELETE | `/api/contacts/:contactId` | Delete |
| POST/PATCH | `/api/contacts` | Create/update (legacy) |

## Audiences

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/audiences` | List |
| GET | `/api/workspaces/:workspaceId/audiences/:audienceId` | Detail + contacts |
| GET | `/api/workspaces/:workspaceId/audience-uploads/:uploadId` | Upload job status |

Legacy: `GET/PATCH/DELETE /api/audiences`, `POST /api/audience-upload`.

## Scripts & surveys

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/scripts` | List |
| GET | `/api/scripts/:scriptId?workspace_id=` | Detail |
| GET | `/api/workspaces/:workspaceId/surveys` | List |
| GET | `/api/surveys/:surveyId?workspace_id=` | Detail |
| GET | `/api/surveys/:surveyId/responses` | Responses + stats |

## Conversations (SMS chat)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/conversations` | Thread list |
| GET | `/api/workspaces/:workspaceId/conversations/:contactNumber` | Messages |
| POST | `/api/chat_sms` | Send message (integrator) |

## See also

- [Analytics & export](./api-analytics-export.md)
- [Agent quickstart](./api-agent-quickstart.md)
