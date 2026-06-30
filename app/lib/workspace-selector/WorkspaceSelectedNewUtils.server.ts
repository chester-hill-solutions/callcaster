
import { data as routeData, redirect } from "react-router";
import { parseCSV } from "@/lib/utils";
import { bulkCreateContacts, getWorkspacePhoneNumbers } from "@/lib/database.server";
import {
  DEFAULT_WEEKDAY_CALLING_SCHEDULE,
  getDefaultCampaignDates,
} from "@/lib/campaign-setup-steps";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { Contact } from "@/lib/types";
import { Database } from "@/lib/db-types";
import { logger } from "@/lib/logger.server";
import { eq } from "drizzle-orm";
import {
  campaign_audience as campaignAudienceTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

type CampaignType = "live_call" | "message" | "robocall";

interface CampaignAudienceParams {
  campaignId: string;
  audienceId: string;
}

interface RemoveCampaignAudienceParams {
  id: string;
}

interface NewAudienceParams {
  formData: FormData;
  workspaceId: string;
  headers: Headers;
  contactsFile: File;
  campaignId?: string;
  contacts?: Array<Contact>;
  userId: string;
}

interface NewCampaignParams {
  formData: FormData;
  workspaceId: string;
  headers: Headers;
}

async function insertCampaignAudience({ campaignId, audienceId }: CampaignAudienceParams) {
  try {
    await db.insert(campaignAudienceTable).values({
      campaign_id: Number.parseInt(campaignId, 10),
      audience_id: Number.parseInt(audienceId, 10),
      created_at: new Date().toISOString(),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
}

async function removeCampaignAudience({ id }: RemoveCampaignAudienceParams) {
  try {
    await db
      .delete(campaignAudienceTable)
      .where(eq(campaignAudienceTable.audience_id, Number.parseInt(id, 10)));
    return { error: null };
  } catch (error) {
    return { error };
  }
}

export async function handleNewAudience({
  formData,
  workspaceId,
  headers,
  contactsFile,
  campaignId,
  contacts = [],
  userId,
}: NewAudienceParams) {
  const newAudienceName = formData.get("audience-name") as string;
  const tdb = createTenantDb(workspaceId);

  try {
    const createAudienceRows = await tdb.audience.insert({
      name: newAudienceName,
      created_at: new Date().toISOString(),
      is_conditional: false,
      status: "draft",
      total_contacts: 0,
    });
    const createAudienceData = createAudienceRows[0];
    if (!createAudienceData) {
      throw new Error("Failed to create audience");
    }

    if (campaignId) {
      const { error: campaignInsertError } = await insertCampaignAudience({
        campaignId,
        audienceId: createAudienceData.id.toString(),
      });
      if (campaignInsertError) {
        await removeCampaignAudience({ id: createAudienceData.id.toString() });
        throw campaignInsertError;
      }
    }

    if (contacts && contacts.length > 0) {
      const { insert } = await bulkCreateContacts(
        contacts,
        workspaceId,
        createAudienceData.id.toString(),
        userId,
      );
      if (campaignId && insert?.length) {
        const contactIds = insert.map((c) => c.id);
        await enqueueContactsForCampaign(
          parseInt(campaignId, 10),
          contactIds,
          { requeue: false },
        );
      }
    }

    return redirect(
      `/workspaces/${workspaceId}/audiences/${createAudienceData.id}`,
      { headers },
    );
  } catch (error) {
    logger.error("Error in handleNewAudience:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return routeData(
      {
        audienceData: null,
        error: errorMessage,
      },
      { status: 500, headers },
    );
  }
}

export async function handleNewCampaign({formData,
  workspaceId,
  headers,
}: NewCampaignParams) {
  const newCampaignName = formData.get("campaign-name") as string;
  const newCampaignType = formData.get("campaign-type") as CampaignType;
  logger.debug("Campaign Type: ", newCampaignType);

  const { start_date, end_date } = getDefaultCampaignDates();
  const phoneNumbersResult = await getWorkspacePhoneNumbers({
    workspaceId,
  });
  const workspaceNumbers = (phoneNumbersResult.data ?? []).filter(
    (number) => Boolean(number?.phone_number),
  );
  const caller_id =
    workspaceNumbers.length === 1
      ? String(workspaceNumbers[0]?.phone_number)
      : null;

  const tdb = createTenantDb(workspaceId);
  try {
    const rows = await tdb.campaign.insert({
      title: newCampaignName,
      status: "draft",
      type: newCampaignType,
      start_date,
      end_date,
      schedule: DEFAULT_WEEKDAY_CALLING_SCHEDULE,
      caller_id,
      created_at: new Date().toISOString(),
      dial_ratio: 1,
      next_queue_order: 0,
      group_household_queue: false,
      is_active: false,
    });
    const campaignData = rows[0];
    if (!campaignData) {
      return routeData(
        { campaignData: null, error: { message: "Failed to create campaign" } },
        { headers },
      );
    }

    return redirect(
      `/workspaces/${workspaceId}/campaigns/${campaignData.id}/settings`,
    );
  } catch (campaignError) {
    const code =
      campaignError && typeof campaignError === "object" && "code" in campaignError
        ? String((campaignError as { code?: string }).code)
        : null;
    if (code === "23505") {
      return routeData(
        {
          campaignData: null,
          error: {
            message: "There is already a campaign with that name. Please use a unique campaign name.",
          },
        },
        { headers },
      );
    }
    return routeData({ campaignData: null, error: campaignError }, { headers });
  }
}
