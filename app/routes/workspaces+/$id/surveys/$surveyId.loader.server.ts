import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { getSurveyDetailApi } from "@/lib/platform-data.server";
import { loadRecentSurveyResponses } from "@/lib/survey-db.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth, url }) => {
    const { surveyId } = params;
    const { user, workspaceId, userRole } = auth;

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
      // The public survey link is built from this. It must come from the
      // request, not `window.location` — reading window during render crashed
      // SSR outright (ReferenceError: window is not defined -> 500).
      origin: url.origin,
    });
  },
});
