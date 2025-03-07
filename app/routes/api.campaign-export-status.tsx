import { LoaderFunctionArgs, json } from "@remix-run/node";
import { verifyAuth } from "~/lib/supabase.server";
import fs from "fs";
import path from "path";

// Directory where exports are stored
const EXPORT_DIR = path.join(process.cwd(), "public", "exports");

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { user } = await verifyAuth(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const url = new URL(request.url);
    const exportId = url.searchParams.get("exportId");
    
    if (!exportId) {
      return json({ error: "Missing export ID" }, { status: 400 });
    }
    
    const statusFilePath = path.join(EXPORT_DIR, `${exportId}.json`);
    
    // Check if status file exists
    if (!fs.existsSync(statusFilePath)) {
      return json({ error: "Export not found" }, { status: 404 });
    }
    
    // Read and return the status
    const statusData = fs.readFileSync(statusFilePath, 'utf8');
    const status = JSON.parse(statusData);
    
    return json(status);
  } catch (error) {
    console.error("Status check error:", error);
    return json({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}; 