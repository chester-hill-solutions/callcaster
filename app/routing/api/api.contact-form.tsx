import { Resend } from "resend";
import { json } from "@remix-run/node";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";

const resend = new Resend(env.RESEND_API_KEY());

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

export const action = async ({ request, params }: { request: Request, params: { id: string } }) => {
  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData) as Record<string, unknown>;

    const email = String(data.email ?? "").trim();
    const name = String(data.name ?? "").trim();
    const message = String(data.message ?? "").trim();

    if (!email) {
      return json({ error: "Email is required" }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(email)) {
      return json({ error: "Invalid email format" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return json({ error: "Name is too long" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: "Message is too long" }, { status: 400 });
    }

    const result = await resend.emails.send({
      from: "info@callcaster.ca",
      to: ["info@callcaster.ca"],
      replyTo: email,
      subject: data.signup ? `A new request to Sign Up from ${email}` : `A new form submission from ${email}`,
      text: `From: ${name}, ${message}`,
      html: `<p>From: ${name}.</p><br/>${message}`,
    });

    return json({ success: true, message: "Email sent", result });
  } catch (error) {
    logger.error('Error processing contact form:', error);
    return json({ error: 'Failed to process message' }, { status: 500 });
  }
};