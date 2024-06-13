import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo, useState } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { Button } from "~/components/ui/button";

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
  const { audiences } = useOutletContext();
  const { workspace_id, selected_id, data = [], mediaData } = useLoaderData();
  const pageData = useMemo(() => data, [data]);
  const [isChanged, setChanged] = useState(true);

  return (
    <div>
      <div className="flex h-[80vh] w-full flex-auto overflow-scroll border-2 border-l-0 border-solid border-slate-800">
        <div className="flex flex-auto flex-col">
          <CampaignSettings
            isChanged={isChanged}
            setChanged={setChanged}
            workspace={workspace_id}
            data={pageData}
            audiences={audiences}
            mediaData={mediaData}
            campaign_id={selected_id}
          />
        </div>
      </div>
      {true && (
        <div className="flex" style={{ justifyContent: "space-between" }}>
          <div>You have active changes.</div>
          <div>
            <Button onClick={() => null}>SAVE</Button>
          </div>
        </div>
      )}
    </div>
  );
}
