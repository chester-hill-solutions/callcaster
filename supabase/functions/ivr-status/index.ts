import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import { validateRequest } from "npm:twilio@^5.3.0/lib/webhooks/webhooks.js";
import {
  billingUnitsFromDurationSeconds,
  canTransitionOutreachDisposition,
  checkWorkspaceCredits,
  getCallWithRetry,
  insertTransactionHistoryIdempotent,
} from "../_shared/ivr-status-logic.ts";

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

interface CallData {
  sid: string;
  workspace: string;
  outreach_attempt_id: number;
  campaign: {
    name: string;
  };
  [key: string]: unknown;
}

const log = (level: string, message: string, data = {}) => {
  console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
};

const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/';

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
  const updateData: Record<string, string | number> = { status };

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
  callData: CallData,
  CallDuration?: string,
  CallStatus?: string
) => {
  try {
    const { data: currentOutreach, error: fetchError } = await supabase
      .from("outreach_attempt")
      .select("disposition")
      .eq("id", callData.outreach_attempt_id)
      .single();

    if (fetchError) {
      log('error', 'Failed to fetch current disposition', {
        error: fetchError,
        outreach_attempt_id: callData.outreach_attempt_id
      });
      return;
    }

    const finalStates = ['voicemail', 'voicemail-no-message'];
    if (!finalStates.includes(String(currentOutreach.disposition ?? "").toLowerCase())) {
      let disposition = 'completed';
      if (CallStatus) {
        switch (CallStatus.toLowerCase()) {
          case 'no-answer':
          case 'busy':
          case 'failed':
          case 'canceled':
            disposition = CallStatus.toLowerCase();
            break;
          case 'completed':
            disposition = 'completed';
            break;
          default:
            disposition = 'failed';
        }
      }

      const currentDisposition = String(currentOutreach.disposition ?? "").toLowerCase();
      const nextDisposition = String(disposition ?? "").toLowerCase();
      if (canTransitionOutreachDisposition(currentDisposition, nextDisposition)) {
        // Update outreach attempt with final disposition
        const { error: dispositionError } = await supabase
          .from("outreach_attempt")
          .update({ disposition })
          .eq("id", callData.outreach_attempt_id);

        if (dispositionError) {
          log('error', 'Failed to update outreach attempt disposition', {
            error: dispositionError,
            outreach_attempt_id: callData.outreach_attempt_id
          });
        }
      }
    }

    // Deduct credits based on call duration
    if (CallDuration) {
      const durationSeconds = Number.parseInt(CallDuration, 10);
      const billingUnits = billingUnitsFromDurationSeconds(
        Number.isFinite(durationSeconds) ? durationSeconds : 0,
      );
      await insertTransactionHistoryIdempotent({
        supabase: supabase as any,
        workspaceId: callData.workspace,
        type: "DEBIT",
        amount: billingUnits,
        note: `IVR Call ${callData.sid}, Campaign ${callData.campaign.name}, Duration ${CallDuration}s`,
        idempotencyKey: `call:${callData.sid}`,
      });
    }

  } catch (error) {
    log('error', 'Error in handleCallCompletion', {
      error: error instanceof Error ? error.message : String(error),
      callSid: callData.sid
    });
  }
};

export async function handleRequest(req: Request): Promise<Response> {
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
    const callData = await getCallWithRetry(supabase as any, CallSid);
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
      const hasCredits = await checkWorkspaceCredits({
        supabase: supabase as any,
        workspaceId: callData.workspace,
        campaignId: callData.campaign_id,
        callSid: CallSid,
        twilioClient: twilioClient as any,
      });
      const {data, error} = await supabase.from("campaign").select('is_active').eq("id", callData.campaign_id).single();
      if (error) throw error;
      if (!data.is_active){
        console.log('Campaign inactive, shutting down call.');
      }
      if (!hasCredits || !data.is_active) {
        await twilioClient.calls(CallSid).update({status: "canceled"})
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
      await handleCallCompletion(supabase, callData, CallDuration, CallStatus);
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
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
