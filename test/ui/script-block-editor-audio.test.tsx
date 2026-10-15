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

function sayBlock(): ScriptBlock {
  return {
    id: "b1",
    type: "recorded",
    callcasterType: "say",
    title: "Intro",
  } as unknown as ScriptBlock;
}

function renderEditor({
  readOnly = false,
  onUploadAudio,
  block = recordedBlock(),
}: {
  readOnly?: boolean;
  onUploadAudio?: (file: File) => Promise<string | null>;
  block?: ScriptBlock;
} = {}) {
  const onChange = vi.fn();
  const noop = vi.fn();
  const utils = render(
    <ScriptBlockEditor
      block={block}
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
  const fileInput = (): HTMLInputElement => {
    const el = utils.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!el) throw new Error("script block editor did not render an audio file input");
    return el;
  };
  return { onChange, fileInput };
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
    fireEvent.change(fileInput(), { target: { files: [new File(["x"], "m.mp3")] } });

    await screen.findByRole("button", { name: "Upload audio" });
    expect(onUploadAudio).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ audioFile: "audio.mp3" });
  });

  test("a failed upload leaves the block unchanged and restores the control", async () => {
    const onUploadAudio = vi.fn().mockResolvedValue(null);
    const { onChange, fileInput } = renderEditor({ onUploadAudio });

    fireEvent.change(fileInput(), { target: { files: [new File(["x"], "m.mp3")] } });

    await screen.findByRole("button", { name: "Upload audio" });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("the upload button is hidden on a 'say' block", () => {
    renderEditor({ block: sayBlock(), onUploadAudio: vi.fn() });
    expect(screen.queryByRole("button", { name: "Upload audio" })).not.toBeInTheDocument();
  });

  test("in recording mode the empty-recording warning appears in the playback header", () => {
    renderEditor({ onUploadAudio: vi.fn() });

    const upload = screen.getByRole("button", { name: "Upload audio" });
    const warning = screen.getByText(/Choose or upload a recording/);

    // The warning is shown in the playback header before the recording controls.
    expect(
      warning.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("uploading from an already-recorded block does not re-emit callcasterType (avoids a noisy patch)", async () => {
    const onUploadAudio = vi.fn().mockResolvedValue("uploaded.mp3");
    const { onChange, fileInput } = renderEditor({ onUploadAudio });

    fireEvent.change(fileInput(), { target: { files: [new File(["x"], "m.mp3")] } });

    await screen.findByRole("button", { name: "Upload audio" });
    expect(onChange).toHaveBeenCalledWith({ audioFile: "uploaded.mp3" });
  });
});
