// @ts-nocheck
import { data as routeData, ActionFunction } from "react-router";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

import type { Database, Tables } from "@/lib/database.types";
import { Campaign, OutreachAttempt } from "@/lib/types";


import type { TwilioSmsStatusWebhook, TwilioSmsStatus, OutreachDisposition } from "@/lib/twilio.types";

import { shouldUpdateOutreachDisposition } from "@/lib/outreach-disposition";
import { isInboundMessageDirection } from "@/lib/chat-conversation-sort";
import { validateTwilioWebhookForMessageSid } from "@/lib/twilio-webhook.server";

export const action: ActionFunction = async ({ request }) => {
  const { env } = await import("@/lib/env.server");
  const { logger } = await import("@/lib/logger.server");
  const { sendWebhookNotification } = await import(
    "@/lib/workspace-settings/WorkspaceSettingUtils.server"
  );
  const { insertTransactionHistoryIdempotent } = await import(
    "@/lib/transaction-history.server"
  );
  const { cancelQueuedMessagesForCampaign } = await import("@/lib/database.server");

  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  // Main-account REST client for legacy SMS status side effects only; webhook auth uses workspace token.
  const twilio = new Twilio.Twilio(
    env.TWILIO_SID(),
    env.TWILIO_AUTH_TOKEN(),
  );

  try {
    const previewFormData = await request.formData();
    const previewPayload = Object.fromEntries(
      previewFormData.entries(),
    ) as Partial<TwilioSmsStatusWebhook>;
    const previewSid = previewPayload.SmsSid;

    if (!previewSid) {
      return routeData({ error: "Missing required fields: SmsSid or SmsStatus" }, { status: 400 });
    }

    const validation = await validateTwilioWebhookForMessageSid({
      request,
      supabase,
      smsSid: previewSid,
      params: previewPayload as Record<string, string>,
    });
    if (!validation.ok) {
      return validation.response;
    }

    const payload = validation.params as Partial<TwilioSmsStatusWebhook>;
    const { SmsSid: sid, SmsStatus: status } = payload;

    if (!sid || !status) {
      return routeData({ error: "Missing required fields: SmsSid or SmsStatus" }, { status: 400 });
    }

    const { data: preUpdateMessage, error: messageLookupError } = await supabase
      .from("message")
      .select("*")
      .eq("sid", sid)
      .single();

    if (messageLookupError || !preUpdateMessage) {
      throw new Error("Failed to find message workspace for SMS status webhook");
    }

    if (isInboundMessageDirection(preUpdateMessage.direction)) {
      return routeData({ message: preUpdateMessage, outreach: null });
    }

    // Validate status is a valid Twilio SMS status
    const validStatuses: TwilioSmsStatus[] = [
      "accepted", "scheduled", "canceled", "queued", "sending", "sent",
      "failed", "delivered", "undelivered", "receiving", "received", "read"
    ];
    const messageStatus = validStatuses.includes(status as TwilioSmsStatus) 
      ? (status as TwilioSmsStatus)
      : "failed"; // Default to failed if invalid

    const accountSidFromWebhook =
      typeof payload.AccountSid === "string" && payload.AccountSid.trim()
        ? payload.AccountSid.trim()
        : null;

    const { data: messageData, error: messageError } = await supabase
      .from("message")
      .update({
        status: messageStatus,
        ...(accountSidFromWebhook ? { account_sid: accountSidFromWebhook } : {}),
      })
      .eq("sid", sid)
      .select()
      .single();

    if (messageError) {
      logger.error("Error updating message:", messageError);
      return routeData({ error: "Failed to update message" }, { status: 500 });
    }

    // Debit billing for SMS (campaign, API/chat, or any outbound) when terminal status
    if (
      messageData?.workspace &&
      (messageStatus === "delivered" || messageStatus === "failed" || messageStatus === "undelivered")
    ) {
      try {
        await insertTransactionHistoryIdempotent({
          supabase,
          workspaceId: messageData.workspace,
          type: "DEBIT",
          amount: -1,
          note: `SMS ${sid} ${messageStatus}`,
          idempotencyKey: `sms:${sid}`,
        });
      } catch (transactionError) {
        logger.error("Failed to create SMS transaction:", transactionError);
      }
    }

    let outreachData:
      | (OutreachAttempt & { campaign: Partial<Campaign> })
      | null = null;
    if (messageData?.outreach_attempt_id) {
      // Use message status as disposition for SMS outreach attempts
      const disposition: OutreachDisposition = messageStatus;

      const { data: currentAttempt } = await supabase
        .from("outreach_attempt")
        .select("disposition")
        .eq("id", messageData.outreach_attempt_id)
        .single();
      const shouldSkip = !shouldUpdateOutreachDisposition({
        currentDisposition: currentAttempt?.disposition ?? null,
        nextDisposition: disposition,
      });

      const { data: outreachResult, error: outreachError } = shouldSkip
        ? ({ data: null, error: null } as any)
        : await supabase
            .from("outreach_attempt")
            .update({ disposition })
            .eq("id", messageData.outreach_attempt_id)
            .select(`*, campaign(end_date)`)
            .single();

      if (outreachError) {
        logger.error("Error updating outreach attempt:", outreachError);
      } else if (outreachResult) {
        // outreachResult doesn't include call property, so we cast it
        outreachData = outreachResult as OutreachAttempt & { campaign: Partial<Campaign> };
      }
    }
    if (outreachData && outreachData.campaign?.end_date) {
      const now = new Date();
      if (
        outreachData.campaign?.end_date &&
        now > new Date(outreachData.campaign.end_date) &&
        typeof messageData?.campaign_id === "number"
      ) {
        await cancelQueuedMessagesForCampaign(
          twilio,
          supabase,
          messageData.campaign_id,
        );
      }
    }
    logger.debug("Message status update", { messageData });
    
    // Send webhook notification if configured
    if (messageData?.workspace) {
      const { data: webhook, error: webhook_error } = await supabase
        .from('webhook')
        .select('*')
        .eq('workspace', messageData.workspace)
        .filter('events', 'cs', '[{"category":"outbound_sms", "type":"UPDATE"}]');
        
      if (webhook_error) {
        logger.error("Error fetching webhook:", webhook_error);
      } else if (webhook && webhook.length > 0) {
        const webhook_data = webhook[0];
        if (webhook_data?.destination_url) {
          const customHeaders: Record<string, string> = {};
          if (webhook_data.custom_headers && typeof webhook_data.custom_headers === 'object') {
            Object.entries(webhook_data.custom_headers).forEach(([key, value]) => {
              customHeaders[key] = String(value);
            });
          }
          
          const webhook_response = await fetch(webhook_data.destination_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...customHeaders
            },
            body: JSON.stringify({
              event_category: 'outbound_sms',
              event_type: 'UPDATE',
              workspace_id: messageData.workspace,
              payload: {
                type: 'outbound_sms',
                record: {
                  message_sid: messageData.sid,
                  from: messageData.from,
                  to: messageData.to,
                  body: messageData.body,
                  num_media: messageData.num_media,
                  status: messageData.status,
                  date_updated: messageData.date_updated,
                },
                old_record: { message_sid: messageData.sid }
              }
            }),
          });
          if (!webhook_response.ok) {
            logger.error(`Webhook request failed with status ${webhook_response.status}`);
            throw new Error(`Error with the webhook event: ${webhook_response.statusText}`);
          }
        }
      }
    }
    return routeData({ message: messageData, outreach: outreachData });
  } catch (error) {
    logger.error("Unexpected error:", error);
    return routeData({ error: "An unexpected error occurred" }, { status: 500 });
  }
};
