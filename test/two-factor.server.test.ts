import { describe, expect, test, vi } from "vitest";
import {
  isTwoFactorRedirectResponse,
  PRIVILEGED_WORKSPACE_ROLES,
} from "@/lib/two-factor.server";

describe("two-factor.server", () => {
  test("isTwoFactorRedirectResponse detects Better Auth 2FA challenge", () => {
    expect(isTwoFactorRedirectResponse({ twoFactorRedirect: true, twoFactorMethods: ["totp"] })).toBe(
      true,
    );
    expect(isTwoFactorRedirectResponse({ token: "abc" })).toBe(false);
    expect(isTwoFactorRedirectResponse(null)).toBe(false);
  });

  test("privileged roles include owner, admin, field_director", () => {
    expect(PRIVILEGED_WORKSPACE_ROLES).toEqual(["owner", "admin", "field_director"]);
  });
});

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
  },
}));
