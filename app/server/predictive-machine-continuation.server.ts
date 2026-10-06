import { needsPredictiveTerminalContinuation } from "@/lib/predictive-terminal-status";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  call as callTable,
  campaign as campaignTable,
  campaign_queue,
  job,
  outreach_attempt,
  predictive_machine_operation as operationTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { randomUUID } from "node:crypto";
import { saveCallToDatabase } from "@/lib/auto-dial.server";
import { twilioOpenSyncParams } from "@/lib/worker/job-params.server";
import type { Call } from "@/lib/types";
import {
  lockPredictiveMachineOperation,
  predictiveMachineIdentity,
  machineBinding,
  getPredictiveMachineOperation,
  queueRecoveredPredictiveContinuation,
  type MachineBinding,
  type PredictiveMachineOperation,
} from "./predictive-machine-operation.server";

const CONTINUATION_LEASE_MS = 120_000;

export async function claimPredictiveContinuation(
  binding: MachineBinding,
  id: string,
) {
  return db.transaction(async (tx) => {
    const operation = await lockPredictiveMachineOperation(tx, binding, id);
    if (operation.state === "continued")
      return { operation, owned: false, recover: false };
    if (
      operation.state === "continuing" &&
      operation.lease_until.getTime() > Date.now()
    )
      throw new Error("Predictive continuation is still running");
    if (operation.state === "uncertain" || operation.state === "continuing") {
      if (operation.successor_call_sid) {
        const [renewed] = await createTenantDb(
          binding.workspaceId,
          tx,
        ).predictive_machine_operation.update({
          set: {
            state: "continuing",
            lease_token: randomUUID(),
            lease_until: new Date(Date.now() + CONTINUATION_LEASE_MS),
            updated_at: new Date(),
          },
          where: eq(operationTable.id, id),
        });
        if (!renewed)
          throw new Error("Predictive recovery claim was not saved");
        return { operation: renewed, owned: true, recover: true };
      }
      if (operation.send_started_at)
        throw new Error(
          "Predictive successor acknowledgement is uncertain; reconcile before redial",
        );
    } else if (
      operation.state !== "acknowledged" &&
      operation.state !== "dropped"
    ) {
      throw new Error("Predictive playback has not been acknowledged");
    }
    const [claimed] = await createTenantDb(
      binding.workspaceId,
      tx,
    ).predictive_machine_operation.update({
      set: {
        state: "continuing",
        lease_token: randomUUID(),
        lease_until: new Date(Date.now() + CONTINUATION_LEASE_MS),
        last_error: null,
        updated_at: new Date(),
      },
      where: eq(operationTable.id, id),
    });
    if (!claimed)
      throw new Error("Predictive continuation claim was not saved");
    return { operation: claimed, owned: true, recover: false };
  });
}
function continuationOwner(operation: PredictiveMachineOperation) {
  return and(
    predictiveMachineIdentity(machineBinding(operation), operation.id),
    eq(operationTable.lease_token, operation.lease_token),
    eq(operationTable.state, "continuing"),
    gt(operationTable.lease_until, new Date()),
  );
}
export async function recordPredictiveSuccessorAttempt(
  operation: PredictiveMachineOperation,
  successor: { queueId: number; attemptId: number; contactId: number },
) {
  return db.transaction(async (tx) => {
    await lockPredictiveMachineOperation(
      tx,
      machineBinding(operation),
      operation.id,
    );
    const [campaign] = await tx
      .select()
      .from(campaignTable)
      .where(
        and(
          eq(campaignTable.workspace, operation.workspace),
          eq(campaignTable.id, operation.campaign_id),
        ),
      )
      .for("update");
    if (campaign?.status !== "running")
      throw new Error("Predictive campaign is not running");
    const [queue] = await tx
      .select()
      .from(campaign_queue)
      .where(
        and(
          eq(campaign_queue.workspace, operation.workspace),
          eq(campaign_queue.id, successor.queueId),
        ),
      )
      .for("update");
    const [attempt] = await tx
      .select()
      .from(outreach_attempt)
      .where(
        and(
          eq(outreach_attempt.workspace, operation.workspace),
          eq(outreach_attempt.id, successor.attemptId),
        ),
      )
      .for("update");
    if (
      !queue ||
      !attempt ||
      queue.queue_state !== "assigned" ||
      queue.dequeued_at ||
      queue.assigned_to_user_id !== operation.user_id ||
      queue.campaign_id !== operation.campaign_id ||
      queue.contact_id !== successor.contactId ||
      attempt.campaign_id !== operation.campaign_id ||
      attempt.contact_id !== successor.contactId ||
      attempt.user_id !== operation.user_id ||
      attempt.id === operation.outreach_attempt_id
    )
      throw new Error("Predictive successor claim binding does not match");
    const voiceUrl = new URL(
      `/api/auto-dial/${encodeURIComponent(operation.conference_id)}`,
      operation.ack_url,
    );
    voiceUrl.searchParams.set("continuation", operation.id);
    voiceUrl.searchParams.set("attempt", String(successor.attemptId));
    voiceUrl.searchParams.set("workspace", operation.workspace);
    const statusUrl = new URL(voiceUrl);
    statusUrl.pathname = "/api/auto-dial/status";
    const [saved] = await createTenantDb(
      operation.workspace,
      tx,
    ).predictive_machine_operation.update({
      set: {
        successor_queue_id: successor.queueId,
        successor_attempt_id: successor.attemptId,
        successor_contact_id: successor.contactId,
        send_started_at: new Date(),
        successor_voice_url: voiceUrl.href,
        successor_status_url: statusUrl.href,
        updated_at: new Date(),
      },
      where: and(
        continuationOwner(operation),
        isNull(operationTable.send_started_at),
      ),
    });
    if (!saved)
      throw new Error("Predictive continuation no longer owns the send");
    return saved;
  });
}
function requireSuccessorBinding(
  current: PredictiveMachineOperation,
  operation: PredictiveMachineOperation,
  callData: Partial<Call>,
) {
  if (
    current.lease_token !== operation.lease_token ||
    !["continuing", "uncertain"].includes(current.state) ||
    !current.send_started_at ||
    callData.workspace !== current.workspace ||
    callData.outreach_attempt_id !== current.successor_attempt_id ||
    callData.contact_id !== current.successor_contact_id ||
    callData.campaign_id !== current.campaign_id ||
    callData.conference_id !== current.conference_id ||
    !callData.sid ||
    (current.successor_callback_sid !== null &&
      current.successor_callback_sid !== callData.sid) ||
    (current.successor_call_sid !== null &&
      current.successor_call_sid !== callData.sid)
  )
    throw new Error("Predictive successor binding does not match");
}

async function verifyRecoveryBinding(
  tdb: TenantDb,
  current: PredictiveMachineOperation,
  callData: Partial<Call>,
) {
  if (
    current.successor_call_sid ||
    (current.state === "continuing" &&
      current.lease_until.getTime() > Date.now())
  )
    throw new Error(
      "Predictive successor recovery cannot replace an active owner",
    );
  const parent = await tdb.call.findFirst({
    where: eq(callTable.sid, current.call_sid),
  });
  const attempt = await tdb.outreach_attempt.findFirst({
    where: eq(outreach_attempt.id, current.successor_attempt_id ?? 0),
  });
  const queue = await tdb.campaign_queue.findFirst({
    where: eq(campaign_queue.id, current.successor_queue_id ?? 0),
  });
  if (
    !parent?.account_sid ||
    callData.account_sid !== parent.account_sid ||
    !attempt ||
    !queue ||
    attempt.campaign_id !== current.campaign_id ||
    attempt.contact_id !== current.successor_contact_id ||
    attempt.user_id !== current.user_id ||
    queue.campaign_id !== current.campaign_id ||
    queue.contact_id !== current.successor_contact_id ||
    (queue.queue_state === "assigned" &&
      queue.assigned_to_user_id !== current.user_id)
  )
    throw new Error("Predictive successor recovery binding does not match");
}

export async function savePredictiveSuccessorCall(
  operation: PredictiveMachineOperation,
  callData: Partial<Call>,
  options?: { recovery: true; terminalStatus: string },
) {
  return db.transaction(async (tx) => {
    const current = await lockPredictiveMachineOperation(
      tx,
      machineBinding(operation),
      operation.id,
    );
    requireSuccessorBinding(current, operation, callData);
    const tdb = createTenantDb(operation.workspace, tx);
    if (options?.recovery) await verifyRecoveryBinding(tdb, current, callData);
    if (!(await saveCallToDatabase(operation.workspace, callData, { tdb })))
      throw new Error("Predictive successor call was not saved");
    const [saved] = await tdb.predictive_machine_operation.update({
      set: {
        state: "continuing",
        successor_call_sid: callData.sid,
        last_error: null,
        lease_until: new Date(Date.now() + CONTINUATION_LEASE_MS),
        updated_at: new Date(),
      },
      where: eq(operationTable.id, current.id),
    });
    const terminalStatus =
      options?.terminalStatus ?? current.successor_callback_status;
    if (terminalStatus) {
      if (needsPredictiveTerminalContinuation(terminalStatus) && callData.sid) {
        await queueRecoveredPredictiveContinuation(tx, current, callData.sid);
      }
      await tx.insert(job).values({
        type: "twilio_open_sync",
        params: twilioOpenSyncParams.parse({}),
        workspace_id: current.workspace,
        user_id: current.user_id,
        idempotency_key: `predictive-successor-status:${current.id}:${callData.sid}`,
        status: "queued",
      });
    }
    if (!saved)
      throw new Error("Predictive successor checkpoint was not saved");
    return saved;
  });
}
export async function finishPredictiveContinuation(
  operation: PredictiveMachineOperation,
) {
  const [finished] = await createTenantDb(
    operation.workspace,
  ).predictive_machine_operation.update({
    set: { state: "continued", last_error: null, updated_at: new Date() },
    where: and(
      predictiveMachineIdentity(machineBinding(operation), operation.id),
      eq(operationTable.lease_token, operation.lease_token),
      eq(operationTable.state, "continuing"),
    ),
  });
  if (!finished) {
    const current = await getPredictiveMachineOperation(
      machineBinding(operation),
      operation.id,
    );
    if (current?.state !== "continued")
      throw new Error("Predictive continuation completion was not saved");
  }
}
export async function retryPredictiveContinuation(
  operation: PredictiveMachineOperation,
) {
  await createTenantDb(operation.workspace).predictive_machine_operation.update(
    {
      set: {
        state: operation.audio_file ? "acknowledged" : "dropped",
        send_started_at: null,
        successor_voice_url: null,
        successor_status_url: null,
        successor_callback_sid: null,
        successor_callback_status: null,
        successor_attempt_id: null,
        successor_queue_id: null,
        successor_contact_id: null,
        successor_call_sid: null,
        lease_until: new Date(),
        last_error: "Successor call was not created; safe to retry",
        updated_at: new Date(),
      },
      where: and(
        predictiveMachineIdentity(machineBinding(operation), operation.id),
        eq(operationTable.lease_token, operation.lease_token),
        eq(operationTable.state, "continuing"),
      ),
    },
  );
}
