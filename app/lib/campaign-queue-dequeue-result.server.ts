import { and, eq } from "drizzle-orm";
import { campaign_queue as campaignQueueTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";

/**
 * Why a dequeue reported `dequeuedPrimary: false`.
 *
 * A plain read, run only on the no-op path, so the API can say something true
 * instead of "assigned to another agent" for every zero-row dequeue — the
 * manual-dial "next contact" flow dequeues a contact the hangup route has
 * usually already dequeued, and calling that a conflict would be a new lie in
 * place of the old one.
 *
 * Best-effort by construction: the row can change again between the RPC and
 * this read. It decides a message, never a write.
 */
export type DequeueNoOpReason =
  | "already_dequeued"
  | "assigned_elsewhere"
  | "not_found"
  | "unknown";

export async function explainDequeueNoOp(args: {
  contactId: number;
  campaignId: number;
  workspaceId: string;
  userId: string | null;
}): Promise<DequeueNoOpReason> {
  const rows = await createTenantDb(args.workspaceId).campaign_queue.findMany({
    columns: { queue_state: true, assigned_to_user_id: true, dequeued_at: true },
    where: and(
      eq(campaignQueueTable.contact_id, args.contactId),
      eq(campaignQueueTable.campaign_id, args.campaignId),
    ),
  });

  if (rows.length === 0) {
    return "not_found";
  }

  const heldByAnotherAgent = rows.some(
    (row) =>
      row.dequeued_at == null &&
      row.assigned_to_user_id != null &&
      row.assigned_to_user_id !== args.userId,
  );
  if (heldByAnotherAgent) {
    return "assigned_elsewhere";
  }

  if (rows.every((row) => row.dequeued_at != null)) {
    return "already_dequeued";
  }

  return "unknown";
}
