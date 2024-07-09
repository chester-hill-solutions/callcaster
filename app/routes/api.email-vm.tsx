import { createClient } from "@supabase/supabase-js";
import MailService from "@sendgrid/mail";
import { json } from "@remix-run/node";

export const action = async ({ request, params }) => {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const { data: call, error: callError } = await supabase
    .from("call")
    .update({recording_url:data.RecordingUrl})
    .eq("sid", data.CallSid)
    .select()
    .single();

  const { data: number, error: numberError } = await supabase
    .from("workspace_number")
    .select(
      `
      inbound_action,
      type,
      workspace,
      ...workspace!inner(twilio_data)`,
    )
    .eq("phone_number", call.to)
    .single();
  const action = number.inbound_action;
  MailService.setApiKey(process.env.SENDGRID_API_KEY!);

  const msg = {
    to: action,
    from: "info@callcaster.ca",
    subject: `A new voicemail from ${call.from}`,
    text: `A new voicemail has been recorded for you, you can listen at ${data.RecordingUrl}`,
    html: `<p>A new voicemail has been recorded for you, you can listen to it at <a href="${data.RecordingUrl}">this link</a>.`,
  };

  const result = await MailService.send(msg);
  return json(result);
};
