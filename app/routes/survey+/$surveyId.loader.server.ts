import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

type ExistingAnswerRow = {
  answer_value: string;
  survey_question: { question_id: string };
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { surveyId } = params;
  const url = new URL(request.url);
  const contactId = url.searchParams.get("contact");

  if (!surveyId) {
    throw new Response("Survey ID is required", { status: 400 });
  }

  const { supabaseClient } = createSupabaseServerClient(request);

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
      )
    `)
    .eq("survey_id", surveyId)
    .eq("is_active", true)
    .single();

  if (surveyError || !survey) {
    throw new Response("Survey not found or inactive", { status: 404 });
  }

  let contact = null;
  if (contactId) {
    const { data: contactData, error: contactError } = await supabaseClient
      .from("contact")
      .select("*")
      .eq("id", parseInt(contactId))
      .single();

    if (!contactError && contactData) {
      contact = contactData;
    }
  }

  const resultId = `result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let existingResponse = null;
  let existingAnswers = {};

  if (contact?.id) {
    const { data: response, error: responseError } = await supabaseClient
      .from("survey_response")
      .select(`
        *,
        response_answer(
          *,
          survey_question(question_id)
        )
      `)
      .eq("survey_id", survey.id)
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!responseError && response) {
      existingResponse = response;
      existingAnswers =
        (response.response_answer as ExistingAnswerRow[] | undefined)?.reduce(
          (acc: Record<string, string | string[]>, answer) => {
            const questionId = answer.survey_question.question_id.toString();
            acc[questionId] = answer.answer_value as string | string[];
            return acc;
          },
          {},
        ) || {};
    }
  }

  return routeData({
    survey,
    resultId: existingResponse?.result_id || resultId,
    contact,
    existingResponse,
    existingAnswers,
  });
}
