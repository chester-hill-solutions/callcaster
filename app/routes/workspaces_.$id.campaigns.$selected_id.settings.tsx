import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { getWorkspacePhoneNumbers } from "~/lib/database.server";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { data: mtmData, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `*,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id);
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({
      supabaseClient,
      workspaceId: workspace_id,
    });
  let data = [...mtmData];
  if (data.length > 0 && data[0].type === "live_call") {
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("live_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);
    data = data.map((item) => ({
      ...item,
      campaignDetails,
    }));
  }
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspace_id);

  return json({
    workspace_id,
    selected_id,
    data,
    selected,
    mediaData,
    phoneNumbers,
  });
};

export default function Audience() {
  const { audiences } = useOutletContext();
  const {
    workspace_id,
    selected_id,
    data = [],
    mediaData,
    phoneNumbers,
  } = useLoaderData();
  const pageData = useMemo(() => data, [data]);
  return (
    <>

      <CampaignSettings
        workspace={workspace_id}
        data={pageData}
        audiences={audiences}
        mediaData={mediaData}
        campaign_id={selected_id}
        phoneNumbers={phoneNumbers}
      />
    </>
  );
}
