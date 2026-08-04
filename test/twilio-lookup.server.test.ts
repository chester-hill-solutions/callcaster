import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn() },
  twilioLookupEnabled: "true" as string | undefined,
  fetch: vi.fn(),
}));

const tenantDbMocks = vi.hoisted(() => ({
  contact: {
    findFirst: vi.fn(async () => null as { line_type?: string | null } | null),
    update: vi.fn(async () => [{}]),
  },
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({
  env: {
    TWILIO_LOOKUP_ENABLED: () => mocks.twilioLookupEnabled,
  },
}));
vi.mock("@/twilio.server", () => ({
  twilio: {
    lookups: {
      v2: {
        phoneNumbers: (..._args: unknown[]) => ({
          fetch: (...args: unknown[]) => mocks.fetch(...args),
        }),
      },
    },
  },
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tenantDbMocks),
}));

async function importModule() {
  return import("../app/lib/twilio-lookup.server");
}

describe("app/lib/twilio-lookup.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    mocks.twilioLookupEnabled = "true";
    mocks.fetch.mockReset();
    tenantDbMocks.contact.findFirst.mockReset();
    tenantDbMocks.contact.findFirst.mockResolvedValue(null);
    tenantDbMocks.contact.update.mockReset();
    tenantDbMocks.contact.update.mockResolvedValue([{}]);
  });

  test("cache hit: returns the cached line_type without calling Twilio", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ line_type: "mobile" });

    const { getOrLookupLineType } = await importModule();
    const result = await getOrLookupLineType({
      workspaceId: "w1",
      contactId: 9,
      phone: "+15551234567",
    });

    expect(result).toBe("mobile");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(tenantDbMocks.contact.update).not.toHaveBeenCalled();
  });

  test("cache miss + enabled: looks up via Twilio and persists the result", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce(null);
    mocks.fetch.mockResolvedValueOnce({
      lineTypeIntelligence: { type: "landline" },
    });

    const { getOrLookupLineType } = await importModule();
    const result = await getOrLookupLineType({
      workspaceId: "w1",
      contactId: 9,
      phone: "+15551234567",
    });

    expect(result).toBe("landline");
    expect(mocks.fetch).toHaveBeenCalledWith({ fields: "line_type_intelligence" });
    expect(tenantDbMocks.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ line_type: "landline" }),
      }),
    );
    const setArg = tenantDbMocks.contact.update.mock.calls[0]?.[0]?.set;
    expect(typeof setArg.line_type_checked_at).toBe("string");
  });

  test("fail-open: a Twilio lookup error is logged, nothing is persisted, and null is returned", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce(null);
    mocks.fetch.mockRejectedValueOnce(new Error("Twilio down"));

    const { getOrLookupLineType } = await importModule();
    const result = await getOrLookupLineType({
      workspaceId: "w1",
      contactId: 9,
      phone: "+15551234567",
    });

    expect(result).toBeNull();
    expect(tenantDbMocks.contact.update).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error looking up Twilio line type:",
      expect.any(Error),
      expect.objectContaining({ workspaceId: "w1", contactId: 9 }),
    );
  });

  test("fail-open: a cache-read error is logged and returns null without calling Twilio", async () => {
    tenantDbMocks.contact.findFirst.mockRejectedValueOnce(new Error("db down"));

    const { getOrLookupLineType } = await importModule();
    const result = await getOrLookupLineType({
      workspaceId: "w1",
      contactId: 9,
      phone: "+15551234567",
    });

    expect(result).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error reading contact line-type cache:",
      expect.any(Error),
      expect.objectContaining({ workspaceId: "w1", contactId: 9 }),
    );
  });

  test("env off: returns null on a cache miss without calling Twilio", async () => {
    mocks.twilioLookupEnabled = undefined;
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce(null);

    const { getOrLookupLineType } = await importModule();
    const result = await getOrLookupLineType({
      workspaceId: "w1",
      contactId: 9,
      phone: "+15551234567",
    });

    expect(result).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(tenantDbMocks.contact.update).not.toHaveBeenCalled();
  });

  test("env off: a cache hit still returns the cached value (no spend either way)", async () => {
    mocks.twilioLookupEnabled = "false";
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ line_type: "voip" });

    const { getOrLookupLineType } = await importModule();
    const result = await getOrLookupLineType({
      workspaceId: "w1",
      contactId: 9,
      phone: "+15551234567",
    });

    expect(result).toBe("voip");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  test("passes through a caller-supplied tdb instead of creating a new one", async () => {
    const customTdb = {
      contact: {
        findFirst: vi.fn(async () => ({ line_type: "mobile" })),
        update: vi.fn(),
      },
    };

    const { getOrLookupLineType } = await importModule();
    const result = await getOrLookupLineType({
      workspaceId: "w1",
      contactId: 9,
      phone: "+15551234567",
      tdb: customTdb as never,
    });

    expect(result).toBe("mobile");
    expect(customTdb.contact.findFirst).toHaveBeenCalled();
    expect(tenantDbMocks.contact.findFirst).not.toHaveBeenCalled();
  });

  test("markContactLineType stamps line_type and checked_at", async () => {
    const { markContactLineType } = await importModule();
    await markContactLineType({
      workspaceId: "w1",
      contactId: 7,
      lineType: "landline",
    });

    expect(tenantDbMocks.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          line_type: "landline",
          line_type_checked_at: expect.any(String),
        }),
      }),
    );
  });

  test("markContactLineType fails open on db errors", async () => {
    tenantDbMocks.contact.update.mockRejectedValueOnce(new Error("db down"));

    const { markContactLineType } = await importModule();
    await expect(
      markContactLineType({ workspaceId: "w1", contactId: 7, lineType: "fax" }),
    ).resolves.toBeUndefined();
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  test("isSmsIncapableLineType blocks landline and fax only", async () => {
    const { isSmsIncapableLineType } = await importModule();
    expect(isSmsIncapableLineType("landline")).toBe(true);
    expect(isSmsIncapableLineType("fax")).toBe(true);
    expect(isSmsIncapableLineType("mobile")).toBe(false);
    expect(isSmsIncapableLineType("voip")).toBe(false);
    expect(isSmsIncapableLineType(null)).toBe(false);
    expect(isSmsIncapableLineType(undefined)).toBe(false);
  });
});
