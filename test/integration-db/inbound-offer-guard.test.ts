import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const connection = databaseUrl ? postgres(databaseUrl, { max: 8 }) : undefined;

function database() {
  if (!connection) throw new Error("An integration database is required");
  return connection;
}

type QueueFixture = { workspace: string; agents: string[]; queues: number[] };

async function withQueue(run: (fixture: QueueFixture) => Promise<void>) {
  const sql = database();
  const workspace = randomUUID();
  const agents = [randomUUID(), randomUUID()];
  const queues: number[] = [];
  await sql.begin(async (tx) => {
    await tx`insert into public.workspace (id, name, twilio_data, disabled, feature_flags, credits)
      values (${workspace}, 'Offer guard', '{}'::jsonb, false, '{}'::jsonb, 1000)`;
    for (const agent of agents) {
      await tx`insert into public."user" (id, username, created_at)
        values (${agent}, ${agent + "@example.test"}, now())`;
      await tx`insert into public.agent_status (workspace_id, user_id, status, last_heartbeat_at)
        values (${workspace}, ${agent}, 'available', now())`;
    }
    for (const name of ["First", "Second"]) {
      const [queue] =
        await tx`insert into public.inbound_queue (workspace_id, name)
        values (${workspace}, ${name}) returning id`;
      queues.push(Number(queue?.id));
      for (const agent of agents) {
        await tx`insert into public.inbound_queue_member (workspace_id, queue_id, user_id)
          values (${workspace}, ${Number(queue?.id)}, ${agent})`;
      }
    }
  });
  try {
    await run({ workspace, agents, queues });
  } finally {
    await sql`delete from public.workspace where id = ${workspace}`;
    await sql`delete from public."user" where id in ${sql(agents)}`;
  }
}

async function claim(
  fixture: QueueFixture,
  callSid = "CA-offer",
  queue = fixture.queues[0],
) {
  return database()`select * from public.claim_inbound_queue_entry(
    ${queue}, ${fixture.workspace}::uuid, ${callSid}, '+15550001111')`;
}

suite("Inbound active-offer guard against Postgres (#2129)", () => {
  afterAll(async () => {
    await connection?.end({ timeout: 5 });
  });

  test("a repeated claim produces no new offer and changes one agent once", async () => {
    await withQueue(async (fixture) => {
      const first = await claim(fixture);
      const repeated = await claim(fixture);
      expect(first).toHaveLength(1);
      expect(repeated).toHaveLength(0);
      const sql = database();
      const entries =
        await sql`select id, status from public.inbound_queue_entry where workspace_id = ${fixture.workspace}`;
      expect(entries).toHaveLength(1);
      expect(entries[0]?.status).toBe("offered");
      const states =
        await sql`select status from public.agent_status where workspace_id = ${fixture.workspace}`;
      expect(states.filter((row) => row.status === "busy")).toHaveLength(1);
      expect(states.filter((row) => row.status === "available")).toHaveLength(
        1,
      );
      const events =
        await sql`select reason from public.agent_status_event where workspace_id = ${fixture.workspace}`;
      expect(events).toEqual([
        expect.objectContaining({ reason: "inbound_offer" }),
      ]);
    });
  });

  test("concurrent claims return exactly one new offer without a uniqueness error", async () => {
    await withQueue(async (fixture) => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => claim(fixture)),
      );
      expect(results.flat()).toHaveLength(1);
      const rows = await database()`select id from public.inbound_queue_entry
        where workspace_id = ${fixture.workspace} and call_sid = 'CA-offer'
        and status in ('queued', 'offered', 'accepted')`;
      expect(rows).toHaveLength(1);
      const events =
        await database()`select id from public.agent_status_event where workspace_id = ${fixture.workspace}`;
      expect(events).toHaveLength(1);
    });
  });

  test("a waiting duplicate does not take the agent needed by a different call", async () => {
    if (!databaseUrl) throw new Error("An integration database is required");
    const name = "offer-contender-" + randomUUID();
    const contender = postgres(databaseUrl, {
      max: 1,
      connection: { application_name: name },
    });
    try {
      await withQueue(async (fixture) => {
        let pending: Promise<postgres.RowList<postgres.Row[]>> | undefined;
        await database().begin(async (tx) => {
          expect(
            await tx`select * from public.claim_inbound_queue_entry(
            ${fixture.queues[0]}, ${fixture.workspace}::uuid, 'CA-held', '+15550001111')`,
          ).toHaveLength(1);
          pending = contender`select * from public.claim_inbound_queue_entry(
            ${fixture.queues[0]}, ${fixture.workspace}::uuid, 'CA-held', '+15550001111')`.then(
            (rows) => rows,
          );
          let blocked = false;
          for (let attempt = 0; attempt < 100; attempt += 1) {
            const [state] = await database()`select exists (
              select 1 from pg_stat_activity where application_name = ${name}
                and cardinality(pg_blocking_pids(pid)) > 0
            ) as blocked`;
            if (state?.blocked) {
              blocked = true;
              break;
            }
            await delay(20);
          }
          expect(blocked).toBe(true);
          expect(await claim(fixture, "CA-independent")).toHaveLength(1);
        });
        expect(await pending).toHaveLength(0);
      });
    } finally {
      await contender.end({ timeout: 5 });
    }
  });

  test.each(["queued", "offered", "accepted"])(
    "an existing %s entry cannot be offered again",
    async (state) => {
      await withQueue(async (fixture) => {
        const sql = database();
        await sql`insert into public.inbound_queue_entry (workspace_id, queue_id, call_sid, status)
        values (${fixture.workspace}, ${fixture.queues[0]}, 'CA-offer', ${state}::public.queue_entry_state)`;
        expect(await claim(fixture)).toHaveLength(0);
        const states =
          await sql`select status from public.agent_status where workspace_id = ${fixture.workspace}`;
        expect(states.every((row) => row.status === "available")).toBe(true);
      });
    },
  );

  test.each(["timed_out", "declined"])(
    "release to %s permits a new offer",
    async (outcome) => {
      await withQueue(async (fixture) => {
        const first = await claim(fixture);
        expect(first).toHaveLength(1);
        await database()`select public.release_inbound_offer(${first[0]?.entry_id}, ${outcome})`;
        const next = await claim(fixture);
        expect(next).toHaveLength(1);
        expect(String(next[0]?.entry_id)).not.toBe(String(first[0]?.entry_id));
        const rows =
          await database()`select status from public.inbound_queue_entry where workspace_id = ${fixture.workspace}`;
        expect(rows.filter((row) => row.status === "offered")).toHaveLength(1);
        expect(rows.filter((row) => row.status === outcome)).toHaveLength(1);
      });
    },
  );

  test("the database rejects a duplicate direct insert but permits a terminal history row", async () => {
    await withQueue(async (fixture) => {
      const [first] = await claim(fixture);
      const sql = database();
      await expect(sql`insert into public.inbound_queue_entry (workspace_id, queue_id, call_sid, status)
        values (${fixture.workspace}, ${fixture.queues[0]}, 'CA-offer', 'offered')`).rejects.toMatchObject(
        { code: "23505" },
      );
      await sql`update public.inbound_queue_entry set status = 'timed_out' where id = ${first?.entry_id}`;
      await expect(sql`insert into public.inbound_queue_entry (workspace_id, queue_id, call_sid, status)
        values (${fixture.workspace}, ${fixture.queues[0]}, 'CA-offer', 'offered') returning id`).resolves.toHaveLength(
        1,
      );
    });
  });

  test("a user available in another workspace cannot claim this workspace's queue", async () => {
    await withQueue(async (owner) => {
      await withQueue(async (foreign) => {
        const sql = database();
        await sql`insert into public.agent_status (workspace_id, user_id, status, last_heartbeat_at)
          values (${foreign.workspace}, ${owner.agents[0]}, 'available', now())`;
        expect(
          await sql`select * from public.claim_inbound_queue_entry(
          ${owner.queues[0]}, ${foreign.workspace}::uuid, 'CA-foreign', '+15550001111')`,
        ).toHaveLength(0);
        expect(
          await sql`select id from public.inbound_queue_entry where workspace_id = ${foreign.workspace}`,
        ).toHaveLength(0);
        expect(
          await sql`select status, current_queue_entry_id from public.agent_status
            where workspace_id = ${foreign.workspace} and user_id = ${owner.agents[0]}`,
        ).toEqual([
          expect.objectContaining({
            status: "available",
            current_queue_entry_id: null,
          }),
        ]);
        expect(
          await sql`select id from public.agent_status_event where workspace_id = ${foreign.workspace}`,
        ).toHaveLength(0);
        expect(await claim(owner)).toHaveLength(1);
        expect(await claim(foreign)).toHaveLength(1);
      });
    });
  });

  test.each(["missing queue", "empty CallSid"])(
    "%s cannot consume an agent",
    async (reason) => {
      await withQueue(async (fixture) => {
        const queue = reason === "missing queue" ? -1 : fixture.queues[0];
        const sid = reason === "empty CallSid" ? "" : "CA-offer";
        expect(
          await database()`select * from public.claim_inbound_queue_entry(
        ${queue}, ${fixture.workspace}::uuid, ${sid}, '+15550001111')`,
        ).toHaveLength(0);
        expect(await claim(fixture)).toHaveLength(1);
      });
    },
  );

  test("the same CallSid may have an independent offer in another queue", async () => {
    await withQueue(async (fixture) => {
      expect(await claim(fixture)).toHaveLength(1);
      expect(await claim(fixture, "CA-offer", fixture.queues[1])).toHaveLength(
        1,
      );
      const rows =
        await database()`select queue_id from public.inbound_queue_entry where workspace_id = ${fixture.workspace}`;
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => String(row.queue_id))).size).toBe(2);
    });
  });
});
