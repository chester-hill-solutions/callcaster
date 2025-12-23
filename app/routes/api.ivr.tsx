import { createClient } from "@supabase/supabase-js";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }:ActionFunctionArgs) => {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_KEY'];
  const baseUrl = process.env['BASE_URL'];

  if (!supabaseUrl || !supabaseServiceKey || !baseUrl) {
    throw new Error("Missing required environment variables");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const formData = await request.formData();

  const to_number = formData.get("to_number") as string;
  const campaign_id = formData.get("campaign_id") as string;
  const workspace_id = formData.get("workspace_id") as string;
  const contact_id = formData.get("contact_id") as string;
  const caller_id = formData.get("caller_id") as string;
  const queue_id = formData.get("queue_id") as string;
  const user_id = formData.get("user_id") as string;
  if (!workspace_id || !campaign_id || !contact_id || !caller_id || !queue_id || !user_id) {
    throw new Error("Missing required form data");
  }
  let outreachAttemptId;
  let call;
  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id,
  });

  try {
    const { data, error: outreachError } = await supabase.rpc(
      "create_outreach_attempt",
      {
        con_id: contact_id,
        cam_id: campaign_id,
        wks_id: workspace_id,
        queue_id: queue_id,
        usr_id: user_id,
      },
    );

    if (outreachError) throw outreachError;
    outreachAttemptId = data;

    call = await twilio.calls.create({
      to: to_number,
      from: caller_id,
      url: `${baseUrl}/api/ivr/${campaign_id}/page_1/`,
      machineDetection: "Enable",
      statusCallbackEvent: ["answered", "completed"],
      statusCallback: `${baseUrl}/api/ivr/status`,
    });

    
    const { error: insertError } = await supabase.from("call").insert({
      sid: call.sid,
      to: to_number,
      from: caller_id,
      campaign_id,
      contact_id,
      workspace: workspace_id,
      outreach_attempt_id: outreachAttemptId,
    }).select();

    if (insertError) throw insertError;

    // Dequeue
    const { error: dequeueError } = await supabase
      .from("campaign_queue")
      .update({ 
        status: "dequeued",
        dequeued_at: new Date().toISOString(),
        dequeued_reason: "IVR call completed",
        dequeued_by: user_id, 
      })
      .eq("id", queue_id);
      
    if (dequeueError) throw dequeueError;

    return new Response(JSON.stringify({ success: true, callSid: call.sid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error processing IVR request:", error);
    return new Response(
      `Error processing IVR request: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
};
