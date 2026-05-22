// @ts-nocheck
import { data as routeData, type ActionFunctionArgs } from "react-router";

import { SurveyFormData } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";


export async function action({ request }: ActionFunctionArgs) {  const { getUserRole } = await import("@/lib/database.server");
  const { createErrorResponse, AppError, ErrorCode, handleDatabaseError } = await import("@/lib/errors.server");
  const { logger } = await import("@/lib/logger.server");
  const { verifyAuth } = await import("@/lib/supabase.server");

  try {
    const { supabaseClient, user } = await verifyAuth(request);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (request.method === "POST") {
      return await handleCreateSurvey(request, supabaseClient, user);
    } else if (request.method === "PATCH") {
      return await handleUpdateSurvey(request, supabaseClient, user);
    } else if (request.method === "DELETE") {
      return await handleDeleteSurvey(request, supabaseClient, user);
    }

    throw new AppError("Method not allowed", 405, ErrorCode.INVALID_OPERATION);
  } catch (error) {
    return createErrorResponse(error, "Failed to process survey request");
  }
}

async function handleCreateSurvey(
  request: Request,
  supabaseClient: SupabaseClient<Database>,
  user: { id: string }
) {
  const { logger } = await import("@/lib/logger.server");
  const { getUserRole } = await import("@/lib/database.server");
  const { handleDatabaseError } = await import("@/lib/errors.server");
  const formData = await request.formData();
  const surveyDataRaw = formData.get("surveyData") as string | null;
  if (!surveyDataRaw) {
    return routeData({ error: "Survey data is required" }, { status: 400 });
  }
  let surveyData: SurveyFormData;
  try {
    surveyData = JSON.parse(surveyDataRaw) as SurveyFormData;
  } catch {
    return routeData({ error: "Invalid survey data format" }, { status: 400 });
  }
  const workspaceId = formData.get("workspaceId") as string;

  if (!workspaceId) {
    return routeData({ error: "Workspace ID is required" }, { status: 400 });
  }

  // Check user role - convert Supabase Auth User to database User type
  const { data: dbUser, error: dbUserError } = await supabaseClient
    .from("user")
    .select("*")
    .eq("id", user.id)
    .single();
  
  if (dbUserError || !dbUser) {
    return routeData({ error: "User not found" }, { status: 404 });
  }
  
  const userRole = await getUserRole({ 
    supabaseClient, 
    user: dbUser, 
    workspaceId 
  });

  if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
    return routeData({ error: "Unauthorized" }, { status: 403 });
  }

  // Create survey
  const { data: survey, error: surveyError } = await supabaseClient
    .from("survey")
    .insert({
      survey_id: surveyData.survey_id,
      title: surveyData.title,
      workspace: workspaceId,
      is_active: surveyData.is_active || false,
    })
    .select()
    .single();

  if (surveyError) {
    handleDatabaseError(surveyError, "Error creating survey");
  }

  // Create pages and questions
  if (surveyData.pages && surveyData.pages.length > 0) {
    for (const page of surveyData.pages) {
      // Create page
      const { data: surveyPage, error: pageError } = await supabaseClient
        .from("survey_page")
        .insert({
          survey_id: survey.id,
          page_id: page.page_id,
          title: page.title,
          page_order: page.page_order,
        })
        .select()
        .single();

      if (pageError) {
        logger.error("Error creating page:", pageError);
        continue;
      }

      // Create questions for this page
      if (page.questions && page.questions.length > 0) {
        for (const question of page.questions) {
          // Create question
          const { data: surveyQuestion, error: questionError } = await supabaseClient
            .from("survey_question")
            .insert({
              page_id: surveyPage.id,
              question_id: question.question_id,
              question_text: question.question_text,
              question_type: question.question_type,
              is_required: question.is_required,
              question_order: question.question_order,
            })
            .select()
            .single();

          if (questionError) {
            logger.error("Error creating question:", questionError);
            continue;
          }

          // Create options for this question
          if (question.options && question.options.length > 0) {
            for (const option of question.options) {
              await supabaseClient
                .from("question_option")
                .insert({
                  question_id: surveyQuestion.id,
                  option_value: option.option_value,
                  option_label: option.option_label,
                  option_order: option.option_order,
                });
            }
          }
        }
      }
    }
  }

  return routeData({ success: true, survey });
}

async function handleUpdateSurvey(
  request: Request,
  supabaseClient: SupabaseClient<Database>,
  user: { id: string }
) {
  const { logger } = await import("@/lib/logger.server");
  const { getUserRole } = await import("@/lib/database.server");
  try {
    const formData = await request.formData();
    const surveyDataRaw = formData.get("surveyData") as string | null;
    if (!surveyDataRaw) {
      return routeData({ error: "Survey data is required" }, { status: 400 });
    }
    let surveyData: SurveyFormData;
    try {
      surveyData = JSON.parse(surveyDataRaw) as SurveyFormData;
    } catch {
      return routeData({ error: "Invalid survey data format" }, { status: 400 });
    }
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId) {
      return routeData({ error: "Survey ID is required" }, { status: 400 });
    }

    // Get survey to check workspace
    const { data: existingSurvey, error: fetchError } = await supabaseClient
      .from("survey")
      .select("workspace")
      .eq("survey_id", surveyId)
      .single();

    if (fetchError || !existingSurvey) {
      return routeData({ error: "Survey not found" }, { status: 404 });
    }

    // Check user role
    const userRole = await getUserRole({ 
      supabaseClient, 
      user, 
      workspaceId: existingSurvey.workspace 
    });

    if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
      return routeData({ error: "Unauthorized" }, { status: 403 });
    }

    // Update survey
    const { data: survey, error: surveyError } = await supabaseClient
      .from("survey")
      .update({
        title: surveyData.title,
        is_active: surveyData.is_active,
      })
      .eq("survey_id", surveyId)
      .select()
      .single();

    if (surveyError) {
      logger.error("Error updating survey:", surveyError);
      return routeData({ error: "Failed to update survey" }, { status: 500 });
    }

    return routeData({ success: true, survey });
  } catch (error) {
    logger.error("Error in handleUpdateSurvey:", error);
    return routeData({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleDeleteSurvey(
  request: Request,
  supabaseClient: SupabaseClient<Database>,
  user: { id: string }
) {
  const { logger } = await import("@/lib/logger.server");
  const { getUserRole } = await import("@/lib/database.server");
  try {
    const formData = await request.formData();
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId) {
      return routeData({ error: "Survey ID is required" }, { status: 400 });
    }

    // Get survey to check workspace
    const { data: existingSurvey, error: fetchError } = await supabaseClient
      .from("survey")
      .select("workspace")
      .eq("survey_id", surveyId)
      .single();

    if (fetchError || !existingSurvey) {
      return routeData({ error: "Survey not found" }, { status: 404 });
    }

    // Check user role
    const userRole = await getUserRole({ 
      supabaseClient, 
      user, 
      workspaceId: existingSurvey.workspace 
    });

    if (!userRole || !["owner", "admin"].includes(userRole.role)) {
      return routeData({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete survey (cascade will handle related records)
    const { error: deleteError } = await supabaseClient
      .from("survey")
      .delete()
      .eq("survey_id", surveyId);

    if (deleteError) {
      logger.error("Error deleting survey:", deleteError);
      return routeData({ error: "Failed to delete survey" }, { status: 500 });
    }

    return routeData({ success: true });
  } catch (error) {
    logger.error("Error in handleDeleteSurvey:", error);
    return routeData({ error: "Internal server error" }, { status: 500 });
  }
} 