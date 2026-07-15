import { describe, expect, test } from "vitest";
import { mergeEditedOptions } from "../src/editor/script-editor.js";

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
