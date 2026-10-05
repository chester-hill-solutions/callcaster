import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const WS_A = "11111111-1111-1111-1111-111111111111";
const WS_B = "22222222-2222-2222-2222-222222222222";

const CONTACTS = [
  { id: 1, workspace: WS_A },
  { id: 2, workspace: WS_A },
  { id: 99, workspace: WS_B },
];

const mocks = vi.hoisted(() => ({
  /** Scoped-contact lookups, one entry per createTenantDb(...).contact.findMany. */
  contactLookups: [] as { workspaceId: string; sql: string; params: unknown[] }[],
  tenantDbWorkspaces: [] as string[],
  enqueueContactsForCampaign: vi.fn(async () => undefined),
  requireDualAuth: vi.fn(async () => ({ keyId: "k1" })),
  getDualAuthUser: vi.fn(() => ({ id: "u1" })),
  requireWorkspaceAccess: vi.fn(async () => undefined),
  resolveCampaignWorkspaceId: vi.fn(async () => WS_A),
  parseRequestData: vi.fn(async () => ({})),
  findCampaignInWorkspace: vi.fn(async () => ({ id: 57, workspace: WS_A })),
  parseActionRequest: vi.fn(async () => ({})),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: (workspaceId: string) => {
    mocks.tenantDbWorkspaces.push(workspaceId);
    return {
      execute: vi.fn(async () => []),
      contact: {
        findMany: ({ where }: { where: unknown }) => {
          const q = pgDialect.sqlToQuery(where as SQL);
          const requested = (q.params as number[]).map(Number);
          mocks.contactLookups.push({ workspaceId, sql: q.sql, params: q.params });
          return Promise.resolve(
            CONTACTS.filter(
              (c) => c.workspace === workspaceId && requested.includes(c.id),
            ).map((c) => ({ id: c.id })),
          );
        },
      },
    };
  },
}));

vi.mock("@/lib/queue.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue.server")>()),
  enqueueContactsForCampaign: (...args: unknown[]) =>
    mocks.enqueueContactsForCampaign(...args),
}));

vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth.server")>()),
  requireDualAuth: (...args: unknown[]) => mocks.requireDualAuth(...args),
  getDualAuthUser: (...args: unknown[]) => mocks.getDualAuthUser(...args),
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
}));

vi.mock("@/lib/platform-telephony.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-telephony.server")>()),
  resolveCampaignWorkspaceId: (...args: unknown[]) =>
    mocks.resolveCampaignWorkspaceId(...args),
}));

vi.mock("@/lib/request-utils.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-utils.server")>()),
  parseRequestData: (...args: unknown[]) => mocks.parseRequestData(...args),
  parseActionRequest: (...args: unknown[]) => mocks.parseActionRequest(...args),
}));

// `workspaceRouteAuth` is deliberately NOT mocked: it reads the workspace
// context the route helper supplies, and stubbing it to `{}` would leave
// `userRole` undefined and make the min-role gate deny every request.

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  findCampaignInWorkspace: (...args: unknown[]) =>
    mocks.findCampaignInWorkspace(...args),
}));

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));

import { resolveContactsOwnedByWorkspace } from "@/lib/contacts/tenant-scope.server";
import { action as campaignQueueAction } from "@/routes/api+/campaign_queue.action.server";
import { action as workspaceQueueAction } from "@/routes/workspaces+/$id/campaigns/$selected_id/queue.action.server";
import { asRouteResponse } from "./helpers/route-result";
import {
  withDataPlaneRouteArgs,
  withWorkspaceRouteArgs,
} from "./helpers/route-context-mock";

const pgDialect = new PgDialect({ casing: { escapeName: (n: string) => `"${n}"` } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantDbWorkspaces.length = 0;
  mocks.contactLookups.length = 0;
  mocks.resolveCampaignWorkspaceId.mockResolvedValue(WS_A);
  mocks.findCampaignInWorkspace.mockResolvedValue({ id: 57, workspace: WS_A });
  mocks.enqueueContactsForCampaign.mockResolvedValue(undefined);
});

/** POST the dual-auth data-plane campaign_queue route. */
async function callCampaignQueue() {
  const request = new Request("https://app.test/api/campaign_queue", {
    method: "POST",
  });
  return asRouteResponse(
    await campaignQueueAction(
      await withDataPlaneRouteArgs(
        { request, params: { workspaceId: WS_A } },
        { workspaceId: WS_A },
      ),
    ),
  );
}

/** POST add_contacts to the workspace-scoped campaign queue route. */
async function callWorkspaceQueue() {
  const request = new Request("https://app.test/w/x/campaigns/57/queue", {
    method: "POST",
  });
  return asRouteResponse(
    await workspaceQueueAction(
      await withWorkspaceRouteArgs(
        { request, params: { id: WS_A, selected_id: "57" } },
        { workspaceId: WS_A, userRole: "member" },
      ),
    ),
  );
}

describe("resolveContactsOwnedByWorkspace", () => {
  test("resolves the caller's own ids, preserving the caller's order", async () => {
    const result = await resolveContactsOwnedByWorkspace(WS_A, [2, 1]);

    expect(result).toEqual({ ok: true, contactIds: [2, 1] });
  });

  /**
   * The defect this module exists partly to fix. `campaign_queue.action.server.ts`
   * compared the owned-row count against the RAW id list, so a caller posting
   * `[7, 7]` — which the schema permits — found one owned row, compared
   * 1 against 2, and was rejected even though every id was its own.
   */
  test("a repeated id is not treated as a foreign one", async () => {
    const result = await resolveContactsOwnedByWorkspace(WS_A, [1, 1, 2]);

    expect(result).toEqual({ ok: true, contactIds: [1, 2] });
  });

  test("a foreign id rejects the whole list and reports how many were foreign", async () => {
    const result = await resolveContactsOwnedByWorkspace(WS_A, [1, 99]);

    expect(result).toEqual({ ok: false, foreignCount: 1 });
  });

  test("an empty list resolves without querying", async () => {
    const result = await resolveContactsOwnedByWorkspace(WS_A, []);

    expect(result).toEqual({ ok: true, contactIds: [] });
    expect(mocks.contactLookups).toHaveLength(0);
  });

  test("scopes through the tenant client, not a hand-written workspace predicate", async () => {
    await resolveContactsOwnedByWorkspace(WS_A, [1]);

    expect(mocks.tenantDbWorkspaces).toEqual([WS_A]);
    // The tenancy predicate is injected by createTenantDb, so the rendered
    // clause names only the ids. A hand-written eq(contact.workspace, ...) is
    // what ADR-0004 reserves this accessor for; if someone reintroduces one,
    // this fails.
    expect(mocks.contactLookups[0]?.sql).toMatch(/"contact"\."id" in/);
    expect(mocks.contactLookups[0]?.sql).not.toMatch(/workspace/);
  });
});

/**
 * Status-code agreement. `AGENTS.md` requires a uniform 404 for another
 * tenant's resource: a 403, or a message naming the ids, confirms they exist.
 * These three call sites used to answer 400, 403 and 404 respectively. This is
 * the test that fails if a call site drifts back or a new one picks a fifth
 * answer.
 */
describe("every campaign-queue contact guard answers 404", () => {
  test("api+/campaign_queue POST", async () => {
    mocks.parseRequestData.mockResolvedValue({ ids: [1, 99], campaign_id: 57 });

    const response = await callCampaignQueue();

    expect(response.status).toBe(404);
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("workspaces+ queue add_contacts", async () => {
    mocks.parseActionRequest.mockResolvedValue({
      intent: "add_contacts",
      contacts: [{ id: 1 }, { id: 99 }],
    });

    const response = await callWorkspaceQueue();

    expect(response.status).toBe(404);
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("the rejection body names no ids", async () => {
    mocks.parseRequestData.mockResolvedValue({ ids: [99], campaign_id: 57 });

    const response = await callCampaignQueue();

    expect(await response.text()).not.toContain("99");
  });

  test("the rejection is logged with the foreign count, for the operator", async () => {
    mocks.parseRequestData.mockResolvedValue({ ids: [1, 99], campaign_id: 57 });

    await callCampaignQueue();

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "campaign_queue.contact_scope_rejected",
      expect.objectContaining({ foreignCount: 1 }),
    );
  });
});

/** Positive control per call site: the caller's own ids still enqueue. */
describe("every campaign-queue contact guard still enqueues owned ids", () => {
  test("api+/campaign_queue POST", async () => {
    mocks.parseRequestData.mockResolvedValue({ ids: [1, 2], campaign_id: 57 });

    const response = await callCampaignQueue();

    expect(response.status).toBe(200);
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(57, [1, 2], {
      requeue: false,
    });
  });

  test("workspaces+ queue add_contacts", async () => {
    mocks.parseActionRequest.mockResolvedValue({
      intent: "add_contacts",
      contacts: [{ id: 1 }, { id: 2 }],
    });

    const response = await callWorkspaceQueue();

    expect(response.status).toBe(200);
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(57, [1, 2], {
      requeue: false,
    });
  });

  test("a repeated id enqueues once rather than rejecting", async () => {
    mocks.parseRequestData.mockResolvedValue({ ids: [1, 1], campaign_id: 57 });

    const response = await callCampaignQueue();

    expect(response.status).toBe(200);
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(57, [1], {
      requeue: false,
    });
  });
});
