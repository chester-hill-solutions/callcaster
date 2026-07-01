import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceUploadStatusApi,
  resolveDataPlaneAuth,
} from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  const uploadId = params.uploadId;
  if (!workspaceId || !uploadId) {
    return jsonError("workspaceId and uploadId are required", 400);
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) return auth;

  const result = await getAudienceUploadStatusApi(
    workspaceId,
    uploadId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(result.upload, 200);
}
