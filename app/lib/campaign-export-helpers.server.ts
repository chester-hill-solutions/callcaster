import { CSV_DEFAULT_LINE_ENDING, CSV_UTF8_BOM } from "@/lib/csv";
import { logger } from "@/lib/logger.server";
import {
  createSignedObjectUrl,
  uploadObject,
} from "@/lib/object-storage.server";
import type { ExportScript } from "@/lib/campaign-export-types.server";

export type CampaignExportStatus = {
  status: string;
  progress: number;
  exportId: string;
  filename: string;
  campaignName: string;
  stage: string;
  workspaceId: string;
  created_at: string;
  campaignId?: number;
  processed?: number;
  total?: number;
  downloadUrl?: string;
  error?: string;
};

export function createInitialExportStatus(args: {
  exportId: string;
  campaignName: string;
  workspaceId: string;
  campaignId: number;
}): CampaignExportStatus {
  return {
    status: "processing",
    progress: 0,
    exportId: args.exportId,
    filename: `campaign_export_${args.campaignId}.csv`,
    campaignName: args.campaignName,
    stage: "Starting export",
    workspaceId: args.workspaceId,
    created_at: new Date().toISOString(),
  };
}

export async function writeExportStatus(
  workspaceId: string,
  exportId: string,
  statusData: CampaignExportStatus,
  patch: Partial<CampaignExportStatus>,
): Promise<CampaignExportStatus> {
  const nextStatus = { ...statusData, ...patch };
  await uploadObject(
    "campaign-exports",
    `${workspaceId}/${exportId}.json`,
    JSON.stringify(nextStatus),
    {
      contentType: "application/json",
      upsert: true,
    },
  );

  return nextStatus;
}

export async function finalizeCsvExport(
  workspaceId: string,
  exportId: string,
  statusData: CampaignExportStatus,
  csvLines: string[],
  completionPatch: Partial<CampaignExportStatus> = {},
): Promise<CampaignExportStatus> {
  const csvData = `${CSV_UTF8_BOM}${csvLines.join(CSV_DEFAULT_LINE_ENDING)}${CSV_DEFAULT_LINE_ENDING}`;

  await uploadObject(
    "campaign-exports",
    `${workspaceId}/${exportId}.csv`,
    csvData,
    {
      contentType: "text/csv",
      upsert: true,
    },
  );

  const signedUrl = await createSignedObjectUrl(
    "campaign-exports",
    `${workspaceId}/${exportId}.csv`,
    24 * 60 * 60,
  );

  return writeExportStatus(workspaceId, exportId, statusData, {
    status: "completed",
    progress: 100,
    downloadUrl: signedUrl,
    stage: "Export completed",
    ...completionPatch,
  });
}

export async function writeExportErrorStatus(
  workspaceId: string,
  exportId: string,
  statusData: CampaignExportStatus,
  error: unknown,
): Promise<void> {
  try {
    await writeExportStatus(workspaceId, exportId, statusData, {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      exportId,
      workspaceId,
      stage: "Export failed",
    });
  } catch (statusError) {
    logger.error("Error writing error status:", statusError);
  }
}

export type ScriptQuestion = {
  id: string;
  title: string;
};

export function extractScriptQuestions(script: ExportScript | null | undefined): ScriptQuestion[] {
  const scriptQuestions: ScriptQuestion[] = [];
  const pages = Object.entries(script?.steps?.pages ?? {}).map(([pageId, pageData]) => ({
    id: pageId,
    title: pageData.title || pageId,
    blocks: pageData.blocks || [],
  }));
  const blocks = script?.steps?.blocks ?? {};

  for (const page of pages) {
    if (!Array.isArray(page.blocks)) {
      continue;
    }
    for (const blockId of page.blocks) {
      const block = blocks[blockId];
      if (
        block &&
        (block.type === "question" || block.type === "recorded" || block.type === "dtmf")
      ) {
        scriptQuestions.push({
          id: block.title || block.id,
          title: block.title || block.id,
        });
      }
    }
  }

  return scriptQuestions;
}

export function parseAttemptResult(result: unknown): Record<string, string> {
  if (!result || typeof result !== "object") {
    return {};
  }

  const responses: Record<string, string> = {};
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (value == null) {
      responses[key] = "";
    } else if (typeof value === "string") {
      responses[key] = value;
    } else {
      responses[key] = JSON.stringify(value);
    }
  }
  return responses;
}

export function castExportScript(scriptData: unknown): ExportScript | null {
  if (!scriptData || typeof scriptData !== "object") {
    return null;
  }
  return scriptData as ExportScript;
}
