import { describe, expect, test } from "vitest";
import {
  validateIvrRouting,
  type IvrRoutingInput,
} from "@/lib/ivr-script-validation";

function menu(next: string): IvrRoutingInput {
  return {
    startPageId: "page_1",
    pages: {
      page_1: { id: "page_1", title: "Menu", blockIds: ["block_1"] },
      page_2: { id: "page_2", title: "Second", blockIds: ["block_2"] },
    },
    blocks: {
      block_1: {
        id: "block_1", type: "select", prompt: "Choose",
        options: [{ id: "option_1", value: "1", label: "Continue", next }],
      },
      block_2: {
        id: "block_2", type: "select", prompt: "Goodbye",
        options: [{ id: "option_2", value: "2", label: "End", next: "end" }],
      },
    },
  };
}

describe("inbound IVR routing contract (#2269)", () => {
  test.each([
    "queue:7", "forward:+15555550123", "voicemail:fixture@example.test",
    "hangup", "end", "page_2:block_2", "page_2",
  ])("accepts supported inbound target %s", (next) => {
    expect(validateIvrRouting(menu(next), { inbound: true }).ok).toBe(true);
  });

  test.each([
    "queue:0", "queue:-7", "queue:7junk", "queue:9007199254740992",
    "forward:15555550123", "forward:+0123", "forward:+15555550123:extra",
    "voicemail:broken", "voicemail:a..b@example.test", "voicemail:.a@example.test", "voicemail:a.@example.test", "block_2", "voicemail:fixture@", "page_2:missing",
    "page_2:block_1", "page_2:block_2:extra",
  ])("rejects invalid inbound target %s", (next) => {
    const result = validateIvrRouting(menu(next), { inbound: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "dangling")).toBe(true);
  });

  test.each(["queue:7", "forward:+15555550123", "voicemail:fixture@example.test"])(
    "does not enable inbound target %s for an outbound script", (next) => {
      expect(validateIvrRouting(menu(next)).ok).toBe(false);
    },
  );
});


describe("raw inbound document validation", () => {
  function wire() {
    return { startPageId: "menu", pages: { menu: { blocks: ["greeting"] } },
      blocks: { greeting: { type: "synthetic", audioFile: "Hello", options: [{ value: "1" }] } } };
  }
  test("retains a response with implicit linear continuation", async () => {
    const { validateInboundScriptSteps } = await import("@/lib/inbound-script-validation");
    expect(validateInboundScriptSteps(wire()).ok).toBe(true);
  });
  test.each(["audio", "instruction", "textblock", "infotext"])(
    "collects queue ownership requirements from raw %s responses", async (type) => {
      const { validateInboundScriptSteps } = await import("@/lib/inbound-script-validation");
      const flow = wire();
      const result = validateInboundScriptSteps({ ...flow, blocks: { greeting: {
        ...flow.blocks.greeting, type, options: [{ value: "1", next: "queue:7" }],
      } } });
      expect(result).toMatchObject({ ok: true, queueIds: [7] });
    },
  );
  test.each(["audio", "instruction", "textblock", "infotext"])(
    "rejects a raw %s response that migration would erase", async (type) => {
      const { validateInboundScriptSteps } = await import("@/lib/inbound-script-validation");
      const flow = wire();
      expect(validateInboundScriptSteps({ ...flow, blocks: { greeting: {
        ...flow.blocks.greeting, type, options: [{ value: "1", next: "missing:step" }],
      } } }).ok).toBe(false);
    },
  );
  test.each(["start", "block", "option", "no-input", "replay-limit"])("rejects raw %s errors before migration repairs them", async (fault) => {
    const { validateInboundScriptSteps } = await import("@/lib/inbound-script-validation");
    const flow = wire();
    const broken = fault === "start" ? { ...flow, startPageId: "missing" }
      : fault === "block" ? { ...flow, pages: { menu: { blocks: ["missing"] } } }
      : fault === "option" ? { ...flow, blocks: { greeting: { ...flow.blocks.greeting, options: [{ value: "1", next: 7 }] } } }
      : { ...flow, blocks: { greeting: { ...flow.blocks.greeting, noInput: fault === "no-input"
          ? { action: { pageId: "menu", blockId: "missing" } } : { action: "replay", maxReplays: -1 } } } };
    expect(validateInboundScriptSteps(broken).ok).toBe(false);
  });
  test.each(["next", "hangup", "replay"])("accepts supported bounded no-input action %s", async (action) => {
    const { validateInboundScriptSteps } = await import("@/lib/inbound-script-validation");
    const flow = wire();
    expect(validateInboundScriptSteps({ ...flow, blocks: { greeting: { ...flow.blocks.greeting,
      noInput: { action, maxReplays: 2 } } } }).ok).toBe(true);
  });
});
