import MailService from "@sendgrid/mail";
import { json } from "@remix-run/node";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const action = async ({ request, params }) => {
  try {
    const error = await request.json();
    const {supabaseClient, headers, serverSession} = await getSupabaseServerClientWithSession(request);
    MailService.setApiKey(process.env.SENDGRID_API_KEY!);
    const msg = {
      to: 'info@callcaster.ca',
      from: "info@callcaster.ca",
      reply_to: serverSession?.user?.username,
      subject: `An error occured which needs your attention`,
      text: `An error occured which needs your attention\n\n: ${JSON.stringify({error, user: serverSession?.user})}`,
    };
    
    const result = await MailService.send(msg);
    return json({ success: true, message: "Error Report Sent"});
  } catch (error) {
    console.error('Error processing voicemail:', error);
    return json({ error: 'Failed to process voicemail' }, { status: 500 });
  }
};