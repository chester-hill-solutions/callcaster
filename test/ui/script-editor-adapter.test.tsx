import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import type { Script } from "@/lib/types";

/**
 * Renders the CallCaster script editor shell (pages rail + center page editor)
 * through the real design-system primitives.
 *
 * The hook is unit-tested in the scriptkit package, but that runs headless and
 * cannot catch host-component contract breaks — e.g. Radix's Select throws on
 * an empty-string item value, so a "(no target)" routing option keyed by ""
 * crashes here while every hook test stays green.
 */

function makeScript(): Script {
  return {
    id: 1,
    name: "Test script",
    type: "script",
    steps: {
      startPageId: "page_1",
      pageOrder: ["page_1", "page_2"],
      pages: {
        page_1: { id: "page_1", title: "Intro", blocks: ["b_radio"] },
        page_2: { id: "page_2", title: "Follow up", blocks: [] },
      },
      blocks: {
        b_radio: {
          id: "b_radio",
          type: "radio",
          title: "Outcome",
          content: "How did it go?",
          options: [
            { content: "Good", value: "good", next: "page_2" },
            { content: "Bad", value: "bad", next: "" },
          ],
        },
      },
    },
  } as unknown as Script;
}

function renderEditor(script: Script = makeScript()) {
  const onPageDataChange = vi.fn();
  render(
    <CampaignSettingsScript
      pageData={{ campaignDetails: { script } }}
      onPageDataChange={onPageDataChange}
      mediaNames={[]}
    />,
  );
  return { onPageDataChange };
}

describe("script editor — renders through the real design-system primitives", () => {
  test("renders without crashing and lists every page", () => {
    renderEditor();

    expect(screen.getByLabelText("Script pages")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Intro/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Follow up/ })).toBeTruthy();
  });

  test("keeps the pages rail separate from the page editor", () => {
    renderEditor();

    expect(screen.getByLabelText("Script pages")).toBeTruthy();
    expect(screen.getByLabelText("Page title")).toBeTruthy();
    expect(screen.getByLabelText("Add block")).toBeTruthy();
  });

  test("marks the start page", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: /Intro \(start\)/ })).toBeTruthy();
  });

  test("offers page authoring controls", () => {
    renderEditor();

    expect(screen.getAllByRole("button", { name: "Add page" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Set as start" })).toBeTruthy();
  });

  test("edits options as discrete rows, not one blob of text", () => {
    renderEditor();

    // Two options, each with its own value/label inputs.
    expect(screen.getAllByLabelText("Option value")).toHaveLength(2);
    expect(screen.getAllByLabelText("Option label")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add option" })).toBeTruthy();
  });

  test("adding a page reports the new document upward", () => {
    const { onPageDataChange } = renderEditor();

    fireEvent.click(screen.getAllByRole("button", { name: "Add page" })[0]!);

    expect(onPageDataChange).toHaveBeenCalled();
    const next = onPageDataChange.mock.calls.at(-1)?.[0];
    const steps = next.campaignDetails.script.steps as { pageOrder: string[] };
    expect(steps.pageOrder).toHaveLength(3);
  });

  test("editing an option value keeps the other option's routing", () => {
    // End-to-end version of the identity bug: through the adapter, a real
    // keystroke on one option must not move another option's `next`.
    const { onPageDataChange } = renderEditor();

    fireEvent.change(screen.getAllByLabelText("Option value")[0]!, {
      target: { value: "changed" },
    });

    const next = onPageDataChange.mock.calls.at(-1)?.[0];
    const steps = next.campaignDetails.script.steps as {
      blocks: Record<string, { options: Array<{ value: string; next?: string }> }>;
    };
    const options = steps.blocks.b_radio!.options;
    expect(options[0]).toMatchObject({ value: "changed", next: "page_2" });
    // Untouched, including its original empty-string "no target" — legacy wire
    // data stores it that way and a keystroke elsewhere must not rewrite it.
    expect(options[1]).toMatchObject({ value: "bad", next: "" });
  });
});
