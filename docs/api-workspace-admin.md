# Workspace & Admin API Routes

Session-scoped workspace administration endpoints. Documented in the **public** OpenAPI spec at [`/docs`](/docs) (Workspace Admin tag). Webhooks and internal routes are in [complete surface](/docs?spec=complete).

Spec: [`/api/docs/openapi`](/api/docs/openapi) · Auth: [auth matrix](./api-auth-matrix.md)

## Workspace settings

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId` | Read workspace metadata (session or workspace API key) |
| PATCH | `/api/workspaces/:workspaceId` | Rename workspace (admin+ session) |
| DELETE | `/api/workspaces/:workspaceId` | Delete workspace (owner session) |

Legacy `POST /api/workspace` is removed (SEC-01). Use the scoped routes above.

## API keys

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/api-keys` | List workspace API keys (metadata only) |
| POST | `/api/workspaces/:workspaceId/api-keys` | Create `cc_live_` prefixed API key |
| DELETE | `/api/workspaces/:workspaceId/api-keys` | Revoke API key |

Legacy flat routes (`/api/workspace-api-keys`) remain for UI compatibility; prefer scoped routes above.

Auth: workspace member manager session (admin+ or member with manage rights).

## Members

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/members` | List members and pending invites |
| POST | `/api/workspaces/:workspaceId/members` | Invite member by email |
| PATCH | `/api/workspaces/:workspaceId/members` | Update member role |
| DELETE | `/api/workspaces/:workspaceId/members` | Remove member or cancel invite |

Auth: workspace member manager session. Privileged role changes require MFA (SEC-08).

## Customer webhooks

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/webhook` | Read webhook configuration |
| PUT | `/api/workspaces/:workspaceId/webhook` | Create or update webhook |
| POST | `/api/workspaces/:workspaceId/webhook` | Send test payload |

Production delivery uses `safeOutboundFetch` (SEC-04a). Destination URLs must pass SSRF validation.

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
