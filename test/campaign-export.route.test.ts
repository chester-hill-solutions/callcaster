import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const requireWorkspaceAccess = vi.fn(async () => undefined);
vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>(
    "@/lib/database.server",
  );
  return { ...actual, requireWorkspaceAccess };
});

const loggerError = vi.fn();
vi.mock("@/lib/logger.server", () => {
  return {
    logger: {
      error: loggerError,
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

type UploadBehavior = "ok" | "error" | "throw" | "throwNonError";

type ExportSupabaseConfig = {
  campaign: {
    id: number;
    workspace: string;
    type: string;
    title?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
  };
  campaignQueueContactIds?: Array<number | string>;
  contacts?: Array<any>;
  messageCount?: number;
  messages?: Array<any>;
  outreachAttemptCount?: number;
  outreachAttempts?: Array<any>;
  calls?: Array<any>;
  script?: any;
  scriptError?: string | null;
  campaignError?: string | null;
  campaignExportError?: string | null;
  campaignExportMissing?: boolean;
  campaignQueueError?: string | null;
  contactsError?: string | null;
  messageCountError?: string | null;
  messagesError?: string | null;
  outreachAttemptCountError?: string | null;
  outreachAttemptsError?: string | null;
  callsError?: string | null;
  uploadBehaviors?: UploadBehavior[];
  uploadBehavior?: (path: string, callIndex: number) => UploadBehavior;
  signedUrlBehavior?: "ok" | "error";
};

class QueryBuilder {
  table: string;
  singleMode = false;
  filters: Array<[string, string, any]> = [];
  inFilters: Array<[string, any[]]> = [];
  rangeBounds: [number, number] | null = null;
  orderBy: [string, any] | null = null;
  selectArgs: any[] = [];

  constructor(
    table: string,
    private resolve: (qb: QueryBuilder) => Promise<any>,
  ) {
    this.table = table;
  }

  select(...args: any[]) {
    this.selectArgs = args;
    return this;
  }
  eq(field: string, value: any) {
    this.filters.push(["eq", field, value]);
    return this;
  }
  gte(field: string, value: any) {
    this.filters.push(["gte", field, value]);
    return this;
  }
  lte(field: string, value: any) {
    this.filters.push(["lte", field, value]);
    return this;
  }
  in(field: string, values: any[]) {
    this.inFilters.push([field, values]);
    return this;
  }
  order(field: string, opts: any) {
    this.orderBy = [field, opts];
    return this;
  }
  range(from: number, to: number) {
    this.rangeBounds = [from, to];
    return this;
  }
  single() {
    this.singleMode = true;
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.resolve(this).then(onfulfilled as any, onrejected as any);
  }
}

function makeSupabase(config: ExportSupabaseConfig) {
  const uploads: Array<{ path: string; body: any; opts?: any }> = [];
  let uploadCallIdx = 0;

  const storageBucket = {
    upload: vi.fn(async (path: string, body: any, opts?: any) => {
      uploads.push({ path, body, opts });
      uploadCallIdx += 1;
      const behavior =
        config.uploadBehavior?.(path, uploadCallIdx) ??
        config.uploadBehaviors?.[uploadCallIdx - 1] ??
        "ok";
      if (behavior === "throw") throw new Error("upload throw");
      if (behavior === "throwNonError") throw "upload throw";
      if (behavior === "error")
        return { data: null, error: { message: "upload error" } };
      return { data: {}, error: null };
    }),
    createSignedUrl: vi.fn(async () => {
      if (config.signedUrlBehavior === "error") {
        return { data: null, error: { message: "signed url error" } };
      }
      return { data: { signedUrl: "https://signed.example/csv" }, error: null };
    }),
  };

  const supabaseClient: any = {
    __uploads: uploads,
    storage: {
      from: () => storageBucket,
    },
    from: (table: string) => {
      return new QueryBuilder(table, async (qb) => {
        const campaign = config.campaign;

        if (table === "campaign") {
          const isExportQuery = qb.filters.some(
            (f) => f[0] === "eq" && f[1] === "workspace",
          );
          if (isExportQuery) {
            if (config.campaignExportError) {
              return {
                data: null,
                error: { message: config.campaignExportError },
              };
            }
            if (config.campaignExportMissing) {
              return { data: null, error: null };
            }
          }

          if (config.campaignError)
            return { data: null, error: { message: config.campaignError } };
          if (qb.singleMode) return { data: campaign, error: null };
          return { data: [campaign], error: null };
        }

        if (table === "campaign_queue") {
          if (config.campaignQueueError != null) {
            return {
              data: null,
              error: { message: config.campaignQueueError },
            };
          }
          return {
            data: (config.campaignQueueContactIds ?? []).map((contact_id) => ({
              contact_id,
            })),
            error: null,
          };
        }

        if (table === "contact") {
          if (config.contactsError != null)
            return { data: null, error: { message: config.contactsError } };
          return {
            data: config.contacts === undefined ? [] : config.contacts,
            error: null,
          };
        }

        if (table === "message") {
          const [, selectOpts] = qb.selectArgs;
          const wantsCount = !!selectOpts?.count;
          const campaignIdFilter = qb.filters.find(
            (f) => f[0] === "eq" && f[1] === "campaign_id",
          )?.[2];
          const filteredMessages = (config.messages ?? []).filter((message) =>
            campaignIdFilter == null
              ? true
              : message.campaign_id === campaignIdFilter,
          );
          if (wantsCount) {
            if (config.messageCountError != null)
              return {
                data: null,
                error: { message: config.messageCountError },
                count: null,
              };
            return {
              data: null,
              error: null,
              count: config.messageCount ?? filteredMessages.length,
            };
          }
          if (config.messagesError != null)
            return { data: null, error: { message: config.messagesError } };
          return { data: filteredMessages, error: null };
        }

        if (table === "live_campaign" || table === "ivr_campaign") {
          if (config.scriptError != null)
            return { data: null, error: { message: config.scriptError } };
          return {
            data: {
              script:
                config.script === undefined
                  ? { steps: { pages: {}, blocks: {} } }
                  : config.script,
            },
            error: null,
          };
        }

        if (table === "outreach_attempt") {
          const [, selectOpts] = qb.selectArgs;
          const wantsCount = !!selectOpts?.count;
          if (wantsCount) {
            if (config.outreachAttemptCountError != null) {
              return {
                data: null,
                error: { message: config.outreachAttemptCountError },
                count: null,
              };
            }
            return {
              data: null,
              error: null,
              count: config.outreachAttemptCount ?? 0,
            };
          }
          if (config.outreachAttemptsError != null)
            return {
              data: null,
              error: { message: config.outreachAttemptsError },
            };
          return { data: config.outreachAttempts ?? [], error: null };
        }

        if (table === "call") {
          if (config.callsError != null)
            return { data: null, error: { message: config.callsError } };
          return {
            data: config.calls === undefined ? [] : config.calls,
            error: null,
          };
        }

        return { data: null, error: null };
      });
    },
  };

  return { supabaseClient, uploads, storageBucket };
}

let authUser: any = { id: "u1" };
let supabaseForAuth: any = null;

vi.mock("@/lib/supabase.server", () => {
  return {
    verifyAuth: vi.fn(async () => {
      return { supabaseClient: supabaseForAuth, user: authUser };
    }),
  };
});

function reqForm(url: string, fd: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fd)) form.set(k, v);
  return new Request(url, { method: "POST", body: form });
}

describe("api.campaign-export", () => {
  beforeEach(() => {
    requireWorkspaceAccess.mockClear();
    loggerError.mockClear();
    authUser = { id: "u1" };
    supabaseForAuth = null;
    vi.useRealTimers();
  });
  afterEach(() => {
    // Ensure fake timers never leak to other test files.
    vi.useRealTimers();
  });

  test("returns 401 when user missing", async () => {
    authUser = null;
    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);
    expect(res.status).toBe(401);
  }, 60000);

  test("returns 400 when campaignId/workspaceId missing", async () => {
    const { supabaseClient } = makeSupabase({
      campaign: { id: 1, workspace: "w1", type: "message", title: "T" },
    });
    supabaseForAuth = supabaseClient;
    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({ request: reqForm("http://x", {}) } as any);
    expect(res.status).toBe(400);
  }, 60000);

  test("returns 404 when campaign not found", async () => {
    const { supabaseClient } = makeSupabase({
      campaign: { id: 1, workspace: "w1", type: "message", title: "T" },
      campaignError: "not found",
    });
    supabaseForAuth = supabaseClient;
    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(404);
  });

  test("returns 403 when campaign belongs to different workspace", async () => {
    const { supabaseClient } = makeSupabase({
      campaign: { id: 1, workspace: "w2", type: "message", title: "T" },
    });
    supabaseForAuth = supabaseClient;
    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(403);
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  test("returns 400 on invalid campaign type", async () => {
    const { supabaseClient } = makeSupabase({
      campaign: { id: 1, workspace: "w1", type: "nope", title: "T" },
    });
    supabaseForAuth = supabaseClient;
    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(400);
  });

  test("returns 500 when request.formData throws, and Unknown error when non-Error thrown", async () => {
    const { supabaseClient } = makeSupabase({
      campaign: { id: 1, workspace: "w1", type: "message", title: "T" },
    });
    supabaseForAuth = supabaseClient;
    const mod = await import("../app/routes/api.campaign-export");

    const res = await mod.action({
      request: {
        formData: () => {
          throw new Error("bad form");
        },
      },
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "bad form" });

    requireWorkspaceAccess.mockImplementationOnce(async () => {
      throw "nope";
    });
    const res2 = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res2.status).toBe(500);
    await expect(res2.json()).resolves.toEqual({ error: "Unknown error" });
  });

  test("message export runs to completion (covers matching + non-matching messages)", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 1,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1, 2],
      contacts: [
        {
          id: 1,
          firstname: "A",
          surname: "AA",
          phone: "+1 (555) 000-0000",
          opt_out: false,
          workspace: "w1",
        },
        {
          id: 2,
          firstname: "B",
          surname: "BB",
          phone: null,
          opt_out: true,
          workspace: "w1",
        },
      ],
      messageCount: 2,
      messages: [
        {
          id: "m1",
          campaign_id: 1,
          body: '=HYPERLINK("x")',
          from: "+1 (555) 000-0000",
          to: "1",
          date_created: new Date().toISOString(),
        },
        {
          id: "m2",
          campaign_id: 1,
          body: "no match",
          from: "000",
          to: "999",
          date_created: new Date().toISOString(),
        },
      ],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);

    await vi.runAllTimersAsync();
    // final status upload should include "completed"
    const completed = (supabaseClient.__uploads as any[]).some((u) => {
      if (!String(u.path).endsWith(".json")) return false;
      try {
        const obj = JSON.parse(String(u.body));
        return obj.status === "completed" && obj.stage === "Export completed";
      } catch {
        return false;
      }
    });
    expect(completed).toBe(true);
  });

  test("message export excludes same-phone messages from other campaigns", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 81,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contacts: [
        {
          id: 1,
          firstname: "A",
          surname: "AA",
          phone: "+1 (555) 000-0000",
          opt_out: false,
          workspace: "w1",
        },
      ],
      messages: [
        {
          id: "m1",
          campaign_id: 81,
          body: "included",
          from: "+1 (555) 000-0000",
          to: "1",
          date_created: new Date().toISOString(),
        },
        {
          id: "m2",
          campaign_id: 999,
          body: "excluded",
          from: "+1 (555) 000-0000",
          to: "1",
          date_created: new Date().toISOString(),
        },
      ],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "81", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);

    await vi.runAllTimersAsync();

    const csvUpload = (
      supabaseClient.__uploads as Array<{ path: string; body: unknown }>
    ).find((u) => String(u.path).endsWith(".csv"));
    expect(csvUpload).toBeTruthy();
    const csvText =
      csvUpload?.body instanceof Blob
        ? await csvUpload.body.text()
        : String(csvUpload?.body ?? "");
    expect(csvText).toContain("included");
    expect(csvText).not.toContain("excluded");
  });

  test("message export catch uses Unknown error when a non-Error is thrown", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 5,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      uploadBehaviors: ["throwNonError", "ok"],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "5", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith("Export error:", "upload throw");
  });

  test("action covers blank campaign title branches for message and call", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api.campaign-export");

    const { supabaseClient: sbMsg } = makeSupabase({
      campaign: {
        id: 6,
        workspace: "w1",
        type: "message",
        title: "",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "1", workspace: "w1" }],
      messageCount: 0,
      messages: [],
    });
    supabaseForAuth = sbMsg;
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "6", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);

    const { supabaseClient: sbCall } = makeSupabase({
      campaign: {
        id: 7,
        workspace: "w1",
        type: "live_call",
        title: "",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      outreachAttemptCount: 0,
      outreachAttempts: [],
    });
    supabaseForAuth = sbCall;
    const res2 = await mod.action({
      request: reqForm("http://x", { campaignId: "7", workspaceId: "w1" }),
    } as any);
    expect(res2.status).toBe(200);

    await vi.runAllTimersAsync();
  });

  test("message export covers opt_out=true and message_date branches (date_sent and fallback)", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 8,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1, 2],
      contacts: [
        { id: 1, phone: "+1 (111) 111-1111", opt_out: false, workspace: "w1" },
        { id: 2, phone: "+1 (111) 111-1111", opt_out: true, workspace: "w1" }, // duplicate phone covers phoneToContact.has
      ],
      messageCount: 2,
      messages: [
        {
          id: "m1",
          from: "+1 (111) 111-1111",
          to: "x",
          date_sent: new Date("2026-01-03").toISOString(),
        },
        {
          id: "m2",
          from: "+1 (111) 111-1111",
          to: "x",
          // no date_sent/date_created => fallback new Date().toISOString()
        },
      ],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "8", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
  });

  test("message export covers contactBatch null branch", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 9,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contacts: null as any, // contactBatch is null => skips merge
      messageCount: 0,
      messages: [],
    });
    supabaseForAuth = supabaseClient;
    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "9", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
  });

  test("message export final status upload error triggers catch", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 4,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "+1 (999) 999-9999", workspace: "w1" }],
      messageCount: 0,
      messages: [],
      // init status ok, contact stage ok, CSV ok, final status errors
      uploadBehaviors: ["ok", "ok", "ok", "error"],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "4", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("message export covers internal campaign error and missing-campaign fallback", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api.campaign-export");

    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 10,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignExportError: "campaign export error",
    });
    supabaseForAuth = supabaseClient;
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "10", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );

    loggerError.mockClear();
    const { supabaseClient: sb2 } = makeSupabase({
      campaign: {
        id: 11,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignExportMissing: true,
    });
    supabaseForAuth = sb2;
    const res2 = await mod.action({
      request: reqForm("http://x", { campaignId: "11", workspaceId: "w1" }),
    } as any);
    expect(res2.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("message export covers campaign queue/contact/message errors and CSV upload error", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api.campaign-export");

    const baseCampaign = {
      workspace: "w1",
      type: "message",
      title: "Camp",
      start_date: new Date("2026-01-01").toISOString(),
      end_date: new Date("2026-01-02").toISOString(),
    };

    // campaign_queue error
    const { supabaseClient: sbQueueErr } = makeSupabase({
      campaign: { id: 20, ...baseCampaign } as any,
      campaignQueueError: "queue err",
    });
    supabaseForAuth = sbQueueErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "20", workspaceId: "w1" }),
    } as any);

    // no contacts found
    const { supabaseClient: sbNoContacts } = makeSupabase({
      campaign: { id: 21, ...baseCampaign } as any,
      campaignQueueContactIds: [],
    });
    supabaseForAuth = sbNoContacts;
    await mod.action({
      request: reqForm("http://x", { campaignId: "21", workspaceId: "w1" }),
    } as any);

    // contact batch error
    const { supabaseClient: sbContactErr } = makeSupabase({
      campaign: { id: 22, ...baseCampaign } as any,
      campaignQueueContactIds: [1],
      contactsError: "contact err",
    });
    supabaseForAuth = sbContactErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "22", workspaceId: "w1" }),
    } as any);

    // message count error
    const { supabaseClient: sbCountErr } = makeSupabase({
      campaign: { id: 23, ...baseCampaign } as any,
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "+1 (333) 333-3333", workspace: "w1" }],
      messageCountError: "count err",
    });
    supabaseForAuth = sbCountErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "23", workspaceId: "w1" }),
    } as any);

    // messages chunk error
    const { supabaseClient: sbMsgErr } = makeSupabase({
      campaign: { id: 24, ...baseCampaign } as any,
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "+1 (444) 444-4444", workspace: "w1" }],
      messageCount: 1,
      messagesError: "messages err",
    });
    supabaseForAuth = sbMsgErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "24", workspaceId: "w1" }),
    } as any);

    // CSV upload error
    const { supabaseClient: sbCsvErr } = makeSupabase({
      campaign: { id: 25, ...baseCampaign } as any,
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "+1 (555) 555-5555", workspace: "w1" }],
      messageCount: 1,
      messages: [
        { id: "m", from: "0", to: "0", date_created: new Date().toISOString() },
      ],
      uploadBehavior: (path) => (path.endsWith(".csv") ? "error" : "ok"),
    });
    supabaseForAuth = sbCsvErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "25", workspaceId: "w1" }),
    } as any);

    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("message export covers no-matches and empty-messages break, and signed-url error path", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 1,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: null as any,
      },
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "+1 (222) 222-2222", workspace: "w1" }],
      messageCount: 1,
      messages: [], // triggers break (no data)
      signedUrlBehavior: "error",
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("message export covers opt_out=true match and from/to empty-string fallbacks", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 50,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contacts: [
        { id: 1, phone: "5550000000", opt_out: true, workspace: "w1" },
      ],
      messageCount: 2,
      messages: [
        {
          id: "m1",
          from: "5550000000",
          to: null,
          date_created: new Date().toISOString(),
        },
        {
          id: "m2",
          from: null,
          to: undefined,
          date_created: new Date().toISOString(),
        },
      ],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "50", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
  });

  test("message export uses default error strings when error.message is empty", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api.campaign-export");

    // campaign_queue error -> uses "Error fetching campaign contacts"
    const { supabaseClient: sbQueueErr } = makeSupabase({
      campaign: {
        id: 60,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueError: "",
    });
    supabaseForAuth = sbQueueErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "60", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // contact batch error -> uses `Error fetching contact batch ${i}`
    const { supabaseClient: sbBatchErr } = makeSupabase({
      campaign: {
        id: 61,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contactsError: "",
    });
    supabaseForAuth = sbBatchErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "61", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // message count error -> uses "Error counting messages"
    const { supabaseClient: sbCountErr } = makeSupabase({
      campaign: {
        id: 62,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "5550000000", workspace: "w1" }],
      messageCountError: "",
    });
    supabaseForAuth = sbCountErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "62", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // messages chunk error -> uses `Error fetching messages chunk at offset ${offset}`
    const { supabaseClient: sbMsgsErr } = makeSupabase({
      campaign: {
        id: 63,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "5550000000", workspace: "w1" }],
      messageCount: 1,
      messagesError: "",
    });
    supabaseForAuth = sbMsgsErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "63", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("call export runs and covers result parsing (string/object/invalid), visited pages, and credits", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 2,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
        status: "active",
      },
      script: {
        steps: {
          pages: {
            p1: { id: "p1", title: "Page 1", blocks: ["b1", "b2", "missing"] },
            p2: { id: "p2", title: "Page 2", blocks: "not-array" },
          },
          blocks: {
            b1: { id: "b1", type: "question", title: "Q1" },
            b2: { id: "b2", type: "other", title: "Ignored" },
          },
        },
      },
      outreachAttemptCount: 3,
      outreachAttempts: [
        {
          id: "a1",
          contact_id: "c1",
          campaign_id: 2,
          disposition: "done",
          result: JSON.stringify({ p1: { Q1: "yes" }, p2: "skip" }),
          created_at: new Date().toISOString(),
        },
        {
          id: "a2",
          contact_id: "c2",
          campaign_id: 2,
          disposition: null,
          result: { p1: { Q1: "maybe" } }, // cover non-string result branch
          created_at: new Date().toISOString(),
        },
        {
          id: "a3",
          contact_id: "c2",
          campaign_id: 2,
          disposition: null,
          result: "{", // invalid JSON -> logs
          created_at: new Date().toISOString(),
        },
      ],
      contacts: [
        {
          id: "c1",
          firstname: "A",
          surname: "AA",
          phone: "1",
          opt_out: false,
          workspace: "w1",
        },
        {
          id: "c2",
          firstname: "B",
          surname: "BB",
          phone: "2",
          opt_out: true,
          workspace: "w1",
        },
      ],
      calls: [
        {
          outreach_attempt_id: "a1",
          sid: "s1",
          duration: "61",
          status: "completed",
          start_time: "st",
          end_time: "en",
        },
        {
          outreach_attempt_id: "a2",
          sid: "s2",
          duration: null,
          status: "no-answer",
        },
        { outreach_attempt_id: null, sid: "s3", duration: "0" }, // covers outreach_attempt_id guard
      ],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "2", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);

    await vi.runAllTimersAsync();

    const completed = (supabaseClient.__uploads as any[]).some((u) => {
      if (!String(u.path).endsWith(".json")) return false;
      try {
        const obj = JSON.parse(String(u.body));
        return obj.status === "completed";
      } catch {
        return false;
      }
    });
    expect(completed).toBe(true);
    // invalid JSON result should have logged an error
    expect(loggerError).toHaveBeenCalled();
  });

  test("call export covers campaign export error and missing-campaign fallback", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api.campaign-export");

    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 40,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignExportError: "campaign export error",
    });
    supabaseForAuth = supabaseClient;
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "40", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );

    loggerError.mockClear();
    const { supabaseClient: sb2 } = makeSupabase({
      campaign: {
        id: 41,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      campaignExportMissing: true,
    });
    supabaseForAuth = sb2;
    const res2 = await mod.action({
      request: reqForm("http://x", { campaignId: "41", workspaceId: "w1" }),
    } as any);
    expect(res2.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("call export CSV upload error triggers catch", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 42,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      outreachAttemptCount: 0,
      outreachAttempts: [],
      uploadBehavior: (path) => (path.endsWith(".csv") ? "error" : "ok"),
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "42", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("call export covers ivr_campaign selection and errors (script/count/calls)", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 3,
        workspace: "w1",
        type: "robocall",
        title: "Robo",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      scriptError: "script blew up",
      outreachAttemptCountError: "count blew up",
      callsError: "calls blew up",
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "3", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
  });

  test("call export covers attempt chunk break, contacts/calls errors, status upload error, signed url error, and nested catch logging", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api.campaign-export");

    const baseCampaign = {
      workspace: "w1",
      type: "live_call",
      title: "CallCamp",
      start_date: new Date("2026-01-01").toISOString(),
      end_date: new Date("2026-01-02").toISOString(),
    };

    // status upload error (call export)
    const { supabaseClient: sbStatusErr } = makeSupabase({
      campaign: { id: 30, ...baseCampaign } as any,
      uploadBehaviors: ["error"],
    });
    supabaseForAuth = sbStatusErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "30", workspaceId: "w1" }),
    } as any);

    // attempt count error
    const { supabaseClient: sbAttemptCountErr } = makeSupabase({
      campaign: { id: 31, ...baseCampaign } as any,
      outreachAttemptCountError: "attempt count err",
    });
    supabaseForAuth = sbAttemptCountErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "31", workspaceId: "w1" }),
    } as any);

    // attempts error
    const { supabaseClient: sbAttemptsErr } = makeSupabase({
      campaign: { id: 32, ...baseCampaign } as any,
      outreachAttemptCount: 1,
      outreachAttemptsError: "attempts err",
    });
    supabaseForAuth = sbAttemptsErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "32", workspaceId: "w1" }),
    } as any);

    // break when attempts empty + signed url error after upload
    const { supabaseClient: sbAttemptsEmpty } = makeSupabase({
      campaign: { id: 33, ...baseCampaign } as any,
      outreachAttemptCount: 1,
      outreachAttempts: [],
      signedUrlBehavior: "error",
    });
    supabaseForAuth = sbAttemptsEmpty;
    await mod.action({
      request: reqForm("http://x", { campaignId: "33", workspaceId: "w1" }),
    } as any);

    // contacts error
    const { supabaseClient: sbContactsErr } = makeSupabase({
      campaign: { id: 34, ...baseCampaign } as any,
      outreachAttemptCount: 1,
      outreachAttempts: [{ id: "a1", contact_id: "c1", campaign_id: 34 }],
      contactsError: "contacts err",
    });
    supabaseForAuth = sbContactsErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "34", workspaceId: "w1" }),
    } as any);

    // calls error
    const { supabaseClient: sbCallsErr } = makeSupabase({
      campaign: { id: 35, ...baseCampaign } as any,
      outreachAttemptCount: 1,
      outreachAttempts: [{ id: "a1", contact_id: "c1", campaign_id: 35 }],
      contacts: [{ id: "c1" }],
      callsError: "calls err",
    });
    supabaseForAuth = sbCallsErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "35", workspaceId: "w1" }),
    } as any);

    // CSV upload error and nested catch logging (error status upload throws)
    const { supabaseClient: sbNested } = makeSupabase({
      campaign: { id: 36, ...baseCampaign } as any,
      outreachAttemptCount: 1,
      outreachAttempts: [],
      uploadBehavior: (path, callIdx) => {
        if (callIdx === 1) return "error"; // initial status error
        if (path.endsWith(".json")) return "throw"; // nested catch path
        return "ok";
      },
    });
    supabaseForAuth = sbNested;
    await mod.action({
      request: reqForm("http://x", { campaignId: "36", workspaceId: "w1" }),
    } as any);

    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalled();
  });

  test("call export covers multi-chunk header branch, missing result, and script fallback branches", async () => {
    vi.useFakeTimers();
    const attempts = Array.from({ length: 101 }, (_v, idx) => ({
      id: `a${idx}`,
      contact_id: `c${idx}`,
      campaign_id: 70,
      result: idx === 0 ? null : "{}",
      created_at: new Date().toISOString(),
    }));

    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 70,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
        status: "active",
      },
      script: {
        steps: {
          pages: {
            pEmpty: { title: "", blocks: undefined },
            pQ: { title: "", blocks: ["bQ"] },
          },
          blocks: {
            bQ: { id: "bQ", type: "question", title: "" },
          },
        },
      },
      outreachAttemptCount: 101,
      outreachAttempts: attempts,
      contacts: [{ id: "c0", phone: "1", opt_out: true, workspace: "w1" }],
      calls: [],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "70", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
  });

  test("call export covers script?.steps fallbacks and default error strings, and Unknown error status on non-Error throws", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api.campaign-export");

    // script pages/blocks fallbacks via null script
    const { supabaseClient: sbNullScript } = makeSupabase({
      campaign: {
        id: 71,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      script: null,
      outreachAttemptCount: 0,
      outreachAttempts: [],
    });
    supabaseForAuth = sbNullScript;
    await mod.action({
      request: reqForm("http://x", { campaignId: "71", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // script error default message: "Error fetching script"
    const { supabaseClient: sbScriptErr } = makeSupabase({
      campaign: {
        id: 72,
        workspace: "w1",
        type: "robocall",
        title: "Robo",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      scriptError: "",
    });
    supabaseForAuth = sbScriptErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "72", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // attempts count default message: "Error counting attempts"
    const { supabaseClient: sbCountErr } = makeSupabase({
      campaign: {
        id: 73,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      outreachAttemptCountError: "",
    });
    supabaseForAuth = sbCountErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "73", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // attempts chunk default message: `Error fetching attempts chunk at offset ${offset}`
    const { supabaseClient: sbAttemptsErr } = makeSupabase({
      campaign: {
        id: 74,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      outreachAttemptCount: 1,
      outreachAttemptsError: "",
    });
    supabaseForAuth = sbAttemptsErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "74", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // contacts/calls default messages
    const { supabaseClient: sbContactsErr } = makeSupabase({
      campaign: {
        id: 75,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      outreachAttemptCount: 1,
      outreachAttempts: [{ id: "a1", contact_id: "c1", campaign_id: 75 }],
      contactsError: "",
    });
    supabaseForAuth = sbContactsErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "75", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    const { supabaseClient: sbCallsErr } = makeSupabase({
      campaign: {
        id: 76,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      outreachAttemptCount: 1,
      outreachAttempts: [{ id: "a1", contact_id: "c1", campaign_id: 76 }],
      contacts: [{ id: "c1" }],
      callsError: "",
    });
    supabaseForAuth = sbCallsErr;
    await mod.action({
      request: reqForm("http://x", { campaignId: "76", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    // non-Error throw -> error status should use "Unknown error"
    const { supabaseClient: sbNonError } = makeSupabase({
      campaign: {
        id: 77,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      uploadBehaviors: ["throwNonError", "ok"],
    });
    supabaseForAuth = sbNonError;
    await mod.action({
      request: reqForm("http://x", { campaignId: "77", workspaceId: "w1" }),
    } as any);
    await vi.runAllTimersAsync();

    const wroteUnknown = (sbNonError.__uploads as any[]).some((u) => {
      if (!String(u.path).endsWith(".json")) return false;
      try {
        const obj = JSON.parse(String(u.body));
        return obj.status === "error" && obj.error === "Unknown error";
      } catch {
        return false;
      }
    });
    expect(wroteUnknown).toBe(true);
  });

  test("call export covers null contacts/calls else branches", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 78,
        workspace: "w1",
        type: "live_call",
        title: "CallCamp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      outreachAttemptCount: 1,
      outreachAttempts: [
        { id: "a1", contact_id: "c1", campaign_id: 78, result: null },
      ],
      contacts: null as any,
      calls: null as any,
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "78", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);
    await vi.runAllTimersAsync();
  });

  test("message export initial status upload error logs and error status upload returns error", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 1,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      // 1st upload returns error, 2nd returns errorStatusError
      uploadBehaviors: ["error", "error"],
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "1", workspace: "w1" }],
      messageCount: 0,
      messages: [],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);

    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
    expect(loggerError).toHaveBeenCalledWith(
      "Error updating error status:",
      expect.anything(),
    );
  });

  test("message export initial status upload error logs and error status upload throws", async () => {
    vi.useFakeTimers();
    const { supabaseClient } = makeSupabase({
      campaign: {
        id: 1,
        workspace: "w1",
        type: "message",
        title: "Camp",
        start_date: new Date("2026-01-01").toISOString(),
        end_date: new Date("2026-01-02").toISOString(),
      },
      // 1st upload returns error, 2nd throws (nested catch)
      uploadBehaviors: ["error", "throw"],
      campaignQueueContactIds: [1],
      contacts: [{ id: 1, phone: "1", workspace: "w1" }],
      messageCount: 0,
      messages: [],
    });
    supabaseForAuth = supabaseClient;

    const mod = await import("../app/routes/api.campaign-export");
    const res = await mod.action({
      request: reqForm("http://x", { campaignId: "1", workspaceId: "w1" }),
    } as any);
    expect(res.status).toBe(200);

    await vi.runAllTimersAsync();
    expect(loggerError).toHaveBeenCalledWith(
      "Export error:",
      expect.anything(),
    );
    expect(loggerError).toHaveBeenCalledWith(
      "Error writing error status:",
      expect.anything(),
    );
  });
});
