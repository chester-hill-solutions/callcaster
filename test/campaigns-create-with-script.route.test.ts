import { beforeEach, describe, expect, test, vi } from "vitest";

type VerifyError = { error: string; status: number };
type VerifyApiKey = {
  authType: "api_key";
  workspaceId: string;
  supabase: any;
};
type VerifySession = {
  authType: "session";
  supabaseClient: any;
  user: { id: string } | null;
};

const mocks = vi.hoisted(() => {
  return {
    verifyApiKeyOrSession: vi.fn<[], Promise<VerifyError | VerifyApiKey | VerifySession>>(),
    safeParseJson: vi.fn(),
    createCampaign: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: any[]) => (mocks.verifyApiKeyOrSession as any)(...args),
}));
vi.mock("@/lib/database.server", () => ({
  createCampaign: (...args: any[]) => mocks.createCampaign(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) => mocks.enqueueContactsForCampaign(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabaseForValidations(opts: {
  callerNumbers?: string[];
  numbersError?: any;
  audiences?: number[];
  audError?: any;
  scripts?: number[];
  scriptError?: any;
}) {
  const callerNumbers = opts.callerNumbers ?? ["+1555"];
  const audiences = opts.audiences ?? [];
  const scripts = opts.scripts ?? [1, 123];
  return {
    from: vi.fn((table: string) => {
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: async () => ({
              data: callerNumbers.map((phone_number) => ({ phone_number })),
              error: opts.numbersError ?? null,
            }),
          }),
        };
      }
      if (table === "audience") {
        return {
          select: () => ({
            eq: async () => ({
              data: audiences.map((id) => ({ id })),
              error: opts.audError ?? null,
            }),
          }),
        };
      }
      if (table === "script") {
        return {
          select: () => {
            let requestedId: number | null = null;
            const builder = {
              eq: (col: string, value: unknown) => {
                if (col === "id") {
                  requestedId = Number(value);
                }
                return builder;
              },
              maybeSingle: async () => ({
                data:
                  requestedId != null && scripts.includes(requestedId)
                    ? { id: requestedId }
                    : null,
                error: opts.scriptError ?? null,
              }),
            };
            return builder;
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("app/routes/api.campaigns.create-with-script.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyApiKeyOrSession.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.createCampaign.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 405 for non-POST", async () => {
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "GET" }) } as any);
    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toEqual({ error: "Method not allowed" });
  });

  test("returns auth error when verifyApiKeyOrSession fails", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ error: "no", status: 401 });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "no" });
  });

  test("returns 400 on invalid JSON body", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase: {} } as any);
    mocks.safeParseJson.mockRejectedValueOnce(new Error("bad json"));
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });

  test("session auth requires workspace_id", async () => {
    const supabaseClient = makeSupabaseForValidations({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "workspace_id is required when using session auth",
    });
  });

  test("api_key auth rejects mismatched workspace_id", async () => {
    const supabase = makeSupabaseForValidations({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w2",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "workspace_id does not match API key" });
  });

  test("validates title/type/caller_id/script requirements", async () => {
    const supabase = makeSupabaseForValidations({});
    mocks.verifyApiKeyOrSession.mockResolvedValue({ authType: "api_key", workspaceId: "w1", supabase });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");

    mocks.safeParseJson.mockResolvedValueOnce({ type: "live_call", caller_id: "+1555", script_id: 1 });
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r1.status).toBe(400);

    mocks.safeParseJson.mockResolvedValueOnce({ workspace_id: "w1", title: "t", type: "message", caller_id: "+1555", script_id: 1 });
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r2.status).toBe(400);

    mocks.safeParseJson.mockResolvedValueOnce({ workspace_id: "w1", title: "t", type: "live_call", script_id: 1 });
    const r3 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r3.status).toBe(400);

    mocks.safeParseJson.mockResolvedValueOnce({ workspace_id: "w1", title: "t", type: "live_call", caller_id: "+1555" });
    const r4 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r4.status).toBe(400);
  });

  test("returns 500 when workspace_number query errors", async () => {
    const supabase = makeSupabaseForValidations({ numbersError: { message: "db" } });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to validate caller_id" });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error fetching workspace numbers", expect.anything());
  });

  test("returns 400 when caller_id does not belong to workspace", async () => {
    const supabase = makeSupabaseForValidations({ callerNumbers: ["+1999"] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
  });

  test("covers workspaceNumbers ?? [] when workspaceNumbers is null", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: null, error: null }) }) };
        }
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }),
    };
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
  });

  test("validates audience_ids: audError (500) and invalid ids (400)", async () => {
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");

    const supabaseErr = makeSupabaseForValidations({ audError: { message: "aud" }, audiences: [] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase: supabaseErr });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
      audience_ids: [1],
    });
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r1.status).toBe(500);

    const supabaseBad = makeSupabaseForValidations({ audiences: [2] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase: supabaseBad });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
      audience_ids: [1],
    });
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r2.status).toBe(400);
  });

  test("validates script_id belongs to workspace", async () => {
    const supabase = makeSupabaseForValidations({ scripts: [] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 999,
    });

    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "script_id must belong to this workspace",
    });
  });

  test("returns 500 when script_id lookup errors", async () => {
    const supabase = makeSupabaseForValidations({ scriptError: { message: "script lookup failed" } });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });

    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to validate script_id",
    });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error validating script_id", expect.anything());
  });

  test("covers workspaceAudiences ?? [] when workspaceAudiences is null", async () => {
    const caller_id = "+1555";
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: caller_id }], error: null }) }) };
        }
        if (table === "audience") {
          return { select: () => ({ eq: async () => ({ data: null, error: null }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 1,
      audience_ids: [1],
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
  });

  test("script creation errors: insert error and missing row", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: "+1555" }], error: null }) }) };
        }
        if (table === "script") {
          return {
            insert: () => ({
              select: async () => ({ data: null, error: { message: "script bad" } }),
            }),
          };
        }
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }),
    };
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script: { name: "s", steps: {} },
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r1.status).toBe(500);

    // missing row after successful insert
    const supabase2 = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: "+1555" }], error: null }) }) };
        }
        if (table === "script") {
          return {
            insert: () => ({
              select: async () => ({ data: [], error: null }),
            }),
          };
        }
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }),
    };
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase: supabase2 });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script: { name: "s", steps: {} },
    });
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r2.status).toBe(500);
  });

  test("covers script name default, steps provided, createdBy null, and non-array scriptRows", async () => {
    const caller_id = "+1555";
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: caller_id }], error: null }) }) };
        }
        if (table === "script") {
          return {
            insert: () => ({
              select: async () => ({
                data: { id: 9, name: "Campaign script", type: "script", steps: { pages: { a: 1 } } },
                error: null,
              }),
            }),
          };
        }
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }),
    };
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id,
      script: { name: undefined, type: undefined, steps: { pages: { a: 1 } } },
      audience_ids: [],
      start_date: "2020-01-01",
      end_date: "2020-01-02",
      schedule: { tz: "UTC" },
      enqueue_audience_contacts: false,
      is_active: false,
    });
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 1 },
      campaignDetails: { campaign_id: 1 },
    });
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.script).toBeTruthy();
  });

  test("createCampaign errors are returned as 400 (Error and non-Error)", async () => {
    const supabase = makeSupabaseForValidations({ callerNumbers: ["+1555"] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    mocks.createCampaign.mockRejectedValueOnce(new Error("nope"));
    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r1.status).toBe(400);

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    mocks.createCampaign.mockRejectedValueOnce("nope");
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(r2.status).toBe(400);
  });

  test("full success (session auth) links audiences and enqueues new contacts", async () => {
    const workspaceId = "w1";
    const caller_id = "+1555";
    const audience_ids = [1, 2, 3, 4, 5, 6];
    const campaignId = 777;

    const checkResponses = [
      { data: null, error: { message: "check" } }, // audience 1 -> continue
      { data: { id: 1 }, error: null }, // audience 2 existing -> continue
      { data: null, error: null }, // audience 3 -> proceed to insert (but addError)
      { data: null, error: null }, // audience 4 -> insert ok, contactsError
      { data: null, error: null }, // audience 5 -> insert ok, contacts ok (enqueue)
      { data: null, error: null }, // audience 6 -> insert ok, contacts ok (no enqueue)
    ];
    const insertErrors = [
      { error: { message: "add" } }, // audience 3 -> addError continue
      { error: null }, // audience 4
      { error: null }, // audience 5
      { error: null }, // audience 6
    ];
    const contactResponses = [
      { data: null, error: { message: "contacts" } }, // audience 4 -> contactsError continue
      { data: [{ contact_id: 10 }, { contact_id: 11 }], error: null }, // audience 5 -> enqueue 11 only
      { data: [{ contact_id: 10 }], error: null }, // audience 6 -> no enqueue
    ];

    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: caller_id }], error: null }) }) };
        }
        if (table === "audience") {
          return { select: () => ({ eq: async () => ({ data: audience_ids.map((id) => ({ id })), error: null }) }) };
        }
        if (table === "script") {
          return {
            insert: () => ({
              select: async () => ({
                data: [{ id: 55, name: "s", type: "ivr", steps: { pages: {}, blocks: {} } }],
                error: null,
              }),
            }),
          };
        }
        if (table === "campaign_queue") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ contact_id: 10 }], error: null }),
            }),
          };
        }
        if (table === "campaign_audience") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => checkResponses.shift(),
                }),
              }),
            }),
            insert: async () => insertErrors.shift(),
          };
        }
        if (table === "contact_audience") {
          return {
            select: () => ({
              eq: async () => contactResponses.shift(),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script: { name: "s", steps: undefined },
      audience_ids,
      enqueue_audience_contacts: true,
      is_active: true,
      start_date: null,
      end_date: null,
      schedule: null,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: campaignId },
      campaignDetails: { campaign_id: campaignId },
    });

    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.audiences_linked).toBe(3);
    expect(body.contacts_enqueued).toBe(1);
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(supabaseClient, campaignId, [11], { requeue: false });
  });

  test("existing script_id path works and skips audience loop when audience_ids empty", async () => {
    const workspaceId = "w1";
    const caller_id = "+1555";
    const supabase = makeSupabaseForValidations({ callerNumbers: [caller_id] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId, supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 123,
      audience_ids: [],
      enqueue_audience_contacts: false,
    });
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 1 },
      campaignDetails: { campaign_id: 1 },
    });

    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      audiences_linked: 0,
      contacts_enqueued: 0,
    });
  });

  test("covers queuedRows ?? [] when campaign_queue returns null data", async () => {
    const workspaceId = "w1";
    const caller_id = "+1555";
    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: caller_id }], error: null }) }) };
        }
        if (table === "audience") {
          return { select: () => ({ eq: async () => ({ data: [{ id: 1 }], error: null }) }) };
        }
        if (table === "script") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 1 }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "campaign_queue") {
          return { select: () => ({ eq: async () => ({ data: null, error: null }) }) };
        }
        if (table === "campaign_audience") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
            insert: async () => ({ error: null }),
          };
        }
        if (table === "contact_audience") {
          return { select: () => ({ eq: async () => ({ data: [{ contact_id: 1 }], error: null }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 1,
      audience_ids: [1],
      enqueue_audience_contacts: true,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 7 },
      campaignDetails: { campaign_id: 7 },
    });

    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.audiences_linked).toBe(1);
    expect(body.contacts_enqueued).toBe(1);
  });

  test("covers enqueue_audience_contacts false branch inside audience loop", async () => {
    const workspaceId = "w1";
    const caller_id = "+1555";
    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: caller_id }], error: null }) }) };
        }
        if (table === "audience") {
          return { select: () => ({ eq: async () => ({ data: [{ id: 1 }], error: null }) }) };
        }
        if (table === "script") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 1 }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "campaign_audience") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
            insert: async () => ({ error: null }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 1,
      audience_ids: [1],
      enqueue_audience_contacts: false,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 7 },
      campaignDetails: { campaign_id: 7 },
    });

    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      audiences_linked: 1,
      contacts_enqueued: 0,
    });
  });

  test("covers audienceContacts ?? [] when contact_audience returns null data", async () => {
    const workspaceId = "w1";
    const caller_id = "+1555";
    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "workspace_number") {
          return { select: () => ({ eq: async () => ({ data: [{ phone_number: caller_id }], error: null }) }) };
        }
        if (table === "audience") {
          return { select: () => ({ eq: async () => ({ data: [{ id: 1 }], error: null }) }) };
        }
        if (table === "script") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 1 }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "campaign_queue") {
          return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        }
        if (table === "campaign_audience") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
            insert: async () => ({ error: null }),
          };
        }
        if (table === "contact_audience") {
          return { select: () => ({ eq: async () => ({ data: null, error: null }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 1,
      audience_ids: [1],
      enqueue_audience_contacts: true,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 7 },
      campaignDetails: { campaign_id: 7 },
    });

    const mod = await import("../app/routing/api/api.campaigns.create-with-script");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      audiences_linked: 1,
      contacts_enqueued: 0,
    });
  });
});

