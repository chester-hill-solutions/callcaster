import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { resolveIvrPromptObjectKey } from "@/lib/ivr-wav.server";
import { resolveVoiceForBlock } from "@/lib/tts-voices";
import {
  appendBlockResponse,
  type AudioTarget,
  type IvrOption,
} from "@/lib/ivr-block-runtime.server";
import type { TwimlResponse } from "@/lib/twilio-twiml.server";

/**
 * Shared outbound IVR block renderer (#1842).
 *
 * The flow-entry page route used to answer with a `<Redirect>` to the first
 * block's URL, so every call paid an extra Twilio round-trip (and a second
 * call+campaign lookup) before any audio. Both the page route and the block
 * route now render through here, so the first block is emitted inline.
 *
 * Keeping one implementation matters: the block shape (speech fallback, voice
 * roster, signed audio URL) must be identical whichever route renders it.
 */

export type IvrRenderScript = {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<
    string,
    {
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
    }
  >;
};

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

const renderAudio = async (
  target: AudioTarget,
  block: AudioBlock,
  workspace: string,
) => {
  const { type, audioFile } = block;
  if (type === "recorded") {
    // Prefer the Twilio-friendly WAV sidecar when it exists (#1842); the MP3
    // stays the fallback, so prompts uploaded before the sidecar existed still
    // play.
    const objectKey = await resolveIvrPromptObjectKey(workspace, audioFile);
    const signedUrl = await createSignedObjectUrl("workspaceAudio", objectKey, 3600);
    target.play(signedUrl);
  } else {
    // `audioFile` on a synthetic block actually stores the speech text —
    // legacy field naming from the wire format; the editor labels it
    // "Speech text" for these blocks.
    // Cast is safe: TTS_VOICES only contains Polly Neural IDs Twilio's
    // SayVoice union already lists; the string→SayVoice widening is
    // just because `as const satisfies readonly TtsVoice[]` on the
    // roster still surfaces `.id` as `string`.
    const speech = synthesizedSpeechText(block);
    if (!speech) return;
    target.say(
      { voice: resolveVoiceForBlock(block) as Parameters<typeof target.say>[0]["voice"] },
      speech,
    );
  }
};

export async function renderIvrBlock({
  twiml,
  block,
  pageId,
  blockId,
  script,
  workspace,
  buildActionUrl,
  buildBlockUrl,
}: {
  twiml: TwimlResponse;
  block: AudioBlock & { options?: IvrOption[] };
  pageId: string;
  blockId: string;
  script: IvrRenderScript;
  workspace: string;
  buildActionUrl: (pageId: string, blockId: string) => string;
  buildBlockUrl: (pageId: string, blockId: string) => string;
}): Promise<void> {
  await appendBlockResponse({
    twiml,
    block,
    pageId,
    blockId,
    script,
    buildActionUrl,
    buildBlockUrl,
    renderAudio: (target, b) => renderAudio(target, b, workspace),
  });
}
