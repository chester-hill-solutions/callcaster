import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalConfig,
} from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { processUrls } from "@/lib/sms.server";
import { resolveTwilioSmsMessagingServiceSid } from "@/lib/sms-send-resolve";
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from "@/lib/types";

function resolveSmsRequest({
  body,
  to,
  from,
  media,
  portalConfig,
  messagingServiceSid,
  messageIntent,
  statusCallback,
}: {
  body: string;
  to: string;
  from: string;
  media: string[];
  portalConfig: WorkspaceTwilioOpsConfig;
  messagingServiceSid?: string | null;
  messageIntent?: TwilioMessageIntent | null;
  statusCallback: string;
}) {
  const resolvedMessagingServiceSid = resolveTwilioSmsMessagingServiceSid({
    explicitRequestSid: messagingServiceSid ?? null,
    campaignSmsSendMode: null,
    campaignSmsMessagingServiceSid: null,
    portalConfig,
  });
  const resolvedMessageIntent = messageIntent ?? portalConfig.defaultMessageIntent;
  const effectiveFrom = String(from ?? "").trim();

  if (!resolvedMessagingServiceSid && !effectiveFrom) {
    throw new Error("Missing sender: caller_id or Messaging Service required");
  }

  return {
    body,
    to,
    statusCallback,
    ...(media.length > 0 && { mediaUrl: [...media] }),
    ...(resolvedMessagingServiceSid
      ? { messagingServiceSid: resolvedMessagingServiceSid }
      : { from: effectiveFrom }),
    ...(resolvedMessageIntent ? { messageIntent: resolvedMessageIntent } : {}),
  };
}

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
  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id: workspace,
  });
  const statusCallback = `${env.SUPABASE_URL()}/functions/v1/sms-status`;

  try {
    const processedBody = await processUrls(body);

    const message = await twilio.messages.create(
      resolveSmsRequest({
        body: processedBody,
        to,
        from,
        media: mediaData && mediaData.length > 0 ? [...mediaData] : [],
        portalConfig: resolvedPortalConfig,
        messagingServiceSid,
        messageIntent,
        statusCallback,
      }),
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
    const { data: webhook, error: webhook_error } = await supabase
      .from("webhook")
      .select("*")
      .eq("workspace", workspace)
      .filter("events", "cs", '[{"category":"outbound_sms"}]');
    if (webhook_error) {
      logger.error("Error fetching webhook:", webhook_error);
      throw { "webhook_error:": webhook_error };
    }
    if (webhook && webhook.length > 0) {
      const webhookData = webhook[0];
      if (webhookData) {
        const webhookResponse = await fetch(webhookData.destination_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(webhookData.custom_headers &&
            typeof webhookData.custom_headers === "object"
              ? Object.entries(webhookData.custom_headers).reduce(
                  (acc, [key, value]) => ({
                    ...acc,
                    [key]: String(value),
                  }),
                  {},
                )
              : {}),
          },
          body: JSON.stringify({
            event_category: "outbound_sms",
            event_type: "outbound_sms",
            workspace_id: workspace,
            timestamp: new Date().toISOString(),
            payload: { type: "outbound_sms", record: message, old_record: null },
          }),
        });
        if (!webhookResponse.ok) {
          logger.error(
            `Webhook request failed with status ${webhookResponse.status}`,
          );
          throw new Error(
            `Error with the webhook event: ${webhookResponse.statusText}`,
          );
        }
      }
    }
    return { message, data, webhook };
  } catch (error) {
    logger.error("Error sending message:", error);
    throw new Error("Failed to send message");
  }
};
