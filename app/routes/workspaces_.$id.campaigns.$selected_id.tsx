import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useNavigation, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo } from "react";
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
  const navigate = useNavigate();
  const nav = useNavigation();
  return (
    <div className="flex h-full flex-col">
      <div className="mt-2 flex justify-between px-2">
        <div className="flex gap-2">
          <Button
            className="text-xl font-semibold uppercase"
            onClick={() => navigate("script")}
            disabled={nav.state !== 'idle'}
          >
            Script
          </Button>
          <Button
            className="text-xl font-semibold uppercase"
            onClick={() => navigate("settings")}
            disabled={nav.state !== 'idle'}
          >
            Settings
          </Button>
        </div>
        <Button
          className="text-xl font-semibold uppercase"
          onClick={() => navigate(`${campaignDetails.dial_type}`)}
          disabled={nav.state !== 'idle'}
        >
          Join Campaign
        </Button>
      </div>
      <div className="flex flex-auto content-center justify-center">
        <h1 className=" font-Zilla-Slab text-4xl">Campaign results.</h1>
      </div>
      <Outlet context={{audiences}}/>
    </div>
  );
}
