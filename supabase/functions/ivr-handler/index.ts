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
  retry_count?: number;
  msg_id?: string; // Added for queue message tracking
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

    if (workspaceError || !workspace) {
      return new Response(
        JSON.stringify({
          success: false,
          error: workspaceError?.message || "Workspace not found"
        }),
        { headers: { "Content-Type": "application/json" }, status: 404 }
      );
    }
    
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

    try {
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
          is_last: body.isLastContact,
          msg_id: body.msg_id // Track the queue message ID
        })
        .select()
        .single();
        
      if (insertError || !insertData) {
        throw insertError || new Error("Failed to create call record");
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          callSid: call.sid,
          outreachAttemptId,
          msg_id: body.msg_id 
        }),
        { headers: { "Content-Type": "application/json" } }
      );

    } catch (error) {
      // Clean up outreach attempt on failure
      if (outreachAttemptId) {
        await supabase
          .from("outreach_attempt")
          .update({ disposition: "failed" })
          .eq("id", outreachAttemptId);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Failed to create call",
          outreachAttemptId
        }),
        { headers: { "Content-Type": "application/json" }, status: 500 }
      );
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