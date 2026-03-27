import { json, type ActionFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
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

type SubmittedSurveyAnswer = {
  question_id: string;
  answer_value: string | string[];
};

type SubmittedSurveyResponse = {
  result_id: string;
  contact_id?: number | null;
  completed?: boolean;
  last_page_completed?: string | null;
  answers?: SubmittedSurveyAnswer[];
};

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient } = await verifyAuth(request);
  
  if (request.method === "POST") {
    return handleSubmitResponse(request, supabaseClient);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleSubmitResponse(
  request: Request,
  supabaseClient: SupabaseClient<Database>
) {
  try {
    const formData = await request.formData();
    const responseDataRaw = formData.get("responseData") as string | null;
    if (!responseDataRaw) {
      return json({ error: "Response data is required" }, { status: 400 });
    }
    let responseData: SubmittedSurveyResponse;
    try {
      responseData = JSON.parse(responseDataRaw) as SubmittedSurveyResponse;
    } catch {
      return json({ error: "Invalid response data format" }, { status: 400 });
    }
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId) {
      return json({ error: "Survey ID and response data are required" }, { status: 400 });
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

    const nowIso = new Date().toISOString();

    // Idempotent create: insert-first, fetch-on-duplicate.
    let surveyResponse: { id: number } | null = null;
    const { data: inserted, error: responseError } = await supabaseClient
      .from("survey_response")
      .insert({
        survey_id: survey.id,
        result_id: responseData.result_id,
        contact_id: responseData.contact_id ?? null,
        started_at: nowIso,
        completed_at: responseData.completed ? nowIso : null,
        last_page_completed: responseData.last_page_completed ?? null,
      })
      .select("id")
      .single();

    if (responseError) {
      if (!isUniqueViolation(responseError)) {
        logger.error("Error creating survey response:", responseError);
        return json({ error: "Failed to submit response" }, { status: 500 });
      }
      const { data: existing, error: existingError } = await supabaseClient
        .from("survey_response")
        .select("id")
        .eq("result_id", responseData.result_id)
        .single();
      if (existingError || !existing) {
        logger.error("Error fetching existing survey response:", existingError);
        return json({ error: "Failed to submit response" }, { status: 500 });
      }
      surveyResponse = existing;
      // Update completion/progress fields deterministically.
      await supabaseClient
        .from("survey_response")
        .update({
          completed_at: responseData.completed ? nowIso : null,
          last_page_completed: responseData.last_page_completed ?? null,
          updated_at: nowIso,
        })
        .eq("id", existing.id);
    } else {
      surveyResponse = inserted;
    }

    // Create response answers
    if (responseData.answers && responseData.answers.length > 0 && surveyResponse) {
      // Get the page ID if last_page_completed is provided
      let pageId: number | null = null;
      if (responseData.last_page_completed) {
        const { data: page } = await supabaseClient
          .from("survey_page")
          .select("id")
          .eq("survey_id", survey.id)
          .eq("page_id", responseData.last_page_completed)
          .single();
        pageId = page?.id || null;
      }

      for (const answer of responseData.answers) {
        // Get question ID from question_id
        // If pageId is available, filter by it; otherwise just match question_id
        let questionQuery = supabaseClient
          .from("survey_question")
          .select("id")
          .eq("question_id", answer.question_id);
        
        if (pageId) {
          questionQuery = questionQuery.eq("page_id", pageId);
        }

        const { data: question, error: questionError } = await questionQuery.single();

        if (questionError || !question) {
          logger.error("Question not found:", answer.question_id);
          continue;
        }

        // Insert-first, update-on-duplicate to avoid duplicate answers under concurrency.
        const answerValue = Array.isArray(answer.answer_value)
          ? JSON.stringify(answer.answer_value)
          : answer.answer_value;
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
            logger.error("Failed to insert response_answer:", answerInsertError);
            continue;
          }
          await supabaseClient
            .from("response_answer")
            .update({ answer_value: answerValue, answered_at: nowIso })
            .eq("response_id", surveyResponse.id)
            .eq("question_id", question.id);
        }
      }
    }

    return json({ 
      success: true, 
      response_id: surveyResponse?.id,
      result_id: responseData.result_id 
    });
  } catch (error) {
    logger.error("Error in handleSubmitResponse:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 