import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { documentToScript, scriptToDocument } from "@/lib/call-script-service";
import type { Script } from "@/lib/types";

/**
 * Golden round-trip contract for `script.steps`.
 *
 * `steps` is live production jsonb, read at runtime by the agent-facing
 * renderer (`Result.tsx`) and by the IVR routes under `api+/ivr/`. Opening a
 * script in the builder and saving it runs the whole document through
 * migrate -> serialize, so anything these fixtures assert is, in practice,
 * "what survives a user pressing Save".
 *
 * The fixtures cover the shapes that actually exist in the wild:
 * - legacy-icons: the vocabulary `Result.tsx` renders (radio/boolean/dropdown/
 *   multi/textblock) plus the `Icon` option discriminant and block-level `text`.
 * - documented-format: the shape `docs/script-json-format.md` tells users to
 *   upload (select, options keyed by { content, next } with no `value`).
 * - ivr-recorded: recorded/synthetic/say playback with audioFile + responseType.
 * - multi-page-branching: cross-page routing via option.next.
 */

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/script-wire",
);

const FIXTURES = [
  "legacy-icons",
  "documented-format",
  "ivr-recorded",
  "multi-page-branching",
  "legacy-display-blocks",
] as const;

type WireFlow = {
  pages: Record<string, { id?: string; title?: string; blocks?: string[] }>;
  blocks: Record<string, Record<string, unknown>>;
};

function loadFixture(name: string): WireFlow {
  return JSON.parse(
    readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"),
  ) as WireFlow;
}

function roundTrip(steps: WireFlow): WireFlow {
  const script = { id: 1, name: "fixture", type: "script", steps } as unknown as Script;
  return documentToScript(script, scriptToDocument(script)).steps as unknown as WireFlow;
}

/** Types `Result.tsx`'s switch renders an input for. Anything else falls to `default: return null`. */
const RESULT_INPUT_TYPES = ["radio", "boolean", "dropdown", "multi", "textarea", "select", "checkbox"];

describe.each(FIXTURES)("wire round-trip: %s", (name) => {
  const original = loadFixture(name);
  const result = roundTrip(original);

  test("preserves every block's wire type", () => {
    for (const [blockId, block] of Object.entries(original.blocks)) {
      expect(result.blocks[blockId]?.type, `block ${blockId}`).toBe(block.type);
    }
  });

  test("preserves page block arrays and their order", () => {
    for (const [pageId, page] of Object.entries(original.pages)) {
      expect(result.pages[pageId]?.blocks, `page ${pageId}`).toEqual(page.blocks);
    }
  });

  test("preserves every scalar block field that was present", () => {
    for (const [blockId, block] of Object.entries(original.blocks)) {
      for (const [key, value] of Object.entries(block)) {
        if (key === "options") continue;
        expect(
          result.blocks[blockId]?.[key],
          `block ${blockId}.${key}`,
        ).toEqual(value);
      }
    }
  });

  test("preserves every option field that was present", () => {
    for (const [blockId, block] of Object.entries(original.blocks)) {
      const options = block.options as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(options) || options.length === 0) continue;

      const resultOptions = result.blocks[blockId]?.options as
        | Array<Record<string, unknown>>
        | undefined;
      expect(resultOptions, `block ${blockId} options`).toHaveLength(options.length);

      options.forEach((option, index) => {
        for (const [key, value] of Object.entries(option)) {
          expect(
            resultOptions?.[index]?.[key],
            `block ${blockId} option[${index}].${key}`,
          ).toEqual(value);
        }
      });
    }
  });

  test("is idempotent — a second round-trip changes nothing", () => {
    expect(roundTrip(result)).toEqual(result);
  });
});

describe("wire round-trip: renderability", () => {
  test("legacy Icon options survive a save", () => {
    // Result.tsx:60 uses `option.Icon` as a rendering discriminant. Dropping it
    // silently turns icon buttons and the SupportButton into plain buttons.
    const result = roundTrip(loadFixture("legacy-icons"));
    const options = result.blocks.b_radio?.options as Array<Record<string, unknown>>;

    expect(options[0]?.Icon).toBe("SupportButton");
    expect(options[1]?.Icon).toBe("ThumbUp");
    expect(options[2]?.Icon).toBe("ThumbDown");
  });

  test("block-level `text` survives a save", () => {
    // Result.tsx:139 reads `questions.text || questions.content` for boolean blocks.
    const result = roundTrip(loadFixture("legacy-icons"));
    expect(result.blocks.b_bool?.text).toBe("Consent given");
  });

  test("IVR responseType survives a save", () => {
    const result = roundTrip(loadFixture("ivr-recorded"));
    expect(result.blocks.b_menu?.responseType).toBe("dtmf");
    expect(result.blocks.b_vm?.responseType).toBe("speech");
  });

  test("IVR option values stay DTMF-matchable strings", () => {
    // response.action.server.ts:64 matches String(option.value).trim() against digits.
    const result = roundTrip(loadFixture("ivr-recorded"));
    const options = result.blocks.b_menu?.options as Array<Record<string, unknown>>;
    expect(options.map((o) => o.value)).toEqual(["1", "2", "vx-any"]);
    expect(options.map((o) => o.next)).toEqual(["page_sales", "page_voicemail", "page_sales"]);
  });

  test("every fixture block with options emits a type Result.tsx can render", () => {
    for (const name of FIXTURES) {
      const result = roundTrip(loadFixture(name));
      for (const [blockId, block] of Object.entries(result.blocks)) {
        const options = block.options as unknown[] | undefined;
        if (!Array.isArray(options) || options.length === 0) continue;
        // IVR playback types are consumed by the IVR routes, not Result.tsx.
        if (["recorded", "synthetic", "say"].includes(String(block.type))) continue;
        expect(RESULT_INPUT_TYPES, `${name} / ${blockId}`).toContain(String(block.type));
      }
    }
  });
});

/**
 * The fixtures above all describe blocks that already exist on the wire, and
 * those keep their original type via `callcasterType`. Newly authored blocks
 * have no `callcasterType`, which is a separate path — and the one that used
 * to emit types nothing renders.
 */
describe("wire types for newly authored blocks", () => {
  function newBlockWireType(type: string): string {
    const doc = {
      version: 1 as const,
      startPageId: "p1",
      pageOrder: ["p1"],
      pages: { p1: { id: "p1", title: "Page", blockIds: ["b1"] } },
      blocks: {
        b1: { id: "b1", type, prompt: "Prompt", options: [{ id: "o1", value: "a", label: "A" }] },
      },
    };
    const script = { id: 1, name: "n", type: "script", steps: {} } as unknown as Script;
    const wire = documentToScript(script, doc as never).steps as unknown as WireFlow;
    return String(wire.blocks.b1?.type);
  }

  test.each([
    ["select", "select"],
    ["radio", "radio"],
    ["checkbox", "checkbox"],
    ["textarea", "textarea"],
  ])("a new %s block serializes to a renderable type", (docType, expected) => {
    const wireType = newBlockWireType(docType);
    expect(wireType).toBe(expected);
    expect(RESULT_INPUT_TYPES).toContain(wireType);
  });

  test("a new instruction block serializes to textblock", () => {
    // `textblock` is the type declared in app/lib/types.ts Block union.
    expect(newBlockWireType("instruction")).toBe("textblock");
  });
});

describe("legacy wire types are never rewritten", () => {
  test.each([
    ["dropdown", "b_drop"],
    ["multi", "b_multi"],
    ["boolean", "b_bool"],
    ["textblock", "b_textblock"],
  ])("an existing %s block stays a %s", (wireType, blockId) => {
    const result = roundTrip(loadFixture("legacy-icons"));
    expect(result.blocks[blockId]?.type).toBe(wireType);
  });

  test.each([
    // "Static Text" in the old live-call editor. Display-only: rewriting it to
    // textarea would turn a script the agent reads aloud into an input box.
    ["infotext", "b_infotext"],
    // Declared in app/lib/types.ts Block but never offered by either legacy
    // editor. Preserved regardless — being unused is not a licence to rewrite.
    ["audio", "b_audio"],
    // The load-bearing case: this package cannot enumerate every type ever
    // written to `steps`, so an unrecognised type must survive untouched.
    ["some_future_type", "b_future"],
  ])("an existing %s block stays a %s", (wireType, blockId) => {
    const result = roundTrip(loadFixture("legacy-display-blocks"));
    expect(result.blocks[blockId]?.type).toBe(wireType);
  });

  test("an unrecognised block keeps its unmodelled fields too", () => {
    const result = roundTrip(loadFixture("legacy-display-blocks"));
    expect(result.blocks.b_future?.customField).toBe("must survive");
  });

  test.each([
    ["b_infotext"],
    ["b_audio"],
  ])("%s opens in the editor as an instruction, not an input", (blockId) => {
    // These have no input case in Result.tsx — it renders their content and
    // nothing else. They had no entry in the old type map either, so they fell
    // through to `textarea` and opened in the builder as free-text inputs,
    // misrepresenting a display-only block as something the agent types into.
    const doc = scriptToDocument({
      id: 1,
      name: "n",
      type: "script",
      steps: loadFixture("legacy-display-blocks"),
    } as unknown as Script);

    expect(doc.blocks[blockId]?.type).toBe("instruction");
  });

  test("IVR playback types are preserved", () => {
    const result = roundTrip(loadFixture("ivr-recorded"));
    expect(result.blocks.b_greeting?.type).toBe("recorded");
    expect(result.blocks.b_sales?.type).toBe("synthetic");
    expect(result.blocks.b_vm?.type).toBe("say");
  });
});

describe("page order and start page survive jsonb", () => {
  // `steps` is jsonb, which re-sorts object keys by length then bytewise and
  // discards insertion order. Page order and the start page therefore cannot
  // be implied by `pages` key order and must be persisted explicitly.
  test("pageOrder is persisted as an array", () => {
    const result = roundTrip(loadFixture("multi-page-branching")) as unknown as {
      pageOrder: string[];
    };
    expect(result.pageOrder).toEqual(["intro", "qualified", "unqualified"]);
  });

  test("startPageId is persisted", () => {
    const result = roundTrip(loadFixture("multi-page-branching")) as unknown as {
      startPageId: string;
    };
    expect(result.startPageId).toBe("intro");
  });

  test("an explicit startPageId is honoured over key order", () => {
    const flow = loadFixture("multi-page-branching") as unknown as Record<string, unknown>;
    flow.startPageId = "qualified";
    flow.pageOrder = ["qualified", "intro", "unqualified"];
    const result = roundTrip(flow as unknown as WireFlow) as unknown as {
      startPageId: string;
      pageOrder: string[];
    };
    expect(result.startPageId).toBe("qualified");
    expect(result.pageOrder).toEqual(["qualified", "intro", "unqualified"]);
  });
});
