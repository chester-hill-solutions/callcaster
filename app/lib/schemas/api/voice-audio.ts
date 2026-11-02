import { z } from "zod";
import { VALID_CALL_STATUSES } from "@/lib/call-status";
import { voiceDialerCurrentSchema } from "./voice-dialer-stop";

const callSid = z.string().regex(/^CA[0-9a-f]{32}$/i);

/** Session-only connection response. Keep in sync with openapi-voice-audio.ts. */
export const voiceAudioSnapshotSchema = z.object({
  connection_id: z.uuid(),
  connection_state: z.enum(["prepared", "creating", "joining", "ready", "switching", "active", "retired", "failed", "canceled"]),
  workspace_id: z.uuid(),
  user_id: z.string().min(1),
  connection_intent_id: z.uuid(),
  control_intent_id: z.uuid(),
  destination: z.string().min(1),
  requested_call_sid: callSid.nullable(),
  campaign_id: z.number().int().positive().nullable(),
  callSid: callSid.nullable(),
  source_agent_sid: callSid.nullable(),
  generation: z.number().int().positive(),
  transport: z.enum(["phone", "computer"]),
  cancel_requested: z.boolean(),
}).superRefine((snapshot, ctx) => {
  if (snapshot.connection_state === "active" && !snapshot.callSid)
    ctx.addIssue({ code: "custom", message: "Active audio requires its provider call", path: ["callSid"] });
  const validDestination = snapshot.transport === "phone" ? /^\+[1-9]\d{1,14}$/.test(snapshot.destination) : /^client:\S+$/.test(snapshot.destination);
  if (!validDestination) ctx.addIssue({ code: "custom", message: "Destination does not match the audio transport", path: ["destination"] });
});

export type VoiceAudioSnapshot = z.infer<typeof voiceAudioSnapshotSchema>;

export const voiceAudioAcceptedSchema = voiceAudioSnapshotSchema.safeExtend({ success: z.literal(true) });

export const voiceAudioRequestIdentitySchema = z.object({
  transport: z.enum(["phone", "computer"]), destination: z.string().nullable(), callSid: callSid.nullable(),
  expectedAgentSid: callSid.nullable(), campaignId: z.number().int().positive().nullable(),
}).superRefine((request, ctx) => {
  if ((request.transport === "phone" ? !request.destination || !/^\+[1-9]\d{1,14}$/.test(request.destination) : request.destination !== null) ||
    (request.callSid ? !request.expectedAgentSid || request.campaignId !== null : request.expectedAgentSid !== null || request.transport === "computer"))
    ctx.addIssue({ code: "custom", message: "Audio request context is invalid" });
});
export type VoiceAudioRequestIdentity = z.infer<typeof voiceAudioRequestIdentitySchema>;

function matchesAudioIntentContext(request: VoiceAudioRequestIdentity, connection: VoiceAudioSnapshot) {
  if (request.transport !== connection.transport || request.callSid !== connection.requested_call_sid) return false;
  if (request.transport === "phone" && request.destination !== connection.destination) return false;
  return request.callSid ? request.expectedAgentSid === connection.source_agent_sid : request.campaignId === connection.campaign_id;
}

export const voiceAudioIntentSnapshotSchema = z.object({
  workspace_id: z.uuid(), user_id: z.string().min(1), connection_intent_id: z.uuid(),
  intent_state: z.enum(["bound", "canceled", "superseded"]),
  request: voiceAudioRequestIdentitySchema.nullable(), connection: voiceAudioSnapshotSchema.nullable(),
}).superRefine((value, ctx) => {
  const invalid = () => ctx.addIssue({ code: "custom", message: "Audio request does not own this connection", path: ["connection"] });
  const connection = value.connection;
  if (value.intent_state === "bound" && (!connection || !value.request)) invalid();
  if (value.intent_state === "superseded" && connection) invalid();
  if (!connection) return;
  if (connection.workspace_id !== value.workspace_id || connection.user_id !== value.user_id ||
    connection.control_intent_id !== value.connection_intent_id || !value.request || !matchesAudioIntentContext(value.request, connection)) invalid();
  if (value.intent_state === "canceled" && !connection.cancel_requested && !["canceled", "failed", "retired"].includes(connection.connection_state)) invalid();
});
export type VoiceAudioIntentSnapshot = z.infer<typeof voiceAudioIntentSnapshotSchema>;

function matchesCurrentAudioRole(owner: { workspace_id: string; user_id: string }, intent: VoiceAudioIntentSnapshot, role: "active" | "pending") {
  const connection = intent.connection;
  if (intent.workspace_id !== owner.workspace_id || intent.user_id !== owner.user_id || !connection) return false;
  return role === "active" ? connection.connection_state === "active" : ["prepared", "creating", "joining", "ready", "switching"].includes(connection.connection_state);
}

/** A server read, never authority to send a customer or change a control owner. */
const recoveredAttemptSchema = z.object({
  answered_at: z.string().nullable(), campaign_id: z.number().int().positive(), callback_audit: z.boolean().nullable(),
  contact_id: z.number().int().positive(), created_at: z.string(), current_step: z.string().nullable(),
  disposition: z.string().nullable(), ended_at: z.string().nullable(), id: z.number().int().positive(),
  issue_tags: z.array(z.string()).nullable(), lawn_sign: z.boolean().nullable(), membership_sold: z.boolean().nullable(),
  result: z.json(), support_level: z.number().int().nullable(), user_id: z.string().min(1),
  volunteer_interest: z.string().nullable(), vote_by_mail: z.boolean().nullable(), workspace: z.uuid(),
});
function matchesRecoveredAttempt(customer: { outreach_attempt_id: number; workspace_id: string; user_id: string; campaign_id: number;
  contact_id: number; attempt: z.infer<typeof recoveredAttemptSchema> }) {
  const attempt = customer.attempt;
  return attempt.id === customer.outreach_attempt_id && attempt.workspace === customer.workspace_id &&
    attempt.user_id === customer.user_id && attempt.campaign_id === customer.campaign_id && attempt.contact_id === customer.contact_id;
}
const recoveredCustomerContextSchema = z.object({ workspace_id: z.uuid(), user_id: z.string().min(1), call_sid: callSid,
    campaign_id: z.number().int().positive(), contact_id: z.number().int().positive(), outreach_attempt_id: z.number().int().positive(),
    queue_id: z.number().int().positive(), attempt: recoveredAttemptSchema,
    conference_id: z.string().min(1).nullable(),
});
export type RecoveredCallCustomer = z.infer<typeof recoveredCustomerContextSchema>;

export const manualCustomerRecoverySchema = recoveredCustomerContextSchema.extend({
  reservation_id: z.uuid(), dial_intent_id: z.uuid(), agent_call_sid: callSid,
  provider_status: z.enum(VALID_CALL_STATUSES),
  request: z.object({
    to_number: z.string().regex(/^\+[1-9]\d{1,14}$/), caller_id: z.string().regex(/^\+[1-9]\d{1,14}$/),
    selected_device: z.string().min(1), requested_outreach_attempt_id: z.number().int().positive().nullable(),
    queue_generation: z.uuid(), audio_connection_id: z.uuid().nullable(), audio_generation: z.number().int().positive().nullable(),
  }),
}).superRefine((customer, ctx) => {
  if (!matchesRecoveredAttempt(customer) || customer.call_sid === customer.agent_call_sid ||
    (customer.request.audio_connection_id === null) !== (customer.request.audio_generation === null))
    ctx.addIssue({ code: "custom", message: "Recovered manual customer does not match its saved owner" });
});
export type RecoveredManualCustomer = z.infer<typeof manualCustomerRecoverySchema>;

export const predictiveCustomerRecoverySchema = z.object({
  revision: z.string().regex(/^(0|[1-9]\d*)$/).max(19),
  customer: recoveredCustomerContextSchema.extend({
    conference_id: z.string().min(1), conference_sid: z.string().regex(/^CF[0-9a-f]{32}$/i).nullable(),
    conference_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), human_state: z.enum(["pending", "joined"]),
  }).nullable(),
}).superRefine((value, ctx) => {
  if (value.customer && (value.revision === "0" || value.customer.human_state === "joined" && !value.customer.conference_sid))
    ctx.addIssue({ code: "custom", message: "Recovered customer has no saved human owner" });
  const customer = value.customer;
  if (customer && !matchesRecoveredAttempt(customer))
    ctx.addIssue({ code: "custom", message: "Recovered outreach attempt does not own this customer" });
});
export type PredictiveCustomerRecovery = z.infer<typeof predictiveCustomerRecoverySchema>;
export type RecoveredPredictiveCustomer = NonNullable<PredictiveCustomerRecovery["customer"]>;

function matchesCurrentPredictiveOwner(value: { workspace_id: string; user_id: string; customer_pending: boolean; predictive: PredictiveCustomerRecovery }) {
  const customer = value.predictive.customer;
  return !customer || customer.workspace_id === value.workspace_id && customer.user_id === value.user_id && value.customer_pending;
}
function matchesCurrentManualOwner(value: { workspace_id: string; user_id: string; customer_pending: boolean;
  manual: RecoveredManualCustomer | null; predictive: PredictiveCustomerRecovery }) {
  const customer = value.manual;
  return !customer || customer.workspace_id === value.workspace_id && customer.user_id === value.user_id &&
    value.customer_pending && !value.predictive.customer;
}

export const voiceAudioCurrentSnapshotSchema = z.object({
  workspace_id: z.uuid(), user_id: z.string().min(1),
  active: voiceAudioIntentSnapshotSchema.nullable(), pending: voiceAudioIntentSnapshotSchema.nullable(),
  recovery_required: z.boolean(), customer_pending: z.boolean(),
  predictive: predictiveCustomerRecoverySchema,
  // Older servers omit manual recovery. Keep their busy gate while they roll out.
  manual: manualCustomerRecoverySchema.nullable().optional().default(null),
  dialer: voiceDialerCurrentSchema.nullable().optional().default(null),
}).superRefine((value, ctx) => {
  if (value.dialer && (value.dialer.workspace_id !== value.workspace_id || value.dialer.user_id !== value.user_id ||
    value.predictive.customer && (value.predictive.customer.campaign_id !== value.dialer.campaign_id ||
      value.predictive.customer.conference_id !== value.dialer.conference_id)))
    ctx.addIssue({ code: "custom", message: "Recovered dialer does not match this current actor and room", path: ["dialer"] });
  if (!matchesCurrentPredictiveOwner(value))
    ctx.addIssue({ code: "custom", message: "Recovered customer does not match this current actor", path: ["predictive"] });
  if (!matchesCurrentManualOwner(value))
    ctx.addIssue({ code: "custom", message: "Recovered manual customer does not match this current actor", path: ["manual"] });
  for (const name of ["active", "pending"] as const) {
    const intent = value[name];
    if (!intent) continue;
    if (!matchesCurrentAudioRole(value, intent, name))
      ctx.addIssue({ code: "custom", message: "Current audio does not match its owner or role", path: [name] });
  }
  if (value.active && value.pending && (value.active.connection_intent_id === value.pending.connection_intent_id ||
    value.active.connection?.connection_id === value.pending.connection?.connection_id))
    ctx.addIssue({ code: "custom", message: "Current audio roles must have distinct owners", path: ["pending"] });
  if (!value.recovery_required && (value.active?.connection?.cancel_requested || value.pending?.connection?.cancel_requested))
    ctx.addIssue({ code: "custom", message: "Canceled audio requires recovery", path: ["recovery_required"] });
});
export type VoiceAudioCurrentSnapshot = z.infer<typeof voiceAudioCurrentSnapshotSchema>;
