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
| POST | `/api/connect-phone-device` | Connect browser device to campaign conference |

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
- `POST /api/dial/:number` — TwiML sub-route without signature
- Legacy `POST /api/outreach_attempts/:id`

## See also

- [Webhooks map](./api-webhooks.md)
- [Complete inventory](./api-surface-inventory.md)
