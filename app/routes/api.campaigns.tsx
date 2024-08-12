import { json } from "@remix-run/node";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import {
  updateCampaign,
  updateCampaignScript,
  updateOrCopyScript,
} from "~/lib/database.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient: supabase, serverSession } =
    await getSupabaseServerClientWithSession(request);
  const data = await request.json();
  const saveAsCopy = request.method === "POST";
  const { campaignData, campaignDetails, scriptData } = data;
  delete campaignData?.audiences;
  try {
      const updatedScript = scriptData ? await updateOrCopyScript({
        supabase,
        scriptData,
        saveAsCopy,
        campaignData,
        created_by: serverSession.user.id,
        created_at: new Date()
      }) : {};
    if (
      scriptData && campaignData.type === "live_call" ||
      ["robocall", "simple_ivr", "complex_ivr"].includes(campaignData.type) || !campaignData.type
    ) {
      campaignDetails.script_id = updatedScript.id;
      delete campaignDetails.disposition_options
    }
    const { campaign, campaignDetails: updatedCampaignDetails } =
      await updateCampaign({ supabase, campaignData, campaignDetails });
    if (
      campaignData.type === "live_call" ||
      ["robocall", "simple_ivr", "complex_ivr"].includes(campaignData.type)
      || !campaignData.type
    ) {
      await updateCampaignScript({
        supabase,
        campaignId: campaign.id,
        scriptId: updatedScript.id,
        campaignType: campaignData.type,
      });

      return json({
        campaign,
        campaignDetails: updatedCampaignDetails,
        script: updatedScript,
      });
    }
  } catch (error) {
    console.error("Error updating campaign:", error);
    return json({ error: (error as Error).message }, { status: 500 });
  }
};
