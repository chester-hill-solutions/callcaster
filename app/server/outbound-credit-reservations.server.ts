import { and, eq, inArray, sql } from "drizzle-orm";
import { workspace_number_purchase, workspace_voice_reservation } from "@/db/schema";
import type { Database } from "@/server/db";

export type CreditTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const ACTIVE_VOICE_RESERVATION_STATES = ["reserved", "creating", "active"] as const;

/** One snapshot for admission and balance-only prechecks. Expiry is not release proof. */
export function outboundHeldCreditsSql(workspaceId: string) {
  return sql<number>`((select coalesce(sum(${workspace_number_purchase.credits}), 0)
    from ${workspace_number_purchase} where ${and(
      eq(workspace_number_purchase.workspace, workspaceId),
      inArray(workspace_number_purchase.state, ["reserved", "creating", "provisioned"]),
    )}) + (select coalesce(sum(${workspace_voice_reservation.credits}), 0)
    from ${workspace_voice_reservation} where ${and(
      eq(workspace_voice_reservation.workspace, workspaceId),
      inArray(workspace_voice_reservation.state, [...ACTIVE_VOICE_RESERVATION_STATES]),
    )}))::int`;
}

/** Caller holds the workspace row lock when it uses this value for admission. */
export async function getOutboundHeldCredits(tx: CreditTransaction, workspaceId: string) {
  const [row] = await tx.execute<{ held: number }>(sql`select ${outboundHeldCreditsSql(workspaceId)} as held`);
  return Number(row?.held ?? 0);
}
