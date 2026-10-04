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
| GET | `/api/workspaces/:workspaceId/conversations?summary=unread` | Complete workspace unread message total |
| GET | `/api/workspaces/:workspaceId/conversations/:contactNumber` | Messages |
| POST | `/api/workspaces/:workspaceId/conversations/:contactNumber` | Mark received messages as read |
| POST | `/api/chat_sms` | Send message (integrator) |

Conversation GET and acknowledgment POST both require `campaigns.read`. A workspace API key must have that scope. Session users must be workspace members whose role has that capability, including the caller role. A key with no scopes or only unrelated scopes receives 403 and causes no message write. A non-member or a workspace mismatch receives 404.

The list GET accepts `summary=unread` to return `{ "unread_count": 106 }` instead of a conversation page. The total counts received inbound messages across the entire workspace, including conversations beyond the newest 100. It uses the same message and phone-matching rules as the per-conversation unread pills. Pagination, campaign, search and sort parameters do not narrow this workspace total. The count mode uses the same `campaigns.read` authorization as the list. Unknown summary modes return 400; database failures return a safe 500 error, not a false zero. Without `summary`, the list response and pagination are unchanged.

The acknowledgment POST accepts JSON `{ "sid": "SM..." }` for one received message. Without `sid`, it marks received messages for the URL's contact number as read. The stored status changes from `received` to `delivered` for these incoming messages; this operation does not set outbound provider delivery receipts. It returns `{ "ok": true }` on success. Other methods receive 405 after authorization.

## See also

- [Analytics & export](./api-analytics-export.md)
- [Agent quickstart](./api-agent-quickstart.md)
