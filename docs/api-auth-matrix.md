# API Auth Matrix

How CallCaster authenticates callable HTTP routes. Use this matrix with the [complete surface inventory](./api-surface-inventory.md) and interactive specs at [`/docs`](/docs) (Public API) and [`/docs?spec=complete`](/docs?spec=complete) (Complete Surface).

Raw OpenAPI JSON:

- Public user + integrator spec: [`/api/docs/openapi`](/api/docs/openapi)
- Complete classified spec: [`/api/docs/openapi/all`](/api/docs/openapi/all)

## Auth modes

| Mode | OpenAPI tag | Typical caller | Headers / cookies |
| --- | --- | --- | --- |
| API key or session | Integrator API | Automation scripts, partners | `X-API-Key: cc_…` or `Authorization: Bearer cc_…`; or session cookie |
| Session | User API | Signed-in browser / API client | Supabase session cookie (`sb-access-token` family) |
| Workspace admin | Workspace Admin | Workspace owners/admins | Session + workspace membership/role checks |
| Twilio signature | Provider Webhook | Twilio | `X-Twilio-Signature` + `application/x-www-form-urlencoded` body |
| Stripe signature | Provider Webhook | Stripe | `Stripe-Signature` + raw JSON body |
| Public form | Public Form | Anonymous visitors | None (surveys, contact form, auth callback) |
| Internal trusted | Internal Trusted | App telephony workers | Service-role DB access; body/context trust |
| Security gap | Security Gap | Anyone callable | Weak or missing auth — documented, not supported |

## Workspace scoping

Many session routes require `workspace_id` in the query string or JSON/form body. Workspace admin routes additionally require owner/admin role via `requireWorkspaceAccess`.

API key auth resolves the workspace from the key. If the request body includes `workspace_id`, it must match the key's workspace.

## Public integrator boundary (SDK / codegen)

These three paths have **detailed OpenAPI schemas** and generated Hey API client code (`openapi/integrator-api.json`):

- `POST /api/campaigns/create-with-script`
- `POST /api/chat_sms`
- `POST /api/sms`

All other user-facing routes are documented in the public spec with conservative schemas; use the Scalar docs and [human guides](./api-auth-matrix.md) for session/form endpoints.

## Not in the public spec

Provider webhooks, internal telephony workers, legacy duplicates, and documented security gaps — see [complete inventory](./api-surface-inventory.md) and [internal/unsupported](./api-internal-unsupported.md).

## Related guides

- [Workspace & admin APIs](./api-workspace-admin.md)
- [Data management APIs](./api-data-management.md)
- [Analytics & export APIs](./api-analytics-export.md)
- [Telephony & dialer control](./api-telephony-control.md)
- [Webhooks (Twilio & Stripe)](./api-webhooks.md)
- [Internal & unsupported routes](./api-internal-unsupported.md)
