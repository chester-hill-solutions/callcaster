import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database/workspace.server";
import { getSurveyDetailApi } from "@/lib/platform-data.server";
import { loadRecentSurveyResponses } from "@/lib/survey-db.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { surveyId } = params;
  const { user, workspaceId, userRole, headers } = getWorkspaceRouteContext(context);

  if (!workspaceId || !surveyId) {
    throw new Response("Workspace ID and Survey ID are required", { status: 400 });
  }
  if (!userRole) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const result = await getSurveyDetailApi(surveyId, workspaceId);
  if (!result.ok) {
    throw new Response(result.error, { status: result.status });
  }

  const recentResponses = await loadRecentSurveyResponses(result.survey.id, 10);

  return routeData({
    survey: result.survey,
    recentResponses,
    workspaceId,
    user,
    userRole,
  });
}
