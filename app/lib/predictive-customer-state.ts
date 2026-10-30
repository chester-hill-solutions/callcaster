import { toDialerStatus } from "@/lib/call-status";
import type { z } from "zod";
import { PredictiveCustomerBroadcast, type PredictiveBroadcastPayload, type WorkspaceEventRecord } from "@/lib/workspace-events.shared";

export type PredictiveRoomOwner = { workspace: string; userId: string; campaign: number | undefined; conference: string | null };
export type PredictiveRoomSnapshot = {
  scope: string; conference: string | null; conferenceSid: string | null; sequence: number;
  customerCallSid: string | null; customerPresent: boolean; ended: boolean; payload: PredictiveBroadcastPayload;
};
const IDLE: PredictiveBroadcastPayload = { contact_id: null, status: "idle" };
function scope(owner: PredictiveRoomOwner) { return JSON.stringify([owner.workspace, owner.userId, owner.campaign]); }
export function initialPredictiveRoom(owner: PredictiveRoomOwner): PredictiveRoomSnapshot {
  return { scope: scope(owner), conference: owner.conference, conferenceSid: null, sequence: -1, customerCallSid: null, customerPresent: false, ended: false, payload: IDLE };
}
export function currentPredictiveRoom(snapshot: PredictiveRoomSnapshot, owner: PredictiveRoomOwner) {
  return snapshot.scope === scope(owner) && snapshot.conference === owner.conference ? snapshot : initialPredictiveRoom(owner);
}

const TERMINAL = new Set(["completed", "failed", "no-answer"]);
function acceptParticipation(current: PredictiveRoomSnapshot, next: z.infer<typeof PredictiveCustomerBroadcast>) {
  if (next.conference_sequence === undefined || next.conference_sequence <= current.sequence ||
    current.conferenceSid !== null && next.conference_sid !== current.conferenceSid) return current;
  const sequence = { conferenceSid: next.conference_sid ?? null, sequence: next.conference_sequence };
  if (next.call_sid !== current.customerCallSid && next.customer_event === "left") return { ...current, ...sequence };
  if (next.call_sid === current.customerCallSid && TERMINAL.has(current.payload.status)) return { ...current, ...sequence };
  return { ...current, ...sequence, customerCallSid: next.call_sid, customerPresent: next.customer_event === "joined",
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
