import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";

// The route re-exports its action from a server-only module that pulls in
// the DB; the component under test never runs it here, so mock it out to
// keep jsdom clean (mirrors test/ui/archive-empty-state.test.tsx).
vi.mock("../../app/routes/workspaces+/$id/campaigns/new.action.server", () => ({
  action: vi.fn(),
}));

const workspaceId = "11111111-1111-1111-1111-111111111111";

async function renderNewCampaign(userRole?: string) {
  const mod = await import(
    "../../app/routes/workspaces+/$id/campaigns/new.route"
  );

  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/campaigns",
        Component: () => createElement(Outlet, { context: { userRole } }),
        children: [
          {
            path: "new",
            Component: mod.default,
          },
        ],
      },
    ],
    { initialEntries: [`/workspaces/${workspaceId}/campaigns/new`] },
  );

  render(createElement(RouterProvider, { router }));
  await screen.findByRole("heading", { name: "Add Campaign" });
}

// Creating a campaign is gated Admin+ server-side (new.action.server.ts).
// The nav entry point is now hidden for callers (see
// workspace-nav-campaign-caller-gating.test.tsx), but this covers anyone who
// still lands on the page directly (bookmark, shared link, back button) so
// the write form isn't shown to a role that will always get a 403 on submit.
describe("campaigns/new hides the create form from roles that can't use it", () => {
  test("caller sees an explanation instead of the create form", async () => {
    await renderNewCampaign("caller");

    expect(screen.queryByLabelText(/campaign name/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^add campaign$/i })).toBeNull();
    expect(
      screen.getByText(/contact your workspace admin or owner to create a campaign/i),
    ).toBeInTheDocument();
  });

  test("member sees an explanation instead of the create form", async () => {
    await renderNewCampaign("member");

    expect(screen.queryByLabelText(/campaign name/i)).toBeNull();
  });

  test.each(["admin", "owner"])("%s sees the create form", async (role) => {
    await renderNewCampaign(role);

    expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^add campaign$/i }),
    ).toBeInTheDocument();
  });
});
