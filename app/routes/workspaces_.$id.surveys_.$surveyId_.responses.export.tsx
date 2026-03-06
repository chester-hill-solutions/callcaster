import { type LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { User } from "@/lib/types";
import type { Tables } from "@/lib/database.types";
import type { ResponseAnswer, Contact } from "@/lib/types";
import { csvResponse, toCsvString } from "@/lib/csv";

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
        page_order,
        survey_question(
          id,
          question_id,
          question_text,
          question_type,
          question_order
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
  page_order?: number;
  survey_question?: Array<{
    id: number;
    question_id: string;
    question_text: string;
    question_type: string;
    question_order?: number;
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
  const pages =
    (survey as Tables<"survey"> & { survey_page?: SurveyPageWithQuestions[] }).survey_page ?? [];
  const allQuestions = pages
    .slice()
    .sort((a, b) => (a.page_order ?? 0) - (b.page_order ?? 0))
    .flatMap((page) =>
      (page.survey_question ?? [])
        .slice()
        .sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0)),
    );

  const formatDateUtc = (value: string | null | undefined) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    // Date-only in UTC for deterministic export.
    return d.toISOString().slice(0, 10);
  };

  const safeFilenamePart = (input: string) =>
    input
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "survey";

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
    formatDateUtc(response.started_at),
    response.completed_at ? formatDateUtc(response.completed_at) : "-",
    response.last_page_completed || "-",
    ...allQuestions.map((question) =>
      getAnswerForQuestion(response, question.question_id)
    ),
  ]);

  const headerKeys = headers.map((_, idx) => `c${idx}`);
  const csvRows = rows.map((r) => Object.fromEntries(r.map((cell, idx) => [`c${idx}`, cell])));
  const csvWithDisplayHeaders = toCsvString({
    headers: headerKeys,
    headerLabels: headers,
    rows: csvRows,
  });

  const filename = `survey-responses-${safeFilenamePart(String(survey.title ?? "survey"))}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return csvResponse({ filename, csv: csvWithDisplayHeaders });
} 