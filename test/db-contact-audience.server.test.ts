import { describe, expect, test, vi } from "vitest";

describe("app/lib/database/contact-audience.server.ts", () => {
  test("removeContactFromAudience: throws on delete error; otherwise success", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    const deleteChainErr: any = {
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: new Error("nope") }),
        }),
      }),
    };
    const supabaseErr: any = { from: vi.fn(() => deleteChainErr) };
    await expect(
      mod.removeContactFromAudience(supabaseErr, 1, 2),
    ).rejects.toThrow("nope");

    const deleteChainOk: any = {
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    };
    const supabaseOk: any = { from: vi.fn(() => deleteChainOk) };
    await expect(mod.removeContactFromAudience(supabaseOk, 1, 2)).resolves.toEqual(
      { success: true },
    );
  });

  test("removeContactsFromAudience: updates audience total_contacts using count ?? 0", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    const updateSpy = vi.fn(async () => ({ data: null, error: null }));
    const selectSpy = vi.fn(async () => ({ count: null, error: null }));

    const supabase: any = {
      from: (table: string) => {
        if (table === "contact_audience") {
          return {
            delete: () => ({
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            }),
            select: () => ({
              eq: async () => selectSpy(),
            }),
          };
        }
        if (table === "audience") {
          return {
            update: (data: any) => {
              updateSpy(data);
              return { eq: async () => ({ data: null, error: null }) };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const res = await mod.removeContactsFromAudience(supabase, 99, [1, 2, 3]);
    expect(res).toEqual({ removed_count: 3, new_total: 0 });
    expect(updateSpy).toHaveBeenCalledWith({ total_contacts: 0 });
  });

  test("removeContactsFromAudience: throws when audience total_contacts update fails", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    const supabase: any = {
      from: (table: string) => {
        if (table === "contact_audience") {
          return {
            delete: () => ({
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            }),
            select: () => ({
              eq: async () => ({ count: 2, error: null }),
            }),
          };
        }
        if (table === "audience") {
          return {
            update: () => ({
              eq: async () => ({ error: new Error("upd") }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await expect(mod.removeContactsFromAudience(supabase, 99, [1, 2])).rejects.toThrow("upd");
  });

  test("removeContactsFromAudience: throws when delete fails", async () => {
    const mod = await import("../app/lib/database/contact-audience.server");

    const supabase: any = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            in: async () => ({ error: new Error("del") }),
          }),
        }),
      }),
    };

    await expect(mod.removeContactsFromAudience(supabase, 1, [1])).rejects.toThrow(
      "del",
    );
  });
});

