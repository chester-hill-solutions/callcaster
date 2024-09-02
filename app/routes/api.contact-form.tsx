import MailService from "@sendgrid/mail";
import { json } from "@remix-run/node";

export const action = async ({ request, params }) => {
  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    MailService.setApiKey(process.env.SENDGRID_API_KEY!);
    const msg = {
      to: 'info@callcaster.ca',
      from: "info@callcaster.ca",
      reply_to: data.email,
      subject: data.signup ? `A new request to Sign Up from ${data.email}` : `A new form submission from ${data.email}`,
      text: `From: ${data.name}, ${data.message}`,
      html: `<p>From: ${data.name}.</p><br/>${data.message}`,
    };

    const result = await MailService.send(msg);
    return json({ success: true, message: "Email sent", result });
  } catch (error) {
    console.error('Error processing contact form:', error);
    return json({ error: 'Failed to process message' }, { status: 500 });
  }
};