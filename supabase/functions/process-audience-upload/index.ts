// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// @deno-types="https://deno.land/std@0.177.0/http/server.ts"
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"  
// @deno-types="https://esm.sh/@supabase/supabase-js@2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6"
import {
  buildContactsFromRecords,
  decodeBase64ToString,
  parseCsvRecords,
} from "../_shared/audience-upload.ts";

// Define the request body interface
interface RequestBody {
  uploadId: number;
  audienceId: number;
  workspaceId: string;
  userId: string;
  fileContent: string; // base64 encoded CSV
  headerMapping: Record<string, string>;
  splitNameColumn: string | null;
}

// Export handler so it can be tested without starting a server on import.
export async function handleRequest(req: Request): Promise<Response> {
  // Clone the request to avoid consuming the body multiple times
  const reqClone = req.clone();
  let body: RequestBody | null = null;
  
  try {
    // Get the request body
    body = await reqClone.json() as RequestBody;
    
    // Create a Supabase client with service role key for admin access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );
    
    // Decode + parse CSV
    const fileContent = decodeBase64ToString(body.fileContent);
    const records = parseCsvRecords(fileContent);
    
    // Update upload with total contacts and set status to processing
    await supabaseAdmin
      .from("audience_upload")
      .update({
        status: "processing",
        total_contacts: records.length,
        processed_contacts: 0
      })
      .eq("id", body.uploadId);
    
    // Process all contacts
    const processedContacts = buildContactsFromRecords({
      body,
      records,
    });
    
    // Insert contacts in batches of 100
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < processedContacts.length; i += BATCH_SIZE) {
      const batch = processedContacts.slice(i, i + BATCH_SIZE);
      
      // Insert contacts
      const { data: insertedContacts, error: insertError } = await supabaseAdmin
        .from("contact")
        .insert(batch)
        .select('id');
      
      if (insertError) {
        throw new Error(`Failed to insert contacts: ${insertError.message}`);
      }
      
      // Create audience-contact relationships
      if (insertedContacts && insertedContacts.length > 0) {
        const audienceLinks = insertedContacts.map((contact: { id: number }) => ({
          contact_id: contact.id,
          audience_id: body!.audienceId,
        }));
        
        const { error: linkError } = await supabaseAdmin
          .from("contact_audience")
          .insert(audienceLinks);
        
        if (linkError) {
          throw new Error(`Failed to link contacts to audience: ${linkError.message}`);
        }
      }
      
      // Update processed count
      insertedCount += batch.length;
      await supabaseAdmin
        .from("audience_upload")
        .update({
          processed_contacts: insertedCount,
          status: insertedCount >= records.length ? "completed" : "processing"
        })
        .eq("id", body.uploadId);
    }
    
    // Final update to mark completion
    await supabaseAdmin
      .from("audience_upload")
      .update({
        status: "completed",
        processed_at: new Date().toISOString()
      })
      .eq("id", body.uploadId);
    
    // Update the audience with the total contacts
    await supabaseAdmin
      .from("audience")
      .update({
        total_contacts: insertedCount
      })
      .eq("id", body.audienceId);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Audience upload processed successfully",
        total_contacts: insertedCount
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing audience upload:", error);
    
    // Update upload with error status
    try {
      if (body) {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") || "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
        );
        
        await supabaseAdmin
          .from("audience_upload")
          .update({
            status: "error",
            error_message: error instanceof Error ? error.message : "Unknown error"
          })
          .eq("id", body.uploadId);
      }
    } catch (updateError) {
      console.error("Failed to update upload status:", updateError);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred"
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-audience-upload' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
