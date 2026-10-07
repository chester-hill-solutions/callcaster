# Live Telephony Verification Plan

## Status

**Proposal.** This document defines a separate, paid verification tier for
CallCaster voice, SMS, inbound answering machine, outbound voicemail, and IVR
flows.

It does not change the normal Playwright E2E suite. Normal E2E must stay fast,
hermetic, and safe to run in pull requests. Its Twilio requests are currently
intercepted in [`e2e/fixtures/twilio-mocks.ts`](../e2e/fixtures/twilio-mocks.ts).

## Problem

The normal E2E suite verifies CallCaster UI and local webhook behavior. It does
not prove that Twilio can:

- place a real call to a reachable number;
- deliver a real SMS and receive a reply;
- fetch the public TwiML and callback URLs;
- report real call and message status callbacks;
- run an IVR call with actual DTMF; or
- test inbound answering machine behavior and create/retrieve an outbound
  voicemail recording.

These paths have provider cost, timing variance, and external state. They must
be in a distinct **live-telephony** tier.

## Goals

1. Use the CallCaster UI to start real calls and messages.
2. Use only numbers, accounts, and recipients owned by CHS for automated runs.
3. Verify the full path: UI -> CallCaster -> Twilio -> test peer -> Twilio ->
   CallCaster webhooks -> database/worker -> UI result.
4. Support deterministic scripted behavior first.
5. Add optional AI voice behavior later without making it the required test
   oracle.
6. Make every external action traceable, rate-limited, cost-bounded, and safe
   to retry.

## Non-goals

- Contacting customer or prospect numbers.
- Replacing unit, database, or standard browser E2E tests.
- Using production workspaces, production credits, or production Twilio
  subaccounts as fixtures.
- Treating a Twilio status callback as a guarantee that a human heard a call or
  read a message.

## Recommended shape

Use a **small, stable pool of role-based test numbers**, not a large pool of
numbers that pretend to be many contacts.

### Recommended initial number pool

| Role | Quantity | Purpose |
|---|---:|---|
| CallCaster sender | 1 | Number owned by the dedicated live-test workspace. It sends calls and SMS from the UI. |
| Deterministic voice/DTMF peer | 1 | Answers calls, plays a fixed prompt, sends a controlled DTMF response where feasible, then ends. |
| Outbound voicemail peer | 1 | Answers as a deterministic answering machine, plays a greeting, records the outbound voicemail, and exposes its recording result to the harness. |
| SMS peer | 1 | Receives SMS, records the exact body, and sends a deterministic reply. |
| Optional human handset | 1 | A real mobile or softphone number for supervised pickup, hangup, and audible checks. Not used in unattended CI. |
| Optional AI peer | 1 | Later use only. It is an isolated endpoint or number for conversational tests. |

One permanent number can host several behaviors, selected by a signed `runId`
or test scenario. Separate numbers for **voice**, **inbound answering machine**,
and **SMS** are still recommended. They make logs, routing, costs, and failure
diagnosis clear.

Use **inbound answering machine** when a peer calls into CallCaster and reaches
CallCaster's answering-machine flow. Use **outbound voicemail** when CallCaster
calls a peer and leaves a message.

Do not rent a large number per test contact. That increases rental cost,
configuration drift, and cleanup work without increasing confidence. Add a new
number only when the provider or product behavior is genuinely number-specific:
for example a separate geography, sender type, or a human-supervised handset.

## Environments and isolation

The live tier needs three isolated resources:

1. **A dedicated Twilio subaccount**
   - Owns the live-test numbers and credentials.
   - Has low spending and concurrency limits.
   - Is not a customer or production subaccount.
   - Has a clear name such as `callcaster-live-e2e`.

2. **A dedicated CallCaster live-test environment**
   - Has a stable public HTTPS `BASE_URL`.
   - Has a separate database and object storage bucket.
   - Contains one dedicated workspace, users, contacts, campaigns, scripts, and
     credits for these tests.
   - Stores the live-test Twilio subaccount credentials only for this workspace.
   - Runs the web process and worker continuously while tests run.

3. **A dedicated telephony test-peer service**
   - Has a stable public HTTPS URL.
   - Receives calls and messages to the peer numbers.
   - Returns deterministic TwiML or sends controlled replies.
   - Stores a durable event ledger which Playwright can query.

Never point real Twilio webhooks at local `localhost` or the compose E2E server.
Twilio needs a public HTTPS URL. A local tunnel is suitable for supervised
development only. Scheduled verification should use stable deployed URLs.

## Test tier selection and scheduling

Create a new, separate Playwright project and workflow. Suggested names:

```text
e2e/playwright.live-telephony.config.ts
e2e/live-telephony/*.spec.ts
npm run test:live-telephony
npm run test:live-telephony:headed
.github/workflows/live-telephony.yml
```

Tests must use the Playwright tag `@live-telephony`. The normal configuration
must exclude this directory/tag. The live configuration must include only it.

### Run policy

| Trigger | Run live tier? | Reason |
|---|---|---|
| Local manual command | Yes, after explicit operator confirmation | It sends real traffic and incurs cost. |
| Pull request | No | Avoid charges, flaky provider timing, and secret exposure. |
| Push | No by default | A push must not call or text a number unexpectedly. |
| Scheduled workflow | Yes, low frequency, for example nightly or weekly | Detect provider/configuration drift. |
| Manual GitHub dispatch | Yes | Permit a controlled release or incident check. |

Use a protected GitHub Environment named `live-telephony`. Put Twilio and
environment credentials there. Require approval for manual production-like
runs. Keep the workflow concurrency at one run.

Each run needs a unique `runId`. Pass it through campaign/contact metadata and
peer-service callback URLs. The peer rejects traffic without a valid signed
`runId`, expected source number, and expiry. This prevents accidental external
messages from becoming test results.

## Bare-minimum proof of concept

The first deliverable is **not** a large test suite. It is one small service and
one real, observable round trip.

### POC success condition

From the CallCaster UI, an operator sends one SMS from the dedicated workspace
to the permanent SMS peer number. The peer records the received SMS and sends a
fixed reply. The operator sees the reply in CallCaster chats. The harness has
durable evidence for:

- the CallCaster-created message SID;
- the peer's inbound request and exact body;
- the peer's outbound reply SID;
- CallCaster's received reply row; and
- message status callbacks, where the carrier supplies them.

This POC proves credentials, sender ownership, public webhooks, inbound
attribution, signature validation, message persistence, and reply handling. It
costs less and has fewer timing variables than voice.

### POC peer service: required code

Implement a small Bun/TypeScript service. It may begin in this repository under
`services/telephony-test-peer/`, but it must deploy separately from the app.
Keeping it separate reduces the chance that a CallCaster deployment failure also
hides a peer failure.

Required parts:

1. **Configuration validation**
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` or a restricted API key.
   - `PEER_SMS_NUMBER` and later voice numbers in E.164 form.
   - `PEER_BASE_URL` and a database URL.
   - An allowlist of CallCaster sender numbers.
   - A test-only secret for the harness API.

2. **Inbound SMS endpoint**: `POST /twilio/sms`
   - Validate Twilio's `X-Twilio-Signature` with the peer account credentials.
   - Reject unknown destination numbers and unallowlisted sources.
   - Parse `runId` and scenario token from a strict message envelope.
   - Persist the raw safe fields, Twilio message SID, source/destination, body
     hash, received time, and scenario result.
   - Send exactly one predefined reply. Use a deterministic body such as
     `CC-LIVE <runId> SMS-REPLY-OK`.
   - Return empty Messaging TwiML or `204`, depending on the chosen reply path.

3. **Message status endpoint**: `POST /twilio/message-status`
   - Validate the signature.
   - Persist all status changes idempotently by message SID and status.

4. **Harness API**
   - `POST /runs` creates a short-lived run and scenario token.
   - `GET /runs/:runId` returns redacted events and terminal state.
   - Require the harness secret or workload identity; never expose this API
     publicly without authentication.

5. **Durable ledger**
   - Store events in Postgres, not process memory or logs only.
   - Include `run_id`, provider SID, event type, timestamp, request hash, and
     a safe payload subset.
   - Redact phone numbers in normal logs. The test database may retain them only
     while required for diagnosis, with a retention job.

6. **Observability**
   - Structured logs with `runId`, Twilio SID, scenario, and outcome.
   - A health endpoint.
   - A small operator page or CLI that shows the latest run state.

### POC CallCaster code and test changes

1. Add a live-test fixture loader. It must read only explicit live-test
   environment variables, never default to normal E2E placeholders.
2. Add a dedicated contact in the live-test workspace for `PEER_SMS_NUMBER`.
3. Add `e2e/live-telephony/sms-round-trip.spec.ts`.
4. Use Playwright to sign in, open chats or the SMS sending UI, send the
   generated test envelope, and wait for a visible sending result.
5. Poll the authenticated peer harness API for `SMS_RECEIVED` and `SMS_REPLIED`.
6. Poll the CallCaster UI or a test-only read-only verification endpoint until
   the matching reply appears. Assert by `runId`, never only by text count.
7. Add a cleanup step that archives or marks only the run-specific messages.
   Do not delete general workspace data by a broad query.

### POC manual setup

1. Create the dedicated Twilio subaccount and set a low spend alert.
2. Buy one SMS-capable number and one voice-capable number in that subaccount.
3. Deploy the peer service to a stable HTTPS hostname.
4. Configure the SMS peer number's inbound webhook and status callback to the
   peer service.
5. Deploy or configure the CallCaster live-test environment with a stable HTTPS
   `BASE_URL` and a dedicated database.
6. Create the dedicated CallCaster workspace and save the live-test subaccount
   credentials in its Twilio configuration.
7. Configure the CallCaster sender number and test contact through the product
   UI or an auditable provisioning script.
8. Verify signature validation is enabled on both systems. Do not set
   `TWILIO_VALIDATE_WEBHOOKS=false`.
9. Run one supervised SMS round trip and save the SIDs and peer event ledger.
10. Only after it works, add the manual command and protected workflow.

## Deterministic voice and IVR peer

After the SMS POC, add voice behavior to the same peer service.

### Required peer endpoints

| Endpoint | Responsibility |
|---|---|
| `POST /twilio/voice` | Validate request, identify run/scenario, record the inbound call, and return scenario TwiML. |
| `POST /twilio/voice/gather` | Record received DTMF digits and return next TwiML. |
| `POST /twilio/voice/recording` | Record the outbound voicemail recording URL, duration, and status. |
| `POST /twilio/voice/status` | Record voice status transitions idempotently. |

All callbacks require Twilio signature validation. The response must complete
well under Twilio's voice webhook limit. Never call an AI model directly in a
voice webhook before returning TwiML.

### Deterministic scenarios

| Scenario | Peer TwiML behavior | Assertions |
|---|---|---|
| Human answer | Fixed `Say`, short `Pause`, then `Hangup` | Call reaches `in-progress` then `completed`; CallCaster records terminal status. |
| IVR/DTMF | Fixed prompt plus `Gather`; records expected digits | Correct IVR branch, callback, and terminal state. |
| Outbound voicemail | Fixed answering-machine greeting then `Record` | Outbound voicemail recording callback and retrievable recording metadata. |
| Busy/no-answer | Do not answer or use a controlled provider response where available | Correct CallCaster terminal failure/no-answer handling. |
| SMS reply | Record received body; reply with fixed message | Outbound message, inbound reply, and conversation state. |

### IVR technical risk

Automating DTMF in a two-sided Twilio call needs a proof of feasibility. Do not
assume an inbound peer's TwiML can reliably emulate a caller pressing keys in
every topology.

Evaluate these options with a small spike:

1. **Call update / `SendDigits` on the correct Twilio call leg**
   - Best for real provider verification if Twilio permits the required call-leg
     control.
   - Requires reliable parent/child call SID correlation.

2. **A peer TwiML `<Play digits>` flow**
   - Simple if it sends DTMF to the CallCaster IVR leg in the chosen topology.
   - Must be proven with actual `Gather` callbacks before it becomes a test
     dependency.

3. **A SIP or programmable softphone peer**
   - Most realistic keypad interaction.
   - More infrastructure and timing complexity.

4. **Human-supervised IVR case**
   - Useful during development and for a release check.
   - Not suitable as a scheduled regression test.

Keep existing route and TwiML unit tests for page order and DTMF logic. The
live test should prove provider transport and integration, not replace detailed
IVR behavior coverage.

## Inbound answering machine and outbound voicemail design

These are two different directions and must use different names in test titles,
reports, dashboards, and incident messages.

1. **Inbound answering machine testing**
   - The peer calls a CallCaster-owned number.
   - CallCaster does not reach an available agent and routes the call to its
     answering-machine flow.
   - The peer records a short, fixed message after the greeting.
   - The live test asserts the inbound call route, recording callback, stored
     recording URL, worker side effects, and authorized CallCaster retrieval.
   - Use this exact term in test IDs, reports, dashboards, and incident
     messages.

2. **Outbound voicemail**
   - CallCaster calls the peer number.
   - The peer acts as an answering machine, plays a fixed greeting, and records
     the message left by CallCaster.
   - The peer stores the recording callback and exposes its URL and duration to
     the harness.
   - This proves that CallCaster's outbound call flow can leave a message at a
     real external endpoint.

Do not use the unqualified word `voicemail` in new test IDs or scenario names.
Use `inbound-answering-machine` or `outbound-voicemail` so call direction is
always obvious.

For deterministic content, play a fixed owned WAV/MP3 answering-machine greeting
and record a fixed short outbound voicemail or inbound answering-machine message.
Do not use speech generation until the deterministic path is stable. Test
recordings must not contain personal, customer, payment, or health data.

## AI peer options

AI is optional. It is useful for conversational robustness checks, not for the
baseline release gate.

### Option A: Pre-recorded scripted audio and DTMF — recommended baseline

The peer returns fixed TwiML, owned audio, fixed delays, fixed DTMF, and fixed
SMS replies.

**Pros**

- Lowest provider and model cost.
- Repeatable assertion values.
- Fast diagnosis.
- No prompt injection or unsafe content risk.
- Suitable for scheduled runs.

**Cons**

- Does not test free-form conversation.
- Cannot evaluate speech recognition quality.

### Option B: Rule-based state machine

The peer matches a small allowlisted grammar and transitions through scripted
voice/SMS states. It can accept one of several expected phrases or digits.

**Pros**

- More flexible than fixed audio.
- Still deterministic and cheap.
- Good bridge before an LLM.

**Cons**

- Requires custom dialogue logic.
- Does not behave like natural speech.

### Option C: AI voice peer

Use a dedicated AI service with real-time speech recognition, an LLM, and TTS,
or Twilio ConversationRelay where appropriate.

Required additions:

- A separate AI account/API key and strict monthly budget.
- A real-time media transport and interruption/barge-in handling.
- Short, versioned system prompts and a fixed scenario contract.
- Prompt-injection isolation: CallCaster-supplied or caller-supplied text is
  untrusted input, never system instructions.
- A conversation transcript and event trace linked to `runId`.
- Semantic assertions with bounded acceptance rules, not exact wording alone.
- Timeouts, fallback TwiML, and deterministic failure responses.
- Explicit recording/transcript retention and deletion controls.

**Pros**

- Tests conversational paths and natural language recovery.
- Can explore unexpected wording and interruptions.

**Cons**

- Higher and variable cost.
- Non-deterministic output causes flaky tests.
- More latency and operational failure modes.
- Adds privacy, retention, and prompt-safety concerns.

### Recommended AI policy

Do not put AI in the release gate at first. Create a separate `@live-ai` suite
that is manual or low-frequency scheduled. Keep the deterministic peer as the
required oracle for voice, SMS, inbound answering machine, outbound voicemail,
and IVR transport.

## Assertions and evidence

Every live test should collect a single correlated evidence record:

```text
runId
CallCaster workspace and environment
scenario version
source/destination number aliases
CallCaster message/call/recording IDs
Twilio MessageSid/CallSid/RecordingSid
peer receipt and response events
CallCaster webhook and worker terminal events
timestamps and elapsed time
redacted request/response metadata
```

Use bounded polling with explicit stage timeouts. Example stages:

1. UI request accepted within 15 seconds.
2. Peer receives the call/SMS within 60 seconds.
3. Required callback reaches CallCaster within 90 seconds.
4. Worker side effect and UI state complete within 120 seconds.

On failure, retain redacted logs, Playwright trace/video, peer ledger events,
and Twilio SIDs. Do not retry a send blindly. First query the peer and Twilio
state using the known correlation IDs. A retry can create a second call/text and
turn a diagnostic failure into a cost or consent problem.

## Safety, compliance, and cost controls

This is test traffic between owned assets, but it is still live telephony.

- Use only pre-approved owned numbers and an explicit source-number allowlist.
- Keep the caller ID and recipient in E.164 form.
- Honor CallCaster's recipient time-window and opt-out logic even for test
  contacts. Test only within allowed hours unless an approved test override is
  explicitly designed and audited.
- Include an unmistakable test prefix in SMS and spoken prompts, for example
  `CallCaster automated test`.
- Do not use customer data, external contacts, payment data, or PHI.
- Limit each run to a fixed maximum of calls, messages, recording minutes, and
  total duration.
- Set Twilio usage alerts and a small subaccount budget.
- Use a kill switch that prevents new runs and causes the peer to hang up or
  stop replying safely.
- Keep provider credentials in protected environment secrets, not `.env`, test
  source, Playwright traces, screenshots, or peer event payloads.
- Validate every Twilio webhook signature. CallCaster validates against the
  workspace subaccount token; the peer must do the same for its account.
- Make webhook and worker effects idempotent because Twilio callbacks can be
  duplicated or arrive out of order.

Before any non-owned recipient is used, obtain explicit authorization and
confirm applicable voice/SMS consent, calling-hour, opt-out, recording, and
jurisdiction rules. Do not make that a normal automated test path.

## Phased delivery

### Phase 0 — design and account boundary

- Create the isolated Twilio subaccount and cost limits.
- Reserve the small role-based number pool.
- Select the live-test CallCaster environment and protected workflow.
- Write a runbook for emergency stop, credential rotation, and number cleanup.

### Phase 1 — SMS round-trip POC

- Build and deploy the peer service SMS endpoint and event ledger.
- Provision one CallCaster sender and one SMS peer contact.
- Add one manual, headed Playwright test.
- Verify one UI-originated SMS and deterministic reply.

### Phase 2 — deterministic voice lifecycle

- Add peer voice, status, and hangup scenarios.
- Add one outbound UI call test.
- Verify real `answered`/`completed` callback processing and UI state.

### Phase 3 — answering machine and outbound voicemail recording

- Add the outbound voicemail peer scenario.
- Verify outbound voicemail recording receipt.
- Add a separate inbound answering machine test for CallCaster recording
  ingestion.

### Phase 4 — IVR DTMF feasibility spike

- Prove one automated DTMF method against the real CallCaster IVR.
- Record the exact call-leg/SID topology and chosen method.
- Add only stable scenarios to the scheduled suite.

### Phase 5 — scheduled protected verification

- Add the isolated Playwright project and GitHub workflow.
- Run nightly or weekly with one worker and a cost ceiling.
- Alert on failure with Twilio SIDs and peer run details.

### Phase 6 — optional AI exploration

- Add the AI peer behind `@live-ai` only.
- Start with manual runs and a fixed spend cap.
- Promote scenarios only after repeated stable, useful results.

## Decisions required before implementation

1. Which non-production CallCaster environment will be the permanent live-test
   environment?
2. Is the peer service a small service in this repository or a separate
   infrastructure repository?
3. Which jurisdiction and number type will the dedicated numbers use?
4. What is the per-run and monthly spend limit?
5. Who can approve a live run and rotate its credentials?
6. What recording/transcript retention period is acceptable?
7. Which DTMF automation option succeeds in the Phase 4 proof?
8. Does the team want AI exploration after deterministic coverage, or only a
   deterministic peer at first?

## Existing CallCaster integration points

This plan builds on current product paths rather than duplicating them:

- Inbound voice: `app/routes/api+/inbound.action.server.ts`
- Inbound SMS: `app/routes/api+/inbound-sms.action.server.ts`
- Call status callbacks: `app/routes/api+/call-status.action.server.ts`
- Recording callbacks: `app/routes/api+/recording.action.server.ts`
- Outbound IVR call creation: `app/routes/api+/ivr.action.server.ts`
- Workspace-specific webhook signature validation:
  `app/lib/twilio-webhook.server.ts`
- Current local Twilio tunnel sync helper:
  `scripts/local/sync-calling-dev.mjs`

The peer and live tests must use these public routes and real workspace
credentials. They must not bypass them by writing CallCaster message/call state
directly to the database.
