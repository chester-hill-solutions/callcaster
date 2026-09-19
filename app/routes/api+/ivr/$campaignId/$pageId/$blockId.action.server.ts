import { fetchCampaignWithScript, ivrScriptStepsFromCampaign } from "@/lib/campaign-ivr.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createVoiceResponse, hangupTwiml, type TwimlResponse } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrBlock } from "@/lib/ivr-webhook-auth.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";
import { resolveVoiceForBlock } from "@/lib/tts-voices";
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
    title?: string;
    content?: string;
    prompt?: string;
    // Present on synthetic-speech blocks that opted into a specific Polly
    // voice via the roster in app/lib/tts-voices.ts. `wireExtras` is
    // scriptkit's pass-through slot; the roster module is the allowlist for
    // safe id values (see resolveVoiceForBlock).
    wireExtras?: Record<string, unknown> | null;
    options?: IvrOption[];
  }>;
}

type AudioBlock = {
  type: string;
  audioFile: string;
  title?: string;
  content?: string;
  prompt?: string;
  wireExtras?: Record<string, unknown> | null;
};

/**
 * Text a synthetic block speaks. `audioFile` is the wire field the editor
 * writes speech into; blocks authored before that (every text-only script,
 * including the seeded sample) carry their words in `content`, so fall
 * back through the script text rather than emit an empty <Say> that plays
 * as silence (#1673).
 */
export function synthesizedSpeechText(block: AudioBlock): string {
  for (const candidate of [block.audioFile, block.content, block.prompt, block.title]) {
    const text = typeof candidate === "string" ? candidate.trim() : "";
    if (text) return text;
  }
  return "";
}

const handleAudio = async (
  target: AudioTarget,
  block: AudioBlock,
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
    // `audioFile` on a synthetic block actually stores the speech text —
    // legacy field naming from the wire format; the editor labels it
    // "Speech text" for these blocks.
    // Cast is safe: TTS_VOICES only contains Polly Neural IDs Twilio's
    // SayVoice union already lists; the string→SayVoice widening is
    // just because `as const satisfies readonly TtsVoice[]` on the
    // roster still surfaces `.id` as `string`. Verified against the
    // twilio SDK's SayVoice enum on module import above.
    const speech = synthesizedSpeechText(block);
    if (!speech) return;
    target.say(
      { voice: resolveVoiceForBlock(block) as Parameters<typeof target.say>[0]["voice"] },
      speech,
    );
  }
};

const handleBlock = async (
    twiml: TwimlResponse,
  block: AudioBlock & { options?: IvrOption[] },
  campaignId: string,
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
    buildActionUrl: (p, b) => `${baseUrl}/api/ivr/${campaignId}/${p}/${b}/response`,
    buildBlockUrl: (p, b) => `${baseUrl}/api/ivr/${campaignId}/${p}/${b}`,
    renderAudio: (target, b) => handleAudio(target, b, workspace),
  });
};

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrBlock(request, [params.campaignId, params.pageId, params.blockId]),
  sideEffects: ["db-read", "external"],
  handler: async ({ params, auth }) => {

  const baseUrl = env.BASE_URL();

  const twiml = createVoiceResponse();

  const { pageId, blockId, campaignId } = params as { pageId: string; blockId: string; campaignId: string };

  const { callSid } = auth;

  try {
    const call = await findCallBySid(callSid);
    if (!call?.workspace) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
    if (call.campaign_id !== Number(campaignId)) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const campaignData = await fetchCampaignWithScript(campaignId);
    const script = ivrScriptStepsFromCampaign(campaignData) as Script;
    if (!script || !script.blocks || !script.pages) {
      throw new Error("Invalid script structure");
    }
    const workspace = campaignData.workspace as string;
    const currentPage = script.pages[pageId];
    const currentBlock = currentPage?.blocks.includes(blockId)
      ? script.blocks[blockId]
      : undefined;

    if (currentBlock) {
      await handleBlock(
        twiml,
        currentBlock,
        campaignId,
        pageId,
        blockId,
        script,
        workspace,
        baseUrl,
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
  },
});
