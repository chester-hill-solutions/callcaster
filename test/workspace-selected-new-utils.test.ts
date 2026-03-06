import { beforeEach, describe, expect, test, vi } from "vitest";

const bulkCreateContacts = vi.fn(async () => ({ insert: [], audience_insert: [] }));
vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>("@/lib/database.server");
  return { ...actual, bulkCreateContacts };
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
  });

  test("handleNewAudience success with no campaign and no contacts", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils");
    const headers = new Headers({ "x": "y" });
    const fd = new FormData();
    fd.set("audience-name", "New Audience");

    const supabaseClient: any = {
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

    const res = await mod.handleNewAudience({
      supabaseClient,
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      userId: "u1",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/workspaces/w1/audiences/10");
  }, 60000);

  test("handleNewAudience inserts contacts and enqueues when campaignId provided", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "New Audience");

    bulkCreateContacts.mockResolvedValueOnce({ insert: [{ id: 1 }, { id: 2 }], audience_insert: [] });

    const supabaseClient: any = {
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

    const res = await mod.handleNewAudience({
      supabaseClient,
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      campaignId: "123",
      contacts: [{ firstname: "a" } as any],
      userId: "u1",
    });
    expect(res.status).toBe(302);
    expect(bulkCreateContacts).toHaveBeenCalled();
    expect(enqueueContactsForCampaign).toHaveBeenCalledWith(supabaseClient, 123, [1, 2], { requeue: false });
  });

  test("handleNewAudience does not enqueue when insert list is empty", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "New Audience");

    bulkCreateContacts.mockResolvedValueOnce({ insert: [], audience_insert: [] });

    const supabaseClient: any = {
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

    const res = await mod.handleNewAudience({
      supabaseClient,
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      campaignId: "123",
      contacts: [{ firstname: "a" } as any],
      userId: "u1",
    });
    expect(res.status).toBe(302);
    expect(enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("handleNewAudience returns json 500 when campaign link insert errors", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "New Audience");

    const supabaseClient: any = {
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

    const res = await mod.handleNewAudience({
      supabaseClient,
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      campaignId: "123",
      contacts: [],
      userId: "u1",
    });
    expect(res.status).toBe(500);
  });

  test("handleNewAudience returns json 500 when creation errors (including non-Error throws)", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("audience-name", "New Audience");

    const supabaseClientErr: any = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error("create") }),
          }),
        }),
      }),
    };
    const res1 = await mod.handleNewAudience({
      supabaseClient: supabaseClientErr,
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      userId: "u1",
    });
    expect(res1.status).toBe(500);

    bulkCreateContacts.mockImplementationOnce(async () => {
      throw "boom";
    });
    const supabaseClientOk: any = {
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
    const res2 = await mod.handleNewAudience({
      supabaseClient: supabaseClientOk,
      formData: fd,
      workspaceId: "w1",
      headers,
      contactsFile: new File(["x"], "c.csv"),
      contacts: [{ firstname: "a" } as any],
      userId: "u1",
    });
    expect(res2.status).toBe(500);
    const body = await res2.json();
    expect(body.error).toBe("An unexpected error occurred");
  });

  test("handleNewCampaign covers duplicate-name, generic error, invalid type, details error, and success redirect", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils");
    const headers = new Headers();

    const fd = new FormData();
    fd.set("campaign-name", "C");
    fd.set("campaign-type", "live_call");

    const insertSingle = vi.fn();
    const detailsInsert = vi.fn();
    const supabaseClient: any = {
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
        return { insert: detailsInsert };
      },
    };

    insertSingle.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    const r1 = await mod.handleNewCampaign({ supabaseClient, formData: fd, workspaceId: "w1", headers });
    expect((await r1.json()).error.message).toContain("already a campaign");

    insertSingle.mockResolvedValueOnce({ data: null, error: { code: "X", message: "nope" } });
    const r2 = await mod.handleNewCampaign({ supabaseClient, formData: fd, workspaceId: "w1", headers });
    expect((await r2.json()).error).toMatchObject({ code: "X", message: "nope" });

    const fdBad = new FormData();
    fdBad.set("campaign-name", "C");
    fdBad.set("campaign-type", "bad");
    insertSingle.mockResolvedValueOnce({ data: { id: 1 }, error: null });
    const r3 = await mod.handleNewCampaign({ supabaseClient, formData: fdBad, workspaceId: "w1", headers });
    expect((await r3.json()).error).toBe("Invalid campaign type");

    insertSingle.mockResolvedValueOnce({ data: { id: 2 }, error: null });
    detailsInsert.mockResolvedValueOnce({ error: { message: "details" } });
    const r4 = await mod.handleNewCampaign({ supabaseClient, formData: fd, workspaceId: "w1", headers });
    expect((await r4.json()).error.message).toBe("details");

    insertSingle.mockResolvedValueOnce({ data: { id: 3 }, error: null });
    detailsInsert.mockResolvedValueOnce({ error: null });
    const r5 = await mod.handleNewCampaign({ supabaseClient, formData: fd, workspaceId: "w1", headers });
    expect(r5.status).toBe(302);
    expect(r5.headers.get("Location")).toBe("/workspaces/w1/campaigns/3/settings");
  });

  test("handleNewCampaign selects correct details table for message and robocall", async () => {
    const mod = await import("../app/lib/workspace-selector/WorkspaceSelectedNewUtils");
    const headers = new Headers();

    const insertSingle = vi.fn();
    const insertsByTable: string[] = [];
    const supabaseClient: any = {
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
    const r1 = await mod.handleNewCampaign({ supabaseClient, formData: fdMsg, workspaceId: "w1", headers });
    expect(r1.status).toBe(302);

    insertSingle.mockResolvedValue({ data: { id: 100 }, error: null });
    const fdRobo = new FormData();
    fdRobo.set("campaign-name", "C");
    fdRobo.set("campaign-type", "robocall");
    const r2 = await mod.handleNewCampaign({ supabaseClient, formData: fdRobo, workspaceId: "w1", headers });
    expect(r2.status).toBe(302);

    expect(insertsByTable).toEqual(["message_campaign", "ivr_campaign"]);
  });
});

