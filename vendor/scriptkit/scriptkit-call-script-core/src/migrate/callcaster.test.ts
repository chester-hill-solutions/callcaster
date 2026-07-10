import { describe, expect, test } from "bun:test";
import {
  migrateFromCallcasterFlow,
  serializeToCallcasterFlow,
} from "./callcaster.js";

// Mirrors the shape documented in docs/script-json-format.md and
// docs/example-script.json in the consuming app: options are keyed by
// { content, next } (not { value, label }), and every block carries an
// audioFile reference (possibly empty).
const callcasterFlow = {
  pages: {
    page_1: {
      id: "page_1",
      title: "Introduction",
      blocks: ["block_1", "block_2"],
    },
    page_2: {
      id: "page_2",
      title: "Main Questions",
      blocks: ["block_3", "block_4", "block_5"],
    },
    page_3: {
      id: "page_3",
      title: "Closing",
      blocks: ["block_6"],
    },
  },
  blocks: {
    block_1: {
      id: "block_1",
      type: "textarea",
      title: "Greeting",
      content: "Hello, my name is [Agent Name].",
      options: [],
      audioFile: "",
    },
    block_2: {
      id: "block_2",
      type: "select",
      title: "Initial Response",
      content: "Do you have a few minutes to talk?",
      options: [
        { content: "Yes", next: "block_3" },
        { content: "No", next: "block_6" },
        { content: "Call back later", next: "block_6" },
      ],
      audioFile: "greeting.mp3",
    },
    block_3: {
      id: "block_3",
      type: "textarea",
      title: "Service Introduction",
      content: "Great! Let me tell you more.",
      options: [],
      audioFile: "",
    },
    block_4: {
      id: "block_4",
      type: "radio",
      title: "Interest Level",
      content: "On a scale of 1-3, how interested are you?",
      options: [
        { content: "1 - Not interested", next: "block_6" },
        { content: "2 - Somewhat interested", next: "block_5" },
        { content: "3 - Very interested", next: "block_5" },
      ],
      audioFile: "interest.mp3",
    },
    block_5: {
      id: "block_5",
      type: "checkbox",
      title: "Follow-up Preferences",
      content: "What would be the best way to follow up?",
      options: [
        { content: "Email information", next: "block_6" },
        { content: "Schedule a demo", next: "block_6" },
        { content: "Call back next week", next: "block_6" },
      ],
      audioFile: "",
    },
    block_6: {
      id: "block_6",
      type: "textarea",
      title: "Closing",
      content: "Thank you for your time today.",
      options: [],
      audioFile: "closing.mp3",
    },
  },
};

describe("callcaster migrate/serialize round-trip", () => {
  test("every option.next survives migrate -> serialize", () => {
    const doc = migrateFromCallcasterFlow(callcasterFlow);
    const back = serializeToCallcasterFlow(doc);

    for (const [blockId, rawBlock] of Object.entries(callcasterFlow.blocks)) {
      const originalOptions = rawBlock.options ?? [];
      const roundTrippedOptions =
        (back.blocks[blockId]?.options as
          | Array<{ next?: string; content?: string }>
          | undefined) ?? [];

      expect(roundTrippedOptions).toHaveLength(originalOptions.length);
      originalOptions.forEach((original, index) => {
        expect(roundTrippedOptions[index]?.next).toBe(original.next);
        expect(roundTrippedOptions[index]?.content).toBe(original.content);
      });
    }
  });

  test("every block.audioFile survives migrate -> serialize", () => {
    const doc = migrateFromCallcasterFlow(callcasterFlow);
    const back = serializeToCallcasterFlow(doc);

    for (const [blockId, rawBlock] of Object.entries(callcasterFlow.blocks)) {
      expect(back.blocks[blockId]?.audioFile).toBe(rawBlock.audioFile);
    }
  });

  test("option value/label are populated from wire content (not left empty)", () => {
    const doc = migrateFromCallcasterFlow(callcasterFlow);
    const block2 = doc.blocks.block_2;
    expect(block2?.type).toBe("select");
    if (block2?.type === "select") {
      expect(block2.options[0]?.value).toBe("Yes");
      expect(block2.options[0]?.label).toBe("Yes");
      expect(block2.options[0]?.next).toBe("block_3");
    }
  });
});
