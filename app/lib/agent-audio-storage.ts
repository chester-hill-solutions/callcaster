import { z } from "zod";
import { voiceAudioConnectRequestSchema, type VoiceAudioConnectRequest, type VoiceAudioOwner } from "@/lib/voice-audio-client";

const journalSchema = z.object({
  version: z.literal(1),
  selectedDevice: z.string(),
  active: voiceAudioConnectRequestSchema.nullable(),
  pending: z.object({ request: voiceAudioConnectRequestSchema, cancelRequested: z.boolean(), returningBrowser: z.boolean().default(false) }).nullable(),
});
export type AgentAudioJournal = z.infer<typeof journalSchema>;
export type AgentAudioStorage = Pick<Storage, "getItem" | "setItem">;

export const emptyAgentAudioJournal = (): AgentAudioJournal => ({ version: 1, selectedDevice: "computer", active: null, pending: null });

export function agentAudioStorageKey(owner: VoiceAudioOwner) {
  return `callcaster:agent-audio:1:${owner.workspaceId}:${owner.userId}`;
}

export function readAgentAudioJournal(storage: AgentAudioStorage, owner: VoiceAudioOwner): AgentAudioJournal {
  const saved = storage.getItem(agentAudioStorageKey(owner));
  if (!saved) return emptyAgentAudioJournal();
  const journal = journalSchema.parse(JSON.parse(saved));
  const requests = [journal.active, journal.pending?.request];
  if (requests.some((request) => request && request.workspaceId !== owner.workspaceId)) throw new Error("Audio journal owner changed");
  return journal;
}

export function writeAgentAudioJournal(storage: AgentAudioStorage, owner: VoiceAudioOwner, journal: AgentAudioJournal) {
  storage.setItem(agentAudioStorageKey(owner), JSON.stringify(journal));
}

export function agentAudioRequestDevice(request: VoiceAudioConnectRequest) {
  return request.device === "computer" ? "computer" : request.phoneNumber ?? "computer";
}
