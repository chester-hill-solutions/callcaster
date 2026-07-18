import { eq } from "drizzle-orm";
import { script as scriptTable } from "@/db/schema";
import type { Json } from "@/lib/db-types";
import { persistWorkspaceScript } from "@/lib/script-persistence.server";
import { createTenantDb } from "@/server/tenant-db";

type ScriptRow = typeof scriptTable.$inferSelect;

export async function insertScriptForWorkspace(args: {
  workspaceId: string;
  name: string;
  steps: unknown;
  updatedBy: string;
}): Promise<ScriptRow | null> {
  return persistWorkspaceScript({
    mode: "create",
    workspaceId: args.workspaceId,
    actorId: args.updatedBy,
    content: {
      name: args.name,
      steps: args.steps,
    },
  });
}

export async function updateScriptForWorkspace(args: {
  workspaceId: string;
  scriptId: number;
  name: string;
  steps: unknown;
  updatedBy: string;
}): Promise<ScriptRow | null> {
  return persistWorkspaceScript({
    mode: "update",
    workspaceId: args.workspaceId,
    actorId: args.updatedBy,
    scriptId: args.scriptId,
    content: {
      name: args.name,
      steps: args.steps,
    },
  });
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
