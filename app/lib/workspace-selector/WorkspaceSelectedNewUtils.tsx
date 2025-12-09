import { json } from "@remix-run/node";
import { redirect } from "react-router";
import { parseCSV } from "../utils";
import { bulkCreateContacts } from "../database.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Contact } from "@/lib/types";
import { Database } from "../database.types";

type CampaignType = "live_call" | "message" | "robocall";

interface CampaignAudienceParams {
  campaignId: string;
  audienceId: string;
  supabaseClient: SupabaseClient<Database>;
}

interface RemoveCampaignAudienceParams {
  supabaseClient: SupabaseClient<Database>;
  id: string;
}

interface NewAudienceParams {
  supabaseClient: SupabaseClient<Database>;
  formData: FormData;
  workspaceId: string;
  headers: Headers;
  contactsFile: File;
  campaignId?: string;
  contacts?: Array<Contact>;
  userId: string;
}

interface NewCampaignParams {
  supabaseClient: SupabaseClient<Database>;
  formData: FormData;
  workspaceId: string;
  headers: Headers;
}

async function insertCampaignAudience({ campaignId, audienceId, supabaseClient }: CampaignAudienceParams) {
  const { error } = await supabaseClient
    .from("campaign_audience")
    .insert([{ campaign_id: parseInt(campaignId), audience_id: parseInt(audienceId) }]);
  return { error };
}

async function removeCampaignAudience({ supabaseClient, id }: RemoveCampaignAudienceParams) {
  const { error } = await supabaseClient
    .from("campaign_audience")
    .delete()
    .eq("id", id);
  return { error };
}

export async function handleNewAudience({
  supabaseClient,
  formData,
  workspaceId,
  headers,
  contactsFile,
  campaignId,
  contacts = [],
  userId,
}: NewAudienceParams) {
  const newAudienceName = formData.get("audience-name") as string;

  try {
    // Create the audience
    const { data: createAudienceData, error: createAudienceError } =
      await supabaseClient
        .from("audience")
        .insert({
          name: newAudienceName,
          workspace: workspaceId,
        })
        .select()
        .single();

    if (createAudienceError) {
      throw createAudienceError;
    }

    // Link to campaign if provided
    if (campaignId) {
      const { error: campaignInsertError } = await insertCampaignAudience({
        campaignId,
        audienceId: createAudienceData.id.toString(),
        supabaseClient,
      });
      if (campaignInsertError) {
        await removeCampaignAudience({ supabaseClient, id: createAudienceData.id.toString() });
        throw campaignInsertError;
      }
    }

    // Add contacts if provided - these are already mapped from the CSV UI
    if (contacts && contacts.length > 0) {
      await bulkCreateContacts(
        supabaseClient,
        contacts,
        workspaceId,
        createAudienceData.id.toString(),
        userId
      );
    }

    return redirect(
      `/workspaces/${workspaceId}/audiences/${createAudienceData.id}`,
      { headers },
    );
  } catch (error) {
    console.error("Error in handleNewAudience:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return json(
      {
        audienceData: null,
        error: errorMessage,
      },
      { status: 500, headers },
    );
  }
}

export async function handleNewCampaign({
  supabaseClient,
  formData,
  workspaceId,
  headers,
}: NewCampaignParams) {
  const newCampaignName = formData.get("campaign-name") as string;
  const newCampaignType = formData.get("campaign-type") as CampaignType;
  console.log("Campaign Type: ", newCampaignType);

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .insert({
      title: newCampaignName,
      workspace: workspaceId,
      status: "draft",
      type: newCampaignType
    })
    .select()
    .single();

  if (campaignError) {
    if (campaignError.code === '23505'){
      return json(
        { campaignData: null, error: {message: "There is already a campaign with that name. Please use a unique campaign name."} },
        { headers },
      );  
    }
    return json(
      { campaignData: null, error: campaignError },
      { headers },
    );
  }

  const tableKey = newCampaignType === "live_call" ? "live_campaign" : 
                   newCampaignType === "message" ? "message_campaign" :
                   newCampaignType === "robocall" ? "ivr_campaign" : null;

  if (!tableKey) {
    return json(
      { campaignData: null, error: "Invalid campaign type" },
      { headers },
    );
  }

  const { error: detailsError } = await supabaseClient
    .from(tableKey)
    .insert({ campaign_id: campaignData.id, workspace: workspaceId });

  if (detailsError) {
    return json(
      { campaignData: campaignData, error: detailsError },
      { headers },
    );
  }

  return redirect(
    `/workspaces/${workspaceId}/campaigns/${campaignData.id}/settings`,
  );
}
