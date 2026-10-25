import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

/**
 * #2875: `PATCH /api/admin/users/:userId` documented a partial edit, but the
 * write helper filled the gaps with `?? null` / `?? "standard"`, so a request
 * that only renamed a user also blanked their names and demoted them from sudo
 * to standard - which silently dropped that account's mandatory two-factor
 * enrolment.
 *
 * The payload captured here is the one handed to Postgres, so the assertion is
 * about the statement, not about the helper's own bookkeeping.
 */
const mocks = vi.hoisted(() => ({
  setPayloads: [] as Record<string, unknown>[],
  updateAdminUser: vi.fn(),
}));

vi.mock("@/server/admin-db", () => {
  const chain = {
    set: (payload: Record<string, unknown>) => {
      mocks.setPayloads.push(payload);
      return chain;
    },
    where: () => chain,
    returning: async () => [{ id: "u1" }],
  };
  return {
    adminDb: {
      update: () => chain,
      select: () => chain,
    },
  };
});

vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth.server")>()),
  requireSudo: vi.fn(async () => ({ userId: "sudo-1" })),
}));

vi.mock("@/lib/platform-admin.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-admin.server")>()),
  updateAdminUser: (...args: unknown[]) => mocks.updateAdminUser(...args),
}));

vi.mock("@/lib/api-parse.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-parse.server")>()),
}));

describe("PATCH /api/admin/users/:userId (#2875)", () => {
  beforeEach(() => {
    mocks.setPayloads.length = 0;
    mocks.updateAdminUser.mockReset();
    mocks.updateAdminUser.mockResolvedValue({ ok: true });
  });

  async function patch(body: unknown) {
    const mod = await import("../app/routes/api+/admin+/users+/$userId.route");
    return asRouteResponse(
      mod.action({
        request: new Request("http://x/api/admin/users/u1", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        params: { userId: "u1" },
      } as never),
    );
  }

  test("an omitted access level is not sent to the write", async () => {
    const res = await patch({ username: "renamed" });
    expect(res.status).toBe(200);

    const [userId, updates] = mocks.updateAdminUser.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(userId).toBe("u1");
    expect(updates).not.toHaveProperty("access_level");
    expect(updates).not.toHaveProperty("first_name");
    expect(updates).not.toHaveProperty("last_name");
    expect(updates.username).toBe("renamed");
  });

  test("an access level outside the console's four values is refused", async () => {
    const res = await patch({ username: "renamed", access_level: "root" });
    expect(res.status).toBe(400);
    expect(mocks.updateAdminUser).not.toHaveBeenCalled();
  });

  test("an explicit access level is passed through", async () => {
    const res = await patch({ username: "renamed", access_level: "disabled" });
    expect(res.status).toBe(200);
    const [, updates] = mocks.updateAdminUser.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(updates.access_level).toBe("disabled");
  });
});

describe("updateUserProfile writes only the supplied fields (#2875)", () => {
  beforeEach(() => {
    mocks.setPayloads.length = 0;
  });

  test("a rename alone does not touch names or access level", async () => {
    const { updateUserProfile } =
      await import("@/lib/workspace-members-db.server");
    await updateUserProfile({ userId: "u1", username: "renamed" });

    expect(mocks.setPayloads).toEqual([{ username: "renamed" }]);
  });

  test("a supplied null name is still written, because the caller asked for it", async () => {
    const { updateUserProfile } =
      await import("@/lib/workspace-members-db.server");
    await updateUserProfile({
      userId: "u1",
      username: "renamed",
      first_name: null,
      access_level: "sudo",
    });

    expect(mocks.setPayloads).toEqual([
      { username: "renamed", first_name: null, access_level: "sudo" },
    ]);
  });
});
