import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  authForResource,
  exportSurveyResponsesCsv,
  getSurveyResponsesApi,
} from "@/lib/platform-data.server";
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
  handler: async ({ url, auth }) => {
    if (url.searchParams.get("export") === "csv") {
      const result = await exportSurveyResponsesCsv(
        auth.surveyId,
        auth.workspaceId,
      );
      if (!result.ok) {
        return jsonError(result.error, result.status);
      }
      return result.data;
    }

    const result = await getSurveyResponsesApi(
      auth.surveyId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        survey_id: result.survey_id,
        responses: result.responses,
        stats: result.stats,
      },
      200,
    );
  },
});
