import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    logger: { error: vi.fn() },
    callUpdate: vi.fn(),
    twilioFactory: vi.fn(),
  };
});

vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("twilio", () => ({
  default: (...args: any[]) => mocks.twilioFactory(...args),
}));

describe("app/routes/api.disconnect.ts", () => {
  const origEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.logger.error.mockReset();
    mocks.callUpdate.mockReset();
    mocks.twilioFactory.mockReset();
    process.env = { ...origEnv };
  });

  test("returns 500 when Twilio credentials missing", async () => {
    delete process.env.TWILIO_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    mocks.safeParseJson.mockResolvedValueOnce({});
    const mod = await import("../app/routes/api.disconnect");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
  });

  test("returns 400 when CallSid missing", async () => {
    process.env.TWILIO_SID = "sid";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    mocks.safeParseJson.mockResolvedValueOnce("nope"); // non-object body => getCallSid null branch
    const mod = await import("../app/routes/api.disconnect");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
  });

  test("updates call and returns success; logs 500 on update failure", async () => {
    process.env.TWILIO_SID = "sid";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    mocks.safeParseJson.mockResolvedValueOnce({ call: { parameters: { CallSid: "CA1" } } });
    mocks.twilioFactory.mockReturnValueOnce({
      calls: (_sid: string) => ({ update: mocks.callUpdate }),
    });
    mocks.callUpdate.mockResolvedValueOnce({});

    const mod = await import("../app/routes/api.disconnect");
    let res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    mocks.safeParseJson.mockResolvedValueOnce({ call: { parameters: { CallSid: "CA1" } } });
    mocks.twilioFactory.mockReturnValueOnce({
      calls: (_sid: string) => ({ update: mocks.callUpdate }),
    });
    mocks.callUpdate.mockRejectedValueOnce(new Error("nope"));
    res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Failed to update call status",
      expect.any(Error),
    );
  });

  test("treats empty CallSid as missing", async () => {
    process.env.TWILIO_SID = "sid";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    mocks.safeParseJson.mockResolvedValueOnce({ call: { parameters: { CallSid: "" } } });
    const mod = await import("../app/routes/api.disconnect");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
  });
});

