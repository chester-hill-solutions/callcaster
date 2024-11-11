import { json } from "@remix-run/node";
import { createCampaign, deleteCampaign, updateCampaign } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers } = await getSupabaseServerClientWithSession(request);
  
  try {
    const formData = await request.formData();
    if (request.method === "PATCH") {
      const campaignData = JSON.parse(formData.get("campaignData") as string);
      const campaignDetails = JSON.parse(formData.get("campaignDetails") as string);
      const { campaign, campaignDetails: updatedCampaignDetails, audienceChanges } =
        await updateCampaign({ supabase: supabaseClient, campaignData, campaignDetails });

      return json({ campaign, campaignDetails: updatedCampaignDetails, audienceChanges }, { headers });
    } else if (request.method === "DELETE") {
      const campaignId = formData.get("campaignId") as string;
      await deleteCampaign({ supabase: supabaseClient, campaignId });
      return json({ success: true }, { headers });
    } else if (request.method === "POST") {
      const campaignData = JSON.parse(formData.get("campaignData") as string);
      const campaignDetails = JSON.parse(formData.get("campaignDetails") as string);  
      const { campaign, campaignDetails: createdCampaignDetails } = await createCampaign({ supabase: supabaseClient, campaignData, campaignDetails });
      return json({ campaign, campaignDetails: createdCampaignDetails }, { headers });
    } 
  } catch (error) {
    console.error("Error updating campaign:", error);
    return json({ error: error instanceof Error ? error.message : "An unknown error occurred" }, { status: 400, headers });
  }
};
