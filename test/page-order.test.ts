import { describe, expect, test } from "vitest";
import { orderedIvrPageIds, resolveIvrEntryPageId } from "@/lib/ivr-page-order";
import { appendBlockResponse, findNextBlock } from "@/lib/ivr-block-runtime.server";
import { validateScriptSteps } from "@/lib/call-script-service";
import { createVoiceResponse } from "@/lib/twilio-twiml.server";

const script = {
  pages: { page_1: { blocks: ["a", "a2"] }, tiny: { blocks: ["b"] }, chosen_start: { blocks: ["c"] } },
  blocks: {
    a: { id: "a", type: "instruction" }, a2: { id: "a2", type: "instruction" },
    b: { id: "b", type: "instruction" }, c: { id: "c", type: "instruction" },
  },
  startPageId: "chosen_start", pageOrder: ["chosen_start", "page_1", "tiny"],
};

describe("saved IVR entry and page order (#2087)", () => {
  test("entry uses the declared start rather than page_1 or object key order", () => {
    expect(resolveIvrEntryPageId(script)).toBe("chosen_start");
  });
  test("a dangling declared start does not select a different page", () => {
    expect(resolveIvrEntryPageId({ ...script, startPageId: "deleted" })).toBeUndefined();
  });
  test("a legacy entry uses the first ordered page", () => {
    expect(resolveIvrEntryPageId({ pages: script.pages, pageOrder: ["tiny", "page_1"] })).toBe("tiny");
    expect(resolveIvrEntryPageId({ pages: script.pages })).toBe("page_1");
  });
  test("empty pages have no entry", () => {
    expect(resolveIvrEntryPageId({ pages: {} })).toBeUndefined();
  });
  test("order drops unknown and repeated IDs and appends omitted pages", () => {
    expect(orderedIvrPageIds({ pages: script.pages, pageOrder: ["deleted", "tiny", "tiny"] }))
      .toEqual(["tiny", "page_1", "chosen_start"]);
  });
  test("legacy order preserves existing page order", () => {
    expect(orderedIvrPageIds({ pages: script.pages })).toEqual(["page_1", "tiny", "chosen_start"]);
  });
  test("within-page progression remains intact", () => {
    expect(findNextBlock(script, "page_1", "a")).toEqual({ pageId: "page_1", blockId: "a2" });
  });
  test("fall-through follows saved order, not object key order", () => {
    expect(findNextBlock(script, "chosen_start", "c")).toEqual({ pageId: "page_1", blockId: "a" });
    expect(findNextBlock(script, "tiny", "b")).toBeNull();
  });
  test("unmentioned pages remain reachable after ordered pages", () => {
    expect(findNextBlock({ ...script, pageOrder: ["tiny"] }, "tiny", "b"))
      .toEqual({ pageId: "page_1", blockId: "a" });
  });
  test("prompt-only rendering uses saved next-page order in emitted XML", async () => {
    const twiml = createVoiceResponse();
    await appendBlockResponse({ twiml, block: {}, pageId: "chosen_start", blockId: "c", script,
      buildActionUrl: (p, b) => `/answer/${p}/${b}`, buildBlockUrl: (p, b) => `/block/${p}/${b}`,
      renderAudio: async (target) => { target.say("Saved entry"); },
    });
    expect(twiml.toString()).toContain("<Say>Saved entry</Say><Redirect>/block/page_1/a</Redirect>");
  });
  test("dangling raw entry fails validation before migration can repair it", () => {
    const result = validateScriptSteps({ ...script, startPageId: "deleted" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/start page.*deleted/i);
  });
  test("valid and legacy entries still pass validation", () => {
    expect(validateScriptSteps(script).ok).toBe(true);
    expect(validateScriptSteps({ pages: script.pages, blocks: script.blocks }).ok).toBe(true);
  });
});
