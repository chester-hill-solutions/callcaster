import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import WorkspaceDetails from "@/routes/admin+/workspaces/$workspaceId.route";

vi.hoisted(() => { process.env.TZ = "UTC"; });
vi.mock("@/routes/admin+/workspaces/$workspaceId.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/components/workspace/WorkspaceOverview", () => ({ default: () => <p>Workspace overview</p> }));

test("support sees released history for an archived workspace without a restore action", async () => {
  const router = createMemoryRouter([{
    path: "/admin/workspaces/:workspaceId", Component: WorkspaceDetails,
    loader: () => ({
      workspace: { id: "owned", name: "Archived workspace", archived_at: "2026-10-01T12:00:00Z", disabled: false, credits: 0 },
      workspaceUsers: [], phoneNumbers: [],
      numberHistory: [{ id: "number:1", number_id: 1, phone_number: "+16135552995", friendly_name: "Past line", type: "rented", released_at: "2026-10-01T12:00:00.000Z" }],
    }),
  }], { initialEntries: ["/admin/workspaces/owned"] });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Released number history" });
  const row = screen.getByRole("row", { name: /Past line/ });
  expect(within(row).getByText("+16135552995")).toBeInTheDocument();
  expect(within(row).getByText("Oct 1, 2026")).toBeInTheDocument();
  expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /restore|rent|release/i })).not.toBeInTheDocument();
});
