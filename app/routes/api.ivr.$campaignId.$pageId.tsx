import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

const MAX_RETRIES = 5;
const RETRY_DELAY = 200; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getCallWithRetry = async (supabase, callSid, retries = 0) => {
  const { data, error } = await supabase
    .from("call")
    .select('*, campaign(*, ivr_campaign(*, script(*)))')
    .eq("sid", callSid)
    .single();

  if (error || !data) {
    if (retries < MAX_RETRIES) {
      await sleep(RETRY_DELAY);
      return getCallWithRetry(supabase, callSid, retries + 1);
    }
    throw new Error("Failed to retrieve call after multiple attempts");
  }

  return data;
};

export const action = async ({ params, request }) => {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const twiml = new Twilio.twiml.VoiceResponse();
  const { pageId, campaignId } = params;
  const formData = await request.formData();
  const callSid = formData.get('CallSid')
  try {
    const callData = await getCallWithRetry(supabase, callSid);
    const script = callData.campaign?.ivr_campaign[0].script.steps;
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