import { afterEach, describe, expect, test, vi } from "vitest";
import { useEffect } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import WorkspaceDetails from "@/routes/admin+/workspaces/$workspaceId.route";
import WorkspaceAccess from "@/routes/admin+/workspaces/$workspaceId/invite.route";
import { Toaster } from "@/components/ui/sonner";

// The real parent (with its Tabs) and the real Access route are under test. Only
// the server re-export boundary is replaced so the fixture can supply router
// data without importing the database graph.
vi.mock("@/routes/admin+/workspaces/$workspaceId.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/routes/admin+/workspaces/$workspaceId/invite.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/routes/admin+/workspaces/$workspaceId/invite.action.server", () => ({ action: vi.fn() }));

/** A fresh result per submission, as the real action returns from routeData(). */
const successResult = () => ({ success: true, error: null });
const SUCCESS_MESSAGE = "Action completed successfully!";
const ERROR_MESSAGE = "A member and valid workspace role are required";

const parentData = {
  workspace: { id: "w1", name: "Ownerless workspace", disabled: false },
  workspaceUsers: [],
  phoneNumbers: [],
  twilioPortalSnapshot: null,
};

const accessData = {
  workspace: { id: "w1", name: "Ownerless workspace" },
  userRole: "admin",
  activeUserId: "actor-1",
  hasAccess: true,
  pendingInvites: [],
  users: [
    { id: "owner-1", username: "owner@example.com", first_name: null, last_name: null, role: "owner" },
    { id: "member-1", username: "member@example.com", first_name: null, last_name: null, role: "member" },
  ],
};

/** Mount/unmount accounting for the routed child. */
type Probe = { mounts: number; unmounts: number };

function showAccess(action: (form: FormData) => unknown, probe?: Probe) {
  const Child = probe
    ? function ProbedAccess() {
        useEffect(() => {
          probe.mounts += 1;
          return () => {
            probe.unmounts += 1;
          };
        }, []);
        return <WorkspaceAccess />;
      }
    : WorkspaceAccess;

  const router = createMemoryRouter(
    [
      {
        path: "/admin/workspaces/:workspaceId",
        Component: WorkspaceDetails,
        loader: () => parentData,
        children: [
          {
            path: "invite",
            Component: Child,
            loader: () => accessData,
            action: async ({ request }) => action(await request.formData()),
          },
        ],
      },
    ],
    { initialEntries: ["/admin/workspaces/w1/invite"] },
  );
  render(
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </>,
  );
  return router;
}

const toastNodes = () => document.querySelectorAll("[data-sonner-toast]").length;

afterEach(async () => {
  toast.dismiss();
  await waitFor(() => expect(toastNodes()).toBe(0), { timeout: 3_000 });
  cleanup();
  vi.restoreAllMocks();
});

describe("Access form result notices (#2459)", () => {
  test("one recovery click produces exactly one notice", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    showAccess(successResult);

    await user.click(await screen.findByRole("button", { name: "Invite" }));
    await screen.findByText(SUCCESS_MESSAGE);

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(SUCCESS_MESSAGE)).toHaveLength(1);
    expect(toastNodes()).toBe(1);
  });

  test("the routed child mounts once for one page lifetime", async () => {
    const user = userEvent.setup();
    const probe: Probe = { mounts: 0, unmounts: 0 };
    showAccess(successResult, probe);

    await user.click(await screen.findByRole("button", { name: "Invite" }));
    await screen.findByText(SUCCESS_MESSAGE);

    expect(probe.mounts).toBe(1);
    expect(probe.unmounts).toBe(0);
  });

  test("a second valid action shows its own result, including the same message", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    showAccess(successResult);

    const submit = await screen.findByRole("button", { name: "Invite" });
    await user.click(submit);
    await screen.findByText(SUCCESS_MESSAGE);
    await user.click(submit);

    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(SUCCESS_MESSAGE)).toHaveLength(2);
  });

  test("an error after a success stays visible and is not suppressed", async () => {
    const user = userEvent.setup();
    let call = 0;
    showAccess(() => {
      call += 1;
      return call === 1 ? successResult() : { error: ERROR_MESSAGE };
    });

    const submit = await screen.findByRole("button", { name: "Invite" });
    await user.click(submit);
    await screen.findByText(SUCCESS_MESSAGE);
    await user.click(submit);

    await screen.findByText(ERROR_MESSAGE);
    expect(screen.getAllByText(ERROR_MESSAGE)).toHaveLength(1);
    expect(screen.getAllByText(SUCCESS_MESSAGE)).toHaveLength(1);
  });

  test("revalidation does not replay a handled result", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    const router = showAccess(successResult);

    await user.click(await screen.findByRole("button", { name: "Invite" }));
    await screen.findByText(SUCCESS_MESSAGE);
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));

    await act(async () => {
      await router.revalidate();
    });
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));

    expect(success).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(SUCCESS_MESSAGE)).toHaveLength(1);
  });

  test("the panel renders one copy of the child", async () => {
    const user = userEvent.setup();
    showAccess(successResult);

    await user.click(await screen.findByRole("button", { name: "Invite" }));
    await screen.findByText(SUCCESS_MESSAGE);

    expect(screen.getAllByRole("button", { name: "Invite" })).toHaveLength(1);
    expect(within(document.body).queryAllByLabelText("Email")).toHaveLength(1);
  });
});
