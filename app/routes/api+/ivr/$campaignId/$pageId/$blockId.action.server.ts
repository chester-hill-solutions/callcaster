import { fetchCampaignWithScript, ivrScriptStepsFromCampaign } from "@/lib/campaign-ivr.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createVoiceResponse, hangupTwiml, type TwimlResponse } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrBlock } from "@/lib/ivr-webhook-auth.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";
import { resolveVoiceForBlock } from "@/lib/tts-voices";

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
    options?: Array<{ value: string; next?: string }>;
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

type AudioTarget = Pick<TwimlResponse, "play" | "say">;

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

const findNextBlock = (script: Script, currentPageId: string, currentBlockId: string): { pageId: string; blockId: string } | null => {
  const currentPage = script.pages[currentPageId];
  if (!currentPage) {
    return null;
  }
  const currentBlockIndex = currentPage.blocks.indexOf(currentBlockId);

  if (currentBlockIndex < currentPage.blocks.length - 1) {
    const nextBlockId = currentPage.blocks[currentBlockIndex + 1];
    if (!nextBlockId) {
      return null;
    }
    return {
      pageId: currentPageId,
      blockId: nextBlockId,
    };
  }

  const pageIds = Object.keys(script.pages);
  const currentPageIndex = pageIds.indexOf(currentPageId);
  if (currentPageIndex < pageIds.length - 1) {
    const nextPageId = pageIds[currentPageIndex + 1];
    const nextPage = nextPageId ? script.pages[nextPageId] : undefined;
    const nextBlockId = nextPage?.blocks[0];
    if (!nextPageId || !nextBlockId) {
      return null;
    }
    return { pageId: nextPageId, blockId: nextBlockId };
  }

  return null;
};

const handleBlock = async (
    twiml: TwimlResponse,
  block: AudioBlock & { options?: Array<{ value: string; next?: string }> },
  campaignId: string,
  pageId: string,
  blockId: string,
  script: Script,
  workspace: string,
  baseUrl: string,
) => {
  if (block.options && block.options.length > 0) {
    const action = `${baseUrl}/api/ivr/${campaignId}/${pageId}/${blockId}/response`;
    // Only listen for speech when this step maps a spoken answer (#1856). A
    // keypad-only menu must ignore speech, or any phrase longer than two
    // characters falls through to the linear next block and skips the menu.
    const gathersSpeech = block.options.some(
      (option) => String(option.value).trim() === "vx-any",
    );
    // Nest the prompt inside <Gather> so a keypad press interrupts playback
    // (#1841). A sibling prompt is only read after it finishes, which is why
    // the caller had to wait out the whole block before the digits registered.
    const gather = twiml.gather({
      action,
      input: gathersSpeech ? ["dtmf", "speech"] : ["dtmf"],
      ...(gathersSpeech
        ? { speechTimeout: "auto", speechModel: "phone_call" }
        : {}),
      timeout: 5,
    });
    await handleAudio(gather, block, workspace);
    twiml.redirect(action);
    return;
  }

  await handleAudio(twiml, block, workspace);
  const nextLocation = findNextBlock(script, pageId, blockId);
  if (nextLocation) {
    twiml.redirect(
      `${baseUrl}/api/ivr/${campaignId}/${nextLocation.pageId}/${nextLocation.blockId}`,
    );
  } else {
    twiml.hangup();
  }
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
