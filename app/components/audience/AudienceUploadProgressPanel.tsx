import { MdCheck } from "react-icons/md";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  audienceUploadProgressLabel,
  type AudienceUploadProgressStatus,
} from "./audience-upload-phase";

export type AudienceUploadProgressPanelProps = {
  status: AudienceUploadProgressStatus;
  progress: number;
  processedContacts: number;
  totalContacts: number;
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

export function AudienceUploadProgressPanel({
  status,
  progress,
  processedContacts,
  totalContacts,
  errorMessage,
  warning,
  skippedInvalidContacts,
  skippedDuplicateContacts,
  showCompletionChrome,
  onTryAgain,
}: AudienceUploadProgressPanelProps) {
  const skippedLine = skippedSummary(
    skippedDuplicateContacts ?? 0,
    skippedInvalidContacts ?? 0,
  );
  return (
    <div className="space-y-2">
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {warning && !errorMessage ? (
        <Alert>
          <AlertTitle>Upload still running</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {audienceUploadProgressLabel(status)}
        </span>
        <span className="text-sm">
          {processedContacts} / {totalContacts} contacts
        </span>
      </div>
      <Progress value={progress} className="h-2" />

      {skippedLine ? (
        <p className="text-xs text-muted-foreground">{skippedLine}</p>
      ) : null}

      <div className="flex justify-center">
        {status === "completed" ? (
          showCompletionChrome ? (
            <div className="text-center text-green-500">
              <MdCheck className="mx-auto text-4xl" />
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
