import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignExportDb: {
    findCampaignForMessageExport: vi.fn(),
    findExportContactsByIds: vi.fn(),
    countExportCampaignMessages: vi.fn(),
    listExportCampaignMessages: vi.fn(),
  },
  queueDb: {
    getCampaignQueueContactIds: vi.fn(),
    findDequeuedQueueRowsForCampaign: vi.fn(),
  },
  uploads: [] as Array<{ path: string; text: string }>,
}));

vi.mock("@/lib/campaign-export-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-export-db.server")>();
  return {
    ...actual,
    findCampaignForMessageExport: (...args: unknown[]) =>
      mocks.campaignExportDb.findCampaignForMessageExport(...args),
    findExportContactsByIds: (...args: unknown[]) =>
      mocks.campaignExportDb.findExportContactsByIds(...args),
    countExportCampaignMessages: (...args: unknown[]) =>
      mocks.campaignExportDb.countExportCampaignMessages(...args),
    listExportCampaignMessages: (...args: unknown[]) =>
      mocks.campaignExportDb.listExportCampaignMessages(...args),
  };
});

vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-queue-db.server")>();
  return {
    ...actual,
    getCampaignQueueContactIds: (...args: unknown[]) =>
      mocks.queueDb.getCampaignQueueContactIds(...args),
    findDequeuedQueueRowsForCampaign: (...args: unknown[]) =>
      mocks.queueDb.findDequeuedQueueRowsForCampaign(...args),
  };
});

vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  uploadObject: vi.fn(async (_bucket: string, path: string, body: unknown) => {
    if (path.endsWith(".csv")) {
      mocks.uploads.push({ path, text: String(body) });
    }
  }),
  createSignedObjectUrl: vi.fn(async () => "https://signed.example/export.csv"),
}));

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const campaign = {
  id: 123,
  type: "message",
  title: "Test campaign",
  workspace: "w1",
  start_date: "2026-01-01T00:00:00.000Z",
  end_date: "2026-01-02T00:00:00.000Z",
};

const contacts = [
  {
    id: 1,
    firstname: "Sent",
    surname: "Contact",
    phone: "+15555550101",
    email: "sent@example.com",
    opt_out: false,
    created_at: "2026-01-01T00:00:00.000Z",
    workspace: "w1",
    line_type: "mobile",
  },
  {
    id: 2,
    firstname: "Landline",
    surname: "Contact",
    phone: "+15555550102",
    email: "landline@example.com",
    opt_out: false,
    created_at: "2026-01-01T00:00:00.000Z",
    workspace: "w1",
    line_type: "landline",
  },
  {
    id: 3,
    firstname: "Opted",
    surname: "Out",
    phone: "+15555550103",
    email: "opted@example.com",
    opt_out: true,
    created_at: "2026-01-01T00:00:00.000Z",
    workspace: "w1",
    line_type: null,
  },
  {
    id: 4,
    firstname: "Duplicate",
    surname: "Contact",
    phone: "+15555550104",
    email: "duplicate@example.com",
    opt_out: false,
    created_at: "2026-01-01T00:00:00.000Z",
    workspace: "w1",
    line_type: "mobile",
  },
];

describe("SMS campaign export dequeued rows", () => {
  beforeEach(() => {
    mocks.uploads.length = 0;
    mocks.campaignExportDb.findCampaignForMessageExport.mockResolvedValue(campaign);
    mocks.campaignExportDb.findExportContactsByIds.mockResolvedValue(contacts);
    mocks.campaignExportDb.countExportCampaignMessages.mockResolvedValue(1);
    mocks.campaignExportDb.listExportCampaignMessages.mockResolvedValue([
      {
        id: "message-1",
        body: "hello",
        from: "+15559990000",
        to: "+15555550101",
        direction: "outbound-api",
        status: "delivered",
        date_created: "2026-01-01T00:00:00.000Z",
        date_sent: "2026-01-01T00:00:00.000Z",
        workspace: "w1",
      },
    ]);
    mocks.queueDb.getCampaignQueueContactIds.mockResolvedValue([1, 2, 3, 4]);
    mocks.queueDb.findDequeuedQueueRowsForCampaign.mockResolvedValue([
      { contact_id: 1, dequeued_reason: "SMS message sent" },
      { contact_id: 2, dequeued_reason: "Landline — cannot receive SMS" },
      { contact_id: 3, dequeued_reason: "Contact opted out" },
      { contact_id: 4, dequeued_reason: "Duplicate SMS prevented" },
    ]);
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: unknown) => {
      if (typeof fn === "function") fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const group of Object.values(mocks)) {
      if (group && typeof group === "object" && "mockReset" in group) {
        (group as { mockReset: () => void }).mockReset();
      }
    }
  });

  test("does not synthesize skipped row for a successful SMS dequeue", async () => {
    const { processMessageCampaignExport } = await import("@/lib/campaign-export.server");

    await processMessageCampaignExport(123, "w1", "export-1", "Test campaign");

    const csvUpload = mocks.uploads.find((upload) => upload.path.endsWith(".csv"));
    if (!csvUpload) throw new Error("expected a .csv upload from the export");
    const rows = csvUpload.text.replace(/^\uFEFF/, "").trim().split("\r\n");

    // Header + one delivered message + three real skip rows.
    expect(rows).toHaveLength(5);
    expect(rows.filter((row) => row.includes(",skipped,")).length).toBe(3);
    expect(csvUpload.text).not.toContain(",SMS message sent\r\n");
    expect(csvUpload.text).toContain(",Landline — cannot receive SMS\r\n");
    expect(csvUpload.text).toContain(",Contact opted out\r\n");
    expect(csvUpload.text).toContain(",Duplicate SMS prevented\r\n");
  });
});
