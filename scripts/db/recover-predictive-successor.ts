/** Queue verified successor adoption. Run with the app's configured environment. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { predictive_machine_operation } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { pool, directPool } from "@/server/db";
import {
  enqueueRegisteredJob,
  predictiveMachineReconcileParams,
} from "@/lib/worker/job-params.server";
import { PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE } from "@/lib/worker/job-types.server";

const args = process.argv.slice(2);
const apply = args.at(-1) === "--apply";
if (args.length !== (apply ? 4 : 3)) {
  console.error(
    "Usage: bun run scripts/db/recover-predictive-successor.ts WORKSPACE_UUID OPERATION_UUID CALL_SID [--apply]",
  );
  process.exitCode = 1;
} else {
  try {
    const params = predictiveMachineReconcileParams.parse({
      workspaceId: args[0],
      operationId: args[1],
      successorCallSid: args[2],
    });
    const operation = await createTenantDb(
      params.workspaceId,
    ).predictive_machine_operation.findFirst({
      where: eq(predictive_machine_operation.id, params.operationId),
    });
    if (!operation)
      throw new Error("Predictive operation not found in this workspace");
    if (!operation.send_started_at || !operation.successor_voice_url)
      throw new Error("Predictive operation has no successor reservation");
    if (apply) {
      await enqueueRegisteredJob({
        type: PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE,
        params,
        workspaceId: operation.workspace,
        userId: operation.user_id,
        dedupe: {
          kind: "idempotency",
          key: `predictive-operator-recovery:${operation.id}:${randomUUID()}`,
        },
      });
      console.log(
        "Recovery queued. The worker must verify provider evidence before it adopts the call.",
      );
    } else {
      console.log(
        JSON.stringify({
          operationId: operation.id,
          state: operation.state,
          successorCallSid: params.successorCallSid,
          apply: false,
        }),
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Predictive recovery failed",
    );
    process.exitCode = 1;
  }
}
await Promise.all([pool.end(), directPool.end()]);
