import { describe, expect, test } from "vitest";
import { hasMinRole, MemberRole } from "../app/lib/member-role";

describe("hasMinRole", () => {
  test("no gate (empty/undefined minRole) always passes", () => {
    expect(hasMinRole("caller", undefined)).toBe(true);
    expect(hasMinRole("caller", "")).toBe(true);
    expect(hasMinRole(undefined, undefined)).toBe(true);
  });

  test("compares ranks for known roles", () => {
    expect(hasMinRole(MemberRole.Admin, MemberRole.Member)).toBe(true);
    expect(hasMinRole(MemberRole.Member, MemberRole.Admin)).toBe(false);
    expect(hasMinRole(MemberRole.Owner, MemberRole.Owner)).toBe(true);
  });

  test("denies when the actor role is missing or unknown", () => {
    expect(hasMinRole(undefined, MemberRole.Caller)).toBe(false);
    expect(hasMinRole("nonsense", MemberRole.Member)).toBe(false);
  });

  test("fails closed on an unrecognized minRole (never authorizes everyone)", () => {
    expect(hasMinRole("owner", "administrator")).toBe(false);
    expect(hasMinRole("caller", "superuser")).toBe(false);
  });
});
