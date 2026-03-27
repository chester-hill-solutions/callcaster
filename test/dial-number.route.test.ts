import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    logger: { error: vi.fn() },
    env: { BASE_URL: () => "https://base.example" },
    dialNumberThrows: false,
  };
});

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("twilio", () => {
  class VoiceResponse {
    dial(_opts: any) {
      return {
        number: (_opts2: any, _num: string) => {
          if (mocks.dialNumberThrows) throw new Error("dial");
        },
      };
    }
    toString() {
      return "<Response/>";
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

describe("app/routes/api.dial.$number.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    mocks.dialNumberThrows = false;
  });

  test("returns xml with dial", async () => {
    const mod = await import("../app/routing/api/api.dial.$number");
    const fd = new FormData();
    fd.set("From", "+1555");
    const res = await mod.action({
      request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
      params: { number: "+15550001111" },
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    await expect(res.text()).resolves.toContain("<Response");
  }, 30000);

  test("logs and rethrows when twiml building throws", async () => {
    mocks.dialNumberThrows = true;
    const mod = await import("../app/routing/api/api.dial.$number");
    const fd = new FormData();
    fd.set("From", "+1555");
    await expect(
      mod.action({
        request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
        params: { number: "+15550001111" },
      } as any),
    ).rejects.toThrow("dial");
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in dial route:", expect.any(Error));
  }, 30000);
});

