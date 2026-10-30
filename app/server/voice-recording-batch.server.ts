import { eq } from "drizzle-orm";
import { workspace_voice_recording_operation as recordings } from "@/db/schema";
import { createTenantDb } from "./tenant-db";

/** The existing batch worker consumes one complete file. Segments need assembly first. */
export async function isSinglePartCallRecording(workspaceId: string, callSid: string, audioUrl: string) {
  const rows = await createTenantDb(workspaceId).workspace_voice_recording_operation.findMany({
    where: eq(recordings.logical_call_sid, callSid), limit: 2,
  });
  // Preserve recordings created before the operation journal was introduced.
  const row = rows[0];
  if (!row) return true;
  return rows.length === 1 && row.kind === "dial" && row.source_call_sid === callSid && row.source_parent_sid === null &&
    row.provider_status === "completed" && row.terminal_at !== null && row.audio_url === audioUrl;
}
