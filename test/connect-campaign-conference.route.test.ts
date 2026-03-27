import { beforeEach, describe, expect, test, vi } from "vitest";

// Avoid env validation noise
vi.mock("@/lib/env.server", () => ({
  env: { BASE_URL: () => "https://base.example" },
}));

vi.mock("twilio/lib/twiml/VoiceResponse.js", () => {
  class VoiceResponse {
    private parts: string[] = [];
    say(t: string) {
      this.parts.push(`say:${t}`);
    }
    pause(opts: any) {
      this.parts.push(`pause:${opts?.length}`);
    }
    dial() {
      return {
        conference: (_opts: any, name: string) => {
          this.parts.push(`conf:${name}`);
        },
      };
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: VoiceResponse };
});

describe("app/routes/api.connect-campaign-conference.$workspaceId.$campaignId.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("returns TwiML with campaign conference name", async () => {
    const mod = await import(
      "../app/routing/api/api.connect-campaign-conference.$workspaceId.$campaignId"
    );
    const res = await mod.loader({
      params: { workspaceId: "w1", campaignId: "c1" },
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain("conf:campaign-w1-c1");
  });
});

