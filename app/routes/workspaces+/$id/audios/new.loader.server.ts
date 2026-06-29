import { data as routeData } from "react-router";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const result = await requireWorkspaceLoaderContext(request, params.id);
  if (!result.ok) return result.response;
  const { supabaseClient, headers, workspaceId } = result.ctx;

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();
  if (workspaceError) {
    return routeData({ workspace: null, error: workspaceError }, { headers });
  }

  return routeData({ workspace: workspaceData, error: null }, { headers });
}
