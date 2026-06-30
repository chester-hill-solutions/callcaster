import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const bulkCreateContacts = vi.fn(async () => ({ insert: [], audience_insert: [] }));
const getWorkspacePhoneNumbers = vi.fn(async () => ({ data: [], error: null }));
vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>("@/lib/database.server");
  return { ...actual, bulkCreateContacts, getWorkspacePhoneNumbers };
});

const enqueueContactsForCampaign = vi.fn(async () => undefined);
vi.mock("@/lib/queue.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queue.server")>("@/lib/queue.server");
  return { ...actual, enqueueContactsForCampaign };
});

vi.mock("@/lib/logger.server", () => {
  return { logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } };
});

describe("WorkspaceSelectedNewUtils", () => {
  beforeEach(() => {
    bulkCreateContacts.mockReset();
    enqueueContactsForCampaign.mockReset();
    getWorkspacePhoneNumbers.mockReset();
    getWorkspacePhoneNumbers.mockResolvedValue({ data: [], error: null });
  });

  test("handleNewAudience success with no campaign and no contacts", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers({ "x": "y" });
    const fd = new FormData();
    fd.set("audience-name", "New Audience");

    const mockClient: any = {
      from: (table: string) => {
        expect(table).toBe("audience");
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 10 }, error: null }),
            }),
          }),
        };
      },
    };

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

    bulkCreateContacts.mockResolvedValueOnce({ insert: [{ id: 1 }, { id: 2 }], audience_insert: [] });

    const mockClient: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 11 }, error: null }),
              }),
            }),
          };
        }
        if (table === "campaign_audience") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

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

    bulkCreateContacts.mockResolvedValueOnce({ insert: [], audience_insert: [] });

    const mockClient: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 14 }, error: null }),
              }),
            }),
          };
        }
        if (table === "campaign_audience") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

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

    const mockClient: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 12 }, error: null }),
              }),
            }),
          };
        }
        if (table === "campaign_audience") {
          return {
            insert: async () => ({ error: new Error("link") }),
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

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
    fd.set("audience-name", "New Audience");

    const _unusedClientErr: any = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error("create") }),
          }),
        }),
      }),
    };
    const res1 = await asRouteResponse(await mod.handleNewAudience({
      null: _unusedClientErr,
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      userId: "u1",
    }));
    expect(res1.status).toBe(500);

    bulkCreateContacts.mockImplementationOnce(async () => {
      throw "boom";
    });
    const _unusedClientOk: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 13 }, error: null }),
              }),
            }),
          };
        }
        return { insert: async () => ({ error: null }) };
      },
    };
    const res2 = await asRouteResponse(await mod.handleNewAudience({
      null: _unusedClientOk,
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

    const insertSingle = vi.fn();
    const mockClient: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: () => ({
              select: () => ({
                single: insertSingle,
              }),
            }),
          };
        }
        return { insert: vi.fn() };
      },
    };

    insertSingle.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    const r1 = await asRouteResponse(await mod.handleNewCampaign({ formData: fd, workspaceId: "w1", headers }));
    expect((await r1.json()).error.message).toContain("already a campaign");

    insertSingle.mockResolvedValueOnce({ data: null, error: { code: "X", message: "nope" } });
    const r2 = await asRouteResponse(await mod.handleNewCampaign({ formData: fd, workspaceId: "w1", headers }));
    expect((await r2.json()).error).toMatchObject({ code: "X", message: "nope" });

    insertSingle.mockResolvedValueOnce({ data: { id: 2 }, error: null });
    const r3 = await asRouteResponse(await mod.handleNewCampaign({ formData: fd, workspaceId: "w1", headers }));
    expect(r3.status).toBe(302);
    expect(r3.headers.get("Location")).toBe("/workspaces/w1/campaigns/2/settings");
  });

  test("handleNewCampaign creates message and robocall without subtype table inserts", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();

    const insertSingle = vi.fn();
    const insertsByTable: string[] = [];
    const mockClient: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: () => ({
              select: () => ({ single: insertSingle }),
            }),
          };
        }
        return {
          insert: async () => {
            insertsByTable.push(table);
            return { error: null };
          },
        };
      },
    };

    insertSingle.mockResolvedValue({ data: { id: 99 }, error: null });
    const fdMsg = new FormData();
    fdMsg.set("campaign-name", "C");
    fdMsg.set("campaign-type", "message");
    const r1 = await asRouteResponse(await mod.handleNewCampaign({ formData: fdMsg, workspaceId: "w1", headers }));
    expect(r1.status).toBe(302);

    insertSingle.mockResolvedValue({ data: { id: 100 }, error: null });
    const fdRobo = new FormData();
    fdRobo.set("campaign-name", "C");
    fdRobo.set("campaign-type", "robocall");
    const r2 = await asRouteResponse(await mod.handleNewCampaign({ formData: fdRobo, workspaceId: "w1", headers }));
    expect(r2.status).toBe(302);

    expect(insertsByTable).toEqual([]);
  });

  test("handleNewCampaign seeds schedule, dates, and auto caller_id for a single workspace number", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("campaign-name", "First Campaign");
    fd.set("campaign-type", "live_call");

    getWorkspacePhoneNumbers.mockResolvedValue({
      data: [{ phone_number: "+15555550100" }],
      error: null,
    });

    let insertedCampaign: Record<string, unknown> | null = null;
    const mockClient: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: (payload: Record<string, unknown>) => {
              insertedCampaign = payload;
              return {
                select: () => ({
                  single: async () => ({ data: { id: 55 }, error: null }),
                }),
              };
            },
          };
        }
        return { insert: async () => ({ error: null }) };
      },
    };

    const res = await asRouteResponse(await mod.handleNewCampaign({
      formData: fd,
      workspaceId: "w1",
      headers,
    }));

    expect(res.status).toBe(302);
    expect(insertedCampaign).toMatchObject({
      caller_id: "+15555550100",
      schedule: expect.objectContaining({
        monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
      }),
    });
    expect(insertedCampaign?.start_date).toBeTruthy();
    expect(insertedCampaign?.end_date).toBeTruthy();
  });
});

