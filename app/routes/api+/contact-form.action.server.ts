import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";
import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";
import { Resend } from "resend";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_MESSAGE_LENGTH = 5000;

const MAX_NAME_LENGTH = 200;

/** Public unauthenticated form that sends email — keep the bucket small. */
const CONTACT_FORM_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

export const action = defineAction({
  sideEffects: ["email"],
  handler: async ({ request }) => {

  const rateLimit = await checkRateLimit({
    key: clientRateLimitKey(request, "contact-form"),
    ...CONTACT_FORM_RATE_LIMIT,
  });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const resend = new Resend(env.RESEND_API_KEY());

  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData) as Record<string, unknown>;

    const email = String(data.email ?? "").trim();
    const name = String(data.name ?? "").trim();
    const message = String(data.message ?? "").trim();
    const honeypot = String(data.company_website ?? "").trim();

    if (honeypot) {
      // Bot filled the hidden field; pretend success without sending anything.
      return routeData({ success: true, message: "Email sent" });
    }

    if (!email) {
      return routeData({ error: "Email is required" }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(email)) {
      return routeData({ error: "Invalid email format" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return routeData({ error: "Name is too long" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return routeData({ error: "Message is too long" }, { status: 400 });
    }

    const result = await resend.emails.send({
      from: "info@callcaster.ca",
      to: ["info@callcaster.ca"],
      replyTo: email,
      subject: data.signup ? `A new request to Sign Up from ${email}` : `A new form submission from ${email}`,
      text: `From: ${name}, ${message}`,
      html: `<p>From: ${name}.</p><br/>${message}`,
    });

    return routeData({ success: true, message: "Email sent", result });
  } catch (error) {
    logger.error('Error processing contact form:', error);
    return routeData({ error: 'Failed to process message' }, { status: 500 });
  }
  },
});
