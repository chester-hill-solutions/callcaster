import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { User , SurveyFormData, SurveyQuestionType, SurveyPageFormData, SurveyQuestionFormData, QuestionOptionFormData } from "@/lib/types";
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

  if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return routeData({
    workspaceId,
    user,
    userRole,
  });
}
