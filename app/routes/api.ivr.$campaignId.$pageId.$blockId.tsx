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

const handleAudio = async (supabase, twiml, block, workspace) => {
  const { type, audioFile } = block;
  if (type === "recorded") {
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("workspaceAudio")
        .createSignedUrl(`${workspace}/${audioFile}`, 3600);
    if (signedUrlError) throw signedUrlError;
    twiml.play(signedUrlData.signedUrl);
  } else {
    twiml.say(audioFile);
  }
};

const findNextBlock = (script, currentPageId, currentBlockId) => {
  const currentPage = script.pages[currentPageId];
  const currentBlockIndex = currentPage.blocks.indexOf(currentBlockId);

  if (currentBlockIndex < currentPage.blocks.length - 1) {
    return {
      pageId: currentPageId,
      blockId: currentPage.blocks[currentBlockIndex + 1],
    };
  }

  const pageIds = Object.keys(script.pages);
  const currentPageIndex = pageIds.indexOf(currentPageId);
  if (currentPageIndex < pageIds.length - 1) {
    const nextPageId = pageIds[currentPageIndex + 1];
    return { pageId: nextPageId, blockId: script.pages[nextPageId].blocks[0] };
  }

  return null;
};

const handleOptions = (twiml, block, campaignId, pageId, blockId, script) => {
  if (block.options && block.options.length > 0) {
    const gather = twiml.gather({
      action: `${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}/${blockId}/response`,
      input: "dtmf speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
      timeout: 5,
    });
    twiml.redirect(
      `${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}/${blockId}/response`,
    );
  } else {
    const nextLocation = findNextBlock(script, pageId, blockId);
    if (nextLocation) {
      twiml.redirect(
        `${process.env.BASE_URL}/api/ivr/${campaignId}/${nextLocation.pageId}/${nextLocation.blockId}`,
      );
    } else {
      twiml.hangup();
    }
  }
};

const handleBlock = async (
  supabase,
  twiml,
  block,
  campaignId,
  pageId,
  blockId,
  script,
  workspace,
) => {
  await handleAudio(supabase, twiml, block, workspace);
  handleOptions(twiml, block, campaignId, pageId, blockId, script);
};

export const action = async ({ params, request }) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const { pageId, blockId, campaignId } = params;

  try {
    const campaignData = await getCampaignData(supabase, campaignId);
    const script = campaignData.ivr_campaign[0].script.steps;
    const workspace = campaignData.workspace;
    const currentBlock = script.blocks[blockId];

    if (currentBlock) {
      await handleBlock(
        supabase,
        twiml,
        currentBlock,
        campaignId,
        pageId,
        blockId,
        script,
        workspace,
      );
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
