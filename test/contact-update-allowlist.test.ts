import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #2861: the legacy `PATCH /api/contacts` passed the request body straight to
 * `updateContact`, which built its UPDATE from every key except `audience_id`.
 * A caller could therefore rewrite `opt_out`, `created_by`, `workspace` (moving
 * the contact to another tenant) and the row id itself.
 *
 * The captured `set` payload is the statement handed to Postgres, so the
 * assertion is about the write, not about the helper's bookkeeping.
 */
const mocks = vi.hoisted(() => ({
  setPayloads: [] as Record<string, unknown>[],
}));

vi.mock("@/server/tenant-db", () => {
  const contact = {
    update: async (args: { set: Record<string, unknown> }) => {
      mocks.setPayloads.push(args.set);
      return [{ id: 7 }];
    },
  };
  return { createTenantDb: () => ({ contact }) };
});

describe("updateContact allowlist (#2861)", () => {
  beforeEach(() => {
    mocks.setPayloads.length = 0;
  });

  test("writes only the editor's fields and drops authorization state", async () => {
    const { updateContact } = await import("@/lib/database/contact.server");

    await updateContact("ws_1", {
      id: 7,
      firstname: "Pat",
      phone: "+15555550100",
      opt_out: true,
      created_by: "someone-else",
      workspace: "ws_victim",
    } as never);

    expect(mocks.setPayloads).toEqual([
      { firstname: "Pat", phone: "+15555550100" },
    ]);
  });

  test("refuses a body with nothing updatable instead of writing an empty set", async () => {
    const { updateContact } = await import("@/lib/database/contact.server");

    await expect(
      updateContact("ws_1", { id: 7, opt_out: true } as never),
    ).rejects.toThrow("No updatable contact fields supplied");
    expect(mocks.setPayloads).toEqual([]);
  });
});
