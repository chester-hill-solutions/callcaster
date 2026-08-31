import { describe, expect, test } from "vitest";
import { documentToScript, scriptToDocument } from "@/lib/call-script-service";
import type { Script } from "@/lib/types";

describe("Callcaster ScriptKit adapter", () => {
  test("preserves recorded IVR playback and branching fields", () => {
    const script = {
      id: 42,
      name: "Recorded IVR",
      type: "ivr",
      steps: {
        pages: {
          welcome: {
            id: "welcome",
            title: "Welcome",
            blocks: ["prompt"],
          },
        },
        blocks: {
          prompt: {
            id: "prompt",
            type: "recorded",
            speechType: "recorded",
            title: "Greeting",
            content: "Press one for sales",
            audioFile: "welcome.mp3",
            options: [{ value: "1", content: "Sales", next: "sales" }],
          },
        },
      },
    } as unknown as Script;

    const roundTripped = documentToScript(script, scriptToDocument(script));

    expect(roundTripped.steps).toMatchObject({
      blocks: {
        prompt: {
          type: "recorded",
          speechType: "recorded",
          title: "Greeting",
          content: "Press one for sales",
          audioFile: "welcome.mp3",
          options: [{ value: "1", content: "Sales", next: "sales" }],
        },
      },
    });
  });

  test("backfills default titles onto untitled blocks without disturbing titled ones", () => {
    const script = {
      id: 43,
      name: "Legacy IVR",
      type: "ivr",
      steps: {
        pages: {
          page1: { id: "page1", title: "Welcome", blocks: ["a", "b"] },
        },
        blocks: {
          a: { id: "a", type: "textarea", prompt: "First" },
          b: {
            id: "b",
            type: "textarea",
            title: "Custom label",
            prompt: "Second",
          },
        },
      },
    } as unknown as Script;

    const document = scriptToDocument(script);

    expect(document.blocks.a?.title).toBe("Block 1");
    expect(document.blocks.b?.title).toBe("Custom label");
  });

  test("backfill is idempotent across an edit round-trip", () => {
    const script = {
      id: 44,
      name: "No titles",
      type: "script",
      steps: {
        pages: {
          page1: { id: "page1", title: "Page 1", blocks: ["a"] },
        },
        blocks: {
          a: { id: "a", type: "textarea", prompt: "Q" },
        },
      },
    } as unknown as Script;

    const once = scriptToDocument(script);
    const saved = documentToScript(script, once);
    const twice = scriptToDocument(saved);

    expect(once.blocks.a?.title).toBe("Block 1");
    expect(twice.blocks.a?.title).toBe("Block 1");
  });
});
