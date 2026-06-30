import { data as routeData } from "react-router";
import { listWorkspaceAudiosApi } from "@/lib/platform-media.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await requireWorkspaceLoaderContext(request, params.id);
  if (!access.ok) {
    return access.response;
  }

  const { headers, user, workspaceId, userRole } = access.ctx;

  const workspaceData = await getWorkspaceById(workspaceId);

  if (!workspaceData) {
    return routeData(
      {
        audioMedia: null,
        workspace: null,
        error: "Workspace not found",
        userRole,
      },
      { headers, status: 404 },
    );
  }

  const mediaResult = await listWorkspaceAudiosApi(
    user.id,
    workspaceId,
  );

  if (!mediaResult.ok) {
    return routeData(
      {
        audioMedia: null,
        workspace: workspaceData,
        error: mediaResult.error,
        userRole,
      },
      { headers },
    );
  }

  if (mediaResult.audios.length === 0) {
    return routeData(
      {
        audioMedia: null,
        workspace: workspaceData,
        error: "No Audio in Workspace",
        userRole,
      },
      { headers },
    );
  }

  const audioMedia = mediaResult.audios.map((audio) => ({
    name: audio.name,
    id: audio.id,
    created_at: audio.created_at,
    updated_at: audio.updated_at,
    signedUrl: audio.signed_url,
  }));

  return routeData(
    { audioMedia, workspace: workspaceData, error: null, userRole },
    { headers },
  );
}
