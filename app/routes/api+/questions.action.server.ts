import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
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

interface RequestData {
  update?: Json;
  contact_id: number;
  campaign_id: number;
  workspace: string;
  disposition: string;
  queue_id: number;
}

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {

  const { headers } = await getSession(request);  const user = auth.user;
    const { update, contact_id, campaign_id, workspace, disposition, queue_id }: RequestData = await safeParseJson(request);
    await requireWorkspaceAccess({ user, workspaceId: workspace });
    const typedFields = extractTypedOutreachFields(update);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const tdb = createTenantDb(workspace);
    const recentOutreach = await tdb.outreach_attempt.findFirst({
      where: and(
        eq(outreachAttemptTable.contact_id, contact_id),
        eq(outreachAttemptTable.campaign_id, campaign_id),
        gte(outreachAttemptTable.created_at, tenMinutesAgo),
      ),
      orderBy: desc(outreachAttemptTable.created_at),
    });

    let outreachAttemptId: number | null = null;

    if (recentOutreach) {
      const [updated] = await tdb.outreach_attempt.update({
        set: {
          ...(update !== undefined ? { result: update } : {}),
          disposition,
          user_id: user.id,
          ...typedFields,
        },
        where: eq(outreachAttemptTable.id, recentOutreach.id),
      });
      outreachAttemptId = updated?.id ?? recentOutreach.id ?? null;
    } else {
      try {
        outreachAttemptId = await rpcCreateOutreachAttempt(tdb, {
          contactId: Number(contact_id),
          campaignId: Number(campaign_id),
          userId: user.id,
          workspaceId: workspace,
          queueId: Number(queue_id),
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
        disposition,
        ...typedFields,
      },
      where: eq(outreachAttemptTable.id, outreachAttemptId),
    });

    await syncContactSupportLevelCache(tdb, contact_id, typedFields.support_level);

    // "Do not call" side effects run AFTER the attempt is persisted: opt the
    // contact out and pull them from every campaign queue in the workspace.
    // Failures are logged but never fail the disposition save itself.
    if (isDncDisposition(disposition)) {
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
