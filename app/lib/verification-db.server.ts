import { and, desc, eq, gte } from "drizzle-orm";
import {
  user as userTable,
  verification_session as verificationSessionTable,
} from "@/db/schema";
import { adminDb } from "@/server/admin-db";

export async function findPendingVerificationSession(expectedCaller: string, now: string) {
  const [row] = await adminDb
    .select({
      id: verificationSessionTable.id,
      user_id: verificationSessionTable.user_id,
      expected_caller: verificationSessionTable.expected_caller,
    })
    .from(verificationSessionTable)
    .where(
      and(
        eq(verificationSessionTable.expected_caller, expectedCaller),
        eq(verificationSessionTable.status, "pending"),
        gte(verificationSessionTable.expires_at, now),
      ),
    )
    .orderBy(desc(verificationSessionTable.created_at))
    .limit(1);
  return row ?? null;
}

export async function getUserVerifiedAudioNumbers(userId: string) {
  const [row] = await adminDb
    .select({ verified_audio_numbers: userTable.verified_audio_numbers })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return row?.verified_audio_numbers ?? [];
}

export async function appendVerifiedAudioNumber(userId: string, phoneNumber: string) {
  const verifiedNumbers = await getUserVerifiedAudioNumbers(userId);
  const rows = await adminDb
    .update(userTable)
    .set({
      verified_audio_numbers: [...verifiedNumbers, phoneNumber],
    })
    .where(eq(userTable.id, userId))
    .returning({ id: userTable.id });
  return rows[0] ?? null;
}

export async function markVerificationSessionVerified(sessionId: string) {
  const rows = await adminDb
    .update(verificationSessionTable)
    .set({ status: "verified" })
    .where(eq(verificationSessionTable.id, sessionId))
    .returning({ id: verificationSessionTable.id });
  return rows[0] ?? null;
}

export async function insertVerificationSession(args: {
  userId: string;
  expectedCaller: string;
  expiresAt: string;
  createdAt: string;
  id: string;
}) {
  const rows = await adminDb
    .insert(verificationSessionTable)
    .values({
      id: args.id,
      user_id: args.userId,
      expected_caller: args.expectedCaller,
      status: "pending",
      expires_at: args.expiresAt,
      created_at: args.createdAt,
    })
    .returning();
  return rows[0] ?? null;
}
