import { beforeEach, describe, expect, test, vi } from "vitest";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";

const tdbMocks = vi.hoisted(() => ({
  audience: {
    findFirst: vi.fn(),
  },
  audience_upload: {
    findFirst: vi.fn(),
  },
}));

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };
  // Make every builder step return the chain so either contacts or count path works.
  for (const key of Object.keys(selectChain) as Array<keyof typeof selectChain>) {
    selectChain[key].mockReturnValue(selectChain);
  }
  selectChain.offset.mockResolvedValue([]);
  // count query ends at .where() without limit/offset
  selectChain.where.mockImplementation(() => selectChain);
  return {
    select: vi.fn(() => selectChain),
    selectChain,
  };
});

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tdbMocks),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: (...args: unknown[]) => dbMocks.select(...args),
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("getAudienceDetailApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbMocks.selectChain) as Array<
      keyof typeof dbMocks.selectChain
    >) {
      dbMocks.selectChain[key].mockReturnValue(dbMocks.selectChain);
    }
    dbMocks.selectChain.offset.mockResolvedValue([]);
    dbMocks.selectChain.where.mockImplementation(() => dbMocks.selectChain);
  });

  test("returns audience with contacts_error when contacts query fails (#1080)", async () => {
    tdbMocks.audience.findFirst.mockResolvedValue({
      id: 4,
      name: "Launch test call list",
      workspace: "ws-1",
      is_conditional: false,
      created_at: "2026-07-20T00:00:00Z",
      status: "completed",
      total_contacts: null,
      processed_contacts: null,
      processed_at: null,
      error_message: null,
    });
    tdbMocks.audience_upload.findFirst.mockResolvedValue(null);

    // First select (contacts) throws; second (count) would also throw if reached —
    // Promise.all fails on first rejection.
    dbMocks.selectChain.offset.mockRejectedValueOnce(
      new Error("Failed query: contact join"),
    );

    const { getAudienceDetailApi } = await import(
      "../app/lib/platform-data.server"
    );
    const result = await getAudienceDetailApi(
      "ws-1",
      "4",
      new URLSearchParams(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audience.name).toBe("Launch test call list");
    expect(result.contacts).toEqual([]);
    expect(result.contacts_error).toMatch(/Failed query: contact join/);
  });

  test("returns 404 when audience is missing", async () => {
    tdbMocks.audience.findFirst.mockResolvedValue(null);

    const { getAudienceDetailApi } = await import(
      "../app/lib/platform-data.server"
    );
    const result = await getAudienceDetailApi(
      "ws-1",
      "999",
      new URLSearchParams(),
    );

    expect(result).toEqual({
      ok: false,
      error: "Audience not found",
      status: 404,
    });
  });
});
