import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo, useState } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { getMedia, getRecordingFileNames, getSignedUrls, getWorkspacePhoneNumbers, listMedia } from "~/lib/database.server";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { data: campaignData, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `*,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id)
    .single();
    
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({
      supabaseClient,
      workspaceId: workspace_id,
    });

  let campaignDetails, mediaNames;

  switch (campaignData.type) {
    case "live_call":
    case null:
      ({ data: campaignDetails } = await supabaseClient
        .from("live_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", selected_id)
        .single());
      mediaNames = await listMedia(supabaseClient, workspace_id);
      break;

    case "message":
      ({ data: campaignDetails } = await supabaseClient
        .from("message_campaign")
        .select()
        .eq("campaign_id", selected_id)
        .single());
      if (campaignDetails?.message_media?.length > 0) {
        campaignDetails.mediaLinks = await getSignedUrls(
          supabaseClient,
          workspace_id,
          campaignDetails.message_media,
        );
      }
      break;

    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      ({ data: campaignDetails } = await supabaseClient
        .from("ivr_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", selected_id)
        .single());
      break;

    default:
      throw new Response("Invalid campaign type", { status: 400 });
  }
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspace_id);

  return json({
    workspace_id,
    selected_id,
    data: campaignData,
    selected,
    mediaData,
    campaignDetails,
    phoneNumbers,
  });
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
