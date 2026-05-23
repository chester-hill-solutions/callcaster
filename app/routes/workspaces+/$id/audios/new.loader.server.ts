import { data as routeData } from "react-router";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return routeData(
      { workspace: null, error: "Workspace does not exist" },
      { headers },
    );
  }

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
