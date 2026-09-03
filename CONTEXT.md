# CallCaster

A calling and SMS platform for political campaigns, built on Bun, React Router 8, Drizzle, Better Auth, and Twilio. Operated by Nathaniel Arfin / Chester Hill Solutions, primarily serving Canadian Liberal campaigns at the federal, provincial, and municipal levels.

## Language

### Core concepts

**Workspace**: A tenant organization (typically a political campaign or riding association). Owns campaigns, contacts, numbers, scripts, credits. Has members (users with roles: owner, admin, member, caller, field_director).
_Avoid_: Tenant, account, organization

**Campaign**: A dialing or messaging effort against an audience. Has a type (live_call, ivr, message), a phase (identification, persuasion, gotv), a script, a caller ID, a queue, and a schedule. v2 consolidates the former live_campaign/ivr_campaign/message_campaign type-specific tables into a single campaign table with type-gated columns.
_Avoid_: Project, effort, drive

**Script**: A pages/blocks JSON document defining the call or IVR flow. Stored in the `script` table; the engine lives in `@chester-hill-solutions/scriptkit-call-script-core`. Supports outbound call scripts and inbound IVR menus.
_Avoid_: Flow, questionnaire (except for the legacy survey system)

**Audience**: A collection of contacts targeted by a campaign. Uploaded via CSV import.
_Avoid_: List (except "voter list"), contact group

**Contact**: A person with phone, email, address. Belongs to a workspace. Has `opt_out` flag (honors STOP/START SMS keywords). In v2, tracks voter list source and lifecycle.
_Avoid_: Voter (use "voter" only when referring specifically to a registered elector on a voter list)

### Platform access

**Product Middleware**: Route-tree authentication that runs before child page or API handlers and injects session or workspace context without writing a response body.
_Avoid_: Layout middleware, route guard (implementation terms)

**Data Plane**: The workspace-scoped JSON API surface under `/api/workspaces/:id/*` used by the web app and external integrators.
_Avoid_: API layer, backend (too generic)

**Sudo Admin Portal**: The cross-workspace operator interface at `/admin/*`, restricted to users with sudo access level.
_Avoid_: Admin panel, back office (informal)

### Calling domain

**Voter**: A contact who is a registered elector. Has a support level (1-5), turnout propensity, and belongs to a household. Comes from a voter list (Liberalist, VAN, Elections Canada).
_Avoid_: Elector (use in formal/legal context only)

**Household**: A group of voters at the same address. The unit of contact in political calling — call once, ask for any voter, record outcomes per voter. Has a do-not-knock flag and last-contacted-at. Scientifically validated as a targeting unit (Finnish nationwide RCT: household spillover exceeds 100% of the direct treatment effect, Hirvonen et al. 2024).
_Avoid_: Family, residence, dwelling

**Support Level**: A 1-5 scale: 1=Strong Support, 2=Lean Support, 3=Undecided/Persuadable, 4=Lean Opposition, 5=Strong Opposition. Industry standard (VAN/NGP). Used to segment the campaign universe across three phases.
_Avoid_: Score (use "score" for modeled propensity, not the 1-5 contact result), rating

**Campaign Phase**: One of three field-work modes: Identification (ID — tag every voter with a support level), Persuasion (move 3s toward support), Get Out The Vote (GOTV — ensure 1s and 2s vote). Blending phases on a single turf degrades data quality.
_Avoid_: Stage, step

**GOTV**: Get Out The Vote — the final 96 hours before election day. Targets only identified supporters (1s and 2s). Scripts are purely logistical: voting plan, ride offers, poll location. Not persuasion.
_Avoid_: Mobilization (use for the broader concept), push

**E-day**: Election day. The most intense calling period. Real-time progress tracking is critical.

**Contact Rate**: Meaningful conversations divided by attempts. Phone banking: 10-20%. Canvassing: 25-40%. A key field operations metric.
_Avoid_: Response rate, answer rate

**Callback Audit**: A 5% random sample of logged contacts verified by a different volunteer within 48 hours. Prevents data fabrication. The mere knowledge of auditing reduces fabrication by 60-70%.

**Issue Tag**: A topic label on a contact result (healthcare, education, housing, crime, transit, economy). Feeds persuasion targeting, digital ad audiences, and volunteer recruitment. At least one issue tag per contact is the field ops standard.

### Voter data

**Voter List**: A contact list imported from a voter database (Liberalist, VAN, Elections Canada). Has a source, import date, and may expire or be revoked. Party-controlled voter data access is temporary — access can be revoked without notice.
_Avoid_: Voter file (use for the raw database, not the imported list)

**Liberalist**: The Liberal Party of Canada's voter database. Access is party-controlled and can be revoked. Contains voter registration, turnout history, and modeled scores. The Liberalist Virtual Phone Bank (VPB) is a separate calling workflow with list + script + event coordination.
_Avoid_: The List, LL

**DNC / Do Not Call**: The CRTC Do-Not-Call List. Political calls are exempt if non-commercial. Robocalls must identify the caller. The 2011 Canadian robocall scandal made parties cautious about automated calling.

### Telephony

**Workspace Number**: A phone number owned by a workspace. Can be rented (monthly billing) or external (verified caller ID). Has inbound handling config (IVR script, queue, handset, forward, voicemail).
_Avoid_: Phone (use for the device, not the workspace number)

**Queue Entry**: A row in `campaign_queue` representing a contact queued for dialing. Has lifecycle: queued → assigned → dequeued/canceled. In v2, uses normalized `queue_state` + `assigned_to_user_id` + `provider_status` (not the overloaded `status` column).
_Avoid_: Dial item, call target

**Agent Status**: A per-workspace-per-user row (`agent_status`) tracking availability: offline, available, busy, wrap_up, away. Authoritative routing input for ACD. Replaces the legacy `user.activity` heartbeat.
_Avoid_: Presence (use for the UI concept), state (use for the enum value)

**ACD**: Automatic Call Distribution — inbound call routing to available agents via queues with ring strategies (longest_idle, round_robin, ring_all). Built on Twilio Voice Queues + conferences, not Twilio TaskRouter.

**Inbound Queue**: A configured queue for inbound calls with ring strategy, business hours, overflow action, and service level target.

**Outreach Attempt**: A single attempt to reach a contact (call or SMS). Has disposition, support level, issue tags, volunteer interest, and timestamps. In v2, has typed result fields instead of a JSON blob.

**Handset Session**: A browser calling session for an agent. Newest wins (takeover model). Uses Twilio Voice SDK tokens minted per-workspace.

**Credits**: Prepaid balance on a workspace. Debited per SMS segment, voice minute, number rental. Synced from the `transaction_history` ledger via the `apply_ledger_entry_and_sync_credits` plpgsql RPC (atomic insert + credits update — a concurrency primitive per ADR-0003, not a banned trigger per ADR-0006).

**Ledger**: The `transaction_history` table — append-only, idempotent (unique on `workspace, type, idempotency_key`). The source of truth for billing. `workspace.credits` is a mutable cache kept in sync atomically by the `apply_ledger_entry_and_sync_credits` RPC.

### Compliance (Canadian context)

**CASL**: Canada's Anti-Spam Legislation. Political messages are exempt if non-commercial. Fundraising URLs, merchandise, or partisan advocacy in SMS may trigger CASL consent requirements. Keep GOTV texts purely informational.

**PIPEDA**: Personal Information Protection and Electronic Documents Act. Governs handling of voter phone numbers and personal information. Parties are PIPEDA-exempt but face reputational risk.

**CRTC DNCL**: Do-Not-Call List. Political calls are exempt if non-commercial. Robocalls must identify the caller.

**Recording Consent**: Canada is one-party-consent (Criminal Code s. 184). The campaign caller is the consenting party. Recording is generally legal without notifying the voter.

**Messaging Service**: Used for outbound SMS sender pool and compliance (A2P 10DLC, toll-free verification), NOT for inbound webhooks. Inbound voice/SMS routes through number-level `voiceUrl`/`smsUrl` on each purchased `workspace_number`.

### Interactive messaging

**Script Revision**: An immutable published snapshot of a Script's executable document, with a version number, checksum, policy/disclosure references, and conversion diagnostics. Interactions execute a pinned Revision; edits create a new draft/Revision and never mutate a published one.
_Avoid_: Script instance, versioned steps

**Campaign Run**: One immutable execution snapshot of a reusable Campaign — audience Queue Entries, sender, sending windows, Script Revision, disclosure/jurisdiction policy, and reserved budget. A Campaign may have many Runs; subsequent launches create new Runs.
_Avoid_: Campaign execution, campaign instance

**Interaction**: One Contact executing one Script Revision through a Campaign Run, from dispatch until completion, expiry, opt-out, supersession, or handoff closure. Distinct from the durable message thread (a Conversation). Has its own lifecycle (pending, active, paused, completed, expired, opted_out, failed, cancelled) and a current operation cursor.
_Avoid_: Run, script session, conversation

**Messaging Endpoint**: The channel address pair of a concrete workspace sender identity and a normalized recipient, plus channel. Interactive reply correlation and active-uniqueness key on it; a Messaging Service pool reserves the recipient before binding the concrete sender after Twilio accepts the message.
_Avoid_: Conversation identity, sender pair

**Messaging Consent**: A recipient-level, append-only record of grant, revocation (STOP), opt-in (START), import evidence, or override, with source, evidence reference, purpose, channel, and policy version. Contact `opt_out` is at most a compatibility projection during migration.
_Avoid_: Subscription, marketing consent

**Interaction Event**: An immutable, append-only semantic record of one state transition (command, actor, prior/new state, reason, provider/model/action correlation). The authoritative current state is a projection derived from the event history.
_Avoid_: Step log, activity

**Action Request**: A durable, idempotent result of a Script `action` operation, validated against an allow-listed domain action registry and settled by an executor; sensitive actions require exact recipient intent, confirmation, and human approval.
_Avoid_: Webhook call, side effect

### Live transcription & coaching

**Live Transcription**: Real-time, in-call speech-to-text delivered to the agent's browser via pg-realtime SSE. Built on Twilio Media Streams (unidirectional `<Start><Stream track="both_tracks">`) forked to the media-stream Bun service, which forwards 8kHz mulaw to Deepgram Nova-3 streaming. Gated per-workspace by `workspace.featureFlags.liveTranscription`. Distinct from post-call batch transcription (Cohere).
_Avoid_: Captioning (use for video, not telephony), voicemail-to-text (that's batch)

**Transcript Segment**: One row in `transcript_segment` per Deepgram `speech_final` utterance. Has `speaker` (0=agent, 1=contact, assigned by Deepgram diarization), `startMs`/`endMs`, `fillerCount`, `text`. Referenced by `callId` (domain PK). The live UI appends these as they arrive via SSE; the post-call view shows them as a scrollable transcript.
_Avoid_: Transcript line, caption

**Live Coaching**: Self-service, feature-flagged (`workspace.featureFlags.liveCoaching`) real-time feedback for the human agent during a call. Two layers: rule-based metrics (WPM, filler count, pauses) updated per utterance, and LLM-generated suggestion cues (Cohere Command A) on a 30-second cadence. The AI never speaks on the call. Distinct from a future autonomous AI coach orchestrator (deferred Phase 2).
_Avoid_: AI agent (use for the autonomous Phase 2 concept), whisper coaching (use for the Twilio conference whisper-leg pattern, not this)

**Coaching Event**: One row in `coaching_event` per coaching signal: `filler_burst` (≥3 fillers in one utterance), `pace` (WPM outside configured range for 3+ utterances), `pause` (gap > `coachingConfig.pauseThresholdMs`), `suggestion` (LLM-generated cue with `{heading, suggestion}`), `objection` (future). Has `severity` (info/warn/critical) and `acknowledgedAt` (set when the agent dismisses it).
_Avoid_: Coaching tip, feedback item

**Coaching Session**: One row in `coaching_session` per call, written on stream stop. Has `wpmAvg`, `fillerCount`, `pauseCount`, `longPauseCount`, `score` (0-100, composite: 30% filler frequency, 25% pace adherence, 25% pause discipline, 20% silence ratio), and an LLM-generated `summary`. Shown in the post-call call-detail view.
_Avoid_: Coaching report (use for the exported/aggregate view across sessions)

**Filler Word**: A disfluency marker ("uh", "um", "like", "you know", "basically", "actually"). Deepgram Nova-3 with `filler_words=true` tags the first six natively (`uh`, `um`, `mhmm`, `mm-mm`, `uh-uh`, `uh-huh`, `nuh-uh`); the rest are matched on transcript text against the configurable `workspace.coachingConfig.fillerWords` list. Counted per utterance in `transcript_segment.fillerCount` and cumulatively in `coaching_session.fillerCount`.
_Avoid_: Disfluency (use in clinical/speech-pathology context), hesitation (broader — includes pauses)

**Golden Transcript**: The post-call `call_transcript` row with `provider='elevenlabs_scribe_v2'`, produced by the `elevenlabs_batch_transcribe` worker job (ElevenLabs Scribe `scribe_v2`, `POST https://api.elevenlabs.io/v1/speech-to-text`) from the saved recording (`call.audioUrl`). More accurate than the live transcript on clean post-call audio. `call.transcriptId` is repointed from the live transcript to the golden transcript when the worker job completes. Shown in the post-call call-detail view in place of the live transcript. (ADR-0029 predates this and still describes a Cohere design that never shipped.)
_Avoid_: Final transcript (use "golden" to distinguish from the live version), clean transcript

**Media-Stream Service**: The third Railway service (alongside web + worker) that owns the Twilio Media Streams WebSocket bridge, Deepgram Nova-3 streaming client, and coaching engine. Built on `Bun.serve({ port: MEDIA_STREAM_PORT ?? "3001" })` (native WS, no `ws` library). Same codebase, different entry point — consistent with the worker pattern (ADR-0007). Autoscales by concurrent WebSocket connections. Resolved via `MEDIA_STREAM_HOST` (default `localhost:3001`) and `MEDIA_STREAM_PORT` (default `3001`), separate from `BASE_URL`.
