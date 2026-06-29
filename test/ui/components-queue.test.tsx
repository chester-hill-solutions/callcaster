import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  defaultQueueTableProps,
  makeContact,
  makeQueueItem,
  noop,
} from "./_helpers/component-smoke";

const fetcher = {
  submit: vi.fn(),
  load: vi.fn(),
  state: "idle" as const,
  data: { contacts: [] },
  Form: ({ children, ...p }: any) => <form {...p}>{children}</form>,
};

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useFetcher: () => fetcher,
    useNavigation: () => ({ state: "idle" }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Form: ({ children, ...p }: any) => <form {...p}>{children}</form>,
  };
});

vi.mock("@/hooks/utils/useOptimisticMutation", () => ({
  useOptimisticMutation: () => undefined,
}));

// Bridge Radix Select to a native <select> so existing fireEvent.change tests
// keep working while production uses the real ui/select primitives. Radix
// Select.Root accepts `disabled`, so it is passed through here too.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));

describe("app/components/queue/StatusDropdown.tsx", () => {
  test("changes status", async () => {
    const { StatusDropdown } = await import("@/components/queue/StatusDropdown");
    const onSelect = vi.fn();
    render(<StatusDropdown currentStatus="queued" onSelect={onSelect} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "dequeued" } });
    expect(onSelect).toHaveBeenCalledWith("dequeued");
    render(<StatusDropdown onSelect={onSelect} />);
  });
});

describe("app/components/queue/QueueHeader.tsx", () => {
  test("audience selection flow", async () => {
    const { QueueHeader } = await import("@/components/queue/QueueHeader");
    const onSelectingAudienceChange = vi.fn();
    const onSelectedAudienceChange = vi.fn();
    const onAddFromAudience = vi.fn();
    const { rerender } = render(
      <QueueHeader
        totalCount={1}
        unfilteredCount={1}
        isSelectingAudience={false}
        selectedAudience={null}
        audiences={[{ id: 1, name: "A" } as never]}
        selectedCampaignAudienceIds={[]}
        onSelectingAudienceChange={onSelectingAudienceChange}
        onSelectedAudienceChange={onSelectedAudienceChange}
        onAddFromAudience={onAddFromAudience}
        onAddContact={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add from Audience/i }));
    expect(onSelectingAudienceChange).toHaveBeenCalledWith(true);

    rerender(
      <QueueHeader
        totalCount={1}
        unfilteredCount={1}
        isSelectingAudience
        selectedAudience={1}
        audiences={[{ id: 1, name: "A" } as never]}
        selectedCampaignAudienceIds={[]}
        onSelectingAudienceChange={onSelectingAudienceChange}
        onSelectedAudienceChange={onSelectedAudienceChange}
        onAddFromAudience={onAddFromAudience}
        onAddContact={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add A/i }));
    expect(onAddFromAudience).toHaveBeenCalledWith(1);
  });
});

describe("app/components/queue/QueueTablePagination.tsx", () => {
  test("delegates to TablePagination", async () => {
    const { QueueTablePagination } = await import("@/components/queue/QueueTablePagination");
    const handleFilterChange = vi.fn();
    render(
      <QueueTablePagination
        currentPage={1}
        totalPages={3}
        pageSize={25}
        totalCount={50}
        getVisiblePages={() => [1, 2, 3]}
        handleFilterChange={handleFilterChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(handleFilterChange).toHaveBeenCalledWith("page", "2");
  });
});

describe("app/components/queue/QueueTable.tsx", () => {
  test("renders queue rows", async () => {
    const { QueueTable } = await import("@/components/queue/QueueTable");
    render(<QueueTable {...defaultQueueTableProps()} />);
    expect(screen.getByText(/Total: 1 of 1/i)).toBeInTheDocument();
  });
});

describe("app/components/queue/ContactSearchDialog.tsx", () => {
  test("opens dialog", async () => {
    const { ContactSearchDialog } = await import("@/components/queue/ContactSearchDialog");
    render(
      <ContactSearchDialog
        open
        onOpenChange={noop}
        campaignId="1"
        workspaceId="w1"
        unfilteredCount={0}
        onAddToQueue={noop}
      />,
    );
    expect(screen.getByText("Search Contacts")).toBeInTheDocument();
  });
});
