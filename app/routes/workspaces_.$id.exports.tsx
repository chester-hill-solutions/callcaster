import { LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { Card } from "@/components/ui/card";
import { Download, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = params["id"];
  if (!workspaceId) {
    return json({ error: "Missing workspace ID" }, { status: 400 });
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
          console.error(`Error downloading status file ${file.name}:`, downloadError);
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
        console.error(`Error processing file ${file.name}:`, error);
        return null;
      }
    }));

    // Filter out nulls and sort by newest first
    const validExports = processedExports
      .filter((exp): exp is ExportItem => exp !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return json<LoaderData>({
      exports: validExports.map((exp) => ({
        ...exp,
        createdAt: exp.createdAt.toISOString(),
        expiresAt: exp.expiresAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching exports:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, { status: 500 });
  }
};

export default function WorkspaceExports() {
  const { exports: serializedExports = [] } = useLoaderData<LoaderData>();
  const { revalidate } = useRevalidator();

  // Convert serialized dates back to Date objects
  const exports = serializedExports.map(exp => ({
    ...exp,
    createdAt: new Date(exp.createdAt),
    expiresAt: new Date(exp.expiresAt)
  }));

  // Poll for updates if there are any in-progress exports
  useEffect(() => {
    const hasInProgressExports = exports.some(exp => 
      exp.status === "processing" || exp.status === "started"
    );

    if (hasInProgressExports) {
      const interval = setInterval(revalidate, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [exports, revalidate]);

  const getProgressDisplay = (exportItem: ExportItem) => {
    if (exportItem.status === "completed") {
      return <span className="text-green-600">Complete</span>;
    }

    if (exportItem.status === "error") {
      return <span className="text-red-600">Failed</span>;
    }

    if (exportItem.status === "processing" || exportItem.status === "started") {
      const progress = Math.min(Math.max(0, exportItem.progress), 100);
      return (
        <div className="flex items-center gap-2">
          <Progress value={progress} className="w-[100px]" />
          <span className="text-xs text-gray-500">
            {exportItem.processed && exportItem.total ? 
              `${exportItem.processed}/${exportItem.total}` :
              `${progress}%`
            }
          </span>
        </div>
      );
    }

    return <span className="text-gray-500">-</span>;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-3xl font-bold">Campaign Exports</h1>
          <p className="text-gray-500 mt-2">
            Exports are available for download for 24 hours after creation
          </p>
        </div>
        <Button
          onClick={() => revalidate()}
          variant="outline"
          size="sm"
          className="flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {exports.length === 0 ? (
        <Card className="p-8">
          <p className="text-center text-gray-500">
            No exports available. Export data from your campaigns to see them here.
          </p>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Campaign</TableHead>
                <TableHead className="min-w-[180px]">Created</TableHead>
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="min-w-[150px]">Progress</TableHead>
                <TableHead className="min-w-[180px]">Expires</TableHead>
                <TableHead className="min-w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exports.map((exportItem) => (
                <TableRow key={exportItem.id} className={exportItem.isExpired ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    <div className="break-words">
                      {exportItem.campaignName}
                      {exportItem.stage && (
                        <div className="text-sm text-gray-500">{exportItem.stage}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap">
                      {exportItem.createdAt.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="capitalize whitespace-nowrap">{exportItem.status}</div>
                  </TableCell>
                  <TableCell>
                    {getProgressDisplay(exportItem)}
                  </TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap">
                      {exportItem.expiresAt.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {!exportItem.isExpired && exportItem.status === "completed" && (
                      <a
                        href={exportItem.downloadUrl}
                        download
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 py-2 whitespace-nowrap"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </a>
                    )}
                    {exportItem.isExpired && (
                      <span className="text-sm text-red-500">Expired</span>
                    )}
                    {(exportItem.status === "processing" || exportItem.status === "started") && (
                      <span className="text-sm text-gray-500">Processing...</span>
                    )}
                    {exportItem.status === "error" && (
                      <span className="text-sm text-red-500">Failed</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
} 