
import type { Database } from "@/lib/db-types";
import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalConfig,
} from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { buildTwilioOutboundSmsCreateParams } from "@/lib/twilio-outbound-sms.server";
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from "@/lib/types";
import { assertWorkspaceCanSendSms } from "@/lib/twilio-readiness.server";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { sendSmsAndPersist } from "@/lib/sms-send.server";
import { presentTwilioError } from "@/lib/twilio-errors";
import {
  resolveTwilioSmsMessagingServiceSid,
  validateScheduledSendAt,
  ScheduleValidationError,
} from "@/lib/sms-send-resolve";
import { updateMessageBySid } from "@/lib/message-db.server";

export const sendMessage = async ({
  body,
  to,
  from,
  media,
    workspace,
  contact_id,
  user,
  portalConfig,
  messageIntent,
  messagingServiceSid,
  sendAt,
}: {
  body: string;
  to: string;
  from: string;
  media: string;
  workspace: string;
  contact_id: string;
  user: { id: string } | null;
  portalConfig?: WorkspaceTwilioOpsConfig;
  messageIntent?: TwilioMessageIntent | null;
  messagingServiceSid?: string | null;
  /** "Send later" — ISO string, must be 15min-35days from now and requires a Messaging Service sender. */
  sendAt?: string | null;
}) => {
  const mediaData = media && JSON.parse(media);
  const resolvedPortalConfig =
    portalConfig ??
    (await getWorkspaceTwilioPortalConfig({workspaceId: workspace,
    }));

  // Validate scheduling up front (outside the Twilio try/catch below) so a
  // bad/out-of-window sendAt surfaces its own clear message instead of being
  // rewritten by presentTwilioError's generic fallback.
  let schedule: { scheduleType: "fixed"; sendAt: Date } | undefined;
  if (sendAt) {
    const resolvedMessagingServiceSid = resolveTwilioSmsMessagingServiceSid({
      explicitRequestSid: messagingServiceSid ?? null,
      campaignSmsSendMode: undefined,
      campaignSmsMessagingServiceSid: undefined,
      portalConfig: resolvedPortalConfig,
    });
    if (!resolvedMessagingServiceSid) {
      throw new ScheduleValidationError(
        "Scheduling requires a Messaging Service — complete messaging onboarding.",
      );
    }
    const validatedDate = validateScheduledSendAt(sendAt);
    schedule = { scheduleType: "fixed", sendAt: validatedDate };
  }

  await assertWorkspaceCanSendSms({workspaceId: workspace });

  const twilio = await createWorkspaceTwilioInstance({
        workspace_id: workspace,
  });
  const statusCallback = `${env.BASE_URL()}/api/sms/status`;

  try {
    const processedBody = body;

    const { message, result } = await sendSmsAndPersist({
      twilio,
      createParams: buildTwilioOutboundSmsCreateParams({
        body: processedBody,
        to,
        from,
        media: mediaData && mediaData.length > 0 ? [...mediaData] : [],
        statusCallback,
        portalConfig: resolvedPortalConfig,
        explicitMessagingServiceSid: messagingServiceSid,
        messageIntent,
        schedule,
      }),
      retryOptions: { workspaceId: workspace, operation: "messages.create.chat" },
      persistExtras: {
        workspace,
        ...(contact_id && { contact_id }),
        ...(mediaData && mediaData.length > 0 && { outbound_media: [...mediaData] }),
        ...(schedule && { scheduled_at: schedule.sendAt.toISOString() }),
      },
    });

    const { data, error } = result;

    if (error) throw { "message_entry_error:": error };

    const webhookResult = await sendWorkspaceWebhookNotification({workspaceId: workspace,
      eventCategory: "outbound_sms",
      eventType: "INSERT",
      payload: { type: "outbound_sms", record: message, old_record: null },
      optional: true,
    });
    if (!webhookResult.success) {
      logger.error("Outbound SMS webhook delivery failed", webhookResult.error);
    }

    return { message, data };
  } catch (error) {
    logger.error("Error sending message:", error);
    const presented = presentTwilioError(error);
    throw new Error(presented.userMessage);
  }
};

/**
 * Cancel a previously scheduled outbound SMS via the workspace Twilio
 * subaccount and reflect the cancellation on the persisted message row. The
 * `/api/sms/status` webhook will also confirm the "canceled" status once
 * Twilio processes the cancellation.
 */
export const cancelScheduledMessage = async ({
  sid,
  workspace,
}: {
  sid: string;
  workspace: string;
}) => {
  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspace });

  try {
    await twilio.messages(sid).update({ status: "canceled" });
  } catch (error) {
    logger.error("Error canceling scheduled message via Twilio:", error);
    const presented = presentTwilioError(error);
    throw new Error(presented.userMessage);
  }

  const message = await updateMessageBySid(workspace, sid, { status: "canceled" });
  return { message };
};
