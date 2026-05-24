import { Campaign } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { supabaseClient, user, headers } = await verifyAuth(request);
  
  if (!user) {
    return redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    return redirect("/workspaces", { headers });
  }

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
