const { createClient } = require("@supabase/supabase-js");
const Twilio = require("twilio");

exports.handler = async function (context, event, callback) {
  const supabaseUrl = context.SUPABASE_URL;
  const supabaseServiceKey = context.SUPABASE_SERVICE_KEY;
  const baseUrl = 'https://ivr-2916.twil.io';

  if (!supabaseUrl || !supabaseServiceKey || !baseUrl) {
    throw new Error("Missing required environment variables");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {to_number, campaign_id, workspace_id, contact_id, caller_id, queue_id, user_id} = event;
  let outreachAttemptId;
  let call;
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  if (error) throw error;

  const twilio = new Twilio.Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );

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
      url: `${baseUrl}/flow`,
      machineDetection: "Enable",
      statusCallbackEvent: ["initiated", "answered", "completed"],
      statusCallback: `${baseUrl}/status`,
    });

    const { data: insertData, error: insertError } = await supabase.from("call").insert({
      sid: call.sid,
      to: to_number,
      from: caller_id,
      campaign_id,
      contact_id,
      workspace: workspace_id,
      outreach_attempt_id: outreachAttemptId,
      queue_id
    }).select();

    if (insertError || !insertData) throw insertError || new Error("Record not retrieved");
    callback(null, { success: true, callSid: call.sid })
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

    callback(error, null)
  }
};
