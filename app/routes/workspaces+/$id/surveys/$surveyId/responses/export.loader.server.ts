import { csvResponse } from "@/lib/csv";
import { getUserRole } from "@/lib/database.server";
import { buildSurveyResponsesCsv } from "@/lib/platform-analytics.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  const { id: workspaceId, surveyId } = params;

  if (!workspaceId || !surveyId) {
    throw new Response("Workspace ID and Survey ID are required", {
      status: 400,
    });
  }

  const userRole = await getUserRole({
    supabaseClient,
    user,
    workspaceId,
  });

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
