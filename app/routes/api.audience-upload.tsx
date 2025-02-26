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
  const contactsFile = formData.get("contacts") as File;
  const headerMapping = formData.get("header_mapping") as string;
  const splitNameColumn = formData.get("split_name_column") as string;
  
  if (!workspaceId) {
    return json({ error: "Workspace ID is required" }, { status: 400, headers });
  }

  if (!audienceName) {
    return json({ error: "Audience name is required" }, { status: 400, headers });
  }

  if (!contactsFile) {
    return json({ error: "Contacts file is required" }, { status: 400, headers });
  }

  try {
    // Create the audience
    const { data: audienceData, error: audienceError } = await supabaseClient
      .from("audience")
      .insert({
        name: audienceName,
        workspace: workspaceId
      })
      .select()
      .single();

    if (audienceError) {
      return json({ error: audienceError.message }, { status: 500, headers });
    }

    const audienceId = audienceData.id;

    // Convert file to base64 for sending to edge function
    const fileContent = await contactsFile.arrayBuffer();
    const fileContentText = new TextDecoder().decode(fileContent);
    const fileBase64 = btoa(fileContentText);

    // Create an upload record
    const { data: uploadData, error: uploadError } = await supabaseClient
      .from("audience_upload")
      .insert({
        audience_id: audienceId,
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
          audienceId,
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
        audience_id: audienceId,
        upload_id: uploadId,
        message: "Audience created and file upload started. Processing in background."
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