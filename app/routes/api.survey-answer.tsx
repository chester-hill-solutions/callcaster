import { json, type ActionFunctionArgs } from "@remix-run/node";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient } = createSupabaseServerClient(request);
  
  if (request.method === "POST") {
    return handleSaveAnswer(request, supabaseClient);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleSaveAnswer(request: Request, supabaseClient: any) {
  try {
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

    // Get or create survey response
    let { data: surveyResponse, error: responseError } = await supabaseClient
      .from("survey_response")
      .select("*")
      .eq("result_id", resultId)
      .single();

    if (responseError || !surveyResponse) {
      // Create new survey response
      const { data: newResponse, error: createError } = await supabaseClient
        .from("survey_response")
        .insert({
          survey_id: survey.id,
          result_id: resultId,
          contact_id: contactId || null,
          started_at: new Date().toISOString(),
          last_page_completed: pageId,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating survey response:", createError);
        return json({ error: "Failed to create survey response" }, { status: 500 });
      }

      surveyResponse = newResponse;
    } else {
      // Update existing response with last page completed
      const { error: updateError } = await supabaseClient
        .from("survey_response")
        .update({
          last_page_completed: pageId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", surveyResponse.id);

      if (updateError) {
        console.error("Error updating survey response:", updateError);
      }
    }

    // Get question ID from question_id
    const { data: question, error: questionError } = await supabaseClient
      .from("survey_question")
      .select("id")
      .eq("question_id", questionId)
      .single();

    if (questionError || !question) {
      console.error("Question not found:", questionId);
      return json({ error: "Question not found" }, { status: 404 });
    }

    // Check if answer already exists
    const { data: existingAnswer, error: existingError } = await supabaseClient
      .from("response_answer")
      .select("id")
      .eq("response_id", surveyResponse.id)
      .eq("question_id", question.id)
      .single();

    if (existingAnswer) {
      // Update existing answer
      const { error: updateError } = await supabaseClient
        .from("response_answer")
        .update({
          answer_value: answerValue,
          answered_at: new Date().toISOString(),
        })
        .eq("id", existingAnswer.id);

      if (updateError) {
        console.error("Error updating answer:", updateError);
        return json({ error: "Failed to update answer" }, { status: 500 });
      }
    } else {
      // Create new answer
      const { data: newAnswer, error: insertError } = await supabaseClient
        .from("response_answer")
        .insert({
          response_id: surveyResponse.id,
          question_id: question.id,
          answer_value: answerValue,
          answered_at: new Date().toISOString(),
        });

      console.log(newAnswer);

      if (insertError) {
        console.error("Error creating answer:", insertError);
        return json({ error: "Failed to save answer" }, { status: 500 });
      }
    }

    return json({ 
      success: true, 
      response_id: surveyResponse.id,
      result_id: resultId 
    });
  } catch (error) {
    console.error("Error in handleSaveAnswer:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 