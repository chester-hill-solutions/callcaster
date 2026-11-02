import { and, eq } from "drizzle-orm";
import { call, job, workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { terminalVoiceCallDuration } from "@/lib/voice-recovery-duration";
import { callStatusSideEffectsParams } from "@/lib/worker/job-params.server";
import { CALL_STATUS_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { normalizeProviderStatus } from "@/lib/call-status";
import { recordFundedPredictiveTerminalReceipt } from "./predictive-voice-receipt.server";
import { voiceCustomerMediaBoundary, voiceCustomerTerminalEventClock, type VoiceTerminalReceiptSource } from "./voice-customer-media-boundary.server";
import { retainVoiceRecordingBoundaryWork } from "./voice-recording-copy.server";

/** Freeze one final receipt and its outcome job before billing frees the hold. */
export async function enqueueFundedVoiceTerminalOutcome(workspaceId: string, sid: string, params: Record<string, string>, source: VoiceTerminalReceiptSource = "callback") {
  const duration = terminalVoiceCallDuration(params.CallStatus ?? null, params.CallDuration ?? null);
  if (duration === null) return null;
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId)).for("no key update");
    const [reservation] = await tx.select().from(reservations).where(and(
      eq(reservations.workspace, workspaceId), eq(reservations.provider_sid, sid),
    )).for("update");
    if (!reservation || reservation.state === "released") return null;
    const status = normalizeProviderStatus(reservation.terminal_status ?? params.CallStatus);
    if (!status) throw new Error("Funded voice receipt has no terminal status");
    const seconds = reservation.terminal_duration ?? String(duration);
    const receipt = { ...params, AccountSid: reservation.account_sid, CallSid: sid, CallStatus: status, CallDuration: seconds,
      To: reservation.recipient, From: reservation.caller_id };
    const event = parseTwilioVoiceCallback(receipt);
    await recordFundedPredictiveTerminalReceipt(tx, reservation, sid, status);
    const storedParams = callStatusSideEffectsParams.parse({ sid, twilioParams: receipt, event });
    const [saved] = await tx.update(reservations).set({ terminal_status: status, terminal_duration: seconds,
      ...voiceCustomerTerminalEventClock(reservation, params, source, status, seconds),
      human_state: reservation.human_state && reservation.human_state !== "refused" ? "ended" : reservation.human_state, updated_at: new Date() })
      .where(eq(reservations.id, reservation.id)).returning();
    if (!saved) throw new Error("Customer terminal receipt was not saved");
    if (voiceCustomerMediaBoundary(saved)) await retainVoiceRecordingBoundaryWork(tx, saved);
    await tx.update(call).set({ status, duration: seconds })
      .where(and(eq(call.workspace, workspaceId), eq(call.sid, sid)));
    await tx.insert(job).values({ type: CALL_STATUS_SIDE_EFFECTS_JOB_TYPE, workspace_id: workspaceId,
      user_id: reservation.user_id, params: storedParams, idempotency_key: `funded-voice-terminal:${sid}`, status: "queued",
    }).onConflictDoNothing();
    return event;
  });
}
