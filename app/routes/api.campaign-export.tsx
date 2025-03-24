import { ActionFunctionArgs, json } from "@remix-run/node";
import { verifyAuth } from "~/lib/supabase.server";
import { createClient } from "@supabase/supabase-js";
import { Database } from "~/lib/database.types";
import fs from "fs";
import path from "path";

// Create a temporary directory for exports if it doesn't exist
const EXPORT_DIR = path.join(process.cwd(), "public", "exports");
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Generate a unique ID without using uuid package
const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
};

// Configuration for cleanup
const CLEANUP_CONFIG = {
  MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_FILES_PER_WORKSPACE: 50,      // Maximum number of export files per workspace
  CLEANUP_BATCH_SIZE: 100,          // Number of files to process in one cleanup batch
};

// Enhanced cleanup function with better error handling and logging
const cleanupOldExports = async () => {
  try {
    const files = fs.readdirSync(EXPORT_DIR);
    const now = Date.now();

    // Group files by workspace and type
    const fileGroups = files.reduce((acc, file) => {
      // Skip non-export files
      if (!file.endsWith('.csv') && !file.endsWith('.json')) {
        return acc;
      }

      // Get file stats
      const filePath = path.join(EXPORT_DIR, file);
      const stats = fs.statSync(filePath);

      // Check if file is older than MAX_AGE_MS
      if (now - stats.mtimeMs > CLEANUP_CONFIG.MAX_AGE_MS) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Error deleting old file ${file}:`, error);
        }
      }

      return acc;
    }, {});

    // Log cleanup summary
    console.log(`Export cleanup completed. Processed ${files.length} files.`);
  } catch (error) {
    console.error("Error during export cleanup:", error);
  }
};

// Schedule periodic cleanup
const scheduleCleanup = () => {
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // Run cleanup every hour
  setInterval(cleanupOldExports, CLEANUP_INTERVAL);
};

// Initialize cleanup schedule when the server starts
scheduleCleanup();

// Define types for our data structures
interface Contact {
  id: number | string;
  firstname?: string | null;
  surname?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  opt_out?: boolean | null;
  created_at?: string | null;
  workspace?: string | null;
  external_id?: string | null;
  address_id?: string | null;
  postal?: string | null;
  carrier?: string | null;
  province?: string | null;
  country?: string | null;
  created_by?: string | null;
  date_updated?: string | null;
  other_data?: any;
}

interface ContactWithPhonePatterns extends Contact {
  cleanPhone: string;
  cleanPhoneNoCountry: string;
  cleanPhoneWithCountry: string;
}

interface Message {
  id: string;
  body?: string;
  from?: string;
  to?: string;
  direction?: string;
  status?: string;
  date_sent?: string;
  date_created?: string;
  workspace?: string;
}

interface MessageWithContact extends Message {
  contact: ContactWithPhonePatterns;
  message_date: string;
}

interface Call {
  id?: string | null;
  sid?: string | null;
  duration?: string | null;
  status?: string | null;
  answered_by?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  outreach_attempt_id?: string | number | null;
  parent_call_sid?: string | null;
}

interface OutreachAttempt {
  id: number | string;
  contact_id: number | string;
  campaign_id: number;
  disposition?: string | null;
  result?: any;
  created_at?: string | null;
}

interface AttemptWithDetails extends OutreachAttempt {
  contact: Contact;
  call: Call;
}

interface Campaign {
  id: number;
  title?: string;
  start_date: string;
  end_date: string;
  type?: string;
  status?: string;
}

interface ScriptBlock {
  id: string;
  type: string;
  title?: string;
}

interface ScriptStep {
  title?: string;
  blocks?: ScriptBlock[];
}

interface ScriptSteps {
  pages: {
    [key: string]: {
      id: string;
      title?: string;
      blocks: string[];
    };
  };
  blocks: {
    [key: string]: {
      id: string;
      type: string;
      title?: string;
      content?: string;
      options?: Array<{
        next: string;
        value: string;
        content: string;
      }>;
      audioFile?: string;
      responseType?: string;
    };
  };
}

interface Script {
  id: number;
  name: string;
  type: string | null;
  steps: ScriptSteps;
  workspace: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

// Process message campaign export in chunks
const processMessageCampaignExport = async (
  supabaseClient: ReturnType<typeof createClient<Database>>,
  campaignId: number,
  workspaceId: string,
  exportId: string
) => {
  const exportFilePath = path.join(EXPORT_DIR, `${exportId}.csv`);
  const statusFilePath = path.join(EXPORT_DIR, `${exportId}.json`);

  try {
    // Initialize CSV file
    fs.writeFileSync(exportFilePath, '');

    // First, get campaign info
    const { data: campaignData, error: campaignError } = await supabaseClient
      .from('campaign')
      .select('id, title, start_date, end_date')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaignData) {
      throw new Error(campaignError?.message || "Campaign not found");
    }

    const campaign = campaignData as Campaign;

    // Get contacts in campaign queue
    const { data: campaignContacts, error: contactsError } = await supabaseClient
      .from('campaign_queue')
      .select('contact_id')
      .eq('campaign_id', campaignId);

    if (contactsError) {
      throw new Error(contactsError.message || "Error fetching campaign contacts");
    }

    const contactIds = campaignContacts.map(c => c.contact_id);

    if (contactIds.length === 0) {
      throw new Error("No contacts found in campaign");
    }

    // Get contact details in batches
    const CONTACT_BATCH_SIZE = 100;
    let contactDetails: Contact[] = [];

    for (let i = 0; i < contactIds.length; i += CONTACT_BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + CONTACT_BATCH_SIZE);

      const { data: contactBatch, error: batchError } = await supabaseClient
        .from('contact')
        .select('*')
        .in('id', batchIds)
        .eq('workspace', workspaceId);

      if (batchError) {
        throw new Error(batchError.message || `Error fetching contact batch ${i}`);
      }

      if (contactBatch) {
        contactDetails = [...contactDetails, ...contactBatch];
      }

      // Update status
      const progress = Math.round((i / contactIds.length) * 30); // First 30% is contact fetching
      fs.writeFileSync(statusFilePath, JSON.stringify({
        status: "processing",
        progress,
        exportId,
        filename: `campaign_export_${campaignId}.csv`,
        stage: "Fetching contacts"
      }));
    }

    // Process contacts to get phone patterns
    const contactPhonePatterns: ContactWithPhonePatterns[] = contactDetails.map(contact => {
      const phone = contact.phone || '';
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const cleanPhoneNoCountry = cleanPhone.substring(1);
      const cleanPhoneWithCountry = `1${cleanPhone}`;

      return {
        ...contact,
        cleanPhone,
        cleanPhoneNoCountry,
        cleanPhoneWithCountry
      };
    });

    // Get messages in small chunks
    const extendedEndDate = new Date();
    if (campaign.end_date) {
      const endDate = new Date(campaign.end_date);
      extendedEndDate.setTime(endDate.getTime() + (5 * 24 * 60 * 60 * 1000)); // Add 5 days
    }

    const MESSAGE_CHUNK_SIZE = 100;
    let totalMessages = 0;
    let processedMessages = 0;
    let isFirstChunk = true;

    // First, get a count of messages in the date range
    const { count: messageCount, error: countError } = await supabaseClient
      .from('message')
      .select('*', { count: 'exact', head: true })
      .eq('workspace', workspaceId)
      .gte('date_created', campaign.start_date)
      .lte('date_created', extendedEndDate.toISOString());

    if (countError) {
      throw new Error(countError.message || "Error counting messages");
    }

    totalMessages = messageCount || 0;

    // Process messages in small chunks
    for (let offset = 0; offset < totalMessages; offset += MESSAGE_CHUNK_SIZE) {
      // Get a chunk of messages
      const { data: messages, error: messagesError } = await supabaseClient
        .from('message')
        .select('*')
        .eq('workspace', workspaceId)
        .gte('date_created', campaign.start_date)
        .lte('date_created', extendedEndDate.toISOString())
        .order('date_created', { ascending: true })
        .range(offset, offset + MESSAGE_CHUNK_SIZE - 1);

      if (messagesError) {
        throw new Error(messagesError.message || `Error fetching messages chunk at offset ${offset}`);
      }

      if (!messages || messages.length === 0) {
        break;
      }

      // Process messages to match with contacts
      const matchedMessages: MessageWithContact[] = [];

      for (const message of messages as unknown as Message[]) {
        const cleanFrom = (message.from || '').replace(/[^0-9]/g, '');
        const cleanTo = (message.to || '').replace(/[^0-9]/g, '');

        // Find matching contact
        const matchingContact = contactPhonePatterns.find(contact =>
          contact.cleanPhone === cleanFrom ||
          contact.cleanPhone === cleanTo ||
          contact.cleanPhoneNoCountry === cleanFrom ||
          contact.cleanPhoneNoCountry === cleanTo ||
          contact.cleanPhoneWithCountry === cleanFrom ||
          contact.cleanPhoneWithCountry === cleanTo
        );

        if (matchingContact) {
          matchedMessages.push({
            ...message,
            contact: matchingContact,
            message_date: message.date_sent || message.date_created || new Date().toISOString()
          });
        }
      }

      // Convert matched messages to CSV
      if (matchedMessages.length > 0) {
        let csvData = '';

        // Add headers if first chunk
        if (isFirstChunk) {
          csvData = 'body,direction,status,message_date,id,firstname,surname,phone,email,address,city,opt_out,created_at,workspace,external_id,address_id,postal,carrier,province,country,contact_phone,campaign_name,campaign_start_date,campaign_end_date\n';
          isFirstChunk = false;
        }

        // Add data rows
        for (const item of matchedMessages) {
          csvData += [
            escapeCsvField(item.body || ''),
            escapeCsvField(item.direction || ''),
            escapeCsvField(item.status || ''),
            escapeCsvField(item.message_date || ''),
            escapeCsvField(item.contact.id || ''),
            escapeCsvField(item.contact.firstname || ''),
            escapeCsvField(item.contact.surname || ''),
            escapeCsvField(item.contact.phone || ''),
            escapeCsvField(item.contact.email || ''),
            escapeCsvField(item.contact.address || ''),
            escapeCsvField(item.contact.city || ''),
            escapeCsvField(item.contact.opt_out ? 'true' : 'false'),
            escapeCsvField(item.contact.created_at || ''),
            escapeCsvField(item.contact.workspace || ''),
            escapeCsvField(item.contact.external_id || ''),
            escapeCsvField(item.contact.address_id || ''),
            escapeCsvField(item.contact.postal || ''),
            escapeCsvField(item.contact.carrier || ''),
            escapeCsvField(item.contact.province || ''),
            escapeCsvField(item.contact.country || ''),
            escapeCsvField(item.contact.cleanPhone || ''),
            escapeCsvField(JSON.stringify(item.contact.other_data) || ''),
            escapeCsvField(campaign.title || ''),
            escapeCsvField(campaign.start_date || ''),
            escapeCsvField(campaign.end_date || '')
          ].join(',') + '\n';
        }

        // Append to file
        fs.appendFileSync(exportFilePath, csvData);
      }

      processedMessages += messages.length;

      // Update status
      const progress = 30 + Math.round((processedMessages / totalMessages) * 70); // Remaining 70% is message processing
      fs.writeFileSync(statusFilePath, JSON.stringify({
        status: "processing",
        progress: Math.min(progress, 99),
        exportId,
        filename: `campaign_export_${campaignId}.csv`,
        stage: "Processing messages",
        processed: processedMessages,
        total: totalMessages
      }));

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update status to completed
    fs.writeFileSync(statusFilePath, JSON.stringify({
      status: "completed",
      progress: 100,
      exportId,
      filename: `campaign_export_${campaignId}.csv`,
      downloadUrl: `/exports/${exportId}.csv`
    }));

    // Clean up old exports
    cleanupOldExports();
  } catch (error) {
    console.error("Export error:", error);
    // Update status to error
    fs.writeFileSync(statusFilePath, JSON.stringify({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      exportId
    }));
  }
};

// Process call campaign export in chunks
const processCallCampaignExport = async (
  supabaseClient: ReturnType<typeof createClient<Database>>,
  campaignId: number,
  exportId: string
) => {
  const exportFilePath = path.join(EXPORT_DIR, `${exportId}.csv`);
  const statusFilePath = path.join(EXPORT_DIR, `${exportId}.json`);

  try {
    // Initialize CSV file
    fs.writeFileSync(exportFilePath, '');

    // First, get campaign info
    const { data: campaignData, error: campaignError } = await supabaseClient
      .from('campaign')
      .select('id, title, start_date, end_date, type, status')
      .eq('id', campaignId)
      .single();
    if (campaignError || !campaignData) {
      throw new Error(campaignError?.message || "Campaign not found");
    }
    const campaignTableKey = campaignData?.type === "live_call" ? "live_campaign" : "ivr_campaign";
    const { data: scriptData, error: scriptError } = await supabaseClient
      .from(campaignTableKey)
      .select('id, script_id, script(*)')
      .eq('campaign_id', campaignId)
      .single();
    if (scriptError) {
      throw new Error(scriptError.message || "Error fetching script");
    }
    
    // First cast to any to bypass type checking, then to Script
    // This is safe because we know the structure matches our Script interface
    const script = (scriptData?.script as any) as Script;

    const campaign = campaignData as Campaign;

    // Initialize scriptQuestions array with proper type
    const scriptQuestions: Array<{ id: string; title: string }> = [];
    
    // Extract pages and blocks from the nested script structure
    const pages = Object.entries(script?.steps?.pages || {})
      .map(([pageId, pageData]) => ({
        id: pageId,
        title: pageData.title || pageId,
        blocks: pageData.blocks || []
      }));

    // Get all blocks from the script
    const blocks = script?.steps?.blocks || {};
    
    // Extract questions from blocks
    pages.forEach(page => {
      if (Array.isArray(page.blocks)) {
        page.blocks.forEach(blockId => {
          const block = blocks[blockId];
          if (block && (block.type === 'question' || block.type === 'recorded' || block.type === 'dtmf')) {
            scriptQuestions.push({
              id: block.title || block.id,
              title: block.title || block.id
            });
          }
        });
      }
    });

    // Get count of outreach attempts
    const { count: attemptCount, error: countError } = await supabaseClient
      .from('outreach_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    if (countError) {
      throw new Error(countError.message || "Error counting attempts");
    }

    const totalAttempts = attemptCount || 0;
    const ATTEMPT_CHUNK_SIZE = 100;
    let processedAttempts = 0;
    let isFirstChunk = true;

    // Process attempts in small chunks
    for (let offset = 0; offset < totalAttempts; offset += ATTEMPT_CHUNK_SIZE) {
      // Get a chunk of attempts
      const { data: attempts, error: attemptsError } = await supabaseClient
        .from('outreach_attempt')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true })
        .range(offset, offset + ATTEMPT_CHUNK_SIZE - 1);

      if (attemptsError) {
        throw new Error(attemptsError.message || `Error fetching attempts chunk at offset ${offset}`);
      }

      if (!attempts || attempts.length === 0) {
        break;
      }

      // Get contact IDs from attempts
      const contactIds = [...new Set(attempts.map(a => a.contact_id))];

      // Get contacts
      const { data: contacts, error: contactsError } = await supabaseClient
        .from('contact')
        .select('*')
        .in('id', contactIds);

      if (contactsError) {
        throw new Error(contactsError.message || "Error fetching contacts for attempts");
      }

      const contactsMap: Record<string, Contact> = {};
      if (contacts) {
        contacts.forEach(contact => {
          contactsMap[contact.id] = contact;
        });
      }

      // Get call IDs from attempts
      const attemptIds = attempts.map(a => a.id);

      // Get calls
      const { data: calls, error: callsError } = await supabaseClient
        .from('call')
        .select('*')
        .in('outreach_attempt_id', attemptIds);

      if (callsError) {
        throw new Error(callsError.message || "Error fetching calls for attempts");
      }

      const callsMap: Record<string, Call> = {};
      if (calls) {
        calls.forEach(call => {
          if (call.outreach_attempt_id) {
            callsMap[call.outreach_attempt_id] = call;
          }
        });
      }

      // Match attempts with contacts and calls
      const matchedAttempts: AttemptWithDetails[] = (attempts as OutreachAttempt[]).map(attempt => {
        const contact = contactsMap[attempt.contact_id] || {} as Contact;
        const call = callsMap[attempt.id] || {} as Call;

        return {
          ...attempt,
          contact,
          call
        };
      });

      // Convert matched attempts to CSV
      if (matchedAttempts.length > 0) {
        let csvData = '';

        // Add headers if first chunk
        if (isFirstChunk) {
          const baseHeaders = 'attempt_id,disposition,full_result,attempt_start,call_sid,duration_seconds,answered_by,call_start,call_end,contact_id,firstname,surname,phone,email,address,city,opt_out,created_at,workspace,postal,province,country,campaign_name,campaign_start_date,campaign_end_date,campaign_type,campaign_status,credits_used,pages';
          
          // Add a column for each script question
          const questionColumns = scriptQuestions.map(q => escapeCsvField(q.title)).join(',');
          
          csvData = `${baseHeaders},${questionColumns}\n`;
          isFirstChunk = false;
        }

        // Add data rows
        for (const item of matchedAttempts) {
          const durationSeconds = item.call.duration ? parseInt(item.call.duration) : 0;
          const creditsUsed = Math.max(1, Math.ceil(durationSeconds / 60));

          // Track visited pages and responses
          const visitedPages = new Set<string>();
          const responses: Record<string, string> = {};

          // Extract responses from the attempt result
          if (item.result) {
            try {
              let resultObj: any;
              
              // Parse result if it's a string
              if (typeof item.result === 'string') {
                resultObj = JSON.parse(item.result);
              } else {
                resultObj = item.result;
              }

              Object.entries(resultObj).forEach(([pageId, pageData]: [string, any]) => {
                if (typeof pageData === 'object' && pageData !== null) {
                  visitedPages.add(pageId);
                  
                  // Extract responses directly from the page data
                  Object.entries(pageData).forEach(([key, value]: [string, any]) => {
                    // Store response by the key directly - we'll match with script questions later
                    responses[key] = String(value);
                   
                  });
                }
              });

            } catch (e) {
              console.error('Error parsing result:', e, 'Raw result:', item.result);
            }
          }

          // Format pages data
          const pageResponses = pages
            .filter(page => visitedPages.has(page.id))
            .map(page => page.title)
            .join('|');

          const baseData = [
            escapeCsvField(item.id || ''),
            escapeCsvField(item.disposition || item.call.status || ''),
            escapeCsvField(JSON.stringify(item.result) || ''),
            escapeCsvField(item.created_at || ''),
            escapeCsvField(item.call.sid || ''),
            escapeCsvField(durationSeconds.toString()),
            escapeCsvField(item.call.answered_by || ''),
            escapeCsvField(item.call.start_time || item.call.date_created || ''),
            escapeCsvField(item.call.end_time || item.call.date_updated || ''),
            escapeCsvField(item.contact.id || ''),
            escapeCsvField(item.contact.firstname || ''),
            escapeCsvField(item.contact.surname || ''),
            escapeCsvField(item.contact.phone || ''),
            escapeCsvField(item.contact.email || ''),
            escapeCsvField(item.contact.address || ''),
            escapeCsvField(item.contact.city || ''),
            escapeCsvField(item.contact.opt_out ? 'true' : 'false'),
            escapeCsvField(item.contact.created_at || ''),
            escapeCsvField(item.contact.workspace || ''),
            escapeCsvField(item.contact.postal || ''),
            escapeCsvField(item.contact.province || ''),
            escapeCsvField(item.contact.country || ''),
            escapeCsvField(campaign.title || ''),
            escapeCsvField(campaign.start_date || ''),
            escapeCsvField(campaign.end_date || ''),
            escapeCsvField(campaign.type || ''),
            escapeCsvField(campaign.status || ''),
            escapeCsvField(creditsUsed.toString()),
            escapeCsvField(pageResponses)
          ];

          // Add a column for each script question's response
          const questionResponses = scriptQuestions.map(q => {
            // Look for response by the question's title/name instead of block ID
            const response = responses[q.id] || '';
            return escapeCsvField(response);
          });

          csvData += [...baseData, ...questionResponses].join(',') + '\n';
        }

        // Append to file
        fs.appendFileSync(exportFilePath, csvData);
      }

      processedAttempts += attempts.length;

      // Update status
      const progress = Math.round((processedAttempts / totalAttempts) * 100);
      fs.writeFileSync(statusFilePath, JSON.stringify({
        status: "processing",
        progress: Math.min(progress, 99),
        exportId,
        filename: `campaign_export_${campaignId}.csv`,
        stage: "Processing call attempts",
        processed: processedAttempts,
        total: totalAttempts
      }));

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update status to completed
    fs.writeFileSync(statusFilePath, JSON.stringify({
      status: "completed",
      progress: 100,
      exportId,
      filename: `campaign_export_${campaignId}.csv`,
      downloadUrl: `/exports/${exportId}.csv`
    }));

    // Clean up old exports
    cleanupOldExports();
  } catch (error) {
    console.error("Export error:", error);
    // Update status to error
    fs.writeFileSync(statusFilePath, JSON.stringify({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      exportId
    }));
  }
};

// Helper function to escape CSV fields
const escapeCsvField = (value: any): string => {
  if (value === null || value === undefined) return '';

  const stringValue = String(value);

  // If the value contains a comma, newline, or double quote, enclose it in double quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    // Replace double quotes with two double quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const formData = await request.formData();
    const campaignId = formData.get("campaignId");
    const workspaceId = formData.get("workspaceId");

    if (!campaignId || !workspaceId) {
      return new Response("Missing required parameters", { status: 400 });
    }

    // Get campaign type
    const { data: campaignData, error: campaignError } = await supabaseClient
      .from('campaign')
      .select('type')
      .eq('id', Number(campaignId))
      .single();

    if (campaignError || !campaignData) {
      return new Response(campaignError?.message || "Campaign not found", { status: 404 });
    }

    // Generate a unique ID for this export
    const exportId = generateUniqueId();

    // Create initial status file
    const statusFilePath = path.join(EXPORT_DIR, `${exportId}.json`);
    fs.writeFileSync(statusFilePath, JSON.stringify({
      status: "started",
      progress: 0,
      exportId,
      filename: `campaign_export_${campaignId}.csv`
    }));

    // Start the export process asynchronously based on campaign type
    if (campaignData.type === "message") {
      processMessageCampaignExport(
        supabaseClient,
        Number(campaignId),
        workspaceId.toString(),
        exportId
      );
    } else if (campaignData.type === "live_call" || campaignData.type === "robocall") {
      processCallCampaignExport(
        supabaseClient,
        Number(campaignId),
        exportId
      );
    } else {
      return new Response("Invalid campaign type", { status: 400 });
    }

    // Return the export ID immediately
    return ({
      exportId,
      status: "started",
      statusUrl: `/api/campaign-export-status?exportId=${exportId}`
    });
  } catch (error) {
    console.error("Export request error:", error);
    return new Response(error instanceof Error ? error.message : "Unknown error", { status: 500 });
  }
}; 