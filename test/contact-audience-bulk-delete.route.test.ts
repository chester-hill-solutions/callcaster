import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    removeContactsFromAudience: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  removeContactsFromAudience: (...args: any[]) => mocks.removeContactsFromAudience(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api.contact-audience.bulk-delete.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.parseActionRequest.mockReset();
    mocks.removeContactsFromAudience.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 401 when user missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {},
      headers: new Headers(),
      user: null,
    });
    const mod = await import("../app/routes/api.contact-audience.bulk-delete");
    const res = await mod.action({
      request: new Request("http://localhost/api/contact-audience/bulk-delete", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(401);
  });

  test("returns 405 when method not DELETE", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {},
      headers: new Headers(),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.contact-audience.bulk-delete");
    const res = await mod.action({
      request: new Request("http://localhost/api/contact-audience/bulk-delete", { method: "POST" }),
    } as any);
    expect(res.status).toBe(405);
  });

  test("validates audience_id and contact_ids", async () => {
    mocks.verifyAuth.mockResolvedValue({
      supabaseClient: {},
      headers: new Headers(),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.contact-audience.bulk-delete");

    mocks.parseActionRequest.mockResolvedValueOnce({ audience_id: null, "contact_ids[]": ["1"] });
    const r1 = await mod.action({
      request: new Request("http://localhost/api/contact-audience/bulk-delete", { method: "DELETE" }),
    } as any);
    expect(r1.status).toBe(400);

    mocks.parseActionRequest.mockResolvedValueOnce({ audience_id: "1", "contact_ids[]": null });
    const r2 = await mod.action({
      request: new Request("http://localhost/api/contact-audience/bulk-delete", { method: "DELETE" }),
    } as any);
    expect(r2.status).toBe(400);
  });

  test("parses contact_ids[] string/array, filters NaN, and returns success payload", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    const supabaseClient = {};
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      audience_id: "10",
      "contact_ids[]": ["1", "nope", "2"],
    });
    mocks.removeContactsFromAudience.mockResolvedValueOnce({
      removed_count: 2,
      new_total: 5,
    });

    const mod = await import("../app/routes/api.contact-audience.bulk-delete");
    const res = await mod.action({
      request: new Request("http://localhost/api/contact-audience/bulk-delete", { method: "DELETE" }),
    } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
    await expect(res.json()).resolves.toEqual({
      success: true,
      message: "2 contacts removed from audience",
      removed_count: 2,
      new_total: 5,
    });
    expect(mocks.removeContactsFromAudience).toHaveBeenCalledWith(supabaseClient, 10, [1, 2]);
  });

  test("logs and returns 500 on thrown Error and non-Error", async () => {
    mocks.verifyAuth.mockResolvedValue({
      supabaseClient: {},
      headers: new Headers(),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.contact-audience.bulk-delete");

    mocks.parseActionRequest.mockResolvedValueOnce({ audience_id: "1", "contact_ids[]": "2" });
    mocks.removeContactsFromAudience.mockRejectedValueOnce(new Error("boom"));
    const r1 = await mod.action({
      request: new Request("http://localhost/api/contact-audience/bulk-delete", { method: "DELETE" }),
    } as any);
    expect(r1.status).toBe(500);

    mocks.parseActionRequest.mockResolvedValueOnce({ audience_id: "1", "contact_ids[]": "2" });
    mocks.removeContactsFromAudience.mockRejectedValueOnce("nope");
    const r2 = await mod.action({
      request: new Request("http://localhost/api/contact-audience/bulk-delete", { method: "DELETE" }),
    } as any);
    expect(r2.status).toBe(500);
    await expect(r2.json()).resolves.toEqual({ error: "An unexpected error occurred" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

