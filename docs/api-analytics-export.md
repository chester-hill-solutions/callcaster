# Analytics & Export API Routes

Session endpoints for async exports and call-status polling. Documented in the **public** OpenAPI spec.

Spec: [`/api/docs/openapi`](/api/docs/openapi) · UI: [`/docs`](/docs)

## Campaign export

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/campaign-export` | Start async campaign CSV export |
| GET | `/api/campaign-export-status` | Poll export job by `exportId` |

Auth: session + workspace access. Request/export contract: [csv-export-contract.md](./csv-export-contract.md)

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
