import { beforeEach, describe, expect, test, vi } from "vitest";
import { processAudienceUpload } from "../app/lib/audience-upload-process.server";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/lib/logger.server", () => ({ logger }));

describe("app/routes/api.audience-upload.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.info.mockReset();
    logger.debug.mockReset();
  });

  const makeReq = (fd: FormData, method = "POST") =>
    new Request("http://localhost/api/audience-upload", { method, body: fd });

  test("exports: isOtherDataArray + generateUniqueId", async () => {
    const mod = await import("../app/routing/api/api.audience-upload");
    expect(mod.isOtherDataArray([{ key: "a", value: 1 }])).toBe(true);
    expect(mod.isOtherDataArray([{ key: "a" } as any])).toBe(false);
    expect(mod.isOtherDataArray("no" as any)).toBe(false);

    const id1 = mod.generateUniqueId();
    const id2 = mod.generateUniqueId();
    expect(id1).not.toBe(id2);
    expect(id1).toContain("-");
  }, 30000);

  test("action: unauthorized, method not allowed, and validation errors", async () => {
    const mod = await import("../app/routing/api/api.audience-upload");

    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: null,
    }));

    const res401 = await mod.action({
      request: new Request("http://localhost/api/audience-upload", { method: "POST" }),
      deps: { verifyAuth },
    } as any);
    expect(res401.status).toBe(401);

    const verifyAuthUser = vi.fn(async () => ({
      supabaseClient: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const res405 = await mod.action({
      request: new Request("http://localhost/api/audience-upload", { method: "GET" }),
      deps: { verifyAuth: verifyAuthUser },
    } as any);
    expect(res405.status).toBe(405);

    const fd = new FormData();
    const res400a = await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any);
    expect(res400a.status).toBe(400);

    fd.set("workspace_id", "w1");
    const res400b = await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any);
    expect(res400b.status).toBe(400);

    fd.set("audience_name", "A");
    const res400c = await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any);
    expect(res400c.status).toBe(400);
  }, 30000);

  test("action: audienceId path validates audience, creates upload record, and starts background processing", async () => {
    const mod = await import("../app/routing/api/api.audience-upload");

    const processAudienceUpload = vi.fn(async () => {});
    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: { id: 1 }, error: null }),
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ data: null, error: null }),
            }),
          };
        }
        if (table === "audience_upload") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 99 }, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const verifyAuth = vi.fn(async () => ({
      supabaseClient,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["x"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Name: "name" }));
    fd.set("split_name_column", "Name");

    const res = await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth, processAudienceUpload },
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, audience_id: 1, upload_id: 99 });
    expect(body.message).toContain("Processing in background");
    expect(processAudienceUpload).toHaveBeenCalled();
  }, 30000);

  test("action: audienceId path returns 404 when audience missing", async () => {
    const mod = await import("../app/routing/api/api.audience-upload");

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };
    const verifyAuth = vi.fn(async () => ({
      supabaseClient,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["x"], "c.csv"));
    const res = await mod.action({ request: makeReq(fd), deps: { verifyAuth } } as any);
    expect(res.status).toBe(404);
  }, 30000);

  test("action: create-audience path handles audience insert/upload insert errors and catches invalid JSON", async () => {
    const mod = await import("../app/routing/api/api.audience-upload");

    const verifyAuth = vi.fn(async () => ({
      headers: new Headers(),
      user: { id: "u1" },
      supabaseClient: {
        from: (table: string) => {
          if (table === "audience") {
            return {
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: null, error: { message: "aud" } }),
                }),
              }),
            };
          }
          throw new Error("unexpected");
        },
      },
    }));

    const fd1 = new FormData();
    fd1.set("workspace_id", "w1");
    fd1.set("audience_name", "A");
    fd1.set("contacts", new File(["x"], "c.csv"));
    const r1 = await mod.action({ request: makeReq(fd1), deps: { verifyAuth } } as any);
    expect(r1.status).toBe(500);

    const supabaseUploadErr: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 1 }, error: null }),
              }),
            }),
          };
        }
        if (table === "audience_upload") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: "up" } }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };
    const verifyAuth2 = vi.fn(async () => ({
      headers: new Headers(),
      user: { id: "u1" },
      supabaseClient: supabaseUploadErr,
    }));

    const fd2 = new FormData();
    fd2.set("workspace_id", "w1");
    fd2.set("audience_name", "A");
    fd2.set("contacts", new File(["x"], "c.csv"));
    const r2 = await mod.action({ request: makeReq(fd2), deps: { verifyAuth: verifyAuth2 } } as any);
    expect(r2.status).toBe(500);

    const fdBadJson = new FormData();
    fdBadJson.set("workspace_id", "w1");
    fdBadJson.set("audience_name", "A");
    fdBadJson.set("contacts", new File(["x"], "c.csv"));
    fdBadJson.set("header_mapping", "{");
    const r3 = await mod.action({ request: makeReq(fdBadJson), deps: { verifyAuth: verifyAuth2 } } as any);
    expect(r3.status).toBe(500);
  }, 30000);

  test("action: create-audience success message and background .catch logging", async () => {
    vi.resetModules();
    const mod = await import("../app/routing/api/api.audience-upload");

    const processAudienceUpload = vi.fn(async () => {
      throw new Error("bg");
    });
    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "audience") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 1 }, error: null }),
              }),
            }),
          };
        }
        if (table === "audience_upload") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 99 }, error: null }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };
    const verifyAuth = vi.fn(async () => ({
      supabaseClient,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_name", "A");
    fd.set("contacts", new File(["x"], "c.csv"));
    // omit header_mapping and split_name_column to hit default {} / null branches
    const res = await mod.action({
      request: makeReq(fd),
      deps: { verifyAuth, processAudienceUpload },
    } as any);
    const body = await res.json();
    expect(body.message).toContain("Audience created");

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Background processing error:",
        expect.any(Error),
      );
    });
  }, 30000);

  test("action: calling without deps hits verifyAuth fallback", async () => {
    vi.resetModules();
    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {
        from: () => ({
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 1 }, error: null }),
            }),
          }),
        }),
      },
      headers: new Headers(),
      user: { id: "u1" },
    }));
    vi.doMock("@/lib/supabase.server", () => ({ verifyAuth }));

    const mod = await import("../app/routing/api/api.audience-upload");
    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_name", "A");
    fd.set("contacts", new File(["x"], "c.csv"));
    const res = await mod.action({ request: makeReq(fd) } as any);
    expect(res.status).toBe(200);
    expect(verifyAuth).toHaveBeenCalled();
  }, 30000);

  test("action: catch branch returns Unknown error for non-Error throw", async () => {
    const mod = await import("../app/routing/api/api.audience-upload");

    const verifyAuth = vi.fn(async () => ({
      supabaseClient: {
        from: () => {
          throw "boom";
        },
      },
      headers: new Headers(),
      user: { id: "u1" },
    }));
    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["x"], "c.csv"));
    const res = await mod.action({ request: makeReq(fd), deps: { verifyAuth } } as any);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unknown error" });
  }, 30000);

  test("processAudienceUpload: happy path maps contacts, writes progress, and completes", async () => {
    const uploads: any[] = [];
    const updates: any[] = [];
    const inserts: any[] = [];

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
      from: (table: string) => {
        if (table === "audience_upload") {
          return {
            update: (data: any) => ({
              eq: async () => {
                updates.push({ table, data });
                return { data: null, error: null };
              },
            }),
          };
        }
        if (table === "contact") {
          return {
            insert: (rows: any[]) => ({
              select: async () => {
                inserts.push({ table, rows });
                return { data: rows.map((_, i) => ({ id: i + 1 })), error: null };
              },
            }),
          };
        }
        if (table === "contact_audience") {
          return {
            insert: async (_rows: any[]) => ({ error: null }),
          };
        }
        if (table === "audience") {
          return {
            update: (_d: any) => ({ eq: async () => ({ data: null, error: null }) }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const parseCSVMock = vi.fn(() => ({
      headers: ["Name", "Email"],
      contacts: [{ Name: "Ada Lovelace", Email: "a@b.co" }],
    }));

    await processAudienceUpload(
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

    expect(parseCSVMock).toHaveBeenCalled();
    expect(uploads.length).toBeGreaterThan(0);
    expect(inserts[0].rows[0]).toMatchObject({
      workspace: "w1",
      created_by: "u1",
      firstname: "Ada",
      surname: "Lovelace",
      email: "a@b.co",
    });
    expect(logger.error).not.toHaveBeenCalled();
  }, 30000);

  test("processAudienceUpload: header mismatch and insert errors go through catch and write error status", async () => {
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
      from: (table: string) => {
        if (table === "audience") return { update: () => ({ eq: async () => ({}) }) };
        if (table === "audience_upload") return { update: () => ({ eq: async () => ({}) }) };
        if (table === "contact") {
          return {
            insert: () => ({
              select: async () => ({ data: null, error: { message: "ins" } }),
            }),
          };
        }
        if (table === "contact_audience") return { insert: async () => ({ error: null }) };
        throw new Error("unexpected");
      },
    };

    // Missing headers -> error
    await processAudienceUpload(
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
    await processAudienceUpload(
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
    // bucketError
    await processAudienceUpload(
      {
        storage: {
          listBuckets: async () => ({ data: null, error: { message: "b" } }),
          from: () => ({ upload: async () => ({ error: null }) }),
        },
        from: () => ({ update: () => ({ eq: async () => ({}) }) }),
      } as any,
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
    await processAudienceUpload(
      {
        storage: {
          listBuckets: async () => ({ data: [], error: null }),
          createBucket: async () => ({ error: { message: "c" } }),
          from: () => ({ upload: async () => ({ error: null }) }),
        },
        from: () => ({ update: () => ({ eq: async () => ({}) }) }),
      } as any,
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
    await processAudienceUpload(
      {
        storage: {
          listBuckets: async () => ({ data: [], error: null }),
          createBucket: async () => ({ error: null }),
          from: () => ({ upload: async () => ({ error: null }) }),
        },
        from: (t: string) => {
          if (t === "audience_upload") return { update: () => ({ eq: async () => ({}) }) };
          if (t === "audience") return { update: () => ({ eq: async () => ({}) }) };
          if (t === "contact") return { insert: () => ({ select: async () => ({ data: [], error: null }) }) };
          if (t === "contact_audience") return { insert: async () => ({ error: null }) };
          throw new Error("unexpected");
        },
      } as any,
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
    await processAudienceUpload(
      {
        storage: {
          listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
          from: () => ({ upload: async () => ({ error: { message: "s" } }) }),
        },
        from: () => ({ update: () => ({ eq: async () => ({}) }) }),
      } as any,
      1,
      2,
      "w1",
      "u1",
      Buffer.from("csv", "utf-8").toString("base64"),
      {},
      null,
      { parseCSV: vi.fn(() => ({ headers: [], contacts: [] })) as any },
    );

    // mapping warn branch via empty-string header
    await processAudienceUpload(
      {
        storage: {
          listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
          from: () => ({ upload: async () => ({ error: null }) }),
        },
        from: (t: string) => {
          if (t === "audience_upload") return { update: () => ({ eq: async () => ({}) }) };
          if (t === "contact") return { insert: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) };
          if (t === "contact_audience") return { insert: async () => ({ error: { message: "link" } }) };
          if (t === "audience") return { update: () => ({ eq: async () => ({}) }) };
          throw new Error("unexpected");
        },
      } as any,
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
    await processAudienceUpload(
      {
        storage: {
          listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
          from: () => ({ upload: async () => ({ error: null }) }),
        },
        from: (t: string) => {
          if (t === "audience_upload") return { update: () => ({ eq: async () => ({}) }) };
          if (t === "audience") return { update: () => ({ eq: async () => ({}) }) };
          if (t === "contact")
            return {
              insert: (_rows: any[]) => ({
                select: async () => ({ data: [{ id: 1 }], error: null }),
              }),
            };
          if (t === "contact_audience") return { insert: async () => ({ error: null }) };
          throw new Error("unexpected");
        },
      } as any,
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
    await processAudienceUpload(
      {
        storage: {
          listBuckets: async () => {
            throw "boom";
          },
          from: () => ({ upload: async () => ({ error: null }) }),
        },
        from: () => ({ update: () => ({ eq: async () => ({}) }) }),
      } as any,
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
    const supabaseOk: any = {
      storage: {
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        from: () => ({ upload: async () => ({ error: null }) }),
      },
      from: (t: string) => {
        if (t === "audience_upload") return { update: () => ({ eq: async () => ({}) }) };
        if (t === "contact") return { insert: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) };
        if (t === "contact_audience") return { insert: async () => ({ error: null }) };
        if (t === "audience") return { update: () => ({ eq: async () => ({}) }) };
        throw new Error("unexpected");
      },
    };
    const csv = "Email\nx@y.co\n";
    await processAudienceUpload(
      supabaseOk,
      1,
      2,
      "w1",
      "u1",
      Buffer.from(csv, "utf-8").toString("base64"),
      { Email: "email" },
      null,
    );
  }, 30000);

  test("processAudienceUpload covers remaining else-branches (splitNameColumn missing header, undefined values, and i!==0)", async () => {
    const supabaseClient: any = {
      storage: {
        listBuckets: async () => ({ data: [{ name: "audience-uploads" }], error: null }),
        from: () => ({ upload: async () => ({ error: null }) }),
      },
      from: (t: string) => {
        if (t === "audience_upload") return { update: () => ({ eq: async () => ({}) }) };
        if (t === "audience") return { update: () => ({ eq: async () => ({}) }) };
        if (t === "contact") {
          return {
            insert: (rows: any[]) => ({
              select: async () => ({
                data: rows.map((_: any, i: number) => ({ id: i + 1 })),
                error: null,
              }),
            }),
          };
        }
        if (t === "contact_audience") return { insert: async () => ({ error: null }) };
        throw new Error("unexpected");
      },
    };

    const contacts = Array.from({ length: 101 }, (_v, i) => {
      if (i === 0) return { Name: "Ada Lovelace", Email: "a@b.co" };
      if (i === 1) return { Name: "No Email", Email: undefined, Custom: "x" };
      return { Name: "N", Email: "x@y.co", Custom: undefined };
    });

    await processAudienceUpload(
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
  }, 30000);
});

