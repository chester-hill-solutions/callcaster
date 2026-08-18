/**
 * D3 (issue #1242) — auth-rejection coverage for two routes migrated off
 * hand-rolled getDataPlaneRouteContext preambles onto the branded strategies
 * (dataPlaneCapabilityAuth / dataPlaneSessionMinRoleAuth):
 *
 *  - app/routes/api+/workspaces+/$workspaceId.action.server.ts
 *  - app/routes/api+/workspaces+/$workspaceId/members.action.server.ts
 *
 * Neither had a dedicated test file before this migration. These pin the
 * 401/403/404 shapes the old preambles produced so the strategy swap didn't
 * silently change behavior, and confirm the business-logic mocks are never
 * reached when auth rejects.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  getWorkspaceDetailForDataPlane: vi.fn(),
  updateWorkspaceName: vi.fn(),
  deleteWorkspaceApi: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  inviteWorkspaceMember: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/platform-workspace.server", () => ({
  getWorkspaceDetailForDataPlane: (...args: unknown[]) =>
    mocks.getWorkspaceDetailForDataPlane(...args),
  updateWorkspaceName: (...args: unknown[]) => mocks.updateWorkspaceName(...args),
  deleteWorkspaceApi: (...args: unknown[]) => mocks.deleteWorkspaceApi(...args),
}));

vi.mock("@/lib/platform-members.server", () => ({
  listWorkspaceMembers: (...args: unknown[]) => mocks.listWorkspaceMembers(...args),
  inviteWorkspaceMember: (...args: unknown[]) => mocks.inviteWorkspaceMember(...args),
  inviteWorkspaceMemberAsApiKey: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  cancelWorkspaceInvite: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: {}, directPool: {} }));

vi.mock("@/lib/auth.server", () => ({
  getSession: vi.fn(async () => ({ headers: new Headers() })),
}));

import { loader as workspaceLoader, action as workspaceAction } from "../app/routes/api+/workspaces+/$workspaceId.action.server";
import { loader as membersLoader, action as membersAction } from "../app/routes/api+/workspaces+/$workspaceId/members.action.server";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";

async function args(
  path: string,
  init?: RequestInit,
  dataPlaneOverrides: Record<string, unknown> = {},
) {
  return withDataPlaneRouteArgs(
    {
      request: new Request(`http://localhost/api/workspaces/${WORKSPACE}${path}`, init),
      params: { workspaceId: WORKSPACE },
    },
    { workspaceId: WORKSPACE, ...dataPlaneOverrides },
  );
}

function withRole(role: string | null) {
  mocks.getUserRole.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/workspaces/:workspaceId — dataPlaneCapabilityAuth(campaigns.read)", () => {
  test("non-member gets the uniform 404, business logic not reached", async () => {
    withRole(null);
    const res = await asRouteResponse(workspaceLoader((await args("")) as never));
    expect(res.status).toBe(404);
    expect(mocks.getWorkspaceDetailForDataPlane).not.toHaveBeenCalled();
  });

  test("unauthenticated (no session, no API key) gets 401", async () => {
    const res = await asRouteResponse(
      workspaceLoader((await args("", undefined, { userId: null })) as never),
    );
    expect(res.status).toBe(401);
    expect(mocks.getWorkspaceDetailForDataPlane).not.toHaveBeenCalled();
  });

  test("cross-workspace context gets the uniform 404", async () => {
    const res = await asRouteResponse(
      workspaceLoader(
        (await args("", undefined, { workspaceId: "22222222-2222-2222-2222-222222222222" })) as never,
      ),
    );
    expect(res.status).toBe(404);
    expect(mocks.getWorkspaceDetailForDataPlane).not.toHaveBeenCalled();
  });

  test.each(["owner", "admin", "member", "caller"])(
    "role %s can read the workspace (campaigns.read is caller+)",
    async (role) => {
      withRole(role);
      mocks.getWorkspaceDetailForDataPlane.mockResolvedValue({
        ok: true,
        workspace: { id: WORKSPACE },
      });
      const res = await asRouteResponse(workspaceLoader((await args("")) as never));
      expect(res.status).toBe(200);
    },
  );
});

describe("PATCH|DELETE /api/workspaces/:workspaceId — dataPlaneSessionMinRoleAuth(caller)", () => {
  test("unauthenticated gets 401, business logic not reached", async () => {
    const res = await asRouteResponse(
      workspaceAction(
        (await args("", { method: "DELETE" }, { userId: null })) as never,
      ),
    );
    expect(res.status).toBe(401);
    expect(mocks.deleteWorkspaceApi).not.toHaveBeenCalled();
  });

  test("non-member gets the uniform 404, business logic not reached", async () => {
    withRole(null);
    const res = await asRouteResponse(
      workspaceAction((await args("", { method: "DELETE" })) as never),
    );
    expect(res.status).toBe(404);
    expect(mocks.deleteWorkspaceApi).not.toHaveBeenCalled();
  });

  test.each(["owner", "admin", "member", "caller"])(
    "role %s reaches the handler (min-role gate is Caller; finer role checks live in updateWorkspaceName/deleteWorkspaceApi)",
    async (role) => {
      withRole(role);
      mocks.deleteWorkspaceApi.mockResolvedValue({ ok: true });
      const res = await asRouteResponse(
        workspaceAction((await args("", { method: "DELETE" })) as never),
      );
      expect(mocks.deleteWorkspaceApi).toHaveBeenCalled();
      expect(res.status).toBe(200);
    },
  );
});

describe("GET /api/workspaces/:workspaceId/members — dataPlaneSessionMinRoleAuth(caller)", () => {
  test("unauthenticated gets 401", async () => {
    const res = await asRouteResponse(
      membersLoader((await args("/members", undefined, { userId: null })) as never),
    );
    expect(res.status).toBe(401);
    expect(mocks.listWorkspaceMembers).not.toHaveBeenCalled();
  });

  test("non-member gets the uniform 404", async () => {
    withRole(null);
    const res = await asRouteResponse(membersLoader((await args("/members")) as never));
    expect(res.status).toBe(404);
    expect(mocks.listWorkspaceMembers).not.toHaveBeenCalled();
  });

  test("any member (caller included) reaches the handler", async () => {
    withRole("caller");
    mocks.listWorkspaceMembers.mockResolvedValue({
      ok: true,
      members: [],
      pending_invites: [],
    });
    const res = await asRouteResponse(membersLoader((await args("/members")) as never));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/workspaces/:workspaceId/members — dataPlaneCapabilityAuth(members.invite)", () => {
  test("member role (below admin) gets 403, invite not reached", async () => {
    withRole("member");
    const res = await asRouteResponse(
      membersAction(
        (await args("/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "x@example.com", role: "caller" }),
        })) as never,
      ),
    );
    expect(res.status).toBe(403);
    expect(mocks.inviteWorkspaceMember).not.toHaveBeenCalled();
  });

  test("non-member gets the uniform 404", async () => {
    withRole(null);
    const res = await asRouteResponse(
      membersAction(
        (await args("/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "x@example.com", role: "caller" }),
        })) as never,
      ),
    );
    expect(res.status).toBe(404);
  });

  test("admin role passes the capability gate and reaches invite", async () => {
    withRole("admin");
    mocks.inviteWorkspaceMember.mockResolvedValue({
      ok: true,
      invite: { id: "inv-1" },
    });
    const res = await asRouteResponse(
      membersAction(
        (await args("/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "x@example.com", role: "caller" }),
        })) as never,
      ),
    );
    expect(res.status).toBe(201);
    expect(mocks.inviteWorkspaceMember).toHaveBeenCalled();
  });
});

describe("PATCH|DELETE /api/workspaces/:workspaceId/members — session-only, no capability", () => {
  test("unauthenticated gets 401", async () => {
    const res = await asRouteResponse(
      membersAction(
        (await args("/members", { method: "DELETE" }, { userId: null })) as never,
      ),
    );
    expect(res.status).toBe(401);
  });

  test("non-member gets the uniform 404", async () => {
    withRole(null);
    const res = await asRouteResponse(
      membersAction((await args("/members", { method: "DELETE" })) as never),
    );
    expect(res.status).toBe(404);
  });
});
