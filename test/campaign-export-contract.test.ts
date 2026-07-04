import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";

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

const campaignIvrMocks = vi.hoisted(() => ({
  findCampaignExportMeta: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
  getCampaignQueueContactIds: vi.fn(),
}));

const exportDbMocks = vi.hoisted(() => ({
  findCampaignForMessageExport: vi.fn(),
  findCampaignWithScriptForExport: vi.fn(),
  findExportContactsByIds: vi.fn(),
  countExportCampaignMessages: vi.fn(),
  listExportCampaignMessages: vi.fn(),
  countExportOutreachAttempts: vi.fn(),
  listExportOutreachAttempts: vi.fn(),
  findExportCallsByOutreachAttemptIds: vi.fn(),
}));

vi.mock("@/lib/campaign-export-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-export-db.server")>();
  return {
    ...actual,
    findCampaignForMessageExport: (...args: unknown[]) =>
      exportDbMocks.findCampaignForMessageExport(...args),
    findCampaignWithScriptForExport: (...args: unknown[]) =>
      exportDbMocks.findCampaignWithScriptForExport(...args),
    findExportContactsByIds: (...args: unknown[]) =>
      exportDbMocks.findExportContactsByIds(...args),
    countExportCampaignMessages: (...args: unknown[]) =>
      exportDbMocks.countExportCampaignMessages(...args),
    listExportCampaignMessages: (...args: unknown[]) =>
      exportDbMocks.listExportCampaignMessages(...args),
    countExportOutreachAttempts: (...args: unknown[]) =>
      exportDbMocks.countExportOutreachAttempts(...args),
    listExportOutreachAttempts: (...args: unknown[]) =>
      exportDbMocks.listExportOutreachAttempts(...args),
    findExportCallsByOutreachAttemptIds: (...args: unknown[]) =>
      exportDbMocks.findExportCallsByOutreachAttemptIds(...args),
  };
});

vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-queue-db.server")>();
  return {
    ...actual,
    getCampaignQueueContactIds: (...args: unknown[]) =>
      queueMocks.getCampaignQueueContactIds(...args),
  };
});

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-ivr.server")>();
  return {
    ...actual,
    findCampaignExportMeta: (...args: unknown[]) =>
      campaignIvrMocks.findCampaignExportMeta(...args),
  };
});

type UploadRecord = {
  path: string;
  bytes: Uint8Array;
  text: string;
  contentType?: string;
};
let objectStorageUploads: UploadRecord[] = [];

vi.mock("@/lib/object-storage.server", () => ({
  uploadObject: vi.fn(async (_bucket: string, path: string, body: any, opts?: any) => {
    if (path.endsWith(".csv")) {
      const bytes =
        typeof body === "string"
          ? new TextEncoder().encode(body)
          : body instanceof Blob
            ? new Uint8Array(await body.arrayBuffer())
            : new TextEncoder().encode(String(body));
      const text = new TextDecoder("utf-8").decode(bytes);
      objectStorageUploads.push({
        path,
        bytes,
        text,
        contentType: opts?.contentType,
      });
    }
  }),
  createSignedObjectUrl: vi.fn(async () => "http://signed.example"),
  deleteObject: vi.fn(),
  listObjects: vi.fn(async () => []),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ user: { id: "u1" }, headers: new Headers() }),
}));

async function flushMicrotasks(iterations = 25) {
  for (let i = 0; i < iterations; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

const campaignRow = {
  id: 123,
  type: "message",
  title: "TestCampaign",
  workspace: "w1",
  start_date: "2026-01-01T00:00:00.000Z",
  end_date: "2026-01-02T00:00:00.000Z",
};

const contactRow = {
  id: 1,
  firstname: "=1+1",
  surname: "Smith",
  phone: "+15555550101",
  email: "a@example.com",
  address: "1 Main St",
  city: "Town",
  opt_out: false,
  created_at: "2026-01-01T00:00:00.000Z",
  workspace: "w1",
};

const messageRow = {
  id: "m1",
  body: "hello",
  from: "+15555550101",
  to: "+15555550102",
  direction: "outbound-api",
  status: "delivered",
  date_created: "2026-01-01T00:00:00.000Z",
  date_sent: "2026-01-01T00:00:00.000Z",
  workspace: "w1",
};

describe("api.campaign-export CSV contract checks", () => {
  beforeEach(() => {
    objectStorageUploads = [];
    requireWorkspaceAccess.mockClear();
    campaignIvrMocks.findCampaignExportMeta.mockResolvedValue(campaignRow);
    queueMocks.getCampaignQueueContactIds.mockResolvedValue([1]);
    exportDbMocks.findCampaignForMessageExport.mockResolvedValue(campaignRow);
    exportDbMocks.findExportContactsByIds.mockResolvedValue([contactRow]);
    exportDbMocks.countExportCampaignMessages.mockResolvedValue(1);
    exportDbMocks.listExportCampaignMessages.mockResolvedValue([messageRow]);
    setDualAuthSession({
      user: { id: "u1" },
    });
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: any) => {
      if (typeof fn === "function") fn();
      return 0 as any;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("produces BOM + CRLF CSV and neutralizes CSV injection", async () => {
    const mod = await import("../app/routes/api+/campaign-export");
    const fd = new FormData();
    fd.set("campaignId", "123");
    fd.set("workspaceId", "w1");
    const req = new Request("http://localhost/api/campaign-export", {
      method: "POST",
      body: fd,
    });

    const res = await asRouteResponse(await mod.action({ request: req } as any));
    expect(res.status).toBe(200);
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);

    // export runs asynchronously; flush microtasks until the CSV upload has happened
    await flushMicrotasks();

    const csvUpload = objectStorageUploads.find((u) => u.path.endsWith(".csv"));
    expect(csvUpload).toBeTruthy();
    const csvText = csvUpload!.text;

    expect(Array.from(csvUpload!.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM bytes
    expect(csvText).toContain("\r\n"); // CRLF

    // Contract: formula-like strings must be neutralized with a leading single quote.
    // Contact firstname is `=1+1` and should be emitted as `'=1+1`.
    expect(csvText).toContain(",'=1+1,");
  }, 30000);
});
