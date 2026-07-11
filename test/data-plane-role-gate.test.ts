import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { AppError, ErrorCode } from "@/lib/errors.server";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  verifyApiKeyOrSession: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  deleteContactApi: vi.fn(),
  getContactDetailApi: vi.fn(),
  patchCampaignQueueApi: vi.fn(),
  getCampaignQueueApi: vi.fn(),
}));

// Auth primitive: session vs api_key is decided per-test.
vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...a: unknown[]) => mocks.verifyApiKeyOrSession(...a),
  requireJsonAuth: vi.fn(),
}));

// The single role lookup that authFor* delegates to. `minRole` gating lives here.
vi.mock("@/lib/database.server", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => mocks.requireWorkspaceAccess(...a),
  fetchConversationSummary: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({ createTenantDb: vi.fn(() => ({})) }));

// getContactWorkspaceId / getCampaignWorkspaceId both resolve to "w1".
vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ workspace: "w1" }],
        }),
      }),
    }),
  },
}));

// Keep the REAL authForContact / authForCampaign (the gate under test); stub the
// downstream mutation handlers so we can assert whether they were reached.
vi.mock("@/lib/platform-data.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/platform-data.server")>();
  return {
    ...actual,
    deleteContactApi: (...a: unknown[]) => mocks.deleteContactApi(...a),
    getContactDetailApi: (...a: unknown[]) => mocks.getContactDetailApi(...a),
    patchCampaignQueueApi: (...a: unknown[]) => mocks.patchCampaignQueueApi(...a),
    getCampaignQueueApi: (...a: unknown[]) => mocks.getCampaignQueueApi(...a),
  };
});

function asSessionUser(id: string) {
  mocks.verifyApiKeyOrSession.mockResolvedValue({
    authType: "session",
    user: { id },
  });
}

function forbidBelowMember() {
  // requireWorkspaceAccess throws when the caller's role is below the min role,
  // exactly as it does in production for a `caller` asked to meet `member`.
  mocks.requireWorkspaceAccess.mockRejectedValue(
    new AppError("Access denied to workspace", 403, ErrorCode.FORBIDDEN),
  );
}

function allowAccess() {
  mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
}

describe("data-plane mutation role gate (authForContact / authForCampaign)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      (fn as { mockReset?: () => void }).mockReset?.();
    }
  });

  test("authForContact('member') returns 403 for a below-member caller", async () => {
    asSessionUser("u-caller");
    forbidBelowMember();
    const { authForContact } = await import("@/lib/platform-data.server");

    const result = await authForContact(
      new Request("http://x/api/contacts/5", { method: "DELETE" }),
      "5",
      "member",
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    // The single role lookup was asked to enforce the `member` bar.
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", minRole: "member" }),
    );
  });

  test("authForContact('member') resolves context for a member", async () => {
    asSessionUser("u-member");
    allowAccess();
    const { authForContact } = await import("@/lib/platform-data.server");

    const result = await authForContact(
      new Request("http://x/api/contacts/5", { method: "DELETE" }),
      "5",
      "member",
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({ userId: "u-member", workspaceId: "w1" });
  });

  test("authForContact read path (no minRole) stays open to callers", async () => {
    asSessionUser("u-caller");
    allowAccess();
    const { authForContact } = await import("@/lib/platform-data.server");

    const result = await authForContact(
      new Request("http://x/api/contacts/5"),
      "5",
    );

    expect(result).not.toBeInstanceOf(Response);
    // No min-role bar on reads.
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", minRole: undefined }),
    );
  });

  test("authForCampaign('member') returns 403 for a below-member caller", async () => {
    asSessionUser("u-caller");
    forbidBelowMember();
    const { authForCampaign } = await import("@/lib/platform-data.server");

    const result = await authForCampaign(
      new Request("http://x/api/campaigns/9", { method: "POST" }),
      "9",
      "member",
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test("authForCampaign('member') resolves context for a member", async () => {
    asSessionUser("u-member");
    allowAccess();
    const { authForCampaign } = await import("@/lib/platform-data.server");

    const result = await authForCampaign(
      new Request("http://x/api/campaigns/9", { method: "POST" }),
      "9",
      "member",
    );

    expect(result).toEqual({ userId: "u-member", workspaceId: "w1" });
  });

  test("workspace-scoped API key bypasses role gating on mutations", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValue({
      authType: "api_key",
      workspaceId: "w1",
    });
    const { authForContact } = await import("@/lib/platform-data.server");

    const result = await authForContact(
      new Request("http://x/api/contacts/5", { method: "DELETE" }),
      "5",
      "member",
    );

    expect(result).toEqual({ userId: null, workspaceId: "w1" });
    expect(mocks.requireWorkspaceAccess).not.toHaveBeenCalled();
  });
});

describe("data-plane mutation routes reject the caller role end-to-end", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) {
      (fn as { mockReset?: () => void }).mockReset?.();
    }
  });

  test("DELETE /api/contacts/:id — caller 403, mutation not reached", async () => {
    asSessionUser("u-caller");
    forbidBelowMember();
    const mod = await import(
      "../app/routes/api+/contacts/$contactId.action.server"
    );

    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x/api/contacts/5", { method: "DELETE" }),
        params: { contactId: "5" },
      } as never),
    );

    expect(res.status).toBe(403);
    expect(mocks.deleteContactApi).not.toHaveBeenCalled();
  });

  test("DELETE /api/contacts/:id — member 200, mutation reached", async () => {
    asSessionUser("u-member");
    allowAccess();
    mocks.deleteContactApi.mockResolvedValue({ ok: true, contact_id: "5" });
    const mod = await import(
      "../app/routes/api+/contacts/$contactId.action.server"
    );

    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x/api/contacts/5", { method: "DELETE" }),
        params: { contactId: "5" },
      } as never),
    );

    expect(res.status).toBe(200);
    expect(mocks.deleteContactApi).toHaveBeenCalledWith("5", "w1");
  });

  test("PATCH /api/campaigns/:id/queue — caller 403, mutation not reached", async () => {
    asSessionUser("u-caller");
    forbidBelowMember();
    const mod = await import(
      "../app/routes/api+/campaigns/$campaignId/queue.action.server"
    );

    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x/api/campaigns/9/queue", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queue_id: 1, status: "dequeued" }),
        }),
        params: { campaignId: "9" },
        url: new URL("http://x/api/campaigns/9/queue"),
      } as never),
    );

    expect(res.status).toBe(403);
    expect(mocks.patchCampaignQueueApi).not.toHaveBeenCalled();
  });
});
