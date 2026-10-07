# Telephony Provisioning API

Workspace-scoped JSON routes for Twilio compliance, numbers, caller ID, and inbound routing.

Auth: `Authorization: Bearer <access_token>` or session cookie. Workspace admin required for mutations.

## Onboarding

| Method | Path                                              | Purpose                             |
| ------ | ------------------------------------------------- | ----------------------------------- |
| GET    | `/api/workspaces/:workspaceId/onboarding`         | State, A2P blocking issues, credits |
| PATCH  | `/api/workspaces/:workspaceId/onboarding`         | Partial state update                |
| POST   | `/api/workspaces/:workspaceId/onboarding/actions` | Wizard actions                      |

### Actions (`POST .../onboarding/actions`)

Body includes `"action"` and action-specific fields:

- `save_channels`
- `bootstrap_messaging_service`
- `save_business_profile`
- `review_emergency_voice`
- `provision_a2p`
- `save_rcs`
- `advance_step`
- `skip_first_number`
- `verify_caller_id`

For `save_business_profile` and `save_channels`, the A2P identity fields are:

| Field                  | Value                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `a2pCompanyType`       | Explicit `government`, `non-profit`, `private`, or `public`; no inferred value or default                                                                                                                                            |
| `a2pStockExchange`     | Required for `public`; one of `AMEX`, `AMX`, `ASX`, `B3`, `BME`, `BSE`, `FRA`, `ICEX`, `JPX`, `JSE`, `KRX`, `LON`, `NASDAQ`, `NONE`, `NYSE`, `NSE`, `OMX`, `OTHER`, `SEHK`, `SGX`, `SSE`, `STO`, `SWX`, `SZSE`, `TSX`, `TWSE`, `VSE` |
| `a2pStockTicker`       | Required non-empty text for `public`                                                                                                                                                                                                 |
| `a2pBrandContactEmail` | Required organization representative email for `public`; Twilio checks its eligibility                                                                                                                                               |

Omitted fields retain their saved values. An empty string clears a field. Invalid company, exchange or email values return 400 before any save. When A2P is selected, the business identity step requires the company type and the three public-company fields. Non-public profiles do not send stock or representative email attributes to Twilio.

`provision_a2p` prepares the Messaging Profile EndUser, assigns it and the Secondary Customer Profile to the Trust Product, evaluates compliance, and submits the product before registering a brand. Retry the action after correcting a visible preparation error. The action recovers saved or matching provider resources after a lost response; it does not blindly repeat a create request. Changing the four identity fields invalidates preparation and requires another preparation attempt.

Poll `GET .../onboarding` for preparation errors and provider status. `a2p10dlc.messagingProfileStatus = ready` confirms accepted preparation, not brand or campaign approval. Sending also requires the saved EndUser and Trust Product IDs and approved brand/campaign state. A later rejected or unreadable Trust Product closes this readiness gate. Public-company Authentication+ verification remains a provider requirement; a saved contact email is not proof of completion.

## Numbers

| Method | Path                                                   | Purpose                                |
| ------ | ------------------------------------------------------ | -------------------------------------- |
| GET    | `/api/workspaces/:workspaceId/numbers`                 | List owned numbers                     |
| GET    | `/api/workspaces/:workspaceId/numbers?available=1&...` | Search available numbers               |
| POST   | `/api/workspaces/:workspaceId/numbers`                 | Purchase `{ "phone_number": "+1..." }` |
| PATCH  | `/api/workspaces/:workspaceId/numbers/:numberId`       | Inbound config                         |
| DELETE | `/api/workspaces/:workspaceId/numbers/:numberId`       | Release number                         |

Flat aliases: `GET/POST /api/numbers` (search/purchase with JSON body).

Roles: listing numbers is open to any workspace member. Purchasing, updating, and releasing a number require the `member` role or above — the `caller` role receives 403. This applies equally to the flat aliases.

## Caller ID

| Method | Path             | Purpose                                                            |
| ------ | ---------------- | ------------------------------------------------------------------ |
| POST   | `/api/caller-id` | Start verification `{ workspace_id, phone_number, friendly_name }` |

## Inbound queues

| Method                    | Path                 | Purpose                                    |
| ------------------------- | -------------------- | ------------------------------------------ |
| GET/POST/PUT/PATCH/DELETE | `/api/inbound-queue` | Queue CRUD (JSON body with `workspace_id`) |

Assign queues to numbers via `PATCH .../numbers/:numberId` with `inbound_queue_id`.

## Webhook (outbound events)

| Method  | Path                                   | Purpose                     |
| ------- | -------------------------------------- | --------------------------- |
| GET/PUT | `/api/workspaces/:workspaceId/webhook` | Read/update destination URL |
| POST    | `/api/workspaces/:workspaceId/webhook` | Test delivery               |

## See also

- [Agent quickstart](./api-agent-quickstart.md)
- [Live operations](./api-live-operations.md)
