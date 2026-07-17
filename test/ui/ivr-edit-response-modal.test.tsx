import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { EditResponseModal } from "@/components/question/QuestionCard.ResponseTable.EditModal";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: any) => {
    if (!open) return null;
    return (
      <div data-testid="dialog-root">
        <button
          type="button"
          aria-label="Close dialog overlay"
          onClick={() => onOpenChange?.(false)}
        />
        {children}
      </div>
    );
  },
  DialogContent: ({ children, ...props }: any) => (
    <div role="dialog" {...props}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      aria-label="Next action"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));

function renderModal(
  overrides: Partial<React.ComponentProps<typeof EditResponseModal>> = {},
) {
  const onClose = vi.fn();
  const onSave = vi.fn();

  render(
    <EditResponseModal
      isOpen
      onClose={onClose}
      onSave={onSave}
      initialInput="3"
      initialNextAction="hangup"
      {...overrides}
    />,
  );

  return { onClose, onSave };
}

describe("EditResponseModal", () => {
  test("opens with dialog semantics and labelled fields", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Response" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Input" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Next action")).toHaveValue("hangup");
  });

  test("saves the selected input and next action", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.click(screen.getByRole("button", { name: "Voice - Any" }));
    fireEvent.change(screen.getByLabelText("Next action"), {
      target: { value: "voicemail" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("vx-any", "voicemail");
  });

  test("cancels without saving", async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderModal();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("closes on Escape via dialog open change", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: "Close dialog overlay" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("resets local state when reopened", () => {
    const { rerender } = render(
      <EditResponseModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialInput="5"
        initialNextAction="next"
      />,
    );

    expect(screen.getByRole("button", { name: "5", pressed: true })).toBeInTheDocument();

    rerender(
      <EditResponseModal
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialInput="5"
        initialNextAction="next"
      />,
    );

    rerender(
      <EditResponseModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialInput="7"
        initialNextAction="hangup"
      />,
    );

    expect(screen.getByRole("button", { name: "7", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Next action")).toHaveValue("hangup");
  });
});
