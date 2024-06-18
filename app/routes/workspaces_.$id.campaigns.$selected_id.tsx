import { json, redirect } from "@remix-run/node";
import {
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
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
import { getUserRole } from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";
import { campaignTypeText } from "~/lib/utils";

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

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const hasAccess =
    userRole === MemberRole.Owner || userRole === MemberRole.Admin;

  return json({
    workspace_id,
    selected_id,
    data,
    selected,
    mediaData,
    outcomes,
    queue,
    hasAccess,
  });
};

function handleNavlinkStyles(isActive: boolean, isPending: boolean): string {
  if (isActive) {
    return "rounded-md border-2 border-brand-secondary bg-brand-secondary px-2 py-1 font-Zilla-Slab text-xl font-semibold text-black transition-colors duration-150 ease-in-out dark:text-black";
  }

  if (isPending) {
    return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-xl font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
  }

  return "rounded-md border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-xl font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
}

export default function CampaignScreen() {
  const { audiences } = useOutletContext();
  const {
    workspace_id,
    selected_id,
    data = [],
    mediaData,
    hasAccess,
    outcomes,
    queue,
  } = useLoaderData<typeof loader>();
  const outcomeKeys = outcomes.reduce((acc, outcome) => {
    Object.keys(outcome?.result).forEach((key) => {
      if (!acc.includes(key)) {
        acc.push(key);
      }
    });
    return acc;
  }, []);

  const pageData = useMemo(() => data, [data]);
  const navigate = useNavigate();
  const nav = useNavigation();
  const outlet = useOutlet();

  const route = useLocation().pathname.split("/");
  const isCampaignParentRoute = !Number.isNaN(parseInt(route.at(-1)));

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b-2 border-zinc-300 p-4">
        <div className="flex gap-2">
          <NavLink
            className={({ isActive, isPending }) =>
              handleNavlinkStyles(isActive, isPending)
            }
            to="."
            relative="path"
            end
          >
            Dashboard
          </NavLink>
          <NavLink
            className={({ isActive, isPending }) =>
              handleNavlinkStyles(isActive, isPending)
            }
            to="script"
            relative="path"
          >
            Script
          </NavLink>

          {hasAccess && (
            <NavLink
              className={({ isActive, isPending }) =>
                handleNavlinkStyles(isActive, isPending)
              }
              to="settings"
              relative="path"
            >
              Settings
            </NavLink>
          )}
        </div>
        <div className="flex items-center gap-2">
          <h3 className="font-Zilla-Slab text-3xl font-semibold">
            {data[0].title}
          </h3>
          <p className="flex h-full items-center justify-center rounded-sm bg-zinc-300 px-2 py-1 font-semibold dark:bg-zinc-500 dark:text-white">
            {campaignTypeText(data[0].type)}
          </p>
        </div>
        <NavLink
          className={({ isActive, isPending }) =>
            handleNavlinkStyles(isActive, isPending)
          }
          to={`${data[0].dial_type}`}
          relative="path"
        >
          Join Campaign
        </NavLink>
      </div>
      {isCampaignParentRoute && (
        <div className="flex flex-auto items-center justify-center">
          <h1 className="font-Zilla-Slab text-4xl text-gray-400">
            Your Campaign Results Will Show Here
          </h1>
        </div>
      )}
      <Outlet context={{ audiences }} />
    </div>
  );
}
