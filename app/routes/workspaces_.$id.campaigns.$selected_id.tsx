import { json, redirect } from "@remix-run/node";
import {
  NavLink,
  Outlet,
  useLoaderData,
  useNavigate,
  useNavigation,
  useOutlet,
  useOutletContext,
  useSubmit,
} from "@remix-run/react";
import { useMemo } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { Button } from "~/components/ui/button";

const formatTime = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

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
  const { data: outcomes, error: outcomeError } = await supabaseClient
    .from("outreach_attempt")
    .select(`*, call(*)`)
    .eq("campaign_id", selected_id);

  const { data: queue, error: queueError } = await supabaseClient
    .from("campaign_queue")
    .select(`*, contact(*)`)
    .eq("campaign_id", selected_id);

  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspace_id);

  return json({
    workspace_id,
    selected_id,
    data,
    selected,
    mediaData,
    outcomes,
    queue,
  });
};

export default function CampaignScreen() {
  const { audiences } = useOutletContext();
  const { data = [], outcomes, queue } = useLoaderData();
  const navigate = useNavigate();
  const nav = useNavigation();
  const outlet = useOutlet();

  const outcomeKeys = outcomes.reduce((acc, outcome) => {
    Object.keys(outcome?.result).forEach((key) => {
      if (!acc.includes(key)) {
        acc.push(key);
      }
    });
    return acc;
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="my-4 mt-2 flex justify-between px-2">
        <div className="flex gap-2">
          <Button asChild>
            <NavLink
              className="text-xl font-semibold uppercase"
              style={({ isActive, isPending }) => ({
                background: isActive ? "black" : "white",
                color: "blue",
              })}
              to="."
              end
            >
              CAMPAIGN
            </NavLink>
          </Button>
          <Button
            className="text-xl font-semibold uppercase"
            onClick={() => navigate("script")}
            disabled={nav.state !== "idle"}
          >
            Script
          </Button>
          <Button
            className="text-xl font-semibold uppercase"
            onClick={() => navigate("settings")}
            disabled={nav.state !== "idle"}
          >
            Settings
          </Button>
        </div>
        <Button
          className="text-xl font-semibold uppercase"
          onClick={() => navigate(`${(data[0].dial_type || 'call')}`)}
          disabled={nav.state !== "idle"}
        >
          Join Campaign
        </Button>
      </div>
      <div className="pb-4">
        <Outlet context={{ audiences }} />
        {!outlet && outcomes.length > 0 ? (
          <div className="p-4">
            <div>
              {outcomes.length} of {queue?.length} calls
            </div>
            <div>Other statistics</div>
          </div>
        ) : !outlet &&(
          <div className="p-4">Let's make some calls!</div>
        )}
      </div>
    </div>
  );
}
