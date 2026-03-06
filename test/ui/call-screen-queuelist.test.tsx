import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/call-list/records/TableHeader", () => ({
  TableHeader: ({ keys = [] }: any) => (
    <thead data-testid="table-header">{keys.join("|")}</thead>
  ),
}));

vi.mock("@/components/call-list/records/participant/CallContact", () => ({
  default: ({ contact, firstInHouse, grouped, selected }: any) => (
    <tr data-testid="queue-contact">
      <td>{contact?.id}</td>
      <td>{String(Boolean(grouped))}</td>
      <td>{String(Boolean(firstInHouse))}</td>
      <td>{String(Boolean(selected))}</td>
    </tr>
  ),
}));

function makeContact(id: string) {
  return { contact: { id, firstname: "A", surname: "B", phone: "1", address: "x" } } as any;
}

describe("app/components/call/CallScreen.QueueList.tsx", () => {
  test("uses default groupByHousehold=true, queue=[], predictive=false when omitted", async () => {
    const { QueueList } = await import("@/components/call/CallScreen.QueueList");

    render(
      <QueueList
        {...({
          householdMap: {},
          handleNextNumber: vi.fn(),
          nextRecipient: null,
          handleQueueButton: vi.fn(),
          isBusy: false,
          count: 0,
          completed: 0,
        } as any)}
      />,
    );

    expect(screen.getByRole("button", { name: "Skip Household" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip Person" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Queue" })).toBeInTheDocument();
  });

  test("groupByHousehold renders flattened household contacts with grouped + firstInHouse flags", async () => {
    const { QueueList } = await import("@/components/call/CallScreen.QueueList");

    render(
      <QueueList
        groupByHousehold={true}
        queue={[makeContact("q1")]}
        householdMap={{
          h1: [makeContact("1"), makeContact("2")],
        }}
        handleNextNumber={vi.fn()}
        nextRecipient={makeContact("2")}
        predictive={false}
        handleQueueButton={vi.fn()}
        isBusy={false}
        count={2}
        completed={0}
      />,
    );

    const rows = screen.getAllByTestId("queue-contact");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("1true"); // grouped true + firstInHouse true
    expect(rows[1].textContent).toContain("2truefalse"); // grouped true + firstInHouse false
  });

  test("ungrouped renders queue list contacts", async () => {
    const { QueueList } = await import("@/components/call/CallScreen.QueueList");

    render(
      <QueueList
        groupByHousehold={false}
        queue={[makeContact("q1"), makeContact("q2")]}
        householdMap={{}}
        handleNextNumber={vi.fn()}
        nextRecipient={makeContact("q2")}
        predictive={false}
        handleQueueButton={vi.fn()}
        isBusy={false}
        count={2}
        completed={0}
      />,
    );

    expect(screen.getAllByTestId("queue-contact")).toHaveLength(2);
  });

  test("non-predictive shows skip buttons that call handleNextNumber with args", async () => {
    const { QueueList } = await import("@/components/call/CallScreen.QueueList");
    const handleNextNumber = vi.fn();

    render(
      <QueueList
        groupByHousehold={false}
        queue={[makeContact("q1")]}
        householdMap={{}}
        handleNextNumber={handleNextNumber}
        nextRecipient={null}
        predictive={false}
        handleQueueButton={vi.fn()}
        isBusy={false}
        count={1}
        completed={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Skip Household" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip Person" }));
    expect(handleNextNumber).toHaveBeenCalledWith(true);
    expect(handleNextNumber).toHaveBeenCalledWith(false);
  });

  test("predictive hides skip buttons and shows Recipient List header", async () => {
    const { QueueList } = await import("@/components/call/CallScreen.QueueList");
    render(
      <QueueList
        groupByHousehold={false}
        queue={[]}
        householdMap={{}}
        handleNextNumber={vi.fn()}
        nextRecipient={null}
        predictive={true}
        handleQueueButton={vi.fn()}
        isBusy={false}
        count={0}
        completed={0}
      />,
    );

    expect(screen.queryByText("Skip Household")).toBeNull();
    expect(screen.getByText("Recipient List")).toBeInTheDocument();
  });

  test("empty queue (non-predictive) shows Load Queue button; empty-state copy branches", async () => {
    const { QueueList } = await import("@/components/call/CallScreen.QueueList");
    const handleQueueButton = vi.fn();

    const { rerender } = render(
      <QueueList
        groupByHousehold={false}
        queue={[]}
        householdMap={{}}
        handleNextNumber={vi.fn()}
        nextRecipient={null}
        predictive={false}
        handleQueueButton={handleQueueButton}
        isBusy={false}
        count={0}
        completed={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load Queue" }));
    expect(handleQueueButton).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/check with your administration/i)).toBeInTheDocument();

    rerender(
      <QueueList
        groupByHousehold={false}
        queue={[]}
        householdMap={{}}
        handleNextNumber={vi.fn()}
        nextRecipient={null}
        predictive={false}
        handleQueueButton={handleQueueButton}
        isBusy={false}
        count={10}
        completed={2}
      />,
    );
    expect(screen.getByText("You're all done! Great work.")).toBeInTheDocument();
  });

  test("busy disables skip buttons", async () => {
    const { QueueList } = await import("@/components/call/CallScreen.QueueList");
    render(
      <QueueList
        groupByHousehold={false}
        queue={[makeContact("q1")]}
        householdMap={{}}
        handleNextNumber={vi.fn()}
        nextRecipient={null}
        predictive={false}
        handleQueueButton={vi.fn()}
        isBusy={true}
        count={1}
        completed={0}
      />,
    );
    expect(screen.getByRole("button", { name: "Skip Household" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip Person" })).toBeDisabled();
  });
});

