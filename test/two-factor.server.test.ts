import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  isTwoFactorRedirectResponse,
  PRIVILEGED_WORKSPACE_ROLES,
  requireTwoFactorEnrollmentForPrivilegedUser,
} from "@/lib/two-factor.server";

const adminDbState = vi.hoisted(() => ({ enrolled: false }));

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

vi.mock("@/server/admin-db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = () => chain;
  // Terminal for isTwoFactorEnabled(): [{ twoFactorEnabled }]
  chain.limit = async () => [{ twoFactorEnabled: adminDbState.enrolled }];
  return { adminDb: chain };
});

describe("requireTwoFactorEnrollmentForPrivilegedUser (sudo path)", () => {
  beforeEach(() => {
    adminDbState.enrolled = false;
    delete process.env.E2E_DISABLE_2FA_ENFORCEMENT;
  });

  test("sudo (isPrivileged) not enrolled is redirected to /account/security", async () => {
    let thrown: unknown;
    try {
      await requireTwoFactorEnrollmentForPrivilegedUser({
        userId: "sudo-1",
        request: new Request("http://x/admin"),
        isPrivileged: true,
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("location")).toContain(
      "/account/security?enroll=1",
    );
  });

  test("sudo (isPrivileged) already enrolled is allowed through", async () => {
    adminDbState.enrolled = true;
    await expect(
      requireTwoFactorEnrollmentForPrivilegedUser({
        userId: "sudo-1",
        request: new Request("http://x/admin"),
        isPrivileged: true,
      }),
    ).resolves.toBeUndefined();
  });

  test("enrollment page itself is exempt (no redirect loop)", async () => {
    await expect(
      requireTwoFactorEnrollmentForPrivilegedUser({
        userId: "sudo-1",
        request: new Request("http://x/account/security"),
        isPrivileged: true,
      }),
    ).resolves.toBeUndefined();
  });

  test("E2E bypass short-circuits enforcement", async () => {
    process.env.E2E_DISABLE_2FA_ENFORCEMENT = "1";
    process.env.E2E_TEST = "1";
    await expect(
      requireTwoFactorEnrollmentForPrivilegedUser({
        userId: "sudo-1",
        request: new Request("http://x/admin"),
        isPrivileged: true,
      }),
    ).resolves.toBeUndefined();
    delete process.env.E2E_TEST;
  });
});
