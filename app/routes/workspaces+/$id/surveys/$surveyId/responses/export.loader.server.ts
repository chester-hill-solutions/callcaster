import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { csvResponse } from "@/lib/csv";
import { getUserRole } from "@/lib/database/workspace.server";
import { buildSurveyResponsesCsv } from "@/lib/platform-analytics.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { surveyId } = params;
  const { user, workspaceId, userRole, headers } = getWorkspaceRouteContext(context);

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
}
