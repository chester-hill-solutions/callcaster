import { sql } from "drizzle-orm";
import type { Database } from "./db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Acquire before audience or contact row locks so import and repair use one order. */
export async function lockWorkspaceContactIdentity(
  tx: Transaction,
  workspaceId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`audience-import-contacts:${workspaceId}`}, 0))`,
  );
}
