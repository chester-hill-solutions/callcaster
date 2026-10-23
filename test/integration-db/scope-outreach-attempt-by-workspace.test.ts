import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { RpcExecutor } from "@/lib/db-rpc.server";

/**
 * The real `create_outreach_attempt` and `get_campaign_attempts` plpgsql
 * functions, against a real Postgres. Issue #2885.
 *
 * Before
 * `client/migrations/20261020000000_scope_outreach_attempt_contact_and_campaign_by_workspace.sql`
 * the two halves formed a cross-tenant read:
 *
 *   - `create_outreach_attempt` stamped an `outreach_attempt` row with the
 *     caller's own `wks_id` but never checked that the client-supplied contact
 *     id or campaign id belonged to that workspace.
 *   - `get_campaign_attempts` read those rows back filtered only on
 *     `oa.campaign_id`, joining `contact` and `campaign` with no workspace
 *     predicate, and returned the contact's name, phone, email, address and
 *     opt-out flag.
 *
 * So a member of workspace A could post an arbitrary `contact_id` under A's own
 * id and then read workspace B's contact record out of A's own campaign export.
 *
 * This suite is the only place either function runs for real. The unit tier
 * mocks the driver, and
 * `test/scope-dequeue-and-outreach-attempt.integration.test.ts` asserts on the
 * migration's SQL *text*, which a predicate bug of exactly this shape (a
 * missing WHERE term, not a missing clause) passes happily — see #1260 for the
 * same lesson learned on `dequeue_contact`.
 */

vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
}));

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! test/integration-db/scope-outreach-attempt-by-workspace.test.ts runs the",
      "!! real create_outreach_attempt / get_campaign_attempts. Skipping it leaves",
      "!! the cross-tenant contact read of #2885 UNGUARDED in this run.",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const describeDb = DATABASE_URL ? describe : describe.skip;

const AGENT = "1d1e0000-0000-4000-8000-0000000000c5";

/** Fixture lookups must fail loudly rather than yield `undefined` under a cast. */
function pick<T>(rows: T[], match: (row: T) => boolean, what: string): T {
  const found = rows.find(match);
  if (!found) throw new Error(`fixture row not returned: ${what}`);
  return found;
}

/**
 * The message of an error and its cause chain. Drizzle wraps a driver failure
 * as `Failed query: <sql>`, so the plpgsql RAISE text only appears on the
 * cause — matching the top-level message alone would pass on any failure.
 */
function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}

/** Runs a call expected to be refused, and returns why it failed. */
async function refusalFrom(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return errorText(error);
  }
  throw new Error("expected the call to be refused, but it resolved");
}

describeDb("create_outreach_attempt / get_campaign_attempts against real Postgres", () => {
  let client: postgres.Sql;
  let exec: RpcExecutor;
  let rpcCreateOutreachAttempt: typeof import("@/lib/db-rpc.server").rpcCreateOutreachAttempt;
  let rpcGetCampaignAttemptsCsv: typeof import("@/lib/db-rpc.server").rpcGetCampaignAttemptsCsv;

  let workspaceA: string;
  let workspaceB: string;
  let campaignA: string;
  let campaignB: string;
  let contactA: string;
  let contactB: string;
  let queueA: string;

  beforeAll(async () => {
    if (!DATABASE_URL) return;
    client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

    const database = drizzle(client);
    exec = {
      execute: (query) => database.execute(query) as unknown as Promise<unknown[]>,
    };

    ({ rpcCreateOutreachAttempt, rpcGetCampaignAttemptsCsv } = await import(
      "@/lib/db-rpc.server"
    ));

    await client`
      insert into public."user" (id, username, first_name, last_name)
      values (${AGENT}::uuid, 'integration-db-2885@example.test', 'Probe', 'User')
      on conflict (id) do nothing
    `;

    const workspaces = await client<{ id: string; name: string }[]>`
      insert into public.workspace (name, credits, twilio_data, feature_flags, disabled)
      values
        ('Integration DB 2885 A', 0, '{}'::jsonb, '{}'::jsonb, false),
        ('Integration DB 2885 B', 0, '{}'::jsonb, '{}'::jsonb, false)
      returning id::text as id, name
    `;
    workspaceA = pick(workspaces, (w) => w.name.endsWith(" A"), "workspace A").id;
    workspaceB = pick(workspaces, (w) => w.name.endsWith(" B"), "workspace B").id;

    const campaigns = await client<{ id: string; title: string }[]>`
      insert into public.campaign (title, workspace, group_household_queue, dial_type, type)
      values
        ('Integration DB 2885 A campaign', ${workspaceA}::uuid, true, 'call', 'robocall'),
        ('Integration DB 2885 B campaign', ${workspaceB}::uuid, true, 'call', 'robocall')
      returning id::text as id, title
    `;
    campaignA = pick(campaigns, (c) => c.title.endsWith("A campaign"), "campaign A").id;
    campaignB = pick(campaigns, (c) => c.title.endsWith("B campaign"), "campaign B").id;

    const contacts = await client<{ id: string; firstname: string }[]>`
      insert into public.contact (firstname, surname, phone, email, workspace)
      values
        ('AliceA', 'Shared', '+15550192001', 'alice@workspace-a.test', ${workspaceA}::uuid),
        ('BobB', 'Shared', '+15550192002', 'bob@workspace-b.test', ${workspaceB}::uuid)
      returning id::text as id, firstname
    `;
    contactA = pick(contacts, (c) => c.firstname === "AliceA", "contact A").id;
    contactB = pick(contacts, (c) => c.firstname === "BobB", "contact B").id;

    const queues = await client<{ id: string }[]>`
      insert into public.campaign_queue (contact_id, campaign_id, workspace, queue_state, queue_order)
      values (${contactA}::bigint, ${campaignA}::bigint, ${workspaceA}::uuid, 'queued', 1)
      returning id::text as id
    `;
    queueA = queues[0].id;
  });

  afterAll(async () => {
    if (!client) return;
    if (workspaceA) {
      // outreach_attempt / campaign_queue / contact / campaign all cascade from workspace.
      await client`delete from public.workspace where id in (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    }
    await client`delete from public."user" where id = ${AGENT}::uuid`;
    await client.end({ timeout: 5 });
    const { pool, directPool } = await import("@/server/db");
    await Promise.all([pool.end(), directPool.end()]);
  });

  test("refuses a contact belonging to another workspace", async () => {
    const reason = await refusalFrom(() =>
      rpcCreateOutreachAttempt(exec, {
        contactId: Number(contactB),
        campaignId: Number(campaignA),
        userId: AGENT,
        workspaceId: workspaceA,
        queueId: Number(queueA),
      }),
    );
    expect(reason).toMatch(/is not in workspace/);

    // The refusal must leave no row behind.
    const [counted] = await client<{ n: string }[]>`
      select count(*)::text as n from public.outreach_attempt
      where contact_id = ${contactB}::bigint and campaign_id = ${campaignA}::bigint
    `;
    expect(counted.n).toBe("0");
  });

  test("refuses a campaign belonging to another workspace", async () => {
    const reason = await refusalFrom(() =>
      rpcCreateOutreachAttempt(exec, {
        contactId: Number(contactA),
        campaignId: Number(campaignB),
        userId: AGENT,
        workspaceId: workspaceA,
        queueId: Number(queueA),
      }),
    );
    expect(reason).toMatch(/is not in workspace/);
  });

  test("refused inserts leave the queue row's attempt counter alone", async () => {
    const [row] = await client<{ attempts: number | null }[]>`
      select attempts from public.campaign_queue where id = ${queueA}::bigint
    `;
    expect(Number(row.attempts ?? 0)).toBe(0);
  });

  test("a contact and campaign of the caller's own workspace are recorded", async () => {
    const attemptId = await rpcCreateOutreachAttempt(exec, {
      contactId: Number(contactA),
      campaignId: Number(campaignA),
      userId: AGENT,
      workspaceId: workspaceA,
      queueId: Number(queueA),
    });
    expect(Number(attemptId)).toBeGreaterThan(0);

    const [row] = await client<{ attempts: number | null }[]>`
      select attempts from public.campaign_queue where id = ${queueA}::bigint
    `;
    expect(Number(row.attempts ?? 0)).toBe(1);
  });

  test("the export hides a pre-existing row that carries a foreign contact", async () => {
    // Simulates a row written BEFORE the fix, when the unchecked contact id was
    // accepted. The old export rendered it; the new one must not.
    await client`
      insert into public.outreach_attempt (contact_id, campaign_id, user_id, workspace)
      values (${contactB}::bigint, ${campaignA}::bigint, ${AGENT}::uuid, ${workspaceA}::uuid)
    `;

    const csv = await rpcGetCampaignAttemptsCsv(workspaceA, Number(campaignA));

    expect(csv).toContain("AliceA");
    // The whole point: workspace B's contact record must not be reachable
    // through workspace A's own campaign export.
    expect(csv).not.toContain("BobB");
    expect(csv).not.toContain("bob@workspace-b.test");
    expect(csv).not.toContain("+15550192002");
  });

  test("another workspace cannot read the campaign at all", async () => {
    const csv = await rpcGetCampaignAttemptsCsv(workspaceB, Number(campaignA));
    expect(csv).not.toContain("AliceA");
    expect(csv).not.toContain("BobB");
  });
});
