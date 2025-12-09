import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "@/lib/database.types";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, { id: string; type: string; audioFile: string; options?: Array<{ value: string; next?: string }> }>;
}

const getCampaignData = async (supabase: SupabaseClient<Database>, campaign_id: string) => {
  const { data: campaign, error } = await supabase
    .from("campaign")
    .select(`*, ivr_campaign(*, script(*))`)
    .eq("id", campaign_id)
    .single();
  if (error) throw error;
  return campaign;
};

const handleAudio = async (supabase: SupabaseClient<Database>, twiml: Twilio.twiml.VoiceResponse, block: { type: string; audioFile: string }, workspace: string) => {
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

const handleOptions = (twiml: Twilio.twiml.VoiceResponse, block: { options?: Array<{ value: string; next?: string }> }, campaignId: string, pageId: string, blockId: string, script: Script) => {
  if (block.options && block.options.length > 0) {
    const gather = twiml.gather({
      action: `${env.BASE_URL()}/api/ivr/${campaignId}/${pageId}/${blockId}/response`,
      input: "dtmf speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
      timeout: 5,
    });
    twiml.redirect(
      `${env.BASE_URL()}/api/ivr/${campaignId}/${pageId}/${blockId}/response`,
    );
  } else {
    const nextLocation = findNextBlock(script, pageId, blockId);
    if (nextLocation) {
      twiml.redirect(
        `${env.BASE_URL()}/api/ivr/${campaignId}/${nextLocation.pageId}/${nextLocation.blockId}`,
      );
    } else {
      twiml.hangup();
    }
  }
};

const handleBlock = async (
  supabase: SupabaseClient<Database>,
  twiml: Twilio.twiml.VoiceResponse,
  block: { type: string; audioFile: string; options?: Array<{ value: string; next?: string }> },
  campaignId: string,
  pageId: string,
  blockId: string,
  script: Script,
  workspace: string,
) => {
  await handleAudio(supabase, twiml, block, workspace);
  handleOptions(twiml, block, campaignId, pageId, blockId, script);
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const supabase = createClient(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const twiml = new Twilio.twiml.VoiceResponse();

  const { pageId, blockId, campaignId } = params as { pageId: string; blockId: string; campaignId: string };
  
  if (!campaignId || !pageId || !blockId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  try {
    const campaignData = await getCampaignData(supabase, campaignId);
    const script = (campaignData.ivr_campaign[0]?.script?.steps as unknown) as Script;
    if (!script || !script.blocks || !script.pages) {
      throw new Error("Invalid script structure");
    }
    const workspace = campaignData.workspace as string;
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
    logger.error("IVR Error:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};
