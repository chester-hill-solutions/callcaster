import { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { cancelQueuedMessages } from "~/lib/database.server";
import { Campaign, OutreachAttempt } from "~/lib/types";

export const action: ActionFunction = async ({ request }) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const twilio = new Twilio.Twilio(
    process.env.TWILIO_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );

  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries());
    const { SmsSid: sid, SmsStatus: status } = payload;

    const { data: messageData, error: messageError } = await supabase
      .from("message")
      .update({ status })
      .eq("sid", sid)
      .select()
      .single();

    if (messageError) {
      console.error("Error updating message:", messageError);
      return json({ error: "Failed to update message" }, { status: 500 });
    }

    let outreachData:
      | (OutreachAttempt & { campaign: Partial<Campaign> })
      | null = null;
    if (messageData?.outreach_attempt_id) {
      const { data: outreachResult, error: outreachError } = await supabase
        .from("outreach_attempt")
        .update({ disposition: status })
        .eq("id", messageData.outreach_attempt_id)
        .select(`*, campaign(end_date)`)
        .single();

      if (outreachError) {
        console.error("Error updating outreach attempt:", outreachError);
      } else {
        outreachData = outreachResult;
      }
    }
    if (outreachData && outreachData.campaign?.end_date) {
      const now = new Date();
      if (now > outreachData.campaign?.end_date){
        await cancelQueuedMessages(twilio, supabase)
      }
    }
    return json({ message: messageData, outreach: outreachData });
  } catch (error) {
    console.error("Unexpected error:", error);
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
};
