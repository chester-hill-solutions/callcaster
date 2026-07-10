import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    parseActionRequest: vi.fn(),
    updateCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    createCampaign: vi.fn(),
    updateOrCopyScript: vi.fn(),
    createErrorResponse: vi.fn((_e: any) => new Response("err", { status: 400 })),
    requireWorkspaceAccess: vi.fn(),
  };
});

vi.mock("@/lib/platform-telephony.server", () => ({
  resolveCampaignWorkspaceId: vi.fn(async () => "w1"),
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: vi.fn(async (request: Request) => ({ user: { id: "u1" }, headers: new Headers(request.headers) })),
}));
vi.mock("@/lib/database.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  updateCampaign: (...args: any[]) => mocks.updateCampaign(...args),
  deleteCampaign: (...args: any[]) => mocks.deleteCampaign(...args),
  createCampaign: (...args: any[]) => mocks.createCampaign(...args),
  updateOrCopyScript: (...args: any[]) => mocks.updateOrCopyScript(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/errors.server", () => ({
  createErrorResponse: (...args: any[]) => mocks.createErrorResponse(...args),
}));

function authSession(_session: unknown, headers = new Headers()) {
  return queueDualAuthSession({
    headers,
    user: { id: "u1" },
  });
}

describe("app/routes/api+/campaigns/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseActionRequest.mockReset();
    mocks.updateCampaign.mockReset();
    mocks.deleteCampaign.mockReset();
    mocks.createCampaign.mockReset();
    mocks.updateOrCopyScript.mockReset();
    mocks.createErrorResponse.mockClear();
  });

  test("PATCH parses JSON fields and returns updated campaign", async () => {
    authSession({ sb: 1 }, new Headers({ "X": "1" }));
    mocks.parseActionRequest.mockResolvedValueOnce({
      campaignData: JSON.stringify({ id: 1, title: "t" }),
      campaignDetails: { x: 1 },
    });
    mocks.updateCampaign.mockResolvedValueOnce({ campaign: { id: 1 }, campaignDetails: { campaign_id: 1 } });

    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH", headers: { "X": "1" } }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ campaign: { id: 1 } });
  });

  test("PATCH with scriptData persists the script and links it to the campaign", async () => {
    authSession({ sb: 1 }, new Headers({ "X": "1" }));
    mocks.parseActionRequest.mockResolvedValueOnce({
      campaignData: JSON.stringify({ id: 1, title: "t" }),
      campaignDetails: { x: 1 },
      scriptData: JSON.stringify({ id: 5, name: "S", steps: {} }),
      saveScriptAsCopy: "false",
    });
    mocks.updateOrCopyScript.mockResolvedValueOnce({ id: 5, name: "S" });
    mocks.updateCampaign.mockResolvedValueOnce({ campaign: { id: 1, script_id: 5 }, campaignDetails: { campaign_id: 1 } });

    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH", headers: { "X": "1" } }),
    } as any));

    expect(mocks.updateOrCopyScript).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        scriptData: { id: 5, name: "S", steps: {} },
        saveAsCopy: false,
        created_by: "u1",
      }),
    );
    // The resolved script id must be threaded onto campaignData before
    // updateCampaign runs, so the campaign actually links to the script.
    expect(mocks.updateCampaign).toHaveBeenCalledWith({
      campaignData: expect.objectContaining({ id: 1, title: "t", script_id: 5 }),
      campaignDetails: { x: 1 },
    });
    await expect(res.json()).resolves.toMatchObject({
      campaign: { id: 1, script_id: 5 },
      scriptId: 5,
      script: { id: 5, name: "S" },
    });
  });

  test("PATCH with saveScriptAsCopy=true forwards saveAsCopy: true", async () => {
    authSession({ sb: 1 }, new Headers({ "X": "1" }));
    mocks.parseActionRequest.mockResolvedValueOnce({
      campaignData: JSON.stringify({ id: 1, title: "t" }),
      campaignDetails: {},
      scriptData: JSON.stringify({ id: 5, name: "S" }),
      saveScriptAsCopy: "true",
    });
    mocks.updateOrCopyScript.mockResolvedValueOnce({ id: 9, name: "S (Copy)" });
    mocks.updateCampaign.mockResolvedValueOnce({ campaign: { id: 1, script_id: 9 }, campaignDetails: {} });

    const mod = await import("../app/routes/api+/campaigns");
    await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH", headers: { "X": "1" } }),
    } as any);

    expect(mocks.updateOrCopyScript).toHaveBeenCalledWith(
      expect.objectContaining({ saveAsCopy: true }),
    );
  });

  test("PATCH without scriptData does not touch the script and leaves campaignData untouched", async () => {
    authSession({ sb: 1 }, new Headers({ "X": "1" }));
    mocks.parseActionRequest.mockResolvedValueOnce({
      campaignData: JSON.stringify({ id: 1, title: "t" }),
      campaignDetails: {},
      // Mirrors what a message-type campaign sends when there's no script:
      // JSON.stringify(undefined) coerces to the literal string "undefined".
      scriptData: "undefined",
    });
    mocks.updateCampaign.mockResolvedValueOnce({ campaign: { id: 1 }, campaignDetails: {} });

    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH", headers: { "X": "1" } }),
    } as any));

    expect(mocks.updateOrCopyScript).not.toHaveBeenCalled();
    expect(mocks.updateCampaign).toHaveBeenCalledWith({
      campaignData: expect.objectContaining({ id: 1, title: "t" }),
      campaignDetails: {},
    });
    await expect(res.json()).resolves.toMatchObject({ campaign: { id: 1 } });
  });

  test("PATCH returns an error response when script persistence fails, without touching the campaign", async () => {
    authSession({ sb: 1 }, new Headers({ "X": "1" }));
    mocks.parseActionRequest.mockResolvedValueOnce({
      campaignData: JSON.stringify({ id: 1, title: "t" }),
      campaignDetails: {},
      scriptData: JSON.stringify({ id: 5, name: "S" }),
      saveScriptAsCopy: "false",
    });
    mocks.updateOrCopyScript.mockRejectedValueOnce(new Error("duplicate name"));

    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH", headers: { "X": "1" } }),
    } as any));

    expect(res.status).toBe(400);
    expect(mocks.createErrorResponse).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to save script",
      400,
      expect.any(Object),
    );
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
  });

  test("DELETE calls deleteCampaign", async () => {
    authSession({ sb: 1 });
    mocks.parseActionRequest.mockResolvedValueOnce({ campaignId: 123, workspaceId: "w1" });
    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(200);
    expect(mocks.deleteCampaign).toHaveBeenCalledWith({ workspaceId: "w1", campaignId: "123" });
  });

  test("DELETE campaignId fallback covers ?? '' branch", async () => {
    authSession({ sb: 1 });
    mocks.parseActionRequest.mockResolvedValueOnce({ campaignId: null, workspaceId: "w1" });
    const mod = await import("../app/routes/api+/campaigns");
    await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "DELETE" }),
    } as any);
    expect(mocks.deleteCampaign).toHaveBeenCalledWith({ workspaceId: "w1", campaignId: "" });
  });

  test("POST calls createCampaign", async () => {
    authSession({ sb: 1 });
    mocks.parseActionRequest.mockResolvedValueOnce({ campaignData: { title: "x", workspace: "w1" } });
    mocks.createCampaign.mockResolvedValueOnce({ campaign: { id: 2 }, campaignDetails: { campaign_id: 2 } });
    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "POST" }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ campaign: { id: 2 } });
  });

  test("returns 405 on unsupported method", async () => {
    authSession({});
    mocks.parseActionRequest.mockResolvedValueOnce({});
    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "GET" }),
    } as any));
    expect(res.status).toBe(405);
  });

  test("errors call createErrorResponse", async () => {
    authSession({}, new Headers({ "X": "1" }));
    mocks.parseActionRequest.mockRejectedValueOnce(new Error("boom"));
    const mod = await import("../app/routes/api+/campaigns");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH" }),
    } as any));
    expect(res.status).toBe(400);
    expect(mocks.createErrorResponse).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to process campaign request",
      400,
      expect.any(Object),
    );
  });
});
