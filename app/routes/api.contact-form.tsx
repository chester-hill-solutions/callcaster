import { createClient } from "@supabase/supabase-js";
import MailService from "@sendgrid/mail";
import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "~/lib/database.server";

export const action = async ({ request, params }) => {
  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    MailService.setApiKey(process.env.SENDGRID_API_KEY!);
    const msg = {
      to: 'info@callcaster.ca',
      from: "info@callcaster.ca",
      reply_to: data.email,
      subject: `A new form submission from ${data.email}`,
      text: `From: ${data.name}, ${data.message}`,
      html: `<p>From: ${data.name}.</p><br/>${data.message}`,
    };

    const result = await MailService.send(msg);
    return json({ success: true, message: "Voicemail processed and email sent", result });
  } catch (error) {
    console.error('Error processing voicemail:', error);
    return json({ error: 'Failed to process voicemail' }, { status: 500 });
  }
};