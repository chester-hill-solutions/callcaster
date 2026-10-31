import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLoaderData } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { AdminWorkspacesPanel } from "@/routes/admin+/panels/AdminWorkspacesPanel";
import type { WorkspaceAdminRow } from "@/lib/admin-workspaces";

function row(id: string, name: string, archivedAt: string | null): WorkspaceAdminRow {
  return {
    id, name, archivedAt, ownerUsername: "Owner", ownerUserId: null,
    credits: 10, disabled: false, campaignCount: 0, memberCount: 1,
    phoneNumberCount: 0, createdAt: "2026-01-01T00:00:00Z",
    twilioSyncStatus: "healthy", twilioAccountStatus: "active",
    twilioLastSyncedAt: null, twilioLastSyncError: null, twilioNumberTypes: [],
    opsState: "ready", sendMode: "from_number", onboardingStatus: "complete",
    voiceReady: false, legacyMode: false,
  };
}

function mount() {
  let rows = [
    row("archived", "Archive site", "2026-10-25T12:00:00Z"),
    row("live", "Live site", null),
  ];
  const submitted = vi.fn();
  function Page() {
    const data = useLoaderData<WorkspaceAdminRow[]>();
    return <Tabs defaultValue="workspaces"><AdminWorkspacesPanel workspaceRows={data} /></Tabs>;
  }
  const router = createMemoryRouter([{
    path: "/admin", loader: () => rows, Component: Page,
    action: async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      rows = rows.map((entry) => ({ ...entry, archivedAt: null }));
      return { success: "Workspace restored" };
    },
  }], { initialEntries: ["/admin"] });
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), submitted };
}

describe("admin archive visibility and restore confirmation (#2992, #2993)", () => {
  test("marks the archived row with its date and leaves a live row unmarked", async () => {
    mount();
    const archived = await screen.findByRole("row", { name: /Archive site/ });
    expect(within(archived).getByText("Archived")).toBeInTheDocument();
    expect(within(archived).getByText("Oct 25, 2026")).toHaveAttribute("dateTime", "2026-10-25T12:00:00Z");
    expect(within(archived).getByRole("button", { name: "Restore Archive site" })).toBeInTheDocument();
    const live = screen.getByRole("row", { name: /Live site/ });
    expect(within(live).queryByText("Archived")).not.toBeInTheDocument();
    expect(within(live).queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();
  });

  test("explains number loss and new keys before confirmation and cancel sends nothing", async () => {
    const { user, submitted } = mount();
    await user.click(await screen.findByRole("button", { name: "Restore Archive site" }));
    const dialog = screen.getByRole("dialog", { name: "Restore workspace" });
    expect(within(dialog).getByText(/Released phone numbers will not be rented again/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Old API keys will not work; create new keys after restore/)).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
  });

  test("submits the selected row only after confirmation and shows reloaded state", async () => {
    const { user, submitted } = mount();
    await user.click(await screen.findByRole("button", { name: "Restore Archive site" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore workspace" }));
    await waitFor(() => expect(submitted).toHaveBeenCalledWith({
      _action: "restore_workspace", workspaceId: "archived", confirmRestore: "yes",
    }));
    await waitFor(() => expect(screen.queryByText("Archived", { exact: true })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Restore Archive site" })).not.toBeInTheDocument();
  });
});
