import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * fetchConversationSummary (app/lib/database/workspace-conversations.server.ts)
 * used to group raw messages in JS; it now delegates the grouping to a single
 * SQL aggregation (buildConversationSummaryQuery) so conversation lists don't
 * require paging tens of thousands of message rows into the app on every
 * chats-page load.
 *
 * The rest of the suite (test/db-workspace.server.test.ts) mocks tdb.execute
 * and can only characterize fetchConversationSummary's I/O contract around
 * that call — it can't verify the SQL text itself actually reproduces the old
 * JS grouping semantics (conversation identity via workspace-number
 * membership, unread/has_replied predicates, "most recent non-null value
 * wins" for contact_phone/user_phone/last_inbound_body).
 *
 * This test runs the real query against a real Postgres (the same
 * docker-compose stack used by `npm run test:e2e:compose`) and compares it
 * against a hand-rolled JS reference that mirrors the removed in-memory
 * grouping loop. It self-skips (via `ctx.skip()`) when no reachable Postgres
 * is configured, so `npm run test:node` stays green without Docker — run
 * `docker compose -f docker-compose.dev.yml up -d postgres` and set
 * PARITY_DATABASE_URL (or DATABASE_URL) to a real connection string to
 * exercise it locally.
 */

const CANDIDATE_URL =
  process.env.PARITY_DATABASE_URL ??
  (process.env.DATABASE_URL?.includes("localhost:5432/test")
    ? undefined
    : process.env.DATABASE_URL) ??
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

type RawMessageFixture = {
  sid: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  date_created: string;
  body: string | null;
  campaign_id: number | null;
};

function normalizeConversationPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}
function getConversationPhoneKey(phone: string | null): string | null {
  const normalized = normalizeConversationPhone(phone);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
}
function isInbound(direction: string | null): boolean {
  return direction === "inbound";
}
function participantPhones(
  message: { from: string; to: string; direction: string },
  workspacePhoneKeys: Set<string>,
) {
  const fromKey = getConversationPhoneKey(message.from);
  const toKey = getConversationPhoneKey(message.to);
  if (fromKey && workspacePhoneKeys.has(fromKey)) {
    return {
      contactPhone: normalizeConversationPhone(message.to),
      userPhone: normalizeConversationPhone(message.from),
    };
  }
  if (toKey && workspacePhoneKeys.has(toKey)) {
    return {
      contactPhone: normalizeConversationPhone(message.from),
      userPhone: normalizeConversationPhone(message.to),
    };
  }
  if (isInbound(message.direction)) {
    return {
      contactPhone: normalizeConversationPhone(message.from),
      userPhone: normalizeConversationPhone(message.to),
    };
  }
  return {
    contactPhone: normalizeConversationPhone(message.to),
    userPhone: normalizeConversationPhone(message.from),
  };
}

/** Reference implementation mirroring the removed in-memory grouping loop. */
function jsReferenceAggregate(
  messages: RawMessageFixture[],
  workspacePhoneKeys: Set<string>,
  campaignId: number | null,
) {
  const map = new Map<
    string,
    {
      contact_phone: string;
      user_phone: string;
      message_count: number;
      unread_count: number;
      has_replied: boolean;
      last_inbound_body: string | null;
      conversation_last_update: string;
    }
  >();

  const scanOrder = [...messages]
    .filter((m) => m.status !== "failed")
    .filter((m) => (campaignId != null ? m.campaign_id === campaignId : true))
    .sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime());

  for (const message of scanOrder) {
    const { contactPhone, userPhone } = participantPhones(message, workspacePhoneKeys);
    const key = getConversationPhoneKey(contactPhone);
    if (!contactPhone || !key) continue;

    const hasReplied = isInbound(message.direction);
    const unreadIncrement = isInbound(message.direction) && message.status === "received" ? 1 : 0;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        contact_phone: contactPhone,
        user_phone: userPhone ?? "",
        message_count: 1,
        unread_count: unreadIncrement,
        has_replied: hasReplied,
        last_inbound_body: hasReplied && message.body != null ? message.body : null,
        conversation_last_update: message.date_created,
      });
      continue;
    }
    existing.message_count += 1;
    existing.unread_count += unreadIncrement;
    existing.has_replied = existing.has_replied || hasReplied;
    if (existing.last_inbound_body == null && hasReplied && message.body != null) {
      existing.last_inbound_body = message.body;
    }
  }

  return Array.from(map.values());
}

describe("workspace-conversations SQL/JS parity (real Postgres)", () => {
  let reachable = false;
  let sqlClient: import("postgres").Sql | undefined;
  let buildConversationSummaryQuery: typeof import("../app/lib/database/workspace-conversations.server").__internal.buildConversationSummaryQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbExecute: (query: any) => Promise<Record<string, unknown>[]>;
  let workspaceId: string;
  let campaignIdOne: number;
  let campaignIdTwo: number;

  const wsNumber = "+15551111111";
  const workspacePhoneKeys = new Set([getConversationPhoneKey(wsNumber) as string]);
  const contactA = "+15550000001";
  const contactB = "+15550000002";
  const contactC = "+15550000003";
  const contactD = "+15550000004";

  const now = Date.now();
  const iso = (offsetMinutes: number) => new Date(now - offsetMinutes * 60_000).toISOString();

  const rows: RawMessageFixture[] = [
    { sid: randomUUID(), from: wsNumber, to: contactA, direction: "outbound-api", status: "delivered", date_created: iso(50), body: "hi", campaign_id: null },
    { sid: randomUUID(), from: contactA, to: wsNumber, direction: "inbound", status: "received", date_created: iso(40), body: "yo", campaign_id: null },
    { sid: randomUUID(), from: contactA, to: wsNumber, direction: "inbound", status: "read", date_created: iso(30), body: "older reply", campaign_id: null },
    { sid: randomUUID(), from: wsNumber, to: contactB, direction: "outbound-api", status: "delivered", date_created: iso(45), body: "solo", campaign_id: null },
    { sid: randomUUID(), from: contactC, to: wsNumber, direction: "inbound", status: "received", date_created: iso(20), body: "STOP", campaign_id: null },
    { sid: randomUUID(), from: wsNumber, to: contactD, direction: "outbound-api", status: "delivered", date_created: iso(10), body: "campaign msg", campaign_id: null },
    { sid: randomUUID(), from: wsNumber, to: contactA, direction: "outbound-api", status: "failed", date_created: iso(5), body: "should be excluded", campaign_id: null },
  ];

  beforeAll(async () => {
    let postgres: typeof import("postgres");
    let drizzleModule: typeof import("drizzle-orm/postgres-js");
    try {
      postgres = (await import("postgres")).default;
      drizzleModule = await import("drizzle-orm/postgres-js");
    } catch {
      return;
    }

    const client = postgres(CANDIDATE_URL, { prepare: false, max: 2, connect_timeout: 2 });
    try {
      await client`select 1`;
    } catch {
      await client.end({ timeout: 1 }).catch(() => {});
      return;
    }

    sqlClient = client;
    reachable = true;

    const mod = await import("../app/lib/database/workspace-conversations.server");
    buildConversationSummaryQuery = mod.__internal.buildConversationSummaryQuery;
    const db = drizzleModule.drizzle(client);
    dbExecute = (query) =>
      db.execute(query) as unknown as Promise<Record<string, unknown>[]>;

    workspaceId = randomUUID();
    await client`insert into public.workspace (id, name) values (${workspaceId}::uuid, 'sql-parity-test')`;
    const [c1] = await client`insert into public.campaign (title, workspace) values ('parity-c1', ${workspaceId}::uuid) returning id`;
    const [c2] = await client`insert into public.campaign (title, workspace) values ('parity-c2', ${workspaceId}::uuid) returning id`;
    campaignIdOne = Number((c1 as { id: string | number }).id);
    campaignIdTwo = Number((c2 as { id: string | number }).id);

    const campaignByIndex = [campaignIdOne, campaignIdOne, campaignIdOne, null, null, campaignIdTwo, campaignIdOne];
    rows.forEach((row, i) => {
      row.campaign_id = campaignByIndex[i];
    });

    await client`
      insert into public.contact (firstname, surname, phone, workspace)
      values ('Taylor', 'Testperson', ${contactA}, ${workspaceId}::uuid)
    `;

    for (const row of rows) {
      await client`
        insert into public.message (sid, workspace, "from", "to", direction, status, date_created, body, campaign_id, contact_id)
        values (${row.sid}, ${workspaceId}::uuid, ${row.from}, ${row.to}, ${row.direction}::message_direction, ${row.status}::message_status, ${row.date_created}::timestamptz, ${row.body}, ${row.campaign_id}, null)
      `;
    }
  }, 15_000);

  afterAll(async () => {
    if (!sqlClient) return;
    await sqlClient`delete from public.contact where workspace = ${workspaceId}::uuid`;
    await sqlClient`delete from public.message where workspace = ${workspaceId}::uuid`;
    await sqlClient`delete from public.campaign where workspace = ${workspaceId}::uuid`;
    await sqlClient`delete from public.workspace where id = ${workspaceId}::uuid`;
    await sqlClient.end({ timeout: 2 });
  });

  function assertSkippedWithoutDb(ctx: { skip: () => void }) {
    if (!reachable) {
      ctx.skip();
    }
  }

  test("multiple conversations, unread counts, and STOP-only body all match the JS reference", async (ctx) => {
    assertSkippedWithoutDb(ctx);

    const query = buildConversationSummaryQuery({
      workspaceId,
      workspacePhoneKeys,
      campaignId: null,
      sort: "recent",
      search: undefined,
      limit: 100,
      offset: 0,
    });
    const got = await dbExecute(query);
    const want = jsReferenceAggregate(rows, workspacePhoneKeys, null);

    const normalize = (list: Array<Record<string, unknown>>) =>
      list
        .map((r) => ({
          contact_phone: r.contact_phone,
          message_count: Number(r.message_count),
          unread_count: Number(r.unread_count),
          has_replied: Boolean(r.has_replied),
          last_inbound_body: r.last_inbound_body ?? null,
        }))
        .sort((a, b) => String(a.contact_phone).localeCompare(String(b.contact_phone)));

    expect(normalize(got)).toEqual(normalize(want));
  });

  test("campaign_id filter matches the JS reference", async (ctx) => {
    assertSkippedWithoutDb(ctx);

    const query = buildConversationSummaryQuery({
      workspaceId,
      workspacePhoneKeys,
      campaignId: campaignIdOne,
      sort: "recent",
      search: undefined,
      limit: 100,
      offset: 0,
    });
    const got = await dbExecute(query);
    const want = jsReferenceAggregate(rows, workspacePhoneKeys, campaignIdOne);

    expect(got.map((r) => r.contact_phone).sort()).toEqual(
      want.map((r) => r.contact_phone).sort(),
    );
  });

  for (const sortMode of ["hasReplied", "hasUnreadReply"] as const) {
    // Not test.each: its callback doesn't receive the vitest context needed
    // for the no-database skip.
    test(`${sortMode} sort mode filters like the JS reference`, async (ctx) => {
      assertSkippedWithoutDb(ctx);

      const query = buildConversationSummaryQuery({
        workspaceId,
        workspacePhoneKeys,
        campaignId: null,
        sort: sortMode,
        search: undefined,
        limit: 100,
        offset: 0,
      });
      const got = await dbExecute(query);
      const want = jsReferenceAggregate(rows, workspacePhoneKeys, null).filter((c) =>
        sortMode === "hasReplied" ? c.has_replied : c.unread_count > 0,
      );

      expect(got.map((r) => r.contact_phone).sort()).toEqual(
        want.map((r) => r.contact_phone).sort(),
      );
    });
  }

  test("search matches phone digits, message body, and contact name", async (ctx) => {
    assertSkippedWithoutDb(ctx);

    const byDigits = await dbExecute(
      buildConversationSummaryQuery({
        workspaceId, workspacePhoneKeys, campaignId: null, sort: "recent",
        search: "5550000001", limit: 100, offset: 0,
      }),
    );
    expect(byDigits.map((r) => r.contact_phone)).toEqual([contactA]);

    const byBody = await dbExecute(
      buildConversationSummaryQuery({
        workspaceId, workspacePhoneKeys, campaignId: null, sort: "recent",
        search: "STOP", limit: 100, offset: 0,
      }),
    );
    expect(byBody.map((r) => r.contact_phone)).toEqual([contactC]);

    const byName = await dbExecute(
      buildConversationSummaryQuery({
        workspaceId, workspacePhoneKeys, campaignId: null, sort: "recent",
        search: "Taylor", limit: 100, offset: 0,
      }),
    );
    expect(byName.map((r) => r.contact_phone)).toEqual([contactA]);
  });

  test("pagination boundaries: concatenated pages equal the full ordered set, hasMore flips correctly", async (ctx) => {
    assertSkippedWithoutDb(ctx);

    const fullOrder = jsReferenceAggregate(rows, workspacePhoneKeys, null).sort(
      (a, b) => new Date(b.conversation_last_update).getTime() - new Date(a.conversation_last_update).getTime(),
    );

    const page1 = await dbExecute(
      buildConversationSummaryQuery({
        workspaceId, workspacePhoneKeys, campaignId: null, sort: "recent",
        search: undefined, limit: 2, offset: 0,
      }),
    );
    const page2 = await dbExecute(
      buildConversationSummaryQuery({
        workspaceId, workspacePhoneKeys, campaignId: null, sort: "recent",
        search: undefined, limit: 2, offset: 2,
      }),
    );

    expect(page1.length).toBe(3); // limit + 1 lookahead row
    const combined = [...page1.slice(0, 2), ...page2.slice(0, 2)].map((r) => r.contact_phone);
    expect(combined).toEqual(fullOrder.map((c) => c.contact_phone));
  });
});
