import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import type { Script } from "@/lib/types";

/**
 * The shell decides what "add" means. In an audio script it must add an
 * audible step with the playback wire type the IVR runtime reads — not a
 * form block the runtime would play as silence.
 */

type WireBlock = {
  type: string;
  title?: string;
  audioFile?: string;
  options?: Array<{ value: string; next?: string }>;
};
type WireSteps = { pages: Record<string, { blocks: string[] }>; blocks: Record<string, WireBlock> };

function makeScript(type: Script["type"]): Script {
  return {
    id: 1,
    name: "Phone menu",
    type,
    steps: {
      startPageId: "page_1",
      pageOrder: ["page_1"],
      pages: {
        page_1: { id: "page_1", title: "Welcome", blocks: ["b_legacy"] },
      },
      blocks: {
        // Exactly what the seeded sample script and older editors leave
        // behind: text in `content`, nothing in `audioFile`, no `options` key.
        b_legacy: {
          id: "b_legacy",
          type: "textarea",
          title: "Greeting",
          content: "Hello and welcome.",
          audioFile: "",
        },
      },
    },
  } as unknown as Script;
}

function renderEditor(script: Script, audioFlow?: boolean) {
  const onChange = vi.fn();
  render(
    <CampaignSettingsScript
      script={script}
      onChange={onChange}
      audioFlow={audioFlow}
      mediaNames={[]}
    />,
  );
  const lastSteps = (): WireSteps => {
    const next = onChange.mock.calls.at(-1)?.[0] as { steps: WireSteps } | undefined;
    if (!next) throw new Error("onChange was not called");
    return next.steps;
  };
  return { onChange, lastSteps };
}

/** The block at `index` on the first page, or a clear failure if it is missing. */
function blockOnPage(steps: WireSteps, index: number): WireBlock {
  const id = steps.pages.page_1?.blocks[index];
  const block = id ? steps.blocks[id] : undefined;
  if (!block) throw new Error(`no block at index ${index} on page_1`);
  return block;
}

describe("script editor shell — audio scripts", () => {
  test("an IVR script offers audio steps instead of form blocks", () => {
    renderEditor(makeScript("ivr"));

    expect(screen.getByRole("button", { name: "Add spoken step" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add recording step" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Add block")).not.toBeInTheDocument();
  });

  test("a live-call script keeps the form block palette", () => {
    renderEditor(makeScript("script"));

    expect(screen.getByLabelText("Add block")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add spoken step" })).not.toBeInTheDocument();
  });

  test("a campaign can force audio editing for a script row typed as a live-call script", () => {
    renderEditor(makeScript("script"), true);

    expect(screen.getByRole("button", { name: "Add spoken step" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Add block")).not.toBeInTheDocument();
  });

  test("adding a spoken step lands a synthetic playback block at the end of the page", () => {
    const { lastSteps } = renderEditor(makeScript("ivr"));

    fireEvent.click(screen.getByRole("button", { name: "Add spoken step" }));

    const steps = lastSteps();
    expect(steps.pages.page_1?.blocks).toHaveLength(2);
    expect(blockOnPage(steps, 1)).toMatchObject({
      type: "synthetic",
      audioFile: "",
      title: "Step 2",
      options: [],
    });
  });

  test("adding a recording step lands a recorded playback block", () => {
    const { lastSteps } = renderEditor(makeScript("ivr"));

    fireEvent.click(screen.getByRole("button", { name: "Add recording step" }));

    expect(blockOnPage(lastSteps(), 1)).toMatchObject({ type: "recorded", audioFile: "" });
  });

  test("a legacy step with no options key can still take its first caller response", () => {
    const { lastSteps } = renderEditor(makeScript("ivr"));

    fireEvent.click(screen.getByRole("button", { name: "Add response" }));

    expect(lastSteps().blocks.b_legacy?.options).toHaveLength(1);
  });

  test("the legacy step's text is surfaced as unspoken, not hidden", () => {
    renderEditor(makeScript("ivr"));

    expect(screen.getByText(/This step's prompt text is not spoken/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speak the prompt text" })).toBeInTheDocument();
  });
});
