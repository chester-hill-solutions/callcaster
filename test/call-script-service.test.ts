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
});
