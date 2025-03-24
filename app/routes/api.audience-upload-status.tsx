import { LoaderFunctionArgs, json } from "@remix-run/node";
import { verifyAuth } from "~/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const url = new URL(request.url);
  const uploadIdStr = url.searchParams.get("uploadId");
  const workspaceId = url.searchParams.get("workspaceId");

  if (!uploadIdStr || !workspaceId) {
    return json({ error: "Missing required parameters" }, { status: 400, headers });
  }

  const uploadId = parseInt(uploadIdStr, 10);
  if (isNaN(uploadId)) {
    return json({ error: "Invalid upload ID" }, { status: 400, headers });
  }

  try {
    // Get the status file from storage
    const { data: statusData, error: statusError } = await supabaseClient.storage
      .from("audience-uploads")
      .download(`${workspaceId}/${uploadId}.json`);

    if (statusError) {
      return json({ error: statusError.message }, { status: 500, headers });
    }

    // Parse the status JSON
    const status = JSON.parse(await statusData.text());

    // Get the upload record for additional details
    const { data: uploadData, error: uploadError } = await supabaseClient
      .from("audience_upload")
      .select("*")
      .eq("id", uploadId)
      .single();

    if (uploadError) {
      return json({ error: uploadError.message }, { status: 500, headers });
    }

    // Combine status file data with database record
    return json({
      ...status,
      file_name: uploadData.file_name,
      file_size: uploadData.file_size,
      total_contacts: uploadData.total_contacts,
      processed_contacts: uploadData.processed_contacts,
      error_message: uploadData.error_message
    }, { headers });

  } catch (error) {
    console.error("Error fetching upload status:", error);
    return json({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500, headers });
  }
}; 