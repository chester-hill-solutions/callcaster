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
| POST | `/api/ivr/:campaignId` | IVR saved script entry TwiML |
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
| POST | `/api/voice-audio` | Operation-bound agent audio instructions, status and conference events |
| GET | `/api/connect-campaign-conference/:workspaceId/:campaignId` | Legacy campaign conference voice URL |
| POST | `/api/voice-continuation` | Signed manual and SDK parent continuation; live handoff integration in progress |
| POST | `/api/voice-recording` | Saved recording operation status and queued recording-part copies; initial call wiring in progress |
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

Agent audio callbacks bind the original account, saved URL and owned leg. Phone
acceptance and answered status do not activate the transport. A first idle phone
requires press-1 confirmation followed by its labeled conference join; a live
replacement joins muted and waits for a completed handoff. The first participant keeps ownership of the conference
callback URL. Current, pending and retired audio roles are resolved from the
event's actual participant SID. Retired leaves cannot end the current room.
Agent audio never dispatches the first contact or writes customer billing,
disposition or queue outcomes. A genuine current-agent hangup ends its exact
owned conference through the existing conference-end owner. Transient stop
failures return 500 so the provider can retry.

New manual REST and SDK customer instructions save a `POST /api/voice-continuation`
URL before issuing their one customer Dial. The query contains the saved
`credit_reservation` UUID. The original account, parent SID and known customer
SID bind the signed form. Ordinary completion returns Hangup. Only a joined,
uncommitted direct-call promotion that is already in progress can return the
original parent to its saved conference. Available provider parent and child
facts must match. Their lookup has a one-second limit; an unavailable API keeps
the authenticated original parent on its saved target and leaves replacement
commit pending. A known ended call returns Hangup. The callback does not create a
call, change customer identity, bill, dispose or advance the queue. Calls issued
without this saved continuation keep their existing behavior. Live promotion,
media continuity and transport commit are still in development.

Parent rescue is separate from replacement activation. If the replacement phone
fails after promotion starts, the still-active original parent can rejoin its
owned customer. Failed, canceled or retired phone status alone cannot end that
parent. After a successor commits, the old parent cannot rejoin through an older
failed operation.

Manual parent rescue accepts only unresolved or confirmed topology. Rejected
or closed promotions return Hangup. A confirmed room survives its first phone
and stays bound to the original account, actor, parent and customer. Another
audio intent cannot create a parallel unresolved promotion. Recording and
transcript continuity still need integration before source retirement.

Parent Dial action URLs and new owned audio conference callback URLs explicitly retry connection/read failures and 5xx, with
two retries inside the 15-second voice limit. The delivery-override fragment is
added only to TwiML; the saved URL and signature comparison exclude it. A 500
response alone does not enable provider retries. See [Twilio connection overrides](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides).
An existing conference keeps its first participant's callback delivery policy.
Later audio joins cannot replace it. Provider retries are finite. A genuine
owned hangup saves a room-stop intent before provider I/O; the audio recovery
worker resumes it through the original account and exact room SID. Terminal
phone status and call-row repair cannot discard the stop. Lost provider or
local acknowledgements retain the intent; an already completed room does not
need another provider update. New audio preparation, sends and initial
activation cannot proceed while an earlier room stop is pending. Live
customer promotion, transport commit and media continuity remain unfinished.

`POST /api/voice-recording?recording=<uuid>` accepts only the saved recording
operation's original account, physical CallSid, source and RecordingSid. It
validates the raw signature before alias normalization. A replacement account
token cannot authenticate an old account's operation. The send checkpoint must
already exist. Completed parts are saved before the existing recording job
queues their copy. Each part uses a distinct storage key under its logical
call. A delivery lease fences stale jobs. The existing one-minute voice recovery
job retries completed parts with no stored copy, including after queue failure
or a lost storage reply. Initial Dial wiring and media hydration remain in
development; this callback does not create a recording or bill the call.
Agent audio and parent continuation callbacks use the same original-account
check and strict raw form reader.

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
