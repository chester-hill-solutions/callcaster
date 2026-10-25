import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    send: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
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

describe("app/routes/api+/contact-form/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.send.mockReset();
    mocks.logger.error.mockReset();
  });

  test("validates missing/invalid email and length limits", async () => {
    const mod = await import("../app/routes/api+/contact-form");

    const fd1 = new FormData();
    // omit email entirely to cover String(data.email ?? "") branch
    let res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd1 }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(400);

    const fd2 = new FormData();
    fd2.set("email", "bad");
    res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd2 }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(400);

    const fd3 = new FormData();
    fd3.set("email", "a@b.com");
    fd3.set("name", "x".repeat(201));
    res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd3 }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(400);

    const fd4 = new FormData();
    fd4.set("email", "a@b.com");
    fd4.set("message", "x".repeat(5001));
    res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd4 }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(400);
  });

  test("silently drops submissions that fill the honeypot field", async () => {
    const mod = await import("../app/routes/api+/contact-form");

    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("name", "A");
    fd.set("message", "Hi");
    fd.set("company_website", "https://spam.example");

    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  test("sends email (signup vs normal subject) and returns success", async () => {
    mocks.send.mockResolvedValueOnce({ id: "em1" });
    const mod = await import("../app/routes/api+/contact-form");

    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("name", "A");
    fd.set("message", "Hi");
    fd.set("signup", "1");

    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      message: "Email sent",
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "a@b.com",
        subject: expect.stringContaining("Sign Up"),
      }),
    );
  });

  test("escapes caller-supplied name and message in the HTML body", async () => {
    mocks.send.mockResolvedValueOnce({ id: "em2" });
    const mod = await import("../app/routes/api+/contact-form");

    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("name", `<img src=x onerror="alert(1)">`);
    fd.set("message", `<a href="https://evil.example">click</a> & 'quoted'`);

    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(200);

    const payload = mocks.send.mock.calls[0][0] as {
      html: string;
      text: string;
    };
    // No caller markup survives into the HTML part: no tag opens, and the
    // attribute quotes are escaped so the text cannot break out of the element.
    expect(payload.html).not.toContain("<img");
    expect(payload.html).not.toContain("<a href");
    expect(payload.html).not.toContain('"');
    expect(payload.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(payload.html).toContain("&amp; &#39;quoted&#39;");
    // The plain-text part still carries the visitor's words verbatim.
    expect(payload.text).toContain('<img src=x onerror="alert(1)">');
    expect(payload.text).toContain('<a href="https://evil.example">click</a>');
  });

  test("returns 500 on resend error", async () => {
    mocks.send.mockRejectedValueOnce(new Error("nope"));
    const mod = await import("../app/routes/api+/contact-form");
    const fd = new FormData();
    fd.set("email", "a@b.com");
    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
        params: { id: "1" },
      } as any),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to process message",
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
