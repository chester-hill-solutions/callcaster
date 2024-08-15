import { json } from "@remix-run/node";
import { updateCampaign } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const action = async ({ request }) => {
  const { supabaseClient, headers } = await getSupabaseServerClientWithSession(request);

  try {
    const formData = await request.formData();
    const campaignData = JSON.parse(formData.get("campaignData"));
    const campaignDetails = JSON.parse(formData.get("campaignDetails"));
    const { campaign, campaignDetails: updatedCampaignDetails, audienceChanges } =
      await updateCampaign({ supabase: supabaseClient, campaignData, campaignDetails });
    
    return json({ campaign, campaignDetails: updatedCampaignDetails, audienceChanges }, { headers });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return json({ error: error.message }, { status: 400, headers });
  }
};