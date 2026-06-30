import { data as routeData } from "react-router";
import { submitSurveyResponse } from "@/lib/survey-db.server";
import { requireDualAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";

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

async function handleSubmitResponse(request: Request) {
  const formData = await request.formData();
  const responseDataRaw = formData.get("responseData") as string | null;
  if (!responseDataRaw) {
    return routeData({ error: "Response data is required" }, { status: 400 });
  }
  let responseData: SubmittedSurveyResponse;
  try {
    responseData = JSON.parse(responseDataRaw) as SubmittedSurveyResponse;
  } catch {
    return routeData({ error: "Invalid response data format" }, { status: 400 });
  }
  const surveyId = formData.get("surveyId") as string;

  if (!surveyId) {
    return routeData({ error: "Survey ID and response data are required" }, { status: 400 });
  }

  const result = await submitSurveyResponse({
    surveyPublicId: surveyId,
    responseData,
  });

  if (!result.ok) {
    return routeData({ error: result.error }, { status: result.status });
  }

  return routeData({
    success: true,
    response_id: result.response_id,
    result_id: result.result_id,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method === "POST") {
    return handleSubmitResponse(request);
  }

  return routeData({ error: "Method not allowed" }, { status: 405 });
}
