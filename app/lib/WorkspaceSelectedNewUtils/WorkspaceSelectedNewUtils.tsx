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

  // const {
  //   data: createCampaignAudienceData,
  //   error: createCampaignAudienceError,
  // } = await supabaseClient
  //   .from("campaign_audience")
  //   .insert({
  //     campaign_id: campaignId,
  //     audience_id: createAudienceData.id,
  //   })
  //   .select()
  //   .single();

  // if (createCampaignAudienceError) {
  //   console.log("Failed to create row on campaign_audience");
  //   const { data: deleteNewAudience, error: deleteNewAudienceError } =
  //     await supabaseClient
  //       .from("audience")
  //       .delete()
  //       .eq("id", createAudienceData.id);

  //   if (deleteNewAudienceError != null) {
  //     console.log(
  //       `Deleted New Audience, ${createAudienceData.id}: ${createAudienceData.name}`,
  //     );
  //   }

  //   return json(
  //     {
  //       audienceData: null,
  //       campaignAudienceData: null,
  //       error: createCampaignAudienceError,
  //     },
  //     { headers },
  //   );
  // }

  return redirect("../");
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
    return json({ campaignData: null, error: campaignError.message });
  }

  //ADD CAMPAIGN DETAILS
  const { error: detailsError } = await supabaseClient
    .from("live_campaign")
    .insert({ campaign_id: campaignData.id, workspace: workspaceId });

  if (detailsError) {
    return json({ campaignData: campaignData, error: detailsError.error });
  }

  return redirect("../");
}
