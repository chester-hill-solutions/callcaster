import { afterAll, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import type { Database } from "@/server/db";
import { asRouteResponse } from "../helpers/route-result";

const session = vi.hoisted(() => ({ userId: "21410000-0000-4000-8000-000000000001" }));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: vi.fn(async () => ({ user: { id: session.userId }, headers: new Headers() })),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = "21410000-0000-4000-8000-000000000010";
const otherWorkspace = "21410000-0000-4000-8000-000000000011";
const actor = "21410000-0000-4000-8000-000000000001";
const member = "21410000-0000-4000-8000-000000000002";
const foreignUser = "21410000-0000-4000-8000-000000000003";
const missingUser = "21410000-0000-4000-8000-000000000004";
type Fixture = { tx: Database; queueId: number; foreignQueueId: number };

suite("queue assignment validates real target rows (#2141)", () => {
  afterAll(async () => {
    const { pool, directPool } = await import("@/server/db");
    await Promise.all([pool.end(), directPool.end()]);
  });

  async function withRows(run: (fixture: Fixture) => Promise<void>) {
    process.env.DATABASE_URL = databaseUrl;
    const { db } = await import("@/server/db");
    const tenant = await import("@/server/tenant-db");
    const createTenantDb = tenant.createTenantDb;
    const rollback = new Error("Roll back isolated queue assignment rows");
    try {
      await db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        await tx.execute(sql`insert into public."user" (id, username, created_at) values
          (${actor}, 'queue-owner@example.test', now()),
          (${member}, 'queue-member@example.test', now()),
          (${foreignUser}, 'queue-foreign@example.test', now())`);
        await tx.execute(sql`insert into public.workspace (id, name, twilio_data, disabled, feature_flags, credits) values
          (${workspace}, 'Queue assignment', '{}'::jsonb, false, '{}'::jsonb, 1000),
          (${otherWorkspace}, 'Queue control', '{}'::jsonb, false, '{}'::jsonb, 1000)`);
        await tx.execute(sql`insert into public.workspace_member (id, workspace_id, user_id, role_id) values
          ('queue-actor', ${workspace}, ${actor}, 'owner'),
          ('queue-member', ${workspace}, ${member}, 'caller'),
          ('queue-foreign', ${otherWorkspace}, ${foreignUser}, 'caller')`);
        const queues = await tx.execute<{ id: number; workspace_id: string }>(sql`
          insert into public.inbound_queue (workspace_id, name) values
          (${workspace}, 'Owned'), (${otherWorkspace}, 'Foreign') returning id, workspace_id`);
        const queueId = Number(queues.find((q) => q.workspace_id === workspace)?.id);
        const foreignQueueId = Number(queues.find((q) => q.workspace_id === otherWorkspace)?.id);
        expect(Number.isSafeInteger(queueId)).toBe(true);
        expect(Number.isSafeInteger(foreignQueueId)).toBe(true);
        const spy = vi.spyOn(tenant, "createTenantDb")
          .mockImplementation((ws) => createTenantDb(ws, tx));
        try { await run({ tx, queueId, foreignQueueId }); } finally { spy.mockRestore(); }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  async function assignments(tx: Database) {
    return tx.execute(sql`select workspace_id, queue_id, user_id from public.inbound_queue_member
      where workspace_id in (${workspace}, ${otherWorkspace}) order by id`);
  }

  async function add(route: "api" | "product", queueId: number, userId: string, role = "owner") {
    const tenant = await import("@/server/tenant-db");
    const { workspaceContext } = await import("@/lib/route-context.server");
    const context = new RouterContextProvider();
    context.set(workspaceContext, {
      workspaceId: workspace, userId: actor, userRole: role,
      headers: new Headers({ "x-auth-test": "retained" }), tdb: tenant.createTenantDb(workspace),
    });
    const api = route === "api";
    const request = new Request(api ? "http://localhost/api/inbound-queue" : `http://localhost/workspaces/${workspace}/settings/queues`, {
      method: api ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspace, queue_id: queueId, user_id: userId,
        ...(api ? { action: "add" } : { _action: "add-member" }) }),
    });
    const { action } = api
      ? await import("../../app/routes/api+/inbound-queue.action.server")
      : await import("../../app/routes/workspaces+/$id/settings/queues.action.server");
    return asRouteResponse(action({ request, url: new URL(request.url), params: { id: workspace }, context }));
  }

  for (const route of ["api", "product"] as const) {
    test(`${route}: foreign existing user receives 400 without an insert`, async () => {
      await withRows(async ({ tx, queueId }) => {
        const response = await add(route, queueId, foreignUser);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: "User is not a member of this workspace." });
        expect(await assignments(tx)).toEqual([]);
        if (route === "product") expect(response.headers.get("x-auth-test")).toBe("retained");
      });
    });

    test(`${route}: nonexistent user receives clear 400 without an insert`, async () => {
      await withRows(async ({ tx, queueId }) => {
        const response = await add(route, queueId, missingUser);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: "User is not a member of this workspace." });
        expect(await assignments(tx)).toEqual([]);
      });
    });

    test(`${route}: foreign queue receives 400 without an insert`, async () => {
      await withRows(async ({ tx, foreignQueueId }) => {
        const response = await add(route, foreignQueueId, member);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: "Queue does not belong to this workspace." });
        expect(await assignments(tx)).toEqual([]);
      });
    });

    test(`${route}: valid same-workspace caller is assigned to the requested queue`, async () => {
      await withRows(async ({ tx, queueId }) => {
        const response = await add(route, queueId, member);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true });
        expect(await assignments(tx)).toEqual([{ workspace_id: workspace, queue_id: String(queueId), user_id: member }]);
      });
    });

    test(`${route}: duplicate database failure remains 500 and does not insert another assignment`, async () => {
      await withRows(async ({ tx, queueId }) => {
        expect((await add(route, queueId, member)).status).toBe(200);
        const before = await assignments(tx);
        // A savepoint keeps the rejection from aborting the outer proof transaction.
        await tx.execute(sql`savepoint duplicate_assignment`);
        try {
          expect((await add(route, queueId, member)).status).toBe(500);
        } finally {
          await tx.execute(sql`rollback to savepoint duplicate_assignment`);
          await tx.execute(sql`release savepoint duplicate_assignment`);
        }
        expect(await assignments(tx)).toEqual(before);
      });
    });

    test(`${route}: caller actor remains forbidden without an insert`, async () => {
      await withRows(async ({ tx, queueId }) => {
        await tx.execute(sql`update public.workspace_member set role_id = 'caller' where id = 'queue-actor'`);
        expect((await add(route, queueId, member, "caller")).status).toBe(403);
        expect(await assignments(tx)).toEqual([]);
      });
    });
  }

  test("direct service rejects a foreign queue and a foreign user without route validation", async () => {
    await withRows(async ({ tx, queueId, foreignQueueId }) => {
      const { addInboundQueueMember } = await import("@/lib/inbound-queue-db.server");
      await expect(addInboundQueueMember({ workspaceId: workspace, queueId: foreignQueueId, userId: member }))
        .rejects.toMatchObject({ statusCode: 400 });
      await expect(addInboundQueueMember({ workspaceId: workspace, queueId, userId: foreignUser }))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(await assignments(tx)).toEqual([]);
    });
  });

  test("direct service permits a valid member through an explicitly scoped client", async () => {
    await withRows(async ({ tx, queueId }) => {
      const { addInboundQueueMember } = await import("@/lib/inbound-queue-db.server");
      const { createTenantDb } = await import("@/server/tenant-db");
      await addInboundQueueMember({ workspaceId: workspace, queueId, userId: member, tdb: createTenantDb(workspace) });
      expect(await assignments(tx)).toEqual([{ workspace_id: workspace, queue_id: String(queueId), user_id: member }]);
    });
  });

  test.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "direct service rejects invalid queue ID %s without database work",
    async (queueId) => {
      await withRows(async ({ tx }) => {
        const { addInboundQueueMember } = await import("@/lib/inbound-queue-db.server");
        await expect(addInboundQueueMember({ workspaceId: workspace, queueId, userId: member }))
          .rejects.toMatchObject({ statusCode: 400, message: "Choose a valid queue." });
        expect(await assignments(tx)).toEqual([]);
      });
    },
  );

  test("direct service rejects an empty user ID without an insert", async () => {
    await withRows(async ({ tx, queueId }) => {
      const { addInboundQueueMember } = await import("@/lib/inbound-queue-db.server");
      await expect(addInboundQueueMember({ workspaceId: workspace, queueId, userId: "" }))
        .rejects.toMatchObject({ statusCode: 400, message: "Choose a workspace member." });
      expect(await assignments(tx)).toEqual([]);
    });
  });
});
