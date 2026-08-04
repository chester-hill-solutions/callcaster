import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { getUserRole } from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import { getWorkspaceForClient } from "@/lib/workspace-client-projection.server";
import {
  audience as audienceTable,
  campaign as campaignTable,
  contact as contactTable,
  contact_audience as contactAudienceTable,
  outreach_attempt as outreachAttemptTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
// contact_audience is a join table without a workspace column; tdb cannot scope it.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/server/db";
import { desc, eq, inArray } from "drizzle-orm";
import type { Audience, Contact } from "@/lib/types";
import { defineLoader } from "@/lib/handler.server";

export type ContactIdLoaderData = {
  workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceForClient>>>;
  workspace_id: string;
  selected_id: string;
  contact: Contact | null;
  userRole: MemberRole;
  audiences: Audience[];
};

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ params, context }) => {
  const { id: workspace_id, contactId: selected_id } = params;

  if (!workspace_id) {
    return redirect("/workspaces");
  }

  if (!selected_id) {
    return redirect(`/workspaces/${workspace_id}`);
  }

  try {
    const { user, workspaceId, userRole, headers } = getWorkspaceRouteContext(context)
    if (!userRole) {
      return redirect(`/workspaces/${workspace_id}`);
    }

    const workspaceData = await getWorkspaceForClient(workspace_id);
    if (!workspaceData) {
      return redirect(`/workspaces/${workspace_id}`);
    }

    const tdb = createTenantDb(workspace_id);
    let contact: Contact | null = null;

    if (selected_id !== "new") {
      const contactId = Number(selected_id) || 0;
      const contactRow = await tdb.contact.findFirst({
        where: eq(contactTable.id, contactId),
      });

      if (!contactRow) {
        return redirect(`/workspaces/${workspace_id}/contacts`);
      }

      // Limit and order outreach attempts to prevent loading unbounded history
      // for heavily-dialled contacts. Repeated dial attempts accumulate one row each.
      const outreachAttempts = await tdb.outreach_attempt.findMany({
        where: eq(outreachAttemptTable.contact_id, contactId),
        orderBy: [desc(outreachAttemptTable.created_at)],
        limit: 200,
      });

      const campaignIds = [
        ...new Set(
          outreachAttempts
            .map((attempt) => attempt.campaign_id)
            .filter((id): id is number => id != null),
        ),
      ];
      const campaigns =
        campaignIds.length === 0
          ? []
          : await tdb.campaign.findMany({
              where: inArray(campaignTable.id, campaignIds),
            });
      const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

      const contactAudiences = await db.query.contact_audience.findMany({
        where: eq(contactAudienceTable.contact_id, contactId),
      });

      contact = {
        ...(contactRow as Contact),
        outreach_attempt: outreachAttempts.map((attempt) => ({
          ...attempt,
          campaign: campaignsById.get(attempt.campaign_id) ?? null,
        })),
        contact_audience: contactAudiences,
      } as Contact;
    }

    // Limit audience list to prevent unbounded growth in workspace audience count.
    const audiences = (await tdb.audience.findMany({
      orderBy: [desc(audienceTable.created_at)],
      limit: 200,
    })) as Audience[];

    return routeData({
      workspace: workspaceData,
      workspace_id,
      selected_id,
      contact,
      userRole: userRole as MemberRole,
      audiences: audiences || [],
    } satisfies ContactIdLoaderData);
  } catch (error) {
    logger.error("Error in contact loader:", error);
    return redirect(`/workspaces/${workspace_id}`);
  }
  },
});
