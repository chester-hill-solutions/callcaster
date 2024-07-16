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

export const action = async ({ request, params }) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const formData = await request.formData();
  const { pageId, blockId, campaignId } = params;
  const userInput = formData.get("Digits") || formData.get("SpeechResult");
  const callSid = formData.get("CallSid");

  try {
    const { data: call } = await supabase
      .from("call")
      .select("*")
      .eq("sid", callSid)
      .single();
    const campaignData = await getCampaignData(supabase, campaignId);
    const script = campaignData.ivr_campaign[0].script.steps;
    const currentBlock = script.blocks[blockId];
    const result = await getOutreach(supabase, call.outreach_attempt_id);
    const newResult = {
      ...result,
      [pageId]: {
        ...result[pageId],
        [blockId]: userInput,
      },
    };
    await supabase
      .from("outreach_attempt")
      .update({
        result: newResult,
      })
      .eq("id", call.outreach_attempt_id);

    let nextStep;
    
    if (currentBlock.options) {
      const matchedOption = currentBlock.options.find((option) => {
        const optionValue = String(option.value).trim();
        const input = String(userInput).trim();
        if (optionValue === input) return option;
        if (input.length > 2 && optionValue === 'vx-any') return option;
      });

      nextStep = matchedOption ? matchedOption.next : null;
      console.log("Matched Option:", matchedOption);
      console.log("Next Step:", nextStep);
    }

    if (nextStep) {
      if (nextStep === "hangup") {
        twiml.say("Thank you for your time. Goodbye!");
        twiml.hangup();
      } else if (nextStep.includes(":")) {
        const [nextPageId, nextBlockId] = nextStep.split(":");
        twiml.redirect(
          `${process.env.BASE_URL}/api/ivr/${campaignId}/${nextPageId}/${nextBlockId}/`,
        );
      } else if (nextStep.startsWith("page_")) {
        twiml.redirect(
          `${process.env.BASE_URL}/api/ivr/${campaignId}/${nextStep}/`,
        );
      } else {
        twiml.redirect(
          `${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}/${nextStep}/`,
        );
      }
    } else {
      const currentPage = script.pages[pageId];
      const currentBlockIndex = currentPage.blocks.indexOf(blockId);
      const nextBlockId = currentPage.blocks[currentBlockIndex + 1];

      if (nextBlockId) {
        twiml.redirect(
          `${process.env.BASE_URL}/api/ivr/${campaignId}/${pageId}/${nextBlockId}/`,
        );
      } else {
        const pageIds = Object.keys(script.pages);
        const currentPageIndex = pageIds.indexOf(pageId);
        const nextPageId = pageIds[currentPageIndex + 1];

        if (nextPageId) {
          twiml.redirect(
            `${process.env.BASE_URL}/api/ivr/${campaignId}/${nextPageId}/`,
          );
        } else {
          twiml.say("Thank you for your time. Goodbye!");
          twiml.hangup();
        }
      }
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
