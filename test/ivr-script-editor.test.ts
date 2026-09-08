import { describe, expect, test } from "vitest";
import { createCallScriptService } from "@chester-hill-solutions/scriptkit-call-script-core";

import {
  IVR_ANY_SPEECH_VALUE,
  IVR_RESPONSE_KEYS,
  createIvrStepBlock,
  ensurePlaybackTypePatch,
  getBlockVoice,
  getIvrPlaybackMode,
  isAudioScriptType,
  isKnownIvrResponseKey,
  nextIvrStepTitle,
  playbackModePatch,
  voicePatch,
  workspaceAudioPreviewPath,
} from "@/lib/ivr-script-editor";

describe("IVR script editor model", () => {
  test("only IVR script types are audio scripts", () => {
    expect(isAudioScriptType("ivr")).toBe(true);
    expect(isAudioScriptType("inbound_ivr")).toBe(true);
    expect(isAudioScriptType("script")).toBe(false);
    expect(isAudioScriptType(undefined)).toBe(false);
  });

  test("playback mode follows the wire type first, then the legacy mirror", () => {
    expect(getIvrPlaybackMode({ callcasterType: "recorded" })).toBe("recorded");
    expect(getIvrPlaybackMode({ callcasterType: "synthetic" })).toBe("synthetic");
    expect(getIvrPlaybackMode({ callcasterType: "say" })).toBe("synthetic");
    // The runtime plays a file only for wire type "recorded"; a legacy mirror
    // on an input-typed block still shows as recorded so the author sees the
    // mismatch and the next edit repairs the wire type.
    expect(getIvrPlaybackMode({ callcasterType: "textarea", speechType: "recorded" })).toBe("recorded");
    expect(getIvrPlaybackMode({ callcasterType: "textarea" })).toBe("synthetic");
    expect(getIvrPlaybackMode({})).toBe("synthetic");
  });

  test("switching mode writes the wire type and keeps the legacy mirror in step", () => {
    expect(playbackModePatch({}, "recorded")).toEqual({ callcasterType: "recorded" });
    expect(playbackModePatch({ speechType: "synthetic" }, "recorded")).toEqual({
      callcasterType: "recorded",
      speechType: "recorded",
    });
  });

  test("editing audio on an input-typed block pins the playback type", () => {
    expect(ensurePlaybackTypePatch({ callcasterType: "textarea" })).toEqual({
      callcasterType: "synthetic",
    });
    expect(ensurePlaybackTypePatch({ callcasterType: "select", speechType: "recorded" })).toEqual({
      callcasterType: "recorded",
    });
    // Already a playback step: nothing to repair, and "say" is left alone.
    expect(ensurePlaybackTypePatch({ callcasterType: "say" })).toEqual({});
    expect(ensurePlaybackTypePatch({ callcasterType: "recorded" })).toEqual({});
  });

  test("voice lives in wireExtras and survives other extras", () => {
    const block = { wireExtras: { responseType: "dtmf" } };
    expect(getBlockVoice(block)).toBeUndefined();
    const patched = voicePatch(block, "Polly.Matthew-Neural");
    expect(patched).toEqual({
      wireExtras: { responseType: "dtmf", voice: "Polly.Matthew-Neural" },
    });
    expect(getBlockVoice(patched as { wireExtras: Record<string, unknown> })).toBe(
      "Polly.Matthew-Neural",
    );
  });

  test("response keys are what Gather can deliver: digits, star, any speech — never #", () => {
    const values = IVR_RESPONSE_KEYS.map((key) => key.value);
    expect(values).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", IVR_ANY_SPEECH_VALUE]);
    expect(values).not.toContain("#");
    expect(isKnownIvrResponseKey("1")).toBe(true);
    expect(isKnownIvrResponseKey("vx-any")).toBe(true);
    expect(isKnownIvrResponseKey("yes")).toBe(false);
  });

  test("step titles number past every existing step", () => {
    expect(nextIvrStepTitle({})).toBe("Step 1");
    expect(
      nextIvrStepTitle({
        a: { id: "a", type: "textarea", prompt: "", title: "Step 4" },
        b: { id: "b", type: "textarea", prompt: "", title: "Welcome" },
      }),
    ).toBe("Step 5");
  });

  test("a new step serializes to the playback wire type the runtime reads", () => {
    const scripts = createCallScriptService();
    const spoken = createIvrStepBlock("synthetic", "b1", "Step 1");
    const recorded = createIvrStepBlock("recorded", "b2", "Step 2");
    const flow = scripts.serializeToCallcasterFlow({
      version: 1,
      startPageId: "p1",
      pageOrder: ["p1"],
      pages: { p1: { id: "p1", title: "Page 1", blockIds: ["b1", "b2"] } },
      blocks: { b1: spoken, b2: recorded },
    });
    expect(flow.blocks.b1).toMatchObject({ type: "synthetic", audioFile: "", title: "Step 1", options: [] });
    expect(flow.blocks.b2).toMatchObject({ type: "recorded", audioFile: "" });
  });

  test("preview path is same-origin and encodes the file name", () => {
    expect(workspaceAudioPreviewPath("ws-1", "Greeting 2.mp3")).toBe(
      "/workspaces/ws-1/audios/Greeting%202.mp3/preview",
    );
  });
});
