import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { Survey, User } from "@/lib/types";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, user } = await verifyAuth(request);
  const workspaceId = params.id;

  if (!workspaceId) {
    throw new Response("Workspace ID is required", { status: 400 });
  }

  // Get user role for this workspace
  const userRole = await getUserRole({ 
    supabaseClient, 
    user: user, 
    workspaceId 
  });

  // Get surveys for this workspace
  const { data: surveys, error } = await supabaseClient
    .from("survey")
    .select(`
      *,
      survey_response(count)
    `)
    .eq("workspace", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Error fetching surveys:", error);
    throw new Response("Failed to load surveys", { status: 500 });
  }

  return routeData({
    surveys: surveys || [],
    workspaceId,
    user,
    userRole,
  });
}
