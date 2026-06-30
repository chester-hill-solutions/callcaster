import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  queueDualAuthSession,
  setDualAuthSession,
  setDualAuthUnauthorized,
} from "./helpers/route-auth-mock";

let user: null | { id: string } = { id: "u1" };
let downloadMode:
  | { kind: "ok"; statusJson: any }
  | { kind: "error"; message: string }
  | { kind: "throw"; value: unknown } = {
  kind: "ok",
  statusJson: { state: "processing" },
};
let uploadMode:
  | { kind: "ok"; row: Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "throw"; value: unknown } = {
  kind: "ok",
  row: {
    id: 1,
    audience_id: 2,
    status: "pending",
    file_name: "f.csv",
    file_size: 1,
    total_contacts: 2,
    processed_contacts: 1,
    error_message: null,
  },
};

const findAudienceUploadById = vi.hoisted(() =>
  vi.fn(async (_workspaceId: string, uploadId: number) => {
    if (uploadMode.kind === "missing") {
      return null;
    }
    if (uploadMode.kind === "throw") {
      throw uploadMode.value;
    }
    return { ...uploadMode.row, id: uploadId };
  }),
);

vi.mock("@/lib/audience-upload-db.server", () => ({
  findAudienceUploadById: (...args: unknown[]) => findAudienceUploadById(...args),
}));

function buildMockDb() {
  const storageDownload = async () => {
    if (downloadMode.kind === "throw") throw downloadMode.value;
    if (downloadMode.kind === "error")
      return { data: null, error: new Error(downloadMode.message) };
    return {
      data: new Blob([JSON.stringify(downloadMode.statusJson)], {
        type: "application/json",
      }),
      error: null,
    };
  };

  return {
    storage: { from: () => ({ download: storageDownload }) },
  };
}

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers({ "set-cookie": "x=y" }),
  }),
}));

vi.mock("@/lib/logger.server", () => {
  return {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

describe("api.audience-upload-status loader", () => {
  beforeEach(() => {
    user = { id: "u1" };
    downloadMode = { kind: "ok", statusJson: { state: "processing" } };
    uploadMode = {
      kind: "ok",
      row: {
        id: 1,
        audience_id: 2,
        status: "pending",
        file_name: "f.csv",
        file_size: 1,
        total_contacts: 2,
        processed_contacts: 1,
        error_message: null,
      },
    };

    if (user) {
      setDualAuthSession({
                headers: new Headers({ "set-cookie": "x=y" }),
        user,
      });
    } else {
      setDualAuthUnauthorized();
    }
  });

  test("returns 401 when no user", async () => {
    queueDualAuthSession({ user: null });
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api.audience-upload-status"),
    } as any));
    expect(res.status).toBe(401);
  });

  test("returns 400 when params missing", async () => {
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api.audience-upload-status"),
    } as any));
    expect(res.status).toBe(400);
  });

  test("returns 400 when uploadId invalid", async () => {
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=not-a-number&workspaceId=w1",
      ),
    } as any));
    expect(res.status).toBe(400);
  });

  test("returns 500 when storage download errors", async () => {
    downloadMode = { kind: "error", message: "nope" };
    setDualAuthSession({
            headers: new Headers({ "set-cookie": "x=y" }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      file_name: "f.csv",
      processed_contacts: 1,
      stage: "Processing contacts",
    });
  });

  test("returns 500 when upload record query errors", async () => {
    uploadMode = { kind: "throw", value: new Error("db") };
    setDualAuthSession({
            headers: new Headers({ "set-cookie": "x=y" }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db" });
  });

  test("returns merged status + upload record fields on success", async () => {
    downloadMode = { kind: "ok", statusJson: { state: "done", ok: true } };
    uploadMode = {
      kind: "ok",
      row: {
        id: 2,
        audience_id: 2,
        status: "pending",
        file_name: "a.csv",
        file_size: 10,
        total_contacts: 5,
        processed_contacts: 5,
        error_message: null,
      },
    };
    setDualAuthSession({
            headers: new Headers({ "set-cookie": "x=y" }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=2&workspaceId=w1",
      ),
    } as any));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      state: "done",
      ok: true,
      stage: "Processing contacts",
      uploadId: 2,
      audience_id: 2,
      status: "pending",
      file_name: "a.csv",
      file_size: 10,
      total_contacts: 5,
      processed_contacts: 5,
      error_message: null,
    });
  });

  test("returns 500 with Unknown error when thrown value is not Error", async () => {
    downloadMode = { kind: "throw", value: "boom" };
    setDualAuthSession({
            headers: new Headers({ "set-cookie": "x=y" }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unknown error" });
  });

  test("returns 500 with error.message when thrown value is Error", async () => {
    downloadMode = { kind: "throw", value: new Error("boom") };
    setDualAuthSession({
            headers: new Headers({ "set-cookie": "x=y" }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/audience-upload-status");
    const res = await asRouteResponse(await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
