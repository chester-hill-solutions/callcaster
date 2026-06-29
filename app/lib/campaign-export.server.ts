import { type SupabaseClient } from "@supabase/supabase-js";
import { csvRow } from "@/lib/csv";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import {
  castExportScript,
  createInitialExportStatus,
  extractScriptQuestions,
  finalizeCsvExport,
  parseAttemptResult,
  writeExportErrorStatus,
  writeExportStatus,
  type CampaignExportStatus,
} from "@/lib/campaign-export-helpers.server";
import type {
  ExportAttemptWithDetails,
  ExportCall,
  ExportCampaign,
  ExportContact,
  ExportContactWithPhonePatterns,
  ExportMessage,
  ExportMessageWithContact,
  ExportOutreachAttempt,
  ExportScript,
} from "@/lib/campaign-export-types.server";

export function generateCampaignExportId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
}

export async function processMessageCampaignExport(
  supabaseClient: SupabaseClient<Database>,
  campaignId: number,
  workspaceId: string,
  exportId: string,
  campaignName: string
) {
  // Initialize status
  let statusData: CampaignExportStatus = createInitialExportStatus({
    exportId,
    campaignName,
    workspaceId,
    campaignId,
  });

  try {
    statusData = await writeExportStatus(
      supabaseClient,
      workspaceId,
      exportId,
      statusData,
      {},
    );

    // First, get campaign info
    const { data: campaignData, error: campaignError } = await supabaseClient
      .from('campaign')
      .select('id, title, start_date, end_date')
      .eq('id', campaignId)
      .eq('workspace', workspaceId)
      .single();

    if (campaignError || !campaignData) {
      throw new Error(campaignError?.message || "Campaign not found");
    }

    const campaign = campaignData as ExportCampaign;

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

    // Initialize CSV lines with headers (store as lines to avoid O(n^2) string concatenation).
    const csvLines: string[] = [];
    csvLines.push(
      "body,direction,status,message_date,id,firstname,surname,phone,email,address,city,opt_out,created_at,workspace,external_id,address_id,postal,carrier,province,country,contact_phone,campaign_name,campaign_start_date,campaign_end_date",
    );

    // Get contact details in batches
    const CONTACT_BATCH_SIZE = 100;
    let contactDetails: ExportContact[] = [];

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

      statusData = await writeExportStatus(supabaseClient, workspaceId, exportId, statusData, {
        progress: Math.round((i / contactIds.length) * 30),
        stage: "Fetching contacts",
      });
    }

    // Process contacts to get phone patterns
    const contactPhonePatterns: ExportContactWithPhonePatterns[] = contactDetails.map(contact => {
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

    // Build a fast lookup for phone -> contact to avoid O(N*M) scans.
    const phoneToContact = new Map<string, ExportContactWithPhonePatterns>();
    for (const c of contactPhonePatterns) {
      const candidates = [
        c.cleanPhone,
        c.cleanPhoneNoCountry,
        c.cleanPhoneWithCountry,
      ].filter((v) => typeof v === "string" && v.length > 0);
      for (const p of candidates) {
        if (!phoneToContact.has(p)) phoneToContact.set(p, c);
      }
    }

    // Get messages in small chunks
    const extendedEndDate = new Date();
    if (campaign.end_date) {
      const endDate = new Date(campaign.end_date);
      extendedEndDate.setTime(endDate.getTime() + (5 * 24 * 60 * 60 * 1000)); // Add 5 days
    }

    const MESSAGE_CHUNK_SIZE = 100;
    let totalMessages = 0;
    let processedMessages = 0;

    // Count only messages recorded against this campaign to avoid leaking
    // unrelated workspace conversations that happen to share a phone number.
    const { count: messageCount, error: countError } = await supabaseClient
      .from('message')
      .select('*', { count: 'exact', head: true })
      .eq('workspace', workspaceId)
      .eq('campaign_id', campaignId)
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
        .eq('campaign_id', campaignId)
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
      const matchedMessages: ExportMessageWithContact[] = [];

      for (const message of messages as unknown as ExportMessage[]) {
        const cleanFrom = (message.from || '').replace(/[^0-9]/g, '');
        const cleanTo = (message.to || '').replace(/[^0-9]/g, '');

        const matchingContact =
          phoneToContact.get(cleanFrom) || phoneToContact.get(cleanTo);

        if (matchingContact) {
          matchedMessages.push({
            ...message,
            contact: matchingContact,
            message_date: message.date_sent || message.date_created || new Date().toISOString()
          });
        }
      }

      // Add matched messages to CSV data
      if (matchedMessages.length > 0) {
        for (const item of matchedMessages) {
          csvLines.push(
            csvRow(
              [
                item.body,
                item.direction,
                item.status,
                item.message_date,
                item.contact.id,
                item.contact.firstname,
                item.contact.surname,
                item.contact.phone,
                item.contact.email,
                item.contact.address,
                item.contact.city,
                item.contact.opt_out ? 'true' : 'false',
                item.contact.created_at,
                item.contact.workspace,
                item.contact.external_id,
                item.contact.address_id,
                item.contact.postal,
                item.contact.carrier,
                item.contact.province,
                item.contact.country,
                item.contact.cleanPhone,
                campaign.title,
                campaign.start_date,
                campaign.end_date,
              ],
              { protectFromInjection: true },
            ),
          );
        }
      }

      processedMessages += messages.length;

      const progress = 30 + Math.round((processedMessages / totalMessages) * 70);
      statusData = await writeExportStatus(supabaseClient, workspaceId, exportId, statusData, {
        progress: Math.min(progress, 99),
        stage: "Processing messages",
        processed: processedMessages,
        total: totalMessages,
        campaignId,
        campaignName: campaign.title,
      });

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await finalizeCsvExport(supabaseClient, workspaceId, exportId, statusData, csvLines, {
      campaignId,
      campaignName: campaign.title,
    });
  } catch (error) {
    logger.error("Export error:", error);
    await writeExportErrorStatus(supabaseClient, workspaceId, exportId, statusData, error);
  }
}

// Process call campaign export in chunks

export async function processCallCampaignExport(
  supabaseClient: SupabaseClient<Database>,
  campaignId: number,
  workspaceId: string,
  exportId: string,
  campaignName: string
) {
  let statusData: CampaignExportStatus = createInitialExportStatus({
    exportId,
    campaignName,
    workspaceId,
    campaignId,
  });

  try {
    statusData = await writeExportStatus(
      supabaseClient,
      workspaceId,
      exportId,
      statusData,
      {},
    );

    // Initialize CSV lines (store as lines to avoid O(n^2) string concatenation).
    const csvLines: string[] = [];
    let isFirstChunk = true;

    // First, get campaign info
    const { data: campaignData, error: campaignError } = await supabaseClient
      .from('campaign')
      .select('id, title, start_date, end_date, type, status')
      .eq('id', campaignId)
      .eq('workspace', workspaceId)
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
    
    const script = castExportScript(scriptData?.script);
    const campaign = campaignData as ExportCampaign;
    const scriptQuestions = extractScriptQuestions(script);
    const pages = Object.entries(script?.steps?.pages ?? {}).map(([pageId, pageData]) => ({
      id: pageId,
      title: pageData.title || pageId,
    }));

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

      const contactsMap: Record<string, ExportContact> = {};
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

      const callsMap: Record<string, ExportCall> = {};
      if (calls) {
        calls.forEach(call => {
          if (call.outreach_attempt_id) {
            callsMap[call.outreach_attempt_id] = call;
          }
        });
      }

      // Match attempts with contacts and calls
      const matchedAttempts: ExportAttemptWithDetails[] = (attempts as ExportOutreachAttempt[]).map(attempt => {
        const contact = contactsMap[attempt.contact_id] || ({} as ExportContact);
        const call = callsMap[attempt.id] || ({} as ExportCall);

        return {
          ...attempt,
          contact,
          call
        };
      });

      // Convert attempts to CSV
      if (isFirstChunk) {
        const baseHeaders =
          "attempt_id,disposition,full_result,attempt_start,call_sid,duration_seconds,answered_by,call_start,call_end,contact_id,firstname,surname,phone,email,address,city,opt_out,created_at,workspace,postal,province,country,campaign_name,campaign_start_date,campaign_end_date,campaign_type,campaign_status,credits_used,pages";

        // Add a column for each script question
        const questionColumns = csvRow(
          scriptQuestions.map((q) => q.title),
          { protectFromInjection: true },
        );

        csvLines.push(`${baseHeaders},${questionColumns}`);
        isFirstChunk = false;
      }

      for (const item of matchedAttempts) {
        const durationSeconds = item.call.duration ? parseInt(item.call.duration) : 0;
        const creditsUsed = Math.max(1, Math.ceil(durationSeconds / 60));

        // Track visited pages and responses
        const visitedPages = new Set<string>();
        const responses: Record<string, string> = {};

        // Extract responses from the attempt result
        if (item.result) {
          try {
            let resultObj: Record<string, unknown>;

            // Parse result if it's a string
            if (typeof item.result === "string") {
              resultObj = JSON.parse(item.result) as Record<string, unknown>;
            } else {
              resultObj = item.result as Record<string, unknown>;
            }

            Object.entries(resultObj).forEach(([pageId, pageData]) => {
              if (typeof pageData === "object" && pageData !== null) {
                visitedPages.add(pageId);

                // Extract responses directly from the page data
                Object.entries(pageData as Record<string, unknown>).forEach(
                  ([key, value]) => {
                    // Store response by the key directly - we'll match with script questions later
                    responses[key] = String(value);
                  },
                );
              }
            });
          } catch (e) {
            logger.error("Error parsing result:", e, "Raw result:", item.result);
          }
        }

        // Format pages data
        const pageResponses = pages
          .filter((page) => visitedPages.has(page.id))
          .map((page) => page.title)
          .join("|");

        const rowData = [
          item.id,
          item.disposition || item.call.status || "",
          JSON.stringify(item.result),
          item.created_at,
          item.call.sid,
          durationSeconds.toString(),
          item.call.answered_by,
          item.call.start_time || item.call.date_created || "",
          item.call.end_time || item.call.date_updated || "",
          item.contact.id,
          item.contact.firstname,
          item.contact.surname,
          item.contact.phone,
          item.contact.email,
          item.contact.address,
          item.contact.city,
          item.contact.opt_out ? "true" : "false",
          item.contact.created_at,
          item.contact.workspace,
          item.contact.postal,
          item.contact.province,
          item.contact.country,
          campaign.title,
          campaign.start_date,
          campaign.end_date,
          campaign.type,
          campaign.status,
          creditsUsed.toString(),
          pageResponses,
          ...scriptQuestions.map((q) => responses[q.id]),
        ];

        csvLines.push(csvRow(rowData, { protectFromInjection: true }));
      }

      processedAttempts += attempts.length;

      const progress = Math.round((processedAttempts / totalAttempts) * 100);
      statusData = await writeExportStatus(supabaseClient, workspaceId, exportId, statusData, {
        progress: Math.min(progress, 99),
        stage: "Processing call attempts",
        processed: processedAttempts,
        total: totalAttempts,
      });

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await finalizeCsvExport(supabaseClient, workspaceId, exportId, statusData, csvLines);
  } catch (error) {
    logger.error("Export error:", error);
    await writeExportErrorStatus(supabaseClient, workspaceId, exportId, statusData, error);
  }
}
