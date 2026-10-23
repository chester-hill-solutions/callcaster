import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const WS_OWNER = "11111111-1111-1111-1111-111111111111";
const WS_OTHER = "22222222-2222-2222-2222-222222222222";

const mocks = vi.hoisted(() => ({
  /** The `call` row the ownership lookup finds, or null when there is none. */
  ownerRow: null as { workspace: string | null } | null,
  /** Rows handed to the insert. Empty means the write never happened. */
  inserted: [] as unknown[],
}));

vi.mock("@/server/admin-db", () => {
  // A plain function, not a vi.fn(): the shared config sets `mockReset: true`,
  // which would strip a factory-installed implementation before each test.
  const findFirst = async () => mocks.ownerRow;
  const chain = {
    values: (row: unknown) => {
      mocks.inserted.push(row);
      return chain;
    },
    returning: async () => [{ id: "row-1" }],
  };
  return {
    adminDb: {
      query: { call: { findFirst } },
      insert: () => chain,
    },
  };
});

vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  insertWorkspaceEvent: vi.fn(async () => undefined),
}));

describe("media-stream db-writer: the call's workspace is proven before an unscoped write", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ownerRow = null;
    mocks.inserted = [];
  });

  test("refuses a call owned by another workspace, and writes nothing", async () => {
    mocks.ownerRow = { workspace: WS_OTHER };
    const { writeTranscriptSegment } = await import("../services/media-stream/db-writer");

    await expect(
      writeTranscriptSegment(
        { call_sid: "CA-victim", text: "injected", is_final: true } as never,
        WS_OWNER,
      ),
    ).rejects.toThrow(/owned by another workspace/);
    expect(mocks.inserted).toEqual([]);
  });

  test("the same refusal covers the coaching event and the session upsert", async () => {
    mocks.ownerRow = { workspace: WS_OTHER };
    const { writeCoachingEvent, writeCoachingSessionFinal } = await import(
      "../services/media-stream/db-writer"
    );

    await expect(
      writeCoachingEvent({ call_sid: "CA-victim", type: "cue" } as never, WS_OWNER),
    ).rejects.toThrow(/owned by another workspace/);
    await expect(
      writeCoachingSessionFinal({ call_sid: "CA-victim" } as never, WS_OWNER),
    ).rejects.toThrow(/owned by another workspace/);
    expect(mocks.inserted).toEqual([]);
  });

  test("a call of the caller's own workspace is written", async () => {
    mocks.ownerRow = { workspace: WS_OWNER };
    const { writeTranscriptSegment } = await import("../services/media-stream/db-writer");

    const row = await writeTranscriptSegment(
      { call_sid: "CA-own", text: "hello", is_final: true } as never,
      WS_OWNER,
    );

    expect(row).toEqual({ id: "row-1" });
    expect(mocks.inserted).toHaveLength(1);
  });

  test("a call row that does not exist yet is not a cross-tenant write", async () => {
    // The row may simply not be persisted yet. Suppressing the write here would
    // silently drop real transcription.
    mocks.ownerRow = null;
    const { writeTranscriptSegment } = await import("../services/media-stream/db-writer");

    await writeTranscriptSegment(
      { call_sid: "CA-new", text: "first words", is_final: true } as never,
      WS_OWNER,
    );

    expect(mocks.inserted).toHaveLength(1);
  });

  test("a call row with no workspace is not owned by another tenant either", async () => {
    mocks.ownerRow = { workspace: null };
    const { writeTranscriptSegment } = await import("../services/media-stream/db-writer");

    await writeTranscriptSegment(
      { call_sid: "CA-unowned", text: "hello", is_final: true } as never,
      WS_OWNER,
    );

    expect(mocks.inserted).toHaveLength(1);
  });
});
