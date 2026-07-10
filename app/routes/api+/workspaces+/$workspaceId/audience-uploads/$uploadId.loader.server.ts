import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceUploadStatusApi,
} from "@/lib/platform-data.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  const uploadId = params.uploadId;
  if (!workspaceId || !uploadId) {
    return jsonError("workspaceId and uploadId are required", 400);
  }
  getDataPlaneRouteContext(context, workspaceId);

  const result = await getAudienceUploadStatusApi(
    workspaceId,
    uploadId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(result.upload, 200);
}
