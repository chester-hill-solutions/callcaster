import { beforeEach, describe, expect, test, vi } from "vitest";

describe("app/lib/database/campaign.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../app/lib/logger.server", () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../app/lib/database/workspace.server", () => ({
      getSignedUrls: vi.fn(async () => ["signed-1"]),
    }));
  });

  test("getCampaignTableKey maps types and throws for invalid", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    expect(mod.getCampaignTableKey("live_call")).toBe("live_campaign");
    expect(mod.getCampaignTableKey("message")).toBe("message_campaign");
    expect(mod.getCampaignTableKey("robocall")).toBe("ivr_campaign");
    expect(mod.getCampaignTableKey("simple_ivr")).toBe("ivr_campaign");
    expect(mod.getCampaignTableKey("complex_ivr")).toBe("ivr_campaign");
    expect(() => mod.getCampaignTableKey("nope" as any)).toThrow("Invalid campaign type");
  });

  test("getWorkspaceCampaigns logs on error and returns {data,error}", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: async () => ({ data: [{ id: 1 }], error: new Error("x") }),
    };
    const supabaseClient: any = { from: vi.fn(() => chain) };
    const res = await mod.getWorkspaceCampaigns({
      supabaseClient,
      workspaceId: "w1",
    });
    expect(res.data).toEqual([{ id: 1 }]);
    expect(res.error).toBeInstanceOf(Error);
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceCampaigns success path does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: async () => ({ data: [{ id: 1 }], error: null }),
    };
    const supabaseClient: any = { from: vi.fn(() => chain) };
    const res = await mod.getWorkspaceCampaigns({ supabaseClient, workspaceId: "w1" });
    expect(res).toEqual({ data: [{ id: 1 }], error: null });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("updateCampaign updates campaign and details (update when exists, insert when missing)", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    let existing = true;
    const supabase: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            update: (_data: any) => ({
              eq: (_k: string, _v: any) => ({
                select: () => ({
                  single: async () => ({ data: { id: "1" }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "message_campaign") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: existing ? { campaign_id: "1" } : null, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { updated: 1 }, error: null }),
                }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { inserted: 1 }, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const baseCampaignData: any = {
      campaign_id: "1",
      workspace: "w1",
      title: "T",
      type: "message",
      script_id: 123,
      body_text: "hi",
      message_media: [],
      voicedrop_audio: null,
      is_active: 1,
    };

    existing = true;
    const r1 = await mod.updateCampaign({
      supabase,
      campaignData: baseCampaignData,
      campaignDetails: { campaign_id: "1" },
    });
    expect(r1).toMatchObject({ campaign: { id: "1" }, campaignDetails: { updated: 1 } });

    existing = false;
    const r2 = await mod.updateCampaign({
      supabase,
      campaignData: baseCampaignData,
      campaignDetails: { campaign_id: "1" },
    });
    expect(r2).toMatchObject({ campaignDetails: { inserted: 1 } });
  });

  test("updateCampaign covers ivr_campaign details cleaning branch", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const supabase: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            update: () => ({
              eq: () => ({
                select: () => ({ single: async () => ({ data: { id: "1" }, error: null }) }),
              }),
            }),
          };
        }
        if (table === "ivr_campaign") {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
            insert: () => ({
              select: () => ({ single: async () => ({ data: { inserted: 1 }, error: null }) }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const res = await mod.updateCampaign({
      supabase,
      campaignData: {
        campaign_id: "1",
        workspace: "w1",
        title: "T",
        type: "robocall",
        is_active: true,
      } as any,
      campaignDetails: { campaign_id: "1" },
    });
    expect(res.campaignDetails).toEqual({ inserted: 1 });
  });

  test("updateCampaign covers live_campaign details cleaning branch", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const supabase: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            update: () => ({
              eq: () => ({
                select: () => ({ single: async () => ({ data: { id: "1" }, error: null }) }),
              }),
            }),
          };
        }
        if (table === "live_campaign") {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
            insert: () => ({
              select: () => ({ single: async () => ({ data: { inserted: 1 }, error: null }) }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const res = await mod.updateCampaign({
      supabase,
      campaignData: {
        campaign_id: "1",
        workspace: "w1",
        title: "T",
        type: "live_call",
        is_active: true,
      } as any,
      campaignDetails: { campaign_id: "1" },
    });
    expect(res.campaignDetails).toEqual({ inserted: 1 });
  });

  test("updateCampaign throws with contextual message when operations error", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const supabase: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            update: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: null, error: { message: "bad" } }),
                }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };

    await expect(
      mod.updateCampaign({
        supabase,
        campaignData: { campaign_id: "1", workspace: "w1", title: "T", type: "message" } as any,
        campaignDetails: { campaign_id: "1" },
      }),
    ).rejects.toThrow("Error updating campaign: bad");
  });

  test("updateCampaign requires campaign_id", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    await expect(
      mod.updateCampaign({
        supabase: {} as any,
        campaignData: { workspace: "w1", title: "T", type: "message" } as any,
        campaignDetails: { campaign_id: "" },
      }),
    ).rejects.toThrow("Campaign ID is required");
  });

  test("deleteCampaign throws on error; otherwise completes", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    const supabaseOk: any = {
      from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }),
    };
    await expect(mod.deleteCampaign({ supabase: supabaseOk, campaignId: "1" })).resolves.toBeUndefined();

    const supabaseErr: any = {
      from: () => ({ delete: () => ({ eq: async () => ({ error: new Error("x") }) }) }),
    };
    await expect(mod.deleteCampaign({ supabase: supabaseErr, campaignId: "1" })).rejects.toThrow("x");
  });

  test("createCampaign: happy path (message) and details error cleanup", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    let detailsError: any = null;
    const deleted: any[] = [];

    const supabase: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: (data: any) => ({
              select: () => ({
                single: async () => ({ data: { id: "c1", ...data }, error: null }),
              }),
            }),
            delete: () => ({
              eq: async (_k: string, id: string) => {
                deleted.push(id);
                return { error: null };
              },
            }),
          };
        }
        if (table === "message_campaign") {
          return {
            insert: (_data: any) => ({
              select: () => ({
                single: async () =>
                  detailsError
                    ? { data: null, error: detailsError }
                    : { data: { ok: 1 }, error: null },
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const ok = await mod.createCampaign({
      supabase,
      campaignData: { workspace: "w1", title: "T", type: "message" } as any,
    });
    expect(ok).toMatchObject({ campaign: { id: "c1" }, campaignDetails: { ok: 1 } });

    detailsError = { message: "details" };
    await expect(
      mod.createCampaign({
        supabase,
        campaignData: { workspace: "w1", title: "T2", type: "message" } as any,
      }),
    ).rejects.toThrow("Error creating campaign details: details");
    expect(logger.error).toHaveBeenCalled();
    expect(deleted).toContain("c1");
  });

  test("createCampaign: live_call branch and script_id conversion", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const supabase: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: (data: any) => ({
              select: () => ({ single: async () => ({ data: { id: "c1", ...data }, error: null }) }),
            }),
          };
        }
        if (table === "live_campaign") {
          return {
            insert: (details: any) => ({
              select: () => ({
                single: async () => ({ data: { ok: 1, details }, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const res = await mod.createCampaign({
      supabase,
      campaignData: {
        workspace: "w1",
        title: "T",
        type: "live_call",
        script_id: "5",
      } as any,
    });
    expect(res.campaignDetails.details.script_id).toBe(5);
  });

  test("createCampaign: duplicate title retries; non-duplicate errors wrap; missing type throws", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    let insertCall = 0;
    const supabase: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: (data: any) => ({
              select: () => ({
                single: async () => {
                  insertCall++;
                  if (insertCall === 1) return { data: null, error: { code: "23505" } };
                  return { data: { id: "c2", ...data }, error: null };
                },
              }),
            }),
          };
        }
        if (table === "ivr_campaign") {
          return { insert: () => ({ select: () => ({ single: async () => ({ data: { ok: 1 }, error: null }) }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const res = await mod.createCampaign({
      supabase,
      campaignData: { workspace: "w1", title: "T", type: "robocall" } as any,
    });
    expect(res.campaign.title).toContain("(Copy)");

    const supabaseErr: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: null, error: { code: "X", message: "no" } }) }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };
    await expect(
      mod.createCampaign({
        supabase: supabaseErr,
        campaignData: { workspace: "w1", title: "T", type: "message" } as any,
      }),
    ).rejects.toThrow("Error creating campaign: Unknown error");

    const supabaseTypeMissing: any = {
      from: (table: string) => {
        if (table === "campaign") {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: { id: "c3" }, error: null }) }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };
    await expect(
      mod.createCampaign({
        supabase: supabaseTypeMissing,
        campaignData: { workspace: "w1", title: "T" } as any,
      }),
    ).rejects.toThrow("Campaign type is required");
  });

  test("createCampaign: duplicate retry can fail and is wrapped", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    let call = 0;
    const supabase: any = {
      from: (table: string) => {
        if (table !== "campaign") throw new Error("unexpected");
        return {
          insert: () => ({
            select: () => ({
              single: async () => {
                call++;
                if (call === 1) return { data: null, error: { code: "23505" } };
                return { data: null, error: new Error("retry") };
              },
            }),
          }),
        };
      },
    };

    await expect(
      mod.createCampaign({
        supabase,
        campaignData: { workspace: "w1", title: "T", type: "robocall" } as any,
      }),
    ).rejects.toThrow("Error creating campaign: retry");
  });

  test("updateOrCopyScript covers insert/update, copy naming, and duplicate name error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    let mode: "insertOk" | "updateOk" | "dup" | "otherErr" = "insertOk";
    const supabase: any = {
      from: (table: string) => {
        if (table !== "script") throw new Error("unexpected");
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { id: 1, name: "S" }, error: null }) }) }),
          insert: (data: any) => ({
            select: async () =>
              mode === "dup"
                ? { data: null, error: { code: "23505" } }
                : mode === "otherErr"
                  ? { data: null, error: new Error("x") }
                : { data: [{ ...data, id: 2 }], error: null },
          }),
          update: (data: any) => ({
            eq: () => ({
              select: async () =>
                mode === "dup"
                  ? { data: null, error: { code: "23505" } }
                  : mode === "otherErr"
                    ? { data: null, error: new Error("x") }
                  : { data: [{ ...data, id: 1 }], error: null },
            }),
          }),
        };
      },
    };

    mode = "insertOk";
    const copy = await mod.updateOrCopyScript({
      supabase,
      scriptData: { id: 1, name: "S" } as any,
      saveAsCopy: true,
      campaignData: { id: 1 } as any,
      created_by: "u1",
      created_at: "t",
    });
    expect(copy.name).toContain("(Copy)");

    mode = "updateOk";
    const updated = await mod.updateOrCopyScript({
      supabase,
      scriptData: { id: 1, name: "S2" } as any,
      saveAsCopy: false,
      campaignData: { id: 1 } as any,
      created_by: "u1",
      created_at: "t",
    });
    expect(updated.name).toBe("S2");

    mode = "dup";
    await expect(
      mod.updateOrCopyScript({
        supabase,
        scriptData: { id: 1, name: "S2" } as any,
        saveAsCopy: false,
        campaignData: { id: 1 } as any,
        created_by: "u1",
        created_at: "t",
      }),
    ).rejects.toThrow("already exists");
    expect(logger.error).toHaveBeenCalled();

    mode = "otherErr";
    await expect(
      mod.updateOrCopyScript({
        supabase,
        scriptData: { id: 1, name: "S2" } as any,
        saveAsCopy: false,
        campaignData: { id: 1 } as any,
        created_by: "u1",
        created_at: "t",
      }),
    ).rejects.toThrow("x");
  });

  test("updateOrCopyScript covers no-id (new script) branch", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const supabase: any = {
      from: () => ({
        insert: (data: any) => ({
          select: async () => ({ data: [{ ...data, id: 1 }], error: null }),
        }),
      }),
    };
    const out = await mod.updateOrCopyScript({
      supabase,
      scriptData: { name: "New" } as any,
      saveAsCopy: false,
      campaignData: { id: 1 } as any,
      created_by: "u1",
      created_at: "t",
    });
    expect(out).toMatchObject({ id: 1, name: "New" });
  });

  test("updateCampaignScript chooses table and throws on invalid type or update error", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    let error: any = null;
    const supabase: any = {
      from: (table: string) => ({
        update: (_d: any) => ({
          eq: async () => ({ error: error ? new Error(`${table}-bad`) : null }),
        }),
      }),
    };

    await expect(
      mod.updateCampaignScript({ supabase, campaignId: "1", scriptId: 1, campaignType: "" }),
    ).resolves.toBeUndefined();
    await expect(
      mod.updateCampaignScript({ supabase, campaignId: "1", scriptId: 1, campaignType: "robocall" }),
    ).resolves.toBeUndefined();
    await expect(
      mod.updateCampaignScript({ supabase, campaignId: "1", scriptId: 1, campaignType: "nope" }),
    ).rejects.toThrow("Invalid campaign type for script update");

    error = true;
    await expect(
      mod.updateCampaignScript({ supabase, campaignId: "1", scriptId: 1, campaignType: "robocall" }),
    ).rejects.toBeInstanceOf(Error);
  });

  test("fetchBasicResults logs on error and returns []", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    const supabase: any = { rpc: vi.fn(async () => ({ data: null, error: new Error("x") })) };
    const out = await mod.fetchBasicResults(supabase, "1");
    expect(out).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  test("fetchBasicResults success returns data", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    const supabase: any = { rpc: vi.fn(async () => ({ data: [{ ok: 1 }], error: null })) };
    const out = await mod.fetchBasicResults(supabase, "1");
    expect(out).toEqual([{ ok: 1 }]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("fetchCampaignCounts logs errors and returns counts", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    let call = 0;
    const supabase: any = {
      from: () => ({
        select: (_s: any, _o: any) => ({
          eq: async () => {
            call++;
            return call === 1
              ? { count: 1, error: new Error("a") }
              : { count: 2, error: new Error("b") };
          },
        }),
      }),
    };
    const res = await mod.fetchCampaignCounts(supabase, "1");
    expect(res).toEqual({ callCount: 1, completedCount: 2 });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  test("fetchCampaignCounts success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    let call = 0;
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: async () => {
            call++;
            return call === 1 ? { count: 1, error: null } : { count: 2, error: null };
          },
        }),
      }),
    };
    const res = await mod.fetchCampaignCounts(supabase, "1");
    expect(res).toEqual({ callCount: 1, completedCount: 2 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("fetchCampaignData logs error and returns data", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 1 }, error: new Error("x") }),
          }),
        }),
      }),
    };
    const data = await mod.fetchCampaignData(supabase, "1");
    expect(data).toEqual({ id: 1 });
    expect(logger.error).toHaveBeenCalled();
  });

  test("fetchCampaignData success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 1 }, error: null }),
          }),
        }),
      }),
    };
    const data = await mod.fetchCampaignData(supabase, "1");
    expect(data).toEqual({ id: 1 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("fetchCampaignDetails handles missing-record insert, other errors, and success", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    let mode: "missingOk" | "missingErr" | "otherErr" | "ok" = "missingOk";
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              if (mode === "ok") return { data: { id: 1 }, error: null };
              if (mode === "missingOk") return { data: null, error: { code: "PGRST116" } };
              if (mode === "missingErr") return { data: null, error: { code: "PGRST116" } };
              return { data: null, error: { code: "X" } };
            },
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () =>
              mode === "missingErr"
                ? { data: null, error: new Error("ins") }
                : { data: { created: 1 }, error: null },
          }),
        }),
      }),
    };

    mode = "missingOk";
    await expect(mod.fetchCampaignDetails(supabase, 1, "w1", "t")).resolves.toEqual({ created: 1 });

    mode = "missingErr";
    await expect(mod.fetchCampaignDetails(supabase, 1, "w1", "t")).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();

    mode = "otherErr";
    await expect(mod.fetchCampaignDetails(supabase, 1, "w1", "t")).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();

    mode = "ok";
    await expect(mod.fetchCampaignDetails(supabase, 1, "w1", "t")).resolves.toEqual({ id: 1 });
  });

  test("fetchQueueCounts throws with helpful messages and returns counts on success", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    let mode: "ok" | "fullErr" | "queuedErr" = "ok";
    const makeCampaignQueueQuery = () => {
      const state = { isQueued: false };
      const chain: any = {
        select: () => chain,
        eq: (_k: string, v: any) => {
          if (v === "queued") state.isQueued = true;
          return chain;
        },
        not: () => chain,
        neq: () => chain,
        limit: async () => {
          if (mode === "fullErr" && !state.isQueued) {
            return { error: { message: "full" }, count: null };
          }
          if (mode === "queuedErr" && state.isQueued) {
            return { error: { message: "queued" }, count: null };
          }
          return { error: null, count: state.isQueued ? 3 : 10 };
        },
      };
      return chain;
    };

    const supabase: any = { from: () => makeCampaignQueueQuery() };

    mode = "fullErr";
    await expect(mod.fetchQueueCounts(supabase, "1")).rejects.toThrow("Error fetching full count");

    mode = "queuedErr";
    await expect(mod.fetchQueueCounts(supabase, "1")).rejects.toThrow(
      "Error fetching queued count",
    );

    // Missing message branches => "Unknown error ..."
    mode = "fullErr";
    const supabaseNoMsg: any = {
      from: () => {
        const state = { isQueued: false };
        const chain: any = {
          select: () => chain,
          eq: (_k: string, v: any) => {
            if (v === "queued") state.isQueued = true;
            return chain;
          },
          not: () => chain,
          neq: () => chain,
          limit: async () => ({ error: state.isQueued ? null : ({} as any), count: null }),
        };
        return chain;
      },
    };
    await expect(mod.fetchQueueCounts(supabaseNoMsg, "1")).rejects.toThrow(
      "Unknown error fetching full count",
    );

    const supabaseNoQueuedMsg: any = {
      from: () => {
        const state = { isQueued: false };
        const chain: any = {
          select: () => chain,
          eq: (_k: string, v: any) => {
            if (v === "queued") state.isQueued = true;
            return chain;
          },
          not: () => chain,
          neq: () => chain,
          limit: async () =>
            state.isQueued ? ({ error: {} as any, count: null } as any) : { error: null, count: 10 },
        };
        return chain;
      },
    };
    await expect(mod.fetchQueueCounts(supabaseNoQueuedMsg, "1")).rejects.toThrow(
      "Unknown error fetching queued count",
    );

    mode = "ok";
    const ok = await mod.fetchQueueCounts(supabase, "1");
    expect(ok).toEqual({ fullCount: 10, queuedCount: 3 });
  });

  test("fetchCampaignAudience returns data and throws for any query error", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const makeClient = (errs: { queue?: any; queued?: any; scripts?: any } = {}) => ({
      from: (table: string) => {
        if (table === "script") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ id: 1 }], error: errs.scripts ?? null }),
            }),
          };
        }
        if (table === "campaign_queue") {
          const state = { isQueuedQuery: false, limit: 0 };
          const chain: any = {
            select: () => chain,
            eq: (_k: string, v: any) => {
              if (v === "queued") state.isQueuedQuery = true;
              return chain;
            },
            not: () => chain,
            neq: () => chain,
            limit: async (n: number) => {
              state.limit = n;
              if (n === 25) {
                return { data: [{ id: 1 }], count: 25, error: errs.queue ?? null };
              }
              return { data: [{ id: 1 }], count: 1, error: errs.queued ?? null };
            },
          };
          return chain;
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    const ok = await mod.fetchCampaignAudience(makeClient(), "1", "w1");
    expect(ok).toMatchObject({
      campaign_queue: [{ id: 1 }],
      queue_count: 1,
      total_count: 25,
      scripts: [{ id: 1 }],
    });

    await expect(mod.fetchCampaignAudience(makeClient({ queue: { message: "q" } }), "1", "w1")).rejects.toThrow(
      "Error fetching queue data",
    );
    await expect(mod.fetchCampaignAudience(makeClient({ queued: { message: "qc" } }), "1", "w1")).rejects.toThrow(
      "Error fetching queued count",
    );
    await expect(mod.fetchCampaignAudience(makeClient({ scripts: { message: "s" } }), "1", "w1")).rejects.toThrow(
      "Error fetching scripts",
    );
  });

  test("fetchAdvancedCampaignDetails handles campaignType switch, errors, and message media signed urls", async () => {
    const { getSignedUrls } = await import("../app/lib/database/workspace.server");
    const mod = await import("../app/lib/database/campaign.server");

    const supabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              if (table === "message_campaign") {
                return { data: { message_media: ["a.png"] }, error: null };
              }
              return { data: { ok: table }, error: null };
            },
          }),
        }),
      }),
    };

    await expect(
      mod.fetchAdvancedCampaignDetails(supabase, 1, "live_call", "w1"),
    ).resolves.toMatchObject({ ok: "live_campaign" });

    const msg = await mod.fetchAdvancedCampaignDetails(supabase, 1, "message", "w1");
    expect(msg.mediaLinks).toEqual(["signed-1"]);
    expect(getSignedUrls).toHaveBeenCalled();

    await expect(
      mod.fetchAdvancedCampaignDetails(supabase, 1, "robocall", "w1"),
    ).resolves.toMatchObject({ ok: "ivr_campaign" });

    await expect(
      mod.fetchAdvancedCampaignDetails(supabase, 1, "nope" as any, "w1"),
    ).rejects.toThrow("Invalid campaign type");

    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: "x" } }),
          }),
        }),
      }),
    };
    await expect(
      mod.fetchAdvancedCampaignDetails(supabaseErr, 1, "message", "w1"),
    ).rejects.toThrow("Error fetching campaign details: x");
  });

  test("fetchCampaignsByType logs error and returns data", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: new Error("x") }),
        }),
      }),
    };
    const res = await mod.fetchCampaignsByType({
      supabaseClient: supabase,
      workspaceId: "w1",
      type: "message_campaign",
    });
    expect(res).toEqual([{ id: 1 }]);
    expect(logger.error).toHaveBeenCalled();
  });

  test("fetchCampaignsByType success returns data without logging", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    const res = await mod.fetchCampaignsByType({
      supabaseClient: supabase,
      workspaceId: "w1",
      type: "message_campaign",
    });
    expect(res).toEqual([{ id: 1 }]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("getCampaignQueueById returns data and throws on error", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const supabaseOk: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    await expect(
      mod.getCampaignQueueById({ supabaseClient: supabaseOk, campaign_id: "1" }),
    ).resolves.toEqual([{ id: 1 }]);

    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: new Error("x") }),
        }),
      }),
    };
    await expect(
      mod.getCampaignQueueById({ supabaseClient: supabaseErr, campaign_id: "1" }),
    ).rejects.toThrow("x");
  });

  test("checkSchedule covers falsey cases and interval matching (including overnight)", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    expect(mod.checkSchedule(null as any)).toBe(false);
    expect(mod.checkSchedule({} as any)).toBe(false);
    expect(mod.checkSchedule({ schedule: null } as any)).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-06T10:30:00.000Z")); // Monday
    const scheduleObj: any = {
      monday: { active: true, intervals: [{ start: "10:00", end: "11:00" }] },
      tuesday: { active: false, intervals: [] },
      wednesday: { active: false, intervals: [] },
      thursday: { active: false, intervals: [] },
      friday: { active: false, intervals: [] },
      saturday: { active: false, intervals: [] },
      sunday: { active: false, intervals: [] },
    };

    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-01-02T00:00:00.000Z",
        schedule: scheduleObj,
      } as any),
    ).toBe(false);

    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: JSON.stringify(scheduleObj),
      } as any),
    ).toBe(true);

    vi.setSystemTime(new Date("2020-01-07T10:30:00.000Z")); // Tuesday
    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: scheduleObj,
      } as any),
    ).toBe(false);

    const overnight: any = {
      ...scheduleObj,
      monday: { active: true, intervals: [{ start: "23:00", end: "02:00" }] },
    };
    vi.setSystemTime(new Date("2020-01-06T23:30:00.000Z"));
    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: overnight,
      } as any),
    ).toBe(true);

    // Covers the `currentTime < interval.end` side of the overnight OR.
    vi.setSystemTime(new Date("2020-01-06T01:00:00.000Z"));
    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: overnight,
      } as any),
    ).toBe(true);
  });

  test("fetchOutreachData throws on error and returns data on success", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const supabaseOk: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    await expect(mod.fetchOutreachData(supabaseOk, 1)).resolves.toEqual([{ id: 1 }]);

    const supabaseNull: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      }),
    };
    await expect(mod.fetchOutreachData(supabaseNull, 1)).resolves.toEqual([]);

    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: new Error("x") }),
        }),
      }),
    };
    await expect(mod.fetchOutreachData(supabaseErr, 1)).rejects.toThrow("Error fetching data");
  });

  test("processOutreachExportData groups attempts and filters headers", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    const users: any[] = [{ id: "u1", username: "alice", role: "admin" }];
    const data: any[] = [
      // Intentionally out of order to force sort comparator branches.
      {
        id: 3,
        contact_id: 11,
        user_id: "u1",
        created_at: "2020-01-02T00:00:00.000Z",
        call_duration: 1,
        contact: { other_data: [] },
        result: {},
        calls: [{ duration: 1 }],
      },
      {
        id: 1,
        contact_id: 10,
        user_id: "u1",
        created_at: "2020-01-01T00:00:00.000Z",
        call_duration: 2,
        contact: { other_data: [{ extra: "x" }] },
        result: { disposition: "a" },
        calls: [{ duration: 2 }],
      },
      // Same contact within 12h, should merge non-empty fields and keep max call_duration
      {
        id: 2,
        contact_id: 10,
        user_id: "u1",
        created_at: "2020-01-01T01:00:00.000Z",
        call_duration: 5,
        contact: { other_data: [{ extra: "" }] },
        result: { disposition: "" },
        calls: [{ duration: 5 }],
      },
      // Same group but no call_duration => special handling condition false branch
      {
        id: 4,
        contact_id: 10,
        user_id: "u1",
        created_at: "2020-01-01T02:00:00.000Z",
        contact: { other_data: [] },
        result: {},
        calls: [],
      },
    ];

    const out = mod.processOutreachExportData(data, users);
    expect(out.flattenedData).toHaveLength(2);
    expect(out.flattenedData[0].call_duration).toBe(5);
    expect(out.csvHeaders).toContain("call_duration");
  });

  test("processOutreachExportData handles empty data (no currentGroup)", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    const out = mod.processOutreachExportData([], []);
    expect(out.flattenedData).toEqual([]);
  });
});

