import { eq } from "drizzle-orm";
import { script as scriptTable } from "@/db/schema";
import type { Json } from "@/lib/database.types";
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
