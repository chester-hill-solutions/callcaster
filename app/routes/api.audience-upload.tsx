import { json } from "@remix-run/node";
import { verifyAuth } from "~/lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401, headers });
  }

  // Only allow POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers });
  }

  const formData = await request.formData();
  const workspaceId = formData.get("workspace_id") as string;
  const audienceName = formData.get("audience_name") as string;
  const audienceIdStr = formData.get("audience_id") as string;
  const contactsFile = formData.get("contacts") as File;
  const headerMapping = formData.get("header_mapping") as string;
  const splitNameColumn = formData.get("split_name_column") as string;
  
  if (!workspaceId) {
    return json({ error: "Workspace ID is required" }, { status: 400, headers });
  }

  if (!audienceIdStr && !audienceName) {
    return json({ error: "Either Audience ID or Audience name is required" }, { status: 400, headers });
  }

  if (!contactsFile) {
    return json({ error: "Contacts file is required" }, { status: 400, headers });
  }

  try {
    // If audienceId is provided, use it; otherwise create a new audience
    let finalAudienceId: number;
    
    if (audienceIdStr) {
      const audienceId = parseInt(audienceIdStr, 10);
      
      // Verify the audience exists and belongs to the workspace
      const { data: existingAudience, error: audienceCheckError } = await supabaseClient
        .from("audience")
        .select("id")
        .eq("id", audienceId)
        .eq("workspace", workspaceId)
        .single();
        
      if (audienceCheckError || !existingAudience) {
        return json({ error: "Audience not found or not accessible" }, { status: 404, headers });
      }
      
      finalAudienceId = audienceId;
      
      // Update the audience status to indicate it's being updated
      await supabaseClient
        .from("audience")
        .update({
          status: "updating"
        })
        .eq("id", finalAudienceId);
    } else {
      // Create a new audience
      const { data: audienceData, error: audienceError } = await supabaseClient
        .from("audience")
        .insert({
          name: audienceName,
          workspace: workspaceId,
          status: "pending"
        })
        .select()
        .single();

      if (audienceError) {
        return json({ error: audienceError.message }, { status: 500, headers });
      }

      finalAudienceId = audienceData.id;
    }

    // Convert file to base64 for sending to edge function
    const fileContent = await contactsFile.arrayBuffer();
    const fileContentText = new TextDecoder().decode(fileContent);
    
    // Use a safer encoding method that can handle non-ASCII characters
    // First encode the string as UTF-8, then encode to base64
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(fileContentText);
    
    // Convert the UTF-8 bytes to base64 using a safe method
    const fileBase64 = Buffer.from(utf8Bytes).toString('base64');

    // Create an upload record
    const { data: uploadData, error: uploadError } = await supabaseClient
      .from("audience_upload")
      .insert({
        audience_id: finalAudienceId,
        workspace: workspaceId,
        created_by: user.id,
        status: "pending",
        file_name: contactsFile.name,
        file_size: contactsFile.size,
        total_contacts: 0,
        processed_contacts: 0,
        header_mapping: headerMapping ? JSON.parse(headerMapping) : {},
        split_name_column: splitNameColumn || null
      })
      .select()
      .single();

    if (uploadError) {
      return json({ error: uploadError.message }, { status: 500, headers });
    }

    const uploadId = uploadData.id;

    // Call the edge function to process the file
    const { data: edgeData, error: edgeError } = await supabaseClient.functions.invoke(
      "process-audience-upload",
      {
        body: {
          uploadId,
          audienceId: finalAudienceId,
          workspaceId,
          userId: user.id,
          fileContent: fileBase64,
          headerMapping: headerMapping ? JSON.parse(headerMapping) : {},
          splitNameColumn: splitNameColumn || null
        }
      }
    );

    if (edgeError) {
      // Update upload status to error if edge function fails
      await supabaseClient
        .from("audience_upload")
        .update({
          status: "error",
          error_message: edgeError.message
        })
        .eq("id", uploadId);
        
      return json({ error: edgeError.message }, { status: 500, headers });
    }

    // Return the audience ID and upload ID immediately
    return json(
      { 
        success: true, 
        audience_id: finalAudienceId,
        upload_id: uploadId,
        message: audienceIdStr 
          ? "File upload started. Processing in background." 
          : "Audience created and file upload started. Processing in background."
      }, 
      { headers }
    );
  } catch (error) {
    console.error("Error in audience upload:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return json(
      { error: errorMessage },
      { status: 500, headers }
    );
  }
}; 