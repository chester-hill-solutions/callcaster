import { isParticipantHangup, type TwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { handleConferenceParticipantHangup } from "@/lib/conference-participant-hangup.server";
import { isRetiredVoiceAudioSource } from "@/server/voice-audio-classification.server";
import { observeVoiceAudioConferenceEvent, observeVoiceAudioBridgeEvent, type VoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";

type ParticipantEvent = Extract<TwilioVoiceCallback, { kind: "participant" }>;

/** Signature validation and callback-owner binding precede participant dispatch. */
export async function handleBoundVoiceAudioParticipant(workspaceId: string, requestUrl: string, event: ParticipantEvent) {
  if (event.event !== "participant-join" && event.event !== "participant-leave") return null;
  const input: VoiceAudioConferenceEvent = { workspaceId, requestUrl, accountSid: event.accountSid ?? "", callSid: event.callSid ?? "",
    conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "", event: event.event,
    participantLabel: event.raw.ParticipantLabel ?? "", muted: event.raw.Muted ?? "" };
  const row = await observeVoiceAudioConferenceEvent(input);
  if (!row) return null;
  if (isParticipantHangup(event) && row.committed_at && !row.retired_at && !await isRetiredVoiceAudioSource({
    workspaceId, accountSid: row.account_sid, callSid: input.callSid, conferenceId: row.conference_id,
  })) {
    const client = await createOriginalVoiceAccountClient(row);
    await handleConferenceParticipantHangup(event, { sid: input.callSid, workspace: workspaceId, contact_id: null,
      conference_id: row.conference_id }, client, input.conferenceSid);
  }
  return row;
}

/** The first callback owner can end while its original parent/customer bridge lives. */
export async function handleBoundVoiceAudioBridgeParticipant(owner: VoiceAudioConnection, requestUrl: string, event: ParticipantEvent) {
  const callSid = event.callSid ?? "";
  const row = await observeVoiceAudioBridgeEvent(owner, { accountSid: event.accountSid ?? "", requestUrl,
    conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "", callSid,
    joined: event.event === "participant-join",
  });
  if (!isParticipantHangup(event)) return row;
  const currentParent = callSid === row.original_agent_sid && !await isRetiredVoiceAudioSource({
    workspaceId: row.workspace, accountSid: row.account_sid, callSid,
  });
  if (callSid !== row.customer_sid && !currentParent) return row;
  const conferenceSid = row.conference_sid;
  if (!conferenceSid) throw new Error("Owned manual conference SID is missing");
  const client = await createOriginalVoiceAccountClient(row);
  await handleConferenceParticipantHangup(event, { sid: callSid, workspace: row.workspace, contact_id: null,
    conference_id: row.conference_id }, client, conferenceSid);
  return row;
}
