export { loader } from "./exports.loader.server";

import {
  data as routeData,
  LoaderFunctionArgs,
  useLoaderData,
  useParams,
  useRevalidator,
} from "react-router";
import { useState } from "react";

import { Download, Loader2, RefreshCw } from "lucide-react";
import { usePollingRevalidator } from "@/hooks/utils";
import { logger } from "@/lib/logger.client";
import { toUserMessage } from "@/lib/user-message";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
import { Heading, Text } from "@/components/ui/typography";

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

interface ExportableCampaign {
  id: number;
  title: string;
  type: string | null;
}

interface LoaderData {
  exports: SerializedExportItem[];
  campaigns?: ExportableCampaign[];
}

export default function WorkspaceExports() {
  const { exports: serializedExports = [], campaigns = [] } = useLoaderData<LoaderData>();
  const { id: workspaceId } = useParams();
  const { revalidate } = useRevalidator();
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [startState, setStartState] = useState<
    { status: "idle" } | { status: "starting" } | { status: "error"; message: string }
  >({ status: "idle" });

  // Starting an export only needs the POST: the row it creates is picked up by
  // this page's existing poll, which already renders progress and the download
  // link. No second progress widget, and no duplicate of the polling in
  // AsyncExportButton.
  const startExport = async () => {
    if (!selectedCampaign || !workspaceId) return;
    setStartState({ status: "starting" });
    try {
      const body = new FormData();
      body.append("campaignId", selectedCampaign);
      body.append("workspaceId", workspaceId);
      const response = await fetch("/api/campaign-export", { method: "POST", body });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setStartState({
          status: "error",
          message: toUserMessage(
            payload?.error,
            "Could not start the export. Please try again.",
          ),
        });
        return;
      }
      setStartState({ status: "idle" });
      setSelectedCampaign("");
      await revalidate();
    } catch (error) {
      logger.error("Failed to start export", error);
      setStartState({
        status: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    }
  };

  // Convert serialized dates back to Date objects
  const exports = serializedExports.map(exp => ({
    ...exp,
    createdAt: new Date(exp.createdAt),
    expiresAt: new Date(exp.expiresAt)
  }));

  // Poll for updates if there are any in-progress exports
  const hasInProgressExports = exports.some(exp =>
    exp.status === "processing" || exp.status === "started"
  );
  usePollingRevalidator(hasInProgressExports, 5000);

  const getProgressDisplay = (exportItem: ExportItem) => {
    if (exportItem.status === "completed") {
      return <span className="text-emerald-600 dark:text-emerald-400">Complete</span>;
    }

    if (exportItem.status === "error") {
      return <span className="text-destructive">Failed</span>;
    }

    if (exportItem.status === "processing" || exportItem.status === "started") {
      const progress = Math.min(Math.max(0, exportItem.progress), 100);
      return (
        <div className="flex items-center gap-2">
          <Progress value={progress} className="w-[100px]" />
          <span className="text-xs text-muted-foreground">
            {exportItem.processed && exportItem.total ? 
              `${exportItem.processed}/${exportItem.total}` :
              `${progress}%`
            }
          </span>
        </div>
      );
    }

    return <span className="text-muted-foreground">-</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading as="h1" level={2} branded={false}>
            Campaign Exports
          </Heading>
          <Text variant="muted" className="mt-2">
            Exports are available for download for 24 hours after creation
          </Text>
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

      {/*
        Until this existed the page was a dead end: it could list and download
        exports but offered no way to create one, and its empty state told you
        to "export data from your campaigns" without saying where.
      */}
      {campaigns.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center">
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-full sm:w-[320px]" aria-label="Campaign to export">
              <SelectValue placeholder="Choose a campaign to export" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={String(campaign.id)}>
                  {campaign.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={startExport}
            disabled={!selectedCampaign || startState.status === "starting"}
            className="w-full sm:w-auto"
          >
            {startState.status === "starting" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              "Export"
            )}
          </Button>
        </div>
      )}

      {startState.status === "error" && (
        <Text variant="muted" className="text-destructive">
          {startState.message}
        </Text>
      )}

      {exports.length === 0 ? (
        <Text variant="muted" className="py-12 text-center">
          {campaigns.length > 0
            ? "No exports yet. Choose a campaign above to create one."
            : "No exports available. Create a campaign first, then export its results here."}
        </Text>
      ) : (
        <div className="overflow-x-auto">
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
                        <div className="text-sm text-muted-foreground">{exportItem.stage}</div>
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
                      <span className="text-sm text-destructive">Expired</span>
                    )}
                    {(exportItem.status === "processing" || exportItem.status === "started") && (
                      <span className="text-sm text-muted-foreground">Processing...</span>
                    )}
                    {exportItem.status === "error" && (
                      <span className="text-sm text-destructive">Failed</span>
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

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
