import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { authForResource, getSurveyDetailApi } from "@/lib/platform-data.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: async ({ request, params }: LoaderFunctionArgs) => {
    const surveyId = params.surveyId;
    if (!surveyId) {
      return jsonError("surveyId is required", 400);
    }

    const auth = await authForResource(request, "survey", surveyId);
    if (auth instanceof Response) return auth;

    return { ...auth, surveyId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getSurveyDetailApi(
      auth.surveyId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ survey: result.survey }, 200);
  },
});
