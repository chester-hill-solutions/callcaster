import { data as routeData, redirect } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/supabase.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import {
  campaign as campaignTable,
  contact as contactTable,
  contact_audience as contactAudienceTable,
  outreach_attempt as outreachAttemptTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { eq, inArray } from "drizzle-orm";
import type { Audience, Contact } from "@/lib/types";
import type { LoaderFunctionArgs } from "react-router";

export type ContactIdLoaderData = {
  workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceById>>>;
  workspace_id: string;
  selected_id: string;
  contact: Contact | null;
  userRole: MemberRole;
  audiences: Audience[];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, contactId: selected_id } = params;

  if (!workspace_id) {
    return redirect("/workspaces");
  }

  if (!selected_id) {
    return redirect(`/workspaces/${workspace_id}`);
  }

  try {
    const { user } = await verifyAuth(request);

    const userRole = await getUserRole({
      user,
      workspaceId: workspace_id,
    });

    if (!userRole?.role) {
      return redirect(`/workspaces/${workspace_id}`);
    }

    const workspaceData = await getWorkspaceById(workspace_id);
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

      const outreachAttempts = await tdb.outreach_attempt.findMany({
        where: eq(outreachAttemptTable.contact_id, contactId),
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

      const contactAudiences = await tdb.contact_audience.findMany({
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

    const audiences = (await tdb.audience.findMany({})) as Audience[];

    return routeData({
      workspace: workspaceData,
      workspace_id,
      selected_id,
      contact,
      userRole: userRole.role as MemberRole,
      audiences: audiences || [],
    } satisfies ContactIdLoaderData);
  } catch (error) {
    logger.error("Error in contact loader:", error);
    return redirect(`/workspaces/${workspace_id}`);
  }
};
