import { TERMINAL_CALL_STATUSES } from "@/lib/telephony-db.server";
import { eq } from "drizzle-orm";
import { call } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import type { PredictiveMachineOperation } from "@/server/predictive-machine-operation.server";
import { savePredictiveSuccessorCall } from "@/server/predictive-machine-continuation.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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
  const signedEvidence =
    operation.successor_callback_sid === candidateSid &&
    operation.successor_callback_status === candidate.status;
  if (!signedEvidence)
    await requireSuccessorHistory(
      twilio,
      candidateSid,
      candidate.endTime,
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

async function requireSuccessorHistory(
  twilio: Awaited<ReturnType<typeof createWorkspaceTwilioInstance>>,
  candidateSid: string,
  endedAt: Date | null,
  operation: PredictiveMachineOperation,
) {
  if (
    !endedAt ||
    !Number.isFinite(endedAt.getTime()) ||
    endedAt.getTime() + 15 * 60_000 + 30_000 > Date.now()
  )
    throw new Error("Predictive successor event history is not yet available");

  const events = await twilio.calls(candidateSid).events.list({ limit: 1000 });
  const matches = events.some((event) => {
    const request = record(event.request);
    const parameters = record(request?.parameters);
    return (
      request?.method === "POST" &&
      request.url === operation.successor_voice_url &&
      parameters?.call_sid === candidateSid
    );
  });
  if (!matches)
    throw new Error(
      "Predictive successor history does not prove the reserved call",
    );
}
