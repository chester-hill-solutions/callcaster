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

const handleBlock = async (
  supabase,
  twiml,
  block,
  dbCall,
  campaignId,
  pageId,
  blockId,
) => {
  const { type, audioFile, options } = block;

  if (type === "recorded") {
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("workspaceAudio")
        .createSignedUrl(`${dbCall.workspace}/${audioFile}`, 3600);

    if (signedUrlError) throw signedUrlError;

    twiml.play(signedUrlData.signedUrl);
  } else {
    twiml.say(audioFile);
  }

  if (options && options.length > 0) {
    let gather = twiml.gather({
      action: `${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}/${blockId}/response`,
      input: "dtmf speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
    });

   
  } else {
    twiml.redirect(`${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}`);
  }
};

export const action = async ({ params, request }) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const { pageId, blockId, campaignId } = params;
  const url = new URL(request.url);
  const callSid = url.searchParams.get("CallSid");

  try {
    const { data: call } = await supabase
      .from("call")
      .select("*")
      .eq("sid", callSid)
      .single();
    const campaignData = await getCampaignData(supabase, campaignId);
    const script = campaignData.ivr_campaign[0].script.steps;
    const currentBlock = script.blocks[blockId];
    if (currentBlock) {
      await handleBlock(
        supabase,
        twiml,
        currentBlock,
        call,
        campaignId,
        pageId,
        blockId,
      );
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
