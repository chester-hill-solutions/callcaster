/**
 * Issue #1264 — a workspace API key may never carry more authority than the
 * role that minted it, and minting is admin+.
 *
 * These run the REAL service layer (`platform-members.server`) behind the
 * data-plane route, mocking only the db seams. Mocking the service — as
 * `workspace-api-keys.route.test.ts` does — is precisely what let the
 * escalation sit unnoticed: `requireMemberManager` never executed, so no test
 * ever observed a role.
 *
 * Conventions follow `data-plane-authclass-enforcement.test.ts`: 403 for an
 * under-privileged role, uniform 404 for a cross-workspace context (ADR-0004),
 * 401 for a key-authenticated request on a `sessionOnly` surface.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  insertWorkspaceApiKeyRow: vi.fn(),
  listWorkspaceApiKeyRows: vi.fn(),
  deleteWorkspaceApiKeyRow: vi.fn(),
  recordAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
  getWorkspaceUsers: vi.fn(async () => ({ data: [] })),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  insertWorkspaceApiKeyRow: (...args: unknown[]) =>
    mocks.insertWorkspaceApiKeyRow(...args),
  listWorkspaceApiKeyRows: (...args: unknown[]) =>
    mocks.listWorkspaceApiKeyRows(...args),
  deleteWorkspaceApiKeyRow: (...args: unknown[]) =>
    mocks.deleteWorkspaceApiKeyRow(...args),
  findUserIdByUsername: vi.fn(),
  findWorkspaceInviteForUser: vi.fn(),
  findWorkspaceMembership: vi.fn(),
  getWorkspaceWebhookRow: vi.fn(),
  listWorkspaceInvitesEnriched: vi.fn(),
  listWorkspaceMembersEnriched: vi.fn(async () => []),
  removeWorkspaceInviteForUser: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
  upsertWorkspaceWebhookRow: vi.fn(),
}));

vi.mock("@/lib/audit-event.server", () => ({
  safeRecordWorkspaceAuditEvent: (...args: unknown[]) =>
    mocks.recordAudit(...args),
}));

vi.mock("@/server/db", () => ({ db: {}, directPool: {} }));

import { action as apiKeysAction } from "../app/routes/api+/workspaces+/$workspaceId/api-keys.action.server";
import { loader as apiKeysLoader } from "../app/routes/api+/workspaces+/$workspaceId/api-keys.loader.server";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-2222-2222-222222222222";
const KEY_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Capabilities per `CALLCASTER_ROLE_CAPABILITY_MATRIX`. `outOfScope` is a real
 * capability the role does not hold — the escalation the cap must refuse.
 */
const ROLE_SCOPES = {
  owner: { inScope: "audit.read", outOfScope: null },
  admin: { inScope: "members.invite", outOfScope: "audit.read" },
  member: { inScope: "campaigns.write", outOfScope: "members.invite" },
  caller: { inScope: "campaigns.read", outOfScope: "campaigns.write" },
} as const;

async function args(
  init?: RequestInit,
  dataPlaneOverrides: Record<string, unknown> = {},
) {
  return withDataPlaneRouteArgs(
    {
      request: new Request(
        `http://localhost/api/workspaces/${WORKSPACE}/api-keys`,
        init,
      ),
      params: { workspaceId: WORKSPACE },
    },
    { workspaceId: WORKSPACE, userId: "user-1", ...dataPlaneOverrides },
  );
}

function createRequest(scopes: readonly string[]): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Test key", scopes }),
  };
}

function withRole(role: string | null) {
  mocks.getUserRole.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.listWorkspaceApiKeyRows.mockResolvedValue([]);
  mocks.deleteWorkspaceApiKeyRow.mockResolvedValue(undefined);
  mocks.insertWorkspaceApiKeyRow.mockImplementation(async (input: any) => ({
    id: "key-1",
    name: input.name,
    key_prefix: input.keyPrefix,
    created_at: "2026-01-01T00:00:00.000Z",
    scopes: input.scopes,
    expires_at: input.expiresAt,
  }));
});

describe("POST /api/workspaces/:workspaceId/api-keys — role floor", () => {
  // Resolution: ENFORCE the declared `workspaceAdmin`. A key is a durable
  // bearer credential that outlives its minter's membership.
  test.each(["owner", "admin"])("role %s may mint a key", async (role) => {
    withRole(role);
    const res = await asRouteResponse(
      apiKeysAction(
        (await args(createRequest([ROLE_SCOPES[role as "owner"].inScope]))) as never,
      ),
    );
    expect(res.status).toBe(201);
    expect(mocks.insertWorkspaceApiKeyRow).toHaveBeenCalledOnce();
  });

  test.each(["member", "caller"])(
    "role %s is refused 403 and no key row is written",
    async (role) => {
      withRole(role);
      const res = await asRouteResponse(
        apiKeysAction((await args(createRequest(["campaigns.read"]))) as never),
      );
      expect(res.status).toBe(403);
      expect(mocks.insertWorkspaceApiKeyRow).not.toHaveBeenCalled();
    },
  );

  test("a member is refused with the admin-floor message, not a scope message", async () => {
    withRole("member");
    const res = await asRouteResponse(
      apiKeysAction((await args(createRequest(["campaigns.read"]))) as never),
    );
    expect(await res.json()).toMatchObject({
      error: "Workspace admin role required to manage API keys",
    });
  });

  test("a non-member gets 403 and never reaches the insert", async () => {
    withRole(null);
    const res = await asRouteResponse(
      apiKeysAction((await args(createRequest(["campaigns.read"]))) as never),
    );
    expect(res.status).toBe(403);
    expect(mocks.insertWorkspaceApiKeyRow).not.toHaveBeenCalled();
  });
});

describe("POST /api/workspaces/:workspaceId/api-keys — capability scope cap", () => {
  test("owner may mint every capability, audit.read included", async () => {
    withRole("owner");
    const res = await asRouteResponse(
      apiKeysAction(
        (await args(
          createRequest([
            "campaigns.read",
            "campaigns.write",
            "campaigns.dispatch",
            "calls.start",
            "calls.control",
            "messages.send",
            "members.invite",
            "audit.read",
          ]),
        )) as never,
      ),
    );
    expect(res.status).toBe(201);
  });

  test("admin may mint the capabilities the admin role holds", async () => {
    withRole("admin");
    const res = await asRouteResponse(
      apiKeysAction(
        (await args(
          createRequest(["campaigns.dispatch", "members.invite"]),
        )) as never,
      ),
    );
    expect(res.status).toBe(201);
    expect(mocks.insertWorkspaceApiKeyRow).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["campaigns.dispatch", "members.invite"],
      }),
    );
  });

  test("admin cannot mint audit.read — owner-only — and the 403 names it", async () => {
    withRole("admin");
    const res = await asRouteResponse(
      apiKeysAction(
        (await args(createRequest(["campaigns.read", "audit.read"]))) as never,
      ),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("audit.read");
    expect(body.error).toContain("admin");
    expect(mocks.insertWorkspaceApiKeyRow).not.toHaveBeenCalled();
  });

  test("the 403 names every disallowed capability, not just the first", async () => {
    withRole("admin");
    const res = await asRouteResponse(
      apiKeysAction(
        (await args(createRequest(["audit.read", "campaigns.read"]))) as never,
      ),
    );
    const body = await res.json();
    expect(body.error).toContain("audit.read");
    // campaigns.read is granted to admin, so it must NOT be listed as refused.
    expect(body.error).not.toContain("campaigns.read");
  });

  test("a refused over-scope attempt is audited as denied", async () => {
    withRole("admin");
    await asRouteResponse(
      apiKeysAction((await args(createRequest(["audit.read"]))) as never),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "api_keys.create",
        outcome: "denied",
        metadata: expect.objectContaining({ reason: "scope_exceeds_role" }),
      }),
    );
  });

  test("an unknown scope is a 400, distinct from the 403 over-scope refusal", async () => {
    withRole("owner");
    const res = await asRouteResponse(
      apiKeysAction((await args(createRequest(["not.a.capability"]))) as never),
    );
    expect(res.status).toBe(400);
  });
});

/**
 * The cap is a property of the matrix, not of the two roles that can reach the
 * mint. Pinning all four roles keeps it honest if the floor ever moves again.
 */
describe("scope cap holds for every role in the matrix", () => {
  test.each(
    Object.entries(ROLE_SCOPES).filter(([, s]) => s.outOfScope !== null),
  )("role %s cannot mint its out-of-scope capability", async (role, scopes) => {
    withRole(role);
    const res = await asRouteResponse(
      apiKeysAction((await args(createRequest([scopes.outOfScope!]))) as never),
    );
    // member/caller are stopped by the floor, admin by the scope cap; either
    // way no key row is ever written carrying a capability the role lacks.
    expect(res.status).toBe(403);
    expect(mocks.insertWorkspaceApiKeyRow).not.toHaveBeenCalled();
  });
});

describe("sibling surfaces — list and revoke", () => {
  test.each(["owner", "admin"])("role %s may list keys", async (role) => {
    withRole(role);
    const res = await asRouteResponse(apiKeysLoader((await args()) as never));
    expect(res.status).toBe(200);
    expect(mocks.listWorkspaceApiKeyRows).toHaveBeenCalledOnce();
  });

  test.each(["member", "caller"])(
    "role %s cannot list keys",
    async (role) => {
      withRole(role);
      const res = await asRouteResponse(apiKeysLoader((await args()) as never));
      expect(res.status).toBe(403);
      expect(mocks.listWorkspaceApiKeyRows).not.toHaveBeenCalled();
    },
  );

  test.each(["member", "caller"])(
    "role %s cannot revoke a key",
    async (role) => {
      withRole(role);
      const res = await asRouteResponse(
        apiKeysAction(
          (await args({
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: KEY_ID }),
          })) as never,
        ),
      );
      expect(res.status).toBe(403);
      expect(mocks.deleteWorkspaceApiKeyRow).not.toHaveBeenCalled();
    },
  );

  test("admin may revoke a key", async () => {
    withRole("admin");
    const res = await asRouteResponse(
      apiKeysAction(
        (await args({
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: KEY_ID }),
        })) as never,
      ),
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteWorkspaceApiKeyRow).toHaveBeenCalledOnce();
  });
});

describe("surface-level auth", () => {
  test("an API-key request (no session user) is rejected 401 — sessionOnly", async () => {
    withRole("owner");
    const res = await asRouteResponse(
      apiKeysAction(
        (await args(createRequest(["campaigns.read"]), {
          userId: null,
        })) as never,
      ),
    );
    expect(res.status).toBe(401);
    expect(mocks.insertWorkspaceApiKeyRow).not.toHaveBeenCalled();
  });

  test("a key cannot be minted with a key even by an owner-scoped key", async () => {
    withRole("owner");
    const res = await asRouteResponse(
      apiKeysLoader((await args(undefined, { userId: null })) as never),
    );
    expect(res.status).toBe(401);
  });

  test("cross-workspace context gets the uniform 404", async () => {
    withRole("owner");
    const res = await asRouteResponse(
      apiKeysAction(
        (await args(createRequest(["campaigns.read"]), {
          workspaceId: OTHER_WORKSPACE,
        })) as never,
      ),
    );
    expect(res.status).toBe(404);
    expect(mocks.insertWorkspaceApiKeyRow).not.toHaveBeenCalled();
  });
});
