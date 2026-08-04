import { eq } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { adminDb } from "@/server/admin-db";

/** Read workspace credit balance for dial/SMS gates (global `workspace` table). */
export async function getWorkspaceCreditsBalance(
  workspaceId: string,
): Promise<number | null> {
  const rows = await adminDb
    .select({ credits: workspace.credits })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return rows[0]?.credits ?? null;
}
