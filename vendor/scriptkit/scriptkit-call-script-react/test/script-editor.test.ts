// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { ScriptDocument } from "@chester-hill-solutions/scriptkit-call-script-core";
import { describe, expect, test } from "vitest";
import { mergeEditedOptions } from "../src/editor/script-editor.js";
import { useScriptEditorState } from "../src/hooks/use-script-editor-state.js";

describe("ScriptEditor option editing", () => {
  test("preserves next targets by value and then index", () => {
    const existing = [
      { value: "1", label: "Sales", next: "sales_page" },
      { value: "2", label: "Support", next: "support_page" },
    ];

    expect(
      mergeEditedOptions("2:Customer care\n1:New sales", existing),
    ).toEqual([
      {
        value: "2",
        label: "Customer care",
        next: "support_page",
      },
      {
        value: "1",
        label: "New sales",
        next: "sales_page",
      },
    ]);

    expect(mergeEditedOptions("9:Renamed by position", existing)[0]?.next).toBe(
      "sales_page",
    );
  });
});

describe("useScriptEditorState", () => {
  test("reloads editor state when the document prop changes", () => {
    const firstDocument: ScriptDocument = {
      version: 1,
      startPageId: "page_1",
      pages: {
        page_1: { id: "page_1", title: "First", blockIds: [] },
      },
      blocks: {},
    };
    const secondDocument: ScriptDocument = {
      version: 1,
      startPageId: "page_2",
      pages: {
        page_2: { id: "page_2", title: "Reloaded", blockIds: [] },
      },
      blocks: {},
    };
    const { result, rerender } = renderHook(
      ({ document }) => useScriptEditorState({ initialDocument: document }),
      { initialProps: { document: firstDocument } },
    );

    rerender({ document: secondDocument });

    expect(result.current.document).toBe(secondDocument);
    expect(result.current.activePageId).toBe("page_2");
    expect(result.current.activePage?.title).toBe("Reloaded");
  });

  test("keeps a still-valid active page during controlled updates", () => {
    const document: ScriptDocument = {
      version: 1,
      startPageId: "page_1",
      pages: {
        page_1: { id: "page_1", title: "First", blockIds: [] },
        page_2: { id: "page_2", title: "Second", blockIds: [] },
      },
      blocks: {},
    };
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
