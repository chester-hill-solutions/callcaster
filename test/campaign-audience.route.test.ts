import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    safeParseJson: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) =>
    mocks.enqueueContactsForCampaign(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api.campaign_audience.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    mocks.logger.error.mockReset();
  });

  test("POST returns message when audience already linked", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 1 }, error: null }),
            }),
          }),
        }),
      }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
    await expect(res.json()).resolves.toEqual({
      message: "Audience already added to campaign",
    });
  }, 30000);

  test("POST inserts link and enqueues when contacts found", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        // existing check
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "PGRST116" },
                }),
              }),
            }),
          }),
        })
        // insert campaign_audience
        .mockReturnValueOnce({
          insert: async () => ({ error: null }),
        })
        // contact_audience select
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({
              data: [{ contact_id: 1 }, { contact_id: 2 }],
              error: null,
            }),
          }),
        })
        // existing campaign_queue rows
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      supabaseClient,
      20,
      [1, 2],
      { requeue: false },
    );
  }, 30000);

  test("POST skips enqueue when no contacts found", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "PGRST116" },
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({ insert: async () => ({ error: null }) })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  }, 30000);

  test("POST treats null contact lookup data as empty list", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "PGRST116" },
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({ insert: async () => ({ error: null }) })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: null, error: null }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  }, 30000);

  test("POST returns 500 with Error.message when insert fails (addError)", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "PGRST116" },
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: async () => ({ error: new Error("add boom") }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "add boom" });
    expect(mocks.logger.error).toHaveBeenCalled();
  }, 30000);

  test("POST returns 500 when contact lookup errors (contactsError)", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "PGRST116" },
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({ insert: async () => ({ error: null }) })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: null, error: new Error("contacts boom") }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "contacts boom" });
    expect(mocks.logger.error).toHaveBeenCalled();
  }, 30000);

  test("DELETE removes audience and queued contacts (when any)", async () => {
    const headers = new Headers({ "Set-Cookie": "b=2" });
    const supabaseClient = {
      from: vi
        .fn()
        // delete campaign_audience
        .mockReturnValueOnce({
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        })
        // campaignAudiences lookup
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: [{ audience_id: 99 }], error: null }),
          }),
        })
        // contactsToRemove lookup
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: [{ contact_id: 1 }], error: null }),
          }),
        })
        // retained contacts from remaining audiences
        .mockReturnValueOnce({
          select: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        })
        // campaign_queue delete queued contacts
        .mockReturnValueOnce({
          delete: () => ({
            eq: () => ({
              in: () => ({
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              }),
            }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("b=2");
    await expect(res.json()).resolves.toEqual({ success: true });
  }, 30000);

  test("DELETE returns success when no contacts to remove", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: [{ audience_id: 99 }], error: null }),
          }),
        })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  }, 30000);

  test("DELETE returns 500 when delete link errors", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce({
        delete: () => ({
          eq: () => ({
            eq: async () => ({ error: new Error("del boom") }),
          }),
        }),
      }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "del boom" });
  }, 30000);

  test("DELETE covers campaignAudiences null fallback and contacts lookup error", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: null, error: null }),
          }),
        })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({
              data: null,
              error: new Error("contacts del boom"),
            }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "contacts del boom" });
  }, 30000);

  test("DELETE returns 500 when removing queued contacts errors (removeError)", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: [{ audience_id: 99 }], error: null }),
          }),
        })
        .mockReturnValueOnce({
          select: () => ({
            eq: async () => ({ data: [{ contact_id: 1 }], error: null }),
          }),
        })
        .mockReturnValueOnce({
          select: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        })
        .mockReturnValueOnce({
          delete: () => ({
            eq: () => ({
              in: () => ({
                eq: () => ({
                  eq: async () => ({ error: new Error("remove boom") }),
                }),
              }),
            }),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "remove boom" });
  }, 30000);

  test("returns 405 on unsupported method", async () => {
    const headers = new Headers();
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, headers });
    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "PUT" }),
    } as any);
    expect(res.status).toBe(405);
  }, 30000);

  test("catch returns 500 and logs (Error vs non-Error)", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: null,
                error: { code: "X", message: "boom" },
              }),
            }),
          }),
        }),
      }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, headers });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api.campaign_audience");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "An unexpected error occurred",
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  }, 30000);
});
