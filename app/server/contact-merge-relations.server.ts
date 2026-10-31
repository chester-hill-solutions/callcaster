import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  audience,
  call,
  campaign,
  campaign_queue,
  contact_audience,
  message,
  outreach_attempt,
  predictive_machine_operation,
  survey,
  survey_response,
} from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { TERMINAL_OUTREACH_DISPOSITIONS } from "@/lib/outreach-disposition";
import { TERMINAL_CALL_STATUSES } from "@/lib/telephony-db.server";
import type { db } from "./db";
import { createTenantDb } from "./tenant-db";

export type MergeTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
const TERMINAL_MESSAGES = new Set([
  "sent",
  "delivered",
  "read",
  "received",
  "undelivered",
  "failed",
  "canceled",
]);
function conflict(message: string): never {
  throw new AppError(message, 409, ErrorCode.INVALID_INPUT);
}

export async function lockMergeRelations(
  tx: MergeTransaction,
  workspaceId: string,
  ids: number[],
) {
  // Lock global references before checking tenancy: a malformed foreign reference must not cascade away.
  const queues = await tx
    .select()
    .from(campaign_queue)
    .where(inArray(campaign_queue.contact_id, ids))
    .orderBy(asc(campaign_queue.id))
    .for("update");
  const queueIds = queues.map((row) => row.id);
  const calls = await tx
    .select()
    .from(call)
    .where(or(inArray(call.contact_id, ids), inArray(call.queue_id, queueIds)))
    .orderBy(asc(call.sid))
    .for("update");
  const messages = await tx
    .select()
    .from(message)
    .where(
      or(inArray(message.contact_id, ids), inArray(message.queue_id, queueIds)),
    )
    .orderBy(asc(message.sid))
    .for("update");
  const attempts = await tx
    .select()
    .from(outreach_attempt)
    .where(inArray(outreach_attempt.contact_id, ids))
    .orderBy(asc(outreach_attempt.id))
    .for("update");
  const operations = await tx
    .select()
    .from(predictive_machine_operation)
    .where(
      or(
        inArray(predictive_machine_operation.successor_contact_id, ids),
        inArray(predictive_machine_operation.successor_queue_id, queueIds),
        inArray(
          predictive_machine_operation.outreach_attempt_id,
          attempts.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(predictive_machine_operation.id))
    .for("update");
  const memberships = await tx
    .select({ link: contact_audience, workspace: audience.workspace })
    .from(contact_audience)
    .innerJoin(audience, eq(audience.id, contact_audience.audience_id))
    .where(inArray(contact_audience.contact_id, ids))
    .orderBy(
      asc(contact_audience.audience_id),
      asc(contact_audience.contact_id),
    )
    .for("update");
  const responses = await tx
    .select({ response: survey_response, workspace: survey.workspace })
    .from(survey_response)
    .innerJoin(survey, eq(survey.id, survey_response.survey_id))
    .where(inArray(survey_response.contact_id, ids))
    .orderBy(asc(survey_response.id))
    .for("update");
  const campaignIds = [
    ...new Set([...queues, ...attempts].map((row) => row.campaign_id)),
  ];
  const campaigns = await tx
    .select()
    .from(campaign)
    .where(inArray(campaign.id, campaignIds))
    .orderBy(asc(campaign.id))
    .for("update");
  const scoped = [
    ...queues,
    ...calls,
    ...messages,
    ...attempts,
    ...operations,
    ...memberships,
    ...responses,
    ...campaigns,
  ];
  if (
    scoped.some((row) => row.workspace !== workspaceId) ||
    [...calls, ...messages].some(
      (row) => row.contact_id != null && !ids.includes(row.contact_id),
    )
  ) {
    conflict(
      "Contact history has inconsistent workspace or person links. Ask an administrator to check it before merging.",
    );
  }
  if (
    calls.some((row) => !TERMINAL_CALL_STATUSES.has(row.status ?? "")) ||
    messages.some((row) => !TERMINAL_MESSAGES.has(row.status ?? "")) ||
    attempts.some(
      (row) =>
        !row.ended_at &&
        !TERMINAL_OUTREACH_DISPOSITIONS.has(row.disposition ?? ""),
    ) ||
    operations.some((row) => row.state !== "continued") ||
    queues.some(
      (row) =>
        row.assigned_to_user_id ||
        row.claimed_at ||
        (row.queue_state != null &&
          !["queued", "dequeued", "failed"].includes(row.queue_state)),
    ) ||
    campaigns.some(
      (row) => row.status === "running" || row.status === "waiting",
    )
  ) {
    conflict(
      "These contacts have active work. Pause their campaigns and finish active calls or messages, then review again.",
    );
  }
  return {
    queues,
    calls,
    messages,
    attempts,
    operations,
    memberships,
    responses,
  };
}

export type MergeRelations = Awaited<ReturnType<typeof lockMergeRelations>>;

export async function moveMergeRelations(
  tx: MergeTransaction,
  workspaceId: string,
  retainedId: number,
  ids: number[],
  related: MergeRelations,
) {
  const tdb = createTenantDb(workspaceId, tx);
  const byCampaign = new Map<number, typeof related.queues>();
  for (const row of related.queues) {
    const group = byCampaign.get(row.campaign_id) ?? [];
    group.push(row);
    byCampaign.set(row.campaign_id, group);
  }
  for (const rows of byCampaign.values()) {
    const keeper = rows.find((row) => row.contact_id === retainedId) ?? rows[0];
    if (!keeper) continue;
    const completed = rows.find(
      (row) => row.queue_state === "dequeued" || row.dequeued_at != null,
    );
    const removed = rows
      .filter((row) => row.id !== keeper.id)
      .map((row) => row.id);
    if (removed.length) {
      // call.queue_id cascades on delete; message.queue_id becomes null. Move both first.
      await tdb.call.update({
        set: { queue_id: keeper.id },
        where: inArray(call.queue_id, removed),
      });
      await tdb.message.update({
        set: { queue_id: keeper.id },
        where: inArray(message.queue_id, removed),
      });
      await tdb.predictive_machine_operation.update({
        set: { successor_queue_id: keeper.id },
        where: inArray(
          predictive_machine_operation.successor_queue_id,
          removed,
        ),
      });
      await tdb.campaign_queue.delete({
        where: inArray(campaign_queue.id, removed),
      });
    }
    const latest =
      [...rows].sort(
        (a, b) =>
          (b.last_attempt_at?.getTime() ?? 0) -
          (a.last_attempt_at?.getTime() ?? 0),
      )[0] ?? keeper;
    await tdb.campaign_queue.update({
      where: eq(campaign_queue.id, keeper.id),
      set: {
        contact_id: retainedId,
        attempts: rows.reduce((sum, row) => sum + row.attempts, 0),
        attempt_count: rows.reduce((sum, row) => sum + row.attempt_count, 0),
        last_attempt_at: latest.last_attempt_at,
        last_attempt_error: latest.last_attempt_error,
        provider_status: latest.provider_status,
        ...(completed
          ? {
              queue_state: "dequeued",
              dequeued_at: completed.dequeued_at ?? new Date(),
              dequeued_by: completed.dequeued_by,
              dequeued_reason:
                completed.dequeued_reason ?? "Completed before contact merge",
            }
          : {}),
      },
    });
  }
  const union = new Map<number, string>();
  for (const { link } of related.memberships) {
    const existing = union.get(link.audience_id);
    if (!existing || link.created_at < existing)
      union.set(link.audience_id, link.created_at);
  }
  await tx
    .delete(contact_audience)
    .where(inArray(contact_audience.contact_id, ids));
  if (union.size)
    await tx.insert(contact_audience).values(
      [...union].map(([audience_id, created_at]) => ({
        audience_id,
        created_at,
        contact_id: retainedId,
      })),
    );
  const removedIds = ids.filter((id) => id !== retainedId);
  await tdb.call.update({
    set: { contact_id: retainedId },
    where: inArray(call.contact_id, removedIds),
  });
  await tdb.message.update({
    set: { contact_id: retainedId },
    where: inArray(message.contact_id, removedIds),
  });
  await tdb.outreach_attempt.update({
    set: { contact_id: retainedId },
    where: inArray(outreach_attempt.contact_id, removedIds),
  });
  await tdb.predictive_machine_operation.update({
    set: { successor_contact_id: retainedId },
    where: inArray(
      predictive_machine_operation.successor_contact_id,
      removedIds,
    ),
  });
  await tx
    .update(survey_response)
    .set({ contact_id: retainedId })
    .where(
      and(
        inArray(survey_response.contact_id, removedIds),
        inArray(
          survey_response.id,
          related.responses.map((row) => row.response.id),
        ),
      ),
    );
}
