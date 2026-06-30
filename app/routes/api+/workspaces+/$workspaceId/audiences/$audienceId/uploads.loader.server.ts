import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { listAudienceUploadsByAudienceId } from "@/lib/audience-upload-db.server";
import { resolveDataPlaneAuth } from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  const audienceId = params.audienceId;
  if (!workspaceId || !audienceId) {
    return jsonError("workspaceId and audienceId are required", 400);
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) return auth;

  const parsedAudienceId = Number.parseInt(audienceId, 10);
  if (Number.isNaN(parsedAudienceId)) {
    return jsonError("Invalid audienceId", 400);
  }

  try {
    const uploads = await listAudienceUploadsByAudienceId(workspaceId, parsedAudienceId);
    return jsonResponse({ uploads }, 200);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to load audience uploads",
      500,
    );
  }
}
