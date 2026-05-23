import { data as routeData, type LoaderFunctionArgs, useLoaderData, useSubmit, useNavigate } from "react-router";
import { User , SurveyFormData, SurveyQuestionType, SurveyPageFormData, SurveyQuestionFormData, QuestionOptionFormData } from "@/lib/types";
import { Plus, Trash2, Save } from "lucide-react";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getUserRole } from "@/lib/database.server";
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

  if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return routeData({
    workspaceId,
    user,
    userRole,
  });
}
