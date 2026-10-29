import { eq, sql } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { outboundHeldCreditsSql } from "@/server/outbound-credit-reservations.server";

/** Keep posted balances unchanged unless an outbound precheck requests availability. */
export async function getWorkspaceCreditsBalance(
  workspaceId: string,
  options: { excludeOutboundHolds?: boolean } = {},
): Promise<number | null> {
  const rows = await adminDb
    .select({ credits: options.excludeOutboundHolds
      ? sql<number>`${workspace.credits} - ${outboundHeldCreditsSql(workspaceId)}`
      : workspace.credits })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return rows[0]?.credits ?? null;
}
