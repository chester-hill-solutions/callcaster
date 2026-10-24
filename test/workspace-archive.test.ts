import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  numbers: [] as { id: number; phone_number: string | null }[],
  releaseOutcomes: [] as { error: unknown }[],
  releasedIds: [] as number[],
  archiveSets: [] as { archived_at: Date }[],
  updateReturnsRow: true,
  archivedAt: null as Date | null,
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: () => ({
    workspace_number: { findMany: async () => state.numbers },
  }),
}));

vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-members-db.server")
  >()),
  archiveWorkspaceById: async (_workspaceId: string, archivedAt: Date) => {
    state.archiveSets.push({ archived_at: archivedAt });
    return state.updateReturnsRow ? { id: "w1" } : null;
  },
  isWorkspaceArchivedById: async () => state.archivedAt !== null,
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  removeWorkspacePhoneNumber: async (args: { numberId: bigint }) => {
    state.releasedIds.push(Number(args.numberId));
    return state.releaseOutcomes.shift() ?? { error: null };
  },
}));

import {
  archiveWorkspace,
  isWorkspaceArchived,
} from "@/lib/workspace-archive.server";

describe("archiveWorkspace (#2732)", () => {
  beforeEach(() => {
    state.numbers = [
      { id: 11, phone_number: "+15550000011" },
      { id: 12, phone_number: "+15550000012" },
    ];
    state.releaseOutcomes = [];
    state.releasedIds = [];
    state.archiveSets = [];
    state.updateReturnsRow = true;
    state.archivedAt = null;
  });

  test("releases every number before it archives the workspace", async () => {
    const result = await archiveWorkspace("w1");

    expect(result).toMatchObject({ ok: true, releasedNumbers: 2 });
    expect(state.releasedIds).toEqual([11, 12]);
    expect(state.archiveSets).toHaveLength(1);
    expect(state.archiveSets[0]?.archived_at).toBeInstanceOf(Date);
  });

  test("does not archive when a release fails, and names the number", async () => {
    // First number releases, second does not.
    state.releaseOutcomes = [
      { error: null },
      { error: new Error("provider down") },
    ];

    const result = await archiveWorkspace("w1");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.status).toBe(409);
    expect(result.error).toContain("+15550000012");
    // The archive never ran, so the workspace stays visible and retryable.
    expect(state.archiveSets).toHaveLength(0);
  });

  test("reports a missing workspace instead of claiming success", async () => {
    state.numbers = [];
    state.updateReturnsRow = false;

    const result = await archiveWorkspace("w1");

    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  test("isWorkspaceArchived reads the archived timestamp", async () => {
    expect(await isWorkspaceArchived("w1")).toBe(false);
    state.archivedAt = new Date("2026-10-24T12:00:00.000Z");
    expect(await isWorkspaceArchived("w1")).toBe(true);
  });
});
