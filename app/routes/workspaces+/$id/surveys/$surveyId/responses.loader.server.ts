import { data as routeData } from "react-router";
import {
  getSurveyDetailApi,
  getSurveyResponsesApi,
} from "@/lib/platform-data.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id: workspaceId, surveyId } = params;

  const access = await requireWorkspaceLoaderContext(request, workspaceId);
  if (!access.ok) {
    return access.response;
  }

  if (!surveyId) {
    throw new Response("Survey ID is required", { status: 400 });
  }

  const { supabaseClient, user, userRole } = access.ctx;

  const [surveyResult, responsesResult] = await Promise.all([
    getSurveyDetailApi(supabaseClient, surveyId, access.ctx.workspaceId),
    getSurveyResponsesApi(supabaseClient, surveyId, access.ctx.workspaceId),
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
}
