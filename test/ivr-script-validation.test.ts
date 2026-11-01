import { describe, expect, test } from "vitest";
import { validateIvrRouting, type IvrRoutingInput } from "../app/lib/ivr-script-validation";

/** Linear document: page_1 -> block_1 (option 1 -> end; option 2 -> block_2a), then hangup. */
function makeDocument(overrides?: Partial<IvrRoutingInput>): IvrRoutingInput {
  return {
    startPageId: "page_1",
    pages: {
      page_1: { id: "page_1", blockIds: ["block_a", "block_b"] },
      page_2: { id: "page_2", blockIds: ["block_a2", "block_b2"] },
    },
    blocks: {
      block_a: {
        id: "block_a",
        options: [{ id: "o1", value: "1", label: "One", next: "end" }],
      },
      block_b: {
        id: "block_b",
        options: [{ id: "o2", value: "2", label: "Two", next: "hangup" }],
      },
      block_a2: { id: "block_a2", options: [] },
      block_b2: { id: "block_b2", options: [] },
    },
    ...overrides,
  };
}

describe("validateIvrRouting", () => {
  test("accepts a linear script that ends at hangup/end", () => {
    const result = validateIvrRouting(makeDocument());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test("flags a dangling option target", () => {
    const doc = makeDocument({
      blocks: {
        ...makeDocument().blocks,
        block_a: {
          id: "block_a",
          options: [{ id: "o1", value: "1", label: "One", next: "block_ghost" }],
        },
      },
    });
    const result = validateIvrRouting(doc);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ kind: "dangling", sourceBlock: "block_a", target: "block_ghost" }),
    );
  });

  test("flags a routing cycle (A -> B -> A)", () => {
    const doc = makeDocument({
      blocks: {
        block_a: {
          id: "block_a",
          options: [{ id: "o1", value: "1", label: "One", next: "block_b" }],
        },
        block_b: {
          id: "block_b",
          options: [{ id: "o2", value: "2", label: "Two", next: "block_a" }],
        },
        block_a2: { id: "block_a2", options: [] },
        block_b2: { id: "block_b2", options: [] },
      },
    });
    const result = validateIvrRouting(doc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "cycle")).toBe(true);
  });

  test("accepts page:block and cross-page targets that resolve", () => {
    const doc = makeDocument({
      blocks: {
        block_a: {
          id: "block_a",
          options: [
            { id: "o1", value: "1", label: "One", next: "page_2:block_a2" },
            { id: "o2", value: "2", label: "Two", next: "page_2" },
          ],
        },
        block_b: {
          id: "block_b",
          options: [{ id: "o3", value: "3", label: "Three", next: "hangup" }],
        },
        block_a2: { id: "block_a2", options: [] },
        block_b2: { id: "block_b2", options: [] },
      },
    });
    const result = validateIvrRouting(doc);
    expect(result.ok).toBe(true);
  });

  test("flags a missing page and an empty page target as dangling", () => {
    const doc = makeDocument({
      pages: {
        page_1: { id: "page_1", blockIds: ["block_a", "block_b"] },
        page_empty: { id: "page_empty", blockIds: [] },
      },
      blocks: {
        block_a: {
          id: "block_a",
          options: [
            { id: "o1", value: "1", label: "One", next: "page_missing" },
            { id: "o2", value: "2", label: "Two", next: "page_empty" },
          ],
        },
        block_b: {
          id: "block_b",
          options: [{ id: "o3", value: "3", label: "Three", next: "hangup" }],
        },
      },
    });
    const result = validateIvrRouting(doc);
    expect(result.ok).toBe(false);
    expect(result.issues.filter((issue) => issue.kind === "dangling").length).toBe(2);
  });

  test("reports the saved name for the three-step Support self-loop (#2776)", () => {
    const doc: IvrRoutingInput = {
      startPageId: "page_survey",
      pages: { page_survey: { id: "page_survey", title: "Survey", blockIds: ["block_intro", "block_mupwwvov_2", "block_finish"] } },
      blocks: {
        block_intro: { id: "block_intro", type: "select", title: "Introduction", prompt: "Welcome", options: [{ id: "intro_next", value: "1", label: "Continue", next: "block_mupwwvov_2" }] },
        block_mupwwvov_2: { id: "block_mupwwvov_2", type: "select", title: "Support", prompt: "Choose", options: [
          { id: "support_rory", value: "1", label: "Rory Nisan", next: "block_mupwwvov_2" },
          { id: "support_next", value: "2", label: "Continue", next: "block_finish" },
        ] },
        block_finish: { id: "block_finish", type: "select", title: "Goodbye", prompt: "Thank you", options: [{ id: "finish_end", value: "1", label: "Finish", next: "hangup" }] },
      },
    };
    expect(validateIvrRouting(doc)).toEqual({ ok: false, issues: [{
      kind: "cycle", blockId: "block_mupwwvov_2",
      error: 'Routing cycle detected: step "Support" loops back on itself without reaching "Hang up" or "end"',
    }] });
  });

  test("names the source block of a missing route without changing its IDs", () => {
    const doc = makeDocument();
    doc.blocks.block_a = { ...doc.blocks.block_a, title: "Support", options: [{ next: "missing_step" }] };
    expect(validateIvrRouting(doc)).toEqual({ ok: false, issues: [{
      kind: "dangling", sourceBlock: "block_a", target: "missing_step",
      error: 'Step "Support" Routes to unknown target "missing_step"',
    }] });
  });

  test("names both blocks for a route to a block outside its page", () => {
    const doc = makeDocument();
    doc.blocks.block_a = { ...doc.blocks.block_a, title: "Support", options: [{ next: "page_2:block_b" }] };
    doc.blocks.block_b = { ...doc.blocks.block_b, title: "Goodbye" };
    expect(validateIvrRouting(doc, { inbound: true })).toEqual({ ok: false, issues: [{
      kind: "dangling", sourceBlock: "block_a", target: "page_2:block_b",
      error: 'Step "Support" Routes to block "Goodbye" outside page "page_2"',
    }] });
  });

  test.each([undefined, "", "   "])("keeps the ID fallback for an untitled block (%s)", (title) => {
    const doc = makeDocument();
    doc.blocks.block_a = { ...doc.blocks.block_a, title, options: [{ next: "block_a" }] };
    expect(validateIvrRouting(doc)).toEqual({ ok: false, issues: [{
      kind: "cycle", blockId: "block_a",
      error: 'Routing cycle detected: step "block_a" loops back on itself without reaching "Hang up" or "end"',
    }] });
  });

});
