import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { findCallBySid } from "@/lib/telephony-db.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    requireTwilioSignature: vi.fn(),
    env: {
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

const campaignIvrMocks = vi.hoisted(() => ({
  fetchCampaignWithScript: vi.fn(),
  ivrScriptStepsFromCampaign: vi.fn((campaign: any) => campaign?.script?.steps ?? null),
}));

vi.mock("@client/client-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    mocks.requireTwilioSignature(...args),
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  fetchCampaignWithScript: (...args: any[]) => campaignIvrMocks.fetchCampaignWithScript(...args),
  ivrScriptStepsFromCampaign: (...args: any[]) => campaignIvrMocks.ivrScriptStepsFromCampaign(...args),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: vi.fn(),
}));

vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: vi.fn().mockResolvedValue("https://signed"),
}));

function makeDbClient(opts?: {
  campaignData?: any;
  campaignError?: any;
  signedUrlError?: any;
}) {
  const client: any = {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://signed" },
          error: opts?.signedUrlError ?? null,
        }),
      }),
    },
    from: (table: string) => {
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts?.campaignData ?? null, error: opts?.campaignError ?? null }),
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
  };
  return client;
}

function ivrBlockRequest(callSid = "CA123") {
  const fd = new FormData();
  fd.set("CallSid", callSid);
  return new Request("http://x", {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body: fd,
  });
}

describe("app/routes/api+/ivr/route.$campaignId.$pageId.$blockId.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    campaignIvrMocks.fetchCampaignWithScript.mockReset();
    campaignIvrMocks.ivrScriptStepsFromCampaign.mockReset();
    campaignIvrMocks.ivrScriptStepsFromCampaign.mockImplementation((campaign: any) => campaign?.script?.steps ?? null);
    vi.mocked(findCallBySid).mockReset();
    vi.mocked(findCallBySid).mockResolvedValue({
      sid: "CA123",
      workspace: "w1",
      campaign_id: 1,
      to: "+15551234567",
    } as any);
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response("Invalid", { status: 403 }));
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await asRouteResponse(mod.action({
        params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
        request: ivrBlockRequest(),
      } as any),
    );
    expect(res.status).toBe(403);
  });

  test("returns 400 when CallSid missing", async () => {
    const fd = new FormData();
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await asRouteResponse(mod.action({
        params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
        request: new Request("http://x", {
          method: "POST",
          headers: { "x-twilio-signature": "sig" },
          body: fd,
        }),
      } as any),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 when required params missing", async () => {
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await asRouteResponse(mod.action({ params: {}, request: new Request("http://x") } as any));
    expect(res.status).toBe(400);
  });

  test("plays recorded audio and gathers when options exist", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: {
        b1: { id: "b1", type: "recorded", audioFile: "a.mp3", options: [{ value: "1", next: "hangup" }] },
      },
    };
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({ workspace: "w1", script: { steps: script } } as any);
    vi.mocked(createSignedObjectUrl).mockResolvedValueOnce("https://signed");
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await asRouteResponse(mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any));
    const xml = await res.text();
    expect(xml).toContain("<Play>https://signed</Play>");
    expect(xml).toContain(
      '<Gather action="https://base.example/api/ivr/1/page_1/b1/response" input="dtmf speech" speechTimeout="auto" speechModel="phone_call" timeout="5"/>',
    );
    expect(xml).toContain(
      "<Redirect>https://base.example/api/ivr/1/page_1/b1/response</Redirect>",
    );
  });

  test("synthetic-speech block emits <Say voice='...'> using the block's roster voice (#1401)", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: {
        b1: {
          id: "b1",
          type: "say",
          audioFile: "Please press one for support.",
          wireExtras: { voice: "Polly.Matthew-Neural" },
        },
      },
    };
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({
      workspace: "w1",
      script: { steps: script },
    } as any);
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    const xml = await res.text();
    // The voice attribute is what actually reaches Twilio's <Say>; previously
    // every synthetic block silently used the account default (Salli),
    // making per-block voice control impossible.
    expect(xml).toContain('<Say voice="Polly.Matthew-Neural">Please press one for support.</Say>');
  });

  test("synthetic-speech block with no wireExtras.voice falls back to the roster default (#1401)", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: {
        b1: { id: "b1", type: "say", audioFile: "Thanks for calling." },
      },
    };
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({
      workspace: "w1",
      script: { steps: script },
    } as any);
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    // DEFAULT_VOICE_ID matches the historical Twilio account default so
    // workspaces that never touched voice keep hearing the same one.
    expect(await res.text()).toContain('<Say voice="Polly.Salli-Neural">Thanks for calling.</Say>');
  });

  test("synthetic-speech block with an unknown wireExtras.voice falls back rather than passing an arbitrary string through to Twilio (#1401)", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: {
        b1: {
          id: "b1",
          type: "say",
          audioFile: "Hello.",
          wireExtras: { voice: "attacker.injection-Neural" },
        },
      },
    };
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({
      workspace: "w1",
      script: { steps: script },
    } as any);
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    // The roster IS the allowlist: an arbitrary string is dropped rather
    // than reaching Twilio and 500-ing the entire IVR response.
    expect(await res.text()).toContain('<Say voice="Polly.Salli-Neural">Hello.</Say>');
  });

  test("no options redirects to next block/page or hangs up; missing block says error", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1", "b2"] }, page_2: { blocks: ["b3"] } },
      blocks: {
        b1: { id: "b1", type: "say", audioFile: "hello" },
        b2: { id: "b2", type: "say", audioFile: "two" },
        b3: { id: "b3", type: "say", audioFile: "three" },
      },
    };
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");

    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({ workspace: "w1", script: { steps: script } } as any);
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toContain("<Redirect>https://base.example/api/ivr/1/page_1/b2</Redirect>");

    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({ workspace: "w1", script: { steps: script } } as any);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b2" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toContain("<Redirect>https://base.example/api/ivr/1/page_2/b3</Redirect>");

    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({ workspace: "w1", script: { steps: script } } as any);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_2", blockId: "b3" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toMatch(/hangup/i);

    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({ workspace: "w1", script: { steps: script } } as any);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "missing" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toContain("There was an error in the IVR flow");
  });

  test("catch logs and says generic error on invalid script or signed url error", async () => {
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({ workspace: "w1", script: { steps: null } } as any);
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toContain("An error occurred. Please try again later.");

    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: { b1: { id: "b1", type: "recorded", audioFile: "a.mp3" } },
    };
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce({ workspace: "w1", script: { steps: script } } as any);
    vi.mocked(createSignedObjectUrl).mockRejectedValueOnce(new Error("sig"));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toContain("An error occurred. Please try again later.");
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers getCampaignData error branch", async () => {
    campaignIvrMocks.fetchCampaignWithScript.mockRejectedValueOnce(new Error("db"));
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");
    const res = await asRouteResponse(mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any));
    expect(await res.text()).toContain("An error occurred. Please try again later.");
  });

  test("returns hangup when campaign_id mismatches URL or call is missing", async () => {
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId.route");

    // campaign_id mismatch
    vi.mocked(findCallBySid).mockResolvedValueOnce({
      sid: "CA123",
      workspace: "w1",
      campaign_id: 2,
    } as any);
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toMatch(/hangup/i);

    // call not found
    vi.mocked(findCallBySid).mockResolvedValueOnce(null as any);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: ivrBlockRequest(),
    } as any);
    expect(await res.text()).toMatch(/hangup/i);
  });
});
