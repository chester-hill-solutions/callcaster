import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";
import type { Database } from "@/lib/database.types";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, {
    id: string;
    type: string;
    audioFile: string;
    options?: Array<{ value: string; next?: string }>;
  }>;
}

const getWorkspaceNumberData = async (
  supabase: SupabaseClient<Database>,
  numberId: string,
) => {
  const { data: number } = await supabase
    .from("workspace_number")
    .select("id, inbound_script_id, workspace")
    .eq("id", Number(numberId))
    .single();
  if (!number?.inbound_script_id) throw new Error("Number has no inbound script");
  const { data: script } = await supabase
    .from("script")
    .select("steps")
    .eq("id", number.inbound_script_id)
    .single();
  const steps = script?.steps as Script | null | undefined;
  if (!steps?.blocks || !steps?.pages) throw new Error("Invalid script structure");
  return { number, script: steps, workspace: number.workspace };
};

const handleAudio = async (
  supabase: SupabaseClient<Database>,
  twiml: Twilio.twiml.VoiceResponse,
  block: { type: string; audioFile: string },
  workspace: string,
) => {
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

const findNextBlock = (
  script: Script,
  currentPageId: string,
  currentBlockId: string,
): { pageId: string; blockId: string } | null => {
  const currentPage = script.pages[currentPageId];
  if (!currentPage) return null;
  const currentBlockIndex = currentPage.blocks.indexOf(currentBlockId);

  if (currentBlockIndex < currentPage.blocks.length - 1) {
    const nextBlockId = currentPage.blocks[currentBlockIndex + 1];
    if (!nextBlockId) return null;
    return { pageId: currentPageId, blockId: nextBlockId };
  }

  const pageIds = Object.keys(script.pages);
  const currentPageIndex = pageIds.indexOf(currentPageId);
  if (currentPageIndex < pageIds.length - 1) {
    const nextPageId = pageIds[currentPageIndex + 1];
    const nextPage = nextPageId ? script.pages[nextPageId] : undefined;
    const nextBlockId = nextPage?.blocks[0];
    if (!nextPageId || !nextBlockId) return null;
    return { pageId: nextPageId, blockId: nextBlockId };
  }

  return null;
};

const handleOptions = (
  twiml: Twilio.twiml.VoiceResponse,
  block: { options?: Array<{ value: string; next?: string }> },
  numberId: string,
  pageId: string,
  blockId: string,
  script: Script,
  baseUrl: string,
) => {
  if (block.options && block.options.length > 0) {
    twiml.gather({
      action: `${baseUrl}/api/inbound-ivr/${numberId}/${pageId}/${blockId}/response`,
      input: ["dtmf", "speech"],
      speechTimeout: "auto",
      speechModel: "phone_call",
      timeout: 5,
    });
    twiml.redirect(
      `${baseUrl}/api/inbound-ivr/${numberId}/${pageId}/${blockId}/response`,
    );
  } else {
    const nextLocation = findNextBlock(script, pageId, blockId);
    if (nextLocation) {
      twiml.redirect(
        `${baseUrl}/api/inbound-ivr/${numberId}/${nextLocation.pageId}/${nextLocation.blockId}`,
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
  numberId: string,
  pageId: string,
  blockId: string,
  script: Script,
  workspace: string,
  baseUrl: string,
) => {
  await handleAudio(supabase, twiml, block, workspace);
  handleOptions(twiml, block, numberId, pageId, blockId, script, baseUrl);
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const baseUrl = env.BASE_URL();
  const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
  const twiml = new Twilio.twiml.VoiceResponse();
  const { pageId, blockId, numberId } = params as {
    pageId: string;
    blockId: string;
    numberId: string;
  };

  if (!numberId || !pageId || !blockId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const formData = await request.formData();
  const formParams = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = formParams.CallSid ?? null;

  if (!callSid) {
    return new Response("Missing CallSid parameter", { status: 400 });
  }

  const validation = await validateTwilioWebhookForCallSid({
    request,
    supabase,
    callSid,
    params: formParams,
  });
  if (!validation.ok) {
    return validation.response;
  }

  try {
    const { script, workspace } = await getWorkspaceNumberData(supabase, numberId);
    const currentBlock = script.blocks[blockId];

    if (currentBlock) {
      await handleBlock(supabase, twiml, currentBlock, numberId, pageId, blockId, script, workspace, baseUrl);
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    logger.error("Inbound IVR Error:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};
