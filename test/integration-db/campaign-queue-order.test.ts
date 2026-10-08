import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse } from "../helpers/route-result";

const session = vi.hoisted(() => ({ userId: "" }));
vi.unmock("@/lib/api-auth.server");
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: vi.fn(async () => ({ user: { id: session.userId }, headers: new Headers() })),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const actorId = randomUUID();
const workspaceId = randomUUID();
const foreignWorkspaceId = randomUUID();

suite("public campaign queue ordering against real Postgres (#2152)", () => {
  let campaignId: number;
  let foreignCampaignId: number;
  let contactIds: number[];
  let foreignContactId: number;

  beforeAll(() => {
    session.userId = actorId;
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
  });

  async function cleanup() {
    const { pool } = await import("@/server/db");
    await pool`delete from campaign_queue where workspace in (${workspaceId}, ${foreignWorkspaceId})`;
    await pool`delete from contact where workspace in (${workspaceId}, ${foreignWorkspaceId})`;
    await pool`delete from campaign where workspace in (${workspaceId}, ${foreignWorkspaceId})`;
    await pool`delete from workspace_member where workspace_id in (${workspaceId}, ${foreignWorkspaceId})`;
    await pool`delete from workspace where id in (${workspaceId}, ${foreignWorkspaceId})`;
    await pool`delete from "user" where id = ${actorId}`;
  }

  beforeEach(async () => {
    await cleanup();
    const { pool } = await import("@/server/db");
    await pool`insert into "user" (id, username) values (${actorId}, ${`queue-order-${actorId}`})`;
    await pool`insert into workspace (id, name, credits, twilio_data) values
      (${workspaceId}, 'Queue order fixture', 1000, '{}'::jsonb),
      (${foreignWorkspaceId}, 'Foreign queue control', 1000, '{}'::jsonb)`;
    await pool`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${`wm:${workspaceId}:${actorId}`}, ${workspaceId}, ${actorId}, 'owner')`;
    const campaigns = await pool`insert into campaign (workspace, title, type, status, next_queue_order) values
      (${workspaceId}, 'Owned order fixture', 'message', 'draft', 37),
      (${foreignWorkspaceId}, 'Foreign order control', 'message', 'draft', 37)
      returning id, workspace`;
    campaignId = Number(campaigns.find((row) => row.workspace === workspaceId)?.id);
    foreignCampaignId = Number(campaigns.find((row) => row.workspace === foreignWorkspaceId)?.id);
    contactIds = [];
    for (let index = 0; index < 6; index++) {
      const [contact] = await pool`insert into contact (workspace, phone)
        values (${workspaceId}, ${`+1555555010${index}`}) returning id`;
      contactIds.push(Number(contact.id));
    }
    const [foreign] = await pool`insert into contact (workspace, phone)
      values (${foreignWorkspaceId}, '+15555550200') returning id`;
    foreignContactId = Number(foreign.id);
  });

  afterAll(async () => {
    try {
      await cleanup();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  async function enqueue(ids: number[], fields: Record<string, unknown> = {}) {
    const { action } = await import("../../app/routes/api+/campaign_queue.action.server");
    const request = new Request("http://localhost/api/campaign_queue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, campaign_id: campaignId, ...fields }),
    });
    return asRouteResponse(action({ request, url: new URL(request.url), params: {}, context: new RouterContextProvider() }));
  }

  async function queues() {
    const { pool } = await import("@/server/db");
    return pool`select id, contact_id, queue_order from campaign_queue
      where workspace = ${workspaceId} and campaign_id = ${campaignId} order by queue_order`;
  }

  async function nextOrder(id = campaignId) {
    const { pool } = await import("@/server/db");
    const [row] = await pool`select next_queue_order from campaign where id = ${id}`;
    return Number(row.next_queue_order);
  }

  test("omitted client order uses the campaign's reserved range", async () => {
    expect((await enqueue(contactIds.slice(0, 2))).status).toBe(200);
    expect((await queues()).map((row) => Number(row.queue_order))).toEqual([37, 38]);
    expect(await nextOrder()).toBe(39);
  });

  test.each([{ startOrder: 9999 }, { startOrder: "9999" }, { startOrder: -7 }])(
    "client order $startOrder cannot replace the server range", async (fields) => {
      expect((await enqueue(contactIds.slice(0, 2), fields)).status).toBe(200);
      expect((await queues()).map((row) => Number(row.queue_order))).toEqual([37, 38]);
      expect(await nextOrder()).toBe(39);
    },
  );

  test("concurrent public requests receive contiguous disjoint ranges", async () => {
    const groups = [contactIds.slice(0, 3), contactIds.slice(3)];
    const responses = await Promise.all(groups.map((ids) => enqueue(ids)));
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const rows = await queues();
    expect(rows.map((row) => Number(row.queue_order))).toEqual([37, 38, 39, 40, 41, 42]);
    for (const ids of groups) {
      const orders = rows.filter((row) => ids.includes(Number(row.contact_id))).map((row) => Number(row.queue_order));
      expect(orders).toHaveLength(3);
      expect(orders[1] - orders[0]).toBe(1);
      expect(orders[2] - orders[1]).toBe(1);
    }
    expect(await nextOrder()).toBe(43);
  });

  test("the canonical helper also ignores an extra runtime order option", async () => {
    const { enqueueContactsForCampaign } = await import("@/lib/queue.server");
    const options = { startOrder: 9999, requeue: false };
    await enqueueContactsForCampaign(campaignId, contactIds.slice(0, 2), options);
    expect((await queues()).map((row) => Number(row.queue_order))).toEqual([37, 38]);
    expect(await nextOrder()).toBe(39);
  });

  test("repeated contacts retain their rows and the SQL unique constraint", async () => {
    const ids = contactIds.slice(0, 2);
    expect((await enqueue(ids)).status).toBe(200);
    const original = await queues();
    expect((await enqueue(ids)).status).toBe(200);
    expect(await queues()).toEqual(original);
    const { pool } = await import("@/server/db");
    await expect(pool`insert into campaign_queue (workspace, campaign_id, contact_id, queue_order)
      values (${workspaceId}, ${campaignId}, ${ids[0]}, 888)`)
      .rejects.toMatchObject({ code: "23505" });
    expect(await queues()).toEqual(original);
  });

  test("a non-member campaign does not allocate or write", async () => {
    expect((await enqueue([foreignContactId], { campaign_id: foreignCampaignId })).status).toBe(404);
    expect(await nextOrder(foreignCampaignId)).toBe(37);
    const { pool } = await import("@/server/db");
    expect(await pool`select id from campaign_queue where workspace = ${foreignWorkspaceId}`).toHaveLength(0);
  });

  test("a mixed foreign-contact request is rejected before any allocation", async () => {
    expect((await enqueue([contactIds[0], foreignContactId])).status).toBe(404);
    expect(await nextOrder()).toBe(37);
    expect(await queues()).toHaveLength(0);
  });

  test("an empty request does not advance the reservation counter", async () => {
    expect((await enqueue([])).status).toBe(200);
    expect(await nextOrder()).toBe(37);
    expect(await queues()).toHaveLength(0);
  });
});
