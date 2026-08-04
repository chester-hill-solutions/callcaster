import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
 * `archive.route.tsx` reads `workspace`/`campaigns`/`userRole` off the
 * outlet context, which `campaigns.route.tsx` supplies in the real tree.
 * The Restore button submits a fetcher POST to the campaign settings
 * action route (`/workspaces/:id/campaigns/:campaignId/settings`), so a
 * stub of that route's action is mounted alongside `archive` to observe it.
 */
async function renderArchive({
  archivedCampaigns,
  userRole,
  settingsAction,
}: {
  archivedCampaigns: CampaignFixture[];
  userRole?: string;
  settingsAction?: (args: { request: Request }) => unknown;
}) {
  const mod = await import(
    "../../app/routes/workspaces+/$id/campaigns/archive.route"
  );

  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/campaigns",
        Component: () =>
          createElement(Outlet, {
            context: { workspace: { id: workspaceId }, campaigns: [], userRole },
          }),
        children: [
          {
            path: "archive",
            Component: mod.default,
            loader: () => ({ archivedCampaigns }),
          },
          {
            path: ":campaignId/settings",
            action:
              settingsAction ??
              (() => ({ success: true, actionType: "status", status: "draft" })),
            Component: () => null,
          },
        ],
      },
    ],
    { initialEntries: [`/workspaces/${workspaceId}/campaigns/archive`] },
  );

  render(createElement(RouterProvider, { router }));
  return router;
}

describe("archived campaigns restore control", () => {
  test("admin sees a Restore button for each archived campaign", async () => {
    await renderArchive({
      archivedCampaigns: [
        { id: 42, title: "AuditFix Restore Target", status: "archived" },
      ],
      userRole: "admin",
    });

    expect(
      await screen.findByText("AuditFix Restore Target"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  test("owner also sees the Restore button", async () => {
    await renderArchive({
      archivedCampaigns: [
        { id: 42, title: "AuditFix Restore Target", status: "archived" },
      ],
      userRole: "owner",
    });

    expect(
      await screen.findByText("AuditFix Restore Target"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  // The restore action is gated Admin+ server-side (settings.action.server.ts
  // "status" intent). A caller/member visiting the archive list would only
  // get a 403 on submit, so the control should not render for them at all —
  // the same UX-consistency principle as hiding the create-campaign nav link.
  test.each(["caller", "member"])(
    "%s does not see a Restore button",
    async (role) => {
      await renderArchive({
        archivedCampaigns: [
          { id: 42, title: "AuditFix Restore Target", status: "archived" },
        ],
        userRole: role,
      });

      expect(
        await screen.findByText("AuditFix Restore Target"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    },
  );

  test("clicking Restore submits intent=status, status=draft to the campaign settings action", async () => {
    const settingsAction = vi.fn(async ({ request }: { request: Request }) => {
      const body = await request.formData();
      expect(body.get("intent")).toBe("status");
      expect(body.get("status")).toBe("draft");
      return { success: true, actionType: "status", status: "draft" };
    });

    await renderArchive({
      archivedCampaigns: [
        { id: 42, title: "AuditFix Restore Target", status: "archived" },
      ],
      userRole: "owner",
      settingsAction,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(settingsAction).toHaveBeenCalledTimes(1));
  });

  test("shows the server error and re-enables the button when restore fails", async () => {
    const settingsAction = vi.fn(async () => ({
      success: false,
      error: "You don't have permission to perform this action",
      actionType: "status",
    }));

    await renderArchive({
      archivedCampaigns: [
        { id: 42, title: "AuditFix Restore Target", status: "archived" },
      ],
      userRole: "owner",
      settingsAction,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    expect(
      await screen.findByText("You don't have permission to perform this action"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).not.toBeDisabled();
  });
});
