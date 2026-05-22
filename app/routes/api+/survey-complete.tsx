import { data as routeData, type ActionFunctionArgs } from "react-router";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function action({ request }: ActionFunctionArgs) {  const { logger } = await import("@/lib/logger.server");
  const { createSupabaseServerClient } = await import("@/lib/supabase.server");

  const { supabaseClient } = createSupabaseServerClient(request);
  
  if (request.method === "POST") {
    return handleCompleteSurvey(request, supabaseClient);
  }

  return routeData({ error: "Method not allowed" }, { status: 405 });
}

async function handleCompleteSurvey(
  request: Request,
  supabaseClient: SupabaseClient<Database>
) {
  try {
    const formData = await request.formData();
    const resultId = formData.get("resultId") as string;
    const surveyId = formData.get("surveyId") as string;
    const completed = formData.get("completed") as string;

    if (!resultId || !surveyId) {
      return routeData({ error: "Missing required fields" }, { status: 400 });
    }

    // Get survey to verify it exists and is active
    const { data: survey, error: surveyError } = await supabaseClient
      .from("survey")
      .select("id, is_active")
      .eq("survey_id", surveyId)
      .single();

    if (surveyError || !survey) {
      return routeData({ error: "Survey not found" }, { status: 404 });
    }

    if (!survey.is_active) {
      return routeData({ error: "Survey is not active" }, { status: 400 });
    }

    // Update survey response to mark as completed
    const { error: updateError } = await supabaseClient
      .from("survey_response")
      .update({
        completed_at: completed === "true" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("result_id", resultId);

    if (updateError) {
      logger.error("Error completing survey:", updateError);
      return routeData({ error: "Failed to complete survey" }, { status: 500 });
    }

    return routeData({ 
      success: true, 
      result_id: resultId 
    });
  } catch (error) {
    logger.error("Error in handleCompleteSurvey:", error);
    return routeData({ error: "Internal server error" }, { status: 500 });
  }
} 