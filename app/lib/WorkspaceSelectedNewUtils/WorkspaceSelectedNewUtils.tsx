import { json } from "@remix-run/node";
import { redirect } from "react-router";

export async function handleNewAudience({
  supabaseClient,
  formData,
  workspaceId,
  headers,
}) {
  const newAudienceName = formData.get("audience-name") as string;
  // const campaignId = formData.get("campaign-select") as string;

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
    return json(
      {
        audienceData: null,
        // campaignAudienceData: null,
        error: createAudienceError,
      },
      { headers },
    );
  }

  return redirect(`/workspaces/${workspaceId}/audiences`);
}

export async function handleNewCampaign({
  supabaseClient,
  formData,
  workspaceId,
  headers,
}) {
  const newCampaignName = formData.get("campaign-name") as string;
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

  return redirect(`/workspaces/${workspaceId}/campaigns`);
}
