import { and, eq, inArray, sql } from "drizzle-orm";
import { workspace_number_purchase, workspace_voice_reservation } from "@/db/schema";
import type { Database } from "@/server/db";

export type CreditTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const ACTIVE_VOICE_RESERVATION_STATES = ["reserved", "creating", "active"] as const;

/** Caller holds the workspace row lock when it uses this value for admission. */
export async function getOutboundHeldCredits(tx: CreditTransaction, workspaceId: string) {
  const [numbers] = await tx.select({ held: sql<number>`coalesce(sum(${workspace_number_purchase.credits}), 0)::int` })
    .from(workspace_number_purchase).where(and(
      eq(workspace_number_purchase.workspace, workspaceId),
      inArray(workspace_number_purchase.state, ["reserved", "creating", "provisioned"]),
    ));
  const [voice] = await tx.select({ held: sql<number>`coalesce(sum(${workspace_voice_reservation.credits}), 0)::int` })
    .from(workspace_voice_reservation).where(and(
      eq(workspace_voice_reservation.workspace, workspaceId),
      inArray(workspace_voice_reservation.state, [...ACTIVE_VOICE_RESERVATION_STATES]),
    ));
  return Number(numbers?.held ?? 0) + Number(voice?.held ?? 0);
}
