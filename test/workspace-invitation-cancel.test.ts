import { beforeEach, describe, expect, test, vi } from "vitest";
import { InviteError } from "@chester-hill-solutions/auth";
import { asRouteResponse } from "./helpers/route-result";
import {
  withDataPlaneRouteArgs,
  withWorkspaceRouteArgs,
} from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  access: vi.fn(),
  cancel: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: (...args: unknown[]) => mocks.role(...args),
  requireWorkspaceAccess: (...args: unknown[]) => mocks.access(...args),
}));
vi.mock("@/lib/workspace-invitations.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-invitations.server")
  >()),
  cancelWorkspaceInvitationById: (...args: unknown[]) => mocks.cancel(...args),
  getWorkspaceInvitationById: (...args: unknown[]) => mocks.lookup(...args),
}));
const workspace = "11111111-2222-4333-8444-777777777777";
const user = "11111111-2222-4333-8444-555555555555";
const invite = "wi_test";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ role: "member" });
  mocks.access.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
});
async function api(invitationId = invite) {
  const { action } =
    await import("../app/routes/api+/workspaces+/$workspaceId/members.route");
  return asRouteResponse(
    action(
      await withDataPlaneRouteArgs(
        {
          params: { workspaceId: workspace },
          request: new Request(
            `https://base.example/api/workspaces/${workspace}/members`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                target: "invite",
                invite_id: invitationId,
              }),
            },
          ),
        },
        { userId: user, workspaceId: workspace },
      ),
    ),
  );
}
async function product(role = "member") {
  const { action } =
    await import("../app/routes/workspaces+/$id/settings.action.server");
  return asRouteResponse(
    action(
      await withWorkspaceRouteArgs(
        {
          params: { id: workspace },
          request: new Request(
            `https://base.example/workspaces/${workspace}/settings`,
            {
              method: "POST",
              body: new URLSearchParams({
                formName: "cancelInvite",
                userId: invite,
              }),
            },
          ),
        },
        {
          userId: user,
          workspaceId: workspace,
          userRole: role,
          headers: new Headers({ "x-request": "cancel-control" }),
        },
      ),
    ),
  );
}

describe("workspace cancellation adapters (#2076)", () => {
  test("the global admin helper derives the invitation workspace for the scoped writer", async () => {
    mocks.lookup.mockResolvedValue({
      workspace_id: "admin-selected-workspace",
    });
    const { deleteWorkspaceInviteById } =
      await import("@/lib/workspace-members-db.server");
    await deleteWorkspaceInviteById(invite);
    expect(mocks.cancel).toHaveBeenCalledWith(
      invite,
      "admin-selected-workspace",
    );
  });

  test("the global admin helper cannot write when the invitation is missing", async () => {
    mocks.lookup.mockResolvedValue(null);
    const { deleteWorkspaceInviteById } =
      await import("@/lib/workspace-members-db.server");
    await expect(deleteWorkspaceInviteById(invite)).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  test.each(["member", "admin", "owner"])(
    "%s API and form pass the authorized workspace to the writer",
    async (role) => {
      mocks.role.mockResolvedValue({ role });
      const apiResponse = await api();
      expect(apiResponse.status).toBe(200);
      expect(await apiResponse.json()).toEqual({ success: true, invites: [] });
      expect(mocks.cancel).toHaveBeenLastCalledWith(invite, workspace);
      const formResponse = await product(role);
      expect(formResponse.status).toBe(200);
      expect(await formResponse.json()).toEqual({
        data: { invitationId: invite },
        error: null,
      });
      expect(mocks.cancel).toHaveBeenLastCalledWith(invite, workspace);
    },
  );
  test("writer not-found is a uniform 404 through API and product, with form headers preserved", async () => {
    mocks.cancel.mockRejectedValue(
      new InviteError("Invitation not found.", "INVITE_NOT_FOUND", 404),
    );
    for (const response of [await api(), await product()]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: "Invitation not found.",
      });
    }
    expect((await product()).headers.get("x-request")).toBe("cancel-control");
  });
  test("unexpected failure remains an error and cannot become success", async () => {
    mocks.cancel.mockRejectedValue(new Error("Database unavailable"));
    expect((await api()).status).toBe(500);
    const form = await product();
    expect(form.status).toBe(500);
    expect(await form.json()).toEqual({
      data: null,
      error: "Could not cancel the invitation.",
    });
  });
  test("callers cannot reach the writer through API or form", async () => {
    mocks.role.mockResolvedValue({ role: "caller" });
    expect((await api()).status).toBe(403);
    expect((await product("caller")).status).toBe(403);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  test("non-members keep a uniform workspace 404 and cannot write", async () => {
    mocks.role.mockResolvedValue(null);
    expect((await api()).status).toBe(404);
    mocks.access.mockRejectedValue(
      Response.json({ error: "Workspace not found" }, { status: 404 }),
    );
    expect((await product()).status).toBe(404);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
