import { Resend } from "resend";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

/**
 * Single transactional-email path (Resend, CallCaster sender). Delivery
 * failures are logged, never thrown — every caller treats the send as
 * best-effort (forgot-password already replies generically, and an invite
 * that fails to deliver is resendable from the members list).
 *
 * `to` accepts several recipients because the number-rental emails go to every
 * workspace owner and admin; before that they each built their own Resend
 * client and sender line.
 */
export async function sendTransactionalEmail(args: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const recipients = (Array.isArray(args.to) ? args.to : [args.to]).filter(Boolean);
  if (recipients.length === 0) return;
  const resend = new Resend(env.RESEND_API_KEY());
  try {
    await resend.emails.send({
      from: "CallCaster <info@callcaster.ca>",
      to: recipients,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
  } catch (error) {
    logger.error("transactional_email.send.failed", {
      subject: args.subject,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}