import { data as routeData } from "react-router";
import { completeSurveyResponse } from "@/lib/survey-db.server";
import type { ActionFunctionArgs } from "react-router";

async function handleCompleteSurvey(request: Request) {
  const formData = await request.formData();
  const resultId = formData.get("resultId") as string;
  const surveyId = formData.get("surveyId") as string;
  const completed = formData.get("completed") as string;

  if (!resultId || !surveyId) {
    return routeData({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await completeSurveyResponse({
    surveyPublicId: surveyId,
    resultId,
    completed: completed === "true",
  });

  if (!result.ok) {
    return routeData({ error: result.error }, { status: result.status });
  }

  return routeData({
    success: true,
    result_id: result.result_id,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") {
    return handleCompleteSurvey(request);
  }

  return routeData({ error: "Method not allowed" }, { status: 405 });
}
