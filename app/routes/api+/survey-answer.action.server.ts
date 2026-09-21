import { data as routeData } from "react-router";
import {
  guardPublicSurveySubmission,
  resolvePublicSurveyContactId,
} from "@/lib/survey-public-action.server";
import { saveSurveyAnswer } from "@/lib/survey-db.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

async function handleSaveAnswer(request: Request) {
  const guard = await guardPublicSurveySubmission(request, {
    rateLimitKey: "survey:answer",
    extraRequiredFields: ["questionId", "pageId"],
  });
  if (!guard.ok) {
    return guard.response;
  }

  const { formData, survey, resultId, token } = guard.value;
  const questionId = formData.get("questionId") as string;
  const answerValue = formData.get("answerValue") as string;
  const pageId = formData.get("pageId") as string;

  const contact = await resolvePublicSurveyContactId(formData, survey);
  if (!contact.ok) {
    return contact.response;
  }

  const result = await saveSurveyAnswer({
    surveyInternalId: survey.id,
    questionPublicId: questionId,
    answerValue,
    contactId: contact.contactId,
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
    respondent_token: token,
  });
}

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request }: ActionFunctionArgs) => {
    if (request.method === "POST") {
      return handleSaveAnswer(request);
    }

    return routeData({ error: "Method not allowed" }, { status: 405 });
  },
});
