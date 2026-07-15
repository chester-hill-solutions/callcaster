// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { ScriptDocument } from "@chester-hill-solutions/scriptkit-call-script-core";
import { describe, expect, test } from "vitest";
import { useScriptEditorState } from "../src/hooks/use-script-editor-state.js";

function makeDocument(overrides: Partial<ScriptDocument> = {}): ScriptDocument {
  return {
    version: 1,
    startPageId: "page_1",
    pageOrder: ["page_1", "page_2"],
    pages: {
      page_1: { id: "page_1", title: "First", blockIds: ["block_1"] },
      page_2: { id: "page_2", title: "Second", blockIds: [] },
    },
    blocks: {
      block_1: {
        id: "block_1",
        type: "radio",
        prompt: "Pick one",
        options: [
          { id: "opt_1", value: "1", label: "Sales", next: "page_2" },
          { id: "opt_2", value: "2", label: "Support", next: "block_1" },
        ],
      },
    },
    ...overrides,
  } as ScriptDocument;
}

function renderEditor(document: ScriptDocument = makeDocument()) {
  return renderHook(() => useScriptEditorState({ initialDocument: document }));
}

describe("useScriptEditorState — controlled document", () => {
  test("reloads editor state when the document prop changes", () => {
    const firstDocument = makeDocument();
    const secondDocument = makeDocument({
      startPageId: "page_9",
      pageOrder: ["page_9"],
      pages: { page_9: { id: "page_9", title: "Reloaded", blockIds: [] } },
      blocks: {},
    });
    const { result, rerender } = renderHook(
      ({ document }) => useScriptEditorState({ initialDocument: document }),
      { initialProps: { document: firstDocument } },
    );

    rerender({ document: secondDocument });

    expect(result.current.document).toBe(secondDocument);
    expect(result.current.activePageId).toBe("page_9");
    expect(result.current.activePage?.title).toBe("Reloaded");
  });

  test("keeps a still-valid active page during controlled updates", () => {
    const document = makeDocument();
    const { result, rerender } = renderHook(
      ({ currentDocument }) =>
        useScriptEditorState({ initialDocument: currentDocument }),
      { initialProps: { currentDocument: document } },
    );

    act(() => result.current.setActivePageId("page_2"));
    rerender({
      currentDocument: {
        ...document,
        pages: {
          ...document.pages,
          page_2: { ...document.pages.page_2!, title: "Edited" },
        },
      },
    });

    expect(result.current.activePageId).toBe("page_2");
    expect(result.current.activePage?.title).toBe("Edited");
  });
});

describe("useScriptEditorState — pages", () => {
  test("addPage appends to pageOrder and focuses the new page", () => {
    const { result } = renderEditor();

    let newId = "";
    act(() => {
      newId = result.current.addPage("Third");
    });

    expect(result.current.pageOrder).toEqual(["page_1", "page_2", newId]);
    expect(result.current.activePageId).toBe(newId);
    expect(result.current.document.pages[newId]?.title).toBe("Third");
  });

  test("renamePage renames in place", () => {
    const { result } = renderEditor();

    act(() => result.current.renamePage("page_1", "Introduction"));

    expect(result.current.document.pages.page_1?.title).toBe("Introduction");
  });

  test("movePage reorders", () => {
    const { result } = renderEditor();

    act(() => result.current.movePage("page_2", 0));

    expect(result.current.pageOrder).toEqual(["page_2", "page_1"]);
  });

  test("movePage out of range is a no-op", () => {
    const { result } = renderEditor();

    act(() => result.current.movePage("page_2", 99));

    expect(result.current.pageOrder).toEqual(["page_1", "page_2"]);
  });

  test("setStartPage repoints the start", () => {
    const { result } = renderEditor();

    act(() => result.current.setStartPage("page_2"));

    expect(result.current.document.startPageId).toBe("page_2");
  });

  test("removePage deletes the page and the blocks it owned", () => {
    const { result } = renderEditor();

    act(() => result.current.removePage("page_1"));

    expect(result.current.pageOrder).toEqual(["page_2"]);
    expect(result.current.document.pages.page_1).toBeUndefined();
    expect(result.current.document.blocks.block_1).toBeUndefined();
  });

  test("removePage repoints startPageId when it removed the start page", () => {
    const { result } = renderEditor();

    act(() => result.current.removePage("page_1"));

    expect(result.current.document.startPageId).toBe("page_2");
  });

  test("removePage refuses to remove the last page", () => {
    const { result } = renderEditor(
      makeDocument({
        pageOrder: ["page_1"],
        pages: { page_1: { id: "page_1", title: "Only", blockIds: [] } },
        blocks: {},
      }),
    );

    act(() => result.current.removePage("page_1"));

    expect(result.current.document.pages.page_1).toBeDefined();
  });

  test("removePage clears routing that pointed at it", () => {
    // block_1 on page_1 routes to page_2; removing page_2 must not leave a
    // dangling `next` behind — that fails validation and strands the caller.
    const { result } = renderEditor();

    act(() => result.current.removePage("page_2"));

    const options = result.current.document.blocks.block_1?.options;
    expect(options?.[0]?.next).toBeUndefined();
  });
});

describe("useScriptEditorState — blocks", () => {
  test("addBlock can insert at an index", () => {
    const { result } = renderEditor();

    let newId = "";
    act(() => {
      newId = result.current.addBlock("textarea", 0);
    });

    expect(result.current.document.pages.page_1?.blockIds).toEqual([
      newId,
      "block_1",
    ]);
  });

  test("moveBlock reorders within the page", () => {
    const { result } = renderEditor();
    let second = "";
    act(() => {
      second = result.current.addBlock("textarea");
    });

    act(() => result.current.moveBlock(second, 0));

    expect(result.current.document.pages.page_1?.blockIds).toEqual([
      second,
      "block_1",
    ]);
  });

  test("moveBlockToPage moves it across pages", () => {
    const { result } = renderEditor();

    act(() => result.current.moveBlockToPage("block_1", "page_2"));

    expect(result.current.document.pages.page_1?.blockIds).toEqual([]);
    expect(result.current.document.pages.page_2?.blockIds).toEqual(["block_1"]);
  });

  test("duplicateBlock inserts a copy after the original with fresh option ids", () => {
    const { result } = renderEditor();

    let copyId = "";
    act(() => {
      copyId = result.current.duplicateBlock("block_1");
    });

    expect(result.current.document.pages.page_1?.blockIds).toEqual([
      "block_1",
      copyId,
    ]);

    const original = result.current.document.blocks.block_1?.options ?? [];
    const copy = result.current.document.blocks[copyId]?.options ?? [];
    expect(copy.map((o) => o.label)).toEqual(original.map((o) => o.label));
    // Sharing option ids would make editing one row edit both blocks.
    expect(copy.map((o) => o.id)).not.toEqual(original.map((o) => o.id));
  });

  test("removeBlock clears routing that pointed at it", () => {
    const { result } = renderEditor();

    act(() => result.current.removeBlock("block_1"));

    expect(result.current.document.blocks.block_1).toBeUndefined();
  });

  test("changeBlockType keeps content and clears callcasterType", () => {
    // Serialization prefers callcasterType, so leaving it set would make the
    // type change vanish the moment the script is saved.
    const { result } = renderEditor(
      makeDocument({
        blocks: {
          block_1: {
            id: "block_1",
            type: "radio",
            title: "Interest",
            prompt: "How interested?",
            callcasterType: "radio",
            options: [{ id: "opt_1", value: "1", label: "Very" }],
          },
        },
      } as Partial<ScriptDocument>),
    );

    act(() => result.current.changeBlockType("block_1", "select"));

    const block = result.current.document.blocks.block_1;
    expect(block?.type).toBe("select");
    expect(block?.title).toBe("Interest");
    expect(block?.prompt).toBe("How interested?");
    expect(block?.options?.[0]?.label).toBe("Very");
    expect(block?.callcasterType).toBeUndefined();
  });

  test("changeBlockType refuses to touch an IVR playback block", () => {
    // There callcasterType is the playback mode, not an input type; clearing it
    // would stop the IVR routes playing audio.
    const { result } = renderEditor(
      makeDocument({
        blocks: {
          block_1: {
            id: "block_1",
            type: "textarea",
            prompt: "Press one",
            callcasterType: "recorded",
            audioFile: "menu.mp3",
          },
        },
      } as Partial<ScriptDocument>),
    );

    act(() => result.current.changeBlockType("block_1", "select"));

    expect(result.current.document.blocks.block_1?.type).toBe("textarea");
    expect(result.current.document.blocks.block_1?.callcasterType).toBe("recorded");
  });
});

describe("useScriptEditorState — options", () => {
  test("editing an option's value leaves every other option's next alone", () => {
    // The regression this whole option-id design exists for. The old editor
    // re-parsed a textarea and matched options by value, so renaming a value
    // fell through to positional lookup and moved `next` onto the wrong option.
    const { result } = renderEditor();

    act(() => result.current.updateOption("block_1", "opt_1", { value: "9" }));

    const options = result.current.document.blocks.block_1?.options ?? [];
    expect(options[0]).toMatchObject({ id: "opt_1", value: "9", next: "page_2" });
    expect(options[1]).toMatchObject({ id: "opt_2", value: "2", next: "block_1" });
  });

  test("addOption appends an empty option and returns its id", () => {
    const { result } = renderEditor();

    let optionId = "";
    act(() => {
      optionId = result.current.addOption("block_1");
    });

    const options = result.current.document.blocks.block_1?.options ?? [];
    expect(options).toHaveLength(3);
    expect(options[2]).toMatchObject({ id: optionId, value: "", label: "" });
  });

  test("removeOption removes only the addressed option", () => {
    const { result } = renderEditor();

    act(() => result.current.removeOption("block_1", "opt_1"));

    const options = result.current.document.blocks.block_1?.options ?? [];
    expect(options.map((o) => o.id)).toEqual(["opt_2"]);
  });

  test("moveOption reorders", () => {
    const { result } = renderEditor();

    act(() => result.current.moveOption("block_1", "opt_2", 0));

    const options = result.current.document.blocks.block_1?.options ?? [];
    expect(options.map((o) => o.id)).toEqual(["opt_2", "opt_1"]);
  });
});

describe("useScriptEditorState — routing", () => {
  test("routingTargets lists pages, blocks and hangup by label, never raw ids", () => {
    const { result } = renderEditor();

    const targets = result.current.routingTargets;
    expect(targets).toContainEqual({ kind: "page", id: "page_1", label: "First" });
    expect(targets).toContainEqual({ kind: "page", id: "page_2", label: "Second" });
    expect(targets).toContainEqual({
      kind: "block",
      id: "block_1",
      label: "Pick one",
      pageTitle: "First",
    });
    expect(targets).toContainEqual({ kind: "special", id: "hangup", label: "Hang up" });
  });

  test("incomingRefs reports which blocks route to a target", () => {
    const { result } = renderEditor();

    expect(result.current.incomingRefs("page_2")).toEqual(["block_1"]);
    expect(result.current.incomingRefs("page_1")).toEqual([]);
  });
});
