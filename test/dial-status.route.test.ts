import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    validateTwilioWebhookParams: vi.fn(() => true),
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: any[]) => mocks.validateTwilioWebhookParams(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

function makeSupabase() {
  let callRow: any = { campaign_id: 1, outreach_attempt_id: 10, workspace: "w1" };
  let callError: any = null;
  let workspaceRow: any = { twilio_data: { authToken: "tok" } };
  let campaignRow: any = { voicemail_file: "vm.mp3" };
  let campaignError: any = null;
  let signedUrl: string | null = "https://signed";
  let voicemailError: any = null;
  let outreachUpdateError: any = null;
  let callUpsertError: any = null;
  let attemptUpdateError: any = null;
  let outreachUpdateThrows: unknown = null;

  const callUpdate = vi.fn(async (_patch: any) => ({}));

  const supabase: any = {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: signedUrl ? { signedUrl } : null,
          error: voicemailError,
        }),
      }),
    },
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: callRow, error: callError }),
            }),
          }),
          upsert: () => ({
            select: async () => ({ data: [{ sid: "CA1" }], error: callUpsertError }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: workspaceRow, error: null }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: campaignRow, error: campaignError }),
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => {
                if (outreachUpdateThrows != null) throw outreachUpdateThrows;
                return { data: [{ ok: 1 }], error: attemptUpdateError ?? outreachUpdateError };
              },
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
    _set: {
      callRow: (r: any) => (callRow = r),
      callError: (e: any) => (callError = e),
      workspaceRow: (r: any) => (workspaceRow = r),
      campaignRow: (r: any) => (campaignRow = r),
      campaignError: (e: any) => (campaignError = e),
      signedUrl: (s: string | null) => (signedUrl = s),
      voicemailError: (e: any) => (voicemailError = e),
      outreachUpdateError: (e: any) => (outreachUpdateError = e),
      callUpsertError: (e: any) => (callUpsertError = e),
      attemptUpdateError: (e: any) => (attemptUpdateError = e),
      outreachUpdateThrows: (e: unknown) => (outreachUpdateThrows = e),
    },
    _callUpdate: callUpdate,
  };

  const twilio = {
    calls: (_sid: string) => ({ update: callUpdate }),
  };

  return { supabase, twilio };
}

function makeReq(fields: Record<string, any>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    fd.set(k, v);
  }
  return new Request("http://localhost/api/dial/status", {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body: fd,
  });
}

describe("app/routes/api.dial.status.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
  });

  test("validates CallSid", async () => {
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const mod = await import("../app/routing/api/api.dial.status");
    const res = await mod.action({ request: makeReq({}) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  test("callStatus missing covers null branch; callError/campaignError/voicemailError bubble to outer catch (Error message)", async () => {
    const { supabase, twilio } = makeSupabase();
    supabase._set.callError(new Error("call"));
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routing/api/api.dial.status");
    let res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human" }), // omit CallStatus => null
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "call" });

    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.campaignError(new Error("camp"));
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "camp" });

    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.voicemailError(new Error("vm"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "vm" });
  });

  test("returns 403 on invalid signature", async () => {
    mocks.validateTwilioWebhookParams.mockReturnValueOnce(false);
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const mod = await import("../app/routing/api/api.dial.status");
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any);
    expect(res.status).toBe(403);
  });

  test("handles call not found and workspace auth missing", async () => {
    const { supabase, twilio } = makeSupabase();
    supabase._set.callRow(null);
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routing/api/api.dial.status");
    let res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any);
    await expect(res.json()).resolves.toMatchObject({ error: "Call not found" });

    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.workspaceRow({});
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Workspace auth not found" });
  });

  test("machine answer plays voicemail or hangs up; machine handler catch formats errors", async () => {
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routing/api/api.dial.status");

    // voicemail present
    let res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(supabase._callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Play>https://signed</Play>") }),
    );

    // voicemail missing signedUrl => hangup + no-answer
    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.signedUrl(null);
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(sup2._callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: "<Response><Hangup/></Response>" }),
    );

    // handler catch: outreach update errors -> returns success:false with message
    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.outreachUpdateError(new Error("upd"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "upd" });

    // handler catch: non-Error thrown -> "Failed to handle voicemail"
    const { supabase: sup4, twilio: tw4 } = makeSupabase();
    sup4._set.outreachUpdateThrows("nope");
    mocks.createClient.mockReturnValueOnce(sup4);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw4 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Failed to handle voicemail" });
  });

  test("human/other path upserts call, updates attempt, and outer catch formats non-Error", async () => {
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routing/api/api.dial.status");

    let res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, data: expect.any(Array), attempt: expect.any(Array) });

    // callUpsertError / attemptError -> outer catch Error message
    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.callUpsertError(new Error("up"));
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "up" });

    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.attemptUpdateError(new Error("att"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "att" });

    // throw non-Error from createWorkspaceTwilioInstance triggers outer catch "An unexpected error occurred"
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockRejectedValueOnce("nope");
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "An unexpected error occurred" });
  });

  test("covers campaign not found + no voicemail_file path + outreachError throw in voicemail-present path", async () => {
    const mod = await import("../app/routing/api/api.dial.status");

    // campaign not found
    const { supabase, twilio } = makeSupabase();
    supabase._set.campaignRow(null);
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    let res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Campaign not found" });

    // voicemail_file falsy => ternary else branch and machine no-answer hangup path
    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.campaignRow({ voicemail_file: null });
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });

    // voicemail present but outreach update returns error => hits `if (outreachError) throw outreachError`
    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.outreachUpdateError(new Error("outreach"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "outreach" });

    // no signedUrl branch: outreach update returns error => hits the other `if (outreachError) throw outreachError`
    const { supabase: sup4, twilio: tw4 } = makeSupabase();
    sup4._set.signedUrl(null);
    sup4._set.outreachUpdateError(new Error("no-answer-update"));
    mocks.createClient.mockReturnValueOnce(sup4);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw4 as any);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "no-answer-update" });
  });
});

