import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";

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
}

const baseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
const functionHeaders = {
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
  "Content-Type": "application/json"
};

Deno.serve(async (req) => {
  try {
    // Parse request body
    const body: RequestBody = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Get workspace Twilio credentials
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspace")
      .select("twilio_data")
      .eq("id", body.workspace_id)
      .single();

    if (workspaceError || !workspace) throw workspaceError || new Error("Workspace not found");
    
    // Create outreach attempt
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

    if (outreachError) throw outreachError;

    // Initialize Twilio client with workspace credentials
    const twilio = new Twilio(
      workspace.twilio_data.sid,
      workspace.twilio_data.authToken
    );

    // Create call
    const call = await twilio.calls.create({
      to: body.to_number,
      from: body.caller_id,
      url: `${baseUrl}/ivr-flow`,
      machineDetection: "DetectMessageEnd",
      machineDetectionSpeechThreshold: 1900,
      machineDetectionSpeechEndThreshold: 1200,
      statusCallbackEvent: ["initiated", "answered", "completed"],
      statusCallback: `${baseUrl}/ivr-status`,
    });

    // Insert call record
    const { data: insertData, error: insertError } = await supabase
      .from("call")
      .insert({
        sid: call.sid,
        to: body.to_number,
        from: body.caller_id,
        campaign_id: body.campaign_id,
        contact_id: body.contact_id,
        workspace: body.workspace_id,
        outreach_attempt_id: outreachAttemptId,
        queue_id: body.queue_id,
        is_last: body.isLastContact
      })
      .select()
      .single();
      
    if (insertError || !insertData) {
      throw insertError || new Error("Failed to create call record");
    }

    return new Response(
      JSON.stringify({ success: true, callSid: call.sid }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing call:", error);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Handle cleanup if needed
    if (error.outreachAttemptId) {
      await supabase
        .from("outreach_attempt")
        .update({ disposition: "failed" })
        .eq("id", error.outreachAttemptId);
    }

    if (error.callSid) {
      try {
        const workspace = await supabase
          .from("workspace")
          .select("twilio_data")
          .eq("id", body.workspace_id)
          .single();

        if (workspace.data) {
          const twilio = new Twilio(
            workspace.data.twilio_data.sid,
            workspace.data.twilio_data.authToken
          );
          await twilio.calls(error.callSid).update({ status: "canceled" });
        }
      } catch (cancelError) {
        console.error("Error canceling Twilio call:", cancelError);
      }
    }

    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        success: false
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});