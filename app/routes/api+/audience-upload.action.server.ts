import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { parseCSV } from '@/lib/csv';
import {
  normalizeVoterListSource,
  processAudienceUpload,
  type VoterListSource,
} from "@/lib/audience-upload-process.server";
import { resolveDualAuthSession } from "@/lib/api-auth.server";
import {
  createAudienceForUpload,
  createAudienceUploadRecord,
  findAudienceInWorkspace,
  findCampaignForAudienceUpload,
  linkAudienceToCampaign,
  markAudienceUpdating,
} from "@/lib/audience-upload-db.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { AppError } from "@/lib/errors.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";
import type { Database } from "@/lib/db-types";
import {
  isContactImportTarget,
  validateContactImportMapping,
} from "../../../shared/contact-import-headers";

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
    headers: Headers;
    user: { id: string } | null;
  }>;
  processAudienceUpload: typeof processAudienceUpload;
  requireWorkspaceAccess: (args: {
    user: { id: string };
    workspaceId: string;
  }) => Promise<void>;
}>;

export const action = defineAction({
  sideEffects: ["db-write", "external"],
  handler: async ({
    request,
    deps,
  }: ActionFunctionArgs & { deps?: AudienceUploadDeps }) => {

  const d = {
    verifyAuth: deps?.verifyAuth ?? resolveDualAuthSession,
    processAudienceUpload: deps?.processAudienceUpload ?? processAudienceUpload,
    requireWorkspaceAccess: deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
  };
  const { headers, user } = await d.verifyAuth(request);
  
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
  const campaignIdRaw = formData.get("campaign_id");
  const voterListSourceRaw = formData.get("voter_list_source") as string | null;
  const voterListSource: VoterListSource | null = normalizeVoterListSource(
    voterListSourceRaw,
  );
  
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
    if (user) {
      await d.requireWorkspaceAccess({ user, workspaceId });
    }

    let parsedHeaderMapping: Record<string, string>;
    try {
      const parsed = headerMapping ? JSON.parse(headerMapping) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Header mapping must be an object");
      }
      parsedHeaderMapping = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([header, target]) => {
          if (typeof target !== "string" || !isContactImportTarget(target)) {
            throw new Error(`Unsupported mapping target for "${header}"`);
          }
          return [header, target];
        }),
      );
    } catch (error) {
      return routeData(
        { error: error instanceof Error ? error.message : "Header mapping is invalid" },
        { status: 400, headers },
      );
    }

    const mappingIssues = validateContactImportMapping(parsedHeaderMapping);
    const blockingIssue = mappingIssues.find((issue) => issue.blocking);
    if (blockingIssue) {
      return routeData({ error: blockingIssue.message }, { status: 400, headers });
    }

    const fileContent = await contactsFile.arrayBuffer();
    const fileContentText = new TextDecoder().decode(fileContent);
    const parsedFile = parseCSV(fileContentText);
    const availableHeaders = new Set(parsedFile.headers.map((header) => header.toLowerCase()));
    const missingHeaders = Object.keys(parsedHeaderMapping).filter(
      (header) => !availableHeaders.has(header.toLowerCase()),
    );
    if (missingHeaders.length > 0) {
      return routeData(
        { error: `Mapped columns are missing from the CSV: ${missingHeaders.join(", ")}` },
        { status: 400, headers },
      );
    }
    const campaignId =
      campaignIdRaw == null ? null : Number.parseInt(String(campaignIdRaw), 10);
    if (campaignId != null) {
      if (!Number.isSafeInteger(campaignId)) {
        return routeData({ error: "Campaign ID is invalid" }, { status: 400, headers });
      }
      if (!(await findCampaignForAudienceUpload(workspaceId, campaignId))) {
        return routeData({ error: "Campaign not found" }, { status: 404, headers });
      }
    }

    // If audienceId is provided, use it; otherwise create a new audience
    let finalAudienceId: number;
    
    if (audienceIdStr) {
      const audienceId = parseInt(audienceIdStr, 10);

      const existingAudience = await findAudienceInWorkspace(workspaceId, audienceId);
      if (!existingAudience) {
        return routeData({ error: "Audience not found or not accessible" }, { status: 404, headers });
      }

      finalAudienceId = audienceId;
      await markAudienceUpdating(workspaceId, finalAudienceId);
    } else {
      const audienceData = await createAudienceForUpload(workspaceId, audienceName);
      if (!audienceData) {
        return routeData({ error: "Failed to create audience" }, { status: 500, headers });
      }

      finalAudienceId = audienceData.id;
    }

    if (campaignId != null) {
      const linked = await linkAudienceToCampaign({
        workspaceId,
        campaignId,
        audienceId: finalAudienceId,
      });
      if (!linked) {
        return routeData({ error: "Campaign not found" }, { status: 404, headers });
      }
    }

    // Convert file to base64 for processing
    // Use a safer encoding method that can handle non-ASCII characters
    // First encode the string as UTF-8, then encode to base64
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(fileContentText);
    
    // Convert the UTF-8 bytes to base64
    const fileBase64 = Buffer.from(utf8Bytes).toString('base64');

    const uploadData = await createAudienceUploadRecord({
      workspaceId,
      audienceId: finalAudienceId,
      createdBy: user.id,
      fileName: contactsFile.name,
      fileSize: contactsFile.size,
      headerMapping: parsedHeaderMapping,
      splitNameColumn: splitNameColumn || null,
    });

    if (!uploadData) {
      return routeData({ error: "Failed to create upload record" }, { status: 500, headers });
    }

    const uploadId = uploadData.id;

    // Start background processing
    d.processAudienceUpload(
      uploadId,
      finalAudienceId,
      workspaceId,
      user.id,
      fileBase64,
      parsedHeaderMapping,
      splitNameColumn || null,
      { parseCSV },
      voterListSource,
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
    if (error instanceof AppError) {
      return routeData({ error: error.message }, { status: error.statusCode, headers });
    }
    return routeData({
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500, headers });
  }
  },
});
