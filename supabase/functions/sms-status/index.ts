// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio, { validateRequest } from "npm:twilio@^5.3.0";

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

    // Get message data to find the workspace
    const { data: messageData, error: messageError } = await supabase
      .from("message")
      .select("*, outreach_attempt(workspace)")
      .eq("sid", sid)
      .single();

    if (messageError || !messageData?.outreach_attempt?.workspace) {
      throw new Error(`Failed to get message data: ${messageError?.message || 'No workspace found'}`);
    }

    // Get workspace data to get Twilio auth token
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspace")
      .select("twilio_data")
      .eq("id", messageData.outreach_attempt.workspace)
      .single();

    if (workspaceError || !workspace?.twilio_data?.authToken) {
      throw new Error(`Failed to get workspace data: ${workspaceError?.message || 'No auth token found'}`);
    }

    // Validate the request is from Twilio
    const twilioSignature = req.headers.get('x-twilio-signature');
    const url = `https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/sms-status`;
    const isValidRequest = validateRequest(
      workspace.twilio_data.authToken,
      twilioSignature || '',
      url,
      Object.fromEntries(formData)
    );

    if (!isValidRequest) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    // Update message status
    const { error: updateError } = await supabase
      .from("message")
      .update({ status })
      .eq("sid", sid);

    if (updateError) {
      throw new Error(`Failed to update message: ${updateError.message}`);
    }

    // Debit credits when message is delivered
    if ((status === 'delivered' || status === 'failed' || status === 'undelivered') && messageData?.outreach_attempt?.workspace) {
      const { error: transactionError } = await supabase
        .from('transaction_history')
        .insert({
          workspace: messageData.outreach_attempt.workspace,
          type: "DEBIT",
          amount: -1,
          note: `SMS ${sid} ${status}`
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
