import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";

import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const user = getDualAuthUser(auth);
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
    await requireWorkspaceAccess({ user, workspaceId });
    
    // Download the status file from Postgres storage
    const { data: statusFile, error: downloadError } = await null.storage
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
}
