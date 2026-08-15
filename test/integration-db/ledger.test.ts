import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { RpcExecutor } from "@/lib/db-rpc.server";
import type { insertTransactionHistoryIdempotent as InsertFn } from "@/lib/transaction-history.server";

/**
 * The only automated coverage of the real `apply_ledger_entry_and_sync_credits`
 * plpgsql function (ADR-0003 / ADR-0006): atomic idempotent ledger insert plus
 * `workspace.credits` sync.
 *
 * Every other ledger test mocks `@/server/db`. Two of them used to re-implement
 * the RPC in JS by picking parameters out of Drizzle's `queryChunks`, so the
 * argument ORDER of the SQL call was never checked and neither was the SQL
 * itself — reordering the arguments kept them green. Those re-implementations
 * were deleted in favour of this file.
 */

// Post-write event emission is an explicitly non-fatal side channel
// (transaction-history.server.ts swallows its failures) and is covered by
// test/transaction-history-emitter.test.ts. Stubbing it keeps this suite to one
// subject — the RPC — and keeps `@/server/db`'s module-level connection pools
// out of the process, so the suite owns every connection it opens.
vi.mock("@/lib/workspace-events.server", () => ({
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Written straight to stderr on purpose: vitest's console interceptor
  // swallows module-scope `console.warn`, and a skip nobody sees is how an
  // untested ledger gets mistaken for a tested one.
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! test/integration-db/ledger.test.ts is the ONLY test that exercises the",
      "!! real apply_ledger_entry_and_sync_credits plpgsql function. Skipping it",
      "!! means the ledger's idempotency and credits sync are UNVERIFIED in this",
      "!! run — every other ledger test mocks the database client.",
      "!!",
      "!! To run it:",
      "!!   docker compose -f docker-compose.dev.yml up -d postgres",
      "!!   export DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster",
      "!!   node scripts/e2e/bootstrap-compose-db.mjs",
      "!!   npm run test:integration-db",
      "!!",
      "!! CI runs it as part of `npm run test:e2e:compose`.",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const describeDb = DATABASE_URL ? describe : describe.skip;

const STARTING_CREDITS = 1_000;
const KEY_FIRST = "integration-db:ledger:first";
const KEY_SECOND = "integration-db:ledger:second";
const KEY_CONCURRENT = "integration-db:ledger:concurrent";

describeDb("apply_ledger_entry_and_sync_credits against real Postgres", () => {
  let client: postgres.Sql;
  let exec: RpcExecutor;
  let insertTransactionHistoryIdempotent: typeof InsertFn;
  let workspaceId: string;

  async function credits(): Promise<number> {
    const rows = await client<{ credits: number }[]>`
      select credits from public.workspace where id = ${workspaceId}::uuid
    `;
    return rows[0].credits;
  }

  async function ledgerRowsFor(idempotencyKey: string) {
    return client<
      {
        id: string;
        workspace: string;
        type: string;
        amount: number;
        note: string | null;
        idempotency_key: string | null;
        campaign_id: string | null;
        call_sid: string | null;
        message_sid: string | null;
      }[]
    >`
      select
        id::text,
        workspace::text as workspace,
        type::text as type,
        amount,
        note,
        idempotency_key,
        campaign_id::text as campaign_id,
        call_sid,
        message_sid
      from public.transaction_history
      where workspace = ${workspaceId}::uuid
        and idempotency_key = ${idempotencyKey}
      order by id
    `;
  }

  beforeAll(async () => {
    client = postgres(DATABASE_URL as string, {
      max: 10,
      prepare: false,
      connect_timeout: 10,
      onnotice: () => {},
    });
    const database = drizzle(client);
    exec = {
      execute: (query) => database.execute(query) as unknown as Promise<unknown[]>,
    };

    // Imported lazily so the skip path never loads app modules.
    ({ insertTransactionHistoryIdempotent } = await import(
      "@/lib/transaction-history.server"
    ));

    const rows = await client<{ id: string }[]>`
      insert into public.workspace (name, credits, twilio_data, feature_flags, disabled)
      values ('Integration DB Ledger Fixture', ${STARTING_CREDITS}, '{}'::jsonb, '{}'::jsonb, false)
      returning id::text as id
    `;
    workspaceId = rows[0].id;
  });

  afterAll(async () => {
    if (!client) return;
    // transaction_history.workspace is ON DELETE CASCADE, so this removes the
    // ledger rows too.
    if (workspaceId) {
      await client`delete from public.workspace where id = ${workspaceId}::uuid`;
    }
    await client.end({ timeout: 5 });
  });

  test("the fixture workspace starts at a known balance", async () => {
    expect(workspaceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(await credits()).toBe(STARTING_CREDITS);
  });

  test("a first call inserts the ledger row and moves credits by the amount", async () => {
    const before = await credits();

    const result = await insertTransactionHistoryIdempotent(exec, {
      workspaceId,
      type: "DEBIT",
      amount: -7,
      note: "integration-db first debit",
      idempotencyKey: KEY_FIRST,
      campaignId: 987_654,
      callSid: "CA_integration_db_first",
      messageSid: "SM_integration_db_first",
    });

    expect(result.inserted).toBe(true);
    expect(await credits()).toBe(before - 7);

    // Every argument is asserted in its own column: this is what a silent
    // reorder of the SQL call arguments breaks, and what the deleted JS
    // re-implementations could not see.
    const rows = await ledgerRowsFor(KEY_FIRST);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspace: workspaceId,
      type: "DEBIT",
      amount: -7,
      note: "integration-db first debit",
      idempotency_key: KEY_FIRST,
      campaign_id: "987654",
      call_sid: "CA_integration_db_first",
      message_sid: "SM_integration_db_first",
    });
    expect(String(rows[0].id)).toBe(String(result.existingId));
  });

  test("replaying the same idempotency key neither inserts nor moves credits", async () => {
    const before = await credits();

    const result = await insertTransactionHistoryIdempotent(exec, {
      workspaceId,
      type: "DEBIT",
      amount: -7,
      note: "integration-db first debit",
      idempotencyKey: KEY_FIRST,
      campaignId: 987_654,
      callSid: "CA_integration_db_first",
      messageSid: "SM_integration_db_first",
    });

    expect(result.inserted).toBe(false);
    expect(await credits()).toBe(before);
    expect(await ledgerRowsFor(KEY_FIRST)).toHaveLength(1);
  });

  test("a different idempotency key debits again", async () => {
    const before = await credits();

    const result = await insertTransactionHistoryIdempotent(exec, {
      workspaceId,
      type: "DEBIT",
      amount: -13,
      note: "integration-db second debit",
      idempotencyKey: KEY_SECOND,
    });

    expect(result.inserted).toBe(true);
    expect(await credits()).toBe(before - 13);
    expect(await ledgerRowsFor(KEY_SECOND)).toHaveLength(1);
  });

  test("concurrent duplicate calls insert exactly once and move credits once", async () => {
    const before = await credits();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        insertTransactionHistoryIdempotent(exec, {
          workspaceId,
          type: "DEBIT",
          amount: -3,
          note: "integration-db concurrent debit",
          idempotencyKey: KEY_CONCURRENT,
        }),
      ),
    );

    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(results.filter((r) => !r.inserted)).toHaveLength(4);

    // All five callers must be told about the same ledger row.
    const ids = new Set(results.map((r) => r.existingId));
    expect(ids.size).toBe(1);

    const rows = await ledgerRowsFor(KEY_CONCURRENT);
    expect(rows).toHaveLength(1);
    expect(await credits()).toBe(before - 3);
  });

  test("a blank idempotency key is rejected before anything is written", async () => {
    const before = await credits();

    await expect(
      insertTransactionHistoryIdempotent(exec, {
        workspaceId,
        type: "DEBIT",
        amount: -99,
        note: "integration-db blank key",
        idempotencyKey: "   ",
      }),
    ).rejects.toThrow("idempotencyKey is required");

    expect(await credits()).toBe(before);
  });

  test("the RPC itself rejects a blank key, not just the TypeScript wrapper", async () => {
    // The function is `security definer` and directly callable, so the guard
    // has to live in SQL as well: a blank key is not covered by the partial
    // unique index and would re-apply the delta on every call.
    const before = await credits();

    await expect(
      client`
        select * from public.apply_ledger_entry_and_sync_credits(
          ${workspaceId}::uuid, 'DEBIT', -99, '   ', 'blank', null, null, null
        )
      `,
    ).rejects.toThrow(/non-empty idempotency_key/);

    expect(await credits()).toBe(before);
  });
});
