// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Twilio from "npm:twilio@^5.3.0";

interface TwilioStatusEvent {
  SmsSid?: string;
  SmsStatus?: string;
  MessageStatus?: string;
}

const cancelQueuedMessages = async (supabase: SupabaseClient) => {
  const { data: queuedMessages, error: queueError } = await supabase
    .from("campaign_queue")
    .select("id")
    .eq("status", "queued");

  if (queueError) {
    console.error("Error fetching queued messages:", queueError);
    return;
  }

  if (queuedMessages?.length) {
    const { error: updateError } = await supabase
      .from("campaign_queue")
      .update({ status: "cancelled" })
      .eq("status", "queued");

    if (updateError) {
      console.error("Error cancelling queued messages:", updateError);
    }
  }
};

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const formData = await req.formData();
    const payload: TwilioStatusEvent = Object.fromEntries(formData.entries());
    const { SmsSid: sid, SmsStatus: smsStatus, MessageStatus: messageStatus } = payload;
    
    // Use either SmsStatus or MessageStatus depending on what Twilio sends
    const status = smsStatus || messageStatus;

    if (!sid || !status) {
      throw new Error("Missing required parameters");
    }

    // Update message status
    const { data: messageData, error: messageError } = await supabase
      .from("message")
      .update({ status })
      .eq("sid", sid)
      .select("*, outreach_attempt(workspace)")
      .single();

    if (messageError) {
      throw new Error(`Failed to update message: ${messageError.message}`);
    }

    // Debit credits when message is delivered
    if (status === 'delivered' && messageData?.outreach_attempt?.workspace) {
      const { error: transactionError } = await supabase
        .from('transaction_history')
        .insert({
          workspace: messageData.outreach_attempt.workspace,
          type: "DEBIT",
          amount: -1,
          note: `SMS ${sid} delivered`
        });

      if (transactionError) {
        console.error('Failed to create transaction:', transactionError);
      }
    }

    // Update outreach attempt if it exists
    if (messageData?.outreach_attempt_id) {
      const { data: outreachData, error: outreachError } = await supabase
        .from("outreach_attempt")
        .update({ disposition: status })
        .eq("id", messageData.outreach_attempt_id)
        .select(`*, campaign(end_date)`)
        .single();

      if (outreachError) {
        console.error("Error updating outreach attempt:", outreachError);
      } else if (outreachData?.campaign?.end_date) {
        // Check if campaign has ended
        const now = new Date();
        const endDate = new Date(outreachData.campaign.end_date);
        
        if (now > endDate) {
          await cancelQueuedMessages(supabase);
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
});
