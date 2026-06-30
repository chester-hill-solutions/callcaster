import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  contact: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
}));

describe("app/lib/database/contact.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(tdbMocks.contact)) {
      fn.mockReset();
    }
    dbMocks.insert.mockReset();

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
    }));

    vi.doMock("@/server/db", () => ({
      db: {
        insert: () => ({
          values: dbMocks.insert,
        }),
      },
    }));

    vi.doMock("../app/lib/logger.server", () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
  });

  test("findPotentialContacts prioritizes exact indexed lookup and narrows fallback", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const client: any = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("rpc unavailable"),
      })),
    };

    tdbMocks.contact.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await mod.findPotentialContacts(client, "(555) 555-0100", "w1");

    expect(adminDb.rpc).toHaveBeenCalledWith("find_contact_by_phone", {
      p_workspace_id: "w1",
      p_phone_number: "(555) 555-0100",
    });
    expect(tdbMocks.contact.findMany).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ data: [], error: null });
  });

  test("fetchContactData: by number only promotes a unique match to contact", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const client: any = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("rpc unavailable"),
      })),
    };

    tdbMocks.contact.findMany.mockResolvedValueOnce([{ id: 1 }]);

    const res = await mod.fetchContactData(client, "w1", "", "5555550100");
    expect(res.contact).toEqual({ id: 1 });
    expect(res.contactError).toBeNull();
    expect(res.potentialContacts).toEqual([]);
  });

  test("fetchContactData: by number only handles null data", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const client: any = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("rpc unavailable"),
      })),
    };

    tdbMocks.contact.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await mod.fetchContactData(client, "w1", "", "5555550100");
    expect(res.potentialContacts).toEqual([]);
  });

  test("fetchContactData: by number only keeps ambiguous matches as potential contacts", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const client: any = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("rpc unavailable"),
      })),
    };

    tdbMocks.contact.findMany.mockResolvedValueOnce([
      { id: 1 },
      { id: 2 },
      { id: 2 },
    ]);

    const res = await mod.fetchContactData(client, "w1", "", "5555550100");
    expect(res.contact).toBeNull();
    expect(res.potentialContacts).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("fetchContactData: by contact_id sets contact or contactError", async () => {
    const mod = await import("../app/lib/database/contact.server");
    const client: any = {};

    tdbMocks.contact.findFirst.mockResolvedValueOnce({ id: 2 });
    const ok = await mod.fetchContactData(client, "w1", 2, "");
    expect(ok.contact).toEqual({ id: 2 });
    expect(ok.contactError).toBeNull();

    tdbMocks.contact.findFirst.mockRejectedValueOnce(new Error("nope"));
    const bad = await mod.fetchContactData(client, "w1", 2, "");
    expect(bad.contact).toBeNull();
    expect(bad.contactError).toBeInstanceOf(Error);
  });

  test("updateContact: validates id; strips undefined + audience_id; handles errors and empty update", async () => {
    const mod = await import("../app/lib/database/contact.server");

    await expect(
      mod.updateContact("w1", { x: undefined } as any),
    ).rejects.toThrow("Contact ID is required");

    tdbMocks.contact.update.mockResolvedValueOnce([{ id: 1, ok: 1 }]);
    const updated = await mod.updateContact("w1", {
      id: 1,
      audience_id: "a",
      x: undefined,
    } as any);
    expect(updated).toEqual({ id: 1, ok: 1 });

    tdbMocks.contact.update.mockRejectedValueOnce(new Error("bad"));
    await expect(mod.updateContact("w1", { id: 1 } as any)).rejects.toThrow("bad");

    tdbMocks.contact.update.mockResolvedValueOnce([]);
    await expect(mod.updateContact("w1", { id: 1 } as any)).rejects.toThrow(
      "Contact not found",
    );
  });

  test("createContact: inserts contact without audience link", async () => {
    const mod = await import("../app/lib/database/contact.server");

    tdbMocks.contact.insert.mockResolvedValueOnce([{ id: 10 }]);
    await expect(
      mod.createContact({ workspace: "w1" } as any, "", "u1"),
    ).resolves.toEqual([{ id: 10 }]);
  });

  test("createContact: throws when contact insert fails", async () => {
    const mod = await import("../app/lib/database/contact.server");

    tdbMocks.contact.insert.mockRejectedValueOnce(new Error("insert"));
    await expect(
      mod.createContact({ workspace: "w1" } as any, "", "u1"),
    ).rejects.toThrow("insert");
  });

  test("createContact: throws when audience link fails", async () => {
    const mod = await import("../app/lib/database/contact.server");

    tdbMocks.contact.insert.mockResolvedValueOnce([{ id: 10 }]);
    dbMocks.insert.mockImplementationOnce(() => Promise.reject(new Error("link")));
    await expect(
      mod.createContact({ workspace: "w1" } as any, "a1", "u1"),
    ).rejects.toThrow("link");
  });

  test("createContact: links audience on success", async () => {
    const mod = await import("../app/lib/database/contact.server");

    tdbMocks.contact.insert.mockResolvedValueOnce([{ id: 10 }]);
    dbMocks.insert.mockResolvedValueOnce(undefined);
    await expect(
      mod.createContact({ workspace: "w1" } as any, "a1", "u1"),
    ).resolves.toEqual([{ id: 10 }]);
  });

  test("bulkCreateContacts: inserts and links, throwing on either error", async () => {
    const mod = await import("../app/lib/database/contact.server");

    tdbMocks.contact.insertMany.mockResolvedValueOnce([
      { id: 1, workspace: "w1", created_by: "u1", firstname: "A" },
    ]);
    dbMocks.insert.mockReturnValueOnce({
      returning: async () => [{ ok: 1 }],
    });

    const res = await mod.bulkCreateContacts([{ firstname: "A" }] as any, "w1", "a1", "u1");
    expect(res.insert[0]).toMatchObject({ workspace: "w1", created_by: "u1" });

    tdbMocks.contact.insertMany.mockRejectedValueOnce(new Error("ins"));
    await expect(
      mod.bulkCreateContacts([{}] as any, "w1", "a1", "u1"),
    ).rejects.toThrow("ins");

    tdbMocks.contact.insertMany.mockResolvedValueOnce([{ id: 1 }]);
    dbMocks.insert.mockReturnValueOnce({
      returning: async () => {
        throw new Error("link");
      },
    });
    tdbMocks.contact.delete.mockResolvedValueOnce(undefined);
    await expect(
      mod.bulkCreateContacts([{}] as any, "w1", "a1", "u1"),
    ).rejects.toThrow("link");
  });
});
