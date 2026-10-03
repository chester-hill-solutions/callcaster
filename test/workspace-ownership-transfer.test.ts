import { beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

const owner = "11111111-2222-4333-8444-555555555555";
const target = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const workspace = "11111111-2222-4333-8444-666666666666";
const message = "Choose a different member to transfer workspace ownership.";
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  mfa: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  membership: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/two-factor.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/two-factor.server")>()),
  isTwoFactorEnabled: (...args: unknown[]) => mocks.mfa(...args),
}));
vi.mock("@/lib/audit-event.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit-event.server")>()),
  safeRecordWorkspaceAuditEvent: (...args: unknown[]) => mocks.audit(...args),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: (...args: unknown[]) => mocks.role(...args),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));
vi.mock("@/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      transaction: (...args: unknown[]) => mocks.transaction(...args),
    },
  };
});
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: () => ({
    workspace_member: {
      findFirst: (...args: unknown[]) => mocks.membership(...args),
      update: (...args: unknown[]) => mocks.update(...args),
    },
  }),
}));
vi.mock("@/lib/data-plane-route.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data-plane-route.server")>()),
  requireDataPlaneWorkspaceUser: async () => ({
    userId: "11111111-2222-4333-8444-555555555555",
    workspaceId: "11111111-2222-4333-8444-666666666666",
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ role: "owner" });
  mocks.mfa.mockResolvedValue(true);
  mocks.membership.mockResolvedValue({
    id: "target-member",
    user_id: target,
    role_id: "member",
  });
  mocks.transaction.mockImplementation(
    async (run: (tx: object) => Promise<unknown>) => run({}),
  );
  mocks.update.mockImplementation(
    async ({ set }: { set: { role_id: string } }) => [
      {
        id: set.role_id === "owner" ? "target-member" : "owner-member",
        role_id: set.role_id,
      },
    ],
  );
});

async function api(newOwner: string) {
  const { action } =
    await import("../app/routes/api+/workspaces+/$workspaceId/transfer-ownership.route");
  return asRouteResponse(
    action({
      params: { workspaceId: workspace },
      context: new RouterContextProvider(),
      request: new Request(
        `https://base.example/api/workspaces/${workspace}/transfer-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_owner_user_id: newOwner }),
        },
      ),
    }),
  );
}
async function product(newOwner: string, role = "owner") {
  const { action } =
    await import("../app/routes/workspaces+/$id/settings.action.server");
  const args = await withWorkspaceRouteArgs(
    {
      params: { id: workspace },
      request: new Request(
        `https://base.example/workspaces/${workspace}/settings`,
        {
          method: "POST",
          body: new URLSearchParams({
            formName: "transferWorkspaceOwnership",
            user_id: newOwner,
            workspace_owner_id: target,
          }),
        },
      ),
    },
    { userId: owner, workspaceId: workspace, userRole: role },
  );
  return asRouteResponse(action(args));
}

describe("workspace self-transfer rejection (#2079)", () => {
  test("the canonical writer rejects the current owner before MFA or a transaction", async () => {
    const { transferWorkspaceOwnership } =
      await import("@/lib/workspace-members-db.server");
    await expect(
      transferWorkspaceOwnership({
        workspaceId: workspace,
        currentOwnerUserId: owner,
        newOwnerUserId: owner,
      }),
    ).rejects.toThrow(message);
    expect(mocks.mfa).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  test.each([true, false])(
    "API self transfer rejects with 400 before target MFA (%s)",
    async (mfa) => {
      mocks.mfa.mockResolvedValue(mfa);
      const response = await api(owner);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: message });
      expect(mocks.mfa).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );
  test("product self transfer uses the session owner and returns a visible error with no writes", async () => {
    const response = await product(owner);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: message });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  test("a distinct transfer error cannot become API success or a success audit", async () => {
    mocks.transaction.mockRejectedValue(
      new Error("Transfer could not be completed"),
    );
    const response = await api(target);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Transfer could not be completed",
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  test("a distinct transfer still returns the API result and records its success", async () => {
    const response = await api(target);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      new_owner_user_id: target,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "success",
        metadata: { new_owner_user_id: target },
      }),
    );
  });
  test("a distinct target without MFA remains blocked before writes", async () => {
    mocks.mfa.mockResolvedValue(false);
    expect((await api(target)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  test("non-owner API and product callers remain blocked", async () => {
    mocks.role.mockResolvedValue({ role: "member" });
    expect((await api(owner)).status).toBe(403);
    expect((await product(owner, "member")).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.mfa).not.toHaveBeenCalled();
  });
});
