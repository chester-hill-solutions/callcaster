import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  isTwoFactorRedirectResponse,
  PRIVILEGED_WORKSPACE_ROLES,
  requireTwoFactorEnrollmentForPrivilegedUser,
} from "@/lib/two-factor.server";

const adminDbState = vi.hoisted(() => ({
  enrolled: false,
  accessLevel: null as string | null,
  roles: [] as string[],
}));

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
  // `.where()` is awaited directly by userHasPrivilegedWorkspaceRole (→ role
  // rows) AND chained with `.limit(1)` by isTwoFactorEnabled / the access_level
  // lookup. Return a thenable that also carries `.limit`.
  chain.where = () => {
    const rolesRows = adminDbState.roles.map((role) => ({ role }));
    const result: any = Promise.resolve(rolesRows);
    result.limit = async () => [
      {
        twoFactorEnabled: adminDbState.enrolled,
        accessLevel: adminDbState.accessLevel,
      },
    ];
    return result;
  };
  chain.limit = async () => [
    { twoFactorEnabled: adminDbState.enrolled, accessLevel: adminDbState.accessLevel },
  ];
  return { adminDb: chain };
});

describe("userIsTwoFactorProtected", () => {
  beforeEach(() => {
    adminDbState.accessLevel = null;
    adminDbState.roles = [];
  });

  test("sudo account is protected even with no privileged workspace role", async () => {
    const { userIsTwoFactorProtected } = await import("@/lib/two-factor.server");
    adminDbState.accessLevel = "sudo";
    adminDbState.roles = ["caller"];
    expect(await userIsTwoFactorProtected("u1")).toBe(true);
  });

  test("non-sudo with a privileged workspace role is protected", async () => {
    const { userIsTwoFactorProtected } = await import("@/lib/two-factor.server");
    adminDbState.accessLevel = null;
    adminDbState.roles = ["admin"];
    expect(await userIsTwoFactorProtected("u1")).toBe(true);
  });

  test("non-sudo with only non-privileged roles is not protected", async () => {
    const { userIsTwoFactorProtected } = await import("@/lib/two-factor.server");
    adminDbState.accessLevel = "member";
    adminDbState.roles = ["caller", "member"];
    expect(await userIsTwoFactorProtected("u1")).toBe(false);
  });
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
