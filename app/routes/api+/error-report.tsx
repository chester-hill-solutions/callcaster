// @ts-nocheck
import { Resend } from "resend";
import { data as routeData } from "react-router";




export const action = async ({ request, params }: { request: Request, params: { id: string } }) => {  const { env } = await import("@/lib/env.server");
  const { logger } = await import("@/lib/logger.server");
  const { verifyAuth } = await import("@/lib/supabase.server");
  const { safeParseJson } = await import("@/lib/database.server");
  const resend = new Resend(env.RESEND_API_KEY());

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
    
    return routeData( { success: true, message: "Error Report Sent"}, { status: 200, headers: {
      'Content-Type': 'application/json'
    } });
  } catch (error) {
    logger.error('Error processing error report:', error);
    return routeData({ error: 'Failed to process error report' }, { status: 500, headers: {
      'Content-Type': 'application/json'
    } });
  }
};
