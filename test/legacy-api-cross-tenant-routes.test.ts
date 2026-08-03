import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { setDualAuthSession, setJsonAuthSession } from "./helpers/route-auth-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
});

const WORKSPACE_A = "11111111-1111-1111-1111-111111111111";
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222";
const USER_A = { id: "aaaaaaaa-0000-4000-8000-000000000001" };

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  searchContactsForQueuePicker: vi.fn(async () => []),
  getQueuedContactIdsForCampaign: vi.fn(async () => []),
  rpcCreateOutreachAttempt: vi.fn(async () => ({ id: 1 })),
  resolveContactWorkspaceId: vi.fn(async () => WORKSPACE_B),
  resolveCampaignWorkspaceId: vi.fn(async () => WORKSPACE_B),
  campaignAndAudienceShareWorkspace: vi.fn(async () => true),
  insertCampaignAudienceLink: vi.fn(async () => undefined),
  findCampaignAudienceLink: vi.fn(async () => null),
  getSession: vi.fn(async () => ({ headers: new Headers() })),
  createTenantDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => mocks.requireWorkspaceAccess(...a),
}));
vi.mock("@/lib/database/contact.server", () => ({
  searchContactsForQueuePicker: (...a: unknown[]) => mocks.searchContactsForQueuePicker(...a),
  bulkCreateContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  getQueuedContactIdsForCampaign: (...a: unknown[]) => mocks.getQueuedContactIdsForCampaign(...a),
  deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds: vi.fn(),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: (...a: unknown[]) => mocks.rpcCreateOutreachAttempt(...a),
}));
vi.mock("@/lib/platform-telephony.server", () => ({
  resolveContactWorkspaceId: (...a: unknown[]) => mocks.resolveContactWorkspaceId(...a),
  resolveCampaignWorkspaceId: (...a: unknown[]) => mocks.resolveCampaignWorkspaceId(...a),
}));
vi.mock("@/lib/campaign-audience-db.server", () => ({
  campaignAndAudienceShareWorkspace: (...a: unknown[]) => mocks.campaignAndAudienceShareWorkspace(...a),
  insertCampaignAudienceLink: (...a: unknown[]) => mocks.insertCampaignAudienceLink(...a),
  findCampaignAudienceLink: (...a: unknown[]) => mocks.findCampaignAudienceLink(...a),
  deleteCampaignAudienceLink: vi.fn(),
  listCampaignAudienceIds: vi.fn(async () => []),
  listContactIdsForAudience: vi.fn(async () => []),
  listContactIdsForAudiences: vi.fn(async () => []),
}));
vi.mock("@/lib/auth.server", () => ({
  getSession: (...a: unknown[]) => mocks.getSession(...a),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: (...a: unknown[]) => mocks.createTenantDb(...a),
}));
vi.mock("@/lib/queue.server", () => ({ enqueueContactsForCampaign: vi.fn() }));

/** requireWorkspaceAccess throws this shape for a non-member (ADR-0004: 404, not 403). */
async function denyMembership() {
  const { AppError, ErrorCode } = await import("@/lib/errors.server");
  mocks.requireWorkspaceAccess.mockRejectedValueOnce(
    new AppError("Workspace not found", 404, ErrorCode.NOT_FOUND) as never,
  );
}

describe("legacy api+ cross-tenant boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined as never);
    mocks.resolveContactWorkspaceId.mockResolvedValue(WORKSPACE_B as never);
    mocks.resolveCampaignWorkspaceId.mockResolvedValue(WORKSPACE_B as never);
    mocks.campaignAndAudienceShareWorkspace.mockResolvedValue(true as never);
  });

  test("contacts search checks membership for the requested workspace", async () => {
    setDualAuthSession({ user: USER_A });
    const mod = await import("../app/routes/api+/contacts.loader.server");
    await asRouteResponse(
      mod.loader(
        routeArgs(new Request(`http://x/api/contacts?q=dana&workspace_id=${WORKSPACE_B}`)) as never,
      ),
    );

    // The workspace id is a query param — proving a session is not enough.
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_B }),
    );
  });

  test("contacts search does not run the query for a non-member", async () => {
    setDualAuthSession({ user: USER_A });
    await denyMembership();
    const mod = await import("../app/routes/api+/contacts.loader.server");
    const response = await asRouteResponse(
      mod.loader(
        routeArgs(new Request(`http://x/api/contacts?q=dana&workspace_id=${WORKSPACE_B}`)) as never,
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.searchContactsForQueuePicker).not.toHaveBeenCalled();
  });

  test("outreach attempt does not write for a non-member", async () => {
    setJsonAuthSession({ user: USER_A });
    await denyMembership();
    const mod = await import("../app/routes/api+/outreach-attempts.action.server");
    const response = await asRouteResponse(
      mod.action(
        routeArgs(
          new Request("http://x/api/outreach-attempts", {
            method: "POST",
            body: JSON.stringify({ campaign_id: 1, contact_id: 2, queue_id: 3 }),
            headers: { "content-type": "application/json" },
          }),
        ) as never,
      ),
    );

    // Workspace is derived from an attacker-supplied contact_id, so resolving it
    // proves nothing about the caller.
    expect(response.status).toBe(404);
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
  });

  test("campaign_audience does not link for a non-member", async () => {
    setDualAuthSession({ user: USER_A });
    await denyMembership();
    const mod = await import("../app/routes/api+/campaign_audience.action.server");
    const response = await asRouteResponse(
      mod.action(
        routeArgs(
          new Request("http://x/api/campaign_audience", {
            method: "POST",
            body: JSON.stringify({ campaign_id: 1, audience_id: 2 }),
            headers: { "content-type": "application/json" },
          }),
        ) as never,
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.insertCampaignAudienceLink).not.toHaveBeenCalled();
  });

  test("campaign_audience rejects an API key on its session-only surface", async () => {
    // No `user` on a dual-auth result means api_key. Such a caller carries its
    // own bound workspace, which requireWorkspaceAccess cannot check.
    setDualAuthSession({});
    const mod = await import("../app/routes/api+/campaign_audience.action.server");
    const response = await asRouteResponse(
      mod.action(
        routeArgs(
          new Request("http://x/api/campaign_audience", {
            method: "POST",
            body: JSON.stringify({ campaign_id: 1, audience_id: 2 }),
            headers: { "content-type": "application/json" },
          }),
        ) as never,
      ),
    );

    expect(response.status).toBe(401);
    expect(mocks.requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.insertCampaignAudienceLink).not.toHaveBeenCalled();
  });
});
