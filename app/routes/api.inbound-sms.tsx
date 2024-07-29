import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { Message } from "~/lib/types";

export const action = async ({ request, params }) => {
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
      workspace,
      ...workspace!inner(twilio_data)`,
    )
    .eq("phone_number", data.To)
    .single();
  if (number) {
    const messageData: Message = {
      sid: data.sid,
      account_sid: data.AccountSid,
      body: data.Body,
      from: data.From,
      to: data.To,
      num_media: data.NumMedia,
      num_segments: data.NumSegments,
      workspace: number.workspace,
      direction: "inbound",
      date_created: new Date(),
      date_sent: new Date(),
      subresource_uris: data.MediaContentType,
    };
    const { data: message, error: messageError } = await supabase
      .from("message")
      .insert(messageData)
      .select();
    if (messageError) {
      console.error(messageError);
      return json({messageError},400)
    }
    return json({ message }, 201);
  } else {
    return json({ error: "Number not found" }, 404);
  }
};
