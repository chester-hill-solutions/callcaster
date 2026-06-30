import { eq } from "drizzle-orm";
import { user as userTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";

/** Read verified audio numbers for dial device checks (global `user` table). */
export async function getUserVerifiedAudioNumbers(
  userId: string,
): Promise<string[] | null> {
  const rows = await adminDb
    .select({ verified_audio_numbers: userTable.verified_audio_numbers })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return rows[0]?.verified_audio_numbers ?? null;
}
