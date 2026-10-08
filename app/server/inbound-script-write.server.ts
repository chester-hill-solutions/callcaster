import { and, eq, inArray, sql } from "drizzle-orm";
import { inbound_queue, script, workspace_number } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { validateInboundScriptSteps } from "@/lib/inbound-script-validation";
import { isSerializationFailure } from "@/lib/parse-utils.server";
import { db, type Database } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

type ScriptContent = { type?: string | null; steps: unknown };
type InboundScriptReadDb = Pick<TenantDb, "script" | "inbound_queue" | "execute">;

export async function withInboundScriptWrite<T>(workspaceId: string, write: (tdb: TenantDb) => Promise<T>, database: Pick<Database, "transaction"> = db) {
  // All attachment and overwrite paths use Serializable so a concurrent attachment cannot escape the usage predicate.
  try {
    return await database.transaction((tx) => write(createTenantDb(workspaceId, tx)), { isolationLevel: "serializable" });
  } catch (error) {
    if (isSerializationFailure(error)) {
      throw new AppError("The menu changed during this save. Review it and try again.", 409, ErrorCode.CONFLICT);
    }
    throw error;
  }
}

export async function lockInboundScript(tdb: Pick<TenantDb, "execute">, workspaceId: string, scriptId: number) {
  await tdb.execute(sql`select ${script.id} from ${script}
    where ${and(eq(script.workspace, workspaceId), eq(script.id, scriptId))} for update`);
}

async function requireValidInboundContent(tdb: Pick<TenantDb, "inbound_queue">, content: ScriptContent) {
  if (content.type !== "inbound_ivr") {
    throw new AppError("Choose a script with the inbound IVR type.", 400, ErrorCode.VALIDATION_ERROR);
  }
  const validation = validateInboundScriptSteps(content.steps);
  if (!validation.ok) {
    throw new AppError("The menu has invalid routing. Review Script validation.", 400, ErrorCode.VALIDATION_ERROR, validation.errors);
  }
  if (validation.queueIds.length) {
    const queues = await tdb.inbound_queue.findMany({ columns: { id: true }, where: inArray(inbound_queue.id, validation.queueIds) });
    if (queues.length !== validation.queueIds.length) {
      throw new AppError("Choose menu queues in this workspace.", 400, ErrorCode.VALIDATION_ERROR);
    }
  }
}

export async function validateInboundScriptAttachment(tdb: InboundScriptReadDb, workspaceId: string, scriptId: number) {
  if (!Number.isSafeInteger(scriptId) || scriptId <= 0) {
    throw new AppError("Choose an automated menu in this workspace", 400, ErrorCode.VALIDATION_ERROR);
  }
  await lockInboundScript(tdb, workspaceId, scriptId);
  const selected = await tdb.script.findFirst({ where: eq(script.id, scriptId), columns: { type: true, steps: true } });
  if (!selected) throw new AppError("Choose an automated menu in this workspace", 400, ErrorCode.VALIDATION_ERROR);
  await requireValidInboundContent(tdb, selected);
}

export async function validateAttachedInboundScriptUpdate(tdb: TenantDb, scriptId: number, content: ScriptContent) {
  const usage = await tdb.workspace_number.count({ where: eq(workspace_number.inbound_script_id, scriptId) });
  if (usage) await requireValidInboundContent(tdb, content);
}
