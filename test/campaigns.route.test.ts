import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    updateCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    createCampaign: vi.fn(),
    createErrorResponse: vi.fn((_e: any) => new Response("err", { status: 400 })),
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  updateCampaign: (...args: any[]) => mocks.updateCampaign(...args),
  deleteCampaign: (...args: any[]) => mocks.deleteCampaign(...args),
  createCampaign: (...args: any[]) => mocks.createCampaign(...args),
}));
vi.mock("@/lib/errors.server", () => ({
  createErrorResponse: (...args: any[]) => mocks.createErrorResponse(...args),
}));

describe("app/routes/api.campaigns.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.parseActionRequest.mockReset();
    mocks.updateCampaign.mockReset();
    mocks.deleteCampaign.mockReset();
    mocks.createCampaign.mockReset();
    mocks.createErrorResponse.mockClear();
  });

  test("PATCH parses JSON fields and returns updated campaign", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { sb: 1 }, headers: new Headers({ "X": "1" }) });
    mocks.parseActionRequest.mockResolvedValueOnce({
      campaignData: JSON.stringify({ title: "t" }),
      campaignDetails: { x: 1 },
    });
    mocks.updateCampaign.mockResolvedValueOnce({ campaign: { id: 1 }, campaignDetails: { campaign_id: 1 } });

    const mod = await import("../app/routes/api.campaigns");
    const res = await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH" }),
    } as any);
    expect(res.headers.get("X")).toBe("1");
    await expect(res.json()).resolves.toMatchObject({ campaign: { id: 1 } });
  });

  test("DELETE calls deleteCampaign", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { sb: 1 }, headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({ campaignId: 123 });
    const mod = await import("../app/routes/api.campaigns");
    const res = await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.deleteCampaign).toHaveBeenCalledWith({ supabase: { sb: 1 }, campaignId: "123" });
  });

  test("DELETE campaignId fallback covers ?? '' branch", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { sb: 1 }, headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({ campaignId: null });
    const mod = await import("../app/routes/api.campaigns");
    await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "DELETE" }),
    } as any);
    expect(mocks.deleteCampaign).toHaveBeenCalledWith({ supabase: { sb: 1 }, campaignId: "" });
  });

  test("POST calls createCampaign", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { sb: 1 }, headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({ campaignData: { title: "x" } });
    mocks.createCampaign.mockResolvedValueOnce({ campaign: { id: 2 }, campaignDetails: { campaign_id: 2 } });
    const mod = await import("../app/routes/api.campaigns");
    const res = await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "POST" }),
    } as any);
    await expect(res.json()).resolves.toMatchObject({ campaign: { id: 2 } });
  });

  test("returns 405 on unsupported method", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({});
    const mod = await import("../app/routes/api.campaigns");
    const res = await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "GET" }),
    } as any);
    expect(res.status).toBe(405);
  });

  test("errors call createErrorResponse", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, headers: new Headers({ "X": "1" }) });
    mocks.parseActionRequest.mockRejectedValueOnce(new Error("boom"));
    const mod = await import("../app/routes/api.campaigns");
    const res = await mod.action({
      request: new Request("http://localhost/api/campaigns", { method: "PATCH" }),
    } as any);
    expect(res.status).toBe(400);
    expect(mocks.createErrorResponse).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to process campaign request",
      400,
      expect.any(Object),
    );
  });
});

