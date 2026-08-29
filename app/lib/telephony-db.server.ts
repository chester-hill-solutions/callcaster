import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  call as callTable,
  campaign as campaignTable,
  outreach_attempt as outreachAttemptTable,
  script as scriptTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";
import { logger } from "@/lib/logger.server";
import type { OutreachAttempt } from "@/lib/types";

type CallRow = typeof callTable.$inferSelect;
type OutreachRow = typeof outreachAttemptTable.$inferSelect;

/**
 * Terminal `call.status` values. Once a call reaches one of these, a status
 * update carrying a non-terminal status (e.g. a late/out-of-order webhook
 * still reporting `queued`/`ringing`/`in-progress`) must not regress it.
 */
export const TERMINAL_CALL_STATUSES = new Set([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
]);

/**
 * True unless applying `next` would regress a terminal call status back to a
 * non-terminal one. Terminal-to-terminal and any transition away from a
 * non-terminal (or unknown) current status are always allowed.
 */
export function canTransitionCallStatus(
  current: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (!next) return true;
  if (!current) return true;
  const c = String(current).toLowerCase();
  const n = String(next).toLowerCase();
  return !(TERMINAL_CALL_STATUSES.has(c) && !TERMINAL_CALL_STATUSES.has(n));
}

/**
 * `ARRAY[...]` SQL literal for {@link TERMINAL_CALL_STATUSES}, used to encode
 * the status-transition guard directly in an UPDATE statement (see
 * {@link updateCallBySid}). Safe to inline via `sql.raw`: the set is a fixed
 * module-level constant, never user input.
 */
const TERMINAL_CALL_STATUSES_SQL = sql.raw(
  `ARRAY[${Array.from(TERMINAL_CALL_STATUSES)
    .map((status) => `'${status}'`)
    .join(", ")}]`,
);

/** Global lookup by Twilio SID (webhooks do not carry workspace id). */
export async function findCallBySid(sid: string): Promise<CallRow | null> {
  const rows = await db
    .select()
    .from(callTable)
    .where(eq(callTable.sid, sid))
    .limit(1);
  return rows[0] ?? null;
}

export async function findCallConferenceIdForWorkspace(
  workspaceId: string,
  callSid: string,
): Promise<string | null> {
  const tdb = createTenantDb(workspaceId);
  const row = await tdb.call.findFirst({
    where: eq(callTable.sid, callSid),
    columns: { conference_id: true },
  });
  return row?.conference_id ?? null;
}

export async function updateOutreachDispositionByContactId(
  workspaceId: string,
  contactId: number,
  disposition: string,
  options?: { tdb?: TenantDb },
): Promise<void> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  await tdb.outreach_attempt.update({
    set: { disposition },
    where: eq(outreachAttemptTable.contact_id, contactId),
  });
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

export async function findActiveConferenceIdsForUser(
  workspaceId: string,
  userId: string,
): Promise<string[]> {
  const rows = await adminDb.execute(sql`
    SELECT DISTINCT c.conference_id
    FROM call c
    JOIN outreach_attempt oa ON c.outreach_attempt_id = oa.id
    WHERE c.workspace = ${workspaceId}
      AND oa.user_id = ${userId}
      AND c.conference_id IS NOT NULL
      AND c.conference_id != ''
      AND c.status = ANY(ARRAY['initiated', 'queued', 'ringing', 'in-progress'])
  `);
  // type-cast justified: raw SQL query result has unknown shape until cast to expected columns
  return (rows as unknown as { conference_id: string }[]).map((row) => row.conference_id);
}

/**
 * Atomically claim a terminal-status transition for a call.
 *
 * Returns true only for the delivery that actually moves the row TO
 * `terminalStatus` (from a different or null status); a concurrent/duplicate
 * delivery of the same terminal status sees 0 rows and returns false. This is a
 * compare-and-set — the UPDATE's row lock serializes concurrent callbacks — so
 * it replaces a check-then-act guard that let two overlapping Twilio retries
 * both re-dequeue the contact and place a second outbound call.
 */
export async function claimTerminalCallStatus(
  workspaceId: string,
  sid: string,
  terminalStatus: string,
  options?: { tdb?: TenantDb },
): Promise<boolean> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const normalized = terminalStatus.toLowerCase();
  // type-cast justified: CallRow.status is ENUM type, normalized string assignment needs intermediate unknown
  const rows = await tdb.call.update({
    set: { status: normalized } as unknown as Partial<CallRow>,
    where: and(
      eq(callTable.sid, sid),
      // ::text — call.status is the call_status ENUM in every real database
      // and lower(call_status) does not exist; without the cast this guard
      // throws instead of guarding (#1289).
      or(isNull(callTable.status), sql`LOWER(${callTable.status}::text) <> ${normalized}`),
    ),
  });
  return rows.length > 0;
}

export async function updateCallBySid(
  workspaceId: string,
  sid: string,
  update: Partial<CallRow>,
  options?: { tdb?: TenantDb },
): Promise<CallRow | null> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);

  if (update.status == null) {
    const [row] = await tdb.call.update({
      set: update,
      where: eq(callTable.sid, sid),
    });
    return row ?? null;
  }

  // Status-transition guard, enforced atomically inside the UPDATE itself
  // (previously a separate `findFirst` + conditional update). The CASE
  // expression re-implements canTransitionCallStatus: keep the row's
  // current status when it's already terminal and the incoming status is
  // not, otherwise apply the incoming status. Doing this in one statement
  // removes the read-then-write round trip and the race between the guard
  // check and the write.
  // ::text on the column: call.status is the call_status ENUM in every real
  // database, and lower(call_status) does not exist — without the cast this
  // UPDATE throws, so every status-bearing webhook/sync write failed and rows
  // accumulated in 'queued' forever (#1289). The unit tier mocks the db
  // client and could not see it; test/integration-db/call-status-guard.test.ts
  // runs this statement against a real database.
  const guardedStatus = sql`CASE WHEN LOWER(${callTable.status}::text) = ANY(${TERMINAL_CALL_STATUSES_SQL}) AND LOWER(${update.status}) <> ALL(${TERMINAL_CALL_STATUSES_SQL}) THEN ${callTable.status} ELSE ${update.status} END`;

  // type-cast justified: mixing SQL expressions with regular fields in set object requires unknown intermediate
  const [row] = await tdb.call.update({
    set: {
      ...update,
      status: guardedStatus,
    } as unknown as Partial<CallRow>,
    where: eq(callTable.sid, sid),
  });

  if (!row) {
    return null;
  }

  if (row.status !== update.status) {
    logger.debug("Skipped call status regression", {
      sid,
      current: row.status,
      next: update.status,
    });
  }

  return row;
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

export async function upsertCallBySid(
  values: Partial<CallRow> & { sid: string },
): Promise<CallRow | null> {
  const existingWorkspace = values.workspace ?? null;
  if (existingWorkspace) {
    const updated = await updateCallBySid(existingWorkspace, values.sid, values as Partial<CallRow>);
    if (updated) return updated;
  }

  const [row] = await db
    .insert(callTable)
    .values({
      ...values,
      date_created: values.date_created ?? new Date().toISOString(),
      is_last: values.is_last ?? false,
    })
    .returning();
  return row ?? null;
}

export async function findOutreachAttemptWithCampaignType(
  workspaceId: string,
  id: number,
  tdb?: TenantDb,
): Promise<
  | (OutreachRow & { campaign: { type: string | null } | null })
  | null
> {
  const tenant = tdb ?? createTenantDb(workspaceId);
  const attempt = await tenant.outreach_attempt.findFirst({
    where: eq(outreachAttemptTable.id, id),
  });
  if (!attempt) {
    return null;
  }

  const campaign = attempt.campaign_id
    ? await tenant.campaign.findFirst({
        where: eq(campaignTable.id, attempt.campaign_id),
        columns: { type: true },
      })
    : null;

  return {
    ...(attempt as OutreachRow),
    campaign: campaign ? { type: campaign.type } : null,
  };
}

export async function findCampaignTypeByCampaignId(
  campaignId: number,
  workspaceId: string,
  tdb?: TenantDb,
): Promise<string | null> {
  const tenant = tdb ?? createTenantDb(workspaceId);
  const campaign = await tenant.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
    columns: { type: true },
  });
  return campaign?.type ?? null;
}

export async function findCallSidByParentCallSid(
  workspaceId: string,
  parentCallSid: string,
): Promise<string | null> {
  const rows = await db
    .select({ sid: callTable.sid })
    .from(callTable)
    .where(
      and(
        eq(callTable.parent_call_sid, parentCallSid),
        eq(callTable.workspace, workspaceId),
      ),
    )
    .limit(1);
  return rows[0]?.sid ?? null;
}

export async function findCallWithCampaignScriptBySid(callSid: string) {
  const call = await findCallBySid(callSid);
  if (!call?.workspace) {
    return null;
  }

  const tdb = createTenantDb(call.workspace);
  const campaign = call.campaign_id
    ? await tdb.campaign.findFirst({
        where: eq(campaignTable.id, call.campaign_id),
      })
    : null;
  const script =
    campaign?.script_id != null
      ? await tdb.script.findFirst({
          where: eq(scriptTable.id, campaign.script_id),
        })
      : null;

  return {
    ...call,
    campaign: campaign ? { ...campaign, script } : null,
  };
}

export async function updateCallRecordingUrlBySid(
  callSid: string,
  recordingUrl: string,
): Promise<CallRow | null> {
  const call = await findCallBySid(callSid);
  if (!call?.workspace) {
    return null;
  }
  return updateCallBySid(call.workspace, callSid, { recording_url: recordingUrl });
}
