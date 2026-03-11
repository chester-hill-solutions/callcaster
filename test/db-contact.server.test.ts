import { describe, expect, test, vi } from "vitest";

describe("app/lib/database/contact.server.ts", () => {
  test("findPotentialContacts builds an .or() query and returns result", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const orArg: { value?: string } = {};
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      or: (s: string) => {
        orArg.value = s;
        return chain;
      },
      not: () => chain,
      neq: async () => ({ data: [{ id: 1 }], error: null }),
    };

    const supabase: any = { from: vi.fn(() => chain) };
    const res = await mod.findPotentialContacts(
      supabase,
      "(555) 555-0100",
      "w1",
    );

    expect(supabase.from).toHaveBeenCalledWith("contact");
    expect(orArg.value).toContain("phone.eq.5555550100");
    expect(orArg.value).toContain("phone.eq.+15555550100");
    expect(orArg.value).toContain("phone.ilike.%5555550100");
    expect(res).toEqual({ data: [{ id: 1 }], error: null });
  });

  test("fetchContactData: by number only promotes a unique match to contact", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      not: () => chain,
      neq: async () => ({ data: [{ id: 1 }], error: null }),
    };
    const supabase: any = { from: vi.fn(() => chain) };

    const res = await mod.fetchContactData(supabase, "w1", "", "5555550100");
    expect(res.contact).toEqual({ id: 1 });
    expect(res.contactError).toBeNull();
    expect(res.potentialContacts).toEqual([]);
  });

  test("fetchContactData: by number only handles null data", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      not: () => chain,
      neq: async () => ({ data: null, error: null }),
    };
    const supabase: any = { from: vi.fn(() => chain) };

    const res = await mod.fetchContactData(supabase, "w1", "", "5555550100");
    expect(res.potentialContacts).toEqual([]);
  });

  test("fetchContactData: by number only keeps ambiguous matches as potential contacts", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      not: () => chain,
      neq: async () => ({ data: [{ id: 1 }, { id: 2 }, { id: 2 }], error: null }),
    };
    const supabase: any = { from: vi.fn(() => chain) };

    const res = await mod.fetchContactData(supabase, "w1", "", "5555550100");
    expect(res.contact).toBeNull();
    expect(res.potentialContacts).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("fetchContactData: by contact_id sets contact or contactError", async () => {
    const mod = await import("../app/lib/database/contact.server");

    let mode: "ok" | "err" = "ok";
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      single: async () =>
        mode === "ok"
          ? { data: { id: 2 }, error: null }
          : { data: null, error: new Error("nope") },
    };
    const supabase: any = { from: vi.fn(() => chain) };

    const ok = await mod.fetchContactData(supabase, "w1", 2, "");
    expect(ok.contact).toEqual({ id: 2 });
    expect(ok.contactError).toBeNull();

    mode = "err";
    const bad = await mod.fetchContactData(supabase, "w1", 2, "");
    expect(bad.contact).toBeNull();
    expect(bad.contactError).toBeInstanceOf(Error);
  });

  test("updateContact: validates id; strips undefined + audience_id; handles errors and empty update", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const supabase: any = {
      from: () => ({
        update: (data: any) => {
          // audience_id is removed and undefined keys are removed
          expect(data.audience_id).toBeUndefined();
          expect("x" in data).toBe(false);
          return {
            eq: () => ({
              select: async () => ({ data: [{ id: data.id, ok: 1 }], error: null }),
            }),
          };
        },
      }),
    };

    await expect(mod.updateContact(supabase, { x: undefined } as any)).rejects.toThrow(
      "Contact ID is required",
    );

    const updated = await mod.updateContact(supabase, {
      id: 1,
      audience_id: "a",
      x: undefined,
    } as any);
    expect(updated).toEqual({ id: 1, ok: 1 });

    const supabaseErr: any = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: async () => ({ data: null, error: new Error("bad") }),
          }),
        }),
      }),
    };
    await expect(mod.updateContact(supabaseErr, { id: 1 } as any)).rejects.toThrow(
      "bad",
    );

    const supabaseEmpty: any = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };
    await expect(mod.updateContact(supabaseEmpty, { id: 1 } as any)).rejects.toThrow(
      "Contact not found",
    );
  });

  test("createContact: inserts contact and optionally links audience", async () => {
    const mod = await import("../app/lib/database/contact.server");

    const insertRows = [{ id: 10 }];
    let linkError: Error | null = null;
    let insertError: Error | null = null;
    const supabase: any = {
      from: (table: string) => {
        if (table === "contact") {
          return {
            insert: () => ({
              select: async () => ({ data: insertRows, error: insertError }),
            }),
          };
        }
        if (table === "contact_audience") {
          return {
            insert: () => ({
              select: async () => ({ data: null, error: linkError }),
            }),
          };
        }
        throw new Error("unexpected table");
      },
    };

    await expect(
      mod.createContact(supabase, { workspace: "w1" } as any, "", "u1"),
    ).resolves.toEqual(insertRows);

    insertError = new Error("insert");
    await expect(
      mod.createContact(supabase, { workspace: "w1" } as any, "", "u1"),
    ).rejects.toThrow("insert");
    insertError = null;

    linkError = new Error("link");
    await expect(
      mod.createContact(supabase, { workspace: "w1" } as any, "a1", "u1"),
    ).rejects.toThrow("link");

    linkError = null;
    await expect(
      mod.createContact(supabase, { workspace: "w1" } as any, "a1", "u1"),
    ).resolves.toEqual(insertRows);
  });

  test("bulkCreateContacts: inserts and links, throwing on either error", async () => {
    const mod = await import("../app/lib/database/contact.server");

    let mode: "ok" | "contactErr" | "linkErr" = "ok";
    const supabase: any = {
      from: (table: string) => {
        if (table === "contact") {
          return {
            insert: (rows: any[]) => ({
              select: async () =>
                mode === "contactErr"
                  ? { data: null, error: new Error("ins") }
                  : {
                      data: rows.map((r, idx) => ({ id: idx + 1, ...r })),
                      error: null,
                    },
            }),
          };
        }
        if (table === "contact_audience") {
          return {
            insert: () => ({
              select: async () =>
                mode === "linkErr"
                  ? { data: null, error: new Error("link") }
                  : { data: [{ ok: 1 }], error: null },
            }),
          };
        }
        throw new Error("unexpected");
      },
    };

    mode = "ok";
    const res = await mod.bulkCreateContacts(
      supabase,
      [{ firstname: "A" }] as any,
      "w1",
      "a1",
      "u1",
    );
    expect(res.insert[0]).toMatchObject({ workspace: "w1", created_by: "u1" });

    mode = "contactErr";
    await expect(
      mod.bulkCreateContacts(supabase, [{}] as any, "w1", "a1", "u1"),
    ).rejects.toThrow("ins");

    mode = "linkErr";
    await expect(
      mod.bulkCreateContacts(supabase, [{}] as any, "w1", "a1", "u1"),
    ).rejects.toThrow("link");
  });
});

