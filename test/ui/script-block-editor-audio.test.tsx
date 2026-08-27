import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ScriptBlockEditor } from "@/components/campaign/settings/script/ScriptBlockEditor";
import type { ScriptBlock } from "@chester-hill-solutions/scriptkit-call-script-core";

function recordedBlock(): ScriptBlock {
  return {
    id: "b1",
    type: "recorded",
    callcasterType: "recorded",
    title: "Intro",
  } as unknown as ScriptBlock;
}

function renderEditor({
  readOnly = false,
  onUploadAudio,
}: {
  readOnly?: boolean;
  onUploadAudio?: (file: File) => Promise<string | null>;
} = {}) {
  const onChange = vi.fn();
  const noop = vi.fn();
  const utils = render(
    <ScriptBlockEditor
      block={recordedBlock()}
      readOnly={readOnly}
      mediaNames={[]}
      onUploadAudio={onUploadAudio}
      routingTargets={[]}
      onChange={onChange}
      onRemove={noop}
      onDuplicate={noop}
      onMoveUp={noop}
      onMoveDown={noop}
      onOptionAdd={noop}
      onOptionChange={noop}
      onOptionRemove={noop}
    />,
  );
  return { onChange, fileInput: () =>
    utils.container.querySelector<HTMLInputElement>('input[type="file"]') };
}

describe("ScriptBlockEditor audio upload (#1346)", () => {
  test("the upload button only appears for editable recorded blocks with a handler", () => {
    // Read-only preview hides the affordance even when the handler exists.
    renderEditor({ readOnly: true, onUploadAudio: vi.fn() });
    expect(screen.queryByRole("button", { name: "Upload audio" })).not.toBeInTheDocument();
  });

  test("a successful upload applies the returned media name to the block", async () => {
    const onUploadAudio = vi.fn().mockResolvedValue("audio.mp3");
    const { onChange, fileInput } = renderEditor({ onUploadAudio });

    expect(screen.getByRole("button", { name: "Upload audio" })).toBeInTheDocument();
    fireEvent.change(fileInput()!, { target: { files: [new File(["x"], "m.mp3")] } });

    await screen.findByRole("button", { name: "Upload audio" });
    expect(onUploadAudio).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ audioFile: "audio.mp3" });
  });

  test("a failed upload leaves the block unchanged and restores the control", async () => {
    const onUploadAudio = vi.fn().mockResolvedValue(null);
    const { onChange, fileInput } = renderEditor({ onUploadAudio });

    fireEvent.change(fileInput()!, { target: { files: [new File(["x"], "m.mp3")] } });

    await screen.findByRole("button", { name: "Upload audio" });
    expect(onChange).not.toHaveBeenCalled();
  });
});