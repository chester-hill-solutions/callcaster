import { Resend } from "resend";
import { json } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";

const resend = new Resend(process.env.RESEND_API_KEY);

export const action = async ({ request, params }: { request: Request, params: { id: string } }) => {
  try {
    const error = await request.json();
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
    console.error('Error processing voicemail:', error);
    return json({ error: 'Failed to process voicemail' }, { status: 500, headers: {
      'Content-Type': 'application/json'
    } });
  }
};