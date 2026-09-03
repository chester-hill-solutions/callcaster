import { sql } from "drizzle-orm";
import { db, directPool } from "./db";

const REQUIRED_FUNCTION = "apply_ledger_entry_and_sync_credits";
const LISTEN_PROBE_CHANNEL = "callcaster_readiness_probe";
const LISTEN_PROBE_TIMEOUT_MS = 2_000;

const BANNED_TRIGGERS = [
  "add_contact_to_queues_trigger",
  "campaign_is_active_change_trigger",
  "campaign_schedule_change_trigger",
  "outreach_trigger",
  "transaction_history_update_credits",
  "trigger_inherit_parent_call_data",
];

const BANNED_FUNCTIONS = [
  "call_edge_function",
  "call_outreach_webhook",
  "campaign_is_active_change",
  "inherit_parent_call_data",
  "notify_schedule_change",
  "transaction_history_update_credits",
  "trigger_add_contact_to_queues",
];

/**
 * Cheap connectivity probe for readiness checks. Returns false instead of
 * throwing so callers can report 503 without crashing the probe path.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export type DatabaseReadiness = {
  queryReady: boolean;
  listenReady: boolean;
};

async function probeListenConnection(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // Hold the listen() promise so a late resolution can still be unsubscribed.
  // If the timeout wins the race, the registration would otherwise leak for the
  // process lifetime every time the probe times out (e.g. under DB latency).
  const listenPromise = directPool.listen(LISTEN_PROBE_CHANNEL, () => undefined);
  try {
    const listener = await Promise.race([
      listenPromise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Postgres LISTEN probe timed out")),
          LISTEN_PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    await listener.unlisten();
    return true;
  } catch {
    // The timeout (or a listen error) won. If listen() still resolves later,
    // unsubscribe it in the background so no registration is left dangling.
    void listenPromise.then((l) => l.unlisten()).catch(() => undefined);
    return false;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/**
 * Readiness probe for both ordinary queries and the direct LISTEN/NOTIFY
 * connection used by realtime streams.
 */
export async function probeDatabaseReadiness(): Promise<DatabaseReadiness> {
  const [queryReady, listenReady] = await Promise.all([
    pingDatabase(),
    probeListenConnection(),
  ]);
  return { queryReady, listenReady };
}

/**
 * Assert that the database has the required ledger RPC and no legacy triggers
 * or functions containing a hardcoded Supabase JWT.
 *
 * Fails loudly on any mismatch so the app cannot start against an unhealthy DB.
 */
export async function assertRequiredDbFunctions(): Promise<void> {
  // Check the required function exists.
  const [functionRow] = await db.execute(sql`
    select proname
    from pg_proc
    where proname = ${REQUIRED_FUNCTION}
      and pronamespace = (select oid from pg_namespace where nspname = 'public')
  `);

  if (!functionRow) {
    throw new Error(
      `Required database function is missing: ${REQUIRED_FUNCTION}. ` +
        `Run client/migrations/20260704000004_apply_ledger_entry_and_sync_credits.sql before starting the app.`,
    );
  }

  // Check that no banned triggers remain.
  const allTriggers = await db.execute(sql`
    select tgname, tgrelid::regclass as table_name
    from pg_trigger
  `);
  const remainingTriggers = allTriggers.filter((t) =>
    BANNED_TRIGGERS.includes((t as { tgname: string }).tgname),
  );

  if (remainingTriggers.length > 0) {
    const names = remainingTriggers
      .map((t) => `${(t as { tgname: string }).tgname} on ${(t as { table_name: string }).table_name}`)
      .join(", ");
    throw new Error(
      `Legacy triggers still present in the database: ${names}. ` +
        `Run client/migrations/20260704000005_drop_legacy_triggers.sql before starting the app.`,
    );
  }

  // Check that no banned functions remain.
  const allFunctions = await db.execute(sql`
    select proname
    from pg_proc
    where pronamespace = (select oid from pg_namespace where nspname = 'public')
  `);
  const remainingFunctions = allFunctions.filter((f) =>
    BANNED_FUNCTIONS.includes((f as { proname: string }).proname),
  );

  if (remainingFunctions.length > 0) {
    const names = remainingFunctions
      .map((f) => (f as { proname: string }).proname)
      .join(", ");
    throw new Error(
      `Legacy functions still present in the database: ${names}. ` +
        `Run client/migrations/20260704000005_drop_legacy_triggers.sql before starting the app.`,
    );
  }
}
