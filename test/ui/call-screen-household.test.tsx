import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("lucide-react", () => ({
  CheckCircleIcon: (props: any) => <span data-icon="CheckCircleIcon" {...props} />,
}));

function makeQueueItem(id: string, name: string) {
  const [firstname, surname] = name.split(" ");
  return {
    contact: { id, firstname, surname },
  } as any;
}

describe("app/components/call/CallScreen.Household.tsx", () => {
  test("highlights selected contact and calls switchQuestionContact when not busy", async () => {
    const { Household } = await import("@/components/call/CallScreen.Household");
    const switchQuestionContact = vi.fn();

    const a = makeQueueItem("1", "A One");
    const b = makeQueueItem("2", "B Two");

    const { container } = render(
      <Household
        house={[a, b]}
        switchQuestionContact={switchQuestionContact}
        attemptList={[]}
        questionContact={b}
        isBusy={false}
      />,
    );

    const selected = container.querySelector(".border-primary") as HTMLElement;
    expect(selected.textContent).toContain("B Two");

    fireEvent.click(screen.getByText("A One"));
    expect(switchQuestionContact).toHaveBeenCalledWith({ contact: a });
  });

  test("does not switch contact when busy", async () => {
    const { Household } = await import("@/components/call/CallScreen.Household");
    const switchQuestionContact = vi.fn();

    const a = makeQueueItem("1", "A One");
    render(
      <Household
        house={[a]}
        switchQuestionContact={switchQuestionContact}
        attemptList={[]}
        questionContact={null}
        isBusy={true}
      />,
    );

    fireEvent.click(screen.getByText("A One"));
    expect(switchQuestionContact).not.toHaveBeenCalled();
  });

  test("shows CheckCircleIcon when attempt result is object with status; hides for array/missing", async () => {
    const { Household } = await import("@/components/call/CallScreen.Household");

    const a = makeQueueItem("1", "A One");
    const b = makeQueueItem("2", "B Two");
    const c = makeQueueItem("3", "C Three");

    render(
      <Household
        house={[a, b, c]}
        switchQuestionContact={vi.fn()}
        attemptList={[
          { contact_id: "1", result: { status: "ok" } },
          { contact_id: "2", result: [] },
          { contact_id: "3", result: {} },
        ] as any}
        questionContact={null}
        isBusy={false}
      />,
    );

    // only A has status icon
    expect(screen.getAllByText((_, el) => el?.getAttribute("data-icon") === "CheckCircleIcon").length).toBe(1);
  });
});

