import { eq } from "drizzle-orm";
import { script as scriptTable } from "@/db/schema";
import type { Json } from "@/lib/db-types";
import { createTenantDb } from "@/server/tenant-db";

type ScriptRow = typeof scriptTable.$inferSelect;

export async function insertScriptForWorkspace(args: {
  workspaceId: string;
  name: string;
  steps: unknown;
  updatedBy: string;
}): Promise<ScriptRow | null> {
  const tdb = createTenantDb(args.workspaceId);
  const [row] = await tdb.script.insert({
    name: args.name,
    steps: args.steps as Json,
    updated_at: new Date().toISOString(),
    updated_by: args.updatedBy,
  });
  return row ?? null;
}

export async function updateScriptForWorkspace(args: {
  workspaceId: string;
  scriptId: number;
  name: string;
  steps: unknown;
  updatedBy: string;
}): Promise<ScriptRow | null> {
  const tdb = createTenantDb(args.workspaceId);
  const [row] = await tdb.script.update({
    set: {
      name: args.name,
      steps: args.steps as Json,
      updated_at: new Date().toISOString(),
      updated_by: args.updatedBy,
    },
    where: eq(scriptTable.id, args.scriptId),
  });
  return row ?? null;
}

export async function createWorkspaceScript(args: {
  workspaceId: string;
  name: string;
  type: string;
  steps: unknown;
  createdBy?: string | null;
}): Promise<ScriptRow | null> {
  const tdb = createTenantDb(args.workspaceId);
  const [row] = await tdb.script.insert({
    name: args.name,
    type: args.type,
    steps: args.steps as Json,
    created_by: args.createdBy ?? null,
  });
  return row ?? null;
}

export async function getScriptExportFields(
  workspaceId: string,
  scriptId: number,
): Promise<Pick<ScriptRow, "name" | "steps"> | null> {
  const tdb = createTenantDb(workspaceId);
  return (await tdb.script.findFirst({
    where: eq(scriptTable.id, scriptId),
    columns: { name: true, steps: true },
  })) ?? null;
}
