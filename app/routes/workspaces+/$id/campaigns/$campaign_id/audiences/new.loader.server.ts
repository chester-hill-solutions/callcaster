import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data as routeData, Form, Link, useActionData, useLoaderData } from "react-router";
import { MdAdd, MdClose } from "react-icons/md";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { handleNewAudience } from "@/lib/workspace-selector/WorkspaceSelectedNewUtils.server";

export async function loader({ request, params }: LoaderFunctionArgs) {


  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  const campaignId = params.campaign_id;

  if (workspaceId == null || campaignId == null) {
    return routeData(
      {
        campaign: null,
        error:
          workspaceId == null ? "Workspace not found" : "Campaign not found",
      },
      { headers },
    );
  }

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select()
    .eq("id", parseInt(campaignId))
    .eq("workspace", workspaceId)
    .single();

  if (campaignError) {
    return routeData({ campaign: null, error: campaignError }, { headers });
  }

  return routeData({ campaign: campaignData, error: null }, { headers });
}
