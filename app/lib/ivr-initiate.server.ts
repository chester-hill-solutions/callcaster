import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { logger } from "@/lib/logger.server";
import { resolveIvrCallUrls } from "@/lib/twilio-ivr-runtime.server";
import { ivrMachineDetection } from "@/lib/ivr-machine-detection";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { dispatchReservedVoiceCall, ivrQueueVoiceOperationKey } from "@/lib/voice-credit-dispatch.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { createTenantDb } from "@/server/tenant-db";
import { voiceBillingKindFromCampaignType } from "@/lib/pricing";
export type InitiateIvrContact = {
  id: number;
  contact_id: number;
  phone: string;
  caller_id: string;
};

export type InitiateIvrCallInput = {
  user: { id: string };
  workspace_id: string;
  campaign_id: number;
  contact: InitiateIvrContact;
  user_id: string;
};

export type InitiateIvrCallResult =
  | { success: true; callSid: string }
  | { success: false; creditsError: true }
  | { success: false; error: string };

export async function initiateIvrCall(
  input: InitiateIvrCallInput,
): Promise<InitiateIvrCallResult> {
  await requireWorkspaceAccess({
    user: input.user,
    workspaceId: input.workspace_id,
  });

  const campaign = await findCampaignInWorkspace(input.workspace_id, input.campaign_id);
  if (!campaign) return { success: false, error: "Campaign not found" };

  const twilio = await createWorkspaceTwilioInstance({
    workspace_id: input.workspace_id,
  });

  try {
    const ivrUrls = resolveIvrCallUrls(input.campaign_id);
    const dispatched = await dispatchReservedVoiceCall({
      workspaceId: input.workspace_id, kind: voiceBillingKindFromCampaignType(campaign.type), accountSid: twilio.accountSid,
      to: input.contact.phone, from: input.contact.caller_id, campaignId: input.campaign_id,
      contactId: input.contact.contact_id, queueId: input.contact.id, userId: input.user_id,
      operationKey: ivrQueueVoiceOperationKey(input.contact.id),
      voiceUrl: ivrUrls.flowUrl, statusCallback: ivrUrls.statusCallback,
      prepareOutreach: (tx) => rpcCreateOutreachAttempt(createTenantDb(input.workspace_id, tx), {
        contactId: input.contact.contact_id, campaignId: input.campaign_id,
        userId: input.user_id, workspaceId: input.workspace_id, queueId: input.contact.id,
      }),
      create: ({ voiceUrl, statusCallback }) =>
        twilio.calls.create({
          to: input.contact.phone,
          from: input.contact.caller_id,
          url: voiceUrl,
          machineDetection: ivrMachineDetection(campaign),
          statusCallbackEvent: ["answered", "completed"],
          statusCallback,
        }),
    });
    if (!dispatched.ok) {
      if (dispatched.reason === "insufficient_credits" || dispatched.reason === "workspace_not_found") {
        return { success: false, creditsError: true };
      }
      return { success: false, error: dispatched.reason === "dispatch_in_progress"
        ? "This call is awaiting completion or recovery." : "This contact is no longer queued." };
    }
    const { callSid } = dispatched;

    await dequeueQueueEntry({
      by: { id: input.contact.id },
      userId: input.user_id,
      workspaceId: input.workspace_id,
      expectedGeneration: dispatched.queueGeneration,
      reason: "IVR dial dispatched",
    });

    return { success: true, callSid };
  } catch (error) {
    const message = twilioErrorUserMessage(error);
    if (message.toLowerCase().includes("credit")) {
      return { success: false, creditsError: true };
    }
    logger.error("initiateIvrCall Twilio error", error);
    return { success: false, error: message };
  }
}
