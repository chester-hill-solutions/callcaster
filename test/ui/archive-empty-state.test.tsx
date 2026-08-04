import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";

// The route re-exports its loader from a server-only module; the component
// under test never runs it, so stub it out to keep the DB out of jsdom.
vi.mock("../../app/routes/workspaces+/$id/campaigns/archive.loader.server", () => ({
  loader: vi.fn(),
}));

const workspaceId = "11111111-1111-1111-1111-111111111111";

type CampaignFixture = { id: number; title: string; status: string };

/**
 * `archive.route.tsx` reads `campaigns` off the outlet context, which
 * `campaigns.route.tsx` supplies in the real tree — so the parent here has to
 * provide it too, or the empty state can't tell drafts from a fresh workspace.
 */
async function renderArchive(campaigns: CampaignFixture[]) {
  const mod = await import(
    "../../app/routes/workspaces+/$id/campaigns/archive.route"
  );

  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/campaigns",
        Component: () =>
          createElement(Outlet, {
            context: { workspace: { id: workspaceId }, campaigns },
          }),
        children: [
          {
            path: "archive",
            Component: mod.default,
            loader: () => ({ archivedCampaigns: [] }),
          },
        ],
      },
    ],
    { initialEntries: [`/workspaces/${workspaceId}/campaigns/archive`] },
  );

  render(createElement(RouterProvider, { router }));
  await screen.findByText("No archived campaigns found");
}

describe("archived campaigns empty state", () => {
  test("offers to create a first campaign when the workspace has none", async () => {
    await renderArchive([]);

    expect(
      screen.getByRole("link", { name: /create your first campaign/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view drafts/i })).toBeNull();
  });

  // The reported bug: the archive told people to create their first campaign
  // while they already had drafts sitting in the campaigns list.
  test("points at existing drafts instead of claiming there are none", async () => {
    await renderArchive([{ id: 1, title: "Draft one", status: "draft" }]);

    expect(
      screen.queryByRole("link", { name: /create your first campaign/i }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /view drafts/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 draft campaign that hasn't been archived yet/i),
    ).toBeInTheDocument();
  });

  test("pluralises the draft count", async () => {
    await renderArchive([
      { id: 1, title: "Draft one", status: "draft" },
      { id: 2, title: "Draft two", status: "draft" },
      { id: 3, title: "Running", status: "running" },
    ]);

    expect(
      screen.getByText(/2 draft campaigns that haven't been archived yet/i),
    ).toBeInTheDocument();
  });
});
