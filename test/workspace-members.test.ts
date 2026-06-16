import { describe, expect, test } from "vitest";

import { MemberRole } from "../app/lib/member-role";
import {
  compareMembersByRole,
  normalizeSchedule,
} from "../app/lib/workspace-members";

describe("workspace-members", () => {
  test("compareMembersByRole orders by role rank", () => {
    const members = [
      { role: MemberRole.Caller, name: "caller" },
      { role: MemberRole.Admin, name: "admin" },
      { role: MemberRole.Owner, name: "owner" },
    ].sort(compareMembersByRole);

    expect(members.map((m) => m.role)).toEqual([
      MemberRole.Owner,
      MemberRole.Admin,
      MemberRole.Caller,
    ]);
  });

  test("compareMembersByRole returns 0 for equal roles", () => {
    expect(
      compareMembersByRole({ role: MemberRole.Admin }, { role: MemberRole.Admin }),
    ).toBe(0);
  });

  test("normalizeSchedule returns null for falsy input", () => {
    expect(normalizeSchedule(null)).toBeNull();
    expect(normalizeSchedule(undefined)).toBeNull();
  });

  test("normalizeSchedule parses JSON strings", () => {
    expect(normalizeSchedule('{"days":["mon"]}')).toEqual({ days: ["mon"] });
  });

  test("normalizeSchedule returns null for invalid JSON strings", () => {
    expect(normalizeSchedule("{not-json")).toBeNull();
  });

  test("normalizeSchedule passes through objects", () => {
    const schedule = { days: ["tue"] };
    expect(normalizeSchedule(schedule)).toBe(schedule);
  });
});
