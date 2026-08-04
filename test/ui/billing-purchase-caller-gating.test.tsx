import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";

// The route re-exports its loader/action from server-only modules that pull
// in the DB; the component under test never runs them (the router config
// below supplies its own stub loader), so mock them out to keep jsdom clean.
vi.mock("../../app/routes/workspaces+/$id/billing.loader.server", () => ({
  loader: vi.fn(),
}));
vi.mock("../../app/routes/workspaces+/$id/billing.action.server", () => ({
  action: vi.fn(),
}));

const workspaceId = "11111111-1111-1111-1111-111111111111";

async function renderBilling(userRole?: string) {
  const mod = await import("../../app/routes/workspaces+/$id/billing.route");

  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id",
        Component: () => createElement(Outlet, { context: { userRole } }),
        children: [
          {
            path: "billing",
            Component: mod.default,
            loader: () => ({
              credits: { balance: 100, history: [] },
              stripeKeyMode: "test",
            }),
          },
        ],
      },
    ],
    { initialEntries: [`/workspaces/${workspaceId}/billing`] },
  );

  render(createElement(RouterProvider, { router }));
  await screen.findByText("Current Balance");
}

// The Purchase Credits action is gated Admin+ server-side
// (billing.action.server.ts). The "Credits" nav link is already hidden for
// non-admins, but the page itself rendered the full purchase form
// unconditionally for anyone who landed on it directly — always 403ing on
// submit for a caller. This mirrors the create-campaign fix: gate the
// page's own content, not just its nav entry point.
describe("billing page hides Purchase Credits from roles that can't use it", () => {
  test("caller sees an explanation instead of the purchase form", async () => {
    await renderBilling("caller");

    expect(
      screen.queryByRole("button", { name: /purchase credits/i }),
    ).toBeNull();
    expect(
      screen.getByText(/contact your workspace admin or owner to purchase credits/i),
    ).toBeInTheDocument();
  });

  test("member sees an explanation instead of the purchase form", async () => {
    await renderBilling("member");

    expect(
      screen.queryByRole("button", { name: /purchase credits/i }),
    ).toBeNull();
  });

  test.each(["admin", "owner"])(
    "%s sees the Purchase Credits form",
    async (role) => {
      await renderBilling(role);

      expect(
        screen.getByRole("button", { name: /purchase credits/i }),
      ).toBeInTheDocument();
    },
  );
});
