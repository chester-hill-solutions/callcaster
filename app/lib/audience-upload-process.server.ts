import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCSV } from "@/lib/csv";
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
  other_data?: Array<{ key: string; value: unknown }>;
  [key: string]: unknown;
}

export const processAudienceUpload = async (
  supabaseClient: SupabaseClient<Database>,
  uploadId: number,
  audienceId: number,
  workspaceId: string,
  userId: string,
  fileContent: string,
  headerMapping: Record<string, string>,
  splitNameColumn: string | null,
  deps: { parseCSV: typeof parseCSV } = { parseCSV },
) => {
  const statusData = {
    status: "processing",
    progress: 0,
    uploadId,
    audienceId,
    workspaceId,
    stage: "Starting upload",
    created_at: new Date().toISOString(),
  };

  try {
    const { data: buckets, error: bucketError } =
      await supabaseClient.storage.listBuckets();

    if (bucketError) {
      throw new Error(`Error listing buckets: ${bucketError.message}`);
    }

    const audienceUploadsBucket = buckets?.find(
      (b: StorageBucket) => b.name === "audience-uploads",
    );
    if (!audienceUploadsBucket) {
      const { error: createError } = await supabaseClient.storage.createBucket(
        "audience-uploads",
        { public: false },
      );

      if (createError) {
        throw new Error(`Error creating bucket: ${createError.message}`);
      }
    }

    const { error: statusError } = await supabaseClient.storage
      .from("audience-uploads")
      .upload(`${workspaceId}/${uploadId}.json`, JSON.stringify(statusData), {
        contentType: "application/json",
        upsert: true,
      });

    if (statusError) {
      throw new Error(`Error creating status file: ${statusError.message}`);
    }

    const decodedContent = Buffer.from(fileContent, "base64").toString("utf-8");
    const { contacts: parsedContacts, headers } = deps.parseCSV(decodedContent);

    const headerLookup = new Map(
      headers.map((header) => [header.toLowerCase(), header]),
    );

    const missingHeaders = Object.keys(headerMapping).filter(
      (header) => !headerLookup.has(header.toLowerCase()),
    );
    if (missingHeaders.length > 0) {
      throw new Error(`Missing headers in CSV: ${missingHeaders.join(", ")}`);
    }

    await supabaseClient
      .from("audience_upload")
      .update({
        total_contacts: parsedContacts.length,
      })
      .eq("id", uploadId);

    const CHUNK_SIZE = 100;
    let processedCount = 0;

    for (let i = 0; i < parsedContacts.length; i += CHUNK_SIZE) {
      const chunk = parsedContacts.slice(i, i + CHUNK_SIZE);

      const mappedContacts = chunk.map((contact: CSVContact) => {
        logger.debug("Processing contact:", contact);

        const mappedContact: MappedContact = {
          workspace: workspaceId,
          created_by: userId,
          other_data: [],
        };

        if (splitNameColumn) {
          const actualHeader = headerLookup.get(splitNameColumn.toLowerCase());
          if (actualHeader) {
            const fullName = contact[actualHeader] || "";
            const [firstName, ...lastNameParts] = fullName.split(" ");
            mappedContact.firstname = firstName || "";
            mappedContact.surname = lastNameParts.join(" ") || "";
          }
        }

        Object.entries(headerMapping).forEach(([csvHeader, dbField]) => {
          const actualHeader = headerLookup.get(csvHeader.toLowerCase());
          if (!actualHeader) {
            logger.warn(
              `Warning: CSV header "${csvHeader}" not found in file. Available headers:`,
              headers,
            );
            return;
          }

          const value = contact[actualHeader];

          if (dbField !== "name") {
            if (dbField === "other_data") {
              if (value !== undefined) {
                mappedContact.other_data?.push({
                  key: actualHeader,
                  value: value,
                });
              }
            } else {
              if (value !== undefined) {
                mappedContact[dbField] = value;
              }
            }
          }
        });

        if (!mappedContact.other_data?.length) {
          delete mappedContact.other_data;
        }

        logger.debug("Final mapped contact:", mappedContact);
        return mappedContact;
      });

      if (i === 0) {
        logger.debug("First chunk transformation:", {
          rawCsvRow: chunk[0],
          availableHeaders: headers,
          headerMapping,
          mappedResult: mappedContacts[0],
        });
      }

      const { data: insertedContacts, error: insertError } = await supabaseClient
        .from("contact")
        .insert(mappedContacts as unknown as Partial<Tables<"contact">>[])
        .select("id, firstname, surname, other_data");

      if (insertError) {
        const firstMappedContact = mappedContacts[0];
        logger.error("Insert error details:", {
          error: insertError,
          firstContact: firstMappedContact,
          mappingUsed: headerMapping,
          sampleData: {
            workspace: workspaceId,
            created_by: userId,
            mappedFields: firstMappedContact
              ? Object.keys(firstMappedContact)
              : [],
          },
        });
        throw new Error(`Error inserting contacts: ${insertError.message}`);
      }

      logger.debug("Inserted contacts sample:", insertedContacts[0]);

      const { error: linkError } = await supabaseClient
        .from("contact_audience")
        .insert(
          insertedContacts.map((contact: { id: number }) => ({
            contact_id: contact.id,
            audience_id: audienceId,
          })),
        );

      if (linkError) {
        throw new Error(`Error linking contacts to audience: ${linkError.message}`);
      }

      processedCount += chunk.length;
      const progress = Math.round((processedCount / parsedContacts.length) * 100);

      await supabaseClient.storage
        .from("audience-uploads")
        .upload(
          `${workspaceId}/${uploadId}.json`,
          JSON.stringify({
            ...statusData,
            progress,
            stage: `Processing contacts (${processedCount}/${parsedContacts.length})`,
          }),
          { upsert: true },
        );

      await supabaseClient
        .from("audience_upload")
        .update({
          processed_contacts: processedCount,
          status: "processing",
        })
        .eq("id", uploadId);

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await supabaseClient
      .from("audience")
      .update({
        status: "active",
        total_contacts: processedCount,
      })
      .eq("id", audienceId);

    await supabaseClient
      .from("audience_upload")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    await supabaseClient.storage
      .from("audience-uploads")
      .upload(
        `${workspaceId}/${uploadId}.json`,
        JSON.stringify({
          ...statusData,
          status: "completed",
          progress: 100,
          stage: "Upload completed",
        }),
        { upsert: true },
      );
  } catch (error) {
    logger.error("Upload processing error:", error);

    await supabaseClient
      .from("audience")
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", audienceId);

    await supabaseClient
      .from("audience_upload")
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", uploadId);

    await supabaseClient.storage
      .from("audience-uploads")
      .upload(
        `${workspaceId}/${uploadId}.json`,
        JSON.stringify({
          ...statusData,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        { upsert: true },
      );
  }
};
