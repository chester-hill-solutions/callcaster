import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrBlockContext } from "@/lib/inbound-ivr-db.server";
import { createVoiceResponse, hangupTwiml, type TwimlResponse } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrBlock } from "@/lib/ivr-webhook-auth.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";
import {
  appendBlockResponse,
  type AudioTarget,
  type IvrOption,
} from "@/lib/ivr-block-runtime.server";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, {
    id: string;
    type: string;
    audioFile: string;
    options?: IvrOption[];
  }>;
}

const handleAudio = async (
    target: AudioTarget,
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
    target.play(signedUrl);
  } else {
    target.say(audioFile);
  }
};

const handleBlock = async (
    twiml: TwimlResponse,
  block: { type: string; audioFile: string; options?: IvrOption[] },
  numberId: string,
  pageId: string,
  blockId: string,
  script: Script,
  workspace: string,
  baseUrl: string,
) => {
  await appendBlockResponse({
    twiml,
    block,
    pageId,
    blockId,
    script,
    buildActionUrl: (p, b) => `${baseUrl}/api/inbound-ivr/${numberId}/${p}/${b}/response`,
    buildBlockUrl: (p, b) => `${baseUrl}/api/inbound-ivr/${numberId}/${p}/${b}`,
    renderAudio: (target, b) => handleAudio(target, b, workspace),
  });
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
