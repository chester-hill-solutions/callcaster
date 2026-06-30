import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { dequeueCampaignQueueById } from "@/lib/campaign-queue-db.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { resolveIvrCallUrls } from "@/lib/twilio-ivr-runtime.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import type { Database } from "@/lib/db-types";
import { insertCallForWorkspace } from "@/lib/telephony-db.server";
import { db } from "@/server/db";
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
  const client = createClient<Database>(
    env.BASE_URL(),
    env.BASE_URL(),
  );

  await requireWorkspaceAccess({
    user: input.user,
    workspaceId: input.workspace_id,
  });

  const twilio = await createWorkspaceTwilioInstance({
    client,
    workspace_id: input.workspace_id,
  });

  let outreachAttemptId: number;
  try {
    outreachAttemptId = await rpcCreateOutreachAttempt(db, {
      contactId: input.contact.contact_id,
      campaignId: input.campaign_id,
      userId: input.user_id,
      workspaceId: input.workspace_id,
      queueId: input.contact.id,
    });
  } catch (outreachError) {
    logger.error("initiateIvrCall outreach error", outreachError);
    const message =
      outreachError instanceof Error ? outreachError.message : String(outreachError);
    return { success: false, error: message };
  }

  try {
    const ivrUrls = resolveIvrCallUrls(input.campaign_id);
    const call = await withTwilioRetry(
      () =>
        twilio.calls.create({
          to: input.contact.phone,
          from: input.contact.caller_id,
          url: ivrUrls.flowUrl,
          machineDetection: "Enable",
          statusCallbackEvent: ["answered", "completed"],
          statusCallback: ivrUrls.statusCallback,
        }),
      {
        workspaceId: input.workspace_id,
        operation: "calls.create.ivr",
      },
    );

    const inserted = await insertCallForWorkspace(input.workspace_id, {
      sid: call.sid,
      to: input.contact.phone,
      from: input.contact.caller_id,
      campaign_id: input.campaign_id,
      contact_id: input.contact.contact_id,
      outreach_attempt_id: Number(outreachAttemptId),
    });

    if (!inserted) {
      return { success: false, error: "Failed to insert call row" };
    }

    await dequeueCampaignQueueById({
      queueId: input.contact.id,
      userId: input.user_id,
      reason: "IVR call completed",
    });

    return { success: true, callSid: call.sid };
  } catch (error) {
    const message = twilioErrorUserMessage(error);
    if (message.toLowerCase().includes("credit")) {
      return { success: false, creditsError: true };
    }
    logger.error("initiateIvrCall Twilio error", error);
    return { success: false, error: message };
  }
}
