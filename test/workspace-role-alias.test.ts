import { describe, expect, it, vi } from "vitest";

// The membership write path pulls in the tenant database client. This test is
// about the role mapping only, so the client is stubbed.
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({})),
}));

describe("memberRoleToRoleId", () => {
  it("maps the four current workspace roles", async () => {
    const { memberRoleToRoleId } = await import("@/lib/workspace-membership.server");
    expect(memberRoleToRoleId("owner")).toBe("owner");
    expect(memberRoleToRoleId("admin")).toBe("admin");
    expect(memberRoleToRoleId("member")).toBe("member");
    expect(memberRoleToRoleId("caller")).toBe("caller");
  });

  it("refuses the legacy field_director alias instead of mapping it to admin", async () => {
    const { memberRoleToRoleId } = await import("@/lib/workspace-membership.server");
    // The `field_director` -> `admin` policy belongs to the one-off Supabase
    // backfill (scripts/schema-transform/11-chs-membership-backfill.sql). On the
    // live write path it must not resolve to a privileged role.
    expect(() => memberRoleToRoleId("field_director")).toThrow(
      /Unmapped workspace role for membership write: field_director/,
    );
  });

  it("refuses any role outside the current vocabulary", async () => {
    const { memberRoleToRoleId } = await import("@/lib/workspace-membership.server");
    expect(() => memberRoleToRoleId("superadmin")).toThrow(
      /Unmapped workspace role for membership write: superadmin/,
    );
    expect(() => memberRoleToRoleId("")).toThrow(/Unmapped workspace role/);
  });
});
