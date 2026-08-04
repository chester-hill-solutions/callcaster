import React from "react";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Audit-D P1: the "Add agent" <select> on Queue Settings computed a Set of
 * available (unassigned) agent ids but never rendered it as <option>
 * elements — so admins could never actually pick an agent to assign,
 * regardless of how many workspace members existed.
 *
 * The dropdown must show every workspace agent who is NOT already a member
 * of *this* queue, as a selectable option (labeled by name, not raw id).
 */

vi.mock(
  "../../app/routes/workspaces+/$id/settings/queues.loader.server",
  () => ({ loader: vi.fn() }),
);
vi.mock(
  "../../app/routes/workspaces+/$id/settings/queues.action.server",
  () => ({ action: vi.fn() }),
);

type LoaderData = {
  workspaceId: string;
  queues: Array<{
    id: number;
    name: string;
    description: string | null;
    workspace_id: string;
    hold_audio: string | null;
  }>;
  members: Array<{ id: number; queue_id: number; user_id: string; workspace_id: string }>;
  numbers: Array<{
    id: number;
    phone_number: string | null;
    friendly_name: string | null;
    inbound_queue_id: number | null;
  }>;
  agents: Array<{
    user_id: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
  }>;
};

const defaultData: LoaderData = {
  workspaceId: "w1",
  queues: [
    { id: 1, name: "Sales", description: null, workspace_id: "w1", hold_audio: null },
  ],
  // Agent "u-assigned" is already on queue 1; "u-available" has never been
  // assigned to any queue and must still show up as a selectable option.
  members: [{ id: 10, queue_id: 1, user_id: "u-assigned", workspace_id: "w1" }],
  numbers: [],
  agents: [
    {
      user_id: "u-assigned",
      username: "assigned@example.test",
      first_name: "Assigned",
      last_name: "Agent",
      role: "member",
    },
    {
      user_id: "u-available",
      username: "available@example.test",
      first_name: "Available",
      last_name: "Agent",
      role: "member",
    },
  ],
};

async function renderQueueSettings(data: Partial<LoaderData> = {}) {
  const QueueSettingsPage = (
    await import("../../app/routes/workspaces+/$id/settings/queues.route")
  ).default;

  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/settings/queues",
        element: <QueueSettingsPage />,
        loader: () => ({ ...defaultData, ...data }),
        action: () => null,
      },
    ],
    { initialEntries: ["/workspaces/w1/settings/queues"] },
  );

  render(<RouterProvider router={router} />);
  await screen.findByText("Sales");
  return router;
}

describe("app/routes/workspaces+/$id/settings/queues.route.tsx — Add agent dropdown", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("renders the unassigned agent as a selectable option", async () => {
    await renderQueueSettings();

    const select = screen.getByRole("combobox");
    const availableOption = within(select).getByRole("option", {
      name: "Available Agent",
    }) as HTMLOptionElement;

    expect(availableOption).toBeInTheDocument();
    expect(availableOption.disabled).toBe(false);
    expect(availableOption.value).toBe("u-available");
  });

  test("does not offer an agent already assigned to this queue", async () => {
    await renderQueueSettings();

    const select = screen.getByRole("combobox");
    expect(
      within(select).queryByRole("option", { name: "Assigned Agent" }),
    ).not.toBeInTheDocument();
  });

  test("falls back to the empty-state option only when every agent is assigned", async () => {
    await renderQueueSettings({
      // Both agents already on queue 1 — none left to offer.
      members: [
        { id: 10, queue_id: 1, user_id: "u-assigned", workspace_id: "w1" },
        { id: 11, queue_id: 1, user_id: "u-available", workspace_id: "w1" },
      ],
    });

    const select = screen.getByRole("combobox");
    expect(
      within(select).getByText("All agents already assigned"),
    ).toBeInTheDocument();
  });
});
