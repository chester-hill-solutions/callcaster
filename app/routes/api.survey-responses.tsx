import { json, type ActionFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "~/lib/supabase.server";

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient } = await verifyAuth(request);
  
  if (request.method === "POST") {
    return handleSubmitResponse(request, supabaseClient);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleSubmitResponse(request: Request, supabaseClient: any) {
  try {
    const formData = await request.formData();
    const responseData = JSON.parse(formData.get("responseData") as string);
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId || !responseData) {
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

    // Create survey response
    const { data: surveyResponse, error: responseError } = await supabaseClient
      .from("survey_response")
      .insert({
        survey_id: survey.id,
        result_id: responseData.result_id,
        contact_id: responseData.contact_id || null,
        started_at: new Date().toISOString(),
        completed_at: responseData.completed ? new Date().toISOString() : null,
        last_page_completed: responseData.last_page_completed || null,
      })
      .select()
      .single();

    if (responseError) {
      console.error("Error creating survey response:", responseError);
      return json({ error: "Failed to submit response" }, { status: 500 });
    }

    // Create response answers
    if (responseData.answers && responseData.answers.length > 0) {
      for (const answer of responseData.answers) {
        // Get question ID from question_id
        const { data: question, error: questionError } = await supabaseClient
          .from("survey_question")
          .select("id")
          .eq("question_id", answer.question_id)
          .eq("page_id", supabaseClient
            .from("survey_page")
            .select("id")
            .eq("survey_id", survey.id)
            .eq("page_id", responseData.last_page_completed || "")
          )
          .single();

        if (questionError || !question) {
          console.error("Question not found:", answer.question_id);
          continue;
        }

        // Create response answer
        await supabaseClient
          .from("response_answer")
          .insert({
            response_id: surveyResponse.id,
            question_id: question.id,
            answer_value: Array.isArray(answer.answer_value) 
              ? JSON.stringify(answer.answer_value) 
              : answer.answer_value,
            answered_at: new Date().toISOString(),
          });
      }
    }

    return json({ 
      success: true, 
      response_id: surveyResponse.id,
      result_id: responseData.result_id 
    });
  } catch (error) {
    console.error("Error in handleSubmitResponse:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 