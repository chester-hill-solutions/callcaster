import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    send: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/env.server", () => ({
  env: { RESEND_API_KEY: () => "rk" },
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("resend", () => {
  class Resend {
    emails = { send: (...args: any[]) => mocks.send(...args) };
    constructor(_k: string) {}
  }
  return { Resend };
});

describe("app/routes/api.contact-form.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.send.mockReset();
    mocks.logger.error.mockReset();
  });

  test("validates missing/invalid email and length limits", async () => {
    const mod = await import("../app/routing/api/api.contact-form");

    const fd1 = new FormData();
    // omit email entirely to cover String(data.email ?? "") branch
    let res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }), params: { id: "1" } } as any);
    expect(res.status).toBe(400);

    const fd2 = new FormData();
    fd2.set("email", "bad");
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }), params: { id: "1" } } as any);
    expect(res.status).toBe(400);

    const fd3 = new FormData();
    fd3.set("email", "a@b.com");
    fd3.set("name", "x".repeat(201));
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd3 }), params: { id: "1" } } as any);
    expect(res.status).toBe(400);

    const fd4 = new FormData();
    fd4.set("email", "a@b.com");
    fd4.set("message", "x".repeat(5001));
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd4 }), params: { id: "1" } } as any);
    expect(res.status).toBe(400);
  });

  test("sends email (signup vs normal subject) and returns success", async () => {
    mocks.send.mockResolvedValueOnce({ id: "em1" });
    const mod = await import("../app/routing/api/api.contact-form");

    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("name", "A");
    fd.set("message", "Hi");
    fd.set("signup", "1");

    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
      params: { id: "1" },
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, message: "Email sent" });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "a@b.com",
        subject: expect.stringContaining("Sign Up"),
      }),
    );
  });

  test("returns 500 on resend error", async () => {
    mocks.send.mockRejectedValueOnce(new Error("nope"));
    const mod = await import("../app/routing/api/api.contact-form");
    const fd = new FormData();
    fd.set("email", "a@b.com");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
      params: { id: "1" },
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to process message" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

