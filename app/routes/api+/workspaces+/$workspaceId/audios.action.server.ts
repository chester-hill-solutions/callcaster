import { createErrorResponse } from "@/lib/errors.server";
import {
  listWorkspaceAudiosApi,
  uploadWorkspaceAudioApi,
} from "@/lib/platform-media.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const result = await listWorkspaceAudiosApi(userId, workspaceId);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ audios: result.audios }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to list audios");
  }
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const formData = await request.formData();
  const mediaName = String(formData.get("name") ?? formData.get("media-name") ?? "");
  const file = formData.get("file") ?? formData.get("media");

  if (!mediaName.trim()) {
    return jsonError("name is required", 400);
  }

  if (!(file instanceof File)) {
    return jsonError("file is required", 400);
  }

  try {
    const result = await uploadWorkspaceAudioApi(userId, workspaceId, mediaName, file);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ audio: result.audio }, 201);
  } catch (error) {
    return createErrorResponse(error, "Failed to upload audio");
  }
}
