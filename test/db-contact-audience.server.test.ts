import { beforeEach, describe, expect, test, vi } from "vitest";

const adminDbMocks = vi.hoisted(() => ({
  audienceFindFirst: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
}));

const tdbMocks = vi.hoisted(() => ({
  audience: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

describe("app/lib/database/contact-audience.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    adminDbMocks.audienceFindFirst.mockReset();
    dbMocks.delete.mockReset();
    dbMocks.insert.mockReset();
    dbMocks.select.mockReset();
    tdbMocks.audience.findFirst.mockReset();
    tdbMocks.audience.update.mockReset();

    adminDbMocks.audienceFindFirst.mockResolvedValue({ workspace: "w1" });
    tdbMocks.audience.findFirst.mockResolvedValue({ id: 99, workspace: "w1" });

    vi.doMock("@/server/admin-db", () => ({
      adminDb: {
        query: {
          audience: { findFirst: adminDbMocks.audienceFindFirst },
        },
      },
    }));

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
    }));

    vi.doMock("@/server/db", () => ({
      db: {
        delete: () => ({
          where: dbMocks.delete,
        }),
        insert: () => ({
          values: dbMocks.insert,
        }),
        select: () => ({
          from: () => ({
            where: dbMocks.select,
          }),
        }),
      },
    }));
  });

  test("removeContactFromAudience: throws on delete error; otherwise success", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    dbMocks.delete.mockRejectedValueOnce(new Error("nope"));
    await expect(mod.removeContactFromAudience(1, 2)).rejects.toThrow("nope");

    dbMocks.delete.mockResolvedValueOnce(undefined);
    await expect(mod.removeContactFromAudience(1, 2)).resolves.toEqual({ success: true });
  });

  test("removeContactsFromAudience: updates audience total_contacts using count ?? 0", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    dbMocks.delete.mockResolvedValueOnce(undefined);
    dbMocks.select.mockResolvedValueOnce([{ value: 0 }]);
    tdbMocks.audience.update.mockResolvedValueOnce([{ id: 99, total_contacts: 0 }]);

    const res = await mod.removeContactsFromAudience(99, [1, 2, 3]);
    expect(res).toEqual({ removed_count: 3, new_total: 0 });
    expect(tdbMocks.audience.update).toHaveBeenCalledWith({
      set: { total_contacts: 0 },
      where: expect.anything(),
    });
  });

  test("removeContactsFromAudience: throws when audience total_contacts update fails", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    dbMocks.delete.mockResolvedValueOnce(undefined);
    dbMocks.select.mockResolvedValueOnce([{ value: 2 }]);
    tdbMocks.audience.update.mockRejectedValueOnce(new Error("upd"));

    await expect(mod.removeContactsFromAudience(99, [1, 2])).rejects.toThrow("upd");
  });

  test("removeContactsFromAudience: throws when delete fails", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    dbMocks.delete.mockRejectedValueOnce(new Error("del"));

    await expect(mod.removeContactsFromAudience(1, [1])).rejects.toThrow("del");
  });
});
