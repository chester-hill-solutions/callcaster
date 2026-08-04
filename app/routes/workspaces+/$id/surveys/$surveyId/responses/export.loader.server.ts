import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { csvResponse } from "@/lib/csv";
import { buildSurveyResponsesCsv } from "@/lib/platform-analytics.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const { surveyId } = params;
    const { workspaceId, userRole } = auth;

    if (!workspaceId || !surveyId) {
      throw new Response("Workspace ID and Survey ID are required", {
        status: 400,
      });
    }
    if (!userRole) {
      throw new Response("Unauthorized", { status: 403 });
    }

    const result = await buildSurveyResponsesCsv({
      workspaceId,
      surveyId,
    });

    if (!result.ok) {
      throw new Response(result.error, { status: result.status });
    }

    return csvResponse({ filename: result.filename, csv: result.csv });
  },
});
