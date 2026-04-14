// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import { getFunctionUrl } from "../_shared/getFunctionsBaseUrl.ts";
import {
  cancelQueuedMessages,
  normalizeTwilioSmsStatus,
  pickRawTwilioSmsStatus,
  sendOutboundSmsWebhookIfConfigured,
  shouldUpdateOutreachDisposition,
} from "../_shared/sms-status-logic.ts";
import { insertTransactionHistoryIdempotent } from "../_shared/ivr-status-logic.ts";
import { readTwilioWorkspaceCredentials } from "../_shared/twilio-workspace-credentials.ts";

interface TwilioStatusEvent {
  SmsSid?: string;
  SmsStatus?: string;
  MessageStatus?: string;
  AccountSid?: string;
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const formData = await req.formData();
    const payload: TwilioStatusEvent = Object.fromEntries(formData.entries());
    const {
      SmsSid: sid,
      SmsStatus: smsStatus,
      MessageStatus: messageStatus,
      AccountSid: accountSidRaw,
    } = payload;
    const accountSidFromWebhook =
      typeof accountSidRaw === "string" && accountSidRaw.trim()
        ? accountSidRaw.trim()
        : null;
    
    // Use either SmsStatus or MessageStatus depending on what Twilio sends
    const rawStatus = pickRawTwilioSmsStatus({ SmsStatus: smsStatus, MessageStatus: messageStatus });

    if (!sid || !rawStatus) {
      throw new Error("Missing required parameters");
    }
    const status = normalizeTwilioSmsStatus(rawStatus);

    // Get message data to find the workspace (campaign has outreach_attempt; API/chat has workspace on message)
    const { data: messageData, error: messageError } = await supabase
      .from("message")
      .select("*, outreach_attempt(workspace)")
      .eq("sid", sid)
      .single();

    if (messageError || !messageData) {
      throw new Error(`Failed to get message data: ${messageError?.message || 'Message not found'}`);
    }

    const workspaceId = messageData.outreach_attempt?.workspace ?? messageData.workspace;
    if (!workspaceId) {
      throw new Error("No workspace found for message");
    }

    // Get workspace data to get Twilio auth token
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspace")
      .select("twilio_data")
      .eq("id", workspaceId)
      .single();

    const creds = readTwilioWorkspaceCredentials(workspace?.twilio_data);
    if (workspaceError || !creds) {
      throw new Error(`Failed to get workspace data: ${workspaceError?.message || 'No auth token found'}`);
    }

    // Validate the request is from Twilio
    const twilioSignature = req.headers.get('x-twilio-signature');
    const url = getFunctionUrl("sms-status");
    const isValidRequest = Twilio.validateRequest(
      creds.authToken,
      twilioSignature || '',
      url,
      Object.fromEntries(formData)
    );

    if (!isValidRequest) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    // Update message status (persist AccountSid for twilio-open-sync / multi-tenant)
    const { error: updateError } = await supabase
      .from("message")
      .update({
        status,
        ...(accountSidFromWebhook ? { account_sid: accountSidFromWebhook } : {}),
      })
      .eq("sid", sid);

    if (updateError) {
      throw new Error(`Failed to update message: ${updateError.message}`);
    }

    // Debit credits when message is delivered (campaign and API-based SMS)
    if ((status === 'delivered' || status === 'failed' || status === 'undelivered') && workspaceId) {
      await insertTransactionHistoryIdempotent({
        supabase: supabase as any,
        workspaceId,
        type: "DEBIT",
        amount: -1,
        note: `SMS ${sid} ${status}`,
        idempotencyKey: `sms:${sid}`,
      });
    }

    // Notify outbound_sms webhook subscribers (parity with Remix handler).
    await sendOutboundSmsWebhookIfConfigured({
      supabase: supabase as any,
      workspaceId,
      message: {
        sid,
        from: (messageData as any)?.from,
        to: (messageData as any)?.to,
        body: (messageData as any)?.body,
        num_media: (messageData as any)?.num_media,
        status,
        date_updated: (messageData as any)?.date_updated,
      },
    });

    // Update outreach attempt if it exists
    if (messageData?.outreach_attempt_id) {
      const { data: currentAttempt } = await supabase
        .from("outreach_attempt")
        .select("disposition")
        .eq("id", messageData.outreach_attempt_id)
        .single();

      let outreachData = null;
      let outreachError = null;
      if (
        shouldUpdateOutreachDisposition({
          currentDisposition: currentAttempt?.disposition ?? null,
          nextDisposition: status,
        })
      ) {
        const res = await supabase
          .from("outreach_attempt")
          .update({ disposition: status })
          .eq("id", messageData.outreach_attempt_id)
          .select(`*, campaign(end_date)`)
          .single();
        outreachData = res.data as any;
        outreachError = res.error as any;
      } else {
        // Do not overwrite a terminal disposition with an intermediate update.
        outreachData = currentAttempt as any;
      }

      if (outreachError) {
        console.error("Error updating outreach attempt:", outreachError);
      } else if (outreachData?.campaign?.end_date) {
        // Check if campaign has ended
        const now = new Date();
        const endDate = new Date(outreachData.campaign.end_date);
        
        if (now > endDate) {
          const campaignId = outreachData?.campaign_id ?? (messageData as any)?.campaign_id;
          if (campaignId) {
            await cancelQueuedMessages({
              supabase: supabase as any,
              campaignId,
            });
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          message: messageData, 
          outreach: outreachData 
        }), 
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: messageData }), 
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in SMS status handler:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), 
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
