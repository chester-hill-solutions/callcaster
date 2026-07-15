import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import Result from "@/components/campaign/settings/script/Result";
import type { Block } from "@/lib/types";

/**
 * `Result` is the agent-facing renderer for a script block. It is the real
 * contract that `script.steps` has to satisfy, and until now it had no direct
 * test (the questionnaire test mocks it out entirely).
 *
 * Two vocabularies reach this component:
 * - legacy: dropdown / multi (what older rows contain)
 * - documented: select / checkbox (docs/script-json-format.md, and what the
 *   builder writes for newly authored blocks)
 *
 * Both must render. Before this was fixed, `select` and `checkbox` fell to the
 * switch's `default: return null` — so a block added in the builder showed the
 * agent no input at all.
 */

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: "b1",
    type: "textarea",
    title: "Question",
    content: "How did it go?",
    options: [],
    ...overrides,
  } as Block;
}

function renderBlock(block: Block, initResult: string | boolean | string[] | null = null) {
  const action = vi.fn();
  render(
    <Result
      action={action}
      initResult={initResult}
      questions={block}
      questionId="q1"
      disabled={false}
    />,
  );
  return { action };
}

const CHOICE_OPTIONS = [
  { value: "yes", content: "Yes", next: "" },
  { value: "no", content: "No", next: "" },
];

describe("Result — documented and legacy type vocabularies", () => {
  test.each(["dropdown", "select"] as const)(
    "%s renders a <select> with every option",
    (type) => {
      renderBlock(makeBlock({ type, options: CHOICE_OPTIONS }));

      const select = screen.getByRole("combobox");
      expect(select).toBeTruthy();
      expect(screen.getByRole("option", { name: "Yes" })).toBeTruthy();
      expect(screen.getByRole("option", { name: "No" })).toBeTruthy();
    },
  );

  test.each(["multi", "checkbox"] as const)(
    "%s renders a checkbox per option",
    (type) => {
      renderBlock(makeBlock({ type, options: CHOICE_OPTIONS }));

      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
      expect(screen.getByLabelText("Yes")).toBeTruthy();
      expect(screen.getByLabelText("No")).toBeTruthy();
    },
  );

  test.each(["dropdown", "select"] as const)("%s reports the chosen value", (type) => {
    const { action } = renderBlock(makeBlock({ type, options: CHOICE_OPTIONS }));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "no" } });

    expect(action).toHaveBeenCalledWith({ column: "b1", value: "no" });
  });

  test.each(["multi", "checkbox"] as const)("%s accumulates chosen values", (type) => {
    const { action } = renderBlock(makeBlock({ type, options: CHOICE_OPTIONS }));

    fireEvent.click(screen.getByLabelText("Yes"));

    expect(action).toHaveBeenCalledWith({ column: "b1", value: ["yes"] });
  });
});

describe("Result — options written exactly as documented", () => {
  // docs/script-json-format.md keys options by { content, next } with no
  // `value`. Rendering those produced value="undefined" for every option,
  // so an uploaded script matching the docs was unusable.
  const DOC_OPTIONS = [
    { content: "Yes", next: "block_3" },
    { content: "No", next: "block_4" },
  ] as Block["options"];

  test("select falls back to option content when value is absent", () => {
    const { action } = renderBlock(makeBlock({ type: "select", options: DOC_OPTIONS }));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Yes" } });

    expect(action).toHaveBeenCalledWith({ column: "b1", value: "Yes" });
  });

  test("checkbox falls back to option content when value is absent", () => {
    const { action } = renderBlock(makeBlock({ type: "checkbox", options: DOC_OPTIONS }));

    fireEvent.click(screen.getByLabelText("Yes"));

    expect(action).toHaveBeenCalledWith({ column: "b1", value: ["Yes"] });
  });
});

describe("Result — radio icon options", () => {
  test("an Icon of SupportButton renders the support button", () => {
    const { action } = renderBlock(
      makeBlock({
        type: "radio",
        options: [
          { value: "support", content: "Needs support", next: "", Icon: "SupportButton" },
        ] as Block["options"],
      }),
    );

    const button = screen.getByRole("button", { name: "Needs support" });
    fireEvent.click(button);

    expect(action).toHaveBeenCalledWith({ column: "b1", value: "support" });
  });

  test("a mapped Icon renders an icon button labelled with the option content", () => {
    renderBlock(
      makeBlock({
        type: "radio",
        options: [
          { value: "good", content: "Positive", next: "", Icon: "ThumbUp" },
        ] as Block["options"],
      }),
    );

    expect(screen.getByText("Positive")).toBeTruthy();
  });
});

describe("Result — unchanged behaviour", () => {
  test("textarea still renders a textarea and reports input", () => {
    const { action } = renderBlock(makeBlock({ type: "textarea" }));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "some notes" } });

    expect(action).toHaveBeenCalledWith({ column: "b1", value: "some notes" });
  });

  test("boolean renders a checkbox labelled by `text` in preference to content", () => {
    const block = makeBlock({ type: "boolean", title: "Consent" });
    (block as Block & { text?: string }).text = "Consent given";
    renderBlock(block);

    expect(screen.getByLabelText("Consent given")).toBeTruthy();
  });
});
