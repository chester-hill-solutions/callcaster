import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { authForSurvey, getSurveyDetailApi } from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const surveyId = params.surveyId;
  if (!surveyId) {
    return jsonError("surveyId is required", 400);
  }

  const auth = await authForSurvey(request, surveyId);
  if (auth instanceof Response) return auth;

  const result = await getSurveyDetailApi(
    auth.supabase,
    surveyId,
    auth.workspaceId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ survey: result.survey }, 200);
}
