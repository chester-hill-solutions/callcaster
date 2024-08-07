import { json } from "@remix-run/node";
import { redirect } from "react-router";
import { parseCSV } from "../utils";
import { bulkCreateContacts } from "../database.server";
import { SupabaseClient } from "@supabase/supabase-js";

async function insertCampaignAudience({
  campaignId,
  audienceId,
  supabaseClient,
}) {
  return await supabaseClient
    .from("campaign_audience")
    .insert({
      campaign_id: campaignId,
      audience_id: audienceId,
    })
    .select()
    .single();
}

async function removeCampaignAudience({ supabaseClient, id }) {
  return await supabaseClient.from("audience").delete().eq("id", id);
}

export async function handleNewAudience({
  supabaseClient,
  formData,
  workspaceId,
  headers,
  contactsFile,
  campaignId,
}: {
  supabaseClient: SupabaseClient;
  formData: FormData;
  workspaceId: string;
  headers: Headers;
  contactsFile: File;
  campaignId?: string;
}) {
  const newAudienceName = formData.get("audience-name") as string;

  try {
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
    if (campaignId) {
      const { error: campaignInsertError } = await insertCampaignAudience({
        campaignId,
        audienceId: createAudienceData.id,
        supabaseClient,
      });
      if (campaignInsertError)
        removeCampaignAudience({ supabaseClient, id: createAudienceData.id });
    }
    if (contactsFile && contactsFile.size > 0) {
      const fileContent = await contactsFile.text();
      const { headers: csvHeaders, contacts } = parseCSV(fileContent);
      await bulkCreateContacts(
        supabaseClient,
        contacts,
        workspaceId,
        createAudienceData.id,
      );
    }

    return redirect(
      `/workspaces/${workspaceId}/audiences/${createAudienceData.id}`,
      { headers },
    );
  } catch (error) {
    console.error("Error in handleNewAudience:", error);
    return json(
      {
        audienceData: null,
        error: error.message || "An unexpected error occurred",
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
}) {
  const newCampaignName = formData.get("campaign-name") as string;
  const newCampaignType = formData.get("campaign-type") as string;
  console.log("Campaign Type: ", newCampaignType);

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .insert({
      title: newCampaignName,
      workspace: workspaceId,
    })
    .select()
    .single();

  if (campaignError) {
    return json(
      { campaignData: null, error: campaignError.message },
      { headers },
    );
  }

  //ADD CAMPAIGN DETAILS
  const { error: detailsError } = await supabaseClient
    .from("live_campaign")
    .insert({ campaign_id: campaignData.id, workspace: workspaceId });

  if (detailsError) {
    return json(
      { campaignData: campaignData, error: detailsError.error },
      { headers },
    );
  }

  return redirect(
    `/workspaces/${workspaceId}/campaigns/${campaignData.id}/settings`,
  );
}
