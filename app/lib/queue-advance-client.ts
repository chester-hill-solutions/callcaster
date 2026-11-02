import { queueAdvanceRequestSchema, queueAdvanceResponseSchema, type QueueAdvanceRequest, type QueueRemovedEntry } from "@/lib/schemas/api/queue-advance";
import { VOICE_AUDIO_ACTOR_HEADER } from "@/lib/voice-audio-connection";

type Result = { ok: true; advanceState: "dequeued" | "already_dequeued" | "superseded"; removedEntries: QueueRemovedEntry[] } | { ok: false; error: string };
const unconfirmed = "Could not confirm the queue update. Your contact and answers are still here. Try again.";

export async function advanceQueueEntry(request: QueueAdvanceRequest, userId: string): Promise<Result> {
  const parsed = queueAdvanceRequestSchema.safeParse(request);
  if (!parsed.success || !userId) return { ok: false, error: "Check the current contact before you continue." };
  try {
    const response = await fetch("/api/queues", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json", Accept: "application/json", [VOICE_AUDIO_ACTOR_HEADER]: userId },
      body: JSON.stringify(parsed.data) });
    const body: unknown = await response.json();
    if (response.status !== 200) {
      const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : unconfirmed;
      return { ok: false, error: message };
    }
    const ack = queueAdvanceResponseSchema.safeParse(body);
    if (!ack.success) return { ok: false, error: unconfirmed };
    const a = ack.data, r = parsed.data;
    return a.user_id === userId && a.workspace_id === r.workspace_id && a.campaign_id === r.campaign_id &&
      a.contact_id === r.contact_id && a.queue_id === r.queue_id && a.dispatch_generation === r.dispatch_generation &&
      a.voice_reservation_id === r.voice_reservation_id && a.household === r.household && a.call_sid === r.call_sid &&
      JSON.stringify(a.household_snapshot) === JSON.stringify(r.household_snapshot)
      ? { ok: true, advanceState: a.advance_state, removedEntries: a.removed_entries } : { ok: false, error: unconfirmed };
  } catch { return { ok: false, error: unconfirmed }; }
}
