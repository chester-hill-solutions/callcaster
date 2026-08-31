import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const requireWorkspaceAccess = vi.fn(async () => undefined);
vi.mock("@/lib/database/workspace.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/database/workspace.server")
  >("@/lib/database/workspace.server");
  return { ...actual, requireWorkspaceAccess };
});

const campaignIvrMocks = vi.hoisted(() => ({
  findCampaignExportMeta: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
  getCampaignQueueContactIds: vi.fn(),
  findDequeuedQueueRowsForCampaign: vi.fn(),
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
    findDequeuedQueueRowsForCampaign: (...args: unknown[]) =>
      queueMocks.findDequeuedQueueRowsForCampaign(...args),
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
    queueMocks.findDequeuedQueueRowsForCampaign.mockResolvedValue([]);
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

    const res = await asRouteResponse(mod.action({ request: req } as any));
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

  test("SMS export surfaces error_code, error_message, and line_type per issue #1416", async () => {
    // Three contacts × three message states so the export shape is
    // observable: delivered mobile, 30006 landline, 30003 disconnected.
    // Without these columns the three failed rows are indistinguishable
    // in the CSV.
    const contacts = [
      { ...contactRow, id: 10, firstname: "Del", phone: "+15555550100", line_type: "mobile" },
      { ...contactRow, id: 11, firstname: "Land", phone: "+15555550101", line_type: "landline" },
      { ...contactRow, id: 12, firstname: "Disc", phone: "+15555550102", line_type: null },
    ];
    // Outbound-api messages: `from` is the workspace Twilio number
    // (identical across rows, does NOT match a contact); `to` is the
    // contact phone. The export matcher keys on cleaned digits of either
    // field, so distinct `to` values are what map each message to its
    // contact.
    const twilioFrom = "+15559990000";
    const messages = [
      {
        ...messageRow,
        id: "m10",
        from: twilioFrom,
        to: "+15555550100",
        status: "delivered",
        error_code: null,
        error_message: null,
      },
      {
        ...messageRow,
        id: "m11",
        from: twilioFrom,
        to: "+15555550101",
        status: "undelivered",
        error_code: 30006,
        error_message: "Landline or unreachable carrier",
      },
      {
        ...messageRow,
        id: "m12",
        from: twilioFrom,
        to: "+15555550102",
        status: "undelivered",
        error_code: 30003,
        error_message: "Unreachable destination handset",
      },
    ];
    queueMocks.getCampaignQueueContactIds.mockResolvedValue([10, 11, 12]);
    exportDbMocks.findExportContactsByIds.mockResolvedValue(contacts);
    exportDbMocks.countExportCampaignMessages.mockResolvedValue(messages.length);
    exportDbMocks.listExportCampaignMessages.mockResolvedValue(messages);

    const mod = await import("../app/routes/api+/campaign-export");
    const fd = new FormData();
    fd.set("campaignId", "123");
    fd.set("workspaceId", "w1");
    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://localhost/api/campaign-export", {
          method: "POST",
          body: fd,
        }),
      } as any),
    );
    expect(res.status).toBe(200);
    await flushMicrotasks();

    const csvUpload = objectStorageUploads.find((u) => u.path.endsWith(".csv"));
    if (!csvUpload) throw new Error("expected a .csv upload from the export");
    const csvText = csvUpload.text;

    const headerLine = csvText.split("\r\n")[0].replace(/^\uFEFF/, "");
    // Header names AND relative order matter — downstream consumers key by column index.
    expect(headerLine).toContain("status,error_code,error_message,line_type,message_date");

    // Delivered mobile: empty error fields, mobile line_type.
    expect(csvText).toContain(",delivered,,,mobile,");
    // 30006 landline: numeric error code, message text, landline line_type.
    expect(csvText).toContain(",undelivered,30006,Landline or unreachable carrier,landline,");
    // 30003 disconnected: numeric error code, message text, null line_type surfaced as empty cell.
    expect(csvText).toContain(",undelivered,30003,Unreachable destination handset,,");
  }, 30000);

  test("SMS export surfaces dequeued queue entries as skipped rows with dequeued_reason per issue #1417", async () => {
    // One delivered message plus two dequeued contacts: a landline
    // pre-check drop and an opt-out. Without this, both dequeued
    // contacts silently vanish from the CSV.
    const contacts = [
      { ...contactRow, id: 20, firstname: "Sent", phone: "+15555550200", line_type: "mobile" },
      { ...contactRow, id: 21, firstname: "Landline", phone: "+15555550201", line_type: "landline" },
      { ...contactRow, id: 22, firstname: "OptedOut", phone: "+15555550202", opt_out: true },
    ];
    const message = {
      ...messageRow,
      id: "m20",
      from: "+15559990000",
      to: "+15555550200",
      status: "delivered",
    };
    queueMocks.getCampaignQueueContactIds.mockResolvedValue([20, 21, 22]);
    queueMocks.findDequeuedQueueRowsForCampaign.mockResolvedValue([
      { contact_id: 21, dequeued_reason: "Landline — cannot receive SMS" },
      { contact_id: 22, dequeued_reason: "Contact opted out" },
    ]);
    exportDbMocks.findExportContactsByIds.mockResolvedValue(contacts);
    exportDbMocks.countExportCampaignMessages.mockResolvedValue(1);
    exportDbMocks.listExportCampaignMessages.mockResolvedValue([message]);

    const mod = await import("../app/routes/api+/campaign-export");
    const fd = new FormData();
    fd.set("campaignId", "123");
    fd.set("workspaceId", "w1");
    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://localhost/api/campaign-export", {
          method: "POST",
          body: fd,
        }),
      } as any),
    );
    expect(res.status).toBe(200);
    await flushMicrotasks();

    const csvUpload = objectStorageUploads.find((u) => u.path.endsWith(".csv"));
    if (!csvUpload) throw new Error("expected a .csv upload from the export");
    const csvText = csvUpload.text;

    // Header ends in dequeued_reason so downstream consumers can key on it.
    const headerLine = csvText.split("\r\n")[0].replace(/^\uFEFF/, "");
    expect(headerLine.endsWith(",dequeued_reason")).toBe(true);

    // Delivered row: dequeued_reason is empty (never dequeued).
    expect(csvText).toMatch(/,delivered,[^\n]*,15555550200,[^\n]*,\r\n/);

    // Landline skip: status=skipped, dequeued_reason populated,
    // body/direction empty, line_type surfaced.
    expect(csvText).toContain(",,skipped,,,landline,");
    expect(csvText).toContain(",Landline — cannot receive SMS\r\n");

    // Opt-out skip: same shape, different reason.
    expect(csvText).toContain(",Contact opted out\r\n");
  }, 30000);
});
