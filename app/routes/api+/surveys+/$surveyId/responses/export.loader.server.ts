import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { csvResponse } from "@/lib/csv";
import { createErrorResponse } from "@/lib/errors.server";
import { exportSurveyResponsesApi } from "@/lib/platform-analytics.server";
import { jsonError } from "@/lib/platform-api.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const surveyId = params.surveyId;
  if (!surveyId) {
    return jsonError("surveyId is required", 400);
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id")?.trim();
  if (!workspaceId) {
    return jsonError("workspace_id query parameter is required", 400);
  }

  try {
    const result = await exportSurveyResponsesApi(      auth.user.id,
      workspaceId,
      surveyId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return csvResponse({ filename: result.filename, csv: result.csv });
  } catch (error) {
    return createErrorResponse(error, "Failed to export survey responses");
  }
}
