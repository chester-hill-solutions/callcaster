import { json, type ActionFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "~/lib/supabase.server";
import { getUserRole } from "~/lib/database.server";
import { User } from "~/lib/types";

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  
  if (request.method === "POST") {
    return handleCreateSurvey(request, supabaseClient, user);
  } else if (request.method === "PATCH") {
    return handleUpdateSurvey(request, supabaseClient, user);
  } else if (request.method === "DELETE") {
    return handleDeleteSurvey(request, supabaseClient, user);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleCreateSurvey(request: Request, supabaseClient: any, user: any) {
  try {
    const formData = await request.formData();
    const surveyData = JSON.parse(formData.get("surveyData") as string);
    const workspaceId = formData.get("workspaceId") as string;

    if (!workspaceId) {
      return json({ error: "Workspace ID is required" }, { status: 400 });
    }

    // Check user role
    const userRole = await getUserRole({ 
      supabaseClient, 
      user: user as unknown as User, 
      workspaceId 
    });

    if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
      return json({ error: "Unauthorized" }, { status: 403 });
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
      console.error("Error creating survey:", surveyError);
      return json({ error: "Failed to create survey" }, { status: 500 });
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
          console.error("Error creating page:", pageError);
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
              console.error("Error creating question:", questionError);
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

    return json({ success: true, survey });
  } catch (error) {
    console.error("Error in handleCreateSurvey:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleUpdateSurvey(request: Request, supabaseClient: any, user: any) {
  try {
    const formData = await request.formData();
    const surveyData = JSON.parse(formData.get("surveyData") as string);
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId) {
      return json({ error: "Survey ID is required" }, { status: 400 });
    }

    // Get survey to check workspace
    const { data: existingSurvey, error: fetchError } = await supabaseClient
      .from("survey")
      .select("workspace")
      .eq("survey_id", surveyId)
      .single();

    if (fetchError || !existingSurvey) {
      return json({ error: "Survey not found" }, { status: 404 });
    }

    // Check user role
    const userRole = await getUserRole({ 
      supabaseClient, 
      user: user as unknown as User, 
      workspaceId: existingSurvey.workspace 
    });

    if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
      return json({ error: "Unauthorized" }, { status: 403 });
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
      console.error("Error updating survey:", surveyError);
      return json({ error: "Failed to update survey" }, { status: 500 });
    }

    return json({ success: true, survey });
  } catch (error) {
    console.error("Error in handleUpdateSurvey:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleDeleteSurvey(request: Request, supabaseClient: any, user: any) {
  try {
    const formData = await request.formData();
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId) {
      return json({ error: "Survey ID is required" }, { status: 400 });
    }

    // Get survey to check workspace
    const { data: existingSurvey, error: fetchError } = await supabaseClient
      .from("survey")
      .select("workspace")
      .eq("survey_id", surveyId)
      .single();

    if (fetchError || !existingSurvey) {
      return json({ error: "Survey not found" }, { status: 404 });
    }

    // Check user role
    const userRole = await getUserRole({ 
      supabaseClient, 
      user: user as unknown as User, 
      workspaceId: existingSurvey.workspace 
    });

    if (!userRole || !["owner", "admin"].includes(userRole.role)) {
      return json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete survey (cascade will handle related records)
    const { error: deleteError } = await supabaseClient
      .from("survey")
      .delete()
      .eq("survey_id", surveyId);

    if (deleteError) {
      console.error("Error deleting survey:", deleteError);
      return json({ error: "Failed to delete survey" }, { status: 500 });
    }

    return json({ success: true });
  } catch (error) {
    console.error("Error in handleDeleteSurvey:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 