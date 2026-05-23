import type { User, Survey, SurveyResponse, ResponseAnswer, Contact } from "@/lib/types";
import type { Tables } from "@/lib/database.types";
import { data as routeData, type LoaderFunctionArgs, useLoaderData, useFetcher, Link } from "react-router";
import {
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Download,
  Eye,
  Clock,
} from "lucide-react";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

type SurveyPageWithQuestions = {
  survey_question?: Array<{
    id: number;
    question_id: string;
    question_text: string;
    question_type: string;
  }>;
};

type SurveyWithPages = Tables<"survey"> & {
  survey_page?: SurveyPageWithQuestions[];
};

type ResponseAnswerWithQuestion = ResponseAnswer & {
  survey_question?: {
    question_id: string;
    question_text: string;
    question_type: string;
    question_option?: Array<{ option_label: string }>;
  };
};

export async function loader({ request, params }: LoaderFunctionArgs) {



  const { supabaseClient, user } = await verifyAuth(request);
  const { id: workspaceId, surveyId } = params;

  if (!workspaceId || !surveyId) {
    throw new Response("Workspace ID and Survey ID are required", {
      status: 400,
    });
  }

  // Get user role for this workspace
  const userRole = await getUserRole({
    supabaseClient,
    user: user as unknown as User,
    workspaceId,
  });

  if (!userRole) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Get survey with questions
  const { data: survey, error: surveyError } = await supabaseClient
    .from("survey")
    .select(
      `
      *,
      survey_page(
        survey_question(
          id,
          question_id,
          question_text,
          question_type
        )
      )
    `,
    )
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

  if (surveyError || !survey) {
    throw new Response("Survey not found", { status: 404 });
  }

  // Get all responses with contact info
  const { data: responses, error: responsesError } = await supabaseClient
    .from("survey_response")
    .select(
      `
      *,
      contact(firstname, surname, phone, email),
      response_answer(
        *,
        survey_question(
          question_id,
          question_text,
          question_type,
          question_option(option_label)
        )
      )
    `,
    )
    .eq("survey_id", survey.id)
    .order("created_at", { ascending: false });

  if (responsesError) {
    logger.error("Error fetching responses:", responsesError);
  }

  // Get response statistics
  const totalResponses = responses?.length || 0;
  const completedResponses =
    responses?.filter((r) => r.completed_at)?.length || 0;
  const inProgressResponses = totalResponses - completedResponses;

  return routeData({
    survey,
    responses: responses || [],
    workspaceId,
    user,
    userRole,
    stats: {
      total: totalResponses,
      completed: completedResponses,
      inProgress: inProgressResponses,
      completionRate:
        totalResponses > 0 ? (completedResponses / totalResponses) * 100 : 0,
    },
  });
}
