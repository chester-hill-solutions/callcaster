import { eq } from "drizzle-orm";
import { z } from "zod";
import { call, job, predictive_machine_operation } from "@/db/schema";
import { resolveCanonicalTwilioWebhookUrl } from "@/lib/twilio-webhook.server";
import { TERMINAL_CALL_STATUSES } from "@/lib/telephony-db.server";
import { predictiveMachineReconcileParams } from "@/lib/worker/job-params.server";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import {
  lockPredictiveMachineOperation,
  machineBinding,
} from "./predictive-machine-operation.server";

const callbackBinding = z.object({
  workspaceId: z.uuid(),
  operationId: z.uuid(),
  attemptId: z.coerce.number().int().positive(),
  callSid: z.string().regex(/^CA[0-9a-f]{32}$/i),
});

function matchesStatusUrl(actual: string, saved: string | null) {
  if (!saved) return false;
  const received = new URL(actual);
  const reserved = new URL(saved);
  const entries = (url: URL) =>
    JSON.stringify(
      [...url.searchParams.entries()]
        .map((entry) => JSON.stringify(entry))
        .sort(),
    );
  return (
    received.origin === reserved.origin &&
    received.pathname === reserved.pathname &&
    entries(received) === entries(reserved)
  );
}

/** Call only after requireTwilioSignature validates the unchanged URL and body. */
export async function recordPredictiveSuccessorCallback(
  request: Request,
  params: Record<string, string>,
) {
  const url = new URL(request.url);
  if (!url.searchParams.has("continuation")) return;
  // Only terminal progress callbacks can recover a lost child lifecycle.
  if (!params.CallStatus || !TERMINAL_CALL_STATUSES.has(params.CallStatus))
    return;
  const binding = callbackBinding.parse({
    workspaceId: url.searchParams.get("workspace"),
    operationId: url.searchParams.get("continuation"),
    attemptId: url.searchParams.get("attempt"),
    callSid: params.CallSid,
  });
  const signedUrl = resolveCanonicalTwilioWebhookUrl(request);
  return db.transaction(async (tx) => {
    const tdb = createTenantDb(binding.workspaceId, tx);
    const stored = await tdb.predictive_machine_operation.findFirst({
      where: eq(predictive_machine_operation.id, binding.operationId),
    });
    if (!stored) throw new Error("Predictive callback reservation not found");
    const operation = await lockPredictiveMachineOperation(
      tx,
      machineBinding(stored),
      stored.id,
    );
    const parent = await tdb.call.findFirst({
      where: eq(call.sid, operation.call_sid),
    });
    if (
      request.method !== "POST" ||
      !matchesStatusUrl(signedUrl, operation.successor_status_url) ||
      binding.attemptId !== operation.successor_attempt_id ||
      !operation.send_started_at ||
      !parent?.account_sid ||
      params.AccountSid !== parent.account_sid ||
      params.Direction !== "outbound-api" ||
      (operation.successor_call_sid !== null &&
        operation.successor_call_sid !== binding.callSid) ||
      (operation.successor_callback_sid !== null &&
        (operation.successor_callback_sid !== binding.callSid ||
          operation.successor_callback_status !== params.CallStatus))
    )
      throw new Error("Predictive callback reservation binding does not match");
    // The create owner can have saved the row while this callback waited on
    // its lock. The route reads that row again and applies the normal status.
    if (operation.successor_call_sid) return;
    if (!["continuing", "uncertain"].includes(operation.state))
      throw new Error("Predictive callback has no pending send");
    await tdb.predictive_machine_operation.update({
      where: eq(predictive_machine_operation.id, operation.id),
      set: {
        successor_callback_sid: binding.callSid,
        successor_callback_status: params.CallStatus,
        updated_at: new Date(),
      },
    });
    await tx
      .insert(job)
      .values({
        type: "predictive_machine_reconcile",
        params: predictiveMachineReconcileParams.parse({
          workspaceId: operation.workspace,
          operationId: operation.id,
          successorCallSid: binding.callSid,
        }),
        workspace_id: operation.workspace,
        user_id: operation.user_id,
        status: "queued",
        retry_at: new Date(
          Math.max(Date.now(), operation.lease_until.getTime()),
        ).toISOString(),
        idempotency_key: `predictive-successor-callback:${operation.id}:${binding.callSid}`,
      })
      .onConflictDoNothing();
  });
}
