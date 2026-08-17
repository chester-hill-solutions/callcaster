# API Surface Inventory

Generated from [`app/lib/api-surface.ts`](../app/lib/api-surface.ts), which merges
the derived core in [`api-surface-generated.ts`](../app/lib/api-surface-generated.ts)
with the editorial [`api-surface-annotations.ts`](../app/lib/api-surface-annotations.ts).
Regenerate with `npm run tools:api:surface:report`.

Interactive specs:

- [Public integrator API](/docs) — OpenAPI at [`/api/docs/openapi`](/api/docs/openapi)
- [Complete classified surface](/docs?spec=complete) — OpenAPI at [`/api/docs/openapi/all`](/api/docs/openapi/all)

| Path | Methods | Auth | Exposure | Supported | Module | Guide | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/acd-router` | POST | Provider Webhook | internalOnly | yes | `routes/api+/acd-router.route.tsx` | `docs/api-live-operations.md` | Twilio ACD wait URL. |
| `/api/acd-router/agent-bridge` | POST | Provider Webhook | internalOnly | yes | `routes/api+/acd-router/agent-bridge.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/acd-router/agent-status` | POST | Provider Webhook | internalOnly | yes | `routes/api+/acd-router/agent-status.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/acd-router/complete` | POST | Provider Webhook | internalOnly | yes | `routes/api+/acd-router/complete.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/admin/dashboard` | POST, GET | Internal Trusted | internalOnly | yes | `routes/api+/admin+/dashboard.route.tsx` | `docs/api-admin.md` | Sudo-only admin dashboard and actions. |
| `/api/admin/users/:userId` | PATCH, GET | Internal Trusted | internalOnly | yes | `routes/api+/admin+/users+/$userId.route.tsx` | `docs/api-admin.md` |  |
| `/api/admin/users/:userId/workspaces` | POST, GET | Internal Trusted | internalOnly | yes | `routes/api+/admin+/users+/$userId/workspaces.route.tsx` | `docs/api-admin.md` |  |
| `/api/admin/workspaces/:workspaceId/twilio` | POST | Internal Trusted | internalOnly | yes | `routes/api+/admin+/workspaces+/$workspaceId/twilio.route.tsx` | `docs/api-admin.md` |  |
| `/api/agent-status` | POST, GET | Workspace Admin | sessionOnly | yes | `routes/api+/agent-status.tsx` | `docs/api-workspace-admin.md` | Agent presence for workspace dialer sessions. |
| `/api/audience-upload` | POST | User API | sessionOnly | yes | `routes/api+/audience-upload.tsx` | `docs/api-data-management.md` | Upload audience CSV with column mapping. |
| `/api/audience-upload-status` | GET | User API | sessionOnly | yes | `routes/api+/audience-upload-status.tsx` | `docs/api-data-management.md` | Poll audience CSV upload job status. |
| `/api/audiences` | PATCH, DELETE, GET | User API | sessionOnly | yes | `routes/api+/audiences.tsx` | `docs/api-data-management.md` |  |
| `/api/audiodrop` | POST | User API | sessionOnly | yes | `routes/api+/audiodrop.tsx` | `docs/api-telephony-control.md` | Voicemail drop during live call. |
| `/api/auth/*` | POST, GET | Public Form | publicUnauthenticated | yes | `routes/api+/auth/$.route.tsx` | `docs/api-auth-matrix.md` | Better Auth catch-all (sign-in, session, sign-out, OAuth callbacks). POSTs are rate-limited: sign-in/two-factor 10/min per IP, other POSTs 30/min. |
| `/api/auth/callback` | GET | Public Form | publicUnauthenticated | yes | `routes/api+/auth/callback.route.tsx` | `docs/api-auth-matrix.md` | Postgres auth callback; sets session cookies and redirects. |
| `/api/auth/forgot-password` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/forgot-password.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/invites` | POST, GET | User API | sessionOnly | yes | `routes/api+/auth/invites.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/refresh` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/refresh.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/register` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/register.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/reset-password` | POST | User API | sessionOnly | yes | `routes/api+/auth/reset-password.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/signout` | POST | User API | sessionOnly | yes | `routes/api+/auth/signout.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/token` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/token.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/verify-email` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/verify-email.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auto-dial/:roomId` | POST | Provider Webhook | providerOnly | no | `routes/api+/auto-dial/$roomId.route.tsx` | `docs/api-webhooks.md` | Twilio conference/AMD TwiML callback. |
| `/api/auto-dial/end` | POST | User API | sessionOnly | yes | `routes/api+/auto-dial/end.route.tsx` | `docs/api-telephony-control.md` |  |
| `/api/auto-dial/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/auto-dial/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/call` | POST | Provider Webhook | internalOnly | no | `routes/api+/call.tsx` | `docs/api-internal-unsupported.md` | Twilio Voice URL for the handset bridge; the auth strategy validates the workspace Twilio signature and the handset session is looked up from the signed form fields. Returns TwiML. |
| `/api/call-status` | POST | Provider Webhook | providerOnly | no | `routes/api+/call-status.tsx` | `docs/api-webhooks.md` |  |
| `/api/call-status-poll` | GET | User API | sessionOnly | yes | `routes/api+/call-status-poll.tsx` | `docs/api-analytics-export.md` | Poll Twilio call status for call-screen UI. |
| `/api/caller-id` | POST | User API | sessionOnly | yes | `routes/api+/caller-id.tsx` | `docs/api-telephony-control.md` | Start outbound caller-ID verification. |
| `/api/caller-id/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/caller-id/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/campaign-export` | POST | User API | sessionOnly | yes | `routes/api+/campaign-export.tsx` | `docs/api-analytics-export.md` |  |
| `/api/campaign-export-status` | GET | User API | sessionOnly | yes | `routes/api+/campaign-export-status.tsx` | `docs/api-analytics-export.md` |  |
| `/api/campaign_audience` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/campaign_audience.tsx` | `docs/api-data-management.md` |  |
| `/api/campaign_queue` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/campaign_queue.tsx` | `docs/api-telephony-control.md` |  |
| `/api/campaigns` | POST, PATCH, DELETE | User API | sessionOnly | yes | `routes/api+/campaigns.tsx` | `docs/api-data-management.md` |  |
| `/api/campaigns/:campaignId` | POST, GET | Integrator API | sessionOnly | yes | `routes/api+/campaigns/$campaignId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/campaigns/:campaignId/call-session` | GET | User API | sessionOnly | yes | `routes/api+/campaigns+/$campaignId/call-session.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/campaigns/:campaignId/call-session/release` | POST | User API | sessionOnly | yes | `routes/api+/campaigns+/$campaignId/call-session/release.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/campaigns/:campaignId/queue` | PATCH, GET | Integrator API | sessionOnly | yes | `routes/api+/campaigns/$campaignId/queue.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/campaigns/:campaignId/results` | GET | User API | sessionOnly | yes | `routes/api+/campaigns+/$campaignId/results.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/campaigns/create-with-script` | POST | Integrator API | publicSdk | yes | `routes/api+/campaigns/create-with-script.route.tsx` | `docs/api-create-campaign-with-script.md` |  |
| `/api/chat_sms` | POST | Integrator API | publicSdk | yes | `routes/api+/chat_sms.tsx` | `docs/api-send-sms.md` |  |
| `/api/coaching-ack` | POST | User API | sessionOnly | yes | `routes/api+/coaching-ack.tsx` | `docs/api-telephony-control.md` |  |
| `/api/connect-campaign-conference/:workspaceId/:campaignId` | GET | Provider Webhook | providerOnly | no | `routes/api+/connect-campaign-conference/$workspaceId/$campaignId.route.tsx` | `docs/api-webhooks.md` | Twilio voice URL after connect-phone-device; returns TwiML. |
| `/api/connect-phone-device` | POST | User API | sessionOnly | yes | `routes/api+/connect-phone-device.tsx` | `docs/api-telephony-control.md` |  |
| `/api/contact-audience` | DELETE | User API | sessionOnly | yes | `routes/api+/contact-audience.tsx` | `docs/api-data-management.md` |  |
| `/api/contact-audience/bulk-delete` | DELETE | User API | sessionOnly | yes | `routes/api+/contact-audience/bulk-delete.route.tsx` | `docs/api-data-management.md` |  |
| `/api/contact-form` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/contact-form.tsx` | `docs/api-internal-unsupported.md` | Marketing contact form; sends email via Resend. |
| `/api/contacts` | POST, PATCH, GET | User API | sessionOnly | yes | `routes/api+/contacts.tsx` | `docs/api-data-management.md` |  |
| `/api/contacts/:contactId` | DELETE, GET | Integrator API | sessionOnly | yes | `routes/api+/contacts/$contactId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/dial` | POST | User API | sessionOnly | yes | `routes/api+/dial.tsx` | `docs/api-telephony-control.md` | Campaign dial initiation; returns TwiML. |
| `/api/dial/:number` | POST | Provider Webhook | providerOnly | no | `routes/api+/dial/$number.route.tsx` | `docs/api-webhooks.md` | Twilio TwiML sub-route; requires a valid Twilio signature. Returns TwiML. |
| `/api/dial/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/dial/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/docs/openapi` | GET | Public Form | publicUnauthenticated | yes | `routes/api+/docs/openapi.route.tsx` | `docs/api-overview.md` | Public user-facing OpenAPI JSON (session + workspace + integrator routes). |
| `/api/docs/openapi/all` | GET | Public Form | publicUnauthenticated | no | `routes/api+/docs/openapi/all.route.tsx` | `docs/api-overview.md` | Complete classified API surface OpenAPI JSON. |
| `/api/email-vm` | POST | Provider Webhook | providerOnly | no | `routes/api+/email-vm.tsx` | `docs/api-webhooks.md` |  |
| `/api/error-report` | POST | User API | sessionOnly | yes | `routes/api+/error-report.tsx` | `docs/api-internal-unsupported.md` |  |
| `/api/handset-token` | GET | User API | sessionOnly | yes | `routes/api+/handset-token.tsx` | `docs/api-telephony-control.md` |  |
| `/api/hangup` | POST | User API | sessionOnly | yes | `routes/api+/hangup.tsx` | `docs/api-telephony-control.md` |  |
| `/api/inbound` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound.tsx` | `docs/api-webhooks.md` | Returns TwiML. |
| `/api/inbound-handset` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-handset.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-handset-dial-end` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-handset-dial-end.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-ivr/:numberId/:pageId` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-ivr/$numberId/$pageId.route.tsx` | `docs/api-webhooks.md` | Returns TwiML. |
| `/api/inbound-ivr/:numberId/:pageId/:blockId` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-ivr/$numberId/$pageId/$blockId.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-ivr/:numberId/:pageId/:blockId/response` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-queue` | POST, PUT, PATCH, DELETE, GET | User API | sessionOnly | yes | `routes/api+/inbound-queue.tsx` | `docs/api-telephony-control.md` |  |
| `/api/inbound-sms` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-sms.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-verification` | POST | Provider Webhook | internalOnly | no | `routes/api+/inbound-verification.tsx` | `docs/api-internal-unsupported.md` | Call-in verification TwiML, authenticated by a main-account Twilio signature. Returns TwiML. |
| `/api/initiate-ivr` | POST | User API | sessionOnly | yes | `routes/api+/initiate-ivr.tsx` | `docs/api-telephony-control.md` |  |
| `/api/ivr` | POST | User API | sessionOnly | yes | `routes/api+/ivr.tsx` | `docs/api-telephony-control.md` |  |
| `/api/ivr/:campaignId/:pageId` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/$campaignId/$pageId.route.tsx` | `docs/api-webhooks.md` | Returns TwiML. |
| `/api/ivr/:campaignId/:pageId/:blockId` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/$campaignId/$pageId/$blockId.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/ivr/:campaignId/:pageId/:blockId/response` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/$campaignId/$pageId/$blockId/response.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/ivr/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/jobs/billing-reconcile` | POST | Internal Trusted | internalOnly | no | `routes/api+/jobs+/billing-reconcile.tsx` | `docs/api-internal-unsupported.md` | Cron-triggered billing reconciliation snapshot; authenticated via x-cron-secret header (process.env.CRON_SECRET). |
| `/api/jobs/low-credit-notify` | POST | Internal Trusted | internalOnly | no | `routes/api+/jobs+/low-credit-notify.tsx` | `docs/api-internal-unsupported.md` | Cron-triggered low-credit email sweep; authenticated via x-cron-secret header (process.env.CRON_SECRET). |
| `/api/jobs/number-rental-billing` | POST | Internal Trusted | internalOnly | no | `routes/api+/jobs+/number-rental-billing.tsx` | `docs/api-internal-unsupported.md` | Cron-triggered monthly number-rental billing; authenticated via x-cron-secret header (process.env.CRON_SECRET). |
| `/api/jobs/twilio-open-sync` | POST | Internal Trusted | internalOnly | no | `routes/api+/jobs+/twilio-open-sync.tsx` | `docs/api-internal-unsupported.md` | Cron-triggered sync of open Twilio calls/messages; authenticated via x-cron-secret header (process.env.CRON_SECRET). |
| `/api/me` | PATCH, GET | User API | sessionOnly | yes | `routes/api+/me.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/media` | POST | User API | sessionOnly | yes | `routes/api+/media.tsx` | `docs/api-data-management.md` |  |
| `/api/message_media` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/message_media.tsx` | `docs/api-data-management.md` |  |
| `/api/numbers` | POST, GET | User API | sessionOnly | yes | `routes/api+/numbers.tsx` | `docs/api-workspace-admin.md` | Flat alias for /api/workspaces/:workspaceId/numbers used by the number purchase wizard. POST requires the member role or above; the caller role receives 403. |
| `/api/outreach-attempts` | POST | User API | sessionOnly | yes | `routes/api+/outreach-attempts.tsx` | `docs/api-telephony-control.md` | Hyphenated path; preferred outreach attempt API. |
| `/api/outreach_attempts/:id` | POST | User API | internalOnly | yes | `routes/api+/outreach_attempts/$id.route.tsx` | `docs/api-internal-unsupported.md` | Session-scoped outreach attempt updates via requireJsonAuthForOutreachAttempt. |
| `/api/questions` | POST | User API | sessionOnly | yes | `routes/api+/questions.tsx` | `docs/api-telephony-control.md` | Call disposition / survey question updates on call screen. |
| `/api/queues` | POST, DELETE, GET | User API | sessionOnly | yes | `routes/api+/queues.tsx` | `docs/api-telephony-control.md` | Campaign queue dequeue and reset; requires session auth and workspace access. |
| `/api/recording` | POST | Provider Webhook | providerOnly | no | `routes/api+/recording.tsx` | `docs/api-webhooks.md` |  |
| `/api/reset_campaign` | POST | User API | sessionOnly | yes | `routes/api+/reset_campaign.tsx` | `docs/api-data-management.md` |  |
| `/api/scripts` | POST | User API | sessionOnly | yes | `routes/api+/scripts.tsx` | `docs/api-data-management.md` |  |
| `/api/scripts/:scriptId` | GET | Integrator API | sessionOnly | yes | `routes/api+/scripts/$scriptId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/sms` | POST | Integrator API | publicSdk | yes | `routes/api+/sms.tsx` | `docs/api-send-sms.md` |  |
| `/api/sms/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/sms/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/stripe-webhook` | POST | Provider Webhook | providerOnly | no | `routes/api+/stripe-webhook.tsx` | `docs/api-webhooks.md` | Stripe-Signature header required; see docs/stripe-webhook.md. |
| `/api/survey-answer` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/survey-answer.tsx` | `docs/api-internal-unsupported.md` | Public survey respondent flow. |
| `/api/survey-complete` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/survey-complete.tsx` | `docs/api-internal-unsupported.md` |  |
| `/api/survey-responses` | POST | User API | sessionOnly | yes | `routes/api+/survey-responses.tsx` | `docs/api-data-management.md` |  |
| `/api/surveys` | POST, PATCH, DELETE | User API | sessionOnly | yes | `routes/api+/surveys.tsx` | `docs/api-data-management.md` |  |
| `/api/surveys/:surveyId` | GET | Integrator API | sessionOnly | yes | `routes/api+/surveys/$surveyId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/surveys/:surveyId/responses` | GET | Integrator API | sessionOnly | yes | `routes/api+/surveys/$surveyId/responses.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/surveys/:surveyId/responses/export` | GET | User API | sessionOnly | yes | `routes/api+/surveys+/$surveyId/responses/export.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/test-webhook` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/test-webhook.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/token` | GET | User API | sessionOnly | yes | `routes/api+/token.tsx` | `docs/api-telephony-control.md` | Twilio client access token for browser dialer. |
| `/api/twilio/a2p/events` | POST | Internal Trusted | internalOnly | no | `routes/api+/twilio/a2p/events.route.tsx` | `docs/api-internal-unsupported.md` | A2P Event Streams sink receiver (JSON body), gated by the TWILIO_EVENTS_SINK_SECRET shared secret (?token=… on the sink URL). Parses brand/campaign lifecycle events and reconciles workspace onboarding status. |
| `/api/twilio/trusthub/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/twilio/trusthub/status.route.tsx` | `docs/api-webhooks.md` | Trust Hub status_callback receiver; resolves workspace by customer-profile bundle SID and reconciles compliance status. |
| `/api/verify-audio-pin/:pin` | GET | Public Form | publicUnauthenticated | yes | `routes/api+/verify-audio-pin/$pin.route.tsx` | `docs/api-internal-unsupported.md` | Retired audio PIN flow; returns 410. |
| `/api/verify-audio-session` | POST, GET | User API | sessionOnly | yes | `routes/api+/verify-audio-session.tsx` | `docs/api-telephony-control.md` | Retired audio PIN flow; both methods return 410. |
| `/api/verify-call-in-session` | GET | User API | sessionOnly | yes | `routes/api+/verify-call-in-session.tsx` | `docs/api-telephony-control.md` |  |
| `/api/verify-pin-input` | POST | Internal Trusted | internalOnly | no | `routes/api+/verify-pin-input.tsx` | `docs/api-internal-unsupported.md` | Retired audio PIN flow; returns 410. |
| `/api/workspace-api-keys` | POST, DELETE, GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspace-api-keys.tsx` | `docs/api-workspace-admin.md` | Legacy flat route; workspace_id comes from the body/query. The admin floor and the capability-scope cap are enforced by requireApiKeyManager / assertScopesWithinActorRole in platform-members.server.ts (issue #1264). |
| `/api/workspaces` | POST, GET | User API | sessionOnly | yes | `routes/api+/workspaces.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId` | PATCH, DELETE, GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/route.tsx` | `docs/api-agent-quickstart.md` | Child index under data-plane layout middleware. GET supports session or API key with campaigns.read; PATCH requires admin+ session; DELETE requires owner session. |
| `/api/workspaces/:workspaceId/analytics` | GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/analytics.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/api-keys` | POST, DELETE, GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/api-keys.route.tsx` | `docs/api-workspace-admin.md` | Session-only: API-key actors get 401, so a key cannot mint another key. GET/POST/DELETE all require an admin session (requireApiKeyManager). POST caps requested scopes at the creator's own role capabilities and 403s naming any scope beyond them (issue #1264). |
| `/api/workspaces/:workspaceId/audience-uploads/:uploadId` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audience-uploads/$uploadId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audiences` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audiences.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audiences/:audienceId` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audiences/$audienceId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audiences/:audienceId/uploads` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audiences/$audienceId/uploads.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audios` | POST, GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audios.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/audit-events` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audit-events.route.tsx` | `docs/api-workspace-admin.md` | Requires owner session (via role matrix) or an API key with audit.read. |
| `/api/workspaces/:workspaceId/billing` | POST, GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/billing.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId/billing/checkout-session` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/billing/checkout-session.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId/billing/sessions/:sessionId` | GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/billing/sessions/$sessionId.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId/calls` | GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/calls.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/workspaces/:workspaceId/calls/:callSid/disconnect` | POST | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/calls/$callSid/disconnect.route.tsx` | `docs/api-telephony-provisioning.md` | Workspace-scoped call disconnect using workspace Twilio credentials. Capability: calls.control. |
| `/api/workspaces/:workspaceId/calls/listening` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/calls/listening.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/workspaces/:workspaceId/campaigns` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/campaigns.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/campaigns/:campaignId/dialer/start` | POST | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.route.tsx` | `docs/api-telephony-provisioning.md` | Start predictive/manual auto-dial conference for authenticated caller+ agent. Capability: calls.start. |
| `/api/workspaces/:workspaceId/client-flash` | POST | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/client-flash.route.tsx` | `docs/api-live-operations.md` | Telemetry sink for client flash events (transient error toasts/banners, #1293): logs each event server-side; no reads, no state. |
| `/api/workspaces/:workspaceId/contacts` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/contacts.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/conversations` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/conversations.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/conversations/:contactNumber` | POST, GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/credits` | GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/credits.route.tsx` | `docs/api-agent-quickstart.md` | Read current workspace credit balance. Available to any workspace member, including the caller role — the call screen polls it for live balance reconciliation. |
| `/api/workspaces/:workspaceId/events` | GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/events.route.tsx` | `docs/api-live-operations.md` | SSE stream for workspace events (activity log). |
| `/api/workspaces/:workspaceId/exports` | POST, GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/exports.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/handset/session` | DELETE, GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/handset/session.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/workspaces/:workspaceId/members` | POST, PATCH, DELETE, GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/members.route.tsx` | `docs/api-workspace-admin.md` | GET/PATCH/DELETE are session-only. POST invite accepts session or API key with members.invite. |
| `/api/workspaces/:workspaceId/numbers` | POST, GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/numbers.route.tsx` | `docs/api-telephony-provisioning.md` | GET lists numbers for any workspace member. POST (purchase) requires the member role or above; the caller role receives 403. |
| `/api/workspaces/:workspaceId/numbers/:numberId` | PATCH, DELETE | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/numbers/$numberId.route.tsx` | `docs/api-telephony-provisioning.md` |  |
| `/api/workspaces/:workspaceId/onboarding` | PATCH, GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/onboarding.route.tsx` | `docs/api-telephony-provisioning.md` |  |
| `/api/workspaces/:workspaceId/onboarding/actions` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/onboarding/actions.route.tsx` | `docs/api-telephony-provisioning.md` |  |
| `/api/workspaces/:workspaceId/scripts` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/scripts.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/surveys` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/surveys.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/transfer-ownership` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/transfer-ownership.route.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/workspaces/:workspaceId/voicemails` | GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/voicemails.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/webhook` | POST, PUT, GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/webhook.route.tsx` | `docs/api-workspace-admin.md` | POST tests webhook delivery. |

Total entries: **146**

