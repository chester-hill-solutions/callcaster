import { describe, expect, test } from "vitest";

import { extractScriptQuestions } from "@/lib/campaign-export-helpers.server";

// The types match `ExportScript` in campaign-export-helpers.server (its shape is
// intentionally loose since real scripts arrive from customer data).
type BlockFixture = {
  id: string;
  type: string;
  title?: string;
  content?: string;
  callcasterType?: string;
};

function scriptWithBlocks(...blocks: BlockFixture[]) {
  return {
    steps: {
      pages: {
        page_1: { title: "P1", blocks: blocks.map((b) => b.id) },
      },
      blocks: Object.fromEntries(blocks.map((b) => [b.id, b])),
    },
  } as unknown as Parameters<typeof extractScriptQuestions>[0];
}

describe("extractScriptQuestions (#1280)", () => {
  test("emits a column for every scriptkit interactive doc type", () => {
    // The previous filter checked `block.type === "question" | "recorded" |
    // "dtmf"` — literal values that don't exist in the current scriptkit
    // schema, so real scripts produced zero question columns and the CSV
    // dumped the raw response JSON into `full_result` alone (Sai's report:
    // `{"block_1": "blah blah", "block_2": "Yes"}`).
    const questions = extractScriptQuestions(
      scriptWithBlocks(
        { id: "block_1", type: "yes_no", content: "Are you registered?" },
        { id: "block_2", type: "choice", content: "Priority issue?" },
        { id: "block_3", type: "text", content: "Anything else?" },
        { id: "block_4", type: "textarea", content: "Comments" },
        { id: "block_5", type: "select", content: "Party affiliation" },
        { id: "block_6", type: "radio", content: "Contact method" },
        { id: "block_7", type: "checkbox", content: "Interests" },
        { id: "block_8", type: "support", content: "Support level" },
      ),
    );
    expect(questions.map((q) => q.title)).toEqual([
      "Are you registered?",
      "Priority issue?",
      "Anything else?",
      "Comments",
      "Party affiliation",
      "Contact method",
      "Interests",
      "Support level",
    ]);
  });

  test("excludes `instruction` display-only blocks", () => {
    const questions = extractScriptQuestions(
      scriptWithBlocks(
        { id: "instr", type: "instruction", content: "Intro" },
        { id: "block_1", type: "radio", content: "Real question" },
      ),
    );
    expect(questions.map((q) => q.id)).toEqual(["block_1"]);
  });

  test("id matches the key the IVR response webhook writes: falls back to blockId when title is blank", () => {
    // response.action.server.ts stores `[currentBlock.title || blockId]: userInput`.
    // The exporter's `q.id` MUST use the same rule so `responses[q.id]` finds
    // the actual answer instead of leaving the column blank.
    const questions = extractScriptQuestions(
      scriptWithBlocks(
        { id: "block_1", type: "radio", content: "Q1" }, // no title
        { id: "block_2", type: "radio", title: "TitledKey", content: "Q2" },
      ),
    );
    expect(questions).toEqual([
      { id: "block_1", title: "Q1" },
      { id: "TitledKey", title: "Q2" },
    ]);
  });

  test("recorded/synthetic IVR blocks are included even if the scriptkit doc type is `instruction`", () => {
    // Some IVR authoring paths persist a wire-shaped block whose scriptkit doc
    // type is `instruction` but whose `callcasterType` marks it as IVR audio
    // that captures a DTMF/speech response — include those.
    const questions = extractScriptQuestions(
      scriptWithBlocks(
        {
          id: "block_1",
          type: "instruction",
          callcasterType: "recorded",
          content: "Press 1 for yes",
        },
        {
          id: "block_2",
          type: "instruction",
          callcasterType: "say",
          content: "Thanks for calling",
        },
      ),
    );
    expect(questions.map((q) => q.id)).toEqual(["block_1"]);
  });
});
