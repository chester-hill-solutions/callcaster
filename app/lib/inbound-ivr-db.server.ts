import { eq } from "drizzle-orm";
import { script as scriptTable, workspace_number as workspaceNumberTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

export type InboundIvrScriptSteps = {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, unknown>;
};

export type InboundIvrNumberContext = {
  id: number;
  inbound_script_id: number;
  inbound_audio: string | null;
  workspaceId: string;
};

async function findWorkspaceNumberById(numberId: number) {
  const [row] = await db
    .select({
      id: workspaceNumberTable.id,
      inbound_script_id: workspaceNumberTable.inbound_script_id,
      inbound_audio: workspaceNumberTable.inbound_audio,
      workspaceId: workspaceNumberTable.workspace,
    })
    .from(workspaceNumberTable)
    .where(eq(workspaceNumberTable.id, numberId))
    .limit(1);

  if (!row?.workspaceId || row.inbound_script_id == null) {
    return null;
  }

  return {
    id: row.id,
    inbound_script_id: row.inbound_script_id,
    inbound_audio: row.inbound_audio,
    workspaceId: row.workspaceId,
  } satisfies InboundIvrNumberContext;
}

async function loadScriptSteps(
  workspaceId: string,
  scriptId: number,
): Promise<InboundIvrScriptSteps | null> {
  const tdb = createTenantDb(workspaceId);
  const script = await tdb.script.findFirst({
    where: eq(scriptTable.id, scriptId),
    columns: { steps: true },
  });
  const steps = script?.steps as InboundIvrScriptSteps | null | undefined;
  if (!steps?.pages || !steps?.blocks) {
    return null;
  }
  return steps;
}

export async function loadInboundIvrPageContext(numberId: number): Promise<{
  inbound_script_id: number;
  steps: InboundIvrScriptSteps;
} | null> {
  const number = await findWorkspaceNumberById(numberId);
  if (!number) {
    return null;
  }

  const steps = await loadScriptSteps(number.workspaceId, number.inbound_script_id);
  if (!steps) {
    return null;
  }

  return { inbound_script_id: number.inbound_script_id, steps };
}

export async function loadInboundIvrBlockContext(numberId: number): Promise<{
  number: InboundIvrNumberContext;
  script: InboundIvrScriptSteps;
} | null> {
  const number = await findWorkspaceNumberById(numberId);
  if (!number) {
    return null;
  }

  const script = await loadScriptSteps(number.workspaceId, number.inbound_script_id);
  if (!script) {
    return null;
  }

  return { number, script };
}
