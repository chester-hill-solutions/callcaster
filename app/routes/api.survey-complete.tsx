import { json, type ActionFunctionArgs } from "@remix-run/node";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient } = createSupabaseServerClient(request);
  
  if (request.method === "POST") {
    return handleCompleteSurvey(request, supabaseClient);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
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
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get survey to verify it exists and is active
    const { data: survey, error: surveyError } = await supabaseClient
      .from("survey")
      .select("id, is_active")
      .eq("survey_id", surveyId)
      .single();

    if (surveyError || !survey) {
      return json({ error: "Survey not found" }, { status: 404 });
    }

    if (!survey.is_active) {
      return json({ error: "Survey is not active" }, { status: 400 });
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
      return json({ error: "Failed to complete survey" }, { status: 500 });
    }

    return json({ 
      success: true, 
      result_id: resultId 
    });
  } catch (error) {
    logger.error("Error in handleCompleteSurvey:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 