import { parseCSV } from "@/lib/csv";
import { logger } from "@/lib/logger.server";
import { uploadObject } from "@/lib/object-storage.server";
import { eq } from "drizzle-orm";
import {
  audience as audienceTable,
  audience_upload as audienceUploadTable,
  contact_audience as contactAudienceTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

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

export type VoterListSource =
  | "liberalist"
  | "van"
  | "elections_canada"
  | "elections_ontario"
  | "manual"
  | "other";

export const VOTER_LIST_SOURCE_ALIASES: Record<string, VoterListSource> = {
  liberalist: "liberalist",
  lib: "liberalist",
  van: "van",
  vanid: "van",
  "van id": "van",
  elections_canada: "elections_canada",
  "elections canada": "elections_canada",
  ec: "elections_canada",
  elections_ontario: "elections_ontario",
  "elections ontario": "elections_ontario",
  eo: "elections_ontario",
  manual: "manual",
  other: "other",
};

export function normalizeVoterListSource(
  raw: string | null | undefined,
): VoterListSource | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  return VOTER_LIST_SOURCE_ALIASES[lower] ?? null;
}

// Type guard for other_data array
export function isOtherDataArray(
  value: unknown,
): value is Array<{ key: string; value: unknown }> {
  return Array.isArray(value) && value.every(item =>
    typeof item === 'object' &&
    item !== null &&
    'key' in item &&
    'value' in item
  );
}

// Generate a unique ID without using uuid package
export const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
};

async function writeAudienceUploadStatus(
  workspaceId: string,
  uploadId: number,
  status: Record<string, unknown>,
): Promise<void> {
  await uploadObject(
    "audience-uploads",
    `${workspaceId}/${uploadId}.json`,
    JSON.stringify(status),
    {
      contentType: "application/json",
      upsert: true,
    },
  );
}

// Process audience upload in background
export const processAudienceUpload = async (
  uploadId: number,
  audienceId: number,
  workspaceId: string,
  userId: string,
  fileContent: string,
  headerMapping: Record<string, string>,
  splitNameColumn: string | null,
  deps: { parseCSV: typeof parseCSV } = { parseCSV },
  voterListSource?: VoterListSource | null,
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

  const tdb = createTenantDb(workspaceId);

  try {
    await writeAudienceUploadStatus(workspaceId, uploadId, statusData);

    // Parse the CSV content
    const decodedContent = Buffer.from(fileContent, 'base64').toString('utf-8');
    const { contacts: parsedContacts, headers } = deps.parseCSV(decodedContent);

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
    await tdb.audience_upload.update({
      set: { total_contacts: parsedContacts.length },
      where: eq(audienceUploadTable.id, uploadId),
    });

    // Process contacts in chunks
    const CHUNK_SIZE = 100;
    let processedCount = 0;
    const importedAt = new Date().toISOString();
    const voterListStamp =
      voterListSource != null
        ? {
            voter_list_source: voterListSource,
            voter_list_imported_at: importedAt,
          }
        : null;

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

        // ADR-0023: stamp voter-list provenance on every imported contact.
        if (voterListStamp) {
          mappedContact.voter_list_source = voterListStamp.voter_list_source;
          mappedContact.voter_list_imported_at = voterListStamp.voter_list_imported_at;
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
      const insertedContacts = await tdb.contact.insertMany(
        mappedContacts.map((contact) => ({
          ...contact,
          other_data: contact.other_data ?? [],
          created_at: new Date().toISOString(),
        })) as Record<string, unknown>[],
      );

      if (insertedContacts.length === 0) {
        throw new Error("Error inserting contacts: no rows returned");
      }

      logger.debug('Inserted contacts sample:', insertedContacts[0]);

      // Link contacts to audience
      await db.insert(contactAudienceTable).values(
        insertedContacts.map((contact) => ({
          contact_id: contact.id,
          audience_id: audienceId,
          created_at: new Date().toISOString(),
        })),
      );

      // Update progress
      processedCount += chunk.length;
      const progress = Math.round((processedCount / parsedContacts.length) * 100);

      await writeAudienceUploadStatus(workspaceId, uploadId, {
        ...statusData,
        progress,
        stage: `Processing contacts (${processedCount}/${parsedContacts.length})`,
      });

      // Update upload record
      await tdb.audience_upload.update({
        set: {
          processed_contacts: processedCount,
          status: "processing",
        },
        where: eq(audienceUploadTable.id, uploadId),
      });

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update audience status
    await tdb.audience.update({
      set: {
        status: "active",
        total_contacts: processedCount,
      },
      where: eq(audienceTable.id, audienceId),
    });

    await tdb.audience_upload.update({
      set: {
        status: "completed",
        processed_at: new Date().toISOString(),
      },
      where: eq(audienceUploadTable.id, uploadId),
    });

    await writeAudienceUploadStatus(workspaceId, uploadId, {
      ...statusData,
      status: "completed",
      progress: 100,
      stage: "Upload completed",
    });

  } catch (error) {
    logger.error("Upload processing error:", error);
    
    // Update audience status to error
    await tdb.audience.update({
      set: {
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
      },
      where: eq(audienceTable.id, audienceId),
    });

    await tdb.audience_upload.update({
      set: {
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
      },
      where: eq(audienceUploadTable.id, uploadId),
    });

    await writeAudienceUploadStatus(workspaceId, uploadId, {
      ...statusData,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
