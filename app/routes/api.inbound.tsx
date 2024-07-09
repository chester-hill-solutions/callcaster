import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

export const action = async ({ request, params }) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const { data: number, error: numberError } = await supabase
    .from("workspace_number")
    .select(
      `
      inbound_action,
      type,
      workspace,
      ...workspace!inner(twilio_data)`,
    )
    .eq("phone_number", data.Called)
    .single();

  const { data: call, error: callError } = await supabase
    .from("call")
    .insert({
      sid: data.CallSid,
      account_sid: data.AccountSid,
      to: data.To,
      from: data.From,
      status: "completed",
      start_time: new Date(),
      direction: data.Direction,
      api_version: data.ApiVersion,
      workspace: number.workspace,
    })
    .select();
  const phoneNumber = data.Called;
  twiml.say(
    `Thank you for calling ${phoneNumber}, we're unable to answer your call at the moment. Please leave us a message and we'll get back to you as soon as possible.`,
  );
  twiml.pause({ length: 1 });
  twiml.record({
    transcribe: true,
    timeout: 10,
    beep: true,
    recordingStatusCallback: "/api/email-vm",
  });
  return new Response(twiml.toString(), {
    headers: {
      "Content-Type": "text/xml",
    },
  });
};