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

### Ownership transfer

`POST /api/workspaces/:workspaceId/transfer-ownership` requires an owner session
and a JSON body with `new_owner_user_id`. Choose a different existing workspace
member who has enrolled in MFA. Self transfer returns 400 with a clear error
before any ownership change. A failed transfer also returns an error; it cannot
return success or record a successful transfer audit event. A successful transfer
promotes the chosen member to owner and changes the previous owner to admin.

## API keys

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/api-keys` | List workspace API keys (metadata only) |
| POST | `/api/workspaces/:workspaceId/api-keys` | Create `cc_live_` prefixed API key |
| DELETE | `/api/workspaces/:workspaceId/api-keys` | Revoke API key |

Legacy flat routes (`/api/workspace-api-keys`) remain for UI compatibility; prefer scoped routes above.

Auth: workspace **admin** session. API-key actors are refused (401) on the scoped
route, so a key cannot mint another key.

**Capability scope cap.** A key may only carry capabilities the creating member's
own role holds, per `CALLCASTER_ROLE_CAPABILITY_MATRIX`. Requesting a scope
outside that set returns 403 naming each disallowed capability. In practice an
owner can grant all eight capabilities and an admin can grant every one except
`audit.read`, which is owner-only. Scopes are fixed at creation — there is no
update path — so revoke and re-mint to change them.

## Members

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/members` | List members and pending invites (email-first, SEC-03) |
| POST | `/api/workspaces/:workspaceId/members` | Invite by email — invitee does not need an account; accepted via emailed link |
| PATCH | `/api/workspaces/:workspaceId/members` | Update member role |
| DELETE | `/api/workspaces/:workspaceId/members` | Remove member or cancel invite |

Auth: workspace member manager session. Privileged role changes require MFA (SEC-08).

To cancel an invitation, send `DELETE` with `target: "invite"` and `invite_id`.
Only a pending invitation in the URL's workspace can be canceled. Foreign,
missing and finalized invitations all return 404 and remain unchanged. The
workspace settings form uses the same cancellation rule.

Invitation resend on `/accept-invite` requires a session email that matches the
pending invitation. Foreign, missing and finalized invitations return the same
404 without token rotation or email delivery. A permitted resend rotates the
token, stores only its hash and renews the existing seven-day expiry. The
registration rate limit also applies to resend.

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
| GET | `/api/auth/callback` | Better Auth email verification (public redirect flow) |

## Public integrator APIs (different guide)

Workspace API keys authenticate the [public integrator endpoints](./api-overview.md):

- `POST /api/campaigns/create-with-script`
- `POST /api/chat_sms`
- `POST /api/sms`

## See also

- [Complete inventory](./api-surface-inventory.md)
- [Stripe billing webhook setup](./stripe-webhook.md) (provider route, not session admin)

### Password recovery UI

`/remember` accepts a reset request with generic feedback for known and unknown email addresses. Reset links use the configured application base URL and the final page `/reset-password`; Better Auth checks the issued token before sending the user there. The form retains the token in its URL for the password change. Expired or reused tokens cannot change a password. Failed email verification at `/api/auth/callback` or `/auth/confirm` returns to `/signin`.

### Admin workspace response fields

Global admin dashboard, detail and user-workspace responses use the same positive workspace field set as product clients: `id`, `name`, `created_at`, `credits`, `disabled`, `feature_flags` and `coaching_config`. Dashboard and detail data can add campaign rows. Membership and invitation workspaces use that field set too; invitation display rows exclude the token hash. Provider account responses contain only `sid`, `friendlyName`, `status`, `type` and `dateCreated`. Server services retain credential reads for Twilio operations and health calculations. The projection gate checks static reader imports and client types; complete serialized response tests check nested data.
