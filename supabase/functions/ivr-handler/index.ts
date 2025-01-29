import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";

const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1';

interface RequestBody {
  to_number: string;
  campaign_id: string;
  workspace_id: string;
  contact_id: string;
  caller_id: string;
  queue_id?: string;
  user_id?: string;
  index?: number;
  total?: number;
  isLastContact?: boolean;
  type: string;
}

const functionHeaders = {
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
  "Content-Type": "application/json"
};

async function getTwilioData(supabase, workspace_id) {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspace_id)
    .single();
  if (workspaceError || !workspace) {
    return new Response(
      JSON.stringify({
        success: false,
        error: workspaceError?.message || "Workspace not found"
      }),
      { headers: { "Content-Type": "application/json" }, status: 404 }
    );
  }
  return workspace.twilio_data
}

async function createOutreachAttempt(supabase, body) {
  const { data: outreachAttemptId, error: outreachError } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: body.contact_id,
      cam_id: body.campaign_id,
      wks_id: body.workspace_id,
      queue_id: body.queue_id,
      usr_id: body.user_id,
    }
  );

  if (outreachError) {
    return new Response(
      JSON.stringify({
        success: false,
        error: outreachError.message,
        outreachAttemptId: null
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
  return outreachAttemptId;
}

async function processNextCall(body, campaign_id) {
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    await fetch(
      `${baseUrl}/queue-next`,
      {
        method: 'POST',
        headers: functionHeaders,
        body: JSON.stringify({
          user_id: body.user_id,
          campaign_id: body.campaign_id,
        })
      }
    );

  } catch (error) {
    console.error(`Error initiating next call for campaign ${campaign_id}:`, {
      error: error.message,
    });

  }
}

Deno.serve(async (req) => {
  try {
    const body: RequestBody = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const outreach_attempt_id = await createOutreachAttempt(supabase, body);
    const twilio_data = await getTwilioData(supabase, body.workspace_id);
    try {

      const twilio = new Twilio(twilio_data.sid, twilio_data.authToken);

      const call = await twilio.calls.create({
        to: body.to_number,
        from: body.caller_id,
        url: `${baseUrl}/ivr-flow`,
        machineDetection: "DetectMessageEnd",
        machineDetectionSpeechThreshold: 1900,
        machineDetectionSpeechEndThreshold: 1200,
        statusCallbackEvent: ["initiated", "answered", "completed"],
        statusCallback: `${baseUrl}/ivr-status`,
      }).catch((callError: any) => {
        console.error('Error placing call to Twilio');
        console.error(callError);
        void processNextCall(supabase, body);
        throw callError
      });

      const { error: insertError } = await supabase
        .from("call")
        .insert({
          sid: call.sid,
          to: body.to_number,
          from: body.caller_id,
          campaign_id: body.campaign_id,
          contact_id: body.contact_id,
          workspace: body.workspace_id,
          outreach_attempt_id: outreach_attempt_id,
          queue_id: body.queue_id,
          is_last: body.isLastContact,
        })

      if (insertError) {
        throw insertError || new Error("Failed to create call record");
      }

    } catch (error) {

      if (outreach_attempt_id) {
        await supabase
          .from("outreach_attempt")
          .update({
            disposition: "failed",
          })
          .eq("id", outreach_attempt_id);
      }
    }

  } catch (error) {
    console.error("Error processing call:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});