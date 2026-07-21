import { parseCSV } from "@/lib/csv";
import { logger } from "@/lib/logger.server";
import { uploadObject } from "@/lib/object-storage.server";
import {
  isProcessingStale,
  PROCESSING_INTERRUPTED_MESSAGE,
} from "@/lib/processing-watchdog.server";
import { eq } from "drizzle-orm";
import {
  audience as audienceTable,
  audience_upload as audienceUploadTable,
  contact_audience as contactAudienceTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { parsePhoneNumber } from "@/lib/phone";
import {
  AUDIENCE_UPLOAD_CHUNK_SIZE,
  audienceUploadChunkDelayMs,
  audienceUploadShouldWriteStatus,
} from "../../shared/audience-upload";
import {
  splitContactFullName,
  validateContactImportMapping,
} from "../../shared/contact-import-headers";

interface CSVContact {
  [key: string]: string;
}

interface MappedContact {
  id?: number;
  workspace: string;
  created_by: string;
  firstname?: string;
  surname?: string;
  other_data?: Array<Record<string, unknown>>;
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
  // Stamp updated_at on every write (called once per processed chunk) so the
  // staleness watchdog in the status loader can tell a live upload from one
  // abandoned by a mid-run restart. See app/lib/processing-watchdog.server.ts.
  await uploadObject(
    "audience-uploads",
    `${workspaceId}/${uploadId}.json`,
    JSON.stringify({ ...status, updated_at: new Date().toISOString() }),
    {
      contentType: "application/json",
      upsert: true,
    },
  );
}

/**
 * Staleness watchdog for the polling status loader: `processAudienceUpload`
 * runs as a fire-and-forget promise inside a request process (see
 * app/routes/api+/audience-upload.action.server.ts). If that process
 * restarts mid-run, the `audience_upload` row is stranded at
 * status: "processing" forever and the client polls indefinitely.
 *
 * Call this from the status loader (write-through on read): if the DB row
 * is "processing" and the object-storage status blob hasn't been updated
 * in PROCESSING_STALE_MS, mark both the DB row and the status blob failed.
 */
export async function markAudienceUploadInterruptedIfStale(args: {
  workspaceId: string;
  uploadId: number;
  dbStatus: string;
  statusFileData: Record<string, unknown>;
  now?: Date;
}): Promise<{ interrupted: boolean; statusFileData: Record<string, unknown> }> {
  const { workspaceId, uploadId, dbStatus, statusFileData, now } = args;

  if (dbStatus !== "processing") {
    return { interrupted: false, statusFileData };
  }

  const updatedAt =
    typeof statusFileData.updated_at === "string"
      ? statusFileData.updated_at
      : typeof statusFileData.created_at === "string"
        ? statusFileData.created_at
        : undefined;

  if (!isProcessingStale(updatedAt, now)) {
    return { interrupted: false, statusFileData };
  }

  const tdb = createTenantDb(workspaceId);
  await tdb.audience_upload.update({
    set: {
      status: "error",
      error_message: PROCESSING_INTERRUPTED_MESSAGE,
    },
    where: eq(audienceUploadTable.id, uploadId),
  });

  const nextStatusFileData = {
    ...statusFileData,
    status: "error",
    error: PROCESSING_INTERRUPTED_MESSAGE,
    stage: "Upload failed",
  };
  await writeAudienceUploadStatus(workspaceId, uploadId, nextStatusFileData);

  logger.error("audience_upload.watchdog.interrupted", {
    workspaceId,
    uploadId,
  });

  return {
    interrupted: true,
    statusFileData: { ...nextStatusFileData, updated_at: (now ?? new Date()).toISOString() },
  };
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
    const duplicateIssue = validateContactImportMapping(headerMapping).find(
      (issue) => issue.blocking && issue.code === "duplicate-target",
    );
    if (duplicateIssue) {
      throw new Error(duplicateIssue.message);
    }
    const hasPhoneMapping = Object.values(headerMapping).includes("phone");

    // Update total contacts count
    await tdb.audience_upload.update({
      set: { total_contacts: parsedContacts.length },
      where: eq(audienceUploadTable.id, uploadId),
    });

    // Process contacts in chunks
    const CHUNK_SIZE = AUDIENCE_UPLOAD_CHUNK_SIZE;
    let lastProgressAt = 0;
    let processedCount = 0;
    let importedCount = 0;
    let skippedInvalidCount = 0;
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
      const mappedContacts = chunk.flatMap((contact: CSVContact) => {
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
            const splitName = splitContactFullName(contact[actualHeader]);
            mappedContact.firstname = splitName.firstname;
            mappedContact.surname = splitName.surname;
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
              // Keep custom values in the same object-per-column shape used by
              // the other canonical CSV contact parser.
              if (value !== undefined) {
                mappedContact.other_data?.push({ [actualHeader]: value });
              }
            } else if (dbField === "phone") {
              const normalizedPhone = parsePhoneNumber(value ?? null);
              if (normalizedPhone) mappedContact.phone = normalizedPhone;
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

        if (hasPhoneMapping && !mappedContact.phone) {
          skippedInvalidCount += 1;
          return [];
        }

        logger.debug('Final mapped contact:', mappedContact);
        return [mappedContact];
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
      if (mappedContacts.length > 0) {
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

        importedCount += insertedContacts.length;
        logger.debug('Inserted contacts sample:', insertedContacts[0]);

        // Link contacts to audience
        await db.insert(contactAudienceTable).values(
          insertedContacts.map((contact) => ({
            contact_id: contact.id,
            audience_id: audienceId,
            created_at: new Date().toISOString(),
          })),
        );
      }

      // Update progress — durable row every chunk; sidecar throttled (#1078).
      processedCount += chunk.length;

      await tdb.audience_upload.update({
        set: {
          processed_contacts: processedCount,
          status: "processing",
        },
        where: eq(audienceUploadTable.id, uploadId),
      });

      const isLastChunk = i + CHUNK_SIZE >= parsedContacts.length;
      const now = Date.now();
      if (
        audienceUploadShouldWriteStatus({
          total: parsedContacts.length,
          chunkSize: CHUNK_SIZE,
          isLastChunk,
          lastProgressAt,
          now,
        })
      ) {
        const progress = Math.round((processedCount / parsedContacts.length) * 100);

        await writeAudienceUploadStatus(workspaceId, uploadId, {
          ...statusData,
          progress,
          stage: `Processing contacts (${processedCount}/${parsedContacts.length}; ${skippedInvalidCount} skipped)`,
          skipped_invalid_contacts: skippedInvalidCount,
        });

        lastProgressAt = now;
      }

      const chunkDelayMs = audienceUploadChunkDelayMs(parsedContacts.length);
      if (chunkDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
      }
    }

    // Update audience status. audience_status enum is
    // pending|processing|completed|error — there is no "active" value (see
    // drizzle/0000_baseline.sql:86). A finalized, successfully-imported
    // audience maps to "completed".
    await tdb.audience.update({
      set: {
        status: "completed",
        total_contacts: importedCount,
      },
      where: eq(audienceTable.id, audienceId),
    });

    await tdb.audience_upload.update({
      set: {
        status: "completed",
        processed_contacts: processedCount,
        processed_at: new Date().toISOString(),
      },
      where: eq(audienceUploadTable.id, uploadId),
    });

    await writeAudienceUploadStatus(workspaceId, uploadId, {
      ...statusData,
      status: "completed",
      progress: 100,
      stage: `Upload completed (${importedCount} imported; ${skippedInvalidCount} skipped)`,
      skipped_invalid_contacts: skippedInvalidCount,
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
