import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    validateTwilioWebhookParams: vi.fn(() => true),
    insertTransactionHistoryIdempotent: vi.fn(async () => null),
    logger: { error: vi.fn(), debug: vi.fn() },
    createClient: vi.fn(),
    supabase: null as any,
  };
});

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: any[]) => mocks.validateTwilioWebhookParams(...args),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: any[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));

function makeSupabase() {
  let existingWorkspace: string | null = "w1";
  let wsAuthToken: string | null = "ws-token";
  let upsertError: Error | null = null;
  let upsertRow: any = {
    sid: "CA1",
    outreach_attempt_id: 10,
    workspace: "w1",
    parent_call_sid: null,
  };
  let parentCall: any = { workspace: "w_parent", outreach_attempt_id: 99 };
  let attemptFetchError: Error | null = null;
  let currentAttempt: any = { disposition: "in-progress", contact_id: 123, workspace: "w1" };
  let attemptUpdateError: Error | null = null;

  const realtimeSend = vi.fn();
  const realtimeChannel = vi.fn((_id: string) => ({ send: realtimeSend }));

  const supabase: any = {
    realtime: { channel: realtimeChannel },
    from: (table: string) => {
      if (table === "call") {
        return {
          select: (cols?: string) => ({
            eq: (_col: string, _val: any) => ({
              single: async () => {
                if (cols === "workspace") {
                  return {
                    data: existingWorkspace ? { workspace: existingWorkspace } : null,
                    error: null,
                  };
                }
                if (cols === "workspace, outreach_attempt_id") {
                  return { data: parentCall, error: null };
                }
                // full select() in other places not used here
                return { data: upsertRow, error: null };
              },
            }),
          }),
          upsert: () => ({
            select: async () => ({ data: upsertError ? null : [upsertRow], error: upsertError }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: wsAuthToken ? { twilio_data: { authToken: wsAuthToken } } : {},
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
                data: currentAttempt,
                error: attemptFetchError,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: async () => ({ data: [], error: attemptUpdateError }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _set: {
      existingWorkspace: (v: string | null) => (existingWorkspace = v),
      wsAuthToken: (v: string | null) => (wsAuthToken = v),
      upsertError: (e: Error | null) => (upsertError = e),
      upsertRow: (r: any) => (upsertRow = r),
      parentCall: (r: any) => (parentCall = r),
      attemptFetchError: (e: Error | null) => (attemptFetchError = e),
      currentAttempt: (r: any) => (currentAttempt = r),
      attemptUpdateError: (e: Error | null) => (attemptUpdateError = e),
    },
    _realtimeSend: realtimeSend,
    _realtimeChannel: realtimeChannel,
  };

  return supabase;
}

function makeReq(params: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(params)) fd.set(k, v);
  return new Request("http://localhost/api/call-status", {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body: fd,
  });
}

describe("app/routes/api.call-status.tsx", () => {
  let supabase: any;

  beforeEach(() => {
    vi.resetModules();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.insertTransactionHistoryIdempotent.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.debug.mockReset();
    mocks.createClient.mockReset();

    supabase = makeSupabase();
    mocks.supabase = supabase;
    mocks.createClient.mockReturnValue(supabase);
  });

  test("rejects invalid Twilio signature", async () => {
    mocks.validateTwilioWebhookParams.mockReturnValueOnce(false);
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any);
    expect(res.status).toBe(403);
  });

  test("returns 500 when call upsert fails", async () => {
    supabase._set.upsertError(new Error("upsert"));
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error updating call:",
      expect.any(Error),
    );
  });

  test("uses workspace authToken when present", async () => {
    mocks.validateTwilioWebhookParams.mockImplementation((_p: any, _s: any, _u: any, tok: string) => {
      expect(tok).toBe("ws-token");
      return true;
    });
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("falls back to parent call workspace/outreach attempt and handles fetch error", async () => {
    supabase._set.upsertRow({
      sid: "CA_CHILD",
      outreach_attempt_id: null,
      workspace: null,
      parent_call_sid: "CA_PARENT",
    });
    supabase._set.parentCall({ workspace: "w_parent", outreach_attempt_id: 77 });
    supabase._set.attemptFetchError(new Error("fetch"));

    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA_CHILD", CallStatus: "completed" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Failed to fetch current attempt" });
  });

  test("skips realtime.send when no currentAttempt and still bills with workspaceId", async () => {
    supabase._set.currentAttempt(null);
    supabase._set.upsertRow({
      sid: "CA1",
      outreach_attempt_id: null,
      workspace: "w1",
      parent_call_sid: null,
    });

    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Duration: "61", CallDuration: "61" }),
    } as any);
    expect(res.status).toBe(200);
    expect(supabase._realtimeSend).not.toHaveBeenCalled();
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        type: "DEBIT",
      }),
    );
  });

  test("updates disposition when transition allowed; returns 500 on updateError", async () => {
    supabase._set.attemptUpdateError(new Error("upd"));
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "busy" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Failed to update attempt" });
  });

  test("does not bill when billingWorkspace missing; covers called_via default channel id", async () => {
    supabase._set.currentAttempt({ disposition: "in-progress", contact_id: 1, workspace: null });
    supabase._set.upsertRow({ sid: "CA1", outreach_attempt_id: 10, workspace: undefined, parent_call_sid: null });

    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({
        call_sid: "CA1",
        call_status: "completed",
        called_via: "",
        duration: "0",
        call_duration: "0",
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("covers existingCall workspace missing (uses env authToken)", async () => {
    supabase._set.existingWorkspace(null);
    mocks.validateTwilioWebhookParams.mockImplementation((_p: any, _s: any, _u: any, tok: string) => {
      expect(tok).toBe("test");
      return true;
    });
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing" }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("covers workspace twilio token missing + calledVia split userId", async () => {
    supabase._set.wsAuthToken(null);
    mocks.validateTwilioWebhookParams.mockImplementation((_p: any, _s: any, _u: any, tok: string) => {
      expect(tok).toBe("test"); // fallback token
      return true;
    });

    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", CalledVia: "client:u1" }),
    } as any);
    expect(res.status).toBe(200);
    expect(supabase._realtimeChannel).toHaveBeenCalledWith("u1");
  });

  test("covers lowercase sid/status fallbacks and getString non-string via File", async () => {
    const mod = await import("../app/routes/api.call-status");

    const fd = new FormData();
    fd.set("call_sid", "CA_FALLBACK");
    fd.set("status", "completed"); // no CallStatus/call_status -> status fallback
    fd.set("price", new File(["1.23"], "p.txt", { type: "text/plain" }) as any);
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");
    fd.set("CallDuration", "61");
    fd.set("called_via", "client:u2");

    const res = await mod.action({
      request: new Request("http://localhost/api/call-status", {
        method: "POST",
        headers: { "x-twilio-signature": "sig" },
        body: fd,
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("covers disposition transition denied (logs debug)", async () => {
    supabase._set.upsertRow({
      sid: "CA1",
      outreach_attempt_id: 10,
      workspace: undefined,
      parent_call_sid: null,
    });
    supabase._set.currentAttempt({ disposition: "completed", contact_id: 1, workspace: null });

    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "busy", CalledVia: "client:u3" }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.logger.debug).toHaveBeenCalledWith(
      "Skipping outreach disposition transition",
      expect.any(Object),
    );
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("covers parentCall null fields -> workspace/outreachAttempt become undefined", async () => {
    supabase._set.upsertRow({
      sid: "CA_CHILD",
      outreach_attempt_id: null,
      workspace: null,
      parent_call_sid: "CA_PARENT",
    });
    supabase._set.parentCall({ workspace: null, outreach_attempt_id: null });
    supabase._set.currentAttempt(null);
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA_CHILD", CallStatus: "ringing" }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("covers parentCall missing (if parentCall false path)", async () => {
    supabase._set.upsertRow({
      sid: "CA_CHILD",
      outreach_attempt_id: null,
      workspace: null,
      parent_call_sid: "CA_PARENT",
    });
    supabase._set.parentCall(null);
    supabase._set.currentAttempt(null);
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA_CHILD", CallStatus: "ringing" }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("covers currentDisposition null when currentAttempt missing", async () => {
    supabase._set.currentAttempt(null);
    supabase._set.upsertRow({
      sid: "CA1",
      outreach_attempt_id: 10,
      workspace: "w1",
      parent_call_sid: null,
    });
    const mod = await import("../app/routes/api.call-status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "busy" }),
    } as any);
    expect(res.status).toBe(200);
  });
});

