import { TERMINAL_CALL_STATUSES } from "@/lib/telephony-db.server";
import { recoverPredictiveSuccessorCall } from "@/lib/predictive-successor-recovery.server";
import {
  claimPredictiveContinuation,
  finishPredictiveContinuation,
  recordPredictiveSuccessorAttempt,
  retryPredictiveContinuation,
  savePredictiveSuccessorCall,
} from "@/server/predictive-machine-continuation.server";
import { eq } from "drizzle-orm";
import { call, campaign, predictive_machine_operation } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import {
  acknowledgePredictivePlayback,
  getPredictiveMachineOperation,
  issuePredictivePlayback,
  machineBinding,
  preparePredictiveMachineOperation,
  retainPredictivePreparationFailure,
  retainPredictiveUncertainty,
  type MachineBinding,
  type PredictiveMachineOperation,
} from "@/server/predictive-machine-operation.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { env } from "@/lib/env.server";
import { runAutoDialerTurn } from "@/lib/auto-dial.server";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE } from "@/lib/worker/job-types.server";

const headers = { "Content-Type": "text/xml" };

function operationUrl(
  binding: MachineBinding,
  phase: "complete" | "wait",
  id: string,
) {
  const url = new URL(
    `/api/auto-dial/${encodeURIComponent(binding.conferenceId)}`,
    env.BASE_URL(),
  );
  url.searchParams.set("machine", phase);
  url.searchParams.set("operation", id);
  return url.href;
}
async function waitResponse(operation: PredictiveMachineOperation) {
  // A retry cannot replay issued instructions. Stop a lost-response poll
  // after 30 seconds rather than hold a billable call open indefinitely.
  if (
    operation.issued_at &&
    Date.now() - operation.issued_at.getTime() >= 30_000
  ) {
    await retainPredictiveUncertainty(
      operation,
      "Issued audio response was not acknowledged before the retry wait ended",
    );
    return new Response(hangupTwiml(), { headers });
  }
  const twiml = createVoiceResponse();
  twiml.pause({ length: 1 });
  twiml.redirect(
    { method: "POST" },
    operationUrl(machineBinding(operation), "wait", operation.id),
  );
  return new Response(twiml.toString(), { headers });
}
function stopped(operation: PredictiveMachineOperation) {
  return [
    "dropped",
    "acknowledged",
    "continuing",
    "continued",
    "uncertain",
  ].includes(operation.state);
}

/** Only the reserved initial response can contain Play. A retry polls its journal. */
export async function predictiveMachineResponse(
  binding: MachineBinding,
  phase?: string | null,
  id?: string | null,
) {
  if (phase && !["wait", "complete"].includes(phase))
    return new Response(hangupTwiml(), { status: 400, headers });
  if (phase) {
    if (
      !id ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)
    )
      return new Response(hangupTwiml(), { status: 400, headers });
    const existing = await getPredictiveMachineOperation(binding, id);
    if (!existing) return new Response(hangupTwiml(), { status: 404, headers });
    if (phase === "complete") {
      if (existing.state === "prepared" || existing.state === "dropped")
        return new Response(hangupTwiml(), { status: 409, headers });
      await acknowledgePredictivePlayback(binding, id);
      return new Response(hangupTwiml(), { headers });
    }
    if (stopped(existing)) return new Response(hangupTwiml(), { headers });
    if (existing.state === "issued") return waitResponse(existing);
  }
  const { operation, owned } = await preparePredictiveMachineOperation(
    binding,
    (operationId) => operationUrl(binding, "complete", operationId),
  );
  if (stopped(operation)) return new Response(hangupTwiml(), { headers });
  if (!owned) return waitResponse(operation);
  try {
    if (!operation.audio_file) throw new Error("Predictive audio is absent");
    const audio = await createSignedObjectUrl(
      "workspaceAudio",
      `${operation.workspace}/${operation.audio_file}`,
      3600,
    );
    const twiml = createVoiceResponse();
    twiml.pause({ length: 5 });
    twiml.play(audio);
    twiml.redirect({ method: "POST" }, operation.ack_url);
    if (!(await issuePredictivePlayback(operation)))
      return waitResponse(operation);
    return new Response(twiml.toString(), { headers });
  } catch (error) {
    await retainPredictivePreparationFailure(operation);
    throw error;
  }
}
async function loadOperation(workspaceId: string, id: string) {
  return createTenantDb(workspaceId).predictive_machine_operation.findFirst({
    where: eq(predictive_machine_operation.id, id),
  });
}
async function settleSuccessor(operation: PredictiveMachineOperation) {
  if (operation.successor_call_sid && operation.successor_contact_id) {
    await dequeueQueueEntry({
      by: {
        contactId: operation.successor_contact_id,
        campaignId: operation.campaign_id,
      },
      workspaceId: operation.workspace,
      household: true,
      userId: operation.user_id,
      reason: "Predictive Dialer called contact",
    });
  }
  await finishPredictiveContinuation(operation);
}

async function deferUnsentContinuation(
  stored: PredictiveMachineOperation,
  params: { workspaceId: string; operationId: string },
  jobId?: number,
) {
  if (stored.send_started_at || stored.state === "continued") return null;
  const currentCampaign = await createTenantDb(
    stored.workspace,
  ).campaign.findFirst({
    where: eq(campaign.id, stored.campaign_id),
  });
  if (
    currentCampaign?.status === "paused" ||
    currentCampaign?.status === "waiting"
  ) {
    await enqueueRegisteredJob({
      type: PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE,
      params,
      workspaceId: stored.workspace,
      userId: stored.user_id,
      runAt: new Date(Date.now() + 60_000),
      dedupe: {
        kind: "idempotency",
        key: `predictive-campaign-wait:${stored.id}:after:${jobId ?? stored.lease_token}`,
      },
    });
    return { pending: true };
  }
  if (currentCampaign?.status !== "running") {
    const stopped = await claimPredictiveContinuation(
      machineBinding(stored),
      stored.id,
    );
    if (stopped.owned) await finishPredictiveContinuation(stopped.operation);
    return { completed: true, stopped: true };
  }
  return null;
}

/** Queue claims and provider writes are fenced by the operation's durable lease. */
export async function runPredictiveMachineContinuation(
  params: {
    workspaceId: string;
    operationId: string;
  },
  jobId?: number,
) {
  const stored = await loadOperation(params.workspaceId, params.operationId);
  if (!stored) throw new Error("Predictive machine operation not found");
  const deferred = await deferUnsentContinuation(stored, params, jobId);
  if (deferred) return deferred;
  const claim = await claimPredictiveContinuation(
    machineBinding(stored),
    stored.id,
  );
  if (!claim.owned) return { completed: true, replay: true };
  let operation = claim.operation;
  if (claim.recover) {
    await settleSuccessor(operation);
    return { completed: true, recovered: true };
  }
  try {
    const result = await runAutoDialerTurn({
      user_id: operation.user_id,
      campaign_id: operation.campaign_id,
      workspace_id: operation.workspace,
      conference_id: operation.conference_id,
      continuation: {
        beforeDial: async (contact, attemptId) => {
          operation = await recordPredictiveSuccessorAttempt(operation, {
            queueId: contact.queue_id,
            contactId: contact.contact_id,
            attemptId,
          });
          if (!operation.successor_voice_url || !operation.successor_status_url)
            throw new Error("Predictive successor URL was not saved");
          return {
            voiceUrl: operation.successor_voice_url,
            statusUrl: operation.successor_status_url,
          };
        },
        afterDial: async (callData) => {
          operation = await savePredictiveSuccessorCall(operation, callData);
        },
      },
    });
    if (!result.success) {
      if (
        result.failureKind === "not-sent" ||
        result.failureKind === "rejected"
      ) {
        await retryPredictiveContinuation(operation);
        throw new Error(
          "Predictive successor was not created; continuation will retry",
        );
      }
      await retainPredictiveUncertainty(
        operation,
        "Successor call acknowledgement is uncertain; reconcile before redial",
      );
      throw new Error(
        "Predictive successor acknowledgement is uncertain; reconcile before redial",
      );
    }
    await finishPredictiveContinuation(operation);
    return { completed: true };
  } catch (error) {
    // A database exception can occur after a provider send. Preserve the
    // durable checkpoint; a later worker can finish a saved successor only.
    const current = await loadOperation(operation.workspace, operation.id);
    if (current?.state === "continuing" && current.send_started_at)
      await retainPredictiveUncertainty(
        current,
        "Continuation stopped after send reservation; reconcile before redial",
      );
    throw error;
  }
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function provesPostPlayRequest(
  event: { request: unknown },
  operation: PredictiveMachineOperation,
) {
  const request = object(event.request);
  const params = object(request?.parameters);
  return (
    request?.method === "POST" &&
    request.url === operation.ack_url &&
    params?.call_sid === operation.call_sid
  );
}

/** Never issue audio from the worker. Recover evidence or retain a visible failure. */
export async function reconcilePredictiveMachineOperation(
  params: {
    workspaceId: string;
    operationId: string;
    successorCallSid?: string;
  },
  jobId: number,
) {
  const operation = await loadOperation(params.workspaceId, params.operationId);
  if (!operation) throw new Error("Predictive machine operation not found");
  if (params.successorCallSid) {
    if (operation.successor_call_sid) {
      if (operation.successor_call_sid !== params.successorCallSid)
        throw new Error(
          "Predictive recovery SID does not match the saved successor",
        );
    } else {
      const recovered = await recoverPredictiveSuccessorCall(
        operation,
        params.successorCallSid,
      );
      await settleSuccessor(recovered);
      return { completed: true, recovered: true };
    }
  }
  if (operation.state === "continued") return { completed: true };
  if (
    ["acknowledged", "dropped", "continuing"].includes(operation.state) ||
    operation.successor_call_sid
  ) {
    return runPredictiveMachineContinuation(params, jobId);
  }
  if (operation.send_started_at)
    throw new Error(
      "Predictive successor acknowledgement is uncertain; reconcile before redial",
    );
  const twilio = await createWorkspaceTwilioInstance({
    workspace_id: operation.workspace,
  });
  const providerCall = await twilio.calls(operation.call_sid).fetch();
  const storedCall = await createTenantDb(operation.workspace).call.findFirst({
    where: eq(call.sid, operation.call_sid),
  });
  if (
    !storedCall?.account_sid ||
    providerCall.sid !== operation.call_sid ||
    providerCall.accountSid !== storedCall.account_sid
  ) {
    await retainPredictiveUncertainty(
      operation,
      "Provider recovery identity does not match the stored call and account",
    );
    throw new Error("Predictive provider recovery identity does not match");
  }
  const reschedule = async (runAt = new Date(Date.now() + 60_000)) => {
    await enqueueRegisteredJob({
      type: PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE,
      params,
      workspaceId: operation.workspace,
      userId: operation.user_id,
      runAt,
      dedupe: {
        kind: "idempotency",
        key: `${PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE}:${operation.id}:after:${jobId}`,
      },
    });
    return { pending: true };
  };
  if (!TERMINAL_CALL_STATUSES.has(providerCall.status)) return reschedule();
  if (operation.issued_at) {
    // Twilio makes history available 15 minutes after the call ends. A
    // terminal status alone never establishes that Play was reached.
    if (
      !providerCall.endTime ||
      !Number.isFinite(providerCall.endTime.getTime())
    ) {
      await retainPredictiveUncertainty(
        operation,
        "Call ended without an acknowledgement or usable event timestamp",
      );
      throw new Error(
        "Predictive playback is uncertain; inspect the call before recovery",
      );
    }
    const availableAt = new Date(
      providerCall.endTime.getTime() + 15 * 60_000 + 30_000,
    );
    if (availableAt.getTime() > Date.now()) return reschedule(availableAt);
    const events = await twilio
      .calls(operation.call_sid)
      .events.list({ limit: 1000 });
    if (events.some((event) => provesPostPlayRequest(event, operation))) {
      await acknowledgePredictivePlayback(
        machineBinding(operation),
        operation.id,
      );
      return runPredictiveMachineContinuation(params, jobId);
    }
  }
  await retainPredictiveUncertainty(
    operation,
    "No post-Play acknowledgement is recorded; do not replay audio",
  );
  throw new Error(
    "Predictive playback is uncertain; inspect the call before recovery",
  );
}
