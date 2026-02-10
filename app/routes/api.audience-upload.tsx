import { json } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import { parseCSV } from "../lib/csv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";

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
function isOtherDataArray(value: unknown): value is Array<{ key: string; value: unknown }> {
  return Array.isArray(value) && value.every(item => 
    typeof item === 'object' && 
    item !== null && 
    'key' in item && 
    'value' in item
  );
}

// Generate a unique ID without using uuid package
const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
};

// Process audience upload in background
const processAudienceUpload = async (
  supabaseClient: SupabaseClient<Database>,
  uploadId: number,
  audienceId: number,
  workspaceId: string,
  userId: string,
  fileContent: string,
  headerMapping: Record<string, string>,
  splitNameColumn: string | null
) => {
  // Initialize status data at the top level so it's available in catch block
  const statusData = {
    status: "processing",
    progress: 0,
    uploadId,
    audienceId,
    workspaceId,
    stage: "Starting upload",
    created_at: new Date().toISOString()
  };

  try {
    // First verify the bucket exists
    const { data: buckets, error: bucketError } = await supabaseClient.storage
      .listBuckets();
    
    if (bucketError) {
      throw new Error(`Error listing buckets: ${bucketError.message}`);
    }

    const audienceUploadsBucket = buckets?.find((b: StorageBucket) => b.name === 'audience-uploads');
    if (!audienceUploadsBucket) {
      // Create the bucket if it doesn't exist
      const { error: createError } = await supabaseClient.storage
        .createBucket('audience-uploads', { public: false });
      
      if (createError) {
        throw new Error(`Error creating bucket: ${createError.message}`);
      }
    }

    // Create initial status file
    const { error: statusError } = await supabaseClient.storage
      .from("audience-uploads")
      .upload(`${workspaceId}/${uploadId}.json`, JSON.stringify(statusData), {
        contentType: "application/json",
        upsert: true
      });

    if (statusError) {
      throw new Error(`Error creating status file: ${statusError.message}`);
    }

    // Parse the CSV content
    const decodedContent = Buffer.from(fileContent, 'base64').toString('utf-8');
    const { contacts: parsedContacts, headers } = parseCSV(decodedContent);

    // Create case-insensitive header lookup
    const headerLookup = new Map(
      headers.map(header => [header.toLowerCase(), header])
    );

    // Validate that all mapped headers exist in the CSV (case-insensitive)
    const missingHeaders = Object.keys(headerMapping).filter(
      header => !headerLookup.has(header.toLowerCase())
    );
    if (missingHeaders.length > 0) {
      throw new Error(`Missing headers in CSV: ${missingHeaders.join(', ')}`);
    }

    // Update total contacts count
    await supabaseClient
      .from("audience_upload")
      .update({
        total_contacts: parsedContacts.length
      })
      .eq("id", uploadId);

    // Process contacts in chunks
    const CHUNK_SIZE = 100;
    let processedCount = 0;

    for (let i = 0; i < parsedContacts.length; i += CHUNK_SIZE) {
      const chunk = parsedContacts.slice(i, i + CHUNK_SIZE);
      
      // Map the contacts according to the header mapping
      const mappedContacts = chunk.map((contact: CSVContact) => {
        logger.debug('Processing contact:', contact);
        
        const mappedContact: MappedContact = {
          workspace: workspaceId,
          created_by: userId,
          other_data: []
        };

        // Handle name splitting if specified
        if (splitNameColumn) {
          const actualHeader = headerLookup.get(splitNameColumn.toLowerCase());
          if (actualHeader) {
            const fullName = contact[actualHeader] || '';
            const [firstName, ...lastNameParts] = fullName.split(' ');
            mappedContact.firstname = firstName || '';
            mappedContact.surname = lastNameParts.join(' ') || '';
          }
        }

        // Map other fields
        Object.entries(headerMapping).forEach(([csvHeader, dbField]) => {
          // Get the actual header with correct case from CSV
          const actualHeader = headerLookup.get(csvHeader.toLowerCase());
          if (!actualHeader) {
            logger.warn(`Warning: CSV header "${csvHeader}" not found in file. Available headers:`, headers);
            return;
          }

          const value = contact[actualHeader];
            //console.log(`Mapping ${actualHeader} (${typeof value}) -> ${dbField}:`, value);

          if (dbField !== 'name') { // Skip the name field as it's handled above
            if (dbField === 'other_data') {
              // Add to other_data array as a key-value pair
              if (value !== undefined) {
                mappedContact.other_data?.push({
                  key: actualHeader,
                  value: value
                });
              }
            } else {
              if (value !== undefined) {
                mappedContact[dbField] = value;
              }
            }
          }
        });

        // Remove other_data if empty
        if (!mappedContact.other_data?.length) {
          delete mappedContact.other_data;
        }

        logger.debug('Final mapped contact:', mappedContact);
        return mappedContact;
      });

      // Log the first contact's transformation
      if (i === 0) {
        logger.debug('First chunk transformation:', {
          rawCsvRow: chunk[0],
          availableHeaders: headers,
          headerMapping,
          mappedResult: mappedContacts[0]
        });
      }

      // Insert contacts
      const { data: insertedContacts, error: insertError } = await supabaseClient
        .from("contact")
        .insert(mappedContacts as unknown as Partial<Tables<"contact">>[])
        .select('id, firstname, surname, other_data');

      if (insertError) {
        logger.error("Insert error details:", {
          error: insertError,
          firstContact: mappedContacts[0],
          mappingUsed: headerMapping,
          sampleData: {
            workspace: workspaceId,
            created_by: userId,
            mappedFields: Object.keys(mappedContacts[0])
          }
        });
        throw new Error(`Error inserting contacts: ${insertError.message}`);
      }

      logger.debug('Inserted contacts sample:', insertedContacts[0]);

      // Link contacts to audience
      const { error: linkError } = await supabaseClient
        .from("contact_audience")
        .insert(
          insertedContacts.map((contact: { id: number }) => ({
            contact_id: contact.id,
            audience_id: audienceId
          }))
        );

      if (linkError) {
        throw new Error(`Error linking contacts to audience: ${linkError.message}`);
      }

      // Update progress
      processedCount += chunk.length;
      const progress = Math.round((processedCount / parsedContacts.length) * 100);

      // Update status file
      await supabaseClient.storage
        .from("audience-uploads")
        .upload(`${workspaceId}/${uploadId}.json`, JSON.stringify({
          ...statusData,
          progress,
          stage: `Processing contacts (${processedCount}/${parsedContacts.length})`
        }), { upsert: true });

      // Update upload record
      await supabaseClient
        .from("audience_upload")
        .update({
          processed_contacts: processedCount,
          status: "processing"
        })
        .eq("id", uploadId);

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update audience status
    await supabaseClient
      .from("audience")
      .update({
        status: "active",
        total_contacts: processedCount
      })
      .eq("id", audienceId);

    // Update upload status to completed
    await supabaseClient
      .from("audience_upload")
      .update({
        status: "completed",
        processed_at: new Date().toISOString()
      })
      .eq("id", uploadId);

    // Update final status file
    await supabaseClient.storage
      .from("audience-uploads")
      .upload(`${workspaceId}/${uploadId}.json`, JSON.stringify({
        ...statusData,
        status: "completed",
        progress: 100,
        stage: "Upload completed"
      }), { upsert: true });

  } catch (error) {
    logger.error("Upload processing error:", error);
    
    // Update audience status to error
    await supabaseClient
      .from("audience")
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error"
      })
      .eq("id", audienceId);

    // Update upload status to error
    await supabaseClient
      .from("audience_upload")
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error"
      })
      .eq("id", uploadId);

    // Update status file
    await supabaseClient.storage
      .from("audience-uploads")
      .upload(`${workspaceId}/${uploadId}.json`, JSON.stringify({
        ...statusData,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      }), { upsert: true });
  }
};

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
      return json({ error: uploadError.message }, { status: 500, headers });
    }

    const uploadId = uploadData.id;

    // Start background processing
    processAudienceUpload(
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
    logger.error("Upload request error:", error);
    return json({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500, headers });
  }
}; 