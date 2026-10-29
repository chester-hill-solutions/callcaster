import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "../helpers/route-result";

type OfferState = "queued" | "offered" | "accepted";
type Operation = {
  name: "accept" | "release" | "complete" | "abandon";
  path: "agent-bridge" | "agent-status" | "complete";
  state: OfferState;
  result: string;
  agent: "busy" | "available" | "wrap_up";
};
const operations: Operation[] = [
  { name: "accept", path: "agent-bridge", state: "offered", result: "accepted", agent: "busy" },
  { name: "release", path: "agent-status", state: "offered", result: "timed_out", agent: "available" },
  { name: "complete", path: "complete", state: "accepted", result: "completed", agent: "wrap_up" },
  { name: "abandon", path: "complete", state: "queued", result: "abandoned", agent: "available" },
];
const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const baseUrl = "https://acd-offer.example";
let connection: postgres.Sql | undefined;
let app: typeof import("@/server/db") | undefined;
let rpcModule: typeof import("@/lib/db-rpc.server") | undefined;
let dataModule: typeof import("@/lib/merge-workspace-twilio-data.server") | undefined;

function store() {
  if (!connection || !app || !rpcModule || !dataModule) throw new Error("Integration database is required");
  return { sql: connection, app, rpc: rpcModule, data: dataModule };
}

function identity() {
  return {
    workspace: randomUUID(), user: randomUUID(),
    account: "AC" + randomUUID().replaceAll("-", ""),
    token: "owned-offer-" + randomUUID(),
    callSid: "CA" + randomUUID().replaceAll("-", ""),
  };
}
type Identity = ReturnType<typeof identity>;
type Actor = Identity & { queueId: number; entryId: number };

async function seed(actor: Identity, state: OfferState): Promise<Actor> {
  const { sql, data } = store();
  await sql`insert into public."user" (id, username, created_at)
    values (${actor.user}, ${actor.user + "@example.test"}, now())`;
  await sql`insert into public.workspace (id, name, twilio_data, disabled, feature_flags, credits)
    values (${actor.workspace}, 'Owned inbound offer', '{}'::jsonb, false, '{}'::jsonb, 1000)`;
  await data.persistWorkspaceTwilioData(actor.workspace, { sid: actor.account, authToken: actor.token });
  const [queue] = await sql`insert into public.inbound_queue (workspace_id, name)
    values (${actor.workspace}, 'Owned queue') returning id`;
  if (!queue) throw new Error("Expected an owned queue");
  const queueId = Number(queue.id);
  const offeredUser = state === "queued" ? null : actor.user;
  const [entry] = await sql`insert into public.inbound_queue_entry
    (workspace_id, queue_id, call_sid, caller_number, status, offered_to_user_id, offered_at, accepted_at)
    values (${actor.workspace}, ${queueId}, ${actor.callSid}, '+15550001111', ${state}::public.queue_entry_state,
      ${offeredUser}, now(), case when ${state} = 'accepted' then now() else null end) returning id`;
  if (!entry) throw new Error("Expected an owned offer");
  const entryId = Number(entry.id);
  expect(Number.isSafeInteger(entryId)).toBe(true);
  await sql`insert into public.agent_status
    (workspace_id, user_id, status, current_queue_entry_id, last_heartbeat_at)
    values (${actor.workspace}, ${actor.user}, ${state === "queued" ? "available" : "busy"}::public.agent_state,
      ${state === "queued" ? null : entryId}, now())`;
  return { ...actor, queueId, entryId };
}

async function withOffers(state: OfferState, run: (actors: { A: Actor; B: Actor }) => Promise<void>) {
  const A = identity(), B = identity();
  const { sql, data } = store();
  try {
    await run({ A: await seed(A, state), B: await seed(B, state) });
  } finally {
    data.invalidateWorkspaceTwilioData(A.workspace);
    data.invalidateWorkspaceTwilioData(B.workspace);
    await sql`delete from public.workspace where id in (${A.workspace}, ${B.workspace})`;
    await sql`delete from public."user" where id in (${A.user}, ${B.user})`;
  }
}

async function snapshot(actors: { A: Actor; B: Actor }) {
  const { sql } = store();
  const ids = [actors.A.workspace, actors.B.workspace];
  const entries = await sql`select to_jsonb(e) as row from public.inbound_queue_entry e
    where workspace_id in ${sql(ids)} order by workspace_id, id`;
  const agents = await sql`select to_jsonb(a) as row from public.agent_status a
    where workspace_id in ${sql(ids)} order by workspace_id, user_id`;
  const events = await sql`select to_jsonb(e) as row from public.agent_status_event e
    where workspace_id in ${sql(ids)} order by workspace_id, id`;
  return { entries: entries.map((r) => r.row), agents: agents.map((r) => r.row), events: events.map((r) => r.row) };
}

function signedRequest(op: Operation, signer: Actor, target: Actor, options: {
  token?: string; omitQueue?: boolean; authByQueueName?: boolean; fallback?: boolean; entryId?: number;
} = {}) {
  const url = new URL(`/api/acd-router/${op.path}`, baseUrl);
  if (!options.omitQueue && !options.authByQueueName) url.searchParams.set("queue_id", String(signer.queueId));
  if (options.fallback) url.searchParams.set("queue_name", `inbound_q_${target.queueId}`);
  else url.searchParams.set("entry_id", String(options.entryId ?? target.entryId));
  if (options.authByQueueName || (op.path === "agent-bridge" && !options.omitQueue)) url.searchParams.set("queue_name", `inbound_q_${signer.queueId}`);
  const fields = {
    CallSid: target.callSid, AccountSid: signer.account,
    ...(op.path === "agent-status" ? { CallStatus: "no-answer" } : {}),
    ...(op.path === "complete" ? { QueueResult: op.name === "abandon" ? "hangup" : "completed" } : {}),
  };
  return new Request(url, { method: "POST", body: new URLSearchParams(fields), headers: {
    "X-Twilio-Signature": getExpectedTwilioSignature(options.token ?? signer.token, url.href, fields),
  } });
}

async function action(path: Operation["path"], request: Request) {
  const args = { request, url: new URL(request.url), params: {}, context: new RouterContextProvider() };
  if (path === "agent-status") {
    const route = await import("../../app/routes/api+/acd-router/agent-status.action.server");
    return asRouteResponse(route.action(args));
  }
  if (path === "agent-bridge") {
    const route = await import("../../app/routes/api+/acd-router/agent-bridge.action.server");
    return asRouteResponse(route.action(args));
  }
  const route = await import("../../app/routes/api+/acd-router/complete.action.server");
  return asRouteResponse(route.action(args));
}

async function invokeRpc(op: Operation, target: Actor, workspace: string) {
  const { app, rpc } = store();
  if (op.name === "release") return rpc.rpcReleaseInboundOffer(app.db, { entryId: target.entryId, workspaceId: workspace, outcome: "timed_out" });
  if (op.name === "accept") return rpc.rpcAcceptInboundOffer(app.db, target.entryId, workspace);
  if (op.name === "complete") return rpc.rpcCompleteInboundQueueEntry(app.db, target.entryId, workspace);
  return rpc.rpcAbandonInboundQueueEntry(app.db, target.entryId, workspace);
}

async function invokeNullWorkspaceRpc(op: Operation, entryId: number) {
  const { sql } = store();
  if (op.name === "release") return sql`select public.release_inbound_offer(${entryId}, null::uuid, 'timed_out')`;
  if (op.name === "accept") return sql`select public.accept_inbound_offer(${entryId}, null::uuid)`;
  if (op.name === "complete") return sql`select public.complete_inbound_queue_entry(${entryId}, null::uuid)`;
  return sql`select public.abandon_inbound_queue_entry(${entryId}, null::uuid)`;
}

async function expectTransition(target: Actor, op: Operation) {
  const { sql } = store();
  const [entry] = await sql`select status from public.inbound_queue_entry where id = ${target.entryId}`;
  const [agent] = await sql`select status, current_queue_entry_id from public.agent_status
    where workspace_id = ${target.workspace} and user_id = ${target.user}`;
  expect(entry?.status).toBe(op.result);
  expect(agent?.status).toBe(op.agent);
  expect(agent?.current_queue_entry_id == null).toBe(op.agent !== "busy");
}

describe.skipIf(!databaseUrl)("Inbound offer workspace scope with real signed actions and Postgres (#2860)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Database required");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BASE_URL", baseUrl);
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "true");
    connection = postgres(databaseUrl, { max: 3 });
    app = await import("@/server/db");
    rpcModule = await import("@/lib/db-rpc.server");
    dataModule = await import("@/lib/merge-workspace-twilio-data.server");
  });
  afterAll(async () => {
    await Promise.all([connection?.end(), app?.pool.end(), app?.directPool.end()]);
    vi.unstubAllEnvs();
  });

  describe.each(operations)("$name", (op) => {
    test("a valid A signature cannot mutate B's offer, agent or audit events", async () => {
      await withOffers(op.state, async (actors) => {
        const before = await snapshot(actors);
        const request = signedRequest(op, actors.A, actors.B);
        const { requireTwilioSignature } = await import("@/lib/twilio-webhook.server");
        expect(await requireTwilioSignature(request.clone(), { callSid: actors.B.callSid })).toBeNull();
        const response = await action(op.path, request);
        expect({ status: response.status, state: await snapshot(actors) }).toEqual({ status: 403, state: before });
      });
    });
    test("A's queue-name credential cannot mutate B's entry", async () => {
      await withOffers(op.state, async (actors) => {
        const before = await snapshot(actors);
        const response = await action(op.path, signedRequest(op, actors.A, actors.B, { authByQueueName: true }));
        expect({ status: response.status, state: await snapshot(actors) }).toEqual({ status: 403, state: before });
      });
    });
    test("a valid A callback still updates A's offer and leaves B unchanged", async () => {
      await withOffers(op.state, async (actors) => {
        const before = await snapshot(actors);
        const response = await action(op.path, signedRequest(op, actors.A, actors.A));
        expect(response.status).toBe(200);
        await expectTransition(actors.A, op);
        const after = await snapshot(actors);
        expect(after.entries.filter((entry) => entry.workspace_id === actors.B.workspace)).toEqual(before.entries.filter((entry) => entry.workspace_id === actors.B.workspace));
        expect(after.agents.filter((agent) => agent.workspace_id === actors.B.workspace)).toEqual(before.agents.filter((agent) => agent.workspace_id === actors.B.workspace));
        expect(after.events.filter((event) => event.workspace_id === actors.B.workspace)).toEqual([]);
      });
    });
    test("the real RPC cannot mutate a B entry with A's workspace", async () => {
      await withOffers(op.state, async (actors) => {
        const before = await snapshot(actors);
        await invokeRpc(op, actors.B, actors.A.workspace);
        expect(await snapshot(actors)).toEqual(before);
      });
    });
    test("the real RPC still updates its own workspace entry", async () => {
      await withOffers(op.state, async (actors) => {
        await invokeRpc(op, actors.A, actors.A.workspace);
        await expectTransition(actors.A, op);
      });
    });
    test("a signature from the other account is refused", async () => {
      await withOffers(op.state, async (actors) => {
        const before = await snapshot(actors);
        const response = await action(op.path, signedRequest(op, actors.A, actors.A, { token: actors.B.token }));
        expect(response.status).toBe(403);
        expect(await snapshot(actors)).toEqual(before);
      });
    });
    test("entry fallback still refuses A's signature on B's entry", async () => {
      await withOffers(op.state, async (actors) => {
        const before = await snapshot(actors);
        const response = await action(op.path, signedRequest(op, actors.A, actors.B, { omitQueue: true }));
        expect(response.status).toBe(403);
        expect(await snapshot(actors)).toEqual(before);
      });
    });
    test("null workspace cannot bypass the scoped SQL contract", async () => {
      await withOffers(op.state, async (actors) => {
        const before = await snapshot(actors);
        await invokeNullWorkspaceRpc(op, actors.A.entryId);
        expect(await snapshot(actors)).toEqual(before);
      });
    });
  });

  test("the legacy unscoped overloads are absent", async () => {
    const { sql } = store();
    const rows = await sql`select to_regprocedure('public.accept_inbound_offer(bigint)') as accept,
      to_regprocedure('public.release_inbound_offer(bigint,text)') as release,
      to_regprocedure('public.complete_inbound_queue_entry(bigint)') as complete,
      to_regprocedure('public.abandon_inbound_queue_entry(bigint)') as abandon`;
    expect([...rows]).toEqual([{ accept: null, release: null, complete: null, abandon: null }]);
  });

  test.each(operations.filter((op) => op.path === "complete"))("$name rejects a foreign queue-name fallback", async (op) => {
    await withOffers(op.state, async (actors) => {
      const before = await snapshot(actors);
      const response = await action(op.path, signedRequest(op, actors.A, actors.B, { fallback: true }));
      expect({ status: response.status, state: await snapshot(actors) }).toEqual({ status: 403, state: before });
    });
  });
  test.each(operations.filter((op) => op.path === "complete"))("$name keeps its own queue-name fallback working", async (op) => {
    await withOffers(op.state, async (actors) => {
      const response = await action(op.path, signedRequest(op, actors.A, actors.A, { fallback: true }));
      expect(response.status).toBe(200);
      await expectTransition(actors.A, op);
    });
  });

  test("the global stale sweep carries each entry's workspace and preserves fresh offers", async () => {
    await withOffers("offered", async (actors) => {
      const { sql } = store();
      await sql`update public.inbound_queue_entry set offered_at = now() - interval '4 minutes' where id = ${actors.B.entryId}`;
      const [count] = await sql`select public.reset_stale_inbound_offers() as released`;
      expect(count?.released).toBe(1);
      const [fresh] = await sql`select status from public.inbound_queue_entry where id = ${actors.A.entryId}`;
      expect(fresh?.status).toBe("offered");
      const release = operations.find((op) => op.name === "release");
      if (!release) throw new Error("Release contract required");
      await expectTransition(actors.B, release);
    });
  });
  test("releasing an accepted entry keeps its agent busy", async () => {
    await withOffers("accepted", async (actors) => {
      const before = await snapshot(actors);
      const { app, rpc } = store();
      await rpc.rpcReleaseInboundOffer(app.db, { entryId: actors.A.entryId, workspaceId: actors.A.workspace });
      expect(await snapshot(actors)).toEqual(before);
    });
  });
  test("repeating an accepted bridge callback has no further side effects", async () => {
    const accept = operations.find((op) => op.name === "accept");
    if (!accept) throw new Error("Accept contract required");
    await withOffers("offered", async (actors) => {
      expect((await action(accept.path, signedRequest(accept, actors.A, actors.A))).status).toBe(200);
      const before = await snapshot(actors);
      expect((await action(accept.path, signedRequest(accept, actors.A, actors.A))).status).toBe(200);
      expect(await snapshot(actors)).toEqual(before);
    });
  });
});
