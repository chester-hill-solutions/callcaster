import { data as routeData } from "react-router";
import { listAudioMetadata } from "@/lib/database/workspace-audio-metadata.server";
import { listWorkspaceAudiosApi } from "@/lib/platform-media.server";
import { getWorkspaceForClient } from "@/lib/workspace-members-db.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read", "external"],
  handler: async ({ auth: access }) => {
    if (!access.ok) {
      return access.response;
    }

    const { headers, user, workspaceId, userRole } = access.ctx;

    const workspaceData = await getWorkspaceForClient(workspaceId);

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

    // One batched lookup, not one probe per object: measuring duration means
    // downloading the file, so a per-row probe would pull the whole library on
    // every page view. Objects with no sidecar row render as "—".
    const metadataByFileName = await listAudioMetadata(
      workspaceId,
      mediaResult.audios.map((audio) => audio.name),
    );

    const audioMedia = mediaResult.audios.map((audio) => {
      const metadata = metadataByFileName.get(audio.name);
      return {
        name: audio.name,
        id: audio.id,
        created_at: audio.created_at,
        updated_at: audio.updated_at,
        signedUrl: audio.signed_url,
        durationMs: metadata?.duration_ms ?? null,
        sizeBytes: metadata?.size_bytes ?? null,
        sourceFileName: metadata?.source_file_name ?? null,
      };
    });

    return routeData(
      { audioMedia, workspace: workspaceData, error: null, userRole },
      { headers },
    );
  },
});
