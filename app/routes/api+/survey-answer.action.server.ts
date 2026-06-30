import { data as routeData } from "react-router";
import { saveSurveyAnswer } from "@/lib/survey-db.server";
import type { ActionFunctionArgs } from "react-router";

async function handleSaveAnswer(request: Request) {
  const formData = await request.formData();
  const surveyId = formData.get("surveyId") as string;
  const questionId = formData.get("questionId") as string;
  const answerValue = formData.get("answerValue") as string;
  const contactId = formData.get("contactId") as string;
  const resultId = formData.get("resultId") as string;
  const pageId = formData.get("pageId") as string;

  if (!surveyId || !questionId || !resultId || !pageId) {
    return routeData({ error: "Missing required fields" }, { status: 400 });
  }

  const surveyIdNum = parseInt(surveyId, 10);
  if (Number.isNaN(surveyIdNum)) {
    return routeData({ error: "Invalid survey ID" }, { status: 400 });
  }

  const contactIdNum = contactId ? parseInt(contactId, 10) : null;
  if (contactIdNum !== null && Number.isNaN(contactIdNum)) {
    return routeData({ error: "Invalid contact ID" }, { status: 400 });
  }

  const result = await saveSurveyAnswer({
    surveyInternalId: surveyIdNum,
    questionPublicId: questionId,
    answerValue,
    contactId: contactIdNum,
    resultId,
    pageId,
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
  if (request.method === "POST") {
    return handleSaveAnswer(request);
  }

  return routeData({ error: "Method not allowed" }, { status: 405 });
}
