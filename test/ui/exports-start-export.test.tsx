import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import WorkspaceExports from "@/routes/workspaces+/$id/exports.route";

// The route re-exports its loader, which reaches the database at import time.
vi.mock("@/routes/workspaces+/$id/exports.loader.server", () => ({ loader: vi.fn() }));

/**
 * The exports page could list and download exports but had no way to create
 * one — a surface a user can reach and do nothing on. These cover the control
 * that fixes that, including the two states where it must not silently no-op.
 */
const CAMPAIGNS = [
  { id: 7, title: "Spring Outreach", type: "live_call" },
  { id: 9, title: "Renewal Reminders", type: "message" },
];

function renderExports(loaderData: Record<string, unknown>) {
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/exports",
        element: <WorkspaceExports />,
        loader: () => loaderData,
      },
    ],
    { initialEntries: ["/workspaces/ws-1/exports"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Workspace exports — starting an export", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("posts the chosen campaign to the export endpoint", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ exportId: "e1", status: "started" })));
    vi.stubGlobal("fetch", fetchMock);

    renderExports({ campaigns: CAMPAIGNS, exports: [] });

    await user.click(await screen.findByLabelText("Campaign to export"));
    await user.click(await screen.findByText("Renewal Reminders"));
    await user.click(screen.getByRole("button", { name: /^Export$/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/campaign-export");
    expect(init.method).toBe("POST");
    // The endpoint reads both from form data and 400s without them.
    expect((init.body as FormData).get("campaignId")).toBe("9");
    expect((init.body as FormData).get("workspaceId")).toBe("ws-1");
  });

  test("cannot submit before a campaign is chosen", async () => {
    renderExports({ campaigns: CAMPAIGNS, exports: [] });
    expect(await screen.findByRole("button", { name: /^Export$/ })).toBeDisabled();
  });

  test("surfaces a failed start instead of appearing to succeed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 }),
      ),
    );

    renderExports({ campaigns: CAMPAIGNS, exports: [] });

    await user.click(await screen.findByLabelText("Campaign to export"));
    await user.click(await screen.findByText("Spring Outreach"));
    await user.click(screen.getByRole("button", { name: /^Export$/ }));

    expect(await screen.findByText(/Campaign not found|Could not start the export/)).toBeVisible();
  });

  test("a workspace with no exportable campaigns is told what to do first", async () => {
    renderExports({ campaigns: [], exports: [] });
    expect(await screen.findByText(/Create a campaign first/)).toBeVisible();
    expect(screen.queryByLabelText("Campaign to export")).not.toBeInTheDocument();
  });
});
