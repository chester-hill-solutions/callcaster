import { beforeEach, describe, expect, test, vi } from "vitest";

describe("ApiClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  test("request returns success data for ok response", async () => {
    const { ApiClient } = await import("../app/lib/api-client");

    (fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ hello: "world" }), { status: 200 }),
    );

    const client = new ApiClient({ baseUrl: "http://localhost", headers: { A: "b" } });
    const res = await client.request("/x", { headers: { C: "d" } });

    expect(res).toEqual({ success: true, data: { hello: "world" } });
    expect(fetch).toHaveBeenCalledWith("http://localhost/x", {
      method: "GET",
      headers: { "Content-Type": "application/json", A: "b", C: "d" },
      signal: undefined,
    });
  });

  test("request serializes JSON body and returns structured error on non-ok response", async () => {
    const { ApiClient } = await import("../app/lib/api-client");

    (fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Bad things" }), { status: 418 }),
    );

    const client = new ApiClient({ baseUrl: "http://localhost" });
    const res = await client.request("/y", { method: "POST", body: { a: 1 } });

    expect(res.success).toBe(false);
    expect(res.error).toMatchObject({
      message: "Bad things",
      code: "HTTP_418",
    });
    expect((fetch as any).mock.calls[0][1].body).toBe(JSON.stringify({ a: 1 }));
  });

  test("request uses HTTP status message when error payload has no error field", async () => {
    const { ApiClient } = await import("../app/lib/api-client");

    (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }));
    const client = new ApiClient({ baseUrl: "http://localhost" });
    const res = await client.request("/no-error-field");
    expect(res).toMatchObject({
      success: false,
      error: { code: "HTTP_500", message: "HTTP 500" },
    });
  });

  test("request omits JSON content-type for FormData bodies", async () => {
    const { ApiClient } = await import("../app/lib/api-client");

    (fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const fd = new FormData();
    fd.set("a", "1");
    const client = new ApiClient({ baseUrl: "http://localhost" });
    await client.request("/form", { method: "POST", body: fd });

    const opts = (fetch as any).mock.calls[0][1];
    expect(opts.headers).toEqual({});
    expect(opts.body).toBe(fd);
  });

  test("request returns NETWORK_ERROR on thrown error", async () => {
    const { ApiClient } = await import("../app/lib/api-client");

    (fetch as any).mockRejectedValueOnce(new Error("no network"));
    const client = new ApiClient({ baseUrl: "http://localhost" });
    const res = await client.request("/z");

    expect(res).toMatchObject({
      success: false,
      error: { code: "NETWORK_ERROR", message: "no network" },
    });
  });

  test("request uses Unknown error message for non-Error throws", async () => {
    const { ApiClient } = await import("../app/lib/api-client");

    (fetch as any).mockRejectedValueOnce("nope");
    const client = new ApiClient({ baseUrl: "http://localhost" });
    const res = await client.request("/z2");
    expect(res).toMatchObject({
      success: false,
      error: { code: "NETWORK_ERROR", message: "Unknown error" },
    });
  });

  test("convenience methods set method and body correctly", async () => {
    const mod = await import("../app/lib/api-client");
    const { ApiClient } = mod;

    (fetch as any).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new ApiClient({ baseUrl: "http://localhost" });

    await client.get("/g");
    await client.post("/p", { a: 1 });
    await client.put("/u", { b: 2 });
    await client.patch("/pa", { c: 3 });
    await client.delete("/d");

    const methods = (fetch as any).mock.calls.map((c: any[]) => c[1].method);
    expect(methods).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  });

  test("submitForm uses apiClient.post and handleApiError/validateApiResponse enforce invariants", async () => {
    const mod = await import("../app/lib/api-client");

    const fd = new FormData();
    fd.set("x", "y");
    (fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const res = await mod.submitForm(fd, "/submit");
    expect(res).toMatchObject({ success: true, data: { ok: true } });

    expect(mod.handleApiError({ success: true, data: { ok: 1 } })).toEqual({ ok: 1 });

    expect(() =>
      mod.handleApiError({ success: true, error: { message: "nope", code: "X" } }),
    ).toThrow("nope");

    expect(() => mod.handleApiError({ success: false, error: { message: "nope", code: "X" } }))
      .toThrow("nope");

    expect(() => mod.handleApiError({ success: false })).toThrow("API request failed");

    expect(mod.validateApiResponse({ a: 1 }, (d): d is { a: number } => {
      return typeof (d as any)?.a === "number";
    })).toEqual({ a: 1 });

    expect(() => mod.validateApiResponse({ a: "no" }, (d): d is { a: number } => {
      return typeof (d as any)?.a === "number";
    })).toThrow("Invalid API response format");
  });

  test("default apiClient uses window.location.origin when window exists", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("window", { location: { origin: "http://example.com" } } as any);

    (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const mod = await import("../app/lib/api-client");
    await mod.apiClient.get("/ping");

    expect(fetch).toHaveBeenCalledWith("http://example.com/ping", expect.any(Object));
  });
});

