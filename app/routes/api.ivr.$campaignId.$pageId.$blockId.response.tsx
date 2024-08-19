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

const getOutreach = async (supabase, outreachId) => {
  const { data, error } = await supabase
    .from("outreach_attempt")
    .select("result")
    .eq("id", outreachId)
    .single();
  if (error) throw error;
  return data.result;
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

const findNextStep = (currentBlock, userInput, script, pageId) => {
  if (currentBlock.options) {
    const matchedOption = currentBlock.options.find((option) => {
      const optionValue = String(option.value).trim();
      const input = String(userInput).trim();
      return optionValue === input || (input.length > 2 && optionValue === 'vx-any');
    });
    if (matchedOption && matchedOption.next) return matchedOption.next;
  }

  const nextLocation = findNextBlock(script, pageId, currentBlock.id);
  return nextLocation 
    ? `${nextLocation.pageId}:${nextLocation.blockId}`
    : 'hangup';
};

const handleNextStep = (twiml, nextStep, campaignId, pageId) => {
  if (nextStep === "hangup") {
    twiml.hangup();
  } else if (nextStep.includes(":")) {
    const [nextPageId, nextBlockId] = nextStep.split(":");
    twiml.redirect(
      `${process.env.BASE_URL}/api/ivr/${campaignId}/${nextPageId}/${nextBlockId}/`
    );
  } else if (nextStep.startsWith("page_")) {
    twiml.redirect(
      `${process.env.BASE_URL}/api/ivr/${campaignId}/${nextStep}/`
    );
  } else {
    twiml.redirect(
      `${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}/${nextStep}/`
    );
  }
};

export const action = async ({ request, params }) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const formData = await request.formData();
  const { pageId, blockId, campaignId } = params;
  const userInput = formData.get("Digits") || formData.get("SpeechResult");
  const callSid = formData.get("CallSid");

  try {
    const [{ data: call }, campaignData] = await Promise.all([
      supabase.from("call").select("*").eq("sid", callSid).single(),
      getCampaignData(supabase, campaignId)
    ]);

    const script = campaignData.ivr_campaign[0].script.steps;
    const currentBlock = script.blocks[blockId];
    const result = await getOutreach(supabase, call.outreach_attempt_id);

    const newResult = {
      ...result,
      [pageId]: {
        ...result[pageId],
        [(currentBlock.title || blockId)]: userInput,
      },
    };

    await supabase
      .from("outreach_attempt")
      .update({ result: newResult })
      .eq("id", call.outreach_attempt_id);

    const nextStep = findNextStep(currentBlock, userInput, script, pageId);
    handleNextStep(twiml, nextStep, campaignId, pageId);

  } catch (e) {
    console.error("IVR Error:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};