import { LoaderFunctionArgs, json } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const url = new URL(request.url);
    const exportId = url.searchParams.get("exportId");
    const workspaceId = url.searchParams.get("workspaceId");
    
    if (!exportId || !workspaceId) {
      return json({ error: "Missing required parameters" }, { status: 400 });
    }
    
    // Download the status file from Supabase storage
    const { data: statusFile, error: downloadError } = await supabaseClient.storage
      .from("campaign-exports")
      .download(`${workspaceId}/${exportId}.json`);

    if (downloadError) {
      if (downloadError.message.includes("Object not found")) {
        return json({ error: "Export not found" }, { status: 404 });
      }
      throw downloadError;
    }
    
    // Read and parse the status data
    const statusData = await statusFile.text();
    const status = JSON.parse(statusData);
    
    return json(status);
  } catch (error) {
    logger.error("Status check error:", error);
    return json({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}; 