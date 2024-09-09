import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

const updateResult = async (supabase, outreach_attempt_id, update) => {
  const { error } = await supabase
    .from("outreach_attempt")
    .update(update)
    .eq("id", outreach_attempt_id);
  if (error) throw error;
};

export const action = async ({ params, request }) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const { pageId, campaignId } = params;
  const url = new URL(request.url);
  const callSid = url.searchParams.get("CallSid");

  try {
    const { data: dbCall, error: callError } = await supabase
      .from("call")
      .select('outreach_attempt_id, workspace, campaign(*, ivr_campaign(*, script(*)))')
      .eq("sid", callSid)
      .single();

      await updateResult(supabase, dbCall?.outreach_attempt_id, {
      answered_at: new Date(),
    });
    const script = dbCall?.campaign?.ivr_campaign.script.steps;
    const currentPage = script.pages[pageId];
    if (currentPage && currentPage.blocks.length > 0) {
      const firstBlockId = currentPage.blocks[0];
      twiml.redirect(`/api/ivr/${campaignId}/${pageId}/${firstBlockId}`);
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    console.error(e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};
