import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { Resend } from "resend";
import { safeParseJson } from "@/lib/database.server";
import { requireJsonAuth } from "@/lib/api-auth.server";


export const action = async ({ request, params }: { request: Request, params: { id: string } }) => {

  const resend = new Resend(env.RESEND_API_KEY());

  try {
    const error = await safeParseJson<unknown>(request);
    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;
    const user = auth.user;
    
    const result = await resend.emails.send({
      from: "info@callcaster.ca",
      to: ["info@callcaster.ca"],
      replyTo: user.email,
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
}
