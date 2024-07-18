import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

const getCampaignData = async (supabase, campaign_id) => {
  const { data: campaign, error } = await supabase
    .from("campaign")
    .select(`*, ivr_campaign(*, script(*))`)
    .eq("id", campaign_id)
    .single();
  if (error) throw error;
  return campaign;
};

const handleAudio = async (supabase, twiml, block, dbCall) => {
  const { type, audioFile } = block;
  if (type === "recorded") {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(`${dbCall.workspace}/${audioFile}`, 3600);
    if (signedUrlError) throw signedUrlError;
    twiml.play(signedUrlData.signedUrl);
  } else {
    twiml.say(audioFile);
  }
};

const handleOptions = (twiml, options, campaignId, pageId, blockId) => {
  if (options && options.length > 0) {
    const gather = twiml.gather({
      action: `${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}/${blockId}/response`,
      input: "dtmf speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
    });
    // Add options handling here
  } else {
    twiml.redirect(`${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}`);
  }
};

const handleBlock = async (supabase, twiml, block, dbCall, campaignId, pageId, blockId) => {
  await handleAudio(supabase, twiml, block, dbCall);
  handleOptions(twiml, block.options, campaignId, pageId, blockId);
};

export const action = async ({ params, request }) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const { pageId, blockId, campaignId } = params;
  const callSid = new URL(request.url).searchParams.get("CallSid");

  try {
    const [call, campaignData] = await Promise.all([
      supabase.from("call").select("*").eq("sid", callSid).single(),
      getCampaignData(supabase, campaignId)
    ]);

    const currentBlock = campaignData.ivr_campaign[0].script.steps.blocks[blockId];
    
    if (currentBlock) {
      await handleBlock(supabase, twiml, currentBlock, call.data, campaignId, pageId, blockId);
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    console.error("IVR Error:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};
