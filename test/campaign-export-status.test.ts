import { beforeEach, describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const requireWorkspaceAccess = vi.fn(async () => undefined);
vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>(
    "@/lib/database.server",
  );
  return { ...actual, requireWorkspaceAccess };
});

let downloadBehavior: "ok" | "not_found" | "other_error" = "ok";
let userPresent = true;
let statusJsonText = JSON.stringify({ status: "processing" });
let downloadThrows: unknown = null;

vi.mock("@/lib/supabase.server", () => {
  return {
    verifyAuth: vi.fn(async () => {
      const supabaseClient: any = {
        storage: {
          from: () => ({
            download: async () => {
              if (downloadThrows != null) throw downloadThrows;
              if (downloadBehavior === "not_found") {
                return { data: null, error: new Error("Object not found") };
              }
              if (downloadBehavior === "other_error") {
                return { data: null, error: new Error("Storage exploded") };
              }
              return {
                data: new Blob([statusJsonText], {
                  type: "application/json",
                }),
                error: null,
              };
            },
          }),
        },
      };
      return { supabaseClient, user: userPresent ? { id: "u1" } : null };
    }),
  };
});

describe("api.campaign-export-status error handling", () => {
  beforeEach(() => {
    requireWorkspaceAccess.mockClear();
    downloadBehavior = "ok";
    userPresent = true;
    statusJsonText = JSON.stringify({ status: "processing" });
    downloadThrows = null;
  });

  test("returns 400 when exportId/workspaceId missing", async () => {
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const res = await mod.loader({
      request: new Request("http://localhost/api/campaign-export-status?exportId=e1"),
    } as any);
    expect(res.status).toBe(400);
  });

  test("returns 404 when status object not found", async () => {
    downloadBehavior = "not_found";
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(404);
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  test("returns 401 when user is missing", async () => {
    userPresent = false;
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(401);
  });

  test("returns 200 with parsed JSON when download succeeds", async () => {
    statusJsonText = JSON.stringify({ status: "done", url: "x" });
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "done", url: "x" });
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  test("returns 500 on non-not-found download error and on JSON parse error", async () => {
    downloadThrows = new Error("storage down");
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "storage down" });

    downloadThrows = null;
    statusJsonText = "{";
    const res2 = await mod.loader({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any);
    expect(res2.status).toBe(500);
    await expect(res2.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  test("returns 500 when download returns error that isn't Object not found", async () => {
    downloadBehavior = "other_error";
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Storage exploded" });
  });

  test("returns 500 with Unknown error when a non-Error is thrown", async () => {
    downloadThrows = "nope";
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Unknown error" });
  });
});

