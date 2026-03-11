import { describe, expect, test, vi } from "vitest";

describe("themeSessionResolver", () => {
  test("returns null when no theme cookie present", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    const mod = await import("../app/sessions.server");
    const req = new Request("http://localhost/");
    await expect(mod.themeSessionResolver.getTheme(req)).resolves.toBeNull();
  });

  test("round-trips theme in non-production cookie settings", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    const mod = await import("../app/sessions.server");

    const headers = new Headers();
    await mod.themeSessionResolver.setTheme("dark", headers);
    const setCookie = headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("theme=");
    expect(setCookie).not.toContain("Secure");
    expect(setCookie).not.toContain("Domain=");

    const req = new Request("http://localhost/", { headers: { Cookie: setCookie } });
    await expect(mod.themeSessionResolver.getTheme(req)).resolves.toBe("dark");
  });

  test("uses secure + domain cookie settings in production", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    const mod = await import("../app/sessions.server");

    const headers = new Headers();
    await mod.themeSessionResolver.setTheme("light", headers);
    const setCookie = headers.get("Set-Cookie") ?? "";

    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Domain=your-production-domain.com");
  });
});

