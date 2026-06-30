import { eq } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { isObject } from "@/lib/type-safety-utils";

export type WorkspaceTwilioData = Record<string, unknown>;

export async function loadWorkspaceTwilioData(
  workspaceId: string,
): Promise<WorkspaceTwilioData> {
  const [row] = await adminDb
    .select({ twilio_data: workspaceTable.twilio_data })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!row) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  return isObject(row.twilio_data) ? row.twilio_data : {};
}

export async function persistWorkspaceTwilioData(
  workspaceId: string,
  twilioData: WorkspaceTwilioData,
): Promise<void> {
  await adminDb
    .update(workspaceTable)
    .set({ twilio_data: twilioData })
    .where(eq(workspaceTable.id, workspaceId));
}

export async function mergeWorkspaceTwilioData(
  workspaceId: string,
  updater: (current: WorkspaceTwilioData) => WorkspaceTwilioData,
): Promise<WorkspaceTwilioData> {
  const current = await loadWorkspaceTwilioData(workspaceId);
  const next = updater(current);
  await persistWorkspaceTwilioData(workspaceId, next);
  return next;
}

export async function patchWorkspaceTwilioData(
  workspaceId: string,
  patch: WorkspaceTwilioData,
): Promise<WorkspaceTwilioData> {
  return mergeWorkspaceTwilioData(workspaceId, (current) => ({
    ...current,
    ...patch,
  }));
}
