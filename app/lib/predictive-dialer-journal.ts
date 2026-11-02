import { z } from "zod";
import type { AgentAudioStorage } from "./agent-audio-storage";
import type { StartConferenceParams } from "./services/hooks-api";

export type DialerOwner = { workspaceId: string; userId: string; campaignId: string };
const startRequestSchema = z.object({
  workspace_id: z.uuid(), campaign_id: z.string().regex(/^[1-9]\d*$/), caller_id: z.string().min(1), selected_device: z.string().min(1),
  dial_intent_id: z.uuid(), actor_id: z.string().min(1),
  audioSource: z.object({ connectionId: z.uuid(), generation: z.number().int().positive() }).optional(),
});
const journalSchema = z.object({
  version: z.literal(1), workspaceId: z.uuid(), userId: z.string().min(1), campaignId: z.string().regex(/^[1-9]\d*$/),
  intentId: z.uuid(), conference: z.string().min(1).nullable(), state: z.enum(["starting", "active", "stopping"]),
  request: startRequestSchema.nullable(),
}).superRefine((value, ctx) => {
  const request = value.request;
  if (request && (request.workspace_id !== value.workspaceId || request.actor_id !== value.userId ||
    request.campaign_id !== value.campaignId || request.dial_intent_id !== value.intentId) ||
    value.state === "starting" && !request || value.state === "active" && !value.conference)
    ctx.addIssue({ code: "custom", message: "Saved dialer request owner changed" });
});
export type DialerJournal = z.infer<typeof journalSchema>;
export type SavedDialerStart = StartConferenceParams & { dial_intent_id: string; actor_id: string };
export function dialerJournalKey(owner: Pick<DialerOwner, "workspaceId" | "userId">) {
  return `callcaster:predictive-dialer:1:${owner.workspaceId}:${owner.userId}`;
}
export function readDialerJournal(storage: AgentAudioStorage, owner: DialerOwner): DialerJournal | null {
  const saved: unknown = JSON.parse(storage.getItem(dialerJournalKey(owner)) ?? "null");
  if (saved === null) return null;
  const journal = journalSchema.parse(saved);
  if (journal.workspaceId !== owner.workspaceId || journal.userId !== owner.userId) throw new Error("Saved dialer actor changed");
  return journal;
}
/** An old response must never overwrite another tab's newer session. */
export function writeDialerJournal(storage: AgentAudioStorage, owner: DialerOwner, journal: DialerJournal | null, expectedId: string | null) {
  const current = readDialerJournal(storage, owner);
  if ((current?.intentId ?? null) !== expectedId) throw new Error("Saved dialer session changed");
  if (current?.state === "stopping" && journal && journal.state !== "stopping") throw new Error("Saved dialer Stop cannot be reversed");
  storage.setItem(dialerJournalKey(owner), JSON.stringify(journal === null ? null : journalSchema.parse(journal)));
}
