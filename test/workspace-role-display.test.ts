import { describe, expect, test } from "vitest";
import { MemberRole } from "@/lib/member-role";
import {
  getWorkspaceRoleDisplayName,
  WORKSPACE_ROLE_DISPLAY_NAMES,
} from "@/lib/workspace-role-display";

describe("workspace role display names", () => {
  test.each([
    [MemberRole.Caller, "Agent"],
    [MemberRole.Member, "Coordinator"],
    [MemberRole.Admin, "Administrator"],
    [MemberRole.Owner, "Administrator"],
  ])("%s is displayed as %s", (role, expected) => {
    expect(getWorkspaceRoleDisplayName(role)).toBe(expected);
    expect(WORKSPACE_ROLE_DISPLAY_NAMES[role]).toBe(expected);
  });

  test("keeps internal role values unchanged", () => {
    expect(Object.values(MemberRole)).toEqual([
      "owner",
      "admin",
      "member",
      "caller",
    ]);
  });
});
