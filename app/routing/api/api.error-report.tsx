import { Resend } from "resend";
import { json } from "@remix-run/node";
import { safeParseJson } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";

const resend = new Resend(env.RESEND_API_KEY());

export const action = async ({ request, params }: { request: Request, params: { id: string } }) => {
  try {
    const error = await safeParseJson<unknown>(request);
    const {supabaseClient, user} = await verifyAuth(request);
    
    const result = await resend.emails.send({
      from: "info@callcaster.ca",
      to: ["info@callcaster.ca"],
      replyTo: user.email || user.user_metadata.email,
      subject: `An error occured which needs your attention`,
      text: `An error occured which needs your attention\n\n: ${JSON.stringify({error, user: user})}`,
    });
    
    return json( { success: true, message: "Error Report Sent"}, { status: 200, headers: {
      'Content-Type': 'application/json'
    } });
  } catch (error) {
    logger.error('Error processing error report:', error);
    return json({ error: 'Failed to process error report' }, { status: 500, headers: {
      'Content-Type': 'application/json'
    } });
  }
};
