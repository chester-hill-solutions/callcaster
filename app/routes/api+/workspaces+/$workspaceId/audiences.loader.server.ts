import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { listWorkspaceAudiencesApi } from "@/lib/platform-data.server";
import { withWorkspaceApiLoader } from "@/lib/workspace-api-route.server";

export const loader = withWorkspaceApiLoader(async ({ client, workspaceId }) => {
  const result = await listWorkspaceAudiencesApi(client, workspaceId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ audiences: result.audiences }, 200);
});
