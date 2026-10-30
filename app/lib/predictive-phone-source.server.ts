import { readPredictivePhoneAudioIntent } from "@/server/predictive-phone-source.server";
import { verifyVoiceAudioCustomerSource } from "@/lib/voice-audio-customer-source.server";
import type { Twilio } from "twilio";
import { logger } from "@/lib/logger.server";

/** A room with audio history must not fall back to unverified legacy dispatch. */
export async function preparePredictiveTurnRoom(input: { workspaceId: string; userId: string; campaignId: number; conferenceId: string }, client: Twilio) {
  try {
    const intent = await readPredictivePhoneAudioIntent(input);
    if (!intent) {
      if (input.conferenceId.includes("~")) {
        const rooms = await client.conferences.list({ friendlyName: input.conferenceId, status: "in-progress", limit: 1 });
        if (!rooms.length) return { ok: false as const, result: { success: true as const, message: "Conference ended, stopping auto-dial" } };
      }
      return { ok: true as const, audioSource: undefined };
    }
    const source = await verifyVoiceAudioCustomerSource({ ...input, connectionId: intent.connectionId,
      generation: intent.generation, phoneNumber: intent.destination });
    return source.ok ? { ok: true as const, audioSource: { ...intent, proof: source.proof } }
      : { ok: false as const, result: { success: false as const, failureKind: "not-sent" as const, error: "Predictive phone audio is not ready" } };
  } catch (error) {
    logger.error("predictive.room_preflight_failed", error);
    // No claim, hold or customer POST exists before this preflight completes.
    return { ok: false as const, result: { success: false as const, failureKind: "not-sent" as const, error: "Predictive room could not be verified" } };
  }
}
