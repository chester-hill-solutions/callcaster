import { Campaign } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const result = await requireWorkspaceLoaderContext(request, params.id);
  if (!result.ok) return result.response;
  const { supabaseClient, headers, workspaceId } = result.ctx;

  // Fetch archived campaigns
  const { data: archivedCampaigns, error } = await supabaseClient
    .from("campaign")
    .select("*")
    .eq("workspace", workspaceId)
    .eq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Error fetching archived campaigns:", error);
  }

  return routeData(
    { archivedCampaigns: archivedCampaigns || [] },
    { headers }
  );
}
