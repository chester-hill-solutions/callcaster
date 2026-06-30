import { eq } from "drizzle-orm";
import {
  call as callTable,
  campaign as campaignTable,
  outreach_attempt as outreachAttemptTable,
  script as scriptTable,
} from "@/db/schema";
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

export async function upsertCallBySid(
  values: Partial<CallRow> & { sid: string },
): Promise<CallRow | null> {
  const existing = await findCallBySid(values.sid);
  if (existing?.workspace) {
    return updateCallBySid(existing.workspace, values.sid, values);
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

export async function findCallSidByParentCallSid(
  parentCallSid: string,
): Promise<string | null> {
  const rows = await db
    .select({ sid: callTable.sid })
    .from(callTable)
    .where(eq(callTable.parent_call_sid, parentCallSid))
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
