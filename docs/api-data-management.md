# Data Management API Routes

Session APIs for contacts, audiences, scripts, campaigns, and related media. In the **public** OpenAPI spec (User API tag); integrator JSON shortcuts are under Integrator API.

Spec: [`/api/docs/openapi`](/api/docs/openapi) · UI: [`/docs`](/docs)

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

POST `/api/campaign_queue` reserves queue order on the server. Omitted or supplied
`startOrder` values cannot change the reserved range. Concurrent requests reserve
separate ranges. Existing campaign/contact uniqueness and explicit `requeue`
behavior still apply; order reservation is not duplicate-send protection.

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

### Media upload limits

`POST /api/media` requires a positive decimal safe integer in `live_campaign_id`. Missing or invalid identifiers return **400**. A missing campaign or one outside the requested workspace returns **404** before file allocation, upload, signing or attachment. A successful attachment retains **201** and its audio URL; an empty or failed final update returns **500**. Workspace access and file validation still apply.

`POST /api/media` accepts audio in the existing supported formats, including WebM and OGA. `POST /api/message_media` retains its image/audio extension and MIME policy. Both accept a file up to **10 MiB (10,485,760 bytes)**. Validation precedes application file buffering and object storage. Audio storage keys use a generated identifier and a safe filename; `campaign_name` cannot set their path structure.

The encoded body for both uploads and `DELETE /api/message_media` is limited to **10,551,296 bytes**: 10 MiB plus 64 KiB for form fields, multipart headers, and boundaries. Keep all fields and overhead within that total. The reader checks actual stream bytes, including requests with no Content-Length or a false low value. It stops and cancels the source on overflow; an oversized declared length is rejected before reading.

Body overflow returns **413** with an `error` string. Invalid form encoding returns **400**. Message-media errors also include `success: false` and retain session response headers. Its existing file validation failures retain **200** with `success: false` and `error`; the audio route returns **413** for an oversized file and **400** for other file validation failures. Successful response shapes stay the same.

These are per-request byte bounds. They do not establish a process memory ceiling under concurrent uploads or a specific number of resident buffer copies.
