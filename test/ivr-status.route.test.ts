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
    logger: { error: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...a: any[]) => mocks.createWorkspaceTwilioInstance(...a),
}));
vi.mock("@/twilio.server", () => ({ validateTwilioWebhookParams: (...a: any[]) => mocks.validateTwilioWebhookParams(...a) }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeReq(fields: Record<string, any>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/ivr/status", {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body: fd,
  });
}

function makeSupabase(opts?: {
  callRow?: any;
  callError?: any;
  workspaceAuthToken?: string | null;
  updateCallError?: any;
  updateOutreachError?: any;
  voicemailSignedUrl?: string | null;
  voicemailSignedUrlError?: any;
}) {
  const updates: any = { call: vi.fn(), outreach: vi.fn(), callInsert: vi.fn() };
  const supabase: any = {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: opts?.voicemailSignedUrl ? { signedUrl: opts.voicemailSignedUrl } : null,
          error: opts?.voicemailSignedUrlError ?? null,
        }),
      }),
    },
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts?.callRow ?? null, error: opts?.callError ?? null }),
            }),
          }),
          update: () => ({
            eq: async () => ({ data: [], error: opts?.updateCallError ?? null }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { twilio_data: opts?.workspaceAuthToken ? { authToken: opts.workspaceAuthToken } : null }, error: null }),
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: async () => ({ data: [], error: opts?.updateOutreachError ?? null }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
    rpc: async () => ({ data: null, error: null }),
    _updates: updates,
  };
  return supabase;
}

describe("app/routes/api.ivr.status.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.logger.error.mockReset();
  });

  test("returns 403 on invalid signature", async () => {
    mocks.validateTwilioWebhookParams.mockReturnValueOnce(false);
    const supabase = makeSupabase({
      callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { voicemail_file: "v.mp3", ivr_campaign: { script: { steps: { pages: {} } } } } },
      workspaceAuthToken: "tok",
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const mod = await import("../app/routing/api/api.ivr.status");
    const res = await mod.action({ request: makeReq({ CallSid: "CA1" }) } as any);
    expect(res.status).toBe(403);
  });

  test("handles failed/no-answer/completed status updates", async () => {
    const supabase = makeSupabase({
      callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } },
      workspaceAuthToken: "tok",
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const mod = await import("../app/routing/api/api.ivr.status");

    let res = await mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "failed", Timestamp: new Date().toISOString() }) } as any);
    await expect(res.json()).resolves.toEqual({ success: true });

    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "no-answer", Timestamp: new Date().toISOString() }) } as any);
    await expect(res.json()).resolves.toEqual({ success: true });

    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }) } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  test("machine voicemail branches: no page => hangup; synthetic => say; recorded => play; errors bubble to catch", async () => {
    const callUpdate = vi.fn(async (_p: any) => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({ calls: () => ({ update: callUpdate }) });
    const mod = await import("../app/routing/api/api.ivr.status");

    // no voicemail page
    let supabase = makeSupabase({
      callRow: {
        outreach_attempt_id: 1,
        workspace: "w1",
        campaign: { voicemail_file: "v.mp3", ivr_campaign: { script: { steps: { pages: { page_1: { title: "Other", blocks: [] } } } } } },
      },
      workspaceAuthToken: "tok",
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    let res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith({ twiml: "<Response><Hangup/></Response>" });

    // synthetic voicemail page
    callUpdate.mockClear();
    supabase = makeSupabase({
      callRow: {
        outreach_attempt_id: 1,
        workspace: "w1",
        campaign: { voicemail_file: "v.mp3", ivr_campaign: { script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "synthetic", say: "hi" } } } } } },
      },
      workspaceAuthToken: "tok",
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith({ twiml: `<Response><Pause length="1"/><Say>hi</Say></Response>` });

    // recorded voicemail page -> play signedUrl
    callUpdate.mockClear();
    supabase = makeSupabase({
      callRow: {
        outreach_attempt_id: 1,
        workspace: "w1",
        campaign: { voicemail_file: "v.mp3", ivr_campaign: { script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } } } },
      },
      workspaceAuthToken: "tok",
      voicemailSignedUrl: "https://signed",
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith({ twiml: `<Response><Pause length="1"/><Play>https://signed</Play></Response>` });

    // errors: missing voicemail_file => catch
    supabase = makeSupabase({
      callRow: {
        outreach_attempt_id: 1,
        workspace: "w1",
        campaign: { voicemail_file: null, ivr_campaign: { script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } } } },
      },
      workspaceAuthToken: "tok",
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  test("covers catch paths: call not found/workspace auth missing/update errors/outreach_attempt_id missing", async () => {
    const mod = await import("../app/routing/api/api.ivr.status");

    mocks.createClient.mockReturnValueOnce(makeSupabase({ callError: new Error("call") }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    let res = await mod.action({ request: makeReq({ CallSid: "CA1" }) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.createClient.mockReturnValueOnce(makeSupabase({ callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } }, workspaceAuthToken: null }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await mod.action({ request: makeReq({ CallSid: "CA1" }) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.createClient.mockReturnValueOnce(makeSupabase({ callRow: { outreach_attempt_id: null, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } }, workspaceAuthToken: "tok" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.createClient.mockReturnValueOnce(makeSupabase({ callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } }, workspaceAuthToken: "tok", updateOutreachError: new Error("up") }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers remaining voicemail recorded signedUrl error/missing, pagesObject undefined, dbCall null, timestamp fallback, and updateResult error throw", async () => {
    const mod = await import("../app/routing/api/api.ivr.status");
    const callUpdate = vi.fn(async (_p: any) => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({ calls: () => ({ update: callUpdate }) });

    // dbCall null (callError null) => "Call not found"
    mocks.createClient.mockReturnValueOnce(makeSupabase({ callRow: null, callError: null }));
    let res = await mod.action({ request: makeReq({ CallSid: "CA1" }) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // pagesObject undefined => findVoicemailPage early return null => hangup update
    callUpdate.mockClear();
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: {
          outreach_attempt_id: 1,
          workspace: "w1",
          campaign: { voicemail_file: "v.mp3", ivr_campaign: { script: { steps: null } } },
        },
        workspaceAuthToken: "tok",
      }),
    );
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith({ twiml: "<Response><Hangup/></Response>" });

    // recorded: signedUrlError => throws {Status_Error: ...} and caught
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: {
          outreach_attempt_id: 1,
          workspace: "w1",
          campaign: { voicemail_file: "v.mp3", ivr_campaign: { script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } } } },
        },
        workspaceAuthToken: "tok",
        voicemailSignedUrlError: new Error("sig"),
      }),
    );
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start" }),
    } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // recorded: missing signedUrl => throws Error and caught
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: {
          outreach_attempt_id: 1,
          workspace: "w1",
          campaign: { voicemail_file: "v.mp3", ivr_campaign: { script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } } } },
        },
        workspaceAuthToken: "tok",
        voicemailSignedUrl: null,
      }),
    );
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start" }),
    } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // timestamp fallback '' + updateResult error throw (failed path)
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } },
        workspaceAuthToken: "tok",
        updateOutreachError: new Error("upd"),
      }),
    );
    res = await mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "failed" }) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  test("covers completed branch and updateCallStatus error branch", async () => {
    const mod = await import("../app/routing/api/api.ivr.status");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });

    // completed branch success
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } },
        workspaceAuthToken: "tok",
      }),
    );
    let res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });

    // updateCallStatus error => catch
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } },
        workspaceAuthToken: "tok",
        updateCallError: new Error("call-update"),
      }),
    );
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "failed", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // ensure completed branch executes by forcing updateCallStatus error on completed
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } },
        workspaceAuthToken: "tok",
        updateCallError: new Error("completed-update"),
      }),
    );
    res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  test("explicitly hits completed branch (spies call/outreach updates)", async () => {
    const mod = await import("../app/routing/api/api.ivr.status");
    const callUpdate = vi.fn(async () => ({ data: [], error: null }));
    const outreachUpdate = vi.fn(async () => ({ data: [], error: null }));
    const supabase: any = {
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
      from: (table: string) => {
        if (table === "call") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    outreach_attempt_id: 1,
                    workspace: "w1",
                    campaign: { ivr_campaign: { script: { steps: { pages: {} } } } },
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: callUpdate }),
          };
        }
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { twilio_data: { authToken: "tok" } }, error: null }),
              }),
            }),
          };
        }
        if (table === "outreach_attempt") {
          return { update: () => ({ eq: outreachUpdate }) };
        }
        throw new Error("unexpected");
      },
    };
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });

    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalled();
    expect(outreachUpdate).toHaveBeenCalled();

    // Same, but with AnsweredBy machine_* (ensures machine-branch condition evaluates false via callStatus !== 'completed')
    callUpdate.mockClear();
    outreachUpdate.mockClear();
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const res2 = await mod.action({
      request: makeReq({
        CallSid: "CA1",
        CallStatus: "completed",
        AnsweredBy: "machine_start",
        Timestamp: new Date().toISOString(),
      }),
    } as any);
    await expect(res2.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalled();
    expect(outreachUpdate).toHaveBeenCalled();
  });

  test("covers switch default (non-terminal callStatus, non-machine)", async () => {
    const mod = await import("../app/routing/api/api.ivr.status");
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        callRow: { outreach_attempt_id: 1, workspace: "w1", campaign: { ivr_campaign: { script: { steps: { pages: {} } } } } },
        workspaceAuthToken: "tok",
      }),
    );
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const res = await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "human", Timestamp: new Date().toISOString() }),
    } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});

