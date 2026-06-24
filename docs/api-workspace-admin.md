# Workspace & Admin API Routes

Session-scoped workspace administration endpoints. Documented in the **public** OpenAPI spec at [`/docs`](/docs) (Workspace Admin tag). Webhooks and internal routes are in [complete surface](/docs?spec=complete).

Spec: [`/api/docs/openapi`](/api/docs/openapi) · Auth: [auth matrix](./api-auth-matrix.md)

## Workspace settings

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/workspace` | Update workspace settings (JSON body) |

## API keys

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspace-api-keys` | List workspace API keys |
| POST | `/api/workspace-api-keys` | Create `cc_` prefixed API key |
| DELETE | `/api/workspace-api-keys` | Revoke API key |

Auth: workspace admin session + `requireWorkspaceAccess`.

## Phone numbers

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/numbers` | Search/purchase available numbers (query) |
| POST | `/api/numbers` | Purchase/provision number (form) |

## Agent presence

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/agent-status` | Read agent dialer status |
| POST | `/api/agent-status` | Update agent status |

## Webhook testing

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/test-webhook` | Send test payload to workspace webhook URL |

## Auth callback

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/callback` | Supabase email OTP exchange (public redirect flow) |

## Public integrator APIs (different guide)

Workspace API keys authenticate the [public integrator endpoints](./api-overview.md):

- `POST /api/campaigns/create-with-script`
- `POST /api/chat_sms`
- `POST /api/sms`

## See also

- [Complete inventory](./api-surface-inventory.md)
- [Stripe billing webhook setup](./stripe-webhook.md) (provider route, not session admin)
