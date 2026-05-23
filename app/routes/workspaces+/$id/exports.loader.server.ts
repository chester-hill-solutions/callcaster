import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

interface ExportItem {
  id: string;
  createdAt: Date;
  downloadUrl?: string;
  campaignId: string;
  campaignName: string;
  expiresAt: Date;
  isExpired: boolean;
  status: string;
  progress: number;
  stage?: string;
  processed?: number;
  total?: number;
}

interface SerializedExportItem {
  id: string;
  createdAt: string;
  downloadUrl?: string;
  campaignId: string;
  campaignName: string;
  expiresAt: string;
  isExpired: boolean;
  status: string;
  progress: number;
  stage?: string;
  processed?: number;
  total?: number;
}

interface LoaderData {
  exports: SerializedExportItem[];
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = params["id"];
  if (!workspaceId) {
    return routeData({ error: "Missing workspace ID" }, { status: 400 });
  }

  try {
    // List all files in the workspace's exports directory
    const { data: files, error: listError } = await supabaseClient.storage
      .from("campaign-exports")
      .list(workspaceId, {
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError) {
      throw listError;
    }

    // Filter and process export files
    const now = Date.now();

    // Process only JSON status files
    const statusFiles = files?.filter(file => file.name.endsWith('.json')) || [];

    // Process all export files
    const processedExports = await Promise.all(statusFiles.map(async (file) => {
      try {
        const { data: statusData, error: downloadError } = await supabaseClient.storage
          .from("campaign-exports")
          .download(`${workspaceId}/${file.name}`);

        if (downloadError) {
          logger.error(`Error downloading status file ${file.name}:`, downloadError);
          return null;
        }

        const content = JSON.parse(await statusData.text());
        const createdAt = new Date(content.created_at || file.created_at || Date.now());
        const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

        const exportItem: ExportItem = {
          id: file.name.replace('.json', ''),
          createdAt,
          downloadUrl: content.downloadUrl,
          campaignId: content.campaignId?.toString() || '',
          campaignName: content.campaignName || 'Unnamed Campaign',
          expiresAt,
          isExpired: now > expiresAt.getTime(),
          status: content.status || 'unknown',
          progress: content.progress || 0,
          stage: content.stage,
          processed: content.processed,
          total: content.total
        };

        return exportItem;
      } catch (error) {
        logger.error(`Error processing file ${file.name}:`, error);
        return null;
      }
    }));

    // Filter out nulls and sort by newest first
    const validExports = processedExports
      .filter((exp): exp is ExportItem => exp !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return routeData<LoaderData>({
      exports: validExports.map((exp) => ({
        ...exp,
        createdAt: exp.createdAt.toISOString(),
        expiresAt: exp.expiresAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Error fetching exports:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return routeData({ error: message }, { status: 500 });
  }
}
