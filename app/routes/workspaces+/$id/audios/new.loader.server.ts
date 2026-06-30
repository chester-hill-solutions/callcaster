import { data as routeData } from "react-router";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const result = await requireWorkspaceLoaderContext(request, params.id);
  if (!result.ok) return result.response;
  const { headers, workspaceId } = result.ctx;

  const workspaceData = await getWorkspaceById(workspaceId);
  if (!workspaceData) {
    return routeData({ workspace: null, error: "Workspace not found" }, { headers, status: 404 });
  }

  return routeData({ workspace: workspaceData, error: null }, { headers });
}
