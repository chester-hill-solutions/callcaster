import { data as routeData } from "react-router";
import { submitSurveyResponse, getSurveyWorkspaceByPublicId } from "@/lib/survey-db.server";
import { requireDualAuth, getDualAuthUser } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { AppError } from "@/lib/errors.server";

import type { ActionFunctionArgs } from "react-router";

type SubmittedSurveyAnswer = {
  question_id: string;
  answer_value: string | string[];
};

type SubmittedSurveyResponse = {
  result_id: string;
  contact_id?: number | null;
  completed?: boolean;
  last_page_completed?: string | null;
  answers?: SubmittedSurveyAnswer[];
};

async function handleSubmitResponse(formData: FormData) {
  const responseDataRaw = formData.get("responseData") as string | null;
  if (!responseDataRaw) {
    return routeData({ error: "Response data is required" }, { status: 400 });
  }
  let responseData: SubmittedSurveyResponse;
  try {
    responseData = JSON.parse(responseDataRaw) as SubmittedSurveyResponse;
  } catch {
    return routeData({ error: "Invalid response data format" }, { status: 400 });
  }
  const surveyId = formData.get("surveyId") as string;

  if (!surveyId) {
    return routeData({ error: "Survey ID and response data are required" }, { status: 400 });
  }

  const workspaceId = await getSurveyWorkspaceByPublicId(surveyId);
  if (!workspaceId) {
    return routeData({ error: "Survey not found" }, { status: 404 });
  }

  const result = await submitSurveyResponse({
    surveyPublicId: surveyId,
    responseData,
  });

  if (!result.ok) {
    return routeData({ error: result.error }, { status: result.status });
  }

  return routeData({
    success: true,
    response_id: result.response_id,
    result_id: result.result_id,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return routeData({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;

  const formData = await request.formData();
  const surveyId = formData.get("surveyId") as string;
  if (!surveyId) {
    return routeData({ error: "Survey ID is required" }, { status: 400 });
  }
  const workspaceId = await getSurveyWorkspaceByPublicId(surveyId);

  if (auth.authType === "api_key") {
    if (!workspaceId || workspaceId !== auth.workspaceId) {
      return routeData({ error: "Unauthorized" }, { status: 403 });
    }
  } else {
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }
    if (!workspaceId) {
      return routeData({ error: "Survey not found" }, { status: 404 });
    }
    try {
      await requireWorkspaceAccess({ user, workspaceId });
    } catch (error) {
      if (error instanceof AppError) {
        return routeData({ error: error.message }, { status: error.statusCode });
      }
      throw error;
    }
  }

  return handleSubmitResponse(formData);
}
