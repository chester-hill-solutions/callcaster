// @ts-nocheck
import { data as routeData, LoaderFunctionArgs } from "react-router";


export const loader = async ({ request }: LoaderFunctionArgs) => {  const { logger } = await import("@/lib/logger.server");
  const { verifyAuth } = await import("@/lib/supabase.server");
  const { requireWorkspaceAccess } = await import("@/lib/database.server");

  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const url = new URL(request.url);
    const exportId = url.searchParams.get("exportId");
    const workspaceId = url.searchParams.get("workspaceId");
    
    if (!exportId || !workspaceId) {
      return routeData({ error: "Missing required parameters" }, { status: 400 });
    }

    // Defense-in-depth: ensure the requesting user can access the workspace whose
    // export status they are attempting to read.
    await requireWorkspaceAccess({ supabaseClient, user, workspaceId });
    
    // Download the status file from Supabase storage
    const { data: statusFile, error: downloadError } = await supabaseClient.storage
      .from("campaign-exports")
      .download(`${workspaceId}/${exportId}.json`);

    if (downloadError) {
      if (downloadError.message.includes("Object not found")) {
        return routeData({ error: "Export not found" }, { status: 404 });
      }
      throw downloadError;
    }
    
    // Read and parse the status data
    const statusData = await statusFile.text();
    const status = JSON.parse(statusData);
    
    return routeData(status);
  } catch (error) {
    logger.error("Status check error:", error);
    return routeData({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}; 