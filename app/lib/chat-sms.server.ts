import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
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

export const sendMessage = async ({
  body,
  to,
  from,
  media,
  supabase,
  workspace,
  contact_id,
  user,
  portalConfig,
  messageIntent,
  messagingServiceSid,
}: {
  body: string;
  to: string;
  from: string;
  media: string;
  supabase: SupabaseClient<Database>;
  workspace: string;
  contact_id: string;
  user: { id: string } | null;
  portalConfig?: WorkspaceTwilioOpsConfig;
  messageIntent?: TwilioMessageIntent | null;
  messagingServiceSid?: string | null;
}) => {
  const mediaData = media && JSON.parse(media);
  const resolvedPortalConfig =
    portalConfig ??
    (await getWorkspaceTwilioPortalConfig({
      supabaseClient: supabase,
      workspaceId: workspace,
    }));
  await assertWorkspaceCanSendSms({ supabaseClient: supabase, workspaceId: workspace });

  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id: workspace,
  });
  const statusCallback = `${env.BASE_URL()}/api/sms/status`;

  try {
    const processedBody = body;

    const { message, result } = await sendSmsAndPersist({
      twilio,
      supabase,
      createParams: buildTwilioOutboundSmsCreateParams({
        body: processedBody,
        to,
        from,
        media: mediaData && mediaData.length > 0 ? [...mediaData] : [],
        statusCallback,
        portalConfig: resolvedPortalConfig,
        explicitMessagingServiceSid: messagingServiceSid,
        messageIntent,
      }),
      retryOptions: { workspaceId: workspace, operation: "messages.create.chat" },
      persistExtras: {
        workspace,
        ...(contact_id && { contact_id }),
        ...(mediaData && mediaData.length > 0 && { outbound_media: [...mediaData] }),
      },
    });

    const { data, error } = result;

    if (error) throw { "message_entry_error:": error };

    const webhookResult = await sendWorkspaceWebhookNotification({
      supabaseClient: supabase,
      workspaceId: workspace,
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
    throw new Error("Failed to send message");
  }
};
