import { defer, json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo, useState } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { fetchAdvancedCampaignDetails, fetchCampaignWithAudience, getWorkspacePhoneNumbers, listMedia } from "~/lib/database.server";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id } = params;

  const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) return redirect("/signin");

  try {
    const [campaignData, phoneNumbers, { data: mediaData }] = await Promise.all([
      fetchCampaignWithAudience(supabaseClient, selected_id),
      getWorkspacePhoneNumbers({ supabaseClient, workspaceId: workspace_id }),
      supabaseClient.storage.from("workspaceAudio").list(workspace_id)
    ]);
    const campaignDetails = await fetchAdvancedCampaignDetails(supabaseClient, selected_id, campaignData.type, workspace_id);

    let mediaNames = null;
    if (campaignData.type === "live_call" || campaignData.type === null) {
      mediaNames = await listMedia(supabaseClient, workspace_id);
    }

    return json({
      workspace_id,
      selected_id,
      data: campaignData,
      mediaData,
      phoneNumbers,
      campaignDetails,
      mediaNames
    });

  } catch (error) {
    console.error("Error in campaign loader:", error);
    throw new Response("Error loading campaign data", { status: 500 });
  }
};

export default function Audience() {
  const { audiences } = useOutletContext();
  const {
    workspace_id,
    selected_id,
    data,
    mediaData,
    phoneNumbers,
    campaignDetails
  } = useLoaderData();
  const [pageData, setPageData] = useState(data);
  return (
    <>
      <CampaignSettings
        workspace={workspace_id}
        data={pageData}
        audiences={audiences}
        mediaData={mediaData}
        campaign_id={selected_id}
        phoneNumbers={phoneNumbers}
        campaignDetails={campaignDetails}
        onPageDataChange={setPageData}
      />
    </>
  );
}
