import { json, type ActionFunctionArgs } from "@remix-run/node";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient } = createSupabaseServerClient(request);
  
  if (request.method === "POST") {
    return handleSaveAnswer(request, supabaseClient);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleSaveAnswer(
  request: Request,
  supabaseClient: SupabaseClient<Database>
) {
  try {
    type SurveyResponseRow = Database["public"]["Tables"]["survey_response"]["Row"];
    const formData = await request.formData();
    const surveyId = formData.get("surveyId") as string;
    const questionId = formData.get("questionId") as string;
    const answerValue = formData.get("answerValue") as string;
    const contactId = formData.get("contactId") as string;
    const resultId = formData.get("resultId") as string;
    const pageId = formData.get("pageId") as string;

    if (!surveyId || !questionId || !resultId || !pageId) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }
    
    // Get survey to verify it exists and is active
    const surveyIdNum = parseInt(surveyId, 10);
    if (isNaN(surveyIdNum)) {
      return json({ error: "Invalid survey ID" }, { status: 400 });
    }
    
    const { data: survey, error: surveyError } = await supabaseClient
      .from("survey")
      .select("id, is_active")
      .eq("id", surveyIdNum)
      .single();

    if (surveyError || !survey) {
      return json({ error: "Survey not found" }, { status: 404 });
    }

    if (!survey.is_active) {
      return json({ error: "Survey is not active" }, { status: 400 });
    }

    // Get-or-create survey response in an idempotent way (avoid select-then-insert races).
    const contactIdNum = contactId ? parseInt(contactId, 10) : null;
    if (contactIdNum !== null && Number.isNaN(contactIdNum)) {
      return json({ error: "Invalid contact ID" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    let surveyResponse: SurveyResponseRow | null = null;

    const { data: insertedResponse, error: insertError } = await supabaseClient
      .from("survey_response")
      .insert({
        survey_id: survey.id,
        result_id: resultId,
        contact_id: contactIdNum,
        started_at: nowIso,
        last_page_completed: pageId,
      })
      .select()
      .single();

    if (insertError) {
      if (!isUniqueViolation(insertError)) {
        logger.error("Error creating survey response:", insertError);
        return json({ error: "Failed to create survey response" }, { status: 500 });
      }
      // Duplicate result_id: fetch existing row.
      const { data: existingResponse, error: fetchExistingError } =
        await supabaseClient
          .from("survey_response")
          .select("*")
          .eq("result_id", resultId)
          .single();
      if (fetchExistingError || !existingResponse) {
        logger.error("Error fetching existing survey response:", fetchExistingError);
        return json({ error: "Failed to load survey response" }, { status: 500 });
      }
      surveyResponse = existingResponse;
    } else {
      surveyResponse = insertedResponse;
    }

    if (!surveyResponse) {
      logger.error("Missing survey response after insert/fetch");
      return json({ error: "Failed to create survey response" }, { status: 500 });
    }

    // Always update progress fields deterministically.
    const { error: updateError } = await supabaseClient
      .from("survey_response")
      .update({
        last_page_completed: pageId,
        updated_at: nowIso,
      })
      .eq("id", surveyResponse.id);
    if (updateError) {
      logger.error("Error updating survey response:", updateError);
    }

    // Get question ID from question_id
    const { data: question, error: questionError } = await supabaseClient
      .from("survey_question")
      .select("id")
      .eq("question_id", questionId)
      .single();

    if (questionError || !question) {
      logger.error("Question not found:", questionId);
      return json({ error: "Question not found" }, { status: 404 });
    }

    // Insert-first, then update-on-duplicate to avoid race creating duplicate answers.
    const { error: answerInsertError } = await supabaseClient
      .from("response_answer")
      .insert({
        response_id: surveyResponse.id,
        question_id: question.id,
        answer_value: answerValue,
        answered_at: nowIso,
      });

    if (answerInsertError) {
      if (!isUniqueViolation(answerInsertError)) {
        logger.error("Error creating answer:", answerInsertError);
        return json({ error: "Failed to save answer" }, { status: 500 });
      }
      const { error: updateError } = await supabaseClient
        .from("response_answer")
        .update({
          answer_value: answerValue,
          answered_at: nowIso,
        })
        .eq("response_id", surveyResponse.id)
        .eq("question_id", question.id);
      if (updateError) {
        logger.error("Error updating answer:", updateError);
        return json({ error: "Failed to update answer" }, { status: 500 });
      }
    }

    return json({ 
      success: true, 
      response_id: surveyResponse.id,
      result_id: resultId 
    });
  } catch (error) {
    logger.error("Error in handleSaveAnswer:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 