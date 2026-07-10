import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, withRouteUrl } from "./helpers/route-result";
import {
  queueDualAuthSession,
  setDualAuthSession,
  setDualAuthUnauthorized,
} from "./helpers/route-auth-mock";

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

const downloadObjectMock = vi.hoisted(() => vi.fn());
const uploadObjectMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/object-storage.server", () => ({
  downloadObject: downloadObjectMock,
  uploadObject: uploadObjectMock,
}));

function applyDualAuth() {
  if (!userPresent) {
    setDualAuthUnauthorized();
    return;
  }
  setDualAuthSession({
        user: { id: "u1" },
  });
}

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers(),
  }),
}));

describe("api.campaign-export-status error handling", () => {
  beforeEach(() => {
    requireWorkspaceAccess.mockClear();
    downloadObjectMock.mockReset();
    uploadObjectMock.mockClear();
    downloadObjectMock.mockImplementation(async () => {
      if (downloadThrows != null) throw downloadThrows;
      if (downloadBehavior === "not_found") {
        throw new Error("Object not found");
      }
      if (downloadBehavior === "other_error") {
        throw new Error("Storage exploded");
      }
      return Buffer.from(statusJsonText, "utf-8");
    });
    downloadBehavior = "ok";
    userPresent = true;
    statusJsonText = JSON.stringify({ status: "processing" });
    downloadThrows = null;
    applyDualAuth();
  });

  test("returns 400 when exportId/workspaceId missing", async () => {
    const mod = await import("../app/routes/api+/campaign-export-status");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/campaign-export-status?exportId=e1"),
    } as any)));
    expect(res.status).toBe(400);
  });

  test("returns 404 when status object not found", async () => {
    downloadBehavior = "not_found";
    applyDualAuth();
    const mod = await import("../app/routes/api+/campaign-export-status");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any)));
    expect(res.status).toBe(404);
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  test("returns 401 when user is missing", async () => {
    queueDualAuthSession({ user: null });
    const mod = await import("../app/routes/api+/campaign-export-status");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any)));
    expect(res.status).toBe(401);
  });

  test("returns 200 with parsed JSON when download succeeds", async () => {
    statusJsonText = JSON.stringify({ status: "done", url: "x" });
    applyDualAuth();
    const mod = await import("../app/routes/api+/campaign-export-status");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "done", url: "x" });
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  test("returns 500 on non-not-found download error and on JSON parse error", async () => {
    downloadThrows = new Error("storage down");
    applyDualAuth();
    const mod = await import("../app/routes/api+/campaign-export-status");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any)));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "storage down" });

    downloadThrows = null;
    statusJsonText = "{";
    applyDualAuth();
    const res2 = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any)));
    expect(res2.status).toBe(500);
    await expect(res2.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  test("returns 500 when download returns error that isn't Object not found", async () => {
    downloadBehavior = "other_error";
    applyDualAuth();
    const mod = await import("../app/routes/api+/campaign-export-status");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any)));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Storage exploded" });
  });

  test("returns 500 with Unknown error when a non-Error is thrown", async () => {
    downloadThrows = "nope";
    applyDualAuth();
    const mod = await import("../app/routes/api+/campaign-export-status");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
      ),
    } as any)));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Unknown error" });
  });

  describe("staleness watchdog", () => {
    test("marks a processing export failed when its status blob is stale (>10min)", async () => {
      const staleUpdatedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
      statusJsonText = JSON.stringify({
        status: "processing",
        progress: 42,
        updated_at: staleUpdatedAt,
        created_at: staleUpdatedAt,
      });
      applyDualAuth();
      const mod = await import("../app/routes/api+/campaign-export-status");
      const res = await asRouteResponse(await mod.loader(withRouteUrl({
        request: new Request(
          "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
        ),
      } as any)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("error");
      expect(body.error).toBe("Processing interrupted — please retry");
      expect(uploadObjectMock).toHaveBeenCalledTimes(1);
    });

    test("leaves a processing export alone when its status blob was updated recently", async () => {
      const freshUpdatedAt = new Date(Date.now() - 60 * 1000).toISOString();
      statusJsonText = JSON.stringify({
        status: "processing",
        progress: 42,
        updated_at: freshUpdatedAt,
        created_at: freshUpdatedAt,
      });
      applyDualAuth();
      const mod = await import("../app/routes/api+/campaign-export-status");
      const res = await asRouteResponse(await mod.loader(withRouteUrl({
        request: new Request(
          "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
        ),
      } as any)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("processing");
      expect(uploadObjectMock).not.toHaveBeenCalled();
    });

    test("does not touch a non-processing export even if old", async () => {
      const staleUpdatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      statusJsonText = JSON.stringify({
        status: "completed",
        progress: 100,
        updated_at: staleUpdatedAt,
      });
      applyDualAuth();
      const mod = await import("../app/routes/api+/campaign-export-status");
      const res = await asRouteResponse(await mod.loader(withRouteUrl({
        request: new Request(
          "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
        ),
      } as any)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("completed");
      expect(uploadObjectMock).not.toHaveBeenCalled();
    });
  });
});
