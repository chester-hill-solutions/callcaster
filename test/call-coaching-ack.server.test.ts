import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  createTenantDb: vi.fn(),
  callFindFirst: vi.fn(),
  cueFindFirst: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: mocks.createTenantDb,
}));

vi.mock("@/lib/workspace-membership.server", () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    query: { coaching_event: { findFirst: mocks.cueFindFirst } },
    update: mocks.update,
  },
}));

const { acknowledgeCoachingCue } = await import("@/lib/call-coaching-ack.server");

const user = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTenantDb.mockReturnValue({ call: { findFirst: mocks.callFindFirst } });
  mocks.callFindFirst.mockResolvedValue({ sid: "CA123" });
  mocks.cueFindFirst.mockResolvedValue({ call_sid: "CA123" });
  mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
  mocks.where.mockResolvedValue(undefined);
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.update.mockReturnValue({ set: mocks.set });
});

describe("acknowledgeCoachingCue", () => {
  test("acks a cue for a workspace member and stamps acknowledged_at", async () => {
    await expect(
      acknowledgeCoachingCue({ user, workspaceId: "ws-1", coachingEventId: "evt-1" }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledged_at: expect.any(String) }),
    );
  });

  test("any member role may ack — no role gate is imposed", async () => {
    await acknowledgeCoachingCue({
      user,
      workspaceId: "ws-1",
      coachingEventId: "evt-1",
    });

    // A `minRole` here would break the product decision that any member in any
    // role can acknowledge any cue in their workspace.
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.not.objectContaining({ minRole: expect.anything() }),
    );
  });

  test("gates on the tenant-scoped call, not an unscoped admin read", async () => {
    await acknowledgeCoachingCue({
      user,
      workspaceId: "ws-1",
      coachingEventId: "evt-1",
    });

    expect(mocks.createTenantDb).toHaveBeenCalledWith("ws-1");
    expect(mocks.callFindFirst).toHaveBeenCalledTimes(1);
  });

  test("a cue whose call belongs to another workspace is 404 and writes nothing", async () => {
    // The scoped `call` client filters by workspace, so a foreign call misses.
    mocks.callFindFirst.mockResolvedValue(undefined);

    await expect(
      acknowledgeCoachingCue({
        user,
        workspaceId: "ws-1",
        coachingEventId: "evt-foreign",
      }),
    ).resolves.toEqual({ ok: false, status: 404, error: "Coaching event not found" });

    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("a non-member never reaches the cue row and writes nothing", async () => {
    mocks.requireWorkspaceAccess.mockRejectedValue(
      Object.assign(new Error("Workspace not found"), { status: 404 }),
    );

    await expect(
      acknowledgeCoachingCue({ user, workspaceId: "ws-2", coachingEventId: "evt-1" }),
    ).rejects.toThrow("Workspace not found");

    // Authz precedes every transcription-table touch.
    expect(mocks.cueFindFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("an unknown cue id is 404 and writes nothing", async () => {
    mocks.cueFindFirst.mockResolvedValue(undefined);

    await expect(
      acknowledgeCoachingCue({ user, workspaceId: "ws-1", coachingEventId: "nope" }),
    ).resolves.toEqual({ ok: false, status: 404, error: "Coaching event not found" });

    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("a missing coachingEventId is 400 and touches nothing", async () => {
    await expect(
      acknowledgeCoachingCue({ user, workspaceId: "ws-1", coachingEventId: undefined }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "coachingEventId is required",
    });

    expect(mocks.requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("a missing workspaceId is 400 and touches nothing", async () => {
    await expect(
      acknowledgeCoachingCue({ user, workspaceId: undefined, coachingEventId: "evt-1" }),
    ).resolves.toEqual({ ok: false, status: 400, error: "workspaceId is required" });

    expect(mocks.createTenantDb).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("reads only the call_sid pointer from the cue, never its payload", async () => {
    await acknowledgeCoachingCue({
      user,
      workspaceId: "ws-1",
      coachingEventId: "evt-1",
    });

    expect(mocks.cueFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ columns: { call_sid: true } }),
    );
  });
});
