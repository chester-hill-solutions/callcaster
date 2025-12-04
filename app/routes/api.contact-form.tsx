import { Resend } from "resend";
import { json } from "@remix-run/node";

const resend = new Resend(process.env.RESEND_API_KEY);

export const action = async ({ request, params }: { request: Request, params: { id: string } }) => {
  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const result = await resend.emails.send({
      from: "info@callcaster.ca",
      to: ["info@callcaster.ca"],
      replyTo: data.email as string,
      subject: data.signup ? `A new request to Sign Up from ${data.email}` : `A new form submission from ${data.email}`,
      text: `From: ${data.name}, ${data.message}`,
      html: `<p>From: ${data.name}.</p><br/>${data.message}`,
    });

    return json({ success: true, message: "Email sent", result });
  } catch (error) {
    console.error('Error processing contact form:', error);
    return json({ error: 'Failed to process message' }, { status: 500 });
  }
};