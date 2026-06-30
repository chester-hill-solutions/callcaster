import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const dbMocks = vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
  return {
    findAudienceInWorkspace: vi.fn(),
    markAudienceUpdating: vi.fn(),
    createAudienceForUpload: vi.fn(),
    createAudienceUploadRecord: vi.fn(),
  };
});

const processTdbMocks = vi.hoisted(() => ({
  contact: {
    insertMany: vi.fn(async (rows: unknown[]) =>
      (rows as Record<string, unknown>[]).map((_, i) => ({ id: i + 1 })),
    ),
  },
  audience_upload: {
    update: vi.fn(async () => []),
  },
  audience: {
    update: vi.fn(async () => []),
  },
}));

const processDbMocks = vi.hoisted(() => ({
  insertValues: vi.fn(async () => undefined),
}));

vi.mock("@/lib/logger.server", () => ({ logger }));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => processTdbMocks),
}));
vi.mock("@/server/db", () => ({
  db: {
    insert: () => ({ values: processDbMocks.insertValues }),
  },
}));
vi.mock("@/lib/audience-upload-db.server", () => ({
  findAudienceInWorkspace: (...args: unknown[]) => dbMocks.findAudienceInWorkspace(...args),
  markAudienceUpdating: (...args: unknown[]) => dbMocks.markAudienceUpdating(...args),
  createAudienceForUpload: (...args: unknown[]) => dbMocks.createAudienceForUpload(...args),
  createAudienceUploadRecord: (...args: unknown[]) => dbMocks.createAudienceUploadRecord(...args),
}));

describe("app/routes/api+/audience-upload/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.info.mockReset();
    logger.debug.mockReset();
    dbMocks.findAudienceInWorkspace.mockReset();
    dbMocks.markAudienceUpdating.mockReset();
    dbMocks.createAudienceForUpload.mockReset();
    dbMocks.createAudienceUploadRecord.mockReset();
    processTdbMocks.contact.insertMany.mockReset();
    processTdbMocks.audience_upload.update.mockReset();
    processTdbMocks.audience.update.mockReset();
    processDbMocks.insertValues.mockReset();
    dbMocks.findAudienceInWorkspace.mockResolvedValue({ id: 1 });
    dbMocks.markAudienceUpdating.mockResolvedValue(undefined);
    dbMocks.createAudienceForUpload.mockResolvedValue({ id: 1 });
    dbMocks.createAudienceUploadRecord.mockResolvedValue({ id: 99 });
    processTdbMocks.contact.insertMany.mockImplementation(async (rows: unknown[]) =>
      (rows as Record<string, unknown>[]).map((_, i) => ({ id: i + 1 })),
    );
    processTdbMocks.audience_upload.update.mockResolvedValue([]);
    processTdbMocks.audience.update.mockResolvedValue([]);
    processDbMocks.insertValues.mockResolvedValue(undefined);
  });

  const makeReq = (fd: FormData, method = "POST") =>
    new Request("http://localhost/api/audience-upload", { method, body: fd });

  test("exports: isOtherDataArray + generateUniqueId", async () => {
    const mod = await import("../app/routes/api+/audience-upload");
    expect(mod.isOtherDataArray([{ key: "a", value: 1 }])).toBe(true);
    expect(mod.isOtherDataArray([{ key: "a" } as any])).toBe(false);
    expect(mod.isOtherDataArray("no" as any)).toBe(false);

    const id1 = mod.generateUniqueId();
    const id2 = mod.generateUniqueId();
    expect(id1).not.toBe(id2);
    expect(id1).toContain("-");
  }, 30000);

  test("action: unauthorized, method not allowed, and validation errors", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: null,
    }));

    const res401 = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audience-upload", { method: "POST" }),
      deps: { verifyAuth },
    } as any));
    expect(res401.status).toBe(401);

    const verifyAuthUser = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const res405 = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audience-upload", { method: "GET" }),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res405.status).toBe(405);

    const fd = new FormData();
    const res400a = await asRouteResponse(await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res400a.status).toBe(400);

    fd.set("workspace_id", "w1");
    const res400b = await asRouteResponse(await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res400b.status).toBe(400);

    fd.set("audience_name", "A");
    const res400c = await asRouteResponse(await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res400c.status).toBe(400);
  }, 30000);

  test("action: audienceId path validates audience, creates upload record, and starts background processing", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const processAudienceUpload = vi.fn(async () => {});
    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["x"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Name: "name" }));
    fd.set("split_name_column", "Name");

    const res = await asRouteResponse(await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth, processAudienceUpload },
    } as any));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, audience_id: 1, upload_id: 99 });
    expect(body.message).toContain("Processing in background");
    expect(processAudienceUpload).toHaveBeenCalled();
  }, 30000);

  test("action: audienceId path returns 404 when audience missing", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));
    dbMocks.findAudienceInWorkspace.mockResolvedValueOnce(null);

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["x"], "c.csv"));
    const res = await asRouteResponse(await mod.action({ request: makeReq(fd), deps: { verifyAuth } } as any));
    expect(res.status).toBe(404);
  }, 30000);

  test("action: create-audience path handles audience insert/upload insert errors and catches invalid JSON", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const verifyAuth = vi.fn(async () => ({
      headers: new Headers(),
      user: { id: "u1" },
      supabaseClient: {} as any,
    }));

    dbMocks.createAudienceForUpload.mockResolvedValueOnce(null);
    const fd1 = new FormData();
    fd1.set("workspace_id", "w1");
    fd1.set("audience_name", "A");
    fd1.set("contacts", new File(["x"], "c.csv"));
    const r1 = await asRouteResponse(await mod.action({ request: makeReq(fd1), deps: { verifyAuth } } as any));
    expect(r1.status).toBe(500);

    dbMocks.createAudienceUploadRecord.mockResolvedValueOnce(null);
    const fd2 = new FormData();
    fd2.set("workspace_id", "w1");
    fd2.set("audience_name", "A");
    fd2.set("contacts", new File(["x"], "c.csv"));
    const r2 = await asRouteResponse(await mod.action({ request: makeReq(fd2), deps: { verifyAuth } } as any));
    expect(r2.status).toBe(500);

    const fdBadJson = new FormData();
    fdBadJson.set("workspace_id", "w1");
    fdBadJson.set("audience_name", "A");
    fdBadJson.set("contacts", new File(["x"], "c.csv"));
    fdBadJson.set("header_mapping", "{");
    const r3 = await asRouteResponse(await mod.action({ request: makeReq(fdBadJson), deps: { verifyAuth } } as any));
    expect(r3.status).toBe(500);
  }, 30000);

  test("action: create-audience success message and background .catch logging", async () => {
    vi.resetModules();
    const mod = await import("../app/routes/api+/audience-upload");

    const processAudienceUpload = vi.fn(async () => {
      throw new Error("bg");
    });
    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_name", "A");
    fd.set("contacts", new File(["x"], "c.csv"));
    // omit header_mapping and split_name_column to hit default {} / null branches
    const res = await asRouteResponse(await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth, processAudienceUpload },
    } as any));
    const body = await res.json();
    expect(body.message).toContain("Audience created");

    // let the background rejection propagate to the attached .catch
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalledWith(
      "Background processing error:",
      expect.any(Error),
    );
  }, 30000);

  test("action: calling without deps hits verifyAuth fallback", async () => {
    vi.resetModules();
    setDualAuthSession({
      supabaseClient: {},
      headers: new Headers(),
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/api+/audience-upload");
    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_name", "A");
    fd.set("contacts", new File(["x"], "c.csv"));
    const res = await asRouteResponse(await mod.action({ request: makeReq(fd) } as any));
    expect(res.status).toBe(200);
  }, 30000);

  test("action: catch branch returns Unknown error for non-Error throw", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));
    dbMocks.findAudienceInWorkspace.mockRejectedValueOnce("boom");
    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["x"], "c.csv"));
    const res = await asRouteResponse(await mod.action({ request: makeReq(fd), deps: { verifyAuth } } as any));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unknown error" });
  }, 30000);

  test("processAudienceUpload: happy path maps contacts, writes progress, and completes", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api+/audience-upload");

    const uploads: any[] = [];

    const supabaseClient: any = {
      storage: {
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        createBucket: async () => ({ error: null }),
        from: () => ({
          upload: async (path: string, body: string) => {
            uploads.push({ path, body });
            return { error: null };
          },
        }),
      },
    };

    const parseCSVMock = vi.fn(() => ({
      headers: ["Name", "Email"],
      contacts: [{ Name: "Ada Lovelace", Email: "a@b.co" }],
    }));

    const uploadPromise = mod.processAudienceUpload(
      supabaseClient,
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      { Name: "name", Email: "email" },
      "Name",
      { parseCSV: parseCSVMock as any },
    );
    await vi.runAllTimersAsync();
    await uploadPromise;
    vi.useRealTimers();

    expect(parseCSVMock).toHaveBeenCalled();
    expect(uploads.length).toBeGreaterThan(0);
    expect(processTdbMocks.contact.insertMany.mock.calls[0][0][0]).toMatchObject({
      workspace: "w1",
      created_by: "u1",
      firstname: "Ada",
      surname: "Lovelace",
      email: "a@b.co",
    });
    expect(logger.error).not.toHaveBeenCalled();
  }, 30000);

  test("processAudienceUpload: header mismatch and insert errors go through catch and write error status", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const uploads: any[] = [];
    const supabaseClient: any = {
      storage: {
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        createBucket: async () => ({ error: null }),
        from: () => ({
          upload: async (path: string, body: string) => {
            uploads.push({ path, body });
            return { error: null };
          },
        }),
      },
    };

    // Missing headers -> error
    await mod.processAudienceUpload(
      supabaseClient,
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      { Missing: "email" },
      null,
      { parseCSV: vi.fn(() => ({ headers: ["Email"], contacts: [] })) as any },
    );
    expect(uploads.some((u) => u.body.includes('"status":"error"'))).toBe(true);

    // Insert error -> error path
    processTdbMocks.contact.insertMany.mockResolvedValueOnce([]);
    await mod.processAudienceUpload(
      supabaseClient,
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      { Email: "email" },
      null,
      { parseCSV: vi.fn(() => ({ headers: ["Email"], contacts: [{ Email: "a@b.co" }] })) as any },
    );
    expect(uploads.some((u) => u.body.includes("Error inserting contacts"))).toBe(true);
  }, 30000);

  test("processAudienceUpload covers bucket/status/link errors and default deps branch", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const storageOnly = (storage: Record<string, unknown>) => ({ storage }) as any;

    // bucketError
    await mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => ({ data: null, error: { message: "b" } }),
        from: () => ({ upload: async () => ({ error: null }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      {},
      null,
      { parseCSV: vi.fn(() => ({ headers: [], contacts: [] })) as any },
    );

    // missing bucket + createBucket error
    await mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => ({ data: [], error: null }),
        createBucket: async () => ({ error: { message: "c" } }),
        from: () => ({ upload: async () => ({ error: null }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      {},
      null,
      { parseCSV: vi.fn(() => ({ headers: [], contacts: [] })) as any },
    );

    // missing bucket + createBucket success (covers else path for createError)
    await mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => ({ data: [], error: null }),
        createBucket: async () => ({ error: null }),
        from: () => ({ upload: async () => ({ error: null }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      {},
      null,
      { parseCSV: vi.fn(() => ({ headers: [], contacts: [] })) as any },
    );

    // statusError
    await mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        from: () => ({ upload: async () => ({ error: { message: "s" } }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      {},
      null,
      { parseCSV: vi.fn(() => ({ headers: [], contacts: [] })) as any },
    );

    // mapping warn branch via empty-string header + link insert failure
    processDbMocks.insertValues.mockRejectedValueOnce(new Error("link"));
    await mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        from: () => ({ upload: async () => ({ error: null }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      { "": "email", Custom: "other_data" },
      "Name",
      {
        parseCSV: vi.fn(() => ({
          headers: ["", "Name", "Custom"],
          contacts: [{ "": "x", Name: undefined, Custom: "v" }],
        })) as any,
      },
    );

    // other_data mapping branch with defined value + splitNameColumn actualHeader present (and empty name => '' fallbacks)
    await mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        from: () => ({ upload: async () => ({ error: null }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      { Name: "name", Custom: "other_data" },
      "Name",
      {
        parseCSV: vi.fn(() => ({
          headers: ["Name", "Custom"],
          contacts: [{ Name: "", Custom: "v" }],
        })) as any,
      },
    );

    // Cover "Unknown error" branches in catch (non-Error throw)
    await mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => {
          throw "boom";
        },
        from: () => ({ upload: async () => ({ error: null }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      {},
      null,
      { parseCSV: vi.fn(() => ({ headers: [], contacts: [] })) as any },
    );

    // default deps branch (no deps arg)
    vi.useFakeTimers();
    const csv = "Email\nx@y.co\n";
    const defaultDepsPromise = mod.processAudienceUpload(
      storageOnly({
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        from: () => ({ upload: async () => ({ error: null }) }),
      }),
      1,
      2,
      "w1",
      "u1",
      Buffer.from(csv, "utf-8").toString("base64"),
      { Email: "email" },
      null,
    );
    await vi.runAllTimersAsync();
    await defaultDepsPromise;
    vi.useRealTimers();
  }, 30000);

  test("processAudienceUpload covers remaining else-branches (splitNameColumn missing header, undefined values, and i!==0)", async () => {
    vi.useFakeTimers();
    const mod = await import("../app/routes/api+/audience-upload");

    const supabaseClient: any = {
      storage: {
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        from: () => ({ upload: async () => ({ error: null }) }),
      },
    };

    const contacts = Array.from({ length: 101 }, (_v, i) => {
      if (i === 0) return { Name: "Ada Lovelace", Email: "a@b.co" };
      if (i === 1) return { Name: "No Email", Email: undefined, Custom: "x" };
      return { Name: "N", Email: "x@y.co", Custom: undefined };
    });

    const uploadPromise = mod.processAudienceUpload(
      supabaseClient,
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      { Name: "name", Email: "email", Custom: "other_data" },
      "Nope", // splitNameColumn not present in headers
      { parseCSV: vi.fn(() => ({ headers: ["Name", "Email", "Custom"], contacts })) as any },
    );
    await vi.runAllTimersAsync();
    await uploadPromise;
    vi.useRealTimers();
  }, 30000);
});

