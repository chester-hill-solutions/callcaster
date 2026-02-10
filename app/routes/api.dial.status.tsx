import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { validateTwilioWebhookParams } from "@/twilio.server";
import { ActionFunction, ActionFunctionArgs } from "@remix-run/node";
import { env } from "@/lib/env.server";

export const action: ActionFunction = async ({ request }: ActionFunctionArgs) => {
  const supabase = createClient(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSidValue = formData.get("CallSid");
  const answeredByValue = formData.get("AnsweredBy");
  const callStatusValue = formData.get("CallStatus");

  if (!callSidValue || typeof callSidValue !== "string") {
    return json({ success: false, error: "CallSid is required and must be a string" });
  }

  const callSid = callSidValue;
  const answeredBy = typeof answeredByValue === "string" ? answeredByValue : null;
  const callStatus = typeof callStatusValue === "string" ? callStatusValue : null;

  if (answeredBy && typeof answeredBy !== "string") {
    return json({ success: false, error: "AnsweredBy must be a string" });
  }
  if (callStatus && typeof callStatus !== "string") {
    return json({ success: false, error: "CallStatus must be a string" });
  }

  try {
    const { data: dbCall, error: callError } = await supabase
      .from("call")
      .select("campaign_id, outreach_attempt_id, workspace")
      .eq("sid", callSid)
      .single();
    if (callError) throw callError;
    if (!dbCall) {
      return json({ success: false, error: "Call not found" });
    }

    const workspace = await supabase.from("workspace").select("twilio_data").eq("id", dbCall.workspace).single();
    const authToken = workspace.data?.twilio_data?.authToken;
    if (!authToken) {
      return json({ success: false, error: "Workspace auth not found" }, { status: 500 });
    }
    const signature = request.headers.get("x-twilio-signature");
    const url = new URL(request.url).href;
    if (!validateTwilioWebhookParams(params, signature, url, authToken)) {
      return json({ error: "Invalid Twilio signature" }, { status: 403 });
    }

    const twilio = await createWorkspaceTwilioInstance({
      supabase,
      workspace_id: dbCall.workspace,
    });
    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .select("voicemail_file")
      .eq("id", dbCall.campaign_id)
      .single();
    if (campaignError) throw campaignError;
    if (!campaign) {
      return json({ success: false, error: "Campaign not found" });
    }

    const { data: voicemailData, error: voicemailError } = campaign.voicemail_file
      ? await supabase.storage
          .from(`workspaceAudio`)
          .createSignedUrl(`${dbCall.workspace}/${campaign.voicemail_file}`, 3600)
      : { data: null, error: null };
    if (voicemailError) throw voicemailError;

    const call = twilio.calls(callSid);

    if (
      answeredBy &&
      answeredBy.includes("machine") &&
      !answeredBy.includes("other") &&
      callStatus !== "completed"
    ) {
      try {
        if (voicemailData && voicemailData.signedUrl) {
          const { error: outreachError } = await supabase
            .from("outreach_attempt")
            .update({ disposition: "voicemail" })
            .eq("id", dbCall.outreach_attempt_id)
            .select();
          if (outreachError) throw outreachError;
          await call.update({
            twiml: `<Response><Pause length="5"/><Play>${voicemailData.signedUrl}</Play></Response>`,
          });
          return json({ success: true });
        } else {
          const { error: outreachError } = await supabase
            .from("outreach_attempt")
            .update({ disposition: "no-answer" })
            .eq("id", dbCall.outreach_attempt_id)
            .select();
          if (outreachError) throw outreachError;
          await call.update({
            twiml: `<Response><Hangup/></Response>`,
          });
          return json({ success: true });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to handle voicemail";
        return json({ success: false, error: errorMessage });
      }
    } else {
      const { data: callData, error: callUpsertError } = await supabase
        .from("call")
        .upsert({ sid: callSid, answered_by: answeredBy }, { onConflict: "sid" })
        .select();
      if (callUpsertError) throw callUpsertError;
      const { data: attempt, error: attemptError } = await supabase
        .from("outreach_attempt")
        .update({ answered_at: new Date() })
        .eq("id", dbCall.outreach_attempt_id)
        .select();
      if (attemptError) throw attemptError;
      return json({ success: true, data: callData, attempt });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return json({ success: false, error: errorMessage });
  }
};
