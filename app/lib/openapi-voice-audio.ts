import { errorResponse, rateLimitResponse } from "@/lib/openapi-platform-components";
import { sessionCookieSecurity } from "@/lib/openapi-integrator";

const callSid = { type: "string", pattern: "^CA[0-9a-fA-F]{32}$" };
const workspaceId = { type: "string", format: "uuid" };
const intentId = { type: "string", format: "uuid", description: "Keep this UUID for retries of the same audio change." };
const actorHeader = { name: "X-Callcaster-Audio-Actor", in: "header", required: false, schema: { type: "string", minLength: 1 },
  description: "New clients send their signed-in actor. A mismatch with the authenticated session returns 409 before any audio operation. It is a precondition, not caller-supplied authority." };
const phoneNumber = { type: "string", pattern: "^\\+[1-9][0-9]{1,14}$", description: "Verified number owned by this user. Outer whitespace is trimmed." };
const liveProperties = { workspaceId, callSid, connection_intent_id: intentId, expected_agent_sid: callSid };
const connectionState = { type: "string", enum: ["prepared", "creating", "joining", "ready", "switching", "active", "retired", "failed", "canceled"] };
const snapshot = {
  type: "object", required: ["connection_id", "connection_state", "workspace_id", "user_id", "connection_intent_id", "destination",
    "control_intent_id", "requested_call_sid", "campaign_id", "callSid", "source_agent_sid", "generation", "transport", "cancel_requested"],
  properties: {
    connection_id: { type: "string", format: "uuid" }, connection_state: connectionState,
    workspace_id: workspaceId, user_id: { type: "string", minLength: 1 },
    connection_intent_id: { ...intentId, description: "Stored intent of this connection. Reusing an existing connection retains its original intent UUID." },
    control_intent_id: { ...intentId, description: "Current request that owns connection controls. A reused connection can have a different original intent." },
    destination: { type: "string", minLength: 1, description: "Saved verified E.164 phone number or server-resolved client identity." },
    requested_call_sid: { ...callSid, nullable: true }, campaign_id: { type: "integer", minimum: 1, nullable: true },
    callSid: { ...callSid, nullable: true }, source_agent_sid: { ...callSid, nullable: true },
    generation: { type: "integer", minimum: 1 }, transport: { type: "string", enum: ["phone", "computer"] },
    cancel_requested: { type: "boolean" },
  },
};
const connectionFailure = (description: string) => ({ description, content: { "application/json": { schema: {
  anyOf: [
    { type: "object", required: ["error"], properties: { error: { type: "string" }, reason: { type: "string" } } },
    { ...snapshot, required: [...snapshot.required, "error"], properties: { ...snapshot.properties, error: { type: "string" }, reason: { type: "string" } } },
  ],
} } } });
const query = [
  { name: "workspaceId", in: "query", required: true, schema: workspaceId },
  { name: "connection_id", in: "query", required: false, schema: { type: "string", format: "uuid" }, description: "Use either this ID or connection_intent_id." },
  { name: "control_intent_id", in: "query", required: false, schema: intentId, description: "With connection_id, require this current control owner. Stale controls return 409." },
  { name: "connection_intent_id", in: "query", required: false, schema: intentId, description: "Read/cancel the submitted request, including a lost POST reply. Omit both connection_id and control_intent_id." },
  actorHeader,
];
const requestIdentity = { type: "object", required: ["transport", "destination", "callSid", "expectedAgentSid", "campaignId"], properties: {
  transport: { type: "string", enum: ["phone", "computer"] }, destination: { type: "string", nullable: true },
  callSid: { ...callSid, nullable: true }, expectedAgentSid: { ...callSid, nullable: true }, campaignId: { type: "integer", minimum: 1, nullable: true },
} };
const intentSnapshot = { type: "object", required: ["workspace_id", "user_id", "connection_intent_id", "intent_state", "request", "connection"], properties: {
  workspace_id: workspaceId, user_id: { type: "string", minLength: 1 }, connection_intent_id: intentId,
  intent_state: { type: "string", enum: ["bound", "canceled", "superseded"] }, request: { ...requestIdentity, nullable: true },
  connection: { ...snapshot, nullable: true },
} };

/** One owned audio operation covers session control and signed provider callbacks. */
export const voiceAudioPathOverrides: Record<string, Record<string, unknown>> = {
  "/api/connect-phone-device": {
    post: {
      operationId: "connectAgentAudio", summary: "Connect or replace the agent audio transport",
      "x-callcaster-supported": true, "x-callcaster-exposure": "sessionOnly",
      "x-callcaster-auth-class": "session", "x-callcaster-docs-guide": "docs/api-telephony-control.md",
      security: [...sessionCookieSecurity],
      parameters: [actorHeader],
      description: "Session cookie or bearer session only. The device belongs to the signed-in user. Connection is separate from customer dispatch: it does not claim or call the first contact, add a customer debit or take another customer hold. Keep current audio until connection_state is active. Accepted, answered and ready states alone do not prove a completed handoff. Retain the intent UUID on retry; uncertain provider creation is recovered without another create. A manual call issued without a saved parent continuation returns 409 and keeps its existing audio. Manual calls permit one unresolved customer promotion; a new intent cannot replace it after its phone ends. Confirmed topology retains the original room and first callback owner for later phones. Closed topology cannot create another room while terminal customer status is delayed.",
      requestBody: { required: true, content: { "application/json": { schema: { oneOf: [
        { type: "object", additionalProperties: false, required: ["workspaceId", "phoneNumber"], properties: {
          workspaceId, phoneNumber, device: { type: "string", enum: ["phone"] }, connection_intent_id: intentId,
          campaignId: { oneOf: [{ type: "integer", minimum: 1 }, { type: "string", minLength: 1 }], description: "Optional owned idle campaign; a string must parse as a positive integer." },
        } },
        { type: "object", additionalProperties: false, required: ["workspaceId", "phoneNumber", "callSid", "connection_intent_id", "expected_agent_sid"],
          properties: { ...liveProperties, phoneNumber, device: { type: "string", enum: ["phone"] } } },
        { type: "object", additionalProperties: false, required: ["workspaceId", "device", "callSid", "connection_intent_id", "expected_agent_sid"],
          properties: { ...liveProperties, device: { type: "string", enum: ["computer"] } } },
      ] } } } },
      responses: {
        "200": { description: "Agent call accepted or an owned attempt replayed. Check connection_state before changing effective audio.",
          content: { "application/json": { schema: { ...snapshot, required: [...snapshot.required, "success"],
            properties: { ...snapshot.properties, success: { type: "boolean", enum: [true] } } } } } },
        "400": errorResponse("Invalid input or unavailable caller ID"), "401": errorResponse("Unauthorized"),
        "402": { description: "Idle connection has no available credits", content: { "application/json": { schema: {
          type: "object", required: ["error", "creditsError"], properties: { error: { type: "string", enum: ["Insufficient credits"] }, creditsError: { type: "boolean", enum: [true] } },
        } } } }, "403": errorResponse("Device is not verified for this user"),
        "404": errorResponse("Workspace, user-owned connection or target call not found"),
        "409": connectionFailure("Pending operation, stale audio owner, changed provider account or unavailable manual continuation. A prepared owned attempt includes its last known snapshot for read/cancel. Current audio stays active."),
        "429": rateLimitResponse, "502": connectionFailure("Provider connection failed. An owned saved attempt includes its last known snapshot for read/cancel; an error never confirms active audio."),
      },
    },
    get: {
      operationId: "getAgentAudioConnection", summary: "Read an owned audio connection attempt",
      security: [...sessionCookieSecurity], parameters: query,
      description: "Exactly one connection_id or connection_intent_id is required. Intent reads never create a provider call. They resolve the submitted request even when it reused a connection with an older original intent. A canceled or superseded request cannot adopt another request's controls.",
      responses: { "200": { description: "Operation state; active requires a verified conference join and completed transport commit.",
        content: { "application/json": { schema: { oneOf: [snapshot, intentSnapshot] } } } }, "400": errorResponse("Invalid query"),
        "401": errorResponse("Unauthorized"), "404": errorResponse("Connection or submitted intent not found"), "409": errorResponse("The control owner changed") },
    },
    delete: {
      operationId: "cancelAgentAudioConnection", summary: "Cancel a pending audio replacement or idle connection",
      security: [...sessionCookieSecurity], parameters: query,
      description: "Cancel only this agent transport. Cancel by submitted intent can precede POST admission; its saved cancellation prevents a delayed POST from ringing a new phone. A reused connection changes its current control intent; an older request can cancel itself but cannot end the newer owner's connection. No cancellation path creates a provider call. An uncertain create remains pending until recovery can stop the accepted leg. This operation cannot hang up or advance a live customer; use the customer hangup or a new audio change for an active live transport.",
      responses: { "200": { description: "Cancellation saved or already complete; intent cancellation can have no connection yet", content: { "application/json": { schema: { oneOf: [snapshot, intentSnapshot] } } } },
        "400": errorResponse("Invalid query"), "401": errorResponse("Unauthorized"), "404": errorResponse("Connection not found"),
        "409": errorResponse("Stale control owner, active customer audio or unfinished promotion"), "429": rateLimitResponse },
    },
  },
};

export const voiceAudioProviderPathOverrides: Record<string, Record<string, unknown>> = {
  "/api/voice-continuation": {
    post: {
      operationId: "continueManualVoiceParent", summary: "Continue the original manual or SDK parent after its customer Dial",
      description: "Provider-only signed POST to the exact URL saved before the one customer instruction. Raw signature validation precedes alias normalization. The saved original account, parent SID, child SID and root facts bind the event. Ordinary completion returns Hangup. A requested and previously joined direct-call promotion can resume its original parent; this never activates the replacement. Failed replacement status alone cannot end the parent, and a committed successor permanently fences that parent. Rejected and closed promotions return Hangup. Fresh provider facts, when available, must match; ended calls return Hangup. Provider verification is bounded to one second: an unavailable API keeps the authenticated original source on its saved target and leaves replacement commit pending. SDK To can be a custom recipient request parameter; actual SDK root identity is checked separately. Dial action delivery explicitly retries connection/read failures and 5xx within the 15-second voice limit; its override fragment is excluded from the saved signed URL. The endpoint never creates a call, changes customer identity, settles a hold, writes disposition or advances a queue. Calls issued without this saved capability cannot be promoted.",
      parameters: [
        { name: "X-Twilio-Signature", in: "header", required: true, schema: { type: "string", minLength: 1 } },
        { name: "credit_reservation", in: "query", required: true, schema: { type: "string", format: "uuid" } },
      ],
      requestBody: { required: true, content: { "application/x-www-form-urlencoded": { schema: {
        type: "object", required: ["AccountSid", "CallSid", "From", "Direction"], properties: {
          AccountSid: { type: "string" }, CallSid: callSid, DialCallSid: callSid, DialCallStatus: { type: "string" },
          DialCallDuration: { type: "string" }, From: { type: "string" }, To: { type: "string" }, Direction: { type: "string", enum: ["inbound", "outbound-api"] },
        },
      } } } },
      responses: {
        "200": { description: "Safe hangup or an owned parent conference instruction; never a new customer", content: { "text/xml": { schema: { type: "string" } } } },
        "403": { description: "Signature, saved URL, parent, customer or provider identity mismatch", content: { "text/xml": { schema: { type: "string" } } } },
        "405": { description: "Only POST is accepted; Allow: POST" },
        "500": errorResponse("Temporary storage or continuation processing failure"),
      },
    },
  },
  "/api/voice-audio": {
    post: {
      operationId: "handleAgentAudioProviderEvent", summary: "Handle signed agent audio instructions, status and conference events",
      description: "Provider-only POST. Validate the raw Twilio signature over the unchanged full URL and form before alias normalization. The connection UUID, saved callback URL, original account and physical participant facts bind the event. An accepted or answered call does not activate audio. A replacement prejoins muted and cannot dispatch or bill a customer. The first callback owner can end while its original parent/customer bridge remains active; their verified joins and genuine current hangups still apply. A retired source cannot end the current conference. Transient processing or provider-stop failures return 500. New owned audio conference TwiML explicitly retries connection/read failures and 5xx; the saved signed URL excludes the override fragment. An existing conference retains its first participant's delivery policy. Provider retries are finite. Genuine current hangups save a durable stop before provider I/O. Original-account recovery verifies the exact conference name and SID, including after the phone becomes terminal or an acknowledgement is lost. Pending room stops block new audio preparation, sends and initial activation. Live customer promotion, transport commit and media continuity remain in development.",
      parameters: [
        { name: "X-Twilio-Signature", in: "header", required: true, schema: { type: "string", minLength: 1 } },
        { name: "connection", in: "query", required: true, schema: { type: "string", format: "uuid" } },
        { name: "event", in: "query", required: true, schema: { type: "string", enum: ["voice", "status", "conference"] } },
      ],
      requestBody: { required: true, content: { "application/x-www-form-urlencoded": { schema: { oneOf: [
        { type: "object", required: ["AccountSid", "CallSid", "To", "From", "Direction"], properties: {
          AccountSid: { type: "string" }, CallSid: callSid, To: { type: "string" }, From: { type: "string" },
          Direction: { type: "string", enum: ["outbound-api"] }, CallStatus: { type: "string" }, CallDuration: { type: "string" },
          Digits: { type: "string", description: "Phone audio requires a signed press-1 Gather confirmation before conference instructions are issued." },
        } },
        { type: "object", required: ["AccountSid", "ConferenceSid", "FriendlyName", "StatusCallbackEvent"], properties: {
          AccountSid: { type: "string" }, ConferenceSid: { type: "string", pattern: "^CF[0-9a-fA-F]{32}$" }, FriendlyName: { type: "string" },
          StatusCallbackEvent: { type: "string" }, CallSid: callSid, ParticipantLabel: { type: "string" }, Muted: { type: "string", enum: ["true", "false"] },
          ReasonParticipantLeft: { type: "string", description: "Only participant_hung_up is a genuine participant hangup; removal and conference end cannot end another audio generation." },
        } },
      ] } } } },
      responses: {
        "200": { description: "Saved conference instruction or a safe hangup", content: { "text/xml": { schema: { type: "string" } } } },
        "204": { description: "Owned provider event acknowledged" },
        "403": { description: "Signature, operation or participant mismatch", content: { "text/xml": { schema: { type: "string" } } } },
        "500": errorResponse("Temporary event-processing or provider-stop failure"),
      },
    },
  },
};
