import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { toast } from "sonner";
import WorkspaceSettings from "@/routes/workspaces+/$id/settings.route";
import { Toaster } from "@/components/ui/sonner";

vi.mock("@/routes/workspaces+/$id/settings.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/routes/workspaces+/$id/settings.action.server", () => ({ action: vi.fn() }));

afterEach(async () => {
  toast.dismiss();
  await waitFor(() => expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(0), { timeout: 3_000 });
  cleanup();
  vi.restoreAllMocks();
});

function showSettings(action: (form: FormData) => unknown) {
  const workspace = { id: "w1", name: "My workspace" };
  const router = createMemoryRouter([{
    path: "/workspaces/w1",
    Component: () => <main><Outlet context={{ workspace }} /></main>,
    children: [{
      path: "settings",
      Component: WorkspaceSettings,
      loader: () => ({
        workspace, userRole: "owner", activeUserId: "owner", hasAccess: true,
        canManageApiKeys: false, grantableApiKeyScopes: [], apiKeys: [], webhook: null,
        users: [{ id: "owner", username: "owner@example.com", first_name: null, last_name: null, role: "owner" }],
        pendingInvites: [{ id: "invite-1", email: "pending@example.com", user: null }],
      }),
      action: async ({ request }) => action(await request.formData()),
    }],
  }], { initialEntries: ["/workspaces/w1/settings"] });
  render(<><RouterProvider router={router} /><Toaster position="top-right" /></>);
  return router;
}

describe("workspace settings action feedback (#2306)", () => {
  test("archive consent explains that restore requires new keys", async () => {
    const submitted = vi.fn();
    showSettings(submitted);
    const consent = await screen.findByRole("checkbox", { name: /All API keys will be revoked. New keys will be needed after restore/ });
    expect(consent).toBeRequired();
    expect(consent).not.toBeChecked();
    expect(screen.getByText(/Restore requires new API keys/)).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
  });

  test("cancel-invite failure appears once, leaves Email valid, and does not replay", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, "error");
    const router = showSettings(() => ({ error: "Could not cancel the invitation." }));
    const email = await screen.findByLabelText("Email");
    await user.type(email, "keep@example.com");
    await user.click(screen.getByRole("button", { name: "Cancel invite for pending@example.com" }));
    await screen.findByText("Could not cancel the invitation.");
    expect(screen.getAllByText("Could not cancel the invitation.")).toHaveLength(1);
    expect(within(screen.getByRole("main", { hidden: true })).queryByText("Could not cancel the invitation.")).toBeNull();
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).toHaveValue("keep@example.com");
    await act(async () => { router.revalidate(); });
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));
    expect(error).toHaveBeenCalledTimes(1);
  });

  test.each([
    "You don't have permission to perform this action",
    "Invalid workspace role",
    "Must provide an email address",
  ])("an invite operation error without field metadata stays in one toast: %s", async (message) => {
    const user = userEvent.setup();
    showSettings(() => ({ error: message }));
    const email = await screen.findByLabelText("Email");
    await user.type(email, "retry@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "member");
    await user.click(screen.getByRole("button", { name: "Invite", exact: true }));
    await screen.findByText(message);
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).not.toHaveAttribute("aria-describedby");
    expect(email).toHaveValue("retry@example.com");
    expect(screen.getByLabelText("Role")).toHaveValue("member");
  });

  test("missing-email feedback is associated only with Email, then corrected input can succeed", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    const forms: FormData[] = [];
    const router = showSettings((form) => {
      forms.push(form);
      return forms.length === 1
        ? { error: "Email is required.", fieldErrors: { username: "Email is required." } }
        : { success: true, error: null, data: { id: "new-invite" } };
    });
    const email = await screen.findByLabelText("Email");
    await user.selectOptions(screen.getByLabelText("Role"), "member");
    await user.click(screen.getByRole("button", { name: "Invite", exact: true }));
    await screen.findByText("Email is required.");
    expect(screen.getAllByText("Email is required.")).toHaveLength(1);
    expect(email).toHaveAccessibleDescription("Email is required.");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Role")).not.toHaveAttribute("aria-invalid");
    expect(error).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    await act(async () => { router.revalidate(); });
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));
    expect(error).not.toHaveBeenCalled();
    await user.type(email, "corrected@example.com");
    await user.click(screen.getByRole("button", { name: "Invite", exact: true }));
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(forms[1]?.get("username")).toBe("corrected@example.com");
    expect(forms[1]?.get("new_user_workspace_role")).toBe("member");
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).not.toHaveAttribute("aria-describedby");
    expect(email).toHaveValue("");
    expect(screen.queryByText("Email is required.")).toBeNull();
    expect(screen.getAllByText("Action completed successfully!")).toHaveLength(1);
  });

  test("a later failed retry produces its own result and retains the entered values", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, "error");
    showSettings(() => ({ error: "Try again later." }));
    const email = await screen.findByLabelText("Email");
    await user.type(email, "retry@example.com");
    await user.click(screen.getByRole("button", { name: "Invite", exact: true }));
    await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Invite", exact: true }));
    await waitFor(() => expect(error).toHaveBeenCalledTimes(2));
    expect(email).toHaveValue("retry@example.com");
    expect(email).not.toHaveAttribute("aria-invalid");
  });
});
