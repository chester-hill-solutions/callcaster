import { eq } from "drizzle-orm";
import { call as callTable, outreach_attempt as outreachAttemptTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";
import { logger } from "@/lib/logger.server";
import type { OutreachAttempt } from "@/lib/types";

type CallRow = typeof callTable.$inferSelect;
type OutreachRow = typeof outreachAttemptTable.$inferSelect;

/** Global lookup by Twilio SID (webhooks do not carry workspace id). */
export async function findCallBySid(sid: string): Promise<CallRow | null> {
  const rows = await db
    .select()
    .from(callTable)
    .where(eq(callTable.sid, sid))
    .limit(1);
  return rows[0] ?? null;
}

export async function findCallsByConferenceId(
  workspaceId: string,
  conferenceId: string,
  tdb?: TenantDb,
): Promise<
  Pick<CallRow, "sid" | "outreach_attempt_id" | "contact_id">[]
> {
  const tenant = tdb ?? createTenantDb(workspaceId);
  return tenant.call.findMany({
    where: eq(callTable.conference_id, conferenceId),
    columns: { sid: true, outreach_attempt_id: true, contact_id: true },
  });
}

export async function updateCallBySid(
  workspaceId: string,
  sid: string,
  update: Partial<CallRow>,
  options?: { tdb?: TenantDb },
): Promise<CallRow | null> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const [row] = await tdb.call.update({
    set: update,
    where: eq(callTable.sid, sid),
  });
  return row ?? null;
}

export async function findOutreachAttemptById(
  workspaceId: string,
  id: number,
  tdb?: TenantDb,
): Promise<OutreachRow | null> {
  const tenant = tdb ?? createTenantDb(workspaceId);
  return (await tenant.outreach_attempt.findFirst({
    where: eq(outreachAttemptTable.id, id),
  })) as OutreachRow | null;
}

export async function updateOutreachAttemptForWorkspace(
  workspaceId: string,
  id: number | string,
  update: Partial<OutreachAttempt>,
  options?: { tdb?: TenantDb },
): Promise<OutreachRow | Response> {
  const attemptId = Number(id);
  const tdb = options?.tdb ?? createTenantDb(workspaceId);

  try {
    if (update.disposition) {
      const current = await findOutreachAttemptById(workspaceId, attemptId, tdb);
      if (current?.disposition) {
        const currentDisposition = String(current.disposition).toLowerCase();
        const nextDisposition = String(update.disposition).toLowerCase();
        if (!canTransitionOutreachDisposition(currentDisposition, nextDisposition)) {
          logger.debug("Skipping outreach disposition transition", {
            id: attemptId,
            current: currentDisposition,
            next: nextDisposition,
          });
          return current;
        }
      }
    }

    const [row] = await tdb.outreach_attempt.update({
      set: update as Partial<OutreachRow>,
      where: eq(outreachAttemptTable.id, attemptId),
    });
    if (!row) {
      throw new Error(`Outreach attempt ${attemptId} not found`);
    }
    return row;
  } catch (error: unknown) {
    logger.error("Error updating outreach attempt:", error);
    return new Response(
      `Error updating outreach attempt: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 },
    );
  }
}

export async function insertCallForWorkspace(
  workspaceId: string,
  values: Partial<CallRow> & { sid: string },
  options?: { tdb?: TenantDb },
): Promise<CallRow | null> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const [row] = await tdb.call.insert({
    ...values,
    date_created: values.date_created ?? new Date().toISOString(),
    is_last: values.is_last ?? false,
  } as Parameters<typeof tdb.call.insert>[0]);
  return row ?? null;
}
