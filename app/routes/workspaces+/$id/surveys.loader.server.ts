import { data as routeData, type LoaderFunctionArgs, useLoaderData, Link } from "react-router";
import { Survey, User } from "@/lib/types";
import { Plus, Calendar, Users, CheckCircle, XCircle } from "lucide-react";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {



  const { supabaseClient, user } = await verifyAuth(request);
  const workspaceId = params.id;

  if (!workspaceId) {
    throw new Response("Workspace ID is required", { status: 400 });
  }

  // Get user role for this workspace
  const userRole = await getUserRole({ 
    supabaseClient, 
    user: user as unknown as User, 
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
