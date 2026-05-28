import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalConfig,
} from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { processUrls } from "@/lib/sms.server";
import { buildTwilioOutboundSmsCreateParams } from "@/lib/twilio-outbound-sms.server";
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from "@/lib/types";
import { assertWorkspaceCanSendSms } from "@/lib/twilio-readiness.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";

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
  const statusCallback = `${env.SUPABASE_URL()}/functions/v1/sms-status`;

  try {
    const processedBody = await processUrls(body);

    const message = await withTwilioRetry(
      () =>
        twilio.messages.create(
          buildTwilioOutboundSmsCreateParams({
            body: processedBody,
            to,
            from,
            media: mediaData && mediaData.length > 0 ? [...mediaData] : [],
            statusCallback,
            portalConfig: resolvedPortalConfig,
            explicitMessagingServiceSid: messagingServiceSid,
            messageIntent,
          }),
        ),
      { workspaceId: workspace, operation: "messages.create.chat" },
    );

    const {
      sid,
      body: sentBody,
      numSegments: num_segments,
      direction,
      from: sentFrom,
      to: sentTo,
      dateUpdated: date_updated,
      price = 0,
      errorMessage: error_message,
      uri,
      accountSid: account_sid,
      numMedia: num_media,
      status,
      messagingServiceSid: messaging_service_sid,
      dateSent: date_sent,
      dateCreated: date_created,
      errorCode: error_code,
      priceUnit: price_unit,
      apiVersion: api_version,
      subresourceUris: subresource_uris,
    } = message;

    const { data, error } = await supabase
      .from("message")
      .insert({
        sid,
        body: sentBody,
        num_segments,
        direction,
        from: sentFrom,
        to: sentTo,
        date_updated,
        price: price || null,
        error_message,
        account_sid,
        uri,
        num_media,
        status,
        messaging_service_sid,
        date_sent,
        date_created,
        error_code,
        price_unit,
        api_version,
        subresource_uris,
        workspace,
        ...(contact_id && { contact_id }),
        ...(mediaData && mediaData.length > 0 && { outbound_media: [...mediaData] }),
      })
      .select();

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
