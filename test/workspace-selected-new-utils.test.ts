import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const bulkCreateContacts = vi.fn(async () => ({ insert: [], audience_insert: [] }));
const getWorkspacePhoneNumbers = vi.fn(async () => ({ data: [], error: null }));

vi.mock("@/lib/database/contact.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/database/contact.server")
  >("@/lib/database/contact.server");
  return { ...actual, bulkCreateContacts };
});
vi.mock("@/lib/database/workspace.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/database/workspace.server")
  >("@/lib/database/workspace.server");
  return { ...actual, getWorkspacePhoneNumbers };
});

const enqueueContactsForCampaign = vi.fn(async () => undefined);
vi.mock("@/lib/queue.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queue.server")>("@/lib/queue.server");
  return { ...actual, enqueueContactsForCampaign };
});

vi.mock("@/lib/logger.server", () => {
  return { logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } };
});

const tenantDbState = vi.hoisted(() => ({
  audienceId: 10,
  campaignId: 2,
  campaignInsertError: null as Error | null,
  campaignInsertErrorCode: null as string | null,
  insertedCampaign: null as Record<string, unknown> | null,
  campaignAudienceInsertError: null as Error | null,
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    audience: {
      insert: vi.fn(async (values: any) => {
        if (values?.name === "boom") throw "boom";
        return [{ id: tenantDbState.audienceId, ...values }];
      }),
    },
    campaign: {
      insert: vi.fn(async (values: any) => {
        tenantDbState.insertedCampaign = values;
        if (tenantDbState.campaignInsertError) {
          const err: any = tenantDbState.campaignInsertError;
          if (tenantDbState.campaignInsertErrorCode) err.code = tenantDbState.campaignInsertErrorCode;
          throw err;
        }
        return [{ id: tenantDbState.campaignId, ...values }];
      }),
    },
  })),
}));

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(async () => {
        if (tenantDbState.campaignAudienceInsertError) {
          throw tenantDbState.campaignAudienceInsertError;
        }
        return [];
      }),
    })),
  },
}));

describe("WorkspaceSelectedNewUtils", () => {
  beforeEach(() => {
    bulkCreateContacts.mockReset();
    enqueueContactsForCampaign.mockReset();
    getWorkspacePhoneNumbers.mockReset();
    getWorkspacePhoneNumbers.mockResolvedValue({ data: [], error: null });
    tenantDbState.audienceId = 10;
    tenantDbState.campaignId = 2;
    tenantDbState.campaignInsertError = null;
    tenantDbState.campaignInsertErrorCode = null;
    tenantDbState.insertedCampaign = null;
    tenantDbState.campaignAudienceInsertError = null;
  });

  test("handleNewAudience success with no campaign and no contacts", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers({ "x": "y" });
    const fd = new FormData();
    fd.set("audience-name", "New Audience");
    tenantDbState.audienceId = 10;

    const res = await asRouteResponse(await mod.handleNewAudience({
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      userId: "u1",
    }));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/workspaces/w1/audiences/10");
  }, 60000);

  test("handleNewAudience inserts contacts and enqueues when campaignId provided", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "New Audience");
    tenantDbState.audienceId = 11;

    bulkCreateContacts.mockResolvedValueOnce({ insert: [{ id: 1 }, { id: 2 }], audience_insert: [] });

    const res = await asRouteResponse(await mod.handleNewAudience({
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      campaignId: "123",
      contacts: [{ firstname: "a" } as any],
      userId: "u1",
    }));
    expect(res.status).toBe(302);
    expect(bulkCreateContacts).toHaveBeenCalled();
    expect(enqueueContactsForCampaign).toHaveBeenCalledWith(123, [1, 2], { requeue: false });
  });

  test("handleNewAudience does not enqueue when insert list is empty", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "New Audience");
    tenantDbState.audienceId = 14;

    bulkCreateContacts.mockResolvedValueOnce({ insert: [], audience_insert: [] });

    const res = await asRouteResponse(await mod.handleNewAudience({
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      campaignId: "123",
      contacts: [{ firstname: "a" } as any],
      userId: "u1",
    }));
    expect(res.status).toBe(302);
    expect(enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("handleNewAudience returns json 500 when campaign link insert errors", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "New Audience");
    tenantDbState.audienceId = 12;
    tenantDbState.campaignAudienceInsertError = new Error("link");

    const res = await asRouteResponse(await mod.handleNewAudience({
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      campaignId: "123",
      contacts: [],
      userId: "u1",
    }));
    expect(res.status).toBe(500);
  });

  test("handleNewAudience returns json 500 when creation errors (including non-Error throws)", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "boom");

    const res1 = await asRouteResponse(await mod.handleNewAudience({
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      userId: "u1",
    }));
    expect(res1.status).toBe(500);

    fd.set("audience-name", "New Audience");
    tenantDbState.audienceId = 13;
    bulkCreateContacts.mockImplementationOnce(async () => {
      throw "boom";
    });
    const res2 = await asRouteResponse(await mod.handleNewAudience({
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      contacts: [{ firstname: "a" } as any],
      userId: "u1",
    }));
    expect(res2.status).toBe(500);
    const body = await res2.json();
    expect(body.error).toBe("An unexpected error occurred");
  });

  test("handleNewCampaign covers duplicate-name, generic error, and success redirect", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("campaign-name", "C");
    fd.set("campaign-type", "live_call");

    tenantDbState.campaignInsertError = new Error("duplicate");
    tenantDbState.campaignInsertErrorCode = "23505";
    const r1 = await asRouteResponse(await mod.handleNewCampaign({ formData: fd, workspaceId: "w1", headers }));
    expect((await r1.json()).error.message).toContain("already a campaign");

    tenantDbState.campaignInsertError = new Error("nope");
    tenantDbState.campaignInsertErrorCode = "X";
    const r2 = await asRouteResponse(await mod.handleNewCampaign({ formData: fd, workspaceId: "w1", headers }));
    expect((await r2.json()).error).toMatchObject({ code: "X", message: "nope" });

    tenantDbState.campaignInsertError = null;
    tenantDbState.campaignId = 2;
    const r3 = await asRouteResponse(await mod.handleNewCampaign({ formData: fd, workspaceId: "w1", headers }));
    expect(r3.status).toBe(302);
    expect(r3.headers.get("Location")).toBe("/workspaces/w1/campaigns/2/settings");
  });

  test("handleNewCampaign creates message and robocall without subtype table inserts", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    tenantDbState.campaignInsertError = null;

    tenantDbState.campaignId = 99;
    const fdMsg = new FormData();
    fdMsg.set("campaign-name", "C");
    fdMsg.set("campaign-type", "message");
    const r1 = await asRouteResponse(await mod.handleNewCampaign({ formData: fdMsg, workspaceId: "w1", headers }));
    expect(r1.status).toBe(302);

    tenantDbState.campaignId = 100;
    const fdRobo = new FormData();
    fdRobo.set("campaign-name", "C");
    fdRobo.set("campaign-type", "robocall");
    const r2 = await asRouteResponse(await mod.handleNewCampaign({ formData: fdRobo, workspaceId: "w1", headers }));
    expect(r2.status).toBe(302);
  });

  test("handleNewCampaign seeds schedule, dates, and auto caller_id for a single workspace number", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("campaign-name", "First Campaign");
    fd.set("campaign-type", "live_call");
    tenantDbState.campaignInsertError = null;
    tenantDbState.campaignId = 55;

    getWorkspacePhoneNumbers.mockResolvedValue({
      data: [{ phone_number: "+15555550100" }],
      error: null,
    });

    const res = await asRouteResponse(await mod.handleNewCampaign({
      formData: fd,
      workspaceId: "w1",
      headers,
    }));

    expect(res.status).toBe(302);
    expect(tenantDbState.insertedCampaign).toMatchObject({
      caller_id: "+15555550100",
      schedule: expect.objectContaining({
        monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
      }),
    });
    expect(tenantDbState.insertedCampaign?.start_date).toBeTruthy();
    expect(tenantDbState.insertedCampaign?.end_date).toBeTruthy();
  });
});
