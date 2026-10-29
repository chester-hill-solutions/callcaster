import { eq } from "drizzle-orm";
import { workspace_voice_audio_connection as connections } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";

/** Retirement retains this identity so late events cannot become customer usage. */
export async function isVoiceAudioLeg(workspaceId: string, callSid: string) {
  const row = await createTenantDb(workspaceId).workspace_voice_audio_connection.findFirst({
    where: eq(connections.provider_sid, callSid), columns: { id: true },
  });
  return Boolean(row);
}
