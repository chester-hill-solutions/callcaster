import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { env } from "@/lib/env.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "@/lib/database.types";

const getCampaignData = async (supabase: SupabaseClient<Database>, campaign_id: string) => {
  const { data: campaign, error } = await supabase
    .from("campaign")
    .select(`*, ivr_campaign(*, script(*))`)
    .eq("id", campaign_id)
    .single();
  if (error) throw error;
  return campaign;
};

const getOutreach = async (supabase: SupabaseClient<Database>, outreachId: number) => {
  const { data, error } = await supabase
    .from("outreach_attempt")
    .select("result")
    .eq("id", outreachId)
    .single();
  if (error) throw error;
  return data.result;
};

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<
    string,
    { id: string; title?: string; options?: Array<{ value: string; next?: string }> }
  >;
}

const findNextBlock = (script: Script, currentPageId: string, currentBlockId: string): { pageId: string; blockId: string } | null => {
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

const findNextStep = (currentBlock: { id: string; options?: Array<{ value: string; next?: string }> }, userInput: string | null, script: Script, pageId: string): string => {
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

const handleNextStep = (twiml: Twilio.twiml.VoiceResponse, nextStep: string, campaignId: string, pageId: string) => {
  if (nextStep === "hangup") {
    twiml.hangup();
  } else if (nextStep.includes(":")) {
    const [nextPageId, nextBlockId] = nextStep.split(":");
    twiml.redirect(
      `${env.BASE_URL()}/api/ivr/${campaignId}/${nextPageId}/${nextBlockId}/`
    );
  } else if (nextStep.startsWith("page_")) {
    twiml.redirect(
      `${env.BASE_URL()}/api/ivr/${campaignId}/${nextStep}/`
    );
  } else {
    twiml.redirect(
      `${env.BASE_URL()}/api/ivr/${campaignId}/${pageId}/${nextStep}/`
    );
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const supabase = createClient(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const pageId = params.pageId;
  const blockId = params.blockId;
  const campaignId = params.campaignId;

  if (!campaignId || !pageId || !blockId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const formData = await request.formData();
  const digitsValue = formData.get("Digits");
  const speechResultValue = formData.get("SpeechResult");
  const callSidValue = formData.get("CallSid");

  const userInput =
    typeof digitsValue === "string"
      ? digitsValue
      : typeof speechResultValue === "string"
        ? speechResultValue
        : null;
  const callSid = typeof callSidValue === "string" ? callSidValue : null;

  if (!callSid) {
    return new Response("Missing CallSid parameter", { status: 400 });
  }

  try {
    const [{ data: call }, campaignData] = await Promise.all([
      supabase.from("call").select("*").eq("sid", callSid).single(),
      getCampaignData(supabase, campaignId),
    ]);

    if (!call) {
      throw new Error("Call not found");
    }

    const stepsValue = campaignData.ivr_campaign[0]?.script?.steps;
    if (!stepsValue) {
      throw new Error("Script steps not found");
    }

    const script = stepsValue as unknown as Script;
    if (!script || !script.blocks || !script.pages) {
      throw new Error("Invalid script structure");
    }
    const currentBlock = script.blocks[blockId];
    if (!currentBlock) {
      throw new Error(`Block ${blockId} not found`);
    }

    const resultValue = await getOutreach(supabase, call.outreach_attempt_id);
    const result =
      resultValue && typeof resultValue === "object"
        ? (resultValue as Record<string, unknown>)
        : {};

    const blockTitle =
      "title" in currentBlock && typeof currentBlock.title === "string"
        ? currentBlock.title
        : blockId;

    const newResult = {
      ...result,
      [pageId]: {
        ...(result[pageId] && typeof result[pageId] === "object"
          ? (result[pageId] as Record<string, unknown>)
          : {}),
        [blockTitle]: userInput,
      },
    };

    await supabase
      .from("outreach_attempt")
      .update({ result: newResult })
      .eq("id", call.outreach_attempt_id);

    const nextStep = findNextStep(currentBlock, userInput, script, pageId);
    handleNextStep(twiml, nextStep, campaignId, pageId);
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "An error occurred. Please try again later.";
    console.error("IVR Error:", e);
    twiml.say(errorMessage);
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};