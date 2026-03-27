import { beforeEach, describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: loggerMocks,
}));

const twilioValidation = vi.hoisted(() => ({
  validateTwilioWebhookParams: vi.fn(() => true),
}));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: twilioValidation.validateTwilioWebhookParams,
}));

const twilioClientMock = {
  conferences: Object.assign(
    (sid: string) => ({
      update: vi.fn(async () => ({ sid, status: "completed" })),
    }),
    {
      list: vi.fn(async () => [] as Array<{ sid: string }>),
    },
  ),
};

vi.mock("../app/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("../app/lib/database.server")>(
    "../app/lib/database.server",
  );
  return {
    ...actual,
    createWorkspaceTwilioInstance: vi.fn(async () => twilioClientMock as any),
  };
});

type TransactionRow = {
  id: number;
  workspace: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  note: string;
  idempotency_key?: string;
  created_at: string;
};

function makeSupabaseStub(args?: { outreachDisposition?: string }) {
  let nextId = 1;
  const transactionRows: TransactionRow[] = [];
  const outreachUpdateCalls: any[] = [];
  const campaignQueueEqCalls: Array<[string, unknown]> = [];
  let lastCallSid: string = "CA1";

  const callSelectError: Error | null = (args as any)?.callSelectError ?? null;
  const callUpdateError: Error | null = (args as any)?.callUpdateError ?? null;
  const workspaceAuthToken: string | null | undefined = (args as any)?.workspaceAuthToken;
  const outreachUpdateError: Error | null = (args as any)?.outreachUpdateError ?? null;
  const outreachUpdateThrows: unknown = (args as any)?.outreachUpdateThrows ?? null;
  const campaignQueueUpdateError: Error | null = (args as any)?.campaignQueueUpdateError ?? null;
  const rpcDequeueError: Error | null = (args as any)?.rpcDequeueError ?? null;
  const outreachFetchError: Error | null = (args as any)?.outreachFetchError ?? null;

  const dbCallRow =
    (args as any)?.dbCall ?? ({
      sid: "CA1",
      workspace: "w1",
      outreach_attempt_id: "oa1",
      conference_id: "conf1",
      contact_id: "c1",
      campaign_id: 1,
    } as any);

  const from = (table: string) => {
    if (table === "call") {
      return {
        select: () => ({
          eq: (_col: string, sid: string) => {
            lastCallSid = String(sid);
            return {
              single: async () => ({
                data: callSelectError ? null : { ...dbCallRow, sid: lastCallSid },
                error: callSelectError,
              }),
            };
          },
        }),
        update: (_patch: any) => ({
          eq: (_col: string, sid: string) => {
            lastCallSid = String(sid);
            return {
              select: () => ({
                single: async () => ({
                  data: callUpdateError ? null : { ...dbCallRow, sid: lastCallSid },
                  error: callUpdateError,
                }),
              }),
            };
          },
        }),
      };
    }

    if (table === "workspace") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                workspaceAuthToken === null
                  ? ({} as any)
                  : { twilio_data: { authToken: workspaceAuthToken ?? "twilio-token" } },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "outreach_attempt") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                disposition: args?.outreachDisposition ?? "in-progress",
                contact_id: "c1",
              },
              error: outreachFetchError,
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                if (outreachUpdateThrows != null) throw outreachUpdateThrows;
                if (outreachUpdateError) return { data: null, error: outreachUpdateError };
                outreachUpdateCalls.push(patch);
                return { data: { ...patch, contact_id: "c1" }, error: null };
              },
            }),
          }),
        }),
      };
    }

    if (table === "campaign_queue") {
      const builder: any = {
        eq: (col: string, val: unknown) => {
          campaignQueueEqCalls.push([col, val]);
          return builder;
        },
        select: async () => ({ data: [], error: campaignQueueUpdateError }),
      };
      return {
        update: () => builder,
      };
    }

    if (table === "transaction_history") {
      const builder: any = {};
      builder.insert = (row: any) => ({
        select: () => ({
          single: async () => {
            const dup = transactionRows.some(
              (r) =>
                r.workspace === row.workspace &&
                r.type === row.type &&
                r.idempotency_key === row.idempotency_key,
            );
            if (dup) {
              return { data: null, error: { code: "23505" } };
            }
            const created: TransactionRow = {
              id: nextId++,
              workspace: row.workspace,
              type: row.type,
              amount: row.amount,
              note: row.note,
              idempotency_key: row.idempotency_key,
              created_at: new Date().toISOString(),
            };
            transactionRows.push(created);
            return { data: { id: created.id }, error: null };
          },
        }),
      });
      builder.select = () => {
        const filters: Record<string, string> = {};
        const chain: any = {};
        chain.eq = (col: string, val: any) => {
          filters[col] = String(val);
          return chain;
        };
        chain.like = (_col: string, pattern: string) => {
          filters.likeNote = pattern.replace(/^%/, "").replace(/%$/, "");
          return chain;
        };
        chain.order = () => chain;
        chain.limit = () => ({
          maybeSingle: async () => {
            let matches = transactionRows.filter((r) => {
              if (filters.workspace && r.workspace !== filters.workspace) return false;
              if (filters.type && r.type !== filters.type) return false;
              if (filters.idempotency_key && r.idempotency_key !== filters.idempotency_key)
                return false;
              if (filters.likeNote && !r.note.includes(filters.likeNote)) return false;
              return true;
            });
            matches = [...matches].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            const hit = matches[matches.length - 1];
            return { data: hit ? { id: hit.id } : null, error: null };
          },
        });
        return chain;
      };
      return builder;
    }

    throw new Error(`unexpected table ${table}`);
  };

  return {
    from,
    realtime: { channel: () => ({ send: vi.fn() }) },
    rpc: vi.fn(async () => ({ data: null, error: rpcDequeueError })),
    channel: () => ({ send: vi.fn() }),
    removeChannel: vi.fn(),
    _transactionRows: transactionRows,
    _outreachUpdateCalls: outreachUpdateCalls,
    _campaignQueueEqCalls: campaignQueueEqCalls,
  };
}

let supabaseStub: ReturnType<typeof makeSupabaseStub>;
const supabaseState = vi.hoisted(() => ({ supabase: null as any }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => supabaseState.supabase,
}));

describe("api.auto-dial.status", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseStub = makeSupabaseStub();
    supabaseState.supabase = supabaseStub as any;
    twilioValidation.validateTwilioWebhookParams.mockReset();
    twilioValidation.validateTwilioWebhookParams.mockReturnValue(true);
    twilioClientMock.conferences.list.mockReset();
    twilioClientMock.conferences.list.mockResolvedValue([]);
    loggerMocks.error.mockReset();
    loggerMocks.debug.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
  });

  test("rejects invalid Twilio signature", async () => {
    twilioValidation.validateTwilioWebhookParams.mockReturnValueOnce(false);
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");
    fd.set("CallDuration", "61");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "bad" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(403);
  });

  test("bills idempotently for completed calls (same CallSid)", async () => {
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const makeReq = () => {
      const fd = new FormData();
      fd.set("CallSid", "CA_DUP");
      fd.set("CallStatus", "completed");
      fd.set("Timestamp", new Date().toISOString());
      fd.set("Duration", "61");
      fd.set("CallDuration", "61");
      fd.set("ConferenceSid", "conf1");
      return new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      });
    };

    const r1 = await mod.action({ request: makeReq() } as any);
    expect(r1.status).toBe(200);
    const r2 = await mod.action({ request: makeReq() } as any);
    expect(r2.status).toBe(200);

    expect(supabaseStub._transactionRows.length).toBeGreaterThan(0);
    const matching = supabaseStub._transactionRows.filter(
      (r) => r.idempotency_key === "call:CA_DUP",
    );
    expect(matching.length).toBe(1);
  });

  test("does not overwrite terminal disposition (completed -> busy)", async () => {
    supabaseStub = makeSupabaseStub({ outreachDisposition: "completed" });
    supabaseState.supabase = supabaseStub as any;
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "10");
    fd.set("CallDuration", "10");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);

    expect(res.status).toBe(200);
    expect(supabaseStub._outreachUpdateCalls.length).toBe(0);
    expect(supabaseStub.rpc).toHaveBeenCalledWith("dequeue_contact", expect.objectContaining({
      passed_contact_id: "c1",
    }));
  });

  test("returns 500 when call lookup fails", async () => {
    supabaseStub = makeSupabaseStub({ callSelectError: new Error("no call") } as any);
    supabaseState.supabase = supabaseStub as any;

    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
  });

  test("uses env TWILIO_AUTH_TOKEN when workspace has no twilio_data", async () => {
    supabaseStub = makeSupabaseStub({ workspaceAuthToken: null } as any);
    supabaseState.supabase = supabaseStub as any;
    twilioValidation.validateTwilioWebhookParams.mockImplementation(
      (_params: any, _sig: any, _url: any, authToken: string) => {
        expect(authToken).toBe("test");
        return true;
      },
    );

    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("participant-join updates conference_id/start_time and updates queue + outreach attempt", async () => {
    supabaseStub = makeSupabaseStub({
      dbCall: {
        sid: "CA1",
        workspace: "w1",
        outreach_attempt_id: "oa1",
        conference_id: null,
        contact_id: "c1",
        campaign_id: 1,
      },
    } as any);
    supabaseState.supabase = supabaseStub as any;

    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-join");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    fd.set("FriendlyName", "in-progress");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(supabaseStub._outreachUpdateCalls.length).toBeGreaterThan(0);
    expect(supabaseStub._campaignQueueEqCalls).toContainEqual(["contact_id", "c1"]);
    expect(supabaseStub._campaignQueueEqCalls).toContainEqual(["campaign_id", 1]);
  });

  test("participant-leave completes conferences and sets completed status", async () => {
    twilioClientMock.conferences.list.mockResolvedValueOnce([{ sid: "CONF_A" }, { sid: "CONF_B" }]);
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-leave");
    fd.set("ReasonParticipantLeft", "participant_hung_up");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "2");
    fd.set("FriendlyName", "conf1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("call status busy triggers dialer when conferences exist and status not completed", async () => {
    twilioClientMock.conferences.list.mockResolvedValueOnce([{ sid: "CONF1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 200 })));
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA_BUSY");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("triggerAutoDialer error bubbles to 500 when fetch not ok", async () => {
    twilioClientMock.conferences.list.mockResolvedValueOnce([{ sid: "CONF1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 })));
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA_BUSY");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
  });

  test("updateOutreachAttempt catch path returns Response (still returns success)", async () => {
    supabaseStub = makeSupabaseStub({
      outreachFetchError: new Error("fetch"),
      outreachUpdateError: new Error("oa"),
    } as any);
    supabaseState.supabase = supabaseStub as any;

    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Error updating outreach attempt:",
      expect.any(Error),
    );
  });

  test("updateOutreachAttempt works without disposition (covers else path)", async () => {
    const ops = await import("../app/lib/api-auto-dial-status.server");
    const res = await ops.updateOutreachAttempt("oa1", {
      answered_at: new Date().toISOString(),
    } as any);
    expect(res).toMatchObject({ answered_at: expect.any(String) });
    expect(supabaseStub._outreachUpdateCalls.length).toBeGreaterThan(0);
  });

  test("updateOutreachAttempt catch formats non-Error as Unknown error", async () => {
    supabaseStub = makeSupabaseStub({ outreachUpdateThrows: "nope" } as any);
    supabaseState.supabase = supabaseStub as any;
    const ops = await import("../app/lib/api-auto-dial-status.server");
    const res = (await ops.updateOutreachAttempt("oa1", {
      answered_at: new Date().toISOString(),
    } as any)) as any;
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toContain("Unknown error");
  });

  test("updateCall error path returns 500", async () => {
    supabaseStub = makeSupabaseStub({ callUpdateError: new Error("up") } as any);
    supabaseState.supabase = supabaseStub as any;
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
    expect(loggerMocks.error).toHaveBeenCalledWith("Error updating call:", expect.any(Error));
  });

  test("rpc dequeue_contact error returns 500", async () => {
    supabaseStub = makeSupabaseStub({ rpcDequeueError: new Error("dq") } as any);
    supabaseState.supabase = supabaseStub as any;
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
    expect(loggerMocks.error).toHaveBeenCalledWith("Error dequeing contact", expect.any(Error));
  });

  test("participant-leave outreach fetch error returns 500", async () => {
    supabaseStub = makeSupabaseStub({ outreachFetchError: new Error("out") } as any);
    supabaseState.supabase = supabaseStub as any;
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-leave");
    fd.set("ReasonParticipantLeft", "participant_hung_up");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "2");
    fd.set("FriendlyName", "conf1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
  });

  test("participant-leave catch branch returns 500 when conferences.list throws", async () => {
    twilioClientMock.conferences.list.mockRejectedValueOnce(new Error("list"));
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-leave");
    fd.set("ReasonParticipantLeft", "participant_hung_up");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "2");
    fd.set("FriendlyName", "conf1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Error in handleParticipantLeave:",
      expect.any(Error),
    );
  });

  test("participant-join does nothing when conference_id exists and no outreach_attempt_id", async () => {
    supabaseStub = makeSupabaseStub({
      dbCall: {
        sid: "CA1",
        workspace: "w1",
        outreach_attempt_id: null,
        conference_id: "conf1",
        contact_id: "c1",
        campaign_id: 1,
      },
    } as any);
    supabaseState.supabase = supabaseStub as any;
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-join");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    fd.set("FriendlyName", "in-progress");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("CallStatus failed is handled", async () => {
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "failed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("default branch does nothing when callback event not recognized", async () => {
    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "other");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("action catch formats non-Error as Unknown error", async () => {
    const dbMod = await import("../app/lib/database.server");
    (dbMod.createWorkspaceTwilioInstance as any).mockRejectedValueOnce("nope");

    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("Unknown error") });
  });

  test("participant-join campaign_queue update error hits updateCampaignQueue + join catch branches", async () => {
    supabaseStub = makeSupabaseStub({ campaignQueueUpdateError: new Error("cq") } as any);
    supabaseState.supabase = supabaseStub as any;

    const mod = await import("../app/routing/api/api.auto-dial.status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-join");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    fd.set("FriendlyName", "in-progress");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(500);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Error updating campaign queue:",
      expect.any(Error),
    );
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Error in handleParticipantJoin:",
      expect.any(Error),
    );
  });
});

