import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContactSearchDialog } from "@/components/queue/ContactSearchDialog";

function renderDialog(onAddToQueue = vi.fn()) {
  const hostRoutes = [
    {
      path: "/workspaces/w1/campaigns/1/queue",
      element: createElement(ContactSearchDialog, {
        open: true,
        onOpenChange: vi.fn(),
        campaignId: "1",
        workspaceId: "w1",
        unfilteredCount: 0,
        onAddToQueue,
      }),
    },
    {
      path: "/api/contacts",
      loader: () => ({ contacts: [] }),
      action: ({ request }: { request: Request }) => {
        const params = new URLSearchParams(request.url.split("?")[1] ?? "");
        void params;
        return { id: 1, firstname: "Ada" };
      },
    },
  ];
  const router = createMemoryRouter(hostRoutes, {
    initialEntries: ["/workspaces/w1/campaigns/1/queue"],
  });
  render(createElement(RouterProvider, { router }));
  return { router, onAddToQueue };
}

describe("ContactSearchDialog add-from-search (#1726)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("renders a bottom 'Add …' row, disabled until the query is non-empty", async () => {
    renderDialog();
    const addTrigger = await screen.findByRole("button", {
      name: /Add “…” as a new contact/,
    });
    expect(addTrigger).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText("Search by name or phone..."),
      { target: { value: "Ada" } },
    );

    const enabled = await screen.findByRole("button", {
      name: /Add “Ada” as a new contact/,
    });
    expect(enabled).not.toBeDisabled();
  });

  test("creates the contact from the query and queues it in place", async () => {
    const onAddToQueue = vi.fn();
    renderDialog(onAddToQueue);

    fireEvent.change(
      screen.getByPlaceholderText("Search by name or phone..."),
      { target: { value: "Ada" } },
    );
    const addBtn = await screen.findByRole("button", {
      name: /Add “Ada” as a new contact/,
    });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(onAddToQueue).toHaveBeenCalledWith([
        expect.objectContaining({ id: 1, firstname: "Ada" }),
      ]);
    });
  });
});