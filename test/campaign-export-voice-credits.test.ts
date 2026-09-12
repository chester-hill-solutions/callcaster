import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignExportDb: {
    findCampaignWithScriptForExport: vi.fn(),
    countExportOutreachAttempts: vi.fn(),
    listExportOutreachAttempts: vi.fn(),
    findExportContactsByIds: vi.fn(),
    findExportCallsByOutreachAttemptIds: vi.fn(),
  },
  uploads: [] as Array<{ path: string; text: string }>,
}));

vi.mock("@/lib/campaign-export-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-export-db.server")>();
  return {
    ...actual,
    findCampaignWithScriptForExport: (...args: unknown[]) =>
      mocks.campaignExportDb.findCampaignWithScriptForExport(...args),
    countExportOutreachAttempts: (...args: unknown[]) =>
      mocks.campaignExportDb.countExportOutreachAttempts(...args),
    listExportOutreachAttempts: (...args: unknown[]) =>
      mocks.campaignExportDb.listExportOutreachAttempts(...args),
    findExportContactsByIds: (...args: unknown[]) =>
      mocks.campaignExportDb.findExportContactsByIds(...args),
    findExportCallsByOutreachAttemptIds: (...args: unknown[]) =>
      mocks.campaignExportDb.findExportCallsByOutreachAttemptIds(...args),
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

const contact = {
  id: 1,
  firstname: "Test",
  surname: "Contact",
  phone: "+15555550101",
  email: "test@example.com",
  opt_out: false,
  created_at: "2026-01-01T00:00:00.000Z",
  workspace: "w1",
};

const attempt = {
  id: 10,
  contact_id: 1,
  campaign_id: 123,
  disposition: "completed",
  result: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

async function runCallExport(args: {
  campaignType: string;
  duration?: string | null;
}) {
  mocks.uploads.length = 0;
  mocks.campaignExportDb.findCampaignWithScriptForExport.mockResolvedValue({
    id: 123,
    type: args.campaignType,
    title: "Test campaign",
    workspace: "w1",
    start_date: "2026-01-01T00:00:00.000Z",
    end_date: "2026-01-02T00:00:00.000Z",
    status: "completed",
    script: { steps: { pages: {}, blocks: {} } },
  });
  mocks.campaignExportDb.countExportOutreachAttempts.mockResolvedValue(1);
  mocks.campaignExportDb.listExportOutreachAttempts.mockResolvedValue([attempt]);
  mocks.campaignExportDb.findExportContactsByIds.mockResolvedValue([contact]);
  mocks.campaignExportDb.findExportCallsByOutreachAttemptIds.mockResolvedValue([
    {
      id: "call-1",
      sid: "CA1",
      duration: args.duration,
      status: args.duration ? "completed" : "no-answer",
      answered_by: null,
      start_time: "2026-01-01T00:00:00.000Z",
      end_time: "2026-01-01T00:01:01.000Z",
      outreach_attempt_id: 10,
    },
  ]);

  const { processCallCampaignExport } = await import("@/lib/campaign-export.server");
  await processCallCampaignExport(123, "w1", "export-1", "Test campaign");

  const csvUpload = mocks.uploads.find((upload) => upload.path.endsWith(".csv"));
  if (!csvUpload) throw new Error("expected a .csv upload from the export");
  const rows = csvUpload.text.replace(/^\uFEFF/, "").trim().split("\r\n");
  const creditsIndex = rows[0].split(",").indexOf("credits_used");
  return rows[1].split(",")[creditsIndex];
}

describe("voice campaign export credits", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: unknown) => {
      if (typeof fn === "function") fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uses IVR first-plus-additional-minute pricing", async () => {
    await expect(runCallExport({ campaignType: "simple_ivr", duration: "61" })).resolves.toBe("5");
  });

  test("uses staffed first-plus-additional-minute pricing", async () => {
    await expect(runCallExport({ campaignType: "live_call", duration: "61" })).resolves.toBe("9");
  });

  test("reports zero credits when there is no billable duration", async () => {
    await expect(runCallExport({ campaignType: "simple_ivr", duration: null })).resolves.toBe("0");
  });
});
