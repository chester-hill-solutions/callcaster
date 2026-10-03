# Webhook API Routes (Twilio & Stripe)

Provider callbacks authenticated by **signature**, not session or API keys. Configure these URLs in Twilio/Stripe dashboards — they are **not** customer integrator APIs.

Complete spec: [`/api/docs/openapi/all`](/api/docs/openapi/all) (tag: **Provider Webhook**)

## Twilio voice & status

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound` | Inbound call routing (TwiML) |
| POST | `/api/call-status` | Outbound/inbound call status |
| POST | `/api/dial/status` | AMD / dial status |
| POST | `/api/recording` | Recording status |
| POST | `/api/email-vm` | Voicemail email notification |

## Twilio SMS

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound-sms` | Inbound SMS |
| POST | `/api/sms/status` | Outbound SMS delivery status |

## Twilio IVR (outbound campaign)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ivr/status` | IVR call status |
| POST | `/api/ivr/:campaignId/:pageId` | IVR page TwiML |
| POST | `/api/ivr/:campaignId/:pageId/:blockId` | IVR block TwiML |
| POST | `/api/ivr/:campaignId/:pageId/:blockId/response` | IVR gather response |

## Twilio inbound IVR

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound-ivr/:numberId/:pageId` | Inbound IVR page |
| POST | `/api/inbound-ivr/:numberId/:pageId/:blockId` | Inbound IVR block |
| POST | `/api/inbound-ivr/:numberId/:pageId/:blockId/response` | Inbound gather response |

## Handset & auto-dial callbacks

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inbound-handset` | Inbound handset TwiML |
| POST | `/api/inbound-handset-dial-end` | Handset dial end |
| POST | `/api/auto-dial/:roomId` | Conference/AMD TwiML |
| POST | `/api/auto-dial/status` | Auto-dial status |
| GET | `/api/connect-campaign-conference/:workspaceId/:campaignId` | Conference connect voice URL |
| POST | `/api/caller-id/status` | Caller ID verification status |

`POST /api/auto-dial/status` handles a signed `participant-leave` event with
`ReasonParticipantLeft=participant_hung_up` before ordinary call-status events.
It completes the participant's conference for both agent and callee legs,
including agent rows with no outreach attempt. An already-ended conference is
acknowledged. A provider stop failure returns 500 so Twilio can retry.

After the stop, the route emits a `predictive_broadcast` with `conference_id`
and `conference_ended=true`. Only the matching call screen ends its conference.
Ordinary contact status events also include the stored conference ID when it
is available, so their later completion events stay within that conference.
Ordinary call completion has no conference-end marker and keeps the conference
available for the next dialer turn.
Call end metadata is saved on a best-effort basis. The participant event does
not claim `call.status`; the ordinary terminal callback retains its billing
and outcome work. See [Twilio's conference callback parameters](https://www.twilio.com/docs/voice/twiml/conference#statuscallback).

## Stripe

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/stripe-webhook` | Billing events (`Stripe-Signature` required) |

Setup: [stripe-webhook.md](./stripe-webhook.md)

## Signature requirements

- **Twilio**: `X-Twilio-Signature` validated against the full URL and form body (or GET query for voice URLs).
- **Stripe**: `Stripe-Signature` validated with `STRIPE_WEBHOOK_SECRET` on the raw request body.

## See also

- [Internal routes without signatures](./api-internal-unsupported.md)
- [Complete inventory](./api-surface-inventory.md)

### Campaign queue scope

Predictive dispatch, hangup and terminal callbacks dequeue only the call's
campaign. Household grouping stays within that campaign. Calls without a
campaign do not remove a contact from campaign queues. The guarded dequeue still
skips a row assigned to another agent and reports whether the primary contact
was changed.

The internal session-authenticated `POST /api/queues` request requires
`contact_id`, `campaign_id` and boolean `household`. IDs must be positive safe
integers (numeric strings are accepted). The contact and campaign must belong
to the authorized workspace. Missing or invalid IDs return 400; a missing queue
entry or a workspace mismatch returns 404. Existing 409 claim conflicts and
already-dequeued success responses stay unchanged.

SMS opt-out and do-not-call dispositions remove the contact from all campaign
queues in the workspace through an explicit `allCampaigns: true` target.
They do not fan out to other household members.

Migration `20261003000000_scope_dequeue_contact_by_campaign.sql` replaces the
five-argument RPC with `(contact, campaign, household, workspace, user, reason)`
and removes old overloads. Deploy the matching application and migration
together. Old application callers fail after the old signature is removed;
they cannot use an unscoped fallback. Both fresh database bootstrap paths
include the new function.
