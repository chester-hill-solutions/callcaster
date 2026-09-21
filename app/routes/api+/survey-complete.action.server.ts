import { data as routeData } from "react-router";
import {
  guardPublicSurveySubmission,
  resolvePublicSurveyContactId,
} from "@/lib/survey-public-action.server";
import { completeSurveyResponse } from "@/lib/survey-db.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

async function handleCompleteSurvey(request: Request) {
  const guard = await guardPublicSurveySubmission(request, {
    rateLimitKey: "survey:complete",
  });
  if (!guard.ok) {
    return guard.response;
  }

  const { formData, survey, resultId, token } = guard.value;
  const completed = formData.get("completed") as string;

  const contact = await resolvePublicSurveyContactId(formData, survey);
  if (!contact.ok) {
    return contact.response;
  }

  const result = await completeSurveyResponse({
    surveyInternalId: survey.id,
    resultId,
    completed: completed === "true",
  });

  if (!result.ok) {
    return routeData({ error: result.error }, { status: result.status });
  }

  return routeData({
    success: true,
    result_id: result.result_id,
    respondent_token: token,
  });
}

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request }: ActionFunctionArgs) => {
    if (request.method === "POST") {
      return handleCompleteSurvey(request);
    }

    return routeData({ error: "Method not allowed" }, { status: 405 });
  },
});
