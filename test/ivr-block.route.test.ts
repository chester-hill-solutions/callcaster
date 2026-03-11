import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
    logger: { error: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    play(u: string) {
      this.parts.push(`play:${u}`);
    }
    say(t: string) {
      this.parts.push(`say:${t}`);
    }
    gather(opts: any) {
      this.parts.push(`gather:${opts?.action}`);
      return {};
    }
    redirect(u: string) {
      this.parts.push(`redirect:${u}`);
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
  campaignData?: any;
  campaignError?: any;
  signedUrlError?: any;
}) {
  const supabase: any = {
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
  return supabase;
}

describe("app/routes/api.ivr.$campaignId.$pageId.$blockId.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 400 when required params missing", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId");
    const res = await mod.action({ params: {}, request: new Request("http://x") } as any);
    expect(res.status).toBe(400);
  });

  test("plays recorded audio and gathers when options exist", async () => {
    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: {
        b1: { id: "b1", type: "recorded", audioFile: "a.mp3", options: [{ value: "1", next: "hangup" }] },
      },
    };
    const campaignData = { workspace: "w1", ivr_campaign: [{ script: { steps: script } }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignData }));
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId");
    const res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: new Request("http://x"),
    } as any);
    const xml = await res.text();
    expect(xml).toContain("play:https://signed");
    expect(xml).toContain("gather:https://base.example/api/ivr/1/page_1/b1/response");
    expect(xml).toContain("redirect:https://base.example/api/ivr/1/page_1/b1/response");
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
    const campaignData = { workspace: "w1", ivr_campaign: [{ script: { steps: script } }] };
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId");

    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignData }));
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: new Request("http://x"),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_1/b2");

    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignData }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b2" },
      request: new Request("http://x"),
    } as any);
    expect(await res.text()).toContain("redirect:https://base.example/api/ivr/1/page_2/b3");

    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignData }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_2", blockId: "b3" },
      request: new Request("http://x"),
    } as any);
    expect(await res.text()).toContain("hangup");

    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignData }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "missing" },
      request: new Request("http://x"),
    } as any);
    expect(await res.text()).toContain("There was an error in the IVR flow");
  });

  test("catch logs and says generic error on invalid script or signed url error", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignData: { workspace: "w1", ivr_campaign: [{ script: { steps: null } }] } }));
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId");
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: new Request("http://x"),
    } as any);
    expect(await res.text()).toContain("An error occurred. Please try again later.");

    const script = {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: { b1: { id: "b1", type: "recorded", audioFile: "a.mp3" } },
    };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignData: { workspace: "w1", ivr_campaign: [{ script: { steps: script } }] }, signedUrlError: new Error("sig") }));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: new Request("http://x"),
    } as any);
    expect(await res.text()).toContain("An error occurred. Please try again later.");
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers getCampaignData error branch", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase({ campaignError: new Error("db") }));
    const mod = await import("../app/routes/api.ivr.$campaignId.$pageId.$blockId");
    const res = await mod.action({
      params: { campaignId: "1", pageId: "page_1", blockId: "b1" },
      request: new Request("http://x"),
    } as any);
    expect(await res.text()).toContain("An error occurred. Please try again later.");
  });
});

