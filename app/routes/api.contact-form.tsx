import { createClient } from "@supabase/supabase-js";
import MailService from "@sendgrid/mail";
import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "~/lib/database.server";

/* export const action = async ({ request, params }) => {
  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    MailService.setApiKey(process.env.SENDGRID_API_KEY!);
    const msg = {
      to: 'info@callcaster.ca',
      from: "info@callcaster.ca",
      replyTo
      subject: `A new email from ${data.from}`,
      text: `A new `,
      html: `<p>A new voicemail has been recorded for you, you can listen to it at <a href="${signedUrl}">this link</a>.</p>`,
    };

    const result = await MailService.send(msg);
    return json({ success: true, message: "Voicemail processed and email sent", result });
  } catch (error) {
    console.error('Error processing voicemail:', error);
    return json({ error: 'Failed to process voicemail' }, { status: 500 });
  }
}; */