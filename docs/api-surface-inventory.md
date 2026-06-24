# API Surface Inventory

Generated from [`app/lib/api-surface.ts`](../app/lib/api-surface.ts).
Regenerate with `npm run tools:api:surface:report`.

Interactive specs:

- [Public integrator API](/docs) — OpenAPI at [`/api/docs/openapi`](/api/docs/openapi)
- [Complete classified surface](/docs?spec=complete) — OpenAPI at [`/api/docs/openapi/all`](/api/docs/openapi/all)

| Path | Methods | Auth | Exposure | Supported | Module | Guide | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/agent-status` | GET, POST | Workspace Admin | sessionOnly | yes | `routes/api+/agent-status.tsx` | `docs/api-workspace-admin.md` | Agent presence for workspace dialer sessions. |
| `/api/audience-upload-status` | GET | User API | sessionOnly | yes | `routes/api+/audience-upload-status.tsx` | `docs/api-data-management.md` | Poll audience CSV upload job status. |
| `/api/audience-upload` | POST | User API | sessionOnly | yes | `routes/api+/audience-upload.tsx` | `docs/api-data-management.md` | Upload audience CSV with column mapping. |
| `/api/audiences` | GET, PATCH, DELETE | User API | sessionOnly | yes | `routes/api+/audiences.tsx` | `docs/api-data-management.md` |  |
| `/api/audiodrop` | POST | User API | sessionOnly | yes | `routes/api+/audiodrop.tsx` | `docs/api-telephony-control.md` | Voicemail drop during live call. |
| `/api/auth/callback` | GET | Public Form | publicUnauthenticated | yes | `routes/api+/auth/callback.route.tsx` | `docs/api-auth-matrix.md` | Supabase auth callback; sets session cookies and redirects. |
| `/api/auto-dial` | POST | User API | sessionOnly | yes | `routes/api+/auto-dial.tsx` | `docs/api-telephony-control.md` | Start auto-dial session for workspace. |
| `/api/auto-dial/:roomId` | POST | Provider Webhook | providerOnly | no | `routes/api+/auto-dial/$roomId.route.tsx` | `docs/api-webhooks.md` | Twilio conference/AMD TwiML callback. |
| `/api/auto-dial/dialer` | POST | Internal Trusted | internalOnly | no | `routes/api+/auto-dial/dialer.route.tsx` | `docs/api-internal-unsupported.md` | No user/API-key auth; trusts workspace_id/user_id in JSON body via service role. |
| `/api/auto-dial/end` | POST | User API | sessionOnly | yes | `routes/api+/auto-dial/end.route.tsx` | `docs/api-telephony-control.md` |  |
| `/api/auto-dial/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/auto-dial/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/call-status-poll` | GET | User API | sessionOnly | yes | `routes/api+/call-status-poll.tsx` | `docs/api-analytics-export.md` | Poll Twilio call status for call-screen UI. |
| `/api/call-status` | POST | Provider Webhook | providerOnly | no | `routes/api+/call-status.tsx` | `docs/api-webhooks.md` |  |
| `/api/call` | POST | Internal Trusted | internalOnly | no | `routes/api+/call.tsx` | `docs/api-internal-unsupported.md` | Twilio Voice URL without signature validation; handset path uses session cookie lookup. |
| `/api/caller-id` | POST | User API | sessionOnly | yes | `routes/api+/caller-id.tsx` | `docs/api-telephony-control.md` | Start outbound caller-ID verification. |
| `/api/caller-id/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/caller-id/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/campaign-export-status` | GET | User API | sessionOnly | yes | `routes/api+/campaign-export-status.tsx` | `docs/api-analytics-export.md` |  |
| `/api/campaign-export` | POST | User API | sessionOnly | yes | `routes/api+/campaign-export.tsx` | `docs/api-analytics-export.md` |  |
| `/api/campaign_audience` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/campaign_audience.tsx` | `docs/api-data-management.md` |  |
| `/api/campaign_queue` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/campaign_queue.tsx` | `docs/api-telephony-control.md` |  |
| `/api/campaigns` | POST, PATCH, DELETE | User API | sessionOnly | yes | `routes/api+/campaigns.tsx` | `docs/api-data-management.md` |  |
| `/api/campaigns/create-with-script` | POST | Integrator API | publicSdk | yes | `routes/api+/campaigns/create-with-script.route.tsx` | `docs/api-create-campaign-with-script.md` |  |
| `/api/chat_sms` | POST | Integrator API | publicSdk | yes | `routes/api+/chat_sms.tsx` | `docs/api-send-sms.md` |  |
| `/api/connect-campaign-conference/:workspaceId/:campaignId` | GET | Provider Webhook | providerOnly | no | `routes/api+/connect-campaign-conference/$workspaceId/$campaignId.route.tsx` | `docs/api-webhooks.md` | Twilio voice URL after connect-phone-device; returns TwiML. |
| `/api/connect-phone-device` | POST | User API | sessionOnly | yes | `routes/api+/connect-phone-device.tsx` | `docs/api-telephony-control.md` |  |
| `/api/contact-audience` | DELETE | User API | sessionOnly | yes | `routes/api+/contact-audience.tsx` | `docs/api-data-management.md` |  |
| `/api/contact-audience/bulk-delete` | DELETE | User API | sessionOnly | yes | `routes/api+/contact-audience/bulk-delete.route.tsx` | `docs/api-data-management.md` |  |
| `/api/contact-form` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/contact-form.tsx` | `docs/api-internal-unsupported.md` | Marketing contact form; sends email via Resend. |
| `/api/contacts` | GET, POST, PATCH | User API | sessionOnly | yes | `routes/api+/contacts.tsx` | `docs/api-data-management.md` |  |
| `/api/dial` | POST | User API | sessionOnly | yes | `routes/api+/dial.tsx` | `docs/api-telephony-control.md` | Campaign dial initiation; returns TwiML. |
| `/api/dial/:number` | POST | Security Gap | internalOnly | no | `routes/api+/dial/$number.route.tsx` | `docs/api-internal-unsupported.md` | Twilio TwiML sub-route without signature validation. |
| `/api/dial/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/dial/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/docs/openapi` | GET | Public Form | publicUnauthenticated | yes | `routes/api+/docs/openapi.route.tsx` | `docs/api-overview.md` | Public user-facing OpenAPI JSON (session + workspace + integrator routes). |
| `/api/docs/openapi/all` | GET | Public Form | publicUnauthenticated | no | `routes/api+/docs/openapi/all.route.tsx` | `docs/api-overview.md` | Complete classified API surface OpenAPI JSON. |
| `/api/disconnect` | POST | Security Gap | internalOnly | no | `routes/api.disconnect.ts` | `docs/api-internal-unsupported.md` | Twilio Device disconnect using account credentials; no session or signature check. |
| `/api/email-vm` | POST | Provider Webhook | providerOnly | no | `routes/api+/email-vm.tsx` | `docs/api-webhooks.md` |  |
| `/api/error-report` | POST | User API | sessionOnly | yes | `routes/api+/error-report.tsx` | `docs/api-internal-unsupported.md` |  |
| `/api/handset-token` | GET | User API | sessionOnly | yes | `routes/api+/handset-token.tsx` | `docs/api-telephony-control.md` |  |
| `/api/hangup` | POST | User API | sessionOnly | yes | `routes/api+/hangup.tsx` | `docs/api-telephony-control.md` |  |
| `/api/inbound-handset-dial-end` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-handset-dial-end.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-handset` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-handset.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-ivr/:numberId/:pageId` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-ivr/$numberId/$pageId.route.tsx` | `docs/api-webhooks.md` | Returns TwiML. |
| `/api/inbound-ivr/:numberId/:pageId/:blockId` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-ivr/$numberId/$pageId/$blockId.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-ivr/:numberId/:pageId/:blockId/response` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-queue` | GET, POST, PUT, PATCH, DELETE | User API | sessionOnly | yes | `routes/api+/inbound-queue.tsx` | `docs/api-telephony-control.md` |  |
| `/api/inbound-sms` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound-sms.tsx` | `docs/api-webhooks.md` |  |
| `/api/inbound-verification` | POST | Internal Trusted | internalOnly | no | `routes/api+/inbound-verification.tsx` | `docs/api-internal-unsupported.md` | Call-in verification TwiML; service role, no Twilio signature. |
| `/api/inbound` | POST | Provider Webhook | providerOnly | no | `routes/api+/inbound.tsx` | `docs/api-webhooks.md` | Returns TwiML. |
| `/api/initiate-ivr` | POST | User API | sessionOnly | yes | `routes/api+/initiate-ivr.tsx` | `docs/api-telephony-control.md` |  |
| `/api/ivr` | POST | User API | sessionOnly | yes | `routes/api+/ivr.tsx` | `docs/api-telephony-control.md` |  |
| `/api/ivr/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/ivr/:campaignId/:pageId` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/$campaignId/$pageId.route.tsx` | `docs/api-webhooks.md` | Returns TwiML. |
| `/api/ivr/:campaignId/:pageId/:blockId` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/$campaignId/$pageId/$blockId.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/ivr/:campaignId/:pageId/:blockId/response` | POST | Provider Webhook | providerOnly | no | `routes/api+/ivr/$campaignId/$pageId/$blockId/response.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/media` | POST | User API | sessionOnly | yes | `routes/api+/media.tsx` | `docs/api-data-management.md` |  |
| `/api/message_media` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/message_media.tsx` | `docs/api-data-management.md` |  |
| `/api/numbers` | GET, POST | Workspace Admin | sessionOnly | yes | `routes/api+/numbers.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/outreach-attempts` | POST | User API | sessionOnly | yes | `routes/api+/outreach-attempts.tsx` | `docs/api-telephony-control.md` | Hyphenated path; preferred outreach attempt API. |
| `/api/outreach_attempts/:id` | POST | Security Gap | unsupported | no | `routes/api+/outreach_attempts/$id.route.tsx` | `docs/api-internal-unsupported.md` | duplicate route; Session cookie client only; no verifyAuth. Duplicate legacy route also registered. |
| `/api/outreach_attempts/:id` | POST | Security Gap | unsupported | no | `routes/api.outreach_attempts.$id.js` | `docs/api-internal-unsupported.md` | duplicate route; Legacy JS module; updates outreach_attempts table (typo). Do not use for integrations. |
| `/api/questions` | POST | User API | sessionOnly | yes | `routes/api+/questions.tsx` | `docs/api-telephony-control.md` | Call disposition / survey question updates on call screen. |
| `/api/queues` | GET, POST, DELETE | Security Gap | sessionOnly | no | `routes/api+/queues.tsx` | `docs/api-internal-unsupported.md` | Uses session client but does not require authenticated user on all code paths. |
| `/api/recording` | POST | Provider Webhook | providerOnly | no | `routes/api+/recording.tsx` | `docs/api-webhooks.md` |  |
| `/api/reset_campaign` | POST | User API | sessionOnly | yes | `routes/api+/reset_campaign.tsx` | `docs/api-data-management.md` |  |
| `/api/scripts` | POST | User API | sessionOnly | yes | `routes/api+/scripts.tsx` | `docs/api-data-management.md` |  |
| `/api/sms` | POST | Integrator API | publicSdk | yes | `routes/api+/sms.tsx` | `docs/api-send-sms.md` |  |
| `/api/sms/status` | POST | Provider Webhook | providerOnly | no | `routes/api+/sms/status.route.tsx` | `docs/api-webhooks.md` |  |
| `/api/stripe-webhook` | POST | Provider Webhook | providerOnly | no | `routes/api+/stripe-webhook.tsx` | `docs/api-webhooks.md` | Stripe-Signature header required; see docs/stripe-webhook.md. |
| `/api/survey-answer` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/survey-answer.tsx` | `docs/api-internal-unsupported.md` | Public survey respondent flow. |
| `/api/survey-complete` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/survey-complete.tsx` | `docs/api-internal-unsupported.md` |  |
| `/api/survey-responses` | POST | User API | sessionOnly | yes | `routes/api+/survey-responses.tsx` | `docs/api-data-management.md` |  |
| `/api/surveys` | POST, PATCH, DELETE | User API | sessionOnly | yes | `routes/api+/surveys.tsx` | `docs/api-data-management.md` |  |
| `/api/test-webhook` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/test-webhook.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/token` | GET | User API | sessionOnly | yes | `routes/api+/token.tsx` | `docs/api-telephony-control.md` | Twilio client access token for browser dialer. |
| `/api/verify-audio-pin/:pin` | GET | Public Form | publicUnauthenticated | yes | `routes/api+/verify-audio-pin/$pin.route.tsx` | `docs/api-internal-unsupported.md` | Static TwiML gather entry; returns TwiML. |
| `/api/verify-audio-session` | GET, POST | User API | sessionOnly | yes | `routes/api+/verify-audio-session.tsx` | `docs/api-telephony-control.md` | GET requires session; POST action returns TwiML without auth check. |
| `/api/verify-call-in-session` | GET | User API | sessionOnly | yes | `routes/api+/verify-call-in-session.tsx` | `docs/api-telephony-control.md` |  |
| `/api/verify-pin-input` | POST | Internal Trusted | internalOnly | no | `routes/api+/verify-pin-input.tsx` | `docs/api-internal-unsupported.md` | Twilio gather callback; service role, no Twilio signature. |
| `/api/workspace-api-keys` | GET, POST, DELETE | Workspace Admin | sessionOnly | yes | `routes/api+/workspace-api-keys.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/workspace` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspace.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/auth/register` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/register.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/token` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/token.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/refresh` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/refresh.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/signout` | POST | User API | sessionOnly | yes | `routes/api+/auth/signout.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/forgot-password` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/forgot-password.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/reset-password` | POST | User API | sessionOnly | yes | `routes/api+/auth/reset-password.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/verify-email` | POST | Public Form | publicUnauthenticated | yes | `routes/api+/auth/verify-email.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/auth/invites` | GET, POST | User API | sessionOnly | yes | `routes/api+/auth/invites.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/me` | GET, PATCH | User API | sessionOnly | yes | `routes/api+/me.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces` | GET, POST | User API | sessionOnly | yes | `routes/api+/workspaces.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId` | GET, PATCH, DELETE | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId/transfer-ownership` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/transfer-ownership.route.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/workspaces/:workspaceId/billing` | GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/billing.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId/billing/checkout-session` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/billing/checkout-session.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId/billing/sessions/:sessionId` | GET | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/billing/sessions/$sessionId.route.tsx` | `docs/api-agent-quickstart.md` |  |
| `/api/workspaces/:workspaceId/onboarding` | GET, PATCH | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/onboarding.route.tsx` | `docs/api-telephony-provisioning.md` |  |
| `/api/workspaces/:workspaceId/onboarding/actions` | POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/onboarding/actions.route.tsx` | `docs/api-telephony-provisioning.md` |  |
| `/api/workspaces/:workspaceId/numbers` | GET, POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/numbers.route.tsx` | `docs/api-telephony-provisioning.md` |  |
| `/api/workspaces/:workspaceId/numbers/:numberId` | PATCH, DELETE | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/numbers/$numberId.route.tsx` | `docs/api-telephony-provisioning.md` |  |
| `/api/workspaces/:workspaceId/webhook` | GET, PUT, POST | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/webhook.route.tsx` | `docs/api-workspace-admin.md` | POST tests webhook delivery. |
| `/api/workspaces/:workspaceId/members` | GET, POST, PATCH, DELETE | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/members.route.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/workspaces/:workspaceId/api-keys` | GET, POST, DELETE | Workspace Admin | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/api-keys.route.tsx` | `docs/api-workspace-admin.md` |  |
| `/api/workspaces/:workspaceId/campaigns` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/campaigns.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/campaigns/:campaignId` | GET, POST | Integrator API | sessionOnly | yes | `routes/api+/campaigns/$campaignId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/campaigns/:campaignId/queue` | GET, PATCH | Integrator API | sessionOnly | yes | `routes/api+/campaigns/$campaignId/queue.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/campaigns/:campaignId/results` | GET | Integrator API | sessionOnly | yes | `routes/api+/campaigns+/$campaignId/results.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/campaigns/:campaignId/call-session` | GET | User API | sessionOnly | yes | `routes/api+/campaigns+/$campaignId/call-session.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/campaigns/:campaignId/call-session/release` | POST | User API | sessionOnly | yes | `routes/api+/campaigns+/$campaignId/call-session/release.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/workspaces/:workspaceId/contacts` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/contacts.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/contacts/:contactId` | GET, DELETE | Integrator API | sessionOnly | yes | `routes/api+/contacts/$contactId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audiences` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audiences.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audiences/:audienceId` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audiences/$audienceId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audience-uploads/:uploadId` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audience-uploads/$uploadId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/scripts` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/scripts.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/scripts/:scriptId` | GET | Integrator API | sessionOnly | yes | `routes/api+/scripts/$scriptId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/surveys` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/surveys.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/surveys/:surveyId` | GET | Integrator API | sessionOnly | yes | `routes/api+/surveys/$surveyId.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/surveys/:surveyId/responses` | GET | Integrator API | sessionOnly | yes | `routes/api+/surveys/$surveyId/responses.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/surveys/:surveyId/responses/export` | GET | Integrator API | sessionOnly | yes | `routes/api+/surveys+/$surveyId/responses/export.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/conversations` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/conversations.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/conversations/:contactNumber` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.route.tsx` | `docs/api-data-plane.md` |  |
| `/api/workspaces/:workspaceId/audios` | GET, POST | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/audios.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/voicemails` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/voicemails.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/analytics` | GET | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/analytics.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/exports` | GET, POST | Integrator API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/exports.route.tsx` | `docs/api-analytics-export.md` |  |
| `/api/workspaces/:workspaceId/calls` | GET | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/calls.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/workspaces/:workspaceId/calls/listening` | POST, DELETE | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/calls/listening.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/workspaces/:workspaceId/handset/session` | GET, DELETE | User API | sessionOnly | yes | `routes/api+/workspaces+/$workspaceId/handset/session.route.tsx` | `docs/api-live-operations.md` |  |
| `/api/admin/dashboard` | GET, POST | Internal Trusted | internalOnly | yes | `routes/api+/admin+/dashboard.route.tsx` | `docs/api-admin.md` | Sudo-only admin dashboard and actions. |
| `/api/admin/users/:userId` | GET, PATCH | Internal Trusted | internalOnly | yes | `routes/api+/admin+/users+/$userId.route.tsx` | `docs/api-admin.md` |  |
| `/api/admin/users/:userId/workspaces` | GET, POST | Internal Trusted | internalOnly | yes | `routes/api+/admin+/users+/$userId/workspaces.route.tsx` | `docs/api-admin.md` |  |
| `/api/admin/workspaces/:workspaceId/twilio` | POST | Internal Trusted | internalOnly | yes | `routes/api+/admin+/workspaces+/$workspaceId/twilio.route.tsx` | `docs/api-admin.md` |  |

Total entries: **132**

