import { randomUUID } from "node:crypto";
import { dialBodySchema } from "@/lib/schemas/api/actions";
import { and, eq } from "drizzle-orm";
import { campaign, campaign_queue, contact, outreach_attempt, workspace_number } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { callerIdRefusalMessage, resolveCallerIdUsability } from "@/lib/caller-id-usability.server";
import { normalizePhoneNumber } from "@/lib/utils";

export function parseManualDialRequest(raw: unknown) {
  const parsed = dialBodySchema.safeParse(raw);
  if (!parsed.success) throw new AppError("Invalid dial payload", 400, ErrorCode.VALIDATION_ERROR);
  return parsed.data;
}

/** Stable identity is checked before mutable admission rules on a retry. */
export function manualDialIdentity(input: ReturnType<typeof parseManualDialRequest>, actorId: string) {
  if (input.user_id !== actorId) throw new AppError("The selected device must belong to the signed-in user", 403, ErrorCode.FORBIDDEN);
  let to: string, from: string;
  try { to = normalizePhoneNumber(input.to_number); from = normalizePhoneNumber(input.caller_id); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid phone number", 400, ErrorCode.VALIDATION_ERROR); }
  const audioSource = input.audio_connection_id && input.audio_generation !== undefined && input.selected_device && input.selected_device !== "computer"
    ? { connectionId: input.audio_connection_id, generation: input.audio_generation, destination: input.selected_device, mode: "manual" as const } : undefined;
  return { ...input, to, from, intentId: input.dial_intent_id ?? randomUUID(),
    audioSource, setupTo: audioSource ? null : input.selected_device && input.selected_device !== "computer" ? input.selected_device : `client:${actorId}` };
}

export async function validateManualDialRequest(input: ReturnType<typeof parseManualDialRequest>, actorId: string) {
  const identity = manualDialIdentity(input, actorId);
  const tdb = createTenantDb(input.workspace_id);
  const [ownedCampaign, ownedContact, queue, attempt] = await Promise.all([
    tdb.campaign.findFirst({ where: eq(campaign.id, input.campaign_id), columns: { id: true } }),
    tdb.contact.findFirst({ where: eq(contact.id, input.contact_id), columns: { id: true } }),
    tdb.campaign_queue.findFirst({ where: and(eq(campaign_queue.id, input.queue_id),
      eq(campaign_queue.campaign_id, input.campaign_id), eq(campaign_queue.contact_id, input.contact_id)) }),
    input.outreach_id == null ? null : tdb.outreach_attempt.findFirst({ where: and(
      eq(outreach_attempt.id, input.outreach_id), eq(outreach_attempt.campaign_id, input.campaign_id),
      eq(outreach_attempt.contact_id, input.contact_id),
    ), columns: { id: true } }),
  ]);
  if (!ownedCampaign || !ownedContact || !queue || (input.outreach_id != null && !attempt)) {
    throw new AppError("Dial context not found", 404, ErrorCode.NOT_FOUND);
  }
  const selectedDevice = input.selected_device;
  if (selectedDevice && selectedDevice !== "computer") {
    const verified = await getUserVerifiedAudioNumbers(actorId);
    if (!verified?.includes(selectedDevice)) throw new AppError("Selected device is not a verified phone number", 400, ErrorCode.VALIDATION_ERROR);
  }
  const refusal = callerIdRefusalMessage(await resolveCallerIdUsability(input.workspace_id, identity.from));
  if (refusal) throw new AppError(refusal, 400, ErrorCode.VALIDATION_ERROR);
  await requireEmergencyCallerId(input.workspace_id, identity.from);
  return identity;
}

async function requireEmergencyCallerId(workspaceId: string, callerId: string) {
  const [number, onboarding] = await Promise.all([
    createTenantDb(workspaceId).workspace_number.findFirst({ where: eq(workspace_number.phone_number, callerId) }),
    getWorkspaceMessagingOnboardingState({ workspaceId }),
  ]);
  if (!onboarding.selectedChannels?.includes("voice_compliance") || !onboarding.emergencyVoice.enabled) return;
  if (!number) throw new AppError("Caller ID must be a workspace number for emergency-compliant voice.", 400, ErrorCode.VALIDATION_ERROR);
  if (!onboarding.emergencyVoice.allowedCallerIdTypes.includes(number.type ?? "")) {
    throw new AppError("Selected caller ID is not eligible for emergency-compliant voice.", 400, ErrorCode.VALIDATION_ERROR);
  }
  if (number.phone_number && !onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.includes(number.phone_number)) {
    throw new AppError("Selected caller ID is not marked as emergency-ready.", 400, ErrorCode.VALIDATION_ERROR);
  }
}
