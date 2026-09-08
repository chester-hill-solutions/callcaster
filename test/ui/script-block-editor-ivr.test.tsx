import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ScriptBlockEditor } from "@/components/campaign/settings/script/ScriptBlockEditor";
import type { ScriptBlock } from "@chester-hill-solutions/scriptkit-call-script-core";

/**
 * IVR steps are audio, not form inputs. The runtime speaks `audioFile` and
 * never reads `prompt`, so the editor must show and edit the former and keep
 * the latter out of the way — and must turn any block in an audio script into
 * an audible step the moment the author gives it audio.
 */

/** A block as an older editor or a live-call script leaves it: text only. */
function legacyTextBlock(): ScriptBlock {
  return {
    id: "b1",
    type: "textarea",
    callcasterType: "textarea",
    title: "Greeting",
    prompt: "Hello, thanks for taking this call.",
    audioFile: "",
  } as unknown as ScriptBlock;
}

function spokenBlock(overrides: Record<string, unknown> = {}): ScriptBlock {
  return {
    id: "b1",
    type: "select",
    callcasterType: "synthetic",
    title: "Question",
    prompt: "",
    audioFile: "Press 1 for yes.",
    options: [],
    ...overrides,
  } as unknown as ScriptBlock;
}

function recordedBlock(audioFile = "greeting.mp3"): ScriptBlock {
  return {
    id: "b1",
    type: "select",
    callcasterType: "recorded",
    title: "Greeting",
    prompt: "",
    audioFile,
    options: [],
  } as unknown as ScriptBlock;
}

function renderStep({
  block,
  readOnly = false,
  audioFlow = true,
  mediaNames = [],
  audioPreviewUrl,
}: {
  block: ScriptBlock;
  readOnly?: boolean;
  audioFlow?: boolean;
  mediaNames?: string[];
  audioPreviewUrl?: (fileName: string) => string;
}) {
  const onChange = vi.fn();
  const onOptionAdd = vi.fn();
  const onOptionChange = vi.fn();
  const onOptionRemove = vi.fn();
  const noop = vi.fn();
  render(
    <ScriptBlockEditor
      block={block}
      readOnly={readOnly}
      audioFlow={audioFlow}
      mediaNames={mediaNames}
      audioPreviewUrl={audioPreviewUrl}
      routingTargets={[
        { kind: "page", id: "page_2", label: "Thanks" },
        { kind: "special", id: "hangup", label: "Hang up" },
      ]}
      onChange={onChange}
      onRemove={noop}
      onDuplicate={noop}
      onMoveUp={noop}
      onMoveDown={noop}
      onOptionAdd={onOptionAdd}
      onOptionChange={onOptionChange}
      onOptionRemove={onOptionRemove}
    />,
  );
  return { onChange, onOptionAdd, onOptionChange, onOptionRemove };
}

describe("ScriptBlockEditor — IVR audio steps", () => {
  test("a text-only block in an audio script is edited as a silent spoken step, with its prompt hidden", () => {
    renderStep({ block: legacyTextBlock() });

    expect(screen.getByText("Spoken step")).toBeInTheDocument();
    expect(screen.getByLabelText("Step name")).toHaveValue("Greeting");
    expect(screen.getByLabelText("Speech text")).toHaveValue("");
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Callers hear nothing at this step yet/),
    ).toBeInTheDocument();
  });

  test("the unspoken prompt can be promoted to speech text in one click, pinning the playback type", () => {
    const { onChange } = renderStep({ block: legacyTextBlock() });

    fireEvent.click(screen.getByRole("button", { name: "Speak the prompt text" }));

    expect(onChange).toHaveBeenCalledWith({
      audioFile: "Hello, thanks for taking this call.",
      callcasterType: "synthetic",
    });
  });

  test("typing speech text on a text-only block makes it a spoken step on the wire", () => {
    const { onChange } = renderStep({ block: legacyTextBlock() });

    fireEvent.change(screen.getByLabelText("Speech text"), {
      target: { value: "Welcome." },
    });

    expect(onChange).toHaveBeenCalledWith({
      audioFile: "Welcome.",
      callcasterType: "synthetic",
    });
  });

  test("a spoken step with text shows no warning and offers a voice", () => {
    renderStep({ block: spokenBlock() });

    expect(screen.queryByText(/Callers hear nothing/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Voice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speak text" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Play a recording" })).toHaveAttribute("aria-pressed", "false");
  });

  test("switching to a recording writes the wire type, and mirrors the legacy speechType when present", () => {
    const { onChange } = renderStep({ block: spokenBlock({ speechType: "synthetic" }) });

    fireEvent.click(screen.getByRole("button", { name: "Play a recording" }));

    expect(onChange).toHaveBeenCalledWith({
      callcasterType: "recorded",
      speechType: "recorded",
    });
  });

  test("a recording step previews the chosen file through the workspace preview URL", () => {
    renderStep({
      block: recordedBlock(),
      mediaNames: ["greeting.mp3", "menu.mp3"],
      audioPreviewUrl: (name) => `/preview/${name}`,
    });

    expect(screen.getByText("Recording step")).toBeInTheDocument();
    const player = screen.getByLabelText("Preview greeting.mp3");
    expect(player.tagName).toBe("AUDIO");
    expect(player).toHaveAttribute("src", "/preview/greeting.mp3");
    expect(screen.queryByText(/Choose or upload a recording/)).not.toBeInTheDocument();
  });

  test("a recording step with no file warns instead of rendering a player", () => {
    renderStep({
      block: recordedBlock(""),
      mediaNames: ["greeting.mp3"],
      audioPreviewUrl: (name) => `/preview/${name}`,
    });

    expect(screen.getByText(/Choose or upload a recording/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Preview /)).not.toBeInTheDocument();
  });

  test("an empty library says so rather than rendering an empty picker", () => {
    renderStep({ block: recordedBlock("") });

    expect(screen.getByText(/No recordings in the library yet/)).toBeInTheDocument();
  });

  test("caller responses are edited as keys, labels, and destinations", () => {
    const { onOptionAdd, onOptionChange, onOptionRemove } = renderStep({
      block: spokenBlock({
        options: [{ id: "o1", value: "1", label: "Yes", next: "page_2" }],
      }),
    });

    expect(screen.getByText("Caller responses")).toBeInTheDocument();
    expect(screen.getByLabelText("Caller answers with")).toBeInTheDocument();
    expect(screen.getByLabelText("Then go to")).toBeInTheDocument();
    expect(screen.getByLabelText("Answer label")).toHaveValue("Yes");

    fireEvent.change(screen.getByLabelText("Answer label"), {
      target: { value: "Yes please" },
    });
    expect(onOptionChange).toHaveBeenCalledWith("o1", {
      label: "Yes please",
      content: "Yes please",
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove response" }));
    expect(onOptionRemove).toHaveBeenCalledWith("o1");

    fireEvent.click(screen.getByRole("button", { name: "Add response" }));
    expect(onOptionAdd).toHaveBeenCalledTimes(1);
  });

  test("a step with no responses explains that the call continues", () => {
    renderStep({ block: spokenBlock() });

    expect(
      screen.getByText(/No responses\. The call continues to the next step/),
    ).toBeInTheDocument();
  });

  test("read-only preview exposes no authoring controls", () => {
    renderStep({
      block: spokenBlock({ options: [{ id: "o1", value: "1", label: "Yes" }] }),
      readOnly: true,
    });

    expect(screen.queryByRole("button", { name: "Add response" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove response" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove block" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play a recording" })).toBeDisabled();
  });

  test("outside an audio script, a playback-typed block still gets the audio editor", () => {
    renderStep({ block: spokenBlock(), audioFlow: false });

    expect(screen.getByText("Spoken step")).toBeInTheDocument();
    expect(screen.getByLabelText("Speech text")).toHaveValue("Press 1 for yes.");
  });

  test("outside an audio script, a plain input block keeps the agent form editor", () => {
    renderStep({ block: legacyTextBlock(), audioFlow: false });

    expect(screen.queryByText("Spoken step")).not.toBeInTheDocument();
    expect(screen.getByText("Prompt")).toBeInTheDocument();
  });
});
