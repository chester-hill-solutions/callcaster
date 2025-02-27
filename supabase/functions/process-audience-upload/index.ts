// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// @deno-types="https://deno.land/std@0.177.0/http/server.ts"
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"  
// @deno-types="https://esm.sh/@supabase/supabase-js@2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6"

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

interface Contact {
  workspace: string;
  created_by: string;
  created_at: string;
  other_data: Array<Record<string, string>>;
  firstname?: string;
  surname?: string;
  [key: string]: any;
}

// Process CSV data with proper handling of quoted fields
function parseCSV(csvString: string): Record<string, string>[] {
  // Split the CSV into lines, handling potential line breaks within quoted fields
  const lines: string[] = [];
  let currentLine = '';
  let insideQuotes = false;
  
  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i];
    const nextChar = csvString[i + 1];
    
    if (char === '"') {
      // Handle escaped quotes (double quotes inside quoted fields)
      if (nextChar === '"') {
        currentLine += '"';
        i++; // Skip the next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !insideQuotes) {
      // End of line outside quotes
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r' && nextChar === '\n' && !insideQuotes) {
      // Handle Windows line endings (CRLF)
      lines.push(currentLine);
      currentLine = '';
      i++; // Skip the \n
    } else {
      // Regular character
      currentLine += char;
    }
  }
  
  // Add the last line if not empty
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // Parse the headers
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  // Create a normalized header map for case-insensitive matching
  const normalizedHeaderMap = new Map<string, string>();
  headers.forEach(header => {
    normalizedHeaderMap.set(header.trim().toLowerCase(), header);
  });
  
  // Parse each data row
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(`Line ${i+1} has ${values.length} fields, expected ${headers.length}`);
      // Try to adjust by adding empty fields or truncating
      while (values.length < headers.length) values.push('');
      if (values.length > headers.length) values.length = headers.length;
    }
    
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header.trim()] = values[index] ? values[index].trim() : '';
    });
    
    records.push(record);
  }
  
  return records;
}

// Parse a single CSV line, handling quoted fields correctly
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++; // Skip the next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // End of field
      result.push(currentField);
      currentField = '';
    } else {
      // Regular character
      currentField += char;
    }
  }
  
  // Add the last field
  result.push(currentField);
  
  // Clean up quotes at the beginning and end of fields
  return result.map(field => {
    field = field.trim();
    if (field.startsWith('"') && field.endsWith('"')) {
      return field.substring(1, field.length - 1);
    }
    return field;
  });
}

// Declare Deno namespace for TypeScript
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
  }
  export const env: Env;
}

// Use Deno.serve directly without importing
Deno.serve(async (req: Request) => {
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
    
    // Decode the base64 file content
    const fileContent = atob(body.fileContent);
    
    // Parse the CSV
    const records = parseCSV(fileContent);
    
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
    const processedContacts: Contact[] = records.map(row => {
      const contact: Contact = {
        workspace: body!.workspaceId,
        created_by: body!.userId,
        created_at: new Date().toISOString(),
        other_data: [],
        upload_id: body!.uploadId
      };
      
      // Create a map of normalized CSV headers for case-insensitive matching
      const normalizedRowHeaders = new Map<string, string>();
      Object.keys(row).forEach(header => {
        normalizedRowHeaders.set(header.trim().toLowerCase(), header);
      });
      
      // Apply header mapping
      Object.entries(body!.headerMapping).forEach(([originalHeader, mappedField]) => {
        // Normalize the original header for case-insensitive matching
        const normalizedOriginalHeader = originalHeader.trim().toLowerCase();
        // Find the actual header in the CSV that matches (case-insensitive)
        const actualHeader = normalizedRowHeaders.get(normalizedOriginalHeader);
        // Get the value using the actual header if found, otherwise try the original
        const value = actualHeader ? row[actualHeader] : row[originalHeader];
        
        if (body!.splitNameColumn && originalHeader === body!.splitNameColumn && mappedField === 'name') {
          // Handle name splitting properly
          const fullName = value || '';
          
          // Check if the name is in "Last, First" format
          if (fullName.includes(',')) {
            const [lastName, firstName] = fullName.split(',').map(part => part.trim());
            contact.firstname = firstName;
            contact.surname = lastName;
          } else {
            // Assume "First Last" format
            const nameParts = fullName.split(' ');
            if (nameParts.length > 1) {
              const lastName = nameParts.pop() || '';
              const firstName = nameParts.join(' ');
              contact.firstname = firstName;
              contact.surname = lastName;
            } else {
              // Just one word, assume it's a first name
              contact.firstname = fullName;
              contact.surname = '';
            }
          }
        } else if (mappedField === 'other_data') {
          // Store in other_data as JSON
          contact.other_data.push({ 
            [originalHeader]: value || '' 
          });
        } else {
          // Regular field mapping
          contact[mappedField] = value || '';
        }
      });
      
      return contact;
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
});

function sanitizeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  // Remove null bytes and other problematic characters
  return str.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\uFFFD]/g, '');
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-audience-upload' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
