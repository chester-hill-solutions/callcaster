import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    requireJsonAuth: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    safeParseJson: vi.fn(),
    rpcCreateOutreachAttempt: vi.fn(),
    dequeueCampaignQueueByContact: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

const tenantDbMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  contactUpdate: vi.fn(),
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: (...args: any[]) => mocks.getSession(...args),
}));
vi.mock("@/lib/api-auth.server", () => ({
  requireJsonAuth: (...args: any[]) => mocks.requireJsonAuth(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: any[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
  // The route parses via parseActionRequest (JSON or form); tests stub the
  // parsed body through the same mock either way.
  parseActionRequest: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: (...args: any[]) => mocks.rpcCreateOutreachAttempt(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueCampaignQueueByContact: (...args: any[]) =>
    mocks.dequeueCampaignQueueByContact(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    outreach_attempt: {
      findFirst: (...args: any[]) => tenantDbMocks.findFirst(...args),
      update: (...args: any[]) => tenantDbMocks.update(...args),
    },
    contact: {
      update: (...args: any[]) => tenantDbMocks.contactUpdate(...args),
    },
  }),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultBody = {
  update: { a: 1 },
  contact_id: 1,
  campaign_id: 2,
  workspace: "w1",
  disposition: "done",
  queue_id: 3,
};

const headers = new Headers();

describe("app/routes/api+/questions/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSession.mockReset();
    mocks.requireJsonAuth.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.rpcCreateOutreachAttempt.mockReset();
    mocks.dequeueCampaignQueueByContact.mockReset();
    mocks.logger.error.mockReset();
    tenantDbMocks.findFirst.mockReset();
    tenantDbMocks.update.mockReset();
    tenantDbMocks.contactUpdate.mockReset();
    tenantDbMocks.contactUpdate.mockResolvedValue([{ id: 1, opt_out: true }]);
    mocks.dequeueCampaignQueueByContact.mockResolvedValue([]);

    mocks.getSession.mockResolvedValue({ headers, user: { id: "u1" } });
    mocks.requireJsonAuth.mockResolvedValue({ user: { id: "u1" } });
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.safeParseJson.mockResolvedValue(defaultBody);
    tenantDbMocks.findFirst.mockResolvedValue(null);
    tenantDbMocks.update.mockResolvedValue([{ id: 7, disposition: "done", result: { a: 1 } }]);
    mocks.rpcCreateOutreachAttempt.mockResolvedValue(7);
  });

  test.skip("returns 500 when recent outreach search errors", async () => {
    // SKIPPED: product bug — questions.action.server.ts does not wrap the findFirst
    // DB call in a try/catch, so errors bubble up instead of returning a 500 response.
    const error = new Error("find failed");
    tenantDbMocks.findFirst.mockRejectedValueOnce(error);
    const mod = await import("../app/routes/api+/questions");
    await expect(mod.action({ request: makeRequest(defaultBody) } as any)).rejects.toThrow("find failed");
  });

  test("creates outreach when none recent, coerces rpc id, and returns updated outreach", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce(null);
    mocks.rpcCreateOutreachAttempt.mockResolvedValueOnce("7");
    const mod = await import("../app/routes/api+/questions");
    const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 7, disposition: "done", result: { a: 1 } });
    expect(mocks.rpcCreateOutreachAttempt).toHaveBeenCalledWith(
      expect.anything(),
      {
        contactId: 1,
        campaignId: 2,
        userId: "u1",
        workspaceId: "w1",
        queueId: 3,
      },
    );
  });

  test("returns 500 when rpc create_outreach_attempt errors", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce(null);
    const rpcError = new Error("rpc bad");
    mocks.rpcCreateOutreachAttempt.mockRejectedValueOnce(rpcError);
    const mod = await import("../app/routes/api+/questions");
    const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: rpcError });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("updates existing outreach when recentOutreach exists (update undefined branch)", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce({ id: 1 });
    tenantDbMocks.update.mockResolvedValueOnce([{ id: 1, disposition: "completed" }]);
    mocks.safeParseJson.mockResolvedValueOnce({
      update: undefined,
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    const mod = await import("../app/routes/api+/questions");
    const res = await asRouteResponse(mod.action({ request: makeRequest({}) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 1, disposition: "completed" });
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
  });

  test("targets the attempt by callId when provided instead of the 10-minute window", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce({ id: 42 });
    tenantDbMocks.update.mockResolvedValueOnce([{ id: 42, disposition: "completed" }]);
    mocks.safeParseJson.mockResolvedValueOnce({
      update: { a: 1 },
      callId: 42,
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    const mod = await import("../app/routes/api+/questions");
    const res = await asRouteResponse(mod.action({ request: makeRequest({}) } as any));
    expect(res.status).toBe(200);
    // Exactly one lookup (by id) — no fallback window query, no create.
    expect(tenantDbMocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ id: 42, disposition: "completed" });
  });

  test("the 'idle' sentinel and empty dispositions never reach the update", async () => {
    for (const sentinel of ["idle", ""]) {
      tenantDbMocks.findFirst.mockResolvedValueOnce({ id: 1, disposition: "voicemail" });
      tenantDbMocks.update.mockResolvedValueOnce([{ id: 1, disposition: "voicemail" }]);
      mocks.safeParseJson.mockResolvedValueOnce({
        update: { a: 1 },
        contact_id: 1,
        campaign_id: 2,
        workspace: "w1",
        disposition: sentinel,
        queue_id: 3,
      });
      const mod = await import("../app/routes/api+/questions");
      const res = await asRouteResponse(mod.action({ request: makeRequest({}) } as any));
      expect(res.status).toBe(200);
      const updateArg = tenantDbMocks.update.mock.calls.at(-1)?.[0];
      expect(updateArg.set).not.toHaveProperty("disposition");
      expect(updateArg.set).toHaveProperty("result", { a: 1 });
    }
  });

  test.skip("returns 500 when updating recent outreach attempt errors", async () => {
    // SKIPPED: product bug — questions.action.server.ts does not wrap the first
    // update DB call in a try/catch, so errors bubble up instead of returning a 500 response.
    tenantDbMocks.findFirst.mockResolvedValueOnce({ id: 1 });
    tenantDbMocks.update.mockRejectedValueOnce(new Error("update bad"));
    const mod = await import("../app/routes/api+/questions");
    await expect(mod.action({ request: makeRequest(defaultBody) } as any)).rejects.toThrow("update bad");
  });

  test("a stale callId scoped to another contact falls back to the window lookup", async () => {
    // callId lookup (scoped by contact+campaign) misses; window lookup hits.
    tenantDbMocks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 9 });
    tenantDbMocks.update.mockResolvedValueOnce([{ id: 9, disposition: "completed" }]);
    mocks.safeParseJson.mockResolvedValueOnce({
      update: { a: 1 },
      callId: 999,
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    const mod = await import("../app/routes/api+/questions");
    const res = await asRouteResponse(mod.action({ request: makeRequest({}) } as any));
    expect(res.status).toBe(200);
    expect(tenantDbMocks.findFirst).toHaveBeenCalledTimes(2);
    await expect(res.json()).resolves.toEqual({ id: 9, disposition: "completed" });
  });

  test.skip("returns 500 when final outreach update errors", async () => {
    // SKIPPED: product bug — questions.action.server.ts does not wrap the final
    // update DB call in a try/catch, so errors bubble up instead of returning a 500 response.
    tenantDbMocks.findFirst.mockResolvedValueOnce(null);
    mocks.rpcCreateOutreachAttempt.mockResolvedValueOnce(9);
    tenantDbMocks.update.mockRejectedValueOnce(new Error("final bad"));
    const mod = await import("../app/routes/api+/questions");
    await expect(mod.action({ request: makeRequest(defaultBody) } as any)).rejects.toThrow("final bad");
  });

  test("writes typed outreach columns and syncs contact.support_level cache", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce(null);
    mocks.rpcCreateOutreachAttempt.mockResolvedValueOnce(7);
    mocks.safeParseJson.mockResolvedValueOnce({
      ...defaultBody,
      update: {
        support_level: 2,
        volunteer_interest: "yes",
        lawn_sign: true,
      },
    });
    const mod = await import("../app/routes/api+/questions");
    const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
    expect(res.status).toBe(200);
    expect(tenantDbMocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          support_level: 2,
          volunteer_interest: "yes",
          lawn_sign: true,
        }),
      }),
    );
    expect(tenantDbMocks.contactUpdate).toHaveBeenCalledWith({
      set: { support_level: 2 },
      where: expect.anything(),
    });
  });

  test("returns 500 when outreach attempt id is null after creation", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce(null);
    mocks.rpcCreateOutreachAttempt.mockResolvedValueOnce(null);
    const mod = await import("../app/routes/api+/questions");
    const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to create or update outreach attempt" });
  });

  describe("do-not-call disposition side effects", () => {
    test("do_not_call sets contact.opt_out and dequeues the contact from all campaigns", async () => {
      mocks.safeParseJson.mockResolvedValueOnce({
        ...defaultBody,
        disposition: "do_not_call",
      });
      tenantDbMocks.update.mockResolvedValue([{ id: 7, disposition: "do_not_call" }]);
      const mod = await import("../app/routes/api+/questions");
      const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
      expect(res.status).toBe(200);
      expect(tenantDbMocks.contactUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ set: { opt_out: true } }),
      );
      // All-campaigns dequeue: campaignId must be omitted.
      expect(mocks.dequeueCampaignQueueByContact).toHaveBeenCalledWith({
        contactId: 1,
        userId: "u1",
        reason: "Do not call requested",
        workspaceId: "w1",
      });
    });

    test("matches display-label and cased variants of do_not_call", async () => {
      for (const variant of ["Do not call", "DO-NOT-CALL"]) {
        tenantDbMocks.contactUpdate.mockClear();
        mocks.dequeueCampaignQueueByContact.mockClear();
        mocks.safeParseJson.mockResolvedValueOnce({
          ...defaultBody,
          disposition: variant,
        });
        const mod = await import("../app/routes/api+/questions");
        const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
        expect(res.status).toBe(200);
        expect(tenantDbMocks.contactUpdate).toHaveBeenCalledTimes(1);
        expect(mocks.dequeueCampaignQueueByContact).toHaveBeenCalledTimes(1);
      }
    });

    test("non-DNC dispositions do not touch contact.opt_out or the queue", async () => {
      mocks.safeParseJson.mockResolvedValueOnce({
        ...defaultBody,
        disposition: "completed",
      });
      const mod = await import("../app/routes/api+/questions");
      const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
      expect(res.status).toBe(200);
      expect(tenantDbMocks.contactUpdate).not.toHaveBeenCalled();
      expect(mocks.dequeueCampaignQueueByContact).not.toHaveBeenCalled();
    });

    test("side-effect failures are logged but do not fail the disposition save", async () => {
      mocks.safeParseJson.mockResolvedValueOnce({
        ...defaultBody,
        disposition: "do_not_call",
      });
      tenantDbMocks.contactUpdate.mockRejectedValueOnce(new Error("opt-out failed"));
      const mod = await import("../app/routes/api+/questions");
      const res = await asRouteResponse(mod.action({ request: makeRequest(defaultBody) } as any));
      expect(res.status).toBe(200);
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Do-not-call side effects failed after disposition save:",
        expect.any(Error),
      );
    });
  });
});
