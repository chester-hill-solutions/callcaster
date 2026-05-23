import type { SurveyWithPages } from "@/lib/types";
import { data as routeData, type LoaderFunctionArgs, useLoaderData, Link } from "react-router";
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  XCircle, 
  Edit, 
  Trash2, 
  Copy,
  ExternalLink,
  MessageSquare
} from "lucide-react";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

interface SurveyPage {
  id: number;
  page_id: string;
  title: string;
  page_order: number;
  survey_question?: SurveyQuestion[];
}

interface SurveyQuestion {
  id: number;
  question_id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  question_order: number;
  question_option?: SurveyQuestionOption[];
}

interface SurveyQuestionOption {
  id: number;
  option_value: string;
  option_label: string;
  option_order: number;
}

interface SurveyResponse {
  id: number;
  created_at: string;
  completed_at?: string;
  last_page_completed?: number;
  contact?: {
    firstname?: string;
    surname?: string;
    phone?: string;
  };
}

interface Survey {
  survey_id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  survey_page?: SurveyPage[];
}

export async function loader({ request, params }: LoaderFunctionArgs) {



  const { supabaseClient, user } = await verifyAuth(request);
  const { id: workspaceId, surveyId } = params;

  if (!workspaceId || !surveyId) {
    throw new Response("Workspace ID and Survey ID are required", { status: 400 });
  }

  // Get user role for this workspace
  const userRole = await getUserRole({
    supabaseClient,
    user,
    workspaceId,
  });

  if (!userRole) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Get survey with pages and questions
  const { data: survey, error: surveyError } = await supabaseClient
    .from("survey")
    .select(`
      *,
      survey_page(
        *,
        survey_question(
          *,
          question_option(*)
        )
      ),
      survey_response(count)
    `)
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

  if (surveyError || !survey) {
    throw new Response("Survey not found", { status: 404 });
  }

  // Get recent responses
  const { data: recentResponses, error: responsesError } = await supabaseClient
    .from("survey_response")
    .select(`
      *,
      contact(firstname, surname, phone)
    `)
    .eq("survey_id", survey.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (responsesError) {
    logger.error("Error fetching responses:", responsesError);
  }

  return routeData({
    survey,
    recentResponses: recentResponses || [],
    workspaceId,
    user,
    userRole,
  });
}
