import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { campaign_queue, contact, workspace } from "@/db/schema";
import { db } from "./db";
import { createTenantDb } from "./tenant-db";
import type { QueueHouseholdSnapshot } from "@/lib/schemas/api/queue-advance";

type SnapshotRow = { id: number; workspace: string; campaign_id: number; contact_id: number;
  contact: { id: number; workspace: string | null; household_id: string | null } | null };

/** Capture the full household, including members outside the caller's current page. */
export async function withQueueAdvanceSnapshots<T extends SnapshotRow>(rows: T[], workspaceId: string): Promise<Array<T & { advance_snapshot?: QueueHouseholdSnapshot }>> {
  if (!rows.length) return rows;
  if (rows.some(row => row.workspace !== workspaceId)) throw new Error("Queue snapshot workspace does not match");
  return db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId)).for("no key update");
    const tdb = createTenantDb(workspaceId, tx);
    const homes = [...new Set(rows.flatMap(row => row.contact?.household_id ? [row.contact.household_id] : []))];
    const members = homes.length ? await tdb.contact.findMany({ where: inArray(contact.household_id, homes),
      columns: { id: true, household_id: true } }) : [];
    const homeByContact = new Map(members.map(member => [member.id, member.household_id]));
    const candidates = members.length ? await tdb.campaign_queue.findMany({ where: and(
      inArray(campaign_queue.campaign_id, [...new Set(rows.map(row => row.campaign_id))]),
      inArray(campaign_queue.contact_id, members.map(member => member.id)), isNull(campaign_queue.dequeued_at),
      or(isNull(campaign_queue.queue_state), inArray(campaign_queue.queue_state, ["queued", "assigned"])),
    ), orderBy: [asc(campaign_queue.id)] }) : [];
    return rows.map(row => {
      if (!row.contact || row.contact.workspace !== workspaceId) return row;
      const householdId = row.contact.household_id;
      const entries = householdId ? candidates.filter(candidate => candidate.campaign_id === row.campaign_id &&
        candidate.id !== row.id && homeByContact.get(candidate.contact_id) === householdId)
        .map(candidate => ({ queue_id: candidate.id, contact_id: candidate.contact_id,
          dispatch_generation: candidate.dispatch_generation, voice_reservation_id: candidate.voice_reservation_id })) : [];
      if (entries.length > 1000) throw new Error("The household is too large for one queue action");
      return { ...row, advance_snapshot: { household_id: householdId, entries } };
    });
  });
}
