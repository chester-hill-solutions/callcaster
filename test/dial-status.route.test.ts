import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { configureTelephonyStub } from "./helpers/telephony-db-stub";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    validateTwilioWebhookParams: vi.fn(() => true),
    validateTwilioWebhookForCallSid: vi.fn(),
    fetchCampaignByIdForWorkspace: vi.fn(async () => ({ voicemail_file: "vm.mp3" })),
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "test",
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForCallSid: (...args: unknown[]) =>
    mocks.validateTwilioWebhookForCallSid(...args),
}));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: any[]) => mocks.validateTwilioWebhookParams(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

vi.mock("@/lib/campaign-ivr.server", () => ({
  fetchCampaignByIdForWorkspace: (...args: unknown[]) =>
    mocks.fetchCampaignByIdForWorkspace(...args),
}));

vi.mock("@/lib/telephony-db.server", async () => {
  const stub = await import("./helpers/telephony-db-stub");
  return {
    findCallBySid: stub.telephonyDbMocks.findCallBySid,
    findCallsByConferenceId: stub.telephonyDbMocks.findCallsByConferenceId,
    updateCallBySid: stub.telephonyDbMocks.updateCallBySid,
    findOutreachAttemptById: stub.telephonyDbMocks.findOutreachAttemptById,
    updateOutreachAttemptForWorkspace: stub.telephonyDbMocks.updateOutreachAttemptForWorkspace,
    insertCallForWorkspace: stub.telephonyDbMocks.insertCallForWorkspace,
  };
});

function makeSupabase() {
  let callRow: any = { campaign_id: 1, outreach_attempt_id: 10, workspace: "w1" };
  let callError: any = null;
  let workspaceRow: any = { twilio_data: { sid: "AC_test", authToken: "tok" } };
  let campaignRow: any = { voicemail_file: "vm.mp3" };
  let campaignError: any = null;
  let signedUrl: string | null = "https://signed";
  let voicemailError: any = null;
  let outreachUpdateError: any = null;
  let callUpsertError: any = null;
  let attemptUpdateError: any = null;
  let outreachUpdateThrows: unknown = null;

  const callUpdate = vi.fn(async (_patch: any) => ({}));

  const syncTelephony = () => {
    configureTelephonyStub({
      callRow,
      callSelectError: callError,
      callUpdateError: callUpsertError,
      outreachUpdateError: outreachUpdateError ?? attemptUpdateError,
      outreachUpdateThrows,
    });
  };

  const syncCampaign = () => {
    if (campaignError) {
      mocks.fetchCampaignByIdForWorkspace.mockImplementation(async () => {
        throw campaignError;
      });
      return;
    }
    if (campaignRow === null) {
      mocks.fetchCampaignByIdForWorkspace.mockImplementation(async () => {
        throw new Error("Campaign 1 not found");
      });
      return;
    }
    mocks.fetchCampaignByIdForWorkspace.mockImplementation(async () => campaignRow);
  };

  syncTelephony();
  syncCampaign();

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
      callRow: (r: any) => {
        callRow = r;
        syncTelephony();
      },
      callError: (e: any) => {
        callError = e;
        syncTelephony();
      },
      workspaceRow: (r: any) => (workspaceRow = r),
      campaignRow: (r: any) => {
        campaignRow = r;
        syncCampaign();
      },
      campaignError: (e: any) => {
        campaignError = e;
        syncCampaign();
      },
      signedUrl: (s: string | null) => (signedUrl = s),
      voicemailError: (e: any) => (voicemailError = e),
      outreachUpdateError: (e: any) => {
        outreachUpdateError = e;
        syncTelephony();
      },
      callUpsertError: (e: any) => {
        callUpsertError = e;
        syncTelephony();
      },
      attemptUpdateError: (e: any) => {
        attemptUpdateError = e;
        syncTelephony();
      },
      outreachUpdateThrows: (e: unknown) => {
        outreachUpdateThrows = e;
        syncTelephony();
      },
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

describe("app/routes/api+/dial/status.route.tsx", () => {
  beforeEach(() => {
    configureTelephonyStub();
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.validateTwilioWebhookForCallSid.mockReset();
    mocks.fetchCampaignByIdForWorkspace.mockReset();
    mocks.fetchCampaignByIdForWorkspace.mockResolvedValue({ voicemail_file: "vm.mp3" });
    mocks.validateTwilioWebhookForCallSid.mockImplementation(
      async (args: { params?: Record<string, string> }) => ({
        ok: true,
        params: args.params ?? {},
        authToken: "tok",
      }),
    );
  });

  test("validates CallSid", async () => {
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const mod = await import("../app/routes/api+/dial/status.route");
    const res = await asRouteResponse(await mod.action({ request: makeReq({}) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  test("callStatus missing covers null branch; callError/campaignError/voicemailError bubble to outer catch (Error message)", async () => {
    const { supabase, twilio } = makeSupabase();
    supabase._set.callError(new Error("call"));
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routes/api+/dial/status.route");
    let res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human" }), // omit CallStatus => null
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "call" });

    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.campaignError(new Error("camp"));
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "camp" });

    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.voicemailError(new Error("vm"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "vm" });
  });

  test("returns 403 on invalid signature", async () => {
    mocks.validateTwilioWebhookForCallSid.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const mod = await import("../app/routes/api+/dial/status.route");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any));
    expect(res.status).toBe(403);
  });

  test("handles call not found and workspace auth missing", async () => {
    const { supabase, twilio } = makeSupabase();
    supabase._set.callRow(null);
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routes/api+/dial/status.route");
    let res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ error: "Call not found" });

    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.workspaceRow({});
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    mocks.validateTwilioWebhookParams.mockImplementationOnce((_p, _s, _u, tok) => {
      expect(tok).toBe("test");
      return true;
    });
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test("machine answer plays voicemail or hangs up; machine handler catch formats errors", async () => {
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routes/api+/dial/status.route");

    // voicemail present
    let res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(supabase._callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Play>https://signed</Play>") }),
    );

    // voicemail missing signedUrl => hangup + no-answer
    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.signedUrl(null);
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(sup2._callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Hangup/>") }),
    );

    // handler catch: outreach update errors -> returns success:false with message
    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.outreachUpdateError(new Error("upd"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Error updating outreach attempt: upd" });

    // handler catch: non-Error thrown -> "Failed to handle voicemail"
    const { supabase: sup4, twilio: tw4 } = makeSupabase();
    sup4._set.outreachUpdateThrows("nope");
    mocks.createClient.mockReturnValueOnce(sup4);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw4 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Error updating outreach attempt: Unknown error" });
  });

  test("human/other path upserts call, updates attempt, and outer catch formats non-Error", async () => {
    const { supabase, twilio } = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    const mod = await import("../app/routes/api+/dial/status.route");

    let res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, attempt: expect.any(Object) });

    // callUpsertError / attemptError -> outer catch Error message
    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.callUpsertError(new Error("up"));
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "up" });

    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.attemptUpdateError(new Error("att"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Error updating outreach attempt: att" });

    // throw non-Error from createWorkspaceTwilioInstance triggers outer catch "An unexpected error occurred"
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockRejectedValueOnce("nope");
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "An unexpected error occurred" });
  });

  test("covers campaign not found + no voicemail_file path + outreachError throw in voicemail-present path", async () => {
    const mod = await import("../app/routes/api+/dial/status.route");

    // campaign not found
    const { supabase, twilio } = makeSupabase();
    supabase._set.callRow({ campaign_id: 1, outreach_attempt_id: 10, workspace: "w1" });
    supabase._set.campaignRow(null);
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);
    let res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "human", CallStatus: "completed" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Campaign 1 not found" });

    // voicemail_file falsy => ternary else branch and machine no-answer hangup path
    const { supabase: sup2, twilio: tw2 } = makeSupabase();
    sup2._set.campaignRow({ voicemail_file: null });
    mocks.createClient.mockReturnValueOnce(sup2);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw2 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });

    // voicemail present but outreach update returns error => hits `if (outreachError) throw outreachError`
    const { supabase: sup3, twilio: tw3 } = makeSupabase();
    sup3._set.outreachUpdateError(new Error("outreach"));
    mocks.createClient.mockReturnValueOnce(sup3);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw3 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Error updating outreach attempt: outreach" });

    // no signedUrl branch: outreach update returns error => hits the other `if (outreachError) throw outreachError`
    const { supabase: sup4, twilio: tw4 } = makeSupabase();
    sup4._set.signedUrl(null);
    sup4._set.outreachUpdateError(new Error("no-answer-update"));
    mocks.createClient.mockReturnValueOnce(sup4);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(tw4 as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", AnsweredBy: "machine_start", CallStatus: "ringing" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Error updating outreach attempt: no-answer-update" });
  });
});

