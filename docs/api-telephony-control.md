# Telephony & Dialer Control API Routes

Session and internal telephony control for live calling, IVR, auto-dial, and handset flows. Provider callbacks are documented in [api-webhooks.md](./api-webhooks.md).

Public spec: [`/api/docs/openapi`](/api/docs/openapi) · UI: [`/docs`](/docs) · Webhooks: [complete surface](/docs?spec=complete)

## Authentication (bearer policy)

Dialer, handset, and agent-presence routes require an authenticated user via **session cookie** or **`Authorization: Bearer <session_token>`** (`requireJsonAuth`). Workspace API keys (`cc_…`) are **not** accepted on these routes — use a bearer token from `POST /api/auth/token` for headless dialer clients.

| Auth | Accepted on dialer routes |
| --- | --- |
| Session cookie (`better-auth.session_token` on HTTP; `__Secure-better-auth.session_token` on HTTPS) | Yes |
| Bearer session token | Yes |
| Workspace API key | No |

Keep the exact cookie name and signed value issued by the target deployment. Browser clients use their cookie jar. See [session client setup](./api-overview.md#session-browser) for generated SDK configuration.

## Voice start request limit

Voice starts share a budget of **120 requests per minute per authenticated
user or API key**. The budget covers `POST /api/dial`, `POST /api/ivr`,
`POST /api/connect-phone-device`,
`POST /api/workspaces/:workspaceId/campaigns/:campaignId/dialer/start`, and
voice test sends from campaign settings. The workspace dialer start route
accepts keys with `calls.start` and an authorized `agentUserId`. The legacy
routes keep their current authentication rules.

An exhausted budget returns HTTP `429` with
`{ "error": "Too many requests", "code": "rate_limited" }` and a
`Retry-After` header in seconds. Wait that long before retrying. The refusal
occurs before a provider call. Changing the target workspace, recipient,
agent, or caller IP does not reset the same credential's budget.

This limit bounds HTTP starts. Funded reservations control available credits;
worker dispatch and active predictive capacity have separate controls. Provider
callbacks, call endings, inbound calls and campaign SMS tests do not spend this
voice request budget.

## Workspace telephony (Phase 6)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/calls` | Paginated call log (query filters match UI) |
| POST/DELETE | `/api/workspaces/:workspaceId/calls/listening` | Start/stop inbound call listening on handset |
| GET/DELETE | `/api/workspaces/:workspaceId/handset/session` | Handset session state / end session |
| GET | `/api/campaigns/:campaignId/call-session` | Call-screen bootstrap (token, queue, campaign) |
| POST | `/api/campaigns/:campaignId/call-session/release` | Release assigned queue contacts |

`GET/POST/DELETE /api/queues` requires bearer or session auth plus workspace access (campaign must belong to the caller's workspace).

## Browser dialer / tokens

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/token` | Twilio client access token (`?workspace=`) — bearer or session |
| GET | `/api/handset-token` | Handset-specific access token — bearer or session |
| GET/POST | `/api/agent-status` | Read/update agent dialer status — bearer or session |
| POST/GET/DELETE | `/api/connect-phone-device` | Create, read or cancel an owned agent audio connection |

### Agent audio connection (#2879, in development)

The active branch implements the owned connection journal, read/cancel controls,
signed provider callbacks, manual parent continuation, durable room-stop recovery
and confirmed idle phone joins. Live cutover, media
continuity and browser transport controls remain in development. No release
acceptance is claimed.

A verified phone replaces both the microphone and speaker. Connection remains
separate from customer dispatch: it does not claim or dial the first contact,
take another customer hold, or write another customer voice debit.

An idle phone request keeps the legacy body `{ workspaceId, phoneNumber,
campaignId? }`. Send a stable UUID in `connection_intent_id` to replay the same
attempt. The campaign, when supplied, must belong to the workspace. The phone
must be verified for the signed-in user.

After the phone answers, the agent must press **1** before joining. Voicemail
cannot activate audio. The signed Gather callback uses the same saved voice URL
and physical call identity; a missing or wrong digit ends that agent leg.

For a live change, send `callSid`, `expected_agent_sid` and
`connection_intent_id`. Omit `campaignId`; the server resolves the owned call
and its campaign. Phone mode uses `phoneNumber` and optional `device: "phone"`.
Computer mode uses `device: "computer"` and omits `phoneNumber`. The server
resolves the user's client identity; callers cannot choose another agent.

The response retains `success` and `callSid`, and adds `connection_id`,
`connection_state`, `generation` and `transport`. Poll with
`GET /api/connect-phone-device?workspaceId=…&connection_id=…`. Only **active**
means the new transport is committed. Accepted, answered and **ready** mean
that work remains. Keep the existing audio until active. A failed phone change
keeps that audio and the original customer call. Manual calls issued before
the parent-continuation capability return `409` for a live change.

Retries keep the same intent. A pending or uncertain create returns `409`;
recovery checks the original provider account and saved callback URLs before
another action. A current funded call does not need more available credits
to change its audio. Idle connection still requires available credits.

Manual calls permit one unresolved customer promotion. A new intent cannot
replace it, including after its phone ends; the same intent can still replay.
After the conference is verified, later phones reuse its account, room SID,
first callback owner and original customer/parent identities. A positively
rejected promotion permits a fresh room while the original call remains live.
A confirmed room end prevents reuse before delayed customer status arrives.
Recording and transcript continuity must be ready before source retirement.

`DELETE` with the same query cancels only the selected pending attempt or an
idle connection. An uncertain create keeps its pending state until recovery
can stop the accepted agent leg. It cannot end or advance the customer. End a
live customer through the existing call control, or replace its audio with a
new connection attempt.

## Outbound dial & hangup

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/dial` | Initiate campaign dial (returns TwiML) |
| POST | `/api/hangup` | Hang up active call leg |
| POST | `/api/audiodrop` | Voicemail drop |
| POST | `/api/caller-id` | Start caller-ID verification |

Manual dial uses one staffed first-minute hold for the setup and recipient
legs. `user_id` must identify the signed-in user. A phone device must be
verified for that user; queue, contact, campaign and optional outreach IDs
must belong to the same workspace and contact context.

`dial_intent_id` is an optional UUID. Retain it for transport retries; use a
new UUID for each new Dial or Redial action. The call screen supplies it.
Requests without it retain the legacy meaning of a new action, but an active
or uncertain predecessor still blocks another call. Optional
`expected_queue_generation` rejects a stale queue view for a new intent. A
matching accepted intent returns the existing TwiML success response, including
a retry with its original generation after a re-add. Authentication and workspace
access are checked again; the saved operation identifies its original device,
caller ID, recipient and context. An empty optional `outreach_id` retains the
legacy meaning of creating a new attempt.

To reuse a confirmed idle phone, send `audio_connection_id`, `audio_generation`,
the same verified `selected_device`, and a stable `dial_intent_id`. The connection
must already be active for this agent and workspace. Start checks the live phone
and room again, reserves one customer hold, and calls only the selected customer.
It does not ring the agent again. Accepted retries return the same customer SID
before mutable device checks. This form returns JSON
`{ "success": true, "callSid": "CA..." }`; legacy requests retain TwiML success.
Phone Connect itself never starts a customer. This path remains in development
with the phone transport controls and physical acceptance.
A new legacy phone setup returns `409` while the actor has an unresolved audio
connection. Omitting both source fields cannot ring another agent. Existing
accepted intent retries still return their saved result.

Insufficient available funds return `402`. Pending or stale operations return
JSON with an `error` and status `409`. An uncertain provider create also returns
`reason: "voice_dispatch_pending"`; its hold remains for recovery. A definite
provider rejection returns JSON with an `error` and status `502`. Only an
accepted call returns TwiML success. These error fields let the call screen
leave Dialing and show the failure or pending message.

## IVR (session initiation)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ivr` | Outbound IVR dial initiation |
| POST | `/api/initiate-ivr` | Structured IVR initiate (JSON/Zod) |

Repeated requests for the same queued IVR attempt reuse its call SID. An
explicit re-add of a completed contact starts a new funded attempt. Moving a
row to Queued through the queue page/API or resetting the campaign also creates
a new attempt. Campaign reset pauses the campaign and retains funded call and
outreach records for billing and recovery. An older
call reply cannot remove that new attempt or add to its failure count.

While an earlier call for the same queue row is active or awaiting provider
recovery, the new attempt stays queued. Direct IVR initiation returns `409`
for that pending operation or a contact that is no longer queued. A queue ID
that does not match the workspace, campaign and contact returns `404`.
Normal campaign phone deduplication remains in effect. An explicit redial
request permits a new attempt after prior calls; it keeps the current funding
and recipient calling-window checks.

Removing queue, contact, campaign or outreach data does not cancel a call
already accepted by the provider. Its signed callback or verified recovery
can restore the call record for billing. Removed links stay empty; remaining
links must belong to the same workspace. The saved call SID and billing kind
still control settlement, so repeated callbacks do not add another debit.

## Auto-dial

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auto-dial` | Start auto-dial session |
| POST | `/api/auto-dial/end` | End auto-dial session |
| POST | `/api/auto-dial/dialer` | **Internal** predictive dial worker (service role) |

`POST /api/auto-dial/end` accepts JSON `{ "workspaceId": "...", "conferenceName": "..." }`.
`conferenceName` is optional. When supplied, it must be a name generated for the
signed-in user (`<user-id>~<session-id>`); an invalid name returns 400. Without a
name, the route also finds that user's active conferences in the workspace's
Twilio account, including conferences with no active call rows. Other users'
conference names are excluded. Workspace access is required in both cases.

A successful response is `{ "success": true }`. If a conference cannot be
completed, the route returns 502 and the call screen keeps the device available
for retry. Predictive Leave waits for this response before local teardown and
does not reset the campaign queue.

## Inbound queue (session CRUD)

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST/PUT/PATCH/DELETE | `/api/inbound-queue` | Manage inbound queue members |

## Outreach & disposition

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/outreach-attempts` | Create outreach attempt (preferred path) |
| POST | `/api/questions` | Call disposition / script questions |

## Verification flows

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/verify-call-in-session` | Start call-in verification session |
| GET/POST | `/api/verify-audio-session` | Retired audio PIN flow; returns 410 |
| GET | `/api/verify-audio-pin/:pin` | Retired audio PIN flow; returns 410 |

## Internal / weak routes

Documented in [api-internal-unsupported.md](./api-internal-unsupported.md):

- `POST /api/disconnect` — Twilio Device disconnect
- `POST /api/dial/:number` — signed TwiML sub-route for the saved call account
- Legacy `POST /api/outreach_attempts/:id`

## See also

- [Webhooks map](./api-webhooks.md)
- [Complete inventory](./api-surface-inventory.md)
