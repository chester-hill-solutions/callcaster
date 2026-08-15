import { dataPlaneResourceCapabilityAuth } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  exportSurveyResponsesCsv,
  getSurveyResponsesApi,
} from "@/lib/platform-data.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneResourceCapabilityAuth("campaigns.read", "survey", "surveyId"),
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
