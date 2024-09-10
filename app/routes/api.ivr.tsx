import { createClient } from "@supabase/supabase-js";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

export const action = async ({ request }) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const baseUrl = process.env.BASE_URL;

  if (!supabaseUrl || !supabaseServiceKey || !baseUrl) {
    throw new Error("Missing required environment variables");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const formData = await request.formData();

  const to_number = formData.get("to_number");
  const campaign_id = formData.get("campaign_id");
  const workspace_id = formData.get("workspace_id");
  const contact_id = formData.get("contact_id");
  const caller_id = formData.get("caller_id");
  const queue_id = formData.get("queue_id");
  const user_id = formData.get("user_id");

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

    
    const {data: insertData, error: insertError } = await supabase.from("call").insert({
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
      .update({ status: "dequeued" })
      .eq("id", queue_id);
      
    if (dequeueError) throw dequeueError;

    return new Response(JSON.stringify({ success: true, callSid: call.sid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing call:", error);

    if (outreachAttemptId) {
      const { error: outreachUpdateError } = await supabase
        .from("outreach_attempt")
        .update({ disposition: "failed" })
        .eq("id", outreachAttemptId);
      if (outreachUpdateError) throw outreachUpdateError;
    }
    if (call && call.sid) {
      try {
        await twilio.calls(call.sid).update({ status: "canceled" });
      } catch (cancelError) {
        console.error("Error canceling Twilio call:", cancelError);
      }
    }

    return new Response(
      JSON.stringify({
        error: "There was an error processing your call.",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
