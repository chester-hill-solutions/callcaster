import { beforeEach, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { AppError } from "@/lib/errors.server";
import { PgDialect } from "drizzle-orm/pg-core";
import { action } from "@/routes/api+/audience-upload.action.server";
import { asRouteResponse } from "./helpers/route-result";

const io = vi.hoisted(() => ({
  uploadObject: vi.fn(), enqueue: vi.fn(), updateUpload: vi.fn(), tenantDb: vi.fn(),
  markAudienceUpdating: vi.fn(), createAudience: vi.fn(), createUpload: vi.fn(),
  findAudience: vi.fn(), events: [] as string[],
}));
vi.mock("@/lib/object-storage.server", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  uploadObject: io.uploadObject,
}));
vi.mock("@/lib/audience-upload-db.server", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/audience-upload-db.server")>()),
  findAudienceInWorkspace: io.findAudience,
  markAudienceUpdating: io.markAudienceUpdating,
  createAudienceForUpload: io.createAudience,
  createAudienceUploadRecord: io.createUpload,
}));
vi.mock("@/server/tenant-db", async importOriginal => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: io.tenantDb,
}));

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const source = new TextEncoder().encode('﻿First Name,Phone,Note\r\nZoé,4165551234,"a comma, and\r\na new line"\r\n');
const mapping = { "First Name": "firstname", Phone: "phone", Note: "other_data" };
const session = async () => ({ headers: new Headers(), user: { id: workspaceId } });

async function send(options: { access?: () => Promise<void>; mapping?: Record<string, string>; file?: Uint8Array; existing?: boolean } = {}) {
  const form = new FormData();form.set("workspace_id", workspaceId);
  if (options.existing !== false) form.set("audience_id", "22");else form.set("audience_name", "New audience");
  form.set("contacts", new File([options.file ?? source], "customer-source.csv", { type: "text/csv" }));
  form.set("header_mapping", JSON.stringify(options.mapping ?? mapping));
  const request = new Request("http://localhost/api/audience-upload", { method: "POST", body: form });
  return asRouteResponse(action({ request, params: {}, context: new RouterContextProvider(),
    deps: { verifyAuth: session, enqueueJob: io.enqueue, requireWorkspaceAccess: options.access ?? (async () => {}) },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();io.events.length = 0;
  io.uploadObject.mockReset().mockImplementation(async () => { io.events.push("stored"); });
  io.enqueue.mockReset().mockImplementation(async () => { io.events.push("enqueued");return { enqueued: true, jobId: 1 }; });
  io.updateUpload.mockReset().mockResolvedValue([]);
  io.tenantDb.mockReset().mockReturnValue({ audience_upload: { update: io.updateUpload } });
  io.markAudienceUpdating.mockReset().mockResolvedValue(undefined);
  io.findAudience.mockReset().mockResolvedValue({ id: 22 });
  io.createAudience.mockReset().mockResolvedValue({ id: 22 });
  io.createUpload.mockReset().mockResolvedValue({ id: 99 });
});

test("retains literal original bytes privately before enqueue, including BOM and multiline UTF-8", async () => {
  const response = await send();expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, audience_id: 22, upload_id: 99 });
  expect(io.uploadObject).toHaveBeenCalledTimes(1);
  const [bucket, key, bytes, options] = io.uploadObject.mock.calls[0] ?? [];
  expect(bucket).toBe("audience-uploads");expect(key).toBe(`${workspaceId}/99/original.csv`);
  expect(Buffer.from(bytes)).toEqual(Buffer.from(source));
  expect(options).toMatchObject({ contentType: "text/csv; charset=utf-8", cacheControl: "no-store", upsert: false });
  expect(io.events).toEqual(["stored", "enqueued"]);
  expect(io.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    type: "audience_upload", workspaceId, userId: workspaceId,
    dedupe: { kind: "idempotency", key: "audience_upload:99" },
    params: expect.objectContaining({ audienceId: 22, uploadId: 99, headerMapping: mapping }),
  }));
});

test("holds enqueue and existing-audience status until original storage acknowledges", async () => {
  let resolveStorage: () => void = () => {};
  let notifyStorage: () => void = () => {};
  const reachedStorage = new Promise<void>(resolve => { notifyStorage = resolve; });
  io.uploadObject.mockImplementation(() => new Promise<void>(resolve => { resolveStorage = resolve;notifyStorage(); }));
  const pending = send();
  try {
    await Promise.race([reachedStorage, pending.then(() => { throw new Error("Request ended before storage acknowledgement"); })]);
    expect(io.enqueue).not.toHaveBeenCalled();expect(io.markAudienceUpdating).not.toHaveBeenCalled();
  } finally {
    resolveStorage();await pending;
  }
  expect((await pending).status).toBe(200);expect(io.enqueue).toHaveBeenCalledTimes(1);
});

test("storage failure fails the upload record and leaves existing audience and queue unchanged", async () => {
  io.uploadObject.mockRejectedValueOnce(new Error("fixture storage unavailable"));
  const response = await send();expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ error: expect.any(String) });
  expect(io.updateUpload).toHaveBeenCalledWith(expect.objectContaining({ set: { status: "error", error_message: "Original audience CSV could not be saved" } }));
  expect(io.tenantDb).toHaveBeenCalledWith(workspaceId);
  expect(new PgDialect().sqlToQuery(io.updateUpload.mock.calls[0]?.[0].where).params).toEqual([99]);
  expect(io.enqueue).not.toHaveBeenCalled();expect(io.markAudienceUpdating).not.toHaveBeenCalled();
});

test("new audience also requires retained source before its worker starts", async () => {
  const response = await send({ existing: false });expect(response.status).toBe(200);
  expect(io.createAudience).toHaveBeenCalledWith(workspaceId, "New audience");
  expect(io.events).toEqual(["stored", "enqueued"]);
});

test("denied workspace performs no original storage or upload enqueue", async () => {
  const response = await send({ access: async () => { throw new AppError("Workspace not found", 404); } });
  expect(response.status).toBe(404);expect(io.uploadObject).not.toHaveBeenCalled();expect(io.createUpload).not.toHaveBeenCalled();expect(io.enqueue).not.toHaveBeenCalled();
});

test("foreign audience control performs no original storage or upload enqueue", async () => {
  io.findAudience.mockResolvedValueOnce(null);const response = await send();expect(response.status).toBe(404);
  expect(io.uploadObject).not.toHaveBeenCalled();expect(io.createUpload).not.toHaveBeenCalled();expect(io.enqueue).not.toHaveBeenCalled();
});

test.each([
  { name: "invalid mapping", status: 400, options: { mapping: { "First Name": "unsupported" } } },
  { name: "missing mapped header", status: 400, options: { mapping: { Missing: "firstname" } } },
  { name: "malformed CSV", status: 500, options: { file: new TextEncoder().encode('First Name,Phone,Note\n"Unclosed') } },
])("$name performs no original storage or enqueue", async ({ options, status }) => {
  const response = await send(options);expect(response.status).toBe(status);
  expect(io.uploadObject).not.toHaveBeenCalled();expect(io.enqueue).not.toHaveBeenCalled();
});
