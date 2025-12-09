import { type LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { User } from "@/lib/types";
import type { Tables } from "@/lib/database.types";
import type { ResponseAnswer, Contact } from "@/lib/types";

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
    throw new Response("Error fetching responses", { status: 500 });
  }

type SurveyPageWithQuestions = {
  survey_question?: Array<{
    id: number;
    question_id: string;
    question_text: string;
    question_type: string;
  }>;
};

type ResponseAnswerWithQuestion = ResponseAnswer & {
  survey_question?: {
    question_id: string;
    question_text: string;
    question_type: string;
    question_option?: Array<{ option_label: string }>;
  };
};

type SurveyResponseWithContact = Tables<"survey_response"> & {
  contact?: Pick<Contact, "firstname" | "surname" | "phone" | "email"> | null;
  response_answer?: ResponseAnswerWithQuestion[];
};

  // Get all questions from the survey structure
  const allQuestions =
    (survey as Tables<"survey"> & { survey_page?: SurveyPageWithQuestions[] }).survey_page?.flatMap((page) => page.survey_question || []) ||
    [];

  // Generate CSV data
  const formatAnswer = (answer: ResponseAnswerWithQuestion) => {
    if (!answer) return "-";

    if (answer.survey_question?.question_type === "checkbox") {
      try {
        const values = JSON.parse(answer.answer_value);
        return Array.isArray(values) ? values.join(", ") : answer.answer_value;
      } catch {
        return answer.answer_value;
      }
    }
    return answer.answer_value;
  };

  const getContactName = (response: SurveyResponseWithContact) => {
    if (response.contact?.firstname && response.contact?.surname) {
      return `${response.contact.firstname} ${response.contact.surname}`;
    }
    if (response.contact?.phone) {
      return response.contact.phone;
    }
    if (response.contact?.email) {
      return response.contact.email;
    }
    return "Anonymous";
  };

  const getAnswerForQuestion = (response: SurveyResponseWithContact, questionId: string) => {
    const question = allQuestions.find(
      (q) => q.question_id === questionId,
    );
    if (!question) return "-";

    // Find the answer by the database question ID
    const answer = response.response_answer?.find(
      (a) => a.question_id === question.id,
    );
    return answer ? formatAnswer(answer) : "-";
  };

  // Create CSV headers
  const headers = [
    "Respondent",
    "Status",
    "Started",
    "Completed",
    "Last Page",
    ...allQuestions.map((question) => question.question_text),
  ];

  // Create CSV rows
  const rows = ((responses || []) as SurveyResponseWithContact[]).map((response) => [
    getContactName(response),
    response.completed_at ? "Completed" : "In Progress",
    new Date(response.started_at).toLocaleDateString(),
    response.completed_at ? new Date(response.completed_at).toLocaleDateString() : "-",
    response.last_page_completed || "-",
    ...allQuestions.map((question) => 
      getAnswerForQuestion(response, question.question_id)
    ),
  ]);

  // Combine headers and rows
  const csvData = [headers, ...rows];

  // Convert to CSV string
  const csvString = csvData
    .map(row => 
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        const escaped = String(cell).replace(/"/g, '""');
        if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(',')
    )
    .join('\n');

  // Return CSV file
  return new Response(csvString, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="survey-responses-${survey.title}-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
} 