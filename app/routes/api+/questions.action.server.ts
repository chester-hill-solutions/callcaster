import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { parseActionRequest } from "@/lib/request-utils.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { dequeueCampaignQueueByContact } from "@/lib/campaign-queue-db.server";
import { isDncDisposition } from "@/lib/outreach-disposition";
import {
  contact as contactTable,
  outreach_attempt as outreachAttemptTable,
} from "@/db/schema";
import { and, eq, gte, desc } from "drizzle-orm";
import {
  extractTypedOutreachFields,
  syncContactSupportLevelCache,
} from "@/lib/outreach-typed-fields.server";

import type { Json } from "@/lib/db-types";
import type { ActionFunctionArgs } from "react-router";

/** Numeric coercion for ids that may arrive as JSON numbers or form strings. */
function toId(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {

  const { headers } = await getSession(request);  const user = auth.user;
    // The call screen's debounced save submits this as JSON; accept form
    // encoding too so a stale client (mid-deploy tab) degrades to a slower
    // parse rather than a 400 that silently drops the agent's answers.
    const body = await parseActionRequest(request);
    const workspace = typeof body.workspace === "string" ? body.workspace : "";
    const contact_id = toId(body.contact_id);
    const campaign_id = toId(body.campaign_id);
    const queue_id = toId(body.queue_id);
    const callId = toId(body.callId);
    // Form encoding delivers `update` as a JSON string; JSON delivers the object.
    let update: Json | undefined =
      body.update === undefined ? undefined : (body.update as Json);
    if (typeof update === "string") {
      try {
        update = JSON.parse(update) as Json;
      } catch {
        return routeData({ error: "Invalid update payload" }, { status: 400, headers });
      }
    }
    // "idle" is the client's between-calls sentinel, and "" is its empty
    // default — neither is a human-chosen outcome, so neither may overwrite
    // a disposition already on the attempt. A real agent choice always wins,
    // including over provider-terminal statuses: correcting "completed" to
    // "do_not_call" after the call ends is the primary disposition flow.
    const rawDisposition = typeof body.disposition === "string" ? body.disposition : "";
    const disposition =
      rawDisposition && rawDisposition !== "idle" ? rawDisposition : undefined;

    if (!workspace || contact_id == null || campaign_id == null) {
      return routeData({ error: "Missing required fields" }, { status: 400, headers });
    }

    await requireWorkspaceAccess({ user, workspaceId: workspace });
    const typedFields = extractTypedOutreachFields(update);
    const tdb = createTenantDb(workspace);

    // Prefer the attempt the client was actually working on (callId), scoped
    // to this contact+campaign so a stale id cannot write elsewhere. The
    // 10-minute window is only a fallback for saves that race attempt
    // creation — resolving by window alone targeted the wrong attempt under
    // redials or two agents on one contact.
    const targetedAttempt = callId != null
      ? await tdb.outreach_attempt.findFirst({
          where: and(
            eq(outreachAttemptTable.id, callId),
            eq(outreachAttemptTable.contact_id, contact_id),
            eq(outreachAttemptTable.campaign_id, campaign_id),
          ),
        })
      : null;

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentOutreach =
      targetedAttempt ??
      (await tdb.outreach_attempt.findFirst({
        where: and(
          eq(outreachAttemptTable.contact_id, contact_id),
          eq(outreachAttemptTable.campaign_id, campaign_id),
          gte(outreachAttemptTable.created_at, tenMinutesAgo),
        ),
        orderBy: desc(outreachAttemptTable.created_at),
      }));

    let outreachAttemptId: number | null = recentOutreach?.id ?? null;

    if (outreachAttemptId == null) {
      if (queue_id == null) {
        return routeData({ error: "Missing required fields" }, { status: 400, headers });
      }
      try {
        outreachAttemptId = await rpcCreateOutreachAttempt(tdb, {
          contactId: contact_id,
          campaignId: campaign_id,
          userId: user.id,
          workspaceId: workspace,
          queueId: queue_id,
        });
      } catch (error) {
        logger.error("Error creating outreach attempt:", error);
        return routeData({ error }, { status: 500, headers });
      }
    }

    if (!outreachAttemptId) {
      return routeData({ error: "Failed to create or update outreach attempt" }, { status: 500, headers });
    }

    const [finalUpdated] = await tdb.outreach_attempt.update({
      set: {
        ...(update !== undefined ? { result: update } : {}),
        ...(disposition !== undefined ? { disposition } : {}),
        user_id: user.id,
        ...typedFields,
      },
      where: eq(outreachAttemptTable.id, outreachAttemptId),
    });

    await syncContactSupportLevelCache(tdb, contact_id, typedFields.support_level);

    // "Do not call" side effects run AFTER the attempt is persisted: opt the
    // contact out and pull them from every campaign queue in the workspace.
    // Failures are logged but never fail the disposition save itself.
    if (disposition !== undefined && isDncDisposition(disposition)) {
      try {
        await tdb.contact.update({
          set: { opt_out: true },
          where: eq(contactTable.id, Number(contact_id)),
        });
        await dequeueCampaignQueueByContact({
          contactId: Number(contact_id),
          userId: user.id,
          reason: "Do not call requested",
          workspaceId: workspace,
        });
      } catch (error) {
        logger.error("Do-not-call side effects failed after disposition save:", error);
      }
    }

    return routeData(finalUpdated, { headers });
  },
});
