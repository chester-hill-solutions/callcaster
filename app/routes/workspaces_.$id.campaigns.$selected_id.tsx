import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { AudienceTable } from "../components/AudienceTable";
import { CampaignSettings } from "../components/CampaignSettings";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  if (selected_id === "new") {
    const query = supabaseClient
      .from("campaign")
      .insert({ workspace: workspace_id })
      .select();
    const { data, error } = await query;
    if (error) {
      console.log(error);
      return redirect(`/workspaces/${workspace_id}`);
    }

    const { error: detailsError } = await supabaseClient
      .from("live_campaign")
      .insert({ campaign_id: data[0].id, workspace: workspace_id });
    return redirect(`/workspaces/${workspace_id}/campaign/${data[0].id}`);
  }
  const { data: mtmData, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `*,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id);
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

  return json({ workspace_id, selected_id, data, selected, mediaData });
};

export default function Audience() {
  const { selectedTable, audiences, contacts = [] } = useOutletContext();
  const { workspace_id, selected_id, data = [], mediaData } = useLoaderData();

  const submit = useSubmit();
  const ids = useMemo(() => data.map((row) => row[`contact_id`]), [data]);
  const pageData = useMemo(() => data, [data]);

  return (
    <div className="flex flex-col">
      {selectedTable?.name.toLowerCase() === "campaigns" && (
        <CampaignSettings
          workspace={workspace_id}
          data={pageData}
          audiences={audiences}
          mediaData={mediaData}
          campaign_id={selected_id}
        />
      )}
    </div>
  );
}
