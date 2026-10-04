import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import Workspaces from "../../app/routes/workspaces+/index";
import { Toaster } from "../../app/components/ui/sonner";
import type { InvitationFlash } from "../../app/lib/invitation-flash.server";

vi.mock("../../app/routes/workspaces+/index.loader.server", () => ({ loader: vi.fn() }));
vi.mock("../../app/routes/workspaces+/index.action.server", () => ({ action: vi.fn() }));

afterEach(async () => {
  toast.dismiss();
  await waitFor(() => expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(0), { timeout: 3_000 });
  cleanup(); vi.restoreAllMocks();
});

function showWorkspaces(receipt: () => InvitationFlash | null, url = "/workspaces") {
  const router = createMemoryRouter([
    { path: "/workspaces", Component: Workspaces, loader: () => ({
      workspaces: [{ last_accessed: null, role: "owner", workspace: { id: "w1", name: "My Workspace" } }],
      error: null, flash: receipt(),
    }) },
  ], { initialEntries: [url] });
  render(<><RouterProvider router={router} /><Toaster position="top-right" /></>);
  return router;
}

describe("invitation success feedback", () => {
  test("shows one root toast across same-receipt revalidation and retains the workspace list", async () => {
    const success = vi.spyOn(toast, "success");
    let id = "f65549c8-70f9-4445-ad2d-fd2b165a5a15";
    const router = showWorkspaces(() => ({ code: "invite_accepted", id }));
    const list = await screen.findByRole("link", { name: /My Workspace/ });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Invitation accepted"));
    await waitFor(() => expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(1));
    expect(screen.getAllByText("Invitation accepted")).toHaveLength(1);
    expect(within(screen.getByRole("main")).queryByText("Invitation accepted")).not.toBeInTheDocument();
    await act(async () => { router.revalidate(); });
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));
    expect(success).toHaveBeenCalledTimes(1);
    expect(list).toBe(screen.getByRole("link", { name: /My Workspace/ }));
    id = "a57ff86b-ff23-4e4d-a0b8-7b23f5c3441f";
    await act(async () => { router.revalidate(); });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
  });

  test("an old invite query parameter cannot create a toast or inline banner", async () => {
    const success = vi.spyOn(toast, "success");
    showWorkspaces(() => null, "/workspaces?invite=accepted");
    await screen.findByRole("link", { name: /My Workspace/ });
    expect(success).not.toHaveBeenCalled();
    expect(screen.queryByText("Invitation accepted")).not.toBeInTheDocument();
  });
});
