import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrBlockContext } from "@/lib/inbound-ivr-db.server";
import { createVoiceResponse, hangupTwiml, type TwimlResponse } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrBlock } from "@/lib/ivr-webhook-auth.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, {
    id: string;
    type: string;
    audioFile: string;
    options?: Array<{ value: string; next?: string }>;
  }>;
}

const handleAudio = async (
    twiml: TwimlResponse,
  block: { type: string; audioFile: string },
  workspace: string,
) => {
  const { type, audioFile } = block;
  if (type === "recorded") {
    const signedUrl = await createSignedObjectUrl(
      "workspaceAudio",
      `${workspace}/${audioFile}`,
      3600,
    );
    twiml.play(signedUrl);
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
  twiml: TwimlResponse,
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
    twiml: TwimlResponse,
  block: { type: string; audioFile: string; options?: Array<{ value: string; next?: string }> },
  numberId: string,
  pageId: string,
  blockId: string,
  script: Script,
  workspace: string,
  baseUrl: string,
) => {
  await handleAudio(twiml, block, workspace);
  handleOptions(twiml, block, numberId, pageId, blockId, script, baseUrl);
};

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrBlock(request, [params.numberId, params.pageId, params.blockId]),
  sideEffects: ["db-read", "external"],
  handler: async ({ params, auth }) => {
  const baseUrl = env.BASE_URL();
  const twiml = createVoiceResponse();
  const { pageId, blockId, numberId } = params as {
    pageId: string;
    blockId: string;
    numberId: string;
  };
  const { callSid } = auth;

  try {
    const call = await findCallBySid(callSid);
    if (!call?.to) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const context = await loadInboundIvrBlockContext(Number(numberId));
    if (!context || call.to !== context.number.phoneNumber) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const { script, number } = context;
    const currentPage = script.pages[pageId];
    const currentBlock = currentPage?.blocks.includes(blockId)
      ? (script.blocks[blockId] as Script["blocks"][string] | undefined)
      : undefined;

    if (currentBlock) {
      await handleBlock(
        twiml,
        currentBlock,
        numberId,
        pageId,
        blockId,
        script as Script,
        number.workspaceId,
        baseUrl,
      );
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
  },
});
