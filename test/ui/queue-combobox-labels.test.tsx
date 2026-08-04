import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DataSmokeRouter,
  defaultQueueTableProps,
  noop,
} from "./_helpers/component-smoke";

// Regression tests for audit-F's campaign-queue button-name/select-name axe
// violations: several role="combobox" Select triggers had no accessible
// name. Unlike test/ui/components-queue.test.tsx, this file deliberately does
// NOT mock "@/components/ui/select" so the real Radix trigger (which is what
// actually renders role="combobox" in the browser) is exercised here.
describe("campaign-queue comboboxes have accessible names", () => {
  test("QueueHeader's audience picker is labeled", async () => {
    const { QueueHeader } = await import("@/components/queue/QueueHeader");
    render(
      <QueueHeader
        totalCount={1}
        unfilteredCount={1}
        isSelectingAudience
        selectedAudience={null}
        audiences={[{ id: 1, name: "Audience A" } as never]}
        selectedCampaignAudienceIds={[]}
        onSelectingAudienceChange={noop}
        onSelectedAudienceChange={noop}
        onAddFromAudience={noop}
        onAddContact={noop}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Select audience to add" }),
    ).toBeInTheDocument();
  });

  test("StatusDropdown's per-row status select is labeled", async () => {
    const { StatusDropdown } = await import("@/components/queue/StatusDropdown");
    render(<StatusDropdown currentStatus="queued" onSelect={vi.fn()} />);
    expect(
      screen.getByRole("combobox", { name: "Set contact status" }),
    ).toBeInTheDocument();
  });

  test("QueueTable's column-header filter comboboxes are all labeled", async () => {
    const { QueueTable } = await import("@/components/queue/QueueTable");
    render(
      <DataSmokeRouter>
        <QueueTable {...defaultQueueTableProps()} />
      </DataSmokeRouter>,
    );
    expect(
      screen.getByRole("combobox", { name: "Filter by audience" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by support level" }),
    ).toBeInTheDocument();
  });
});
