# Agent API Quickstart

Headless lifecycle for CallCaster: register, authenticate, create a workspace, provision telephony, buy credits, and operate campaigns over JSON `/api` routes.

## Authentication

### Register

```bash
curl -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","password":"securepass123","first_name":"Agent","last_name":"Bot"}'
```

### Token (login)

```bash
curl -X POST "$BASE_URL/api/auth/token" \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","password":"securepass123"}'
```

Response includes `access_token`, `refresh_token`, and `user`. Use the access token for bearer auth:

```bash
export TOKEN="<access_token>"
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/me"
```

### Refresh

```bash
curl -X POST "$BASE_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"<refresh_token>"}'
```

## Workspace lifecycle

```bash
# List workspaces
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/workspaces"

# Create workspace
curl -X POST "$BASE_URL/api/workspaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Campaign Workspace"}'
```

Export `WORKSPACE_ID` from the response.

## Onboarding & telephony

See [Telephony provisioning](./api-telephony-provisioning.md) for the full compliance sequence:

1. `GET /api/workspaces/:id/onboarding`
2. `POST /api/workspaces/:id/onboarding/actions` — `save_channels`, `bootstrap_messaging_service`, `save_business_profile`, `provision_a2p`, etc.
3. `GET /api/workspaces/:id/numbers?available=1` — search numbers
4. `POST /api/workspaces/:id/numbers` — purchase
5. `PATCH /api/workspaces/:id/numbers/:numberId` — inbound config

## Billing

```bash
# Balance
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/workspaces/$WORKSPACE_ID/billing"

# Checkout
curl -X POST "$BASE_URL/api/workspaces/$WORKSPACE_ID/billing/checkout-session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":500}'

# Poll session after Stripe payment
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/workspaces/$WORKSPACE_ID/billing/sessions/$SESSION_ID"
```

## API keys (automation)

```bash
curl -X POST "$BASE_URL/api/workspaces/$WORKSPACE_ID/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"production agent"}'
```

Use `X-API-Key: cc_live_...` or `Authorization: Bearer cc_live_...` for integrator routes (`/api/sms`, `/api/chat_sms`, `/api/campaigns/create-with-script`) and dual-auth data routes.

## Campaign operations

See [Data plane API](./api-data-plane.md) for campaigns, contacts, audiences, scripts, and surveys.

## Dual auth summary

| Route class | API key | Bearer JWT | Cookie |
| --- | --- | --- | --- |
| Platform auth (register/token) | — | — | — |
| Workspace admin (billing, onboarding, members) | — | yes | yes |
| Data / campaigns / exports | yes | yes | yes |
| Dialer / handset / agent-status | — | yes | yes |

## Related guides

- [Auth matrix](./api-auth-matrix.md)
- [Telephony provisioning](./api-telephony-provisioning.md)
- [Data plane](./api-data-plane.md)
- [Live operations](./api-live-operations.md)
- [Admin API](./api-admin.md) (sudo)
