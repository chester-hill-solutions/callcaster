import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const WS_A = "11111111-1111-1111-1111-111111111111";
const WS_B = "22222222-2222-2222-2222-222222222222";

/**
 * Stand-in rows. `workspace` is the whole point: the tenant-db mock below
 * filters on it, so a foreign id genuinely resolves to "not found" the same
 * way it would against a real Postgres. A mock that simply returned whatever
 * it was asked for would make every assertion below tautological.
 */
const CONTACTS = [
  { id: 1, workspace: WS_A },
  { id: 2, workspace: WS_A },
  { id: 3, workspace: WS_A },
  // Another tenant's contact. Naming it in a request must never enqueue it.
  { id: 99, workspace: WS_B },
];

const AUDIENCES = [
  { id: 10, workspace: WS_A },
  { id: 20, workspace: WS_B },
];

/** contact_audience links, keyed by audience id. */
const AUDIENCE_LINKS: Record<number, number[]> = {
  10: [1, 2, 3],
  20: [99],
};

const mocks = vi.hoisted(() => ({
  fetchCampaignData: vi.fn(),
  enqueueContactsForCampaign: vi.fn(async () => undefined),
  /** Renders of the tenant-scoped lookups, for asserting WHICH table was read. */
  contactLookupSql: null as string | null,
  audienceLookupSql: null as string | null,
  /** Where clause of the contact_audience read, rendered. */
  audienceLinksSql: null as string | null,
  /** Which workspace each scoped accessor was built for. */
  tenantDbWorkspaces: [] as string[],
  // The sibling `update_status` / `remove` helpers, which were already scoped.
  deleteByIds: vi.fn(async () => undefined),
  deleteAll: vi.fn(async () => undefined),
  updateStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/database/campaign-stats.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/campaign-stats.server")>()),
  fetchCampaignData: (...args: unknown[]) => mocks.fetchCampaignData(...args),
}));

vi.mock("@/lib/queue.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue.server")>()),
  enqueueContactsForCampaign: (...args: unknown[]) =>
    mocks.enqueueContactsForCampaign(...args),
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: (workspaceId: string) => makeTenantDb(workspaceId),
}));

vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  deleteCampaignQueueByIds: (...args: unknown[]) => mocks.deleteByIds(...args),
  deleteAllCampaignQueueForCampaign: (...args: unknown[]) =>
    mocks.deleteAll(...args),
  updateCampaignQueueStatusByIds: (...args: unknown[]) => mocks.updateStatus(...args),
}));

vi.mock("@/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db")>()),
  db: { select: () => makeAudienceLinksChain() },
}));

import { patchCampaignQueueApi } from "@/lib/platform-data.server";

const pgDialect = new PgDialect({ casing: { escapeName: (n: string) => `"${n}"` } });
const render = (clause: unknown) => pgDialect.sqlToQuery(clause as SQL);

/**
 * Ids carried by a scoped lookup. `sqlToQuery` returns the bound values in
 * `params`, so this reads the ids out of the clause through Drizzle's public
 * API instead of walking private `queryChunks` internals.
 */
const paramsOf = (clause: unknown): unknown[] => render(clause).params;

/** A chainable stand-in for the contact_audience ⋈ contact join. */
function makeAudienceLinksChain() {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: (clause: unknown) => {
      mocks.audienceLinksSql = render(clause).sql;
      // The audience id is the first bound param of the predicate.
      const audienceId = Number(paramsOf(clause)[0]);
      const links = AUDIENCE_LINKS[audienceId] ?? [];
      return Promise.resolve(links.map((contact_id) => ({ contact_id })));
    },
  };
  return chain;
}

/** A tenant client that really filters by the workspace it was built for. */
function makeTenantDb(workspaceId: string) {
  mocks.tenantDbWorkspaces.push(workspaceId);
  return {
    execute: vi.fn(async () => []),
    contact: {
      findMany: ({ where }: { where: unknown }) => {
        mocks.contactLookupSql = render(where).sql;
        const requested = (paramsOf(where) as number[]).map(Number);
        return Promise.resolve(
          CONTACTS.filter(
            (c) => c.workspace === workspaceId && requested.includes(c.id),
          ).map((c) => ({ id: c.id })),
        );
      },
    },
    audience: {
      findFirst: ({ where }: { where: unknown }) => {
        mocks.audienceLookupSql = render(where).sql;
        const id = Number(paramsOf(where)[0]);
        const found = AUDIENCES.find((a) => a.id === id);
        return Promise.resolve(
          found && found.workspace === workspaceId ? { id: found.id } : undefined,
        );
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantDbWorkspaces.length = 0;
  mocks.contactLookupSql = null;
  mocks.audienceLookupSql = null;
  mocks.audienceLinksSql = null;
  // The campaign IS the caller's: the defect is that the ids in the body were
  // never checked, not that the campaign lookup was wrong.
  mocks.fetchCampaignData.mockResolvedValue({ id: 57, workspace: WS_A });
  mocks.enqueueContactsForCampaign.mockResolvedValue(undefined);
});

describe("patchCampaignQueueApi add_contact_ids — tenant scope (#2097)", () => {
  test("a foreign contact id is rejected and nothing is enqueued", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "add_contact_ids",
      contact_ids: [99],
    });

    expect(result).toEqual({
      ok: false,
      error: "Contact not found",
      status: 404,
    });
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("a mixed list is all-or-nothing: the owned id is not enqueued either", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "add_contact_ids",
      contact_ids: [1, 99],
    });

    expect(result).toMatchObject({ ok: false, status: 404 });
    // The dangerous failure mode is a silent partial enqueue that still reports
    // success, so this asserts the CALL did not happen, not just the status.
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("the rejection names no ids, so it is not an existence oracle", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "add_contact_ids",
      contact_ids: [99],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // A body naming 99 would confirm another tenant's contact exists.
      expect(result.error).not.toContain("99");
    }
  });

  test("a duplicate id in the list is not mistaken for a foreign one", async () => {
    // The schema permits repeats. A naive owned-count comparison against the
    // raw list would find one row for [1, 1] and wrongly 404.
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "add_contact_ids",
      contact_ids: [1, 1],
    });

    expect(result).toEqual({ ok: true, success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      57,
      [1],
      { requeue: false },
    );
  });

  test("the caller's own contacts still enqueue (positive control)", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "add_contact_ids",
      contact_ids: [1, 2, 3],
    });

    expect(result).toEqual({ ok: true, success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      57,
      [1, 2, 3],
      { requeue: false },
    );
  });

  test("the check reads contacts through the workspace-scoped client", async () => {
    await patchCampaignQueueApi("57", WS_A, {
      action: "add_contact_ids",
      contact_ids: [1],
    });

    expect(mocks.tenantDbWorkspaces).toEqual([WS_A]);
    // Guards against the scoping being re-implemented as a hand-written
    // `eq(contact.workspace, ...)` against the unscoped client, which the
    // tenancy ADR forbids and which would drift the moment a table changes.
    expect(mocks.contactLookupSql).toMatch(/"contact"\."id"/);
  });
});

describe("patchCampaignQueueApi add_audience — tenant scope (#2097)", () => {
  test("a foreign audience id is rejected and nothing is enqueued", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "add_audience",
      audience_id: 20,
    });

    expect(result).toEqual({
      ok: false,
      error: "Audience not found",
      status: 404,
    });
    // The contact_audience read must not even run for a foreign audience.
    expect(mocks.audienceLinksSql).toBeNull();
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("the caller's own audience enqueues its contacts (positive control)", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "add_audience",
      audience_id: 10,
    });

    expect(result).toEqual({ ok: true, success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      57,
      [1, 2, 3],
      { requeue: false },
    );
  });

  test("the audience is proved through the scoped client, not read by bare id", async () => {
    await patchCampaignQueueApi("57", WS_A, {
      action: "add_audience",
      audience_id: 10,
    });

    expect(mocks.audienceLookupSql).toMatch(/"audience"\."id"/);
  });

  /**
   * Defence in depth. The audience is already proven to be the caller's, so this
   * predicate is not what stops the attack — it is what makes "every enqueued
   * contact is in the caller's workspace" true by construction instead of by
   * the assumption that an audience only ever links its own tenant's contacts.
   * `contact_audience` has no tenancy column, so the join is the only place the
   * contact's own workspace can be checked.
   */
  test("the audience's contacts are filtered on the contact's own workspace", async () => {
    await patchCampaignQueueApi("57", WS_A, {
      action: "add_audience",
      audience_id: 10,
    });

    expect(mocks.audienceLinksSql).toMatch(/"contact_audience"\."audience_id"/);
    expect(mocks.audienceLinksSql).toMatch(/"contact"\."workspace"/);
  });
});

describe("patchCampaignQueueApi — the sibling actions stay scoped", () => {
  /**
   * `update_status` and `remove` already passed `workspaceId` into their
   * helpers before #2097; only the two `add_` branches were unscoped. The fix
   * must not quietly drop the argument the others rely on, and a regression
   * here would reopen the same hole by a different route.
   */
  test("remove passes the caller's workspace into the delete", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "remove",
      ids: [1],
    });

    expect(result).toEqual({ ok: true, success: true });
    expect(mocks.deleteByIds).toHaveBeenCalledWith([1], WS_A);
  });

  test("update_status passes the caller's workspace into the update", async () => {
    const result = await patchCampaignQueueApi("57", WS_A, {
      action: "update_status",
      status: "queued",
      ids: [1],
    });

    expect(result).toEqual({ ok: true, success: true });
    expect(mocks.updateStatus).toHaveBeenCalledWith([1], "queued", WS_A);
  });
});
