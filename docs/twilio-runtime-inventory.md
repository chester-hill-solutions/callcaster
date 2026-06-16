# Twilio runtime inventory

> Generated as part of the Twilio structural improvements plan. Last updated: 2026-06-10.

## Environment-driven URLs

| Variable | Used for |
| --- | --- |
| `BASE_URL` | Remix `/api/*` webhooks and TwiML URLs |
| `SUPABASE_URL` | Edge `functions/v1/*` status callbacks |
| `TWILIO_SID` / `TWILIO_AUTH_TOKEN` | Main account (subaccount create, dev fallback, number search without workspace) |
| `TWILIO_VALIDATE_WEBHOOKS` | Remix-only; when `false`/`0`, skips signature checks (local dev) |

## Remix webhook routes (`app/routes/api+`)

| Path | Module | Role | Signature validation |
| --- | --- | --- | --- |
| `POST /api/inbound` | `inbound.action.server.ts` | Inbound voice TwiML | Workspace / phone lookup |
| `POST /api/inbound-sms` | `inbound-sms.action.server.ts` | Inbound SMS | `validateWorkspaceTwilioWebhook` |
| `POST /api/sms/status` | `sms/status.action.server.ts` | SMS status (legacy shim) | `validateTwilioWebhookForMessageSid` |
| `POST /api/call-status` | `call-status.action.server.ts` | Call status | `validateTwilioWebhookForCallSid` |
| `POST /api/dial/status` | `dial/status.action.server.ts` | Dial status | `validateTwilioWebhookForCallSid` |
| `POST /api/auto-dial/status` | `auto-dial/status.action.server.ts` | Auto-dial status | `validateTwilioWebhookForCallSid` |
| `POST /api/auto-dial/:roomId` | `auto-dial/$roomId.action.server.ts` | Conference TwiML | `validateTwilioWebhookForCallSid` |
| `GET/POST /api/connect-campaign-conference/:workspaceId/:campaignId` | `connect-campaign-conference/.../loader.server.ts` | Conference connect TwiML | `validateTwilioWebhookForWorkspace` |
| `POST /api/recording` | `recording.action.server.ts` | Recording callback | `validateTwilioWebhookForCallSid` |
| `POST /api/email-vm` | `email-vm.action.server.ts` | Voicemail email | `validateTwilioWebhookForCallSid` |
| `POST /api/inbound-handset` | `inbound-handset.action.server.ts` | Handset inbound | `validateTwilioWebhookForPhoneNumber` |
| `POST /api/inbound-handset-dial-end` | `inbound-handset-dial-end.action.server.ts` | Handset dial end | `validateTwilioWebhookForPhoneNumber` |
| `POST /api/caller-id/status` | `caller-id/status.action.server.ts` | Number status | Multi-candidate phone |
| `POST /api/ivr/status` | `ivr/status.action.server.ts` | IVR status (Remix) | `validateTwilioWebhookForCallSid` |
| `POST /api/ivr/:campaignId/:pageId` | `ivr/$campaignId/$pageId.action.server.ts` | IVR page redirect | `validateTwilioWebhookForCallSid` |
| `POST /api/ivr/.../response` | `ivr/.../response.action.server.ts` | IVR gather response | `validateTwilioWebhookForCallSid` |
| `POST /api/ivr/.../:blockId` | `ivr/.../blockId.action.server.ts` | IVR block TwiML | `validateTwilioWebhookForCallSid` |
| `POST /api/initiate-ivr` | `initiate-ivr.action.server.ts` | Starts outbound IVR | `requireWorkspaceAccess` (app auth) |
| `POST /api/test-webhook` | `test-webhook.action.server.ts` | User-configured test hook | App auth + SSRF guard |

Static coverage check: `node scripts/check-twilio-webhook-coverage.mjs`

## Supabase Edge functions (Twilio-facing)

| Function | Caller | `verify_jwt` | Signature |
| --- | --- | --- | --- |
| `sms-status` | Twilio SMS status | `false` | `validateRequest` |
| `ivr-flow` | Twilio IVR TwiML | `false` | `validateRequest` |
| `ivr-status` | Twilio IVR status | `false` | `validateRequest` |
| `ivr-recording` | Twilio recording | `false` | `validateRequest` |
| `sms-handler` | Internal queue | JWT / headers | N/A |
| `ivr-handler` | Internal queue | Internal | N/A |
| `twilio-open-sync` | pg_cron | Service role JWT | N/A (REST poll) |
| `workspace-twilio-sync` | Internal | Internal | N/A |
| `number-rental-billing` | pg_cron | `false` | N/A |
| `twilio-billing-reconcile` | pg_cron | Service role JWT | N/A (REST poll) |
| `handle_active_change` | DB webhook | Custom HMAC | N/A |

## Twilio REST callers (app)

| Module | Operations |
| --- | --- |
| `workspace.server.ts` | `accounts.create`, `newKeys.create`, `createWorkspaceTwilioInstance` |
| `twilio-bootstrap.server.ts` | Messaging Service create/update |
| `twilio-a2p.server.ts` | Brand/campaign registration |
| `numbers.action.server.ts` | `incomingPhoneNumbers.create`, MS sender attach |
| `numbers.loader.server.ts` | `availablePhoneNumbers` search |
| `chat-sms.server.ts` | `messages.create` |
| `sms.action.server.ts` | `messages.create` |
| `ivr-initiate.server.ts` | `calls.create` |
| `ivr.action.server.ts` | `calls.create` |
| `dial.action.server.ts` | `calls.create` |
| `auto-dial.server.ts` | `calls.create`, `conferences.list/update` |
| `caller-id-verification.server.ts` | `validationRequests.create` |
| `workspace-twilio.server.ts` | Account fetch, numbers, usage (admin/sync) |

## Twilio REST callers (Edge)

| Function | Operations |
| --- | --- |
| `sms-handler` | `messages.create` |
| `ivr-handler` | `calls.create` |
| `twilio-open-sync` | Call/message status fetch |
| `workspace-twilio-sync` | Account/number sync |
| `number-rental-billing` | `incomingPhoneNumbers.remove` |
| `twilio-billing-reconcile` | Usage records + ledger audit |
| `handle_active_change` | Call/message cancel |

## Shared libraries

| Path | Role |
| --- | --- |
| `app/twilio.server.ts` | Main-account client, `validateTwilioWebhook*` |
| `app/lib/twilio-webhook.server.ts` | Workspace-aware webhook validation |
| `app/lib/twilio-workspace-credentials.ts` | Parse `twilio_data` credentials |
| `app/lib/sms-send-resolve.ts` | Messaging Service SID resolution |
| `app/lib/messaging-onboarding.server.ts` | Onboarding state machine |
| `supabase/functions/_shared/twilio-workspace-credentials.ts` | Edge credential copy |
| `supabase/functions/_shared/sms-status-logic.ts` | SMS status/billing logic |
| `supabase/functions/_shared/ivr-status-logic.ts` | IVR status/billing logic |

## Tests

- App: `test/twilio-*.test.ts`, `test/*route.test.ts` (webhook routes), `test/messaging-onboarding*.test.ts`
- Edge: `supabase/functions/__tests__/*`
