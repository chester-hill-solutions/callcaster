import { AppError, ErrorCode, createErrorResponse, handleDatabaseError } from "@/lib/errors.server";
import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { SurveyFormData } from "@/lib/types";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import {
  createSurveyWithStructure,
  deleteSurveyByPublicId,
  findUserById,
  getSurveyWorkspaceByPublicId,
  updateSurveyMetadata,
} from "@/lib/survey-db.server";

import type { ActionFunctionArgs } from "react-router";

async function handleCreateSurvey(
  request: Request,
  user: { id: string },
) {
  const formData = await request.formData();
  const surveyDataRaw = formData.get("surveyData") as string | null;
  if (!surveyDataRaw) {
    return routeData({ error: "Survey data is required" }, { status: 400 });
  }
  let surveyData: SurveyFormData;
  try {
    surveyData = JSON.parse(surveyDataRaw) as SurveyFormData;
  } catch {
    return routeData({ error: "Invalid survey data format" }, { status: 400 });
  }
  const workspaceId = formData.get("workspaceId") as string;

  if (!workspaceId) {
    return routeData({ error: "Workspace ID is required" }, { status: 400 });
  }

  const dbUser = await findUserById(user.id);
  if (!dbUser) {
    return routeData({ error: "User not found" }, { status: 404 });
  }

  const userRole = await getUserRole({
    user: dbUser,
    workspaceId,
  });

  if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
    return routeData({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const survey = await createSurveyWithStructure({ workspaceId, surveyData });
    return routeData({ success: true, survey });
  } catch (error) {
    handleDatabaseError(error as { code?: string; message?: string; details?: string } | null, "Error creating survey");
  }
}

async function handleUpdateSurvey(
  request: Request,
  user: { id: string },
) {
  try {
    const formData = await request.formData();
    const surveyDataRaw = formData.get("surveyData") as string | null;
    if (!surveyDataRaw) {
      return routeData({ error: "Survey data is required" }, { status: 400 });
    }
    let surveyData: SurveyFormData;
    try {
      surveyData = JSON.parse(surveyDataRaw) as SurveyFormData;
    } catch {
      return routeData({ error: "Invalid survey data format" }, { status: 400 });
    }
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId) {
      return routeData({ error: "Survey ID is required" }, { status: 400 });
    }

    const workspaceId = await getSurveyWorkspaceByPublicId(surveyId);
    if (!workspaceId) {
      return routeData({ error: "Survey not found" }, { status: 404 });
    }

    const userRole = await getUserRole({
      user,
      workspaceId,
    });

    if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
      return routeData({ error: "Unauthorized" }, { status: 403 });
    }

    const survey = await updateSurveyMetadata({
      workspaceId,
      surveyPublicId: surveyId,
      title: surveyData.title,
      is_active: surveyData.is_active,
    });

    if (!survey) {
      logger.error("Error updating survey: survey not found after update");
      return routeData({ error: "Failed to update survey" }, { status: 500 });
    }

    return routeData({ success: true, survey });
  } catch (error) {
    logger.error("Error in handleUpdateSurvey:", error);
    return routeData({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleDeleteSurvey(
  request: Request,
  user: { id: string },
) {
  try {
    const formData = await request.formData();
    const surveyId = formData.get("surveyId") as string;

    if (!surveyId) {
      return routeData({ error: "Survey ID is required" }, { status: 400 });
    }

    const workspaceId = await getSurveyWorkspaceByPublicId(surveyId);
    if (!workspaceId) {
      return routeData({ error: "Survey not found" }, { status: 404 });
    }

    const userRole = await getUserRole({
      user,
      workspaceId,
    });

    if (!userRole || !["owner", "admin"].includes(userRole.role)) {
      return routeData({ error: "Unauthorized" }, { status: 403 });
    }

    await deleteSurveyByPublicId(workspaceId, surveyId);
    return routeData({ success: true });
  } catch (error) {
    logger.error("Error in handleDeleteSurvey:", error);
    return routeData({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const auth = await requireDualAuth(request);
    if (auth instanceof Response) return auth;    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    if (request.method === "POST") {
      return await handleCreateSurvey(request, user);
    }
    if (request.method === "PATCH") {
      return await handleUpdateSurvey(request, user);
    }
    if (request.method === "DELETE") {
      return await handleDeleteSurvey(request, user);
    }

    throw new AppError("Method not allowed", 405, ErrorCode.INVALID_OPERATION);
  } catch (error) {
    return createErrorResponse(error, "Failed to process survey request");
  }
}
