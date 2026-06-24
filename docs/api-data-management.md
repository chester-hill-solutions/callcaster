# Data Management API Routes

Session APIs for contacts, audiences, scripts, campaigns, and related media. **Not integrator SDK endpoints.**

Spec: [`/api/docs/openapi/all`](/api/docs/openapi/all) · UI: [`/docs?spec=complete`](/docs?spec=complete)

## Contacts

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/contacts` | Search/list contacts |
| POST | `/api/contacts` | Create contact |
| PATCH | `/api/contacts` | Update contact |

## Audiences

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/audiences` | List audiences |
| PATCH | `/api/audiences` | Update audience |
| DELETE | `/api/audiences` | Delete audience |
| POST | `/api/audience-upload` | Upload CSV (multipart) |
| GET | `/api/audience-upload-status` | Poll upload job |
| DELETE | `/api/contact-audience` | Remove contact from audience |
| DELETE | `/api/contact-audience/bulk-delete` | Bulk remove contacts |

## Campaigns & queue

| Method | Path | Purpose |
| --- | --- | --- |
| POST/PATCH/DELETE | `/api/campaigns` | Campaign CRUD |
| POST/DELETE | `/api/campaign_audience` | Link audience, enqueue contacts |
| POST/DELETE | `/api/campaign_queue` | Queue row operations |
| POST | `/api/reset_campaign` | Reset campaign via RPC |

## Scripts & surveys

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/scripts` | Create/update script (JSON) |
| POST/PATCH/DELETE | `/api/surveys` | Survey CRUD |
| POST | `/api/survey-responses` | Agent-side survey response capture |

Script JSON shape: [script-json-format.md](./script-json-format.md)

## Media

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/media` | Live campaign audio upload |
| POST/DELETE | `/api/message_media` | Campaign MMS media |

## Public integrator shortcut

For automated campaign setup with script + audiences, use the supported API:

- [Create campaign with script](./api-create-campaign-with-script.md) — `POST /api/campaigns/create-with-script`

## See also

- [Auth matrix](./api-auth-matrix.md)
- [Complete inventory](./api-surface-inventory.md)
