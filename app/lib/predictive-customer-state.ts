import { toDialerStatus } from "@/lib/call-status";
import type { z } from "zod";
import { PredictiveCustomerBroadcast, type PredictiveBroadcastPayload, type WorkspaceEventRecord } from "@/lib/workspace-events.shared";
import type { PredictiveCustomerRecovery, RecoveredPredictiveCustomer } from "@/lib/schemas/api/voice-audio";

export type PredictiveRoomOwner = { workspace: string; userId: string; campaign: number | undefined; conference: string | null };
export type PredictiveRoomSnapshot = {
  scope: string; conference: string | null; conferenceSid: string | null; sequence: number;
  customerCallSid: string | null; customerPresent: boolean; ended: boolean; payload: PredictiveBroadcastPayload;
  humanRevision: string | null; recoveredCustomer: RecoveredPredictiveCustomer | null;
};
const IDLE: PredictiveBroadcastPayload = { contact_id: null, status: "idle" };
function scope(owner: PredictiveRoomOwner) { return JSON.stringify([owner.workspace, owner.userId, owner.campaign]); }
export function initialPredictiveRoom(owner: PredictiveRoomOwner): PredictiveRoomSnapshot {
  return { scope: scope(owner), conference: owner.conference, conferenceSid: null, sequence: -1, customerCallSid: null, customerPresent: false,
    ended: false, humanRevision: null, recoveredCustomer: null, payload: IDLE };
}
export function currentPredictiveRoom(snapshot: PredictiveRoomSnapshot, owner: PredictiveRoomOwner) {
  return snapshot.scope === scope(owner) && snapshot.conference === owner.conference ? snapshot : initialPredictiveRoom(owner);
}

const TERMINAL = new Set(["completed", "failed", "no-answer"]);
function matchesRecoveredRoom(owner: PredictiveRoomOwner, customer: RecoveredPredictiveCustomer) {
  return customer.workspace_id === owner.workspace && customer.user_id === owner.userId &&
    customer.campaign_id === owner.campaign && customer.conference_id === owner.conference;
}
function revisionOrder(current: string | null, next: string) {
  if (current === next) return 0;
  return current === null || BigInt(next) > BigInt(current) ? 1 : -1;
}
function endRecoveredCustomer(current: PredictiveRoomSnapshot, revision: string, order: number) {
  if (revision === "0" || current.payload.call_sid && !current.payload.human_revision) return current;
  if (order === 0 && !current.customerPresent && TERMINAL.has(current.payload.status)) return current;
  return { ...current, humanRevision: revision, customerPresent: false,
    payload: current.payload.call_sid ? { ...current.payload, status: "completed" } : current.payload };
}
function activeRecoveredCustomer(current: PredictiveRoomSnapshot, customer: RecoveredPredictiveCustomer, revision: string): PredictiveRoomSnapshot {
  const ended = current.payload.call_sid === customer.call_sid && TERMINAL.has(current.payload.status);
  const joined = customer.human_state === "joined";
  return { ...current, humanRevision: revision, recoveredCustomer: customer,
    conferenceSid: customer.conference_sid, sequence: customer.conference_sequence ?? -1,
    customerCallSid: joined ? customer.call_sid : null, customerPresent: joined && !ended,
    payload: { contact_id: customer.contact_id, campaign_id: customer.campaign_id, user_id: customer.user_id,
      call_sid: customer.call_sid, outreach_attempt_id: customer.outreach_attempt_id, conference_id: customer.conference_id,
      ...(customer.conference_sid ? { conference_sid: customer.conference_sid } : {}),
      ...(customer.conference_sequence !== null ? { conference_sequence: customer.conference_sequence } : {}),
      status: ended ? current.payload.status : joined ? "connected" : "dialing", human_revision: revision } };
}
export function recoverPredictiveRoom(snapshot: PredictiveRoomSnapshot, owner: PredictiveRoomOwner, recovery?: PredictiveCustomerRecovery | null): PredictiveRoomSnapshot {
  const current = currentPredictiveRoom(snapshot, owner);
  if (!recovery || !owner.conference || current.ended) return current;
  const customer = recovery.customer;
  if (customer && !matchesRecoveredRoom(owner, customer)) return current;
  const order = revisionOrder(current.humanRevision, recovery.revision);
  if (order < 0) return current;
  if (!customer) return endRecoveredCustomer(current, recovery.revision, order);
  // Equal versions can supply missing contact context, but cannot revive a completed customer.
  if (order === 0) return current.recoveredCustomer || current.payload.call_sid !== customer.call_sid
    ? current : { ...current, recoveredCustomer: customer };
  return activeRecoveredCustomer(current, customer, recovery.revision);
}

function acceptParticipation(current: PredictiveRoomSnapshot, next: z.infer<typeof PredictiveCustomerBroadcast>) {
  if (current.payload.human_revision && !next.human_revision || current.humanRevision !== null && next.human_revision &&
    BigInt(next.human_revision) <= BigInt(current.humanRevision)) return current;
  if (next.conference_sequence === undefined || next.conference_sequence <= current.sequence ||
    current.conferenceSid !== null && next.conference_sid !== current.conferenceSid) return current;
  const sequence = { conferenceSid: next.conference_sid ?? null, sequence: next.conference_sequence,
    humanRevision: next.human_revision ?? current.humanRevision };
  if (next.call_sid !== current.customerCallSid && next.customer_event === "left") return { ...current, ...sequence };
  if (next.call_sid === current.customerCallSid && TERMINAL.has(current.payload.status)) return { ...current, ...sequence };
  return { ...current, ...sequence, customerCallSid: next.call_sid, customerPresent: next.customer_event === "joined",
    recoveredCustomer: current.recoveredCustomer?.call_sid === next.call_sid ? current.recoveredCustomer : null,
    payload: { ...next, status: toDialerStatus(next.status) } };
}

export function acceptPredictiveRoomEvent(snapshot: PredictiveRoomSnapshot, owner: PredictiveRoomOwner, record: WorkspaceEventRecord) {
  if (record.workspace_id !== owner.workspace || !owner.conference || record.event_type !== "predictive_broadcast") return snapshot;
  const current = currentPredictiveRoom(snapshot, owner), payload = record.payload;
  if (payload.conference_id !== owner.conference || current.ended) return snapshot;
  if (payload.conference_ended === true && toDialerStatus(String(payload.status)) === "completed") {
    return { ...current, ended: true, customerCallSid: null, customerPresent: false, payload: {
      contact_id: null, status: "completed", conference_id: owner.conference, conference_ended: true,
    } };
  }
  const parsed = PredictiveCustomerBroadcast.safeParse(payload);
  if (!parsed.success || parsed.data.user_id !== owner.userId || parsed.data.campaign_id !== owner.campaign) return snapshot;
  const next = parsed.data;
  if (next.customer_event) return acceptParticipation(current, next);
  if (!current.customerCallSid) return { ...current, payload: { contact_id: null, status: "dialing", conference_id: owner.conference } };
  if (current.customerCallSid && current.customerCallSid !== next.call_sid) return snapshot;
  if (current.customerCallSid && !current.customerPresent) return snapshot;
  const status = toDialerStatus(next.status);
  if (!TERMINAL.has(status)) return current;
  return { ...current, customerPresent: current.customerPresent && !TERMINAL.has(status), payload: { ...next, status } };
}
