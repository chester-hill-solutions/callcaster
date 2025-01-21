import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import { validateRequest } from "npm:twilio@^5.3.0/lib/webhooks/webhooks.js";
import { SupabaseClient } from "@supabase/supabase-js";

interface TwilioEventData {
  CallSid?: string;
  CallStatus?: string;
  RecordingUrl?: string;
  RecordingStatus?: string;
  CallDuration?: string;
  Timestamp?: string;
}

interface WorkspaceData {
  id: string;
  twilio_data: {
    sid: string;
    authToken: string;
  };
}

const log = (level: string, message: string, data = {}) => {
  console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
};

const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/';

const getCallWithRetry = async (supabase: SupabaseClient, callSid: string, retries = 0) => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 200;

  const { data, error } = await supabase
    .from("call")
    .select('*, outreach_attempt(id, result, current_step), campaign(*,ivr_campaign(*, script(*)))')
    .eq("sid", callSid)
    .single();

  if (error || !data) {
    log('warn', `Failed to retrieve call data`, { callSid, error, retryAttempt: retries });
    if (retries < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return getCallWithRetry(supabase, callSid, retries + 1);
    }
    throw new Error("Failed to retrieve call after multiple attempts");
  }
  return data;
};

const getWorkspaceData = async (supabase: SupabaseClient, workspace_id: string): Promise<WorkspaceData> => {
  const { data, error } = await supabase
    .from("workspace")
    .select("id, twilio_data")
    .eq("id", workspace_id)
    .single();
    
  if (error || !data) {
    throw new Error("Failed to retrieve workspace data");
  }
  
  return data;
};

const updateCallStatus = async (
  supabase: SupabaseClient,
  callSid: string,
  status: string,
  duration?: string
) => {
  const updateData: Record<string, any> = { status };
  
  if (duration) {
    updateData.duration = parseInt(duration);
  }

  const { error } = await supabase
    .from("call")
    .update(updateData)
    .eq("sid", callSid);

  if (error) {
    log('error', 'Failed to update call status', { error, callSid, status });
    throw error;
  }
};

const handleCallCompletion = async (
  supabase: SupabaseClient,
  callData: any,
  CallDuration?: string
) => {
  try {
    // Check if this is the last call in a campaign
    if (callData.is_last) {
      const { error: campaignError } = await supabase
        .from("campaign")
        .update({ status: 'complete' })
        .eq("id", callData.campaign_id);

      if (campaignError) {
        log('error', 'Failed to update campaign status', { 
          error: campaignError,
          campaign_id: callData.campaign_id 
        });
      }
    }

    // Deduct credits based on call duration
    if (CallDuration) {
      const { error: transactionError } = await supabase
        .from('transaction_history')
        .insert({
          workspace: callData.workspace,
          type: "DEBIT",
          amount: -(Math.floor(parseInt(CallDuration) / 60) + 1),
          note: `IVR Call ${callData.sid}, Campaign ${callData.campaign.name}, Duration ${CallDuration}s`
        });

      if (transactionError) {
        log('error', 'Failed to create transaction', { 
          error: transactionError,
          workspace: callData.workspace
        });
      }
    }

    // Dequeue the contact
    const { error: dequeueError } = await supabase.rpc('dequeue_contact', {
      passed_contact_id: callData.contact_id,
      group_on_household: false
    });

    if (dequeueError) {
      log('error', 'Failed to dequeue contact', {
        error: dequeueError,
        contact_id: callData.contact_id
      });
    }
  } catch (error) {
    log('error', 'Error in handleCallCompletion', {
      error: error instanceof Error ? error.message : String(error),
      callSid: callData.sid
    });
  }
};

const checkWorkspaceCredits = async (
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string,
  callSid: string,
  twilioClient: any
): Promise<boolean> => {
  const { data: workspaceCredits, error: workspaceCreditsError } = await supabase
    .from('workspace')
    .select('credits')
    .eq('id', workspaceId)
    .single();

  if (workspaceCreditsError) {
    log('error', 'Failed to check workspace credits', { workspaceCreditsError });
    return true; // Allow call to proceed if we can't check credits
  }

  if (workspaceCredits.credits <= 0) {
    // Update campaign status
    const { error: updateError } = await supabase
      .from("campaign")
      .update({ is_active: false })
      .eq("id", campaignId);

    if (updateError) {
      log('error', 'Failed to update campaign status', { updateError });
    }

    // Cancel the call
    try {
      await twilioClient.calls(callSid).update({ status: "canceled" });
    } catch (error) {
      log('error', 'Failed to cancel call', { error });
    }

    return false;
  }

  return true;
};

Deno.serve(async (req) => {
  try {
    // Get request details for validation
    const publicUrl = `https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/ivr-status`;
        
    const twilioSignature = req.headers.get('x-twilio-signature');
    
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());
        
    const event: TwilioEventData = params;
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { CallSid, CallStatus, CallDuration, Timestamp } = event;
    
    if (!CallSid || !CallStatus) {
      throw new Error("Missing required parameters");
    }

    // Get call data
    const callData = await getCallWithRetry(supabase, CallSid);
    if (!callData) {
      throw new Error("Call not found");
    }

    // Get workspace data and validate request
    const workspace = await getWorkspaceData(supabase, callData.workspace);
    
    const isValidRequest = validateRequest(
      workspace.twilio_data.authToken,
      twilioSignature || '',
      publicUrl,
      params
    );

    if (!isValidRequest) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    // Check credits if call is being initiated
    if (CallStatus === 'initiated') {
      const twilioClient = new Twilio(workspace.twilio_data.sid, workspace.twilio_data.authToken);
      const hasCredits = await checkWorkspaceCredits(
        supabase,
        callData.workspace,
        callData.campaign_id,
        CallSid,
        twilioClient
      );

      if (!hasCredits) {
        return new Response(
          JSON.stringify({ error: 'Insufficient credits', success: false }),
          { headers: { "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // Update call status
    await updateCallStatus(
      supabase,
      CallSid,
      CallStatus,
      CallDuration
    );

    // Handle call completion tasks if needed
    if (CallStatus === 'completed') {
      await handleCallCompletion(supabase, callData, CallDuration);
    }

    // Create TwiML response
    const { VoiceResponse } = Twilio.twiml;
    const response = new VoiceResponse();

    // Always redirect back to flow
    response.redirect(`${baseUrl}/ivr-flow`);
    
    return new Response(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });

  } catch (error) {
    // Use default TwiML response for errors
    log('error', 'Status handler error', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    const { VoiceResponse } = Twilio.twiml;
    const errorResponse = new VoiceResponse();
    errorResponse.say('An error occurred. Please try again later.');
    
    return new Response(errorResponse.toString(), {
      headers: { "Content-Type": "text/xml" },
      status: 500
    });
  }
});
