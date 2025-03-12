import { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { cancelQueuedMessages } from "~/lib/database.server";
import { Database } from "~/lib/database.types";
import { Campaign, OutreachAttempt } from "~/lib/types";

export const action: ActionFunction = async ({ request }) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const twilio = new Twilio.Twilio(
    process.env.TWILIO_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );

  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries());
    const { SmsSid: sid, SmsStatus: status } = payload;

    const { data: messageData, error: messageError } = await supabase
      .from("message")
      .update({ status: status as any })
      .eq("sid", sid as string)
      .select()
      .single();

    if (messageError) {
      console.error("Error updating message:", messageError);
      return json({ error: "Failed to update message" }, { status: 500 });
    }

    let outreachData:
      | (OutreachAttempt & { campaign: Partial<Campaign> })
      | null = null;
    if (messageData?.outreach_attempt_id) {
      const { data: outreachResult, error: outreachError } = await supabase
        .from("outreach_attempt")
        .update({ disposition: status as any })
        .eq("id", messageData.outreach_attempt_id)
        .select(`*, campaign(end_date)`)
        .single();

      if (outreachError) {
        console.error("Error updating outreach attempt:", outreachError);
      } else {
        outreachData = outreachResult;
      }
    }
    if (outreachData && outreachData.campaign?.end_date) {
      const now = new Date();
      if (outreachData.campaign?.end_date && now > new Date(outreachData.campaign.end_date)) {
        await cancelQueuedMessages(twilio as any, supabase)
      }
    }
    console.log(messageData);
    const { data: webhook, error: webhook_error } = await supabase
      .from('webhook')
      .select('*')
      .eq('workspace', messageData?.workspace as string)
      .filter('events', 'cs', '[{"category":"outbound_sms", "type":"UPDATE"}]');
    if (webhook_error) {
      console.error("Error fetching webhook:", webhook_error);
    } else {
      if (webhook && webhook.length > 0) {
        const webhook_data = webhook[0];
        if (webhook_data) {
          const webhook_response = await fetch(webhook_data.destination_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(webhook_data.custom_headers && typeof webhook_data.custom_headers === 'object' ?
                Object.entries(webhook_data.custom_headers).reduce((acc, [key, value]) => ({
                  ...acc,
                  [key]: String(value)
                }), {}) : {})
            },
            body: JSON.stringify({
              event_category: 'outbound_sms',
              event_type: 'UPDATE',
              workspace_id: messageData?.workspace as string,
              payload: {
                type: 'outbound_sms', record: {
                  message_sid: messageData?.sid,
                  from: messageData?.from,
                  to: messageData?.to,
                  body: messageData?.body,
                  num_media: messageData?.num_media,
                  status: messageData?.status,
                  date_updated: messageData?.date_updated,
                }, old_record: { message_sid: messageData.sid }
              }
            }),
          });
          if (!webhook_response.ok) {
            console.error(`Webhook request failed with status ${webhook_response.status}`);
            throw new Error(`Error with the webhook event: ${webhook_response.statusText}`);
          }
        }
      }
    }
    return json({ message: messageData, outreach: outreachData });
  } catch (error) {
    console.error("Unexpected error:", error);
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
};
