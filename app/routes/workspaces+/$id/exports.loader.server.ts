import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import { listObjects, downloadObject } from "@/lib/object-storage.server";
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

  const result = await requireWorkspaceLoaderContext(request, params["id"]);
  if (!result.ok) return result.response;
  const { user, workspaceId } = result.ctx;

  try {
    // List all files in the workspace's exports directory
    const files = await listObjects(
      "campaign-exports",
      workspaceId,
      { sortBy: { column: "created_at", order: "desc" } },
    );

    // Filter and process export files
    const now = Date.now();

    // Process only JSON status files
    const statusFiles = files?.filter(file => file.name.endsWith('.json')) || [];

    // Process all export files
    const processedExports = await Promise.all(statusFiles.map(async (file) => {
      try {
        let content: any;
        try {
          const buffer = await downloadObject(
            "campaign-exports",
            `${workspaceId}/${file.name}`,
          );
          content = JSON.parse(buffer.toString("utf-8"));
        } catch (downloadError) {
          logger.error(`Error downloading status file ${file.name}:`, downloadError);
          return null;
        }
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
