import React from "react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

export function makeContact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    firstname: "Ada",
    surname: "Lovelace",
    phone: "+15551234567",
    email: "ada@example.com",
    address: "1 Main St",
    external_id: "ext-1",
    workspace: "ws-1",
    ...overrides,
  } as never;
}

export function makeHousehold(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    contact: makeContact({ id: i + 2, firstname: `H${i}` }),
  })) as never;
}

export function makeCampaign(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    title: "Test Campaign",
    type: "live_call",
    status: "draft",
    workspace: "ws-1",
    ...overrides,
  } as never;
}

export function makeQueueItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "q1",
    status: "queued",
    contact: makeContact(),
    ...overrides,
  } as never;
}

export const noop = vi.fn();

export function SmokeRouter({ children }: { children: React.ReactNode }) {
  return <MemoryRouter initialEntries={["/workspaces/ws-1/campaigns/1"]}>{children}</MemoryRouter>;
}

export function DataSmokeRouter({ children }: { children: React.ReactNode }) {
  const router = createMemoryRouter([{ path: "*", element: <>{children}</> }], {
    initialEntries: ["/"],
  });
  return <RouterProvider router={router} />;
}

export const defaultQueueTableProps = () => ({
  queue: [makeQueueItem()],
  totalCount: 1,
  unfilteredCount: 1,
  currentPage: 1,
  pageSize: 25,
  audiences: [{ id: 1, name: "Audience A" }],
  defaultFilters: {
    name: "",
    phone: "",
    email: "",
    address: "",
    audiences: "",
    disposition: "",
    queueStatus: "",
  },
  handleFilterChange: noop,
  clearFilter: noop,
  onSelectAllFiltered: noop,
  isAllFilteredSelected: false,
  addContactToQueue: noop,
  removeContactsFromQueue: noop,
});
