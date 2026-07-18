import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const membershipRows = vi.hoisted(() => ({
  rows: [] as Array<{
    last_accessed: Date;
    role: string;
    workspace: {
      id: string;
      name: string;
      credits: number;
      created_at: Date;
    };
  }>,
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => membershipRows.rows),
          })),
        })),
      })),
    })),
  },
}));

vi.mock("@/server/db", () => ({ db: {} }));

describe("listUserWorkspaceSummaries credit projection", () => {
  beforeEach(() => {
    vi.resetModules();
    membershipRows.rows = [];
  });

  test("returns numeric credits for Admin+ roles and null for member/caller", async () => {
    membershipRows.rows = [
      {
        last_accessed: new Date("2026-01-01T00:00:00.000Z"),
        role: "owner",
        workspace: {
          id: "w-owner",
          name: "Owner WS",
          credits: 100,
          created_at: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
      {
        last_accessed: new Date("2026-01-02T00:00:00.000Z"),
        role: "admin",
        workspace: {
          id: "w-admin",
          name: "Admin WS",
          credits: 50,
          created_at: new Date("2026-01-02T00:00:00.000Z"),
        },
      },
      {
        last_accessed: new Date("2026-01-03T00:00:00.000Z"),
        role: "member",
        workspace: {
          id: "w-member",
          name: "Member WS",
          credits: 999,
          created_at: new Date("2026-01-03T00:00:00.000Z"),
        },
      },
      {
        last_accessed: new Date("2026-01-04T00:00:00.000Z"),
        role: "caller",
        workspace: {
          id: "w-caller",
          name: "Caller WS",
          credits: 7,
          created_at: new Date("2026-01-04T00:00:00.000Z"),
        },
      },
    ];

    const { listUserWorkspaceSummaries } = await import(
      "../app/lib/workspace-members-db.server"
    );
    const summaries = await listUserWorkspaceSummaries("user-1");

    expect(summaries).toEqual([
      { id: "w-owner", name: "Owner WS", role: "owner", credits: 100 },
      { id: "w-admin", name: "Admin WS", role: "admin", credits: 50 },
      { id: "w-member", name: "Member WS", role: "member", credits: null },
      { id: "w-caller", name: "Caller WS", role: "caller", credits: null },
    ]);
  });
});
