import { randomUUID } from "node:crypto";
import { and, eq, gt, lte, or } from "drizzle-orm";
import {
  call,
  campaign as campaignTable,
  job,
  outreach_attempt,
  predictive_machine_operation as operationTable,
} from "@/db/schema";
import { db, type Database } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import {
  claimTerminalOutreachDisposition,
  TERMINAL_CALL_STATUSES,
} from "@/lib/telephony-db.server";
import { TERMINAL_OUTREACH_DISPOSITIONS_LIST } from "@/lib/outreach-disposition";
import {
  predictiveMachineParams,
  type JobParamsMap,
} from "@/lib/worker/job-params.server";
import {
  PREDICTIVE_MACHINE_CONTINUE_JOB_TYPE,
  PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE,
} from "@/lib/worker/job-types.server";

export type PredictiveMachineOperation = typeof operationTable.$inferSelect;
export type MachineBinding = {
  workspaceId: string;
  callSid: string;
  conferenceId: string;
};
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const PREPARATION_LEASE_MS = 10_000;

export function predictiveMachineIdentity(
  binding: MachineBinding,
  id?: string,
) {
  return and(
    eq(operationTable.workspace, binding.workspaceId),
    eq(operationTable.call_sid, binding.callSid),
    eq(operationTable.conference_id, binding.conferenceId),
    id ? eq(operationTable.id, id) : undefined,
  );
}
export function machineBinding(
  operation: PredictiveMachineOperation,
): MachineBinding {
  return {
    workspaceId: operation.workspace,
    callSid: operation.call_sid,
    conferenceId: operation.conference_id,
  };
}
export async function getPredictiveMachineOperation(
  binding: MachineBinding,
  id?: string,
) {
  return createTenantDb(
    binding.workspaceId,
  ).predictive_machine_operation.findFirst({
    where: predictiveMachineIdentity(binding, id),
  });
}
export async function lockPredictiveMachineOperation(
  tx: Tx,
  binding: MachineBinding,
  id: string,
) {
  const [operation] = await tx
    .select()
    .from(operationTable)
    .where(predictiveMachineIdentity(binding, id))
    .for("update");
  if (!operation) throw new Error("Predictive machine operation not found");
  return operation;
}
async function outbox(
  tx: Tx,
  type:
    | typeof PREDICTIVE_MACHINE_CONTINUE_JOB_TYPE
    | typeof PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE,
  operation: PredictiveMachineOperation,
  runAt?: Date,
) {
  const params = predictiveMachineParams.parse({
    workspaceId: operation.workspace,
    operationId: operation.id,
  }) satisfies JobParamsMap[typeof type];
  await tx.insert(job).values({
    type,
    params,
    workspace_id: operation.workspace,
    user_id: operation.user_id,
    idempotency_key: `${type}:${operation.id}`,
    status: "queued",
    retry_at: runAt?.toISOString() ?? null,
  });
}
async function disposition(
  tx: Tx,
  operation: PredictiveMachineOperation,
  value: "voicemail" | "no-answer",
) {
  const result = await claimTerminalOutreachDisposition(
    operation.workspace,
    operation.outreach_attempt_id,
    value,
    { tdb: createTenantDb(operation.workspace, tx) },
  );
  if (result instanceof Response)
    throw new Error("Predictive disposition could not be saved");
  // Keep a newer operator outcome. It must never authorize another playback.
  return result;
}

async function renewPreparedOperation(
  tdb: TenantDb,
  existing: PredictiveMachineOperation,
  binding: MachineBinding,
  storedCall: typeof call.$inferSelect,
  attempt: typeof outreach_attempt.$inferSelect,
) {
  if (
    existing.call_sid !== binding.callSid ||
    existing.conference_id !== binding.conferenceId
  )
    throw new Error("Predictive operation binding does not match");
  if (
    existing.state === "prepared" &&
    (TERMINAL_CALL_STATUSES.has(storedCall.status ?? "") ||
      TERMINAL_OUTREACH_DISPOSITIONS_LIST.some(
        (value) => value === attempt.disposition?.toLowerCase(),
      ))
  )
    throw new Error("Predictive call already has a terminal outcome");
  if (
    existing.state === "prepared" &&
    existing.lease_until.getTime() <= Date.now()
  ) {
    const [renewed] = await tdb.predictive_machine_operation.update({
      set: {
        lease_token: randomUUID(),
        lease_until: new Date(Date.now() + PREPARATION_LEASE_MS),
        updated_at: new Date(),
      },
      where: and(
        eq(operationTable.id, existing.id),
        eq(operationTable.state, "prepared"),
        eq(operationTable.lease_token, existing.lease_token),
        lte(operationTable.lease_until, new Date()),
      ),
    });
    if (renewed) return { operation: renewed, owned: true };
  }
  return { operation: existing, owned: false };
}

/** Reserve one response, using the stored call and attempt as the authority. */
export async function preparePredictiveMachineOperation(
  binding: MachineBinding,
  ackUrl: (id: string) => string,
) {
  return db.transaction(async (tx) => {
    const tdb = createTenantDb(binding.workspaceId, tx);
    const storedCall = await tdb.call.findFirst({
      where: eq(call.sid, binding.callSid),
    });
    if (
      !storedCall?.outreach_attempt_id ||
      !storedCall.campaign_id ||
      storedCall.conference_id !== binding.conferenceId
    )
      throw new Error("Predictive call binding does not match");
    const [attempt] = await tx
      .select()
      .from(outreach_attempt)
      .where(
        and(
          eq(outreach_attempt.workspace, binding.workspaceId),
          eq(outreach_attempt.id, storedCall.outreach_attempt_id),
        ),
      )
      .for("update");
    if (
      !attempt?.user_id ||
      attempt.campaign_id !== storedCall.campaign_id ||
      attempt.contact_id !== storedCall.contact_id
    )
      throw new Error("Predictive attempt binding does not match");
    const existing = await tdb.predictive_machine_operation.findFirst({
      where: eq(operationTable.outreach_attempt_id, attempt.id),
    });
    if (existing)
      return renewPreparedOperation(
        tdb,
        existing,
        binding,
        storedCall,
        attempt,
      );
    if (
      TERMINAL_CALL_STATUSES.has(storedCall.status ?? "") ||
      TERMINAL_OUTREACH_DISPOSITIONS_LIST.some(
        (value) => value === attempt.disposition?.toLowerCase(),
      )
    )
      throw new Error("Predictive call already has a terminal outcome");
    const campaign = await tdb.campaign.findFirst({
      where: eq(campaignTable.id, attempt.campaign_id),
    });
    if (!campaign || campaign.type !== "live_call")
      throw new Error("Predictive campaign not found");
    const audio = campaign.voicemail_drop_enabled
      ? campaign.voicemail_file
      : null;
    const id = randomUUID();
    const [operation] = await tdb.predictive_machine_operation.insert({
      id,
      call_sid: binding.callSid,
      outreach_attempt_id: attempt.id,
      campaign_id: attempt.campaign_id,
      conference_id: binding.conferenceId,
      user_id: attempt.user_id,
      audio_file: audio || null,
      ack_url: ackUrl(id),
      state: audio ? "prepared" : "dropped",
      lease_token: randomUUID(),
      lease_until: new Date(Date.now() + PREPARATION_LEASE_MS),
    });
    if (!operation) throw new Error("Predictive operation was not saved");
    await outbox(
      tx,
      PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE,
      operation,
      new Date(Date.now() + 60_000),
    );
    if (!audio) {
      await disposition(tx, operation, "no-answer");
      await outbox(tx, PREDICTIVE_MACHINE_CONTINUE_JOB_TYPE, operation);
    }
    return { operation, owned: true };
  });
}

export async function queueRecoveredPredictiveContinuation(
  tx: Tx,
  parent: PredictiveMachineOperation,
  successorCallSid: string,
) {
  if (!parent.successor_attempt_id)
    throw new Error("Recovered successor attempt missing");
  const tdb = createTenantDb(parent.workspace, tx);
  const existing = await tdb.predictive_machine_operation.findFirst({
    where: eq(operationTable.call_sid, successorCallSid),
  });
  if (existing) return;
  const id = randomUUID();
  const ackUrl = new URL(parent.ack_url);
  ackUrl.searchParams.set("operation", id);
  const [operation] = await tdb.predictive_machine_operation.insert({
    id,
    call_sid: successorCallSid,
    outreach_attempt_id: parent.successor_attempt_id,
    campaign_id: parent.campaign_id,
    conference_id: parent.conference_id,
    user_id: parent.user_id,
    audio_file: null,
    ack_url: ackUrl.href,
    state: "dropped",
    lease_token: randomUUID(),
    lease_until: new Date(Date.now() + PREPARATION_LEASE_MS),
  });
  if (!operation)
    throw new Error("Recovered terminal continuation was not saved");
  await outbox(tx, PREDICTIVE_MACHINE_CONTINUE_JOB_TYPE, operation);
}

/** Commit issuance before returning XML. An expired owner cannot emit audio. */
export async function issuePredictivePlayback(
  operation: PredictiveMachineOperation,
) {
  return db.transaction(async (tx) => {
    const [storedCall] = await tx
      .select()
      .from(call)
      .where(
        and(
          eq(call.workspace, operation.workspace),
          eq(call.sid, operation.call_sid),
        ),
      )
      .for("update");
    const [attempt] = await tx
      .select()
      .from(outreach_attempt)
      .where(
        and(
          eq(outreach_attempt.workspace, operation.workspace),
          eq(outreach_attempt.id, operation.outreach_attempt_id),
        ),
      )
      .for("update");
    if (
      !storedCall ||
      !attempt ||
      storedCall.outreach_attempt_id !== attempt.id ||
      TERMINAL_CALL_STATUSES.has(storedCall.status ?? "") ||
      TERMINAL_OUTREACH_DISPOSITIONS_LIST.some(
        (value) => value === attempt.disposition?.toLowerCase(),
      )
    )
      return undefined;
    const [issued] = await createTenantDb(
      operation.workspace,
      tx,
    ).predictive_machine_operation.update({
      set: { state: "issued", issued_at: new Date(), updated_at: new Date() },
      where: and(
        predictiveMachineIdentity(machineBinding(operation), operation.id),
        eq(operationTable.state, "prepared"),
        eq(operationTable.lease_token, operation.lease_token),
        gt(operationTable.lease_until, new Date()),
      ),
    });
    return issued;
  });
}

export async function retainPredictivePreparationFailure(
  operation: PredictiveMachineOperation,
) {
  await createTenantDb(operation.workspace).predictive_machine_operation.update(
    {
      set: {
        last_error: "Audio response could not be prepared",
        lease_until: new Date(),
        updated_at: new Date(),
      },
      where: and(
        predictiveMachineIdentity(machineBinding(operation), operation.id),
        eq(operationTable.state, "prepared"),
        eq(operationTable.lease_token, operation.lease_token),
      ),
    },
  );
}

/** Signed post-Play acknowledgement and continuation share one commit. */
export async function acknowledgePredictivePlayback(
  binding: MachineBinding,
  id: string,
) {
  return db.transaction(async (tx) => {
    const operation = await lockPredictiveMachineOperation(tx, binding, id);
    if (
      operation.state !== "issued" &&
      !(
        operation.state === "uncertain" &&
        operation.issued_at &&
        !operation.send_started_at
      )
    )
      return operation;
    const tdb = createTenantDb(binding.workspaceId, tx);
    await disposition(tx, operation, "voicemail");
    const [acknowledged] = await tdb.predictive_machine_operation.update({
      set: {
        state: "acknowledged",
        acknowledged_at: new Date(),
        last_error: null,
        updated_at: new Date(),
      },
      where: eq(operationTable.id, id),
    });
    if (!acknowledged)
      throw new Error("Predictive acknowledgement was not saved");
    await outbox(tx, PREDICTIVE_MACHINE_CONTINUE_JOB_TYPE, acknowledged);
    return acknowledged;
  });
}

export async function retainPredictiveUncertainty(
  operation: PredictiveMachineOperation,
  reason: string,
) {
  await createTenantDb(operation.workspace).predictive_machine_operation.update(
    {
      set: { state: "uncertain", last_error: reason, updated_at: new Date() },
      where: and(
        predictiveMachineIdentity(machineBinding(operation), operation.id),
        eq(operationTable.lease_token, operation.lease_token),
        or(
          eq(operationTable.state, "issued"),
          eq(operationTable.state, "prepared"),
          eq(operationTable.state, "continuing"),
        ),
      ),
    },
  );
}
