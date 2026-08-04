import { data as routeData } from "react-router";
import { listWorkspaceVoicemailsApi } from "@/lib/platform-media.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read", "external"],
  handler: async ({ auth: access }) => {
    if (!access.ok) {
      return access.response;
    }

    const { headers, user, workspaceId } = access.ctx;

    const mediaResult = await listWorkspaceVoicemailsApi(
      user.id,
      workspaceId,
    );

    if (!mediaResult.ok) {
      return routeData(
        { audioMedia: null, error: mediaResult.error },
        { headers },
      );
    }

    if (mediaResult.audios.length === 0) {
      return routeData(
        { audioMedia: null, error: "No Audio in Workspace" },
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

    return routeData({ audioMedia, error: null }, { headers });
  },
});
