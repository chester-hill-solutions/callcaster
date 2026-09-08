import {
  isIvrPlaybackType,
  type ScriptBlock,
  type ScriptDocument,
  type ScriptOption,
} from "@chester-hill-solutions/scriptkit-call-script-core";

/**
 * Editor-side model for IVR ("audio") scripts.
 *
 * The IVR runtime (`app/routes/api+/ivr/$campaignId/$pageId/$blockId`) reads
 * exactly three things off a block: its wire `type` ("recorded" plays a
 * library file, anything else is spoken), `audioFile` (the file name, or the
 * text to speak), and `options[].value` (a keypad digit, or `vx-any` for any
 * spoken reply). It never reads `prompt` or `content`. Every helper here keeps
 * the editor on that contract so what the author sees is what the caller hears.
 */

export type IvrPlaybackMode = "recorded" | "synthetic";

/** Script rows whose steps are played to a caller rather than read by an agent. */
export function isAudioScriptType(type: string | null | undefined): boolean {
  return type === "ivr" || type === "inbound_ivr";
}

/**
 * How the runtime will play a block. `callcasterType` wins because it is the
 * wire `type`; the legacy `speechType` mirror is honoured only for blocks
 * authored before the playback type moved onto `type`.
 */
export function getIvrPlaybackMode(block: {
  callcasterType?: string;
  speechType?: string;
}): IvrPlaybackMode {
  if (block.callcasterType === "recorded") return "recorded";
  if (isIvrPlaybackType(block.callcasterType)) return "synthetic";
  if (block.speechType === "recorded") return "recorded";
  return "synthetic";
}

/** Patch that switches a block's playback mode on the wire. */
export function playbackModePatch(
  block: { speechType?: string },
  mode: IvrPlaybackMode,
): Partial<ScriptBlock> {
  return {
    callcasterType: mode,
    ...(block.speechType !== undefined ? { speechType: mode } : {}),
  } as Partial<ScriptBlock>;
}

/**
 * Patch fragment that makes a block a playback step if it is not one yet.
 *
 * A block added through the generic "Add block" control, or attached from a
 * live-call script, carries an input wire type such as `textarea`. The runtime
 * still speaks its `audioFile`, so editing the speech text is enough to make
 * it audible; this pins the wire type so the intent survives export, results,
 * and any later block-type change.
 */
export function ensurePlaybackTypePatch(block: {
  callcasterType?: string;
  speechType?: string;
}): Partial<ScriptBlock> {
  if (isIvrPlaybackType(block.callcasterType)) return {};
  return { callcasterType: getIvrPlaybackMode(block) } as Partial<ScriptBlock>;
}

/** `wireExtras.voice` as written by the editor and read by the runtime roster. */
export function getBlockVoice(block: {
  wireExtras?: Record<string, unknown> | null;
}): string | undefined {
  const voice = block.wireExtras?.voice;
  return typeof voice === "string" && voice.length > 0 ? voice : undefined;
}

export function voicePatch(
  block: { wireExtras?: Record<string, unknown> | null },
  voice: string,
): Partial<ScriptBlock> {
  return {
    wireExtras: { ...(block.wireExtras ?? {}), voice },
  } as Partial<ScriptBlock>;
}

/** Sentinel the runtime matches against any spoken reply. */
export const IVR_ANY_SPEECH_VALUE = "vx-any";

export type IvrResponseKey = { value: string; label: string };

/**
 * Keypad values a caller can answer with. `#` is deliberately absent: Twilio's
 * Gather treats it as the finish key and never delivers it as a digit.
 */
export const IVR_RESPONSE_KEYS: readonly IvrResponseKey[] = [
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*"].map((digit) => ({
    value: digit,
    label: `Press ${digit}`,
  })),
  { value: IVR_ANY_SPEECH_VALUE, label: "Any spoken reply" },
];

export function isKnownIvrResponseKey(value: string): boolean {
  return IVR_RESPONSE_KEYS.some((key) => key.value === value);
}

let editorIdCounter = 0;

/** Editor-only ids in the same shape scriptkit's own factory produces. */
export function createEditorId(prefix: string): string {
  editorIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${editorIdCounter}`;
}

/** Next unused "Step N" title, numbered past every step already in the document. */
export function nextIvrStepTitle(blocks: ScriptDocument["blocks"]): string {
  let highest = 0;
  for (const block of Object.values(blocks)) {
    const match = block.title?.match(/^Step (\d+)$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Step ${Math.max(highest, Object.keys(blocks).length) + 1}`;
}

/**
 * A fresh playback step. `select` is the editor-side type so caller responses
 * are editable from the start; the wire type is the playback mode.
 */
export function createIvrStepBlock(
  mode: IvrPlaybackMode,
  id: string,
  title: string,
): ScriptBlock {
  return {
    id,
    type: "select",
    title,
    prompt: "",
    options: [],
    audioFile: "",
    callcasterType: mode,
  } as ScriptBlock;
}

export function createIvrResponseOption(): ScriptOption {
  return { id: createEditorId("opt"), value: "", label: "" };
}

/** Same-origin URL that streams one library recording for in-editor preview. */
export function workspaceAudioPreviewPath(
  workspaceId: string,
  fileName: string,
): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/audios/${encodeURIComponent(fileName)}/preview`;
}
