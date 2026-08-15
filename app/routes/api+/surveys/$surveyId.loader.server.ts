import { dataPlaneCapabilityAuthForResource } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getSurveyDetailApi } from "@/lib/platform-data.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuthForResource("campaigns.read", "survey", "surveyId"),
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
