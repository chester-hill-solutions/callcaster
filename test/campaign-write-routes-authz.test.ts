import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

// These five workspaces+ campaign-write routes were missing a role check
// entirely (VERIFIED HOLE: a "caller"-role member could create a campaign,
// change its settings/status, manage its dial queue, add an audience, or
// save its script). Each handler now gates on hasMinRole before touching
// any data. This suite proves the gate rejects sub-minimum roles and, for
// one representative route, that a sufficient role still reaches the real
// work.

const workspaceSelectorMocks = vi.hoisted(() => ({
  handleNewCampaign: vi.fn(async () => ({ success: true })),
  handleNewAudience: vi.fn(async () => ({ success: true })),
}));

const campaignServerMocks = vi.hoisted(() => ({
  splitMessageCampaign: vi.fn(),
  fetchCampaignDetails: vi.fn(),
  fetchQueueCounts: vi.fn(),
  updateCampaign: vi.fn(),
}));

const campaignIvrMocks = vi.hoisted(() => ({
  findCampaignInWorkspace: vi.fn(),
  insertCampaignForWorkspace: vi.fn(),
  updateCampaignStatusInWorkspace: vi.fn(),
  findCampaignMessageMedia: vi.fn(),
  updateCampaignMessageMedia: vi.fn(),
}));

const queueDbMocks = vi.hoisted(() => ({
  deleteAllCampaignQueueForCampaign: vi.fn(),
  deleteCampaignQueueByIds: vi.fn(),
  updateCampaignQueueStatusByIds: vi.fn(),
  getCampaignQueueContactIds: vi.fn(async () => []),
}));

const parseActionRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/workspace-selector/WorkspaceSelectedNewUtils.server", () => ({
  handleNewCampaign: (...args: unknown[]) => workspaceSelectorMocks.handleNewCampaign(...args),
  handleNewAudience: (...args: unknown[]) => workspaceSelectorMocks.handleNewAudience(...args),
}));

vi.mock("@/lib/database/campaign.server", () => ({
  splitMessageCampaign: (...args: unknown[]) => campaignServerMocks.splitMessageCampaign(...args),
  fetchCampaignDetails: (...args: unknown[]) => campaignServerMocks.fetchCampaignDetails(...args),
  fetchQueueCounts: (...args: unknown[]) => campaignServerMocks.fetchQueueCounts(...args),
  updateCampaign: (...args: unknown[]) => campaignServerMocks.updateCampaign(...args),
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: (...args: unknown[]) => campaignIvrMocks.findCampaignInWorkspace(...args),
  insertCampaignForWorkspace: (...args: unknown[]) => campaignIvrMocks.insertCampaignForWorkspace(...args),
  updateCampaignStatusInWorkspace: (...args: unknown[]) =>
    campaignIvrMocks.updateCampaignStatusInWorkspace(...args),
  findCampaignMessageMedia: (...args: unknown[]) => campaignIvrMocks.findCampaignMessageMedia(...args),
  updateCampaignMessageMedia: (...args: unknown[]) => campaignIvrMocks.updateCampaignMessageMedia(...args),
}));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  deleteAllCampaignQueueForCampaign: (...args: unknown[]) =>
    queueDbMocks.deleteAllCampaignQueueForCampaign(...args),
  deleteCampaignQueueByIds: (...args: unknown[]) => queueDbMocks.deleteCampaignQueueByIds(...args),
  updateCampaignQueueStatusByIds: (...args: unknown[]) =>
    queueDbMocks.updateCampaignQueueStatusByIds(...args),
  getCampaignQueueContactIds: (...args: unknown[]) => queueDbMocks.getCampaignQueueContactIds(...args),
}));

vi.mock("@/lib/campaign-queue-search.server", () => ({
  searchCampaignQueueIds: vi.fn(),
}));

vi.mock("@/lib/campaign-audience-db.server", () => ({
  campaignAndAudienceShareWorkspace: vi.fn(),
}));

vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: vi.fn(async () => undefined),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getWorkspacePhoneNumbers: vi.fn(async () => ({ data: [] })),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/platform-media.server", () => ({
  listWorkspaceAudiosApi: vi.fn(async () => ({ ok: true, audios: [] })),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    script: { findMany: vi.fn(async () => []) },
  })),
}));

vi.mock("@/lib/request-utils.server", () => ({
  parseActionRequest: (...args: unknown[]) => parseActionRequestMock(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function resetAllMocks() {
  for (const fn of Object.values(workspaceSelectorMocks)) fn.mockClear();
  for (const fn of Object.values(campaignServerMocks)) fn.mockReset();
  for (const fn of Object.values(campaignIvrMocks)) fn.mockReset();
  for (const fn of Object.values(queueDbMocks)) fn.mockReset();
  parseActionRequestMock.mockReset();
  queueDbMocks.getCampaignQueueContactIds.mockResolvedValue([]);
}

describe("campaign write routes require a minimum workspace role", () => {
  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
  });

  test("POST campaigns/new is 403 for a caller (below Admin)", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/new.action.server"
    );
    const fd = new FormData();
    fd.set("formAction", "newCampaign");
    fd.set("campaign-name", "Test Campaign");
    fd.set("campaign-type", "message");

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: new Request("http://localhost/x", { method: "POST", body: fd }), params: { id: "w1" } },
          { userId: "u1", workspaceId: "w1", userRole: "caller" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(workspaceSelectorMocks.handleNewCampaign).not.toHaveBeenCalled();
  });

  test("POST campaigns/new is 403 for a member (below Admin) too", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/new.action.server"
    );
    const fd = new FormData();
    fd.set("formAction", "newCampaign");

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: new Request("http://localhost/x", { method: "POST", body: fd }), params: { id: "w1" } },
          { userId: "u1", workspaceId: "w1", userRole: "member" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(workspaceSelectorMocks.handleNewCampaign).not.toHaveBeenCalled();
  });

  test("POST campaigns/new succeeds for an admin (the caller who exploited this hole created campaign 17 as a non-admin)", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/new.action.server"
    );
    const fd = new FormData();
    fd.set("formAction", "newCampaign");

    await mod.action(
      await withWorkspaceRouteArgs(
        { request: new Request("http://localhost/x", { method: "POST", body: fd }), params: { id: "w1" } },
        { userId: "u1", workspaceId: "w1", userRole: "admin" },
      ),
    );

    expect(workspaceSelectorMocks.handleNewCampaign).toHaveBeenCalled();
  });

  test("POST campaigns/$selected_id/settings is 403 for a member (below Admin)", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/settings.action.server"
    );
    parseActionRequestMock.mockResolvedValueOnce({ intent: "status", status: "running" });

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: new Request("http://localhost/x", { method: "POST" }), params: { id: "w1", selected_id: "99" } },
          { userId: "u1", workspaceId: "w1", userRole: "member" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(parseActionRequestMock).not.toHaveBeenCalled();
    expect(campaignIvrMocks.findCampaignInWorkspace).not.toHaveBeenCalled();
  });

  test("POST campaigns/$selected_id/queue is 403 for a caller (below Member)", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/queue.action.server"
    );

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: new Request("http://localhost/x", { method: "POST" }), params: { id: "w1", selected_id: "99" } },
          { userId: "u1", workspaceId: "w1", userRole: "caller" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(parseActionRequestMock).not.toHaveBeenCalled();
    expect(campaignIvrMocks.findCampaignInWorkspace).not.toHaveBeenCalled();
  });

  test("POST campaigns/$campaign_id/audiences/new is 403 for a caller (below Member)", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$campaign_id/audiences/new.action.server"
    );
    const fd = new FormData();
    fd.set("audience-name", "Test Audience");
    fd.set("formAction", "newAudience");

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: new Request("http://localhost/x", { method: "POST", body: fd }), params: { id: "w1", campaign_id: "5" } },
          { userId: "u1", workspaceId: "w1", userRole: "caller" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(workspaceSelectorMocks.handleNewAudience).not.toHaveBeenCalled();
  });

  test("POST campaigns/$selected_id/script/edit is 403 for a caller (below Member)", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.action.server"
    );
    const fd = new FormData();
    fd.set("fileName", "clip.mp3");

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: new Request("http://localhost/x", { method: "POST", body: fd }), params: { id: "w1", selected_id: "99" } },
          { userId: "u1", workspaceId: "w1", userRole: "caller" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(campaignIvrMocks.findCampaignMessageMedia).not.toHaveBeenCalled();
  });
});
