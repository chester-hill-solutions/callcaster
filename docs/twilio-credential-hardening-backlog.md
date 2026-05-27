# Twilio credential hardening backlog (deferred)

Tracked separately from reliability/UX work. Do not block Messaging Service bootstrap, webhook repair, or runtime consolidation on these items.

## Goals

- Use API keys (`workspace.key` / `workspace.token`) for Twilio REST instead of subaccount auth tokens where possible.
- Minimize long-lived `authToken` persistence in `workspace.twilio_data`.
- Support admin-initiated API key rotation with audit trail.

## Proposed work

1. Switch `createWorkspaceTwilioInstance` to prefer API key credentials; keep auth token for webhook signature validation only.
2. Encrypt or externalize stored auth tokens; stop writing full subaccount token JSON on workspace create when keys exist.
3. Admin action: rotate API key, update `workspace.key`/`token`, verify webhooks.
4. Document rotation runbook in admin Twilio portal.

## Out of scope until prioritized

- Removing auth tokens entirely (webhooks still need subaccount token today).
- Organization-level Twilio SSO / SCIM.
