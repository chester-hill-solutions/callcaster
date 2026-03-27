import { beforeEach, describe, expect, test, vi } from "vitest";

let user: null | { id: string } = { id: "u1" };
let downloadMode:
  | { kind: "ok"; statusJson: any }
  | { kind: "error"; message: string }
  | { kind: "throw"; value: unknown } = {
  kind: "ok",
  statusJson: { state: "processing" },
};
let uploadMode: { kind: "ok"; row: any } | { kind: "error"; message: string } =
  {
    kind: "ok",
    row: {
      file_name: "f.csv",
      file_size: 1,
      total_contacts: 2,
      processed_contacts: 1,
      error_message: null,
    },
  };

const verifyAuth = vi.fn(async () => {
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

  const uploadSingle = async () => {
    if (uploadMode.kind === "error")
      return { data: null, error: new Error(uploadMode.message) };
    return { data: uploadMode.row, error: null };
  };

  const supabaseClient: any = {
    storage: { from: () => ({ download: storageDownload }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: uploadSingle,
        }),
      }),
    }),
  };

  return {
    supabaseClient,
    headers: new Headers({ "set-cookie": "x=y" }),
    user,
  };
});

vi.mock("@/lib/supabase.server", () => ({ verifyAuth }));

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
        file_name: "f.csv",
        file_size: 1,
        total_contacts: 2,
        processed_contacts: 1,
        error_message: null,
      },
    };
    verifyAuth.mockClear();
  });

  test("returns 401 when no user", async () => {
    user = null;
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request("http://localhost/api.audience-upload-status"),
    } as any);
    expect(res.status).toBe(401);
  });

  test("returns 400 when params missing", async () => {
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request("http://localhost/api.audience-upload-status"),
    } as any);
    expect(res.status).toBe(400);
  });

  test("returns 400 when uploadId invalid", async () => {
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=not-a-number&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(400);
  });

  test("returns 500 when storage download errors", async () => {
    downloadMode = { kind: "error", message: "nope" };
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      file_name: "f.csv",
      processed_contacts: 1,
      stage: "Processing contacts",
    });
  });

  test("returns 500 when upload record query errors", async () => {
    uploadMode = { kind: "error", message: "db" };
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db" });
  });

  test("returns merged status + upload record fields on success", async () => {
    downloadMode = { kind: "ok", statusJson: { state: "done", ok: true } };
    uploadMode = {
      kind: "ok",
      row: {
        file_name: "a.csv",
        file_size: 10,
        total_contacts: 5,
        processed_contacts: 5,
        error_message: null,
      },
    };
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=2&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      state: "done",
      ok: true,
      stage: "Processing contacts",
      file_name: "a.csv",
      file_size: 10,
      total_contacts: 5,
      processed_contacts: 5,
      error_message: null,
    });
  });

  test("returns 500 with Unknown error when thrown value is not Error", async () => {
    downloadMode = { kind: "throw", value: "boom" };
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unknown error" });
  });

  test("returns 500 with error.message when thrown value is Error", async () => {
    downloadMode = { kind: "throw", value: new Error("boom") };
    const mod = await import("../app/routing/api/api.audience-upload-status");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api.audience-upload-status?uploadId=1&workspaceId=w1",
      ),
    } as any);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
