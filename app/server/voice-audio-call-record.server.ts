import { and, eq } from "drizzle-orm";
import { call } from "@/db/schema";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";

export async function persistVoiceAudioCall(tx: CreditTransaction, row: VoiceAudioConnection) {
  if (!row.provider_sid || !row.send_started_at) throw new Error("Agent audio provider receipt missing");
  await tx.insert(call).values({ sid: row.provider_sid, workspace: row.workspace, user_id: row.user_id,
    account_sid: row.account_sid, to: row.destination, from: row.caller_id, direction: "outbound-api", parent_call_sid: null,
    conference_id: row.conference_id, status: row.terminal_status ? normalizeAudioStatus(row.terminal_status) : "initiated",
    contact_id: null, outreach_attempt_id: null, queue_id: null,
  }).onConflictDoNothing({ target: call.sid });
  const [saved] = await tx.select().from(call).where(and(eq(call.sid, row.provider_sid), eq(call.workspace, row.workspace)));
  if (!saved || saved.account_sid !== row.account_sid || saved.to !== row.destination || saved.from !== row.caller_id || saved.direction !== "outbound-api" || saved.parent_call_sid)
    throw new Error("Agent audio call record does not match its provider receipt");
  return saved;
}

function normalizeAudioStatus(status: string) {
  return status === "busy" || status === "no-answer" || status === "failed" || status === "canceled" ? status : "completed";
}
