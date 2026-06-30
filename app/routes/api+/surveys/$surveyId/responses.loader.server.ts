import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  authForSurvey,
  exportSurveyResponsesCsv,
  getSurveyResponsesApi,
} from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const surveyId = params.surveyId;
  if (!surveyId) {
    return jsonError("surveyId is required", 400);
  }

  const auth = await authForSurvey(request, surveyId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  if (url.searchParams.get("export") === "csv") {
    const result = await exportSurveyResponsesCsv(
      auth.client,
      surveyId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return result.data;
  }

  const result = await getSurveyResponsesApi(
    auth.client,
    surveyId,
    auth.workspaceId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      survey_id: result.survey_id,
      responses: result.responses,
      stats: result.stats,
    },
    200,
  );
}
