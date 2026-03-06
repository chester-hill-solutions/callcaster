import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    VoxTypeSelector: vi.fn(({ value, onChange }: any) => (
      <button type="button" onClick={() => onChange(value === "synthetic" ? "recorded" : "synthetic")}>
        Vox:{value}
      </button>
    )),
    modalProps: null as any,
  };
});

vi.mock("@/components/settings/Settings.VoxTypeSelector", () => ({
  VoxTypeSelector: (props: any) => mocks.VoxTypeSelector(props),
}));

vi.mock("@/components/question/QuestionCard.ResponseTable.EditModal", () => ({
  EditResponseModal: (props: any) => {
    mocks.modalProps = props;
    return (
      <div>
        <div>modal</div>
        <button type="button" onClick={() => props.onClose()}>
          close
        </button>
        <button type="button" onClick={() => props.onSave("none", "hangup")}>
          save-null
        </button>
        <button type="button" onClick={() => props.onSave("2", "page_x")}>
          save-map
        </button>
        <button type="button" onClick={() => props.onSave("1", "page_y")}>
          save-same-key
        </button>
        <button type="button" onClick={() => props.onSave("hang", "hangup")}>
          save-hangup
        </button>
      </div>
    );
  },
}));

describe("QuestionCard family", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.modalProps = null;
  });

  test("QuestionHeader covers edit/non-edit, voicemail branch, and speechType icons", async () => {
    const mod = await import("@/components/QuestionCard.QuestionHeader");

    const q = {
      id: "1",
      name: "N",
      step: "step1",
      say: "hi",
      speechType: "synthetic" as const,
      nextStep: null,
    };

    const onNameChange = vi.fn();
    const onSpeechTypeChange = vi.fn();
    const { rerender, container } = render(
      <mod.QuestionHeader question={q} edit={true} onNameChange={onNameChange} onSpeechTypeChange={onSpeechTypeChange} />
    );
    fireEvent.change(container.querySelector("input") as HTMLInputElement, { target: { value: "X" } });
    expect(onNameChange).toHaveBeenCalledWith("X");

    rerender(<mod.QuestionHeader question={{ ...q, step: "voicemail" }} edit={true} onNameChange={onNameChange} onSpeechTypeChange={onSpeechTypeChange} />);
    expect(container.querySelector("input")).toBeFalsy(); // voicemail branch hides name input

    rerender(<mod.QuestionHeader question={q} edit={false} onNameChange={onNameChange} onSpeechTypeChange={onSpeechTypeChange} />);
    expect(screen.getByText("step1 N")).toBeInTheDocument();

    rerender(<mod.QuestionHeader question={{ ...q, speechType: "recorded" }} edit={false} onNameChange={onNameChange} onSpeechTypeChange={onSpeechTypeChange} />);
    expect(screen.getByText("recorded")).toBeInTheDocument();
  });

  test("ScriptOrAudio covers synthetic textarea + recorded select, Add navigation, and non-edit render", async () => {
    const mod = await import("@/components/QuestionCard.ScriptArea");
    const navigate = vi.fn();
    const onScriptChange = vi.fn();
    const onAudioChange = vi.fn();
    const mediaNames = [{ name: "a.mp3" }];

    const baseQ = {
      id: "1",
      name: "N",
      step: "s",
      say: "hello",
      speechType: "synthetic" as const,
      nextStep: null,
    };

    const { rerender } = render(
      <mod.ScriptOrAudio question={baseQ} edit={true} mediaNames={mediaNames} onScriptChange={onScriptChange} onAudioChange={onAudioChange} navigate={navigate} />
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect(onScriptChange).toHaveBeenCalledWith("x");

    rerender(
      <mod.ScriptOrAudio
        question={{ ...baseQ, speechType: "recorded", say: "a.mp3" }}
        edit={true}
        mediaNames={mediaNames}
        onScriptChange={onScriptChange}
        onAudioChange={onAudioChange}
        navigate={navigate}
      />
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Add" } });
    expect(navigate).toHaveBeenCalledWith("../../../../audios");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "a.mp3" } });
    expect(onAudioChange).toHaveBeenCalledWith("a.mp3");

    rerender(
      <mod.ScriptOrAudio
        question={{ ...baseQ, speechType: "synthetic", say: "show" }}
        edit={false}
        mediaNames={mediaNames}
        onScriptChange={onScriptChange}
        onAudioChange={onAudioChange}
        navigate={navigate}
      />
    );
    expect(screen.getByText("show")).toBeInTheDocument();

    rerender(
      <mod.ScriptOrAudio
        question={{ ...baseQ, speechType: "recorded", say: "http://a" }}
        edit={false}
        mediaNames={mediaNames}
        onScriptChange={onScriptChange}
        onAudioChange={onAudioChange}
        navigate={navigate}
      />
    );
    expect(document.querySelector("audio")).toBeTruthy();
  });

  test("ResponseTable covers nextStep map, vx-any label, edit/add rows, and handleSave branches", async () => {
    const mod = await import("@/components/QuestionCard.ResponseTable");
    const onNextStepChange = vi.fn();
    const q = {
      id: "1",
      name: "N",
      step: "s",
      say: "x",
      speechType: "synthetic" as const,
      nextStep: { "1": "hangup", "vx-any": "page_a" } as Record<string, string>,
    };
    const { container, rerender } = render(<mod.ResponseTable question={q} edit={true} onNextStepChange={onNextStepChange} />);

    expect(screen.getByText("Audio Response")).toBeInTheDocument();
    // click edit icon for key "1" (first row edit icon)
    fireEvent.click(container.querySelectorAll(".cursor-pointer")[0] as Element);
    expect(screen.getByText("modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("save-map"));
    // should set new key 2, delete old 1
    expect(onNextStepChange).toHaveBeenCalledWith(expect.objectContaining({ "2": "page_x" }));

    // cover editingKey truthy but equals input (no delete branch)
    fireEvent.click(container.querySelectorAll(".cursor-pointer")[0] as Element);
    fireEvent.click(screen.getByText("save-same-key"));
    expect(onNextStepChange).toHaveBeenCalledWith(expect.objectContaining({ "1": "page_y" }));

    // cover branch where nextAction === 'hangup' but input !== 'none' (no change)
    fireEvent.click(container.querySelectorAll(".cursor-pointer")[0] as Element);
    fireEvent.click(screen.getByText("save-hangup"));
    expect(onNextStepChange).toHaveBeenCalledWith(expect.objectContaining({ "1": "hangup" }));

    // open add response row, then close
    fireEvent.click(container.querySelectorAll(".cursor-pointer")[2] as Element);
    expect(screen.getByText("modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close"));
    expect(screen.queryByText("modal")).toBeNull();

    // when nextStep null, render NONE/HANGUP row and edit works
    rerender(<mod.ResponseTable question={{ ...q, nextStep: null }} edit={true} onNextStepChange={onNextStepChange} />);
    expect(screen.getByText("NONE")).toBeInTheDocument();
    fireEvent.click(container.querySelectorAll(".cursor-pointer")[0] as Element);
    fireEvent.click(screen.getByText("save-null"));
    expect(onNextStepChange).toHaveBeenCalledWith(null);

    // nextStep null but save-map yields object mapping
    fireEvent.click(container.querySelectorAll(".cursor-pointer")[0] as Element);
    fireEvent.click(screen.getByText("save-map"));
    expect(onNextStepChange).toHaveBeenCalledWith(expect.objectContaining({ "2": "page_x" }));

    // edit=false hides third column and modal triggers
    rerender(<mod.ResponseTable question={{ ...q, nextStep: { "1": "hangup" } }} edit={false} onNextStepChange={onNextStepChange} />);
    expect(container.querySelector(".cursor-pointer")).toBeFalsy();
  });

  test("QuestionCard wires child callbacks through handleChange", async () => {
    const mod = await import("@/components/QuestionCard");
    const onQuestionChange = vi.fn();
    const navigate = vi.fn();
    const q = {
      id: "1",
      name: "N",
      step: "step1",
      say: "hello",
      speechType: "synthetic" as const,
      nextStep: null,
    };
    const { container } = render(
      <mod.QuestionCard question={q} edit={true} mediaNames={[{ name: "a" }]} onQuestionChange={onQuestionChange} navigate={navigate} />
    );

    // name change
    fireEvent.change(container.querySelector("input") as HTMLInputElement, { target: { value: "X" } });
    expect(onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ name: "X" }));

    // speech type toggle via VoxTypeSelector mock
    fireEvent.click(screen.getByRole("button", { name: "Vox:synthetic" }));
    expect(onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ speechType: "recorded" }));

    // script change
    fireEvent.change(container.querySelector("textarea") as HTMLTextAreaElement, { target: { value: "y" } });
    expect(onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ say: "y" }));
  });

  test("QuestionCard covers recorded audio selection and nextStep updates", async () => {
    const mod = await import("@/components/QuestionCard");
    const onQuestionChange = vi.fn();
    const navigate = vi.fn();
    const q = {
      id: "1",
      name: "N",
      step: "step1",
      say: "a.mp3",
      speechType: "recorded" as const,
      nextStep: { "1": "hangup" } as any,
    };
    const { container } = render(
      <mod.QuestionCard
        question={q}
        edit={true}
        mediaNames={[{ name: "a.mp3" }]}
        onQuestionChange={onQuestionChange}
        navigate={navigate}
      />
    );

    // audio select change triggers onQuestionChange(say)
    fireEvent.change(container.querySelector("select") as HTMLSelectElement, { target: { value: "a.mp3" } });
    expect(onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ say: "a.mp3" }));

    // response table edit triggers nextStep update
    fireEvent.click(container.querySelectorAll(".cursor-pointer")[0] as Element);
    fireEvent.click(screen.getByText("save-map"));
    expect(onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ nextStep: expect.anything() }));
  });
});

