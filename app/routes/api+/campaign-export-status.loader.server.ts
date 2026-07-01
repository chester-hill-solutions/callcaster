import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { downloadObject } from "@/lib/object-storage.server";

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
    
    // Download the status file from object storage
    let statusBuffer: Buffer;
    try {
      statusBuffer = await downloadObject(
        "campaign-exports",
        `${workspaceId}/${exportId}.json`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("Object not found")) {
        return routeData({ error: "Export not found" }, { status: 404 });
      }
      throw error;
    }

    // Read and parse the status data
    const status = JSON.parse(statusBuffer.toString());
    
    return routeData(status);
  } catch (error) {
    logger.error("Status check error:", error);
    return routeData({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}
