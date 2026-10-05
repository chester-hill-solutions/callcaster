import { describe, expect, test } from "vitest";
import { analyzePublicQueueOrder } from "../scripts/lib/public-queue-order-contract.mjs";

const enqueueImport = 'import { enqueueContactsForCampaign } from "@/lib/queue.server";';
const tableImport = 'import { campaign_queue } from "@/db/schema";';
const sqlImport = 'import { sql } from "drizzle-orm";';

function check(source: string) {
  return analyzePublicQueueOrder([{ file: "app/routes/api+/fixture.action.server.ts", source }]);
}

describe("public enqueue options", () => {
  test.each([
    '{ startOrder: body.startOrder }', '{ startOrder }', '{ "startOrder": 4 }',
    '{ ["startOrder"]: 4 }', '{ requeue: false, ...body }', 'body', 'options',
  ])("rejects forwarded or unproved options: %s", (options) => {
    expect(check(`${enqueueImport} export const action = () => enqueueContactsForCampaign(1, [2], ${options});`))
      .toMatchObject([{ kind: "forwarded-order" }]);
  });

  test("recognizes a renamed multiline import", () => {
    expect(check('import {\n enqueueContactsForCampaign as enqueue,\n} from "@/lib/queue.server"; export const action = () => enqueue(1, [2], { startOrder: 4 });'))
      .toMatchObject([{ kind: "forwarded-order" }]);
  });

  test("recognizes namespace and indexed calls", () => {
    expect(check('import * as queue from "@/lib/queue.server"; queue["enqueueContactsForCampaign"](1, [2], {startOrder});'))
      .toMatchObject([{ kind: "forwarded-order" }]);
  });

  test("follows simple local helper and namespace aliases", () => {
    expect(check(`${enqueueImport} const enqueue = enqueueContactsForCampaign; enqueue(1,[2],body);`))
      .toMatchObject([{ kind: "forwarded-order" }]);
    expect(check('import * as queue from "@/lib/queue.server"; const local = queue; local.enqueueContactsForCampaign(1,[2],body);'))
      .toMatchObject([{ kind: "forwarded-order" }]);
    expect(check('import * as queue from "@/lib/queue.server"; const enqueue = queue.enqueueContactsForCampaign; enqueue(1,[2],body);'))
      .toMatchObject([{ kind: "forwarded-order" }]);
  });

  test("resolves a relative canonical import", () => {
    expect(check('import { enqueueContactsForCampaign as enqueue } from "../../lib/queue.server.ts"; enqueue(1,[2],body);'))
      .toMatchObject([{ kind: "forwarded-order" }]);
  });

  test("does not mistake a shadowed parameter for the imported helper", () => {
    expect(check(`${enqueueImport} function unrelated(enqueueContactsForCampaign) { enqueueContactsForCampaign(1,[2],body); }`)).toEqual([]);
  });

  test.each(['', ', { requeue }', ', { requeue: true, exec: tx }'])('permits explicit server options %s', (options) => {
    expect(check(`${enqueueImport} enqueueContactsForCampaign(1, [2]${options});`)).toEqual([]);
  });

  test("ignores unused imports, comments and type fields", () => {
    expect(check(`${enqueueImport} type Payload = { startOrder: number }; // enqueueContactsForCampaign(1,[2],body)
      export const action = () => unrelated({ startOrder: 4 });`)).toEqual([]);
  });
});

describe("direct public queue writes", () => {
  test.each([
    'db.update(campaign_queue).set({ queue_order: body.order });',
    'db.insert(campaign_queue).values([{ queue_order: 4 }]);',
    'db.insert(campaign_queue).values({ contact_id: 2 }).onConflictDoUpdate({ target: key, set: { queue_order: 4 } });',
    'db.update(campaign_queue).set(body);',
    'db.update(campaign_queue).set({ ...body });',
    'tdb.campaign_queue.update({ set: { ["queue_order"]: 4 } });',
    'tdb.campaign_queue.update({ set });',
    'tdb.campaign_queue.update({ set: { provider_status: "sent" }, ...body });',
    'tdb.campaign_queue.insert({ queue_order: 4 });',
    'const table = tdb.campaign_queue; table.update({ set: { queue_order: 4 } });',
    'const table = tdb["campaign_queue"]; table.insert({ queue_order: 4 });',
    'const write = db.update(campaign_queue); write.set({ queue_order: 4 });',
  ])('rejects order writes or unknown write fields: %s', (source) => {
    expect(check(`${tableImport} ${source}`)).toMatchObject([{ kind: "direct-order-write" }]);
  });

  test("recognizes schema import aliases and namespaces", () => {
    expect(check('import { campaign_queue as queue } from "@/db/schema"; db.update(queue).set({queue_order:4});'))
      .toMatchObject([{ kind: "direct-order-write" }]);
    expect(check('import * as schema from "@/db/schema"; db.update(schema.campaign_queue).set({queue_order:4});'))
      .toMatchObject([{ kind: "direct-order-write" }]);
  });

  test.each([
    'db.select({ queue_order: campaign_queue.queue_order }).from(campaign_queue);',
    'db.update(campaign_queue).set({ provider_status: "sent" }).where(eq(campaign_queue.queue_order, 4));',
    'tdb.campaign_queue.update({ set: { provider_status: "sent" } });',
    'db.insert(contact).values({ queue_order: 4 });',
    'const table = tdb.campaign_queue; table.update({ set: { provider_status: "sent" } });',
  ])('permits reads and explicit non-order writes: %s', (source) => {
    expect(check(`${tableImport} ${source}`)).toEqual([]);
  });

  test.each([
    'sql`update campaign_queue set queue_order = ${body.order} where id = 2`;',
    'sql`update "public"."campaign_queue" set "queue_order" = 4 where id = 2`;',
    'sql`insert into campaign_queue (campaign_id, queue_order) values (1, 4)`;',
    'sql`update ${campaign_queue} set queue_order = 4`;',
    'sql`update campaign_queue set ${body.fields} where id = 2`;',
    'sql.raw("update campaign_queue set queue_order = 4 where id = 2");',
    'sql["raw"](`update campaign_queue set queue_order = ${body.order}`);',
    'const raw = sql.raw; raw("update campaign_queue set queue_order = 4");',
    'sql.raw(body.sql);',
    'sql`insert into campaign_queue (contact_id) values (2) on conflict (contact_id) do update set queue_order = 4`;',
    'sql`update campaign_queue set provider_status = \'sent\', (queue_order, attempt_count) = (4, 0)`;',
    'sql`insert into campaign_queue (contact_id) values (2) on conflict (contact_id) do update set (queue_order, attempt_count) = (4, 0)`;',
    'sql`update campaign_queue set provider_status = \'sent\', ${body.fields}`;',
  ])('rejects SQL order writes: %s', (source) => {
    expect(check(`${sqlImport} ${tableImport} ${source}`)).toMatchObject([{ kind: "direct-order-write" }]);
  });

  test("SQL reads, string values and comments are not writes", () => {
    expect(check(`${sqlImport} sql\`select queue_order, 'update campaign_queue set queue_order = 4' from campaign_queue\`;`)).toEqual([]);
    expect(check(`${sqlImport} sql\`update campaign_queue set provider_status = 'sent' where queue_order = 4 /* queue_order = 7 */\`;`)).toEqual([]);
  });

  test.each([
    'sql.raw("select queue_order from campaign_queue");',
    'sql.raw("update campaign_queue set provider_status = \'sent\' where queue_order = 4");',
    'sql`update campaign_queue set (provider_status, attempt_count) = (\'sent\', 1) where queue_order = 4`;',
    'sql`insert into campaign_queue (contact_id) values (2) on conflict (contact_id) do update set provider_status = \'sent\'`;',
    'sql`insert into campaign_queue (contact_id) values (2); insert into contact (id) values (2) on conflict (id) do update set queue_order = 4`;',
    'function unrelated(sql) { sql.raw(body.sql); }',
  ])('permits raw reads and proved non-order SQL writes: %s', (source) => {
    expect(check(`${sqlImport} ${source}`)).toEqual([]);
  });
});


describe("direct public queue-entry RPC calls", () => {
  test.each([
    'import { rpcHandleCampaignQueueEntry } from "@/lib/db-rpc.server"; rpcHandleCampaignQueueEntry(db, body);',
    'import { rpcHandleCampaignQueueEntry as writeEntry } from "@/lib/db-rpc.server"; writeEntry(db, body);',
    'import * as rpc from "@/lib/db-rpc.server"; rpc.rpcHandleCampaignQueueEntry(db, body);',
    'import * as rpc from "@/lib/db-rpc.server"; rpc["rpcHandleCampaignQueueEntry"](db, body);',
    'import { rpcHandleCampaignQueueEntry } from "../../lib/db-rpc.server.ts"; const writeEntry = rpcHandleCampaignQueueEntry; writeEntry(db, body);',
    'import * as rpc from "@/lib/db-rpc.server"; const local = rpc; const writeEntry = local.rpcHandleCampaignQueueEntry; writeEntry(db, body);',
  ])("rejects direct low-level order writers: %s", (source) => {
    expect(check(source)).toMatchObject([{ kind: "direct-order-write" }]);
  });

  test.each([
    'function local(rpcHandleCampaignQueueEntry) { rpcHandleCampaignQueueEntry(db, body); }',
    'function local() { const rpcHandleCampaignQueueEntry = unrelated; rpcHandleCampaignQueueEntry(db, body); }',
    'const action = () => unrelated(body);',
  ])("permits shadowed helpers and unused imports: %s", (source) => {
    expect(check(`import { rpcHandleCampaignQueueEntry } from "@/lib/db-rpc.server"; ${source}`)).toEqual([]);
  });

  test("permits the range reservation RPC", () => {
    expect(check('import { rpcReserveCampaignQueueOrderRange } from "@/lib/db-rpc.server"; rpcReserveCampaignQueueOrderRange(db, { campaignId: 1, count: 2 });')).toEqual([]);
  });
});


describe("public SQL queue-entry RPC calls", () => {
  test.each([
    'sql`select handle_campaign_queue_entry(1, 2, ${body.startOrder}, false)`;',
    'sql.raw("select public.handle_campaign_queue_entry(1, 2, 9, false)");',
    'sql`select "public"."handle_campaign_queue_entry"(1, 2, 9, false)`;',
    'sql`SELECT HANDLE_CAMPAIGN_QUEUE_ENTRY (1, 2, 9, false)`;',
    'const raw = sql.raw; raw("select handle_campaign_queue_entry(1, 2, 9, false)");',
  ])("rejects SQL entry writers: %s", (source) => {
    expect(check(`${sqlImport} ${source}`)).toMatchObject([{ kind: "direct-order-write" }]);
  });

  test.each([
    "sql`select reserve_campaign_queue_order_range(1, 2)`;",
    "sql`select 'handle_campaign_queue_entry(1, 2, 9, false)'`;",
    "sql`select queue_order from campaign_queue /* handle_campaign_queue_entry(1, 2, 9, false) */`;",
  ])("permits reservation, reads, and quoted or commented names: %s", (source) => {
    expect(check(`${sqlImport} ${source}`)).toEqual([]);
  });
});
