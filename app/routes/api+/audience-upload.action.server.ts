import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { parseCSV } from '@/lib/csv';
import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { Database, Tables } from "@/lib/database.types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

interface StorageBucket {
  id: string;
  name: string;
  owner: string;
  created_at: string;
  updated_at: string;
  public: boolean;
}

interface CSVContact {
  [key: string]: string;
}

interface MappedContact {
  id?: number;
  workspace: string;
  created_by: string;
  firstname?: string;
  surname?: string;
  other_data?: Array<{ key: string; value: unknown }>; // JSONB array of key-value pairs
  [key: string]: unknown;
}

// Type guard for other_data array

type AudienceUploadDeps = Partial<{
  verifyAuth: (
    request: Request,
  ) => Promise<{
    supabaseClient: SupabaseClient<Database>;
    headers: Headers;
    user: User | null;
  }>;
  processAudienceUpload: typeof processAudienceUpload;
}>;

export const action = async ({
  request,
  deps,
}: {
  request: Request;
  deps?: AudienceUploadDeps;
}) => {

  const d = {
    verifyAuth: deps?.verifyAuth ?? verifyAuth,
    processAudienceUpload: deps?.processAudienceUpload ?? processAudienceUpload,
  };
  const { supabaseClient, headers, user } = await d.verifyAuth(request);
  
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401, headers });
  }

  // Only allow POST requests
  if (request.method !== "POST") {
    return routeData({ error: "Method not allowed" }, { status: 405, headers });
  }

  const formData = await request.formData();
  const workspaceId = formData.get("workspace_id") as string;
  const audienceName = formData.get("audience_name") as string;
  const audienceIdStr = formData.get("audience_id") as string;
  const contactsFile = formData.get("contacts") as File;
  const headerMapping = formData.get("header_mapping") as string;
  const splitNameColumn = formData.get("split_name_column") as string;
  
  if (!workspaceId) {
    return routeData({ error: "Workspace ID is required" }, { status: 400, headers });
  }

  if (!audienceIdStr && !audienceName) {
    return routeData({ error: "Either Audience ID or Audience name is required" }, { status: 400, headers });
  }

  if (!contactsFile) {
    return routeData({ error: "Contacts file is required" }, { status: 400, headers });
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
        return routeData({ error: "Audience not found or not accessible" }, { status: 404, headers });
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
        return routeData({ error: audienceError.message }, { status: 500, headers });
      }

      finalAudienceId = audienceData.id;
    }

    // Convert file to base64 for processing
    const fileContent = await contactsFile.arrayBuffer();
    const fileContentText = new TextDecoder().decode(fileContent);
    
    // Use a safer encoding method that can handle non-ASCII characters
    // First encode the string as UTF-8, then encode to base64
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(fileContentText);
    
    // Convert the UTF-8 bytes to base64
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
      return routeData({ error: uploadError.message }, { status: 500, headers });
    }

    const uploadId = uploadData.id;

    // Start background processing
    d.processAudienceUpload(
      supabaseClient,
      uploadId,
      finalAudienceId,
      workspaceId,
      user.id,
      fileBase64,
      headerMapping ? JSON.parse(headerMapping) : {},
      splitNameColumn || null
    ).catch(error => {
      logger.error("Background processing error:", error);
    });

    // Return the audience ID and upload ID immediately
    return routeData(
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
    logger.error("Upload request error:", error);
    return routeData({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500, headers });
  }
}
