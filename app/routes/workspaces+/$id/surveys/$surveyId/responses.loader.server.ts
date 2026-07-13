import { data as routeData } from "react-router";
import {
  getSurveyDetailApi,
  getSurveyResponsesApi,
} from "@/lib/platform-data.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request, params }) =>
    requireWorkspaceLoaderContext(request, params.id),
  sideEffects: ["db-read"],
  handler: async ({ params, auth: access }) => {
    const { surveyId } = params;

    if (!access.ok) {
      return access.response;
    }

    if (!surveyId) {
      throw new Response("Survey ID is required", { status: 400 });
    }

    const { user, userRole } = access.ctx;

    const [surveyResult, responsesResult] = await Promise.all([
      getSurveyDetailApi(surveyId, access.ctx.workspaceId),
      getSurveyResponsesApi(surveyId, access.ctx.workspaceId),
    ]);

    if (!surveyResult.ok) {
      throw new Response(surveyResult.error, { status: surveyResult.status });
    }

    if (!responsesResult.ok) {
      throw new Response(responsesResult.error, { status: responsesResult.status });
    }

    return routeData({
      survey: surveyResult.survey,
      responses: responsesResult.responses,
      workspaceId: access.ctx.workspaceId,
      user,
      userRole,
      stats: {
        total: responsesResult.stats.total,
        completed: responsesResult.stats.completed,
        inProgress: responsesResult.stats.in_progress,
        completionRate: responsesResult.stats.completion_rate,
      },
    });
  },
});
