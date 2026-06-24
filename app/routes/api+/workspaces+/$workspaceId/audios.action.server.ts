import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  listWorkspaceAudiosApi,
  uploadWorkspaceAudioApi,
} from "@/lib/platform-media.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  try {
    const result = await listWorkspaceAudiosApi(
      getAuthSupabaseClient(auth),
      auth.user.id,
      workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ audios: result.audios }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to list audios");
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
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
    const result = await uploadWorkspaceAudioApi(
      getAuthSupabaseClient(auth),
      auth.user.id,
      workspaceId,
      mediaName,
      file,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ audio: result.audio }, 201);
  } catch (error) {
    return createErrorResponse(error, "Failed to upload audio");
  }
}
