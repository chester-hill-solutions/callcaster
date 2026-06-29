import { data as routeData } from "react-router";
import { listWorkspaceAudiosApi } from "@/lib/platform-media.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await requireWorkspaceLoaderContext(request, params.id);
  if (!access.ok) {
    return access.response;
  }

  const { supabaseClient, headers, user, workspaceId, userRole } = access.ctx;

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  if (workspaceError) {
    return routeData(
      {
        audioMedia: null,
        workspace: null,
        error: workspaceError.message,
        userRole,
      },
      { headers },
    );
  }

  const mediaResult = await listWorkspaceAudiosApi(
    supabaseClient,
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
