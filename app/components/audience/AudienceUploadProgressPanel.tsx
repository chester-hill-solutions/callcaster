import { useState } from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { audienceImportReportUrl } from "@/lib/audience-import-report";
import {
  audienceUploadProgressLabel,
  type AudienceUploadProgressStatus,
} from "./audience-upload-phase";

export type AudienceUploadProgressPanelProps = {
  status: AudienceUploadProgressStatus;
  progress: number;
  processedContacts: number;
  totalContacts: number;
  workspaceId?: string;
  uploadId?: number | null;
  reportAvailable?: boolean;
  errorMessage?: string | null;
  warning?: string | null;
  /** Rows dropped for invalid/unparseable phone numbers. */
  skippedInvalidContacts?: number | null;
  /** Rows dropped as duplicates (within the file or already in the audience). */
  skippedDuplicateContacts?: number | null;
  /** When false (embedded), hide the terminal success chrome. */
  showCompletionChrome: boolean;
  onTryAgain: () => void;
};

function skippedSummary(
  skippedDuplicateContacts: number,
  skippedInvalidContacts: number,
): string {
  const parts: string[] = [];
  if (skippedDuplicateContacts > 0) {
    parts.push(`${skippedDuplicateContacts} duplicates skipped`);
  }
  if (skippedInvalidContacts > 0) {
    parts.push(`${skippedInvalidContacts} invalid phone numbers skipped`);
  }
  return parts.join(" / ");
}

function ReportDownloadAction({ url }: { url: string | null }) {
  return <Button asChild variant="outline" disabled={!url}>
    <a href={url ?? undefined} tabIndex={url ? undefined : -1}>Download row report</a>
  </Button>;
}

export function AudienceUploadProgressPanel({
  status,
  progress,
  processedContacts,
  totalContacts,
  workspaceId,
  uploadId,
  reportAvailable = false,
  errorMessage,
  warning,
  skippedInvalidContacts,
  skippedDuplicateContacts,
  showCompletionChrome,
  onTryAgain,
}: AudienceUploadProgressPanelProps) {
  const notice = errorMessage || warning || null;
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const reportUrl = reportAvailable && workspaceId && uploadId != null ? audienceImportReportUrl(workspaceId, uploadId) : null;
  const skippedLine = skippedSummary(
    skippedDuplicateContacts ?? 0,
    skippedInvalidContacts ?? 0,
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {audienceUploadProgressLabel(status)}
        </span>
        <span className="text-sm">
          {processedContacts} / {totalContacts} contacts
        </span>
      </div>
      <Progress value={progress} className="h-2" />

      <p className="min-h-8 text-xs text-muted-foreground" aria-live="polite">{skippedLine}</p>

      <div className="flex flex-wrap gap-2">
        <ReportDownloadAction url={reportUrl} />
        <Dialog open={notice != null && notice !== dismissedNotice}
          onOpenChange={open => setDismissedNotice(open ? null : notice)}>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" disabled={!notice}>Upload details</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{errorMessage ? "Upload failed" : "Upload still running"}</DialogTitle></DialogHeader>
            <Alert variant={errorMessage ? "destructive" : "warning"}>
              <AlertTitle>{errorMessage ? "Error" : "Progress delayed"}</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
            <DialogFooter>
              <ReportDownloadAction url={reportUrl} />
              {errorMessage ? <Button type="button" onClick={onTryAgain}>Try Again</Button> : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex min-h-24 justify-center">
        {status === "completed" ? (
          showCompletionChrome ? (
            <div className="text-center text-success">
              <Check className="mx-auto h-9 w-9" />
              <p>Upload completed successfully!</p>
              <p className="text-sm">Redirecting to audience page...</p>
            </div>
          ) : null
        ) : status === "error" ? (
          <Button
            type="button"
            onClick={onTryAgain}
            variant="outline"
            className="mt-4"
          >
            Try Again
          </Button>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Please wait while your contacts are being processed...
          </p>
        )}
      </div>
    </div>
  );
}
