import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { getSurveyDetailApi } from "@/lib/platform-data.server";
import { loadRecentSurveyResponses } from "@/lib/survey-db.server";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { user } = await verifyAuth(request);
  const { id: workspaceId, surveyId } = params;

  if (!workspaceId || !surveyId) {
    throw new Response("Workspace ID and Survey ID are required", { status: 400 });
  }

  const userRole = await getUserRole({
    user,
    workspaceId,
  });

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
