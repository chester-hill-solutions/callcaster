import { accountSid, actor, callerId, issued, joined, phone, rooms, web, workspaceId } from "./voice-audio-fixture";
import { observeVoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";
import { verifyVoiceAudioCustomerSource } from "@/lib/voice-audio-customer-source.server";
import type { VoiceAudioCustomerSourceInput } from "@/server/voice-audio-customer-source.server";

export async function confirmed() {
  const row = await observeVoiceAudioConferenceEvent(joined(await issued()));
  if (!row?.provider_sid || !row.conference_sid) throw new Error("Confirmed phone fixture required");
  const call = { sid: row.provider_sid, accountSid, to: phone, from: callerId, direction: "outbound-api", parentCallSid: null,
    status: "in-progress", duration: null, dateCreated: new Date(), dateUpdated: new Date(), endTime: null,
    voiceUrl: row.voice_url, statusCallback: row.status_callback };
  const room = { sid: row.conference_sid, accountSid, friendlyName: row.conference_id, status: "in-progress" };
  const participant = { callSid: row.provider_sid, accountSid, conferenceSid: row.conference_sid,
    label: `audio:${row.id}:${row.generation}`, status: "connected", muted: false, hold: false };
  web.records.set(row.provider_sid, call); rooms.records.set(row.conference_sid, room); rooms.participant.mockResolvedValue(participant);
  const input: VoiceAudioCustomerSourceInput = { workspaceId, userId: actor, connectionId: row.id,
    generation: row.generation, campaignId: 123, phoneNumber: phone };
  return { row, call, room, participant, input };
}

export async function verified(f: Awaited<ReturnType<typeof confirmed>>) {
  const result = await verifyVoiceAudioCustomerSource(f.input);
  if (!result.ok) throw new Error(`Phone source verification refused: ${result.reason}`);
  return result.proof;
}
