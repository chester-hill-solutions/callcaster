import { randomUUID } from "node:crypto";
import { z } from "zod";
import { phoneAudioSourceFields, requirePhoneAudioSource } from "@/lib/schemas/api/phone-audio-source";
import type { StartAutoDialConferenceInput } from "@/lib/auto-dial-start.server";

const identitySchema = z.object({
  selected_device: z.string().min(1), dial_intent_id: z.string().uuid().transform(value => value.toLowerCase()).optional(),
  ...phoneAudioSourceFields,
}).superRefine(requirePhoneAudioSource);

/** Normalize immutable request identity before accepted replay or provider reads. */
export function predictiveStartIdentity(input: StartAutoDialConferenceInput) {
  const parsed = identitySchema.safeParse({ selected_device: input.selectedDevice, dial_intent_id: input.dialIntentId,
    audio_connection_id: input.audioSource?.connectionId, audio_generation: input.audioSource?.generation });
  if (!parsed.success) return { ok: false as const, status: 400, error: "Invalid predictive Start identity" };
  const { audio_connection_id: connectionId, audio_generation: generation } = parsed.data;
  const intent = parsed.data.dial_intent_id ?? randomUUID(), conferenceName = `${input.userId}~${intent}`;
  const audioSource = connectionId && generation !== undefined
    ? { connectionId, generation, destination: input.selectedDevice, mode: "predictive" as const } : undefined;
  return { ok: true as const, conferenceName, audioSource, identity: {
    workspaceId: input.workspaceId, campaignId: input.campaignId, userId: input.userId,
    conferenceId: audioSource ? undefined : conferenceName, audioSource,
    setup: { to: input.selectedDevice === "computer" ? `client:${input.userId}` : input.selectedDevice,
      callerId: input.callerId, intentKey: `predictive-start:${intent}` },
  } };
}
