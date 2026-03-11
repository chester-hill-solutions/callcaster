import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    validateTwilioWebhookParams: vi.fn(() => true),
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
      TWILIO_AUTH_TOKEN: () => "fallback-token",
    },
    logger: { error: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("@/twilio.server", () => ({ validateTwilioWebhookParams: (...a: any[]) => mocks.validateTwilioWebhookParams(...a) }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    redirect(u: string) {
      this.parts.push(`redirect:${u}`);
    }
    say(t: string) {
      this.parts.push(`say:${t}`);
    }
    hangup() {
      this.parts.push("hangup");
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeSupabase(opts?: {
  call?: any;
  callError?: any;
  campaignData?: any;
  campaignError?: any;
  outreachResult?: any;
  outreachError?: any;
  workspaceTwilioData?: any;
}) {
  const supabase: any = {
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts?.call ?? null, error: opts?.callError ?? null }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts?.campaignData ?? null, error: opts?.campaignError ?? null }),
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { result: opts?.outreachResult ?? {} }, error: opts?.outreachError ?? null }),
            }),
          }),
          update: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { twilio_data: opts?.workspaceTwilioData ?? null }, error: null }),
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
  };
  return supabase;
}

function makeReq(fields: Record<string, any>, headers?: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/ivr/1/page_1/b1/response", {
    method: "POST",
    headers: { "x-twilio-signature": "sig", ...(headers ?? {}) },
    body: fd,
  });
}

describe("app/routes/api.ivr.$campaignId.$pageId.$blockId.response.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.logger.error.mockReset();
  });

  test("400s for missing params and missing CallSid", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId.response");
    let res = await mod.action({ params: {}, request: new Request("http://x") } as any);
    expect(res.status).toBe(400);

    mocks.createClient.mockReturnValueOnce(makeSupabase());
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({}),
    } as any);
    expect(res.status).toBe(400);
  });

  test("returns 403 on invalid Twilio signature", async () => {
    mocks.validateTwilioWebhookParams.mockReturnValueOnce(false);
    const script = { pages: { page_1: { blocks: ["b1"] } }, blocks: { b1: { id: "b1", options: [] } } };
    const campaignData = { ivr_campaign: [{ script: { steps: script } }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: "w1", outreach_attempt_id: 1 }, campaignData, workspaceTwilioData: { authToken: "t" } }));
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId.response");
    const res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(res.status).toBe(403);
  });

  test("advances flow for matched option, vx-any, and fallthrough next/hangup; merges outreach result", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1"] }, page_2: { blocks: ["b2"] } },
      blocks: {
        b1: { id: "b1", title: "Title", options: [{ value: "1", next: "page_2:b2" }, { value: "vx-any", next: "hangup" }] },
        b2: { id: "b2", options: [] },
      },
    };
    const campaignData = { ivr_campaign: [{ script: { steps: script } }] };
    const supabase = makeSupabase({
      call: { sid: "CA1", workspace: null, outreach_attempt_id: 9 },
      campaignData,
      outreachResult: { page_1: { prev: "x" } },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId.response");

    // exact match => includes ":" branch
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_2/b2/");

    // vx-any match (input length >2)
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 9 }, campaignData, outreachResult: {} }),
    );
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", SpeechResult: "hello world" }),
    } as any);
    expect(await res.text()).toContain("hangup");

    // no match => nextLocation => page_: blockId path
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 9 }, campaignData, outreachResult: {} }),
    );
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "9" }),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_2/b2/");
  });

  test("covers page_ redirect branch and error handling branches", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: { b1: { id: "b1", options: [{ value: "1", next: "page_2" }] } },
    };
    const campaignData = { ivr_campaign: [{ script: { steps: script } }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: "w1", outreach_attempt_id: 1 }, campaignData, workspaceTwilioData: null }));
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId.response");
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_2/");

    // call not found => say error message (Error branch)
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: null, campaignData }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("say:Call not found");

    // missing stepsValue => say error message
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData: { ivr_campaign: [{ script: { steps: null } }] } }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("Script steps not found");
  });

  test("covers findNextBlock variants and handleNextStep final else redirect", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1", "bX"] }, page_2: { blocks: ["b2"] } },
      blocks: {
        b1: { id: "b1" }, // no options => uses findNextBlock
        bX: { id: "bX" },
        b2: { id: "b2" },
      },
    };
    const campaignData = { ivr_campaign: [{ script: { steps: script } }] };
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId.response");

    // currentBlockIndex < ... => next block in same page
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData, outreachResult: "not-object" }));
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_1/bX/");

    // currentPageIndex < ... => next page first block
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData, outreachResult: {} }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "bX" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_2/b2/");

    // last block of last page => findNextBlock null => hangup
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData, outreachResult: {} }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_2", blockId: "b2" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("hangup");

    // handleNextStep final else redirect (nextStep is block id)
    const script2 = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: { b1: { id: "b1", options: [{ value: "1", next: "block_2" }] } },
    };
    const campaignData2 = { ivr_campaign: [{ script: { steps: script2 } }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData: campaignData2, outreachResult: {} }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_1/block_2/");
  });

  test("covers helper error branches, invalid script structure, missing block, and non-Error catch message", async () => {
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId.response");

    // campaignError in getCampaignData
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignError: new Error("camp") }));
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("say:camp");

    // outreachError in getOutreach
    const script = { pages: { page_1: { blocks: ["b1"] } }, blocks: { b1: { id: "b1" } } };
    const campaignData = { ivr_campaign: [{ script: { steps: script } }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData, outreachError: new Error("out") }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("say:out");

    // invalid script structure
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData: { ivr_campaign: [{ script: { steps: { pages: null, blocks: null } } }] } }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("Invalid script structure");

    // block not found
    const script2 = { pages: { page_1: { blocks: ["b1"] } }, blocks: {} };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ call: { sid: "CA1", workspace: null, outreach_attempt_id: 1 }, campaignData: { ivr_campaign: [{ script: { steps: script2 } }] } }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("Block b1 not found");

    // non-Error thrown inside try => default message branch
    mocks.createClient.mockReturnValueOnce({
      from: (_t: string) => {
        throw "nope";
      },
    });
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toContain("An error occurred. Please try again later.");
  });
});

