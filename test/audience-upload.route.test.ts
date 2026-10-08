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
    findCampaignForAudienceUpload: vi.fn(),
    linkAudienceToCampaign: vi.fn(),
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
const requireWorkspaceAccessMock = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

const enqueueJobMock = vi.hoisted(() =>
  vi.fn(async () => ({ enqueued: true, jobId: 1 })),
);

const processDbMocks = vi.hoisted(() => ({
  insertValues: vi.fn(async () => undefined),
}));

const objectStorageMocks = vi.hoisted(() => ({
  uploads: [] as Array<{ bucket: string; path: string; body: string }>,
  uploadObject: vi.fn(
    async (bucket: string, path: string, body: string) => {
      objectStorageMocks.uploads.push({ bucket, path, body });
    },
  ),
}));

vi.mock("@/lib/object-storage.server", () => ({
  uploadObject: (...args: unknown[]) => objectStorageMocks.uploadObject(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: any[]) =>
    requireWorkspaceAccessMock.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
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
vi.mock("@/lib/audience-upload-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audience-upload-db.server")>()),
  // processAudienceUpload dedupes against phones already in the audience.
  listAudiencePhones: vi.fn(async () => new Set<string>()),
  findAudienceInWorkspace: (...args: unknown[]) => dbMocks.findAudienceInWorkspace(...args),
  markAudienceUpdating: (...args: unknown[]) => dbMocks.markAudienceUpdating(...args),
  createAudienceForUpload: (...args: unknown[]) => dbMocks.createAudienceForUpload(...args),
  createAudienceUploadRecord: (...args: unknown[]) => dbMocks.createAudienceUploadRecord(...args),
  findCampaignForAudienceUpload: (...args: unknown[]) =>
    dbMocks.findCampaignForAudienceUpload(...args),
  linkAudienceToCampaign: (...args: unknown[]) => dbMocks.linkAudienceToCampaign(...args),
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
    dbMocks.findCampaignForAudienceUpload.mockReset();
    dbMocks.linkAudienceToCampaign.mockReset();
    processTdbMocks.contact.insertMany.mockReset();
    processTdbMocks.audience_upload.update.mockReset();
    processTdbMocks.audience.update.mockReset();
    processDbMocks.insertValues.mockReset();
    enqueueJobMock.mockReset();
    enqueueJobMock.mockResolvedValue({ enqueued: true, jobId: 1 });
    objectStorageMocks.uploads.length = 0;
    objectStorageMocks.uploadObject.mockReset();
    objectStorageMocks.uploadObject.mockImplementation(
      async (bucket: string, path: string, body: string) => {
        objectStorageMocks.uploads.push({ bucket, path, body });
      },
    );
    dbMocks.findAudienceInWorkspace.mockResolvedValue({ id: 1 });
    dbMocks.markAudienceUpdating.mockResolvedValue(undefined);
    dbMocks.createAudienceForUpload.mockResolvedValue({ id: 1 });
    dbMocks.createAudienceUploadRecord.mockResolvedValue({ id: 99 });
    dbMocks.findCampaignForAudienceUpload.mockResolvedValue(true);
    dbMocks.linkAudienceToCampaign.mockResolvedValue(true);
    processTdbMocks.contact.insertMany.mockImplementation(async (rows: unknown[]) =>
      (rows as Record<string, unknown>[]).map((_, i) => ({ id: i + 1 })),
    );
    processTdbMocks.audience_upload.update.mockResolvedValue([]);
    processTdbMocks.audience.update.mockResolvedValue([]);
    processDbMocks.insertValues.mockResolvedValue(undefined);
  });

  const makeReq = (fd: FormData, method = "POST") =>
    new Request("http://localhost/api/audience-upload", { method, body: fd });

  test("server helpers: isOtherDataArray + generateUniqueId", async () => {
    const mod = await import("@/lib/audience-upload-process.server");
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
      null: {} as any,
      headers: new Headers(),
      user: null,
    }));

    const res401 = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/audience-upload", { method: "POST" }),
      deps: { verifyAuth },
    } as any));
    expect(res401.status).toBe(401);

    const verifyAuthUser = vi.fn(async () => ({
      null: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const res405 = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/audience-upload", { method: "GET" }),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res405.status).toBe(405);

    const fd = new FormData();
    const res400a = await asRouteResponse(mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res400a.status).toBe(400);

    fd.set("workspace_id", "w1");
    const res400b = await asRouteResponse(mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res400b.status).toBe(400);

    fd.set("audience_name", "A");
    const res400c = await asRouteResponse(mod.action({
      request: makeReq(fd),
      deps: { verifyAuth: verifyAuthUser },
    } as any));
    expect(res400c.status).toBe(400);
  }, 30000);

  test("action: audienceId path validates audience, creates upload record, and enqueues processing job", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const enqueueJob = vi.fn(async () => ({ enqueued: true, jobId: 1 }));
    const verifyAuth = vi.fn(async () => ({
      null: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["Name,Phone\nAda,4165551234"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Name: "name", Phone: "phone" }));
    fd.set("split_name_column", "Name");

    const res = await asRouteResponse(mod.action({
      request: makeReq(fd),
      deps: { verifyAuth, enqueueJob },
    } as any));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, audience_id: 1, upload_id: 99 });
    expect(body.message).toContain("Processing in background");
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "audience_upload",
        workspaceId: "w1",
        userId: "u1",
        dedupe: { kind: "idempotency", key: "audience_upload:99" },
        params: expect.objectContaining({
          uploadId: 99,
          audienceId: 1,
          workspaceId: "w1",
          userId: "u1",
          splitNameColumn: "Name",
        }),
      }),
    );
  }, 30000);

  test("action: audienceId path returns 404 when audience missing", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const verifyAuth = vi.fn(async () => ({
      null: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));
    dbMocks.findAudienceInWorkspace.mockResolvedValueOnce(null);

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["Phone\n4165551234"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Phone: "phone" }));
    const res = await asRouteResponse(mod.action({ request: makeReq(fd), deps: { verifyAuth } } as any));
    expect(res.status).toBe(404);
  }, 30000);

  test("action: links a canonical upload to its campaign context", async () => {
    const mod = await import("../app/routes/api+/audience-upload");
    const verifyAuth = vi.fn(async () => ({
      headers: new Headers(),
      user: { id: "u1" },
      null: {} as any,
    }));
    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_name", "Campaign list");
    fd.set("campaign_id", "42");
    fd.set("contacts", new File(["Phone\n4165551234"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Phone: "phone" }));

    const res = await asRouteResponse(
      mod.action({ request: makeReq(fd), deps: { verifyAuth } } as any),
    );

    expect(res.status).toBe(200);
    expect(dbMocks.linkAudienceToCampaign).toHaveBeenCalledWith({
      workspaceId: "w1",
      campaignId: 42,
      audienceId: 1,
    });
  }, 30000);

  test("action: create-audience path handles audience insert/upload insert errors and catches invalid JSON", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const verifyAuth = vi.fn(async () => ({
      headers: new Headers(),
      user: { id: "u1" },
      null: {} as any,
    }));

    dbMocks.createAudienceForUpload.mockResolvedValueOnce(null);
    const fd1 = new FormData();
    fd1.set("workspace_id", "w1");
    fd1.set("audience_name", "A");
    fd1.set("contacts", new File(["Phone\n4165551234"], "c.csv"));
    fd1.set("header_mapping", JSON.stringify({ Phone: "phone" }));
    const r1 = await asRouteResponse(mod.action({ request: makeReq(fd1), deps: { verifyAuth } } as any));
    expect(r1.status).toBe(500);

    dbMocks.createAudienceUploadRecord.mockResolvedValueOnce(null);
    const fd2 = new FormData();
    fd2.set("workspace_id", "w1");
    fd2.set("audience_name", "A");
    fd2.set("contacts", new File(["Phone\n4165551234"], "c.csv"));
    fd2.set("header_mapping", JSON.stringify({ Phone: "phone" }));
    const r2 = await asRouteResponse(mod.action({ request: makeReq(fd2), deps: { verifyAuth } } as any));
    expect(r2.status).toBe(500);

    const fdBadJson = new FormData();
    fdBadJson.set("workspace_id", "w1");
    fdBadJson.set("audience_name", "A");
    fdBadJson.set("contacts", new File(["x"], "c.csv"));
    fdBadJson.set("header_mapping", "{");
    const r3 = await asRouteResponse(mod.action({ request: makeReq(fdBadJson), deps: { verifyAuth } } as any));
    expect(r3.status).toBe(400);
  }, 30000);

  test("action: create-audience success message enqueues upload job", async () => {
    vi.resetModules();
    const mod = await import("../app/routes/api+/audience-upload");

    const enqueueJob = vi.fn(async () => ({ enqueued: true, jobId: 1 }));
    const verifyAuth = vi.fn(async () => ({
      null: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));

    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_name", "A");
    fd.set("contacts", new File(["Phone\n4165551234"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Phone: "phone" }));
    // omit split_name_column to hit its null branch
    const res = await asRouteResponse(mod.action({
      request: makeReq(fd),
      deps: { verifyAuth, enqueueJob },
    } as any));
    const body = await res.json();
    expect(body.message).toContain("Audience created");
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "audience_upload",
        params: expect.objectContaining({
          uploadId: 99,
          splitNameColumn: null,
        }),
      }),
    );
  }, 30000);

  test("action: calling without deps hits verifyAuth fallback", async () => {
    vi.resetModules();
    setDualAuthSession({ headers: new Headers(),
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/api+/audience-upload");
    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_name", "A");
    fd.set("contacts", new File(["Phone\n4165551234"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Phone: "phone" }));
    const res = await asRouteResponse(mod.action({ request: makeReq(fd) } as any));
    expect(res.status).toBe(200);
  }, 30000);

  test("action: catch branch returns Unknown error for non-Error throw", async () => {
    const mod = await import("../app/routes/api+/audience-upload");

    const verifyAuth = vi.fn(async () => ({
      null: {} as any,
      headers: new Headers(),
      user: { id: "u1" },
    }));
    dbMocks.findAudienceInWorkspace.mockRejectedValueOnce("boom");
    const fd = new FormData();
    fd.set("workspace_id", "w1");
    fd.set("audience_id", "1");
    fd.set("contacts", new File(["Phone\n4165551234"], "c.csv"));
    fd.set("header_mapping", JSON.stringify({ Phone: "phone" }));
    const res = await asRouteResponse(mod.action({ request: makeReq(fd), deps: { verifyAuth } } as any));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unknown error" });
  }, 30000);

  test("real multipart upload preserves original BOM bytes through worker hashing and source coordinates", async () => {
    const mod = await import("../app/routes/api+/audience-upload");
    const { prepareAudienceImport } = await import("@/lib/audience-import-map.server");
    const raw = Buffer.from("\uFEFFPhone\r\n4165551234");
    let workerFile: string | undefined;
    const enqueueJob = vi.fn(async (job: { params: { fileContent: string } }) => {
      workerFile = job.params.fileContent;
      return { enqueued: true, jobId: 1 };
    });
    const fd = new FormData(); fd.set("workspace_id", "w1"); fd.set("audience_id", "1");
    fd.set("contacts", new File([raw], "bom.csv"));
    fd.set("header_mapping", JSON.stringify({ Phone: "phone" }));
    const result = await asRouteResponse(mod.action({ request:makeReq(fd), deps:{
      verifyAuth:async () => ({ headers:new Headers(), user:{id:"u1"} }), enqueueJob,
    } } as any));
    expect(result.status).toBe(200);
    const original = objectStorageMocks.uploads.find(upload => upload.path.endsWith("/original.csv"));
    expect(original?.body).toEqual(new Uint8Array(raw));
    if (!workerFile) throw new Error("Upload did not enqueue source bytes");
    const prepared = prepareAudienceImport(Buffer.from(workerFile, "base64"), { Phone:"phone" }, null, null);
    expect(prepared.fileSha256).toBe("ac154b1275fb94a369c31ca0468817a37112bcb4784115e95920cc1f5383d46d");
    expect(prepared.contacts[0].source).toEqual({recordNumber:2,startLine:2,endLine:2,byteStart:10,byteEnd:20});
    expect(prepared.identity).not.toBe(prepareAudienceImport(Buffer.from("Phone\r\n4165551234"), { Phone:"phone" }, null, null).identity);
  });

  test("invalid UTF-8 is rejected at the multipart boundary before any audience or upload writes", async () => {
    const mod = await import("../app/routes/api+/audience-upload");
    const fd = new FormData(); fd.set("workspace_id", "w1"); fd.set("audience_name", "New audience");
    fd.set("contacts", new File([new Uint8Array([80,104,111,110,101,10,255])], "invalid.csv"));
    fd.set("header_mapping", JSON.stringify({ Phone:"phone" }));
    const enqueueJob = vi.fn(async () => ({ enqueued:true, jobId:1 }));
    const result = await asRouteResponse(mod.action({ request:makeReq(fd), deps:{
      verifyAuth:async () => ({ headers:new Headers(), user:{id:"u1"} }), enqueueJob,
    } } as any));
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({error:"CSV must be valid UTF-8"});
    expect(dbMocks.createAudienceForUpload).not.toHaveBeenCalled();
    expect(dbMocks.createAudienceUploadRecord).not.toHaveBeenCalled();
    expect(objectStorageMocks.uploadObject).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

});
