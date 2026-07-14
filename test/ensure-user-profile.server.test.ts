import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertResult = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
  };
  insertResult.values.mockReturnValue(insertResult);
  insertResult.onConflictDoNothing.mockResolvedValue(undefined);

  return {
    insert: vi.fn(() => insertResult),
    insertResult,
  };
});

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    insert: mocks.insert,
  },
}));

vi.mock("@/db/schema", () => ({
  user: {
    id: "user.id",
  },
}));

describe("ensureProfileForUser", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.insert.mockClear();
    mocks.insertResult.values.mockClear();
    mocks.insertResult.onConflictDoNothing.mockClear();
    mocks.insertResult.values.mockReturnValue(mocks.insertResult);
    mocks.insertResult.onConflictDoNothing.mockResolvedValue(undefined);
  });

  test("inserts a public.user profile from auth identity fields", async () => {
    const { ensureProfileForUser } = await import(
      "@/lib/ensure-user-profile.server"
    );

    await ensureProfileForUser({
      id: "7c113c43-9a85-4406-bc2c-ef9776b54426",
      email: "Info@Example.com",
      name: "Nathaniel Arfin",
    });

    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insertResult.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "7c113c43-9a85-4406-bc2c-ef9776b54426",
        username: "info@example.com",
        first_name: "Nathaniel",
        last_name: "Arfin",
        access_level: "standard",
      }),
    );
    expect(mocks.insertResult.onConflictDoNothing).toHaveBeenCalledWith({
      target: "user.id",
    });
  });

  test("falls back to user id when email is missing", async () => {
    const { ensureProfileForUser } = await import(
      "@/lib/ensure-user-profile.server"
    );

    await ensureProfileForUser({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      email: null,
      name: null,
    });

    expect(mocks.insertResult.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        username: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        first_name: "",
        last_name: "",
      }),
    );
  });
});
