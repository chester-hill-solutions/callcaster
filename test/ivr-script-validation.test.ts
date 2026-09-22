import { describe, expect, test } from "vitest";
import { validateIvrRouting } from "../app/lib/ivr-script-validation";

/** Linear document: page_1 -> block_1 (option 1 -> end; option 2 -> block_2a), then hangup. */
function makeDocument(overrides?: Parameters<typeof validateIvrRouting>[0]) {
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
});