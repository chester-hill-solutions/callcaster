import { data as routeData } from "react-router";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";
import { getWorkspaceForClient } from "@/lib/workspace-client-projection.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: result }) => {
    if (!result.ok) return result.response;
    const { headers, workspaceId } = result.ctx;

    const workspaceData = await getWorkspaceForClient(workspaceId);
    if (!workspaceData) {
      return routeData({ workspace: null, error: "Workspace not found" }, { headers, status: 404 });
    }

    return routeData({ workspace: workspaceData, error: null }, { headers });
  },
});
