import { TERMINAL_CALL_STATUSES } from "@/lib/telephony-db.server";
import { eq } from "drizzle-orm";
import { call, outreach_attempt } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import type { PredictiveMachineOperation } from "@/server/predictive-machine-operation.server";
import { savePredictiveSuccessorCall, claimPredictiveContinuation } from "@/server/predictive-machine-continuation.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { hasTwilioCallRequestHistory, isTwilioCallHistoryReady } from "@/lib/twilio-call-history.server";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { findPredictiveVoiceReservation } from "@/server/predictive-voice-receipt.server";
import { recoverVoiceReservationCall } from "@/lib/voice-credit-recovery.server";
import { processCallStatusWebhook } from "@/lib/twilio-call-status.server";
import { terminalVoiceCallDuration } from "@/lib/voice-recovery-duration";
import { settleRecoveredVoiceCall } from "@/lib/recovered-voice-status.server";
import { requestVoiceReservationRecovery, type VoiceReservation } from "@/server/voice-credit-reservation.server";
import { machineBinding } from "@/server/predictive-machine-operation.server";

function requireRecoverableSuccessor(
  operation: PredictiveMachineOperation,
  candidateSid: string,
) {
  if (
    !/^CA[0-9a-f]{32}$/i.test(candidateSid) ||
    !operation.send_started_at ||
    !operation.successor_voice_url ||
    !operation.successor_attempt_id ||
    !operation.successor_contact_id ||
    !operation.successor_queue_id ||
    operation.successor_call_sid ||
    !["continuing", "uncertain"].includes(operation.state) ||
    (operation.state === "continuing" &&
      operation.lease_until.getTime() > Date.now())
  )
    throw new Error(
      "Predictive successor is not eligible for verified recovery",
    );
}

/** An operator supplies a candidate SID; provider history must prove its reservation. */
export async function recoverPredictiveSuccessorCall(
  operation: PredictiveMachineOperation,
  candidateSid: string,
) {
  requireRecoverableSuccessor(operation, candidateSid);

  const parent = await createTenantDb(operation.workspace).call.findFirst({
    where: eq(call.sid, operation.call_sid),
  });
  if (!parent?.account_sid)
    throw new Error(
      "Predictive successor recovery has no stored provider account",
    );
  const twilio = await createWorkspaceTwilioInstance({
    workspace_id: operation.workspace,
  });
  const candidate = await twilio.calls(candidateSid).fetch();
  if (
    candidate.sid !== candidateSid ||
    candidate.accountSid !== parent.account_sid ||
    candidate.direction !== "outbound-api"
  )
    throw new Error("Predictive successor provider identity does not match");
  if (!TERMINAL_CALL_STATUSES.has(candidate.status))
    throw new Error("Predictive successor is not terminal");
  const funded = await findPredictiveVoiceReservation(operation.workspace, operation.id);
  if (funded) return recoverFundedSuccessor(operation, candidate, funded);
  const signedEvidence =
    operation.successor_callback_sid === candidateSid &&
    operation.successor_callback_status === candidate.status;
  if (!signedEvidence)
    await requireSuccessorHistory(
      twilio,
      candidate,
      operation,
    );

  // Start the adopted row as open. The existing status-sync job owns the
  // terminal transition and billing, and commits with this saved checkpoint.
  return savePredictiveSuccessorCall(
    operation,
    {
      sid: candidate.sid,
      account_sid: candidate.accountSid,
      workspace: operation.workspace,
      campaign_id: operation.campaign_id,
      contact_id: operation.successor_contact_id,
      outreach_attempt_id: operation.successor_attempt_id,
      queue_id: operation.successor_queue_id,
      user_id: operation.user_id,
      conference_id: operation.conference_id,
      to: candidate.to,
      from: candidate.from,
      status: "queued",
      direction: candidate.direction,
      date_updated: candidate.dateUpdated,
      start_time: candidate.startTime ?? null,
    },
    { recovery: true, terminalStatus: candidate.status },
  );
}

async function recoverFundedSuccessor(operation: PredictiveMachineOperation, candidate: CallInstance, funded: VoiceReservation) {
    const attempt = await createTenantDb(funded.workspace).outreach_attempt.findFirst({ where: eq(outreach_attempt.id, funded.outreach_attempt_id ?? 0) });
    if (attempt && (attempt.campaign_id !== funded.campaign_id || attempt.contact_id !== funded.contact_id || attempt.user_id !== funded.user_id))
      throw new Error("Predictive successor outreach binding changed");
    if (candidate.accountSid !== funded.account_sid || candidate.to !== funded.recipient || candidate.from !== funded.caller_id ||
        candidate.parentCallSid || funded.provider_sid && funded.provider_sid !== candidate.sid)
      throw new Error("Predictive successor does not match its funding");
    if (!funded.provider_sid) await recoverVoiceReservationCall(funded, candidate.sid);
    const duration = terminalVoiceCallDuration(candidate.status, candidate.duration ?? null);
    const { call: saved } = await processCallStatusWebhook({ sid: candidate.sid, account_sid: candidate.accountSid,
        to: candidate.to, from: candidate.from, parent_call_sid: null, direction: "outbound-api", status: candidate.status,
        ...(duration === null ? {} : { duration: String(duration) }), date_updated: candidate.dateUpdated ?? new Date(),
    }, { workspaceId: funded.workspace, skipBilling: true });
    if (duration !== null) await settleRecoveredVoiceCall(saved);
    else await requestVoiceReservationRecovery(funded.id);
    return (await claimPredictiveContinuation(machineBinding(operation), operation.id)).operation;

}

async function requireSuccessorHistory(
  twilio: Awaited<ReturnType<typeof createWorkspaceTwilioInstance>>,
  candidate: CallInstance,
  operation: PredictiveMachineOperation,
) {
  if (!isTwilioCallHistoryReady(candidate))
    throw new Error("Predictive successor event history is not yet available");

  const matches = await hasTwilioCallRequestHistory({
    twilio, callSid: candidate.sid,
    voiceUrl: operation.successor_voice_url ?? "",
  });
  if (!matches)
    throw new Error(
      "Predictive successor history does not prove the reserved call",
    );
}
