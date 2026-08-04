import { Button } from "@/components/ui/button";
import { AudienceUploadFileSummary } from "./AudienceUploadFileSummary";
import { PHONE_SKIP_HINT } from "./audience-upload-wizard.shared";

export type AudienceUploadReviewStepProps = {
  fileName: string;
  rowCount: number;
  columnCount: number;
  showSplitNameOption: boolean;
  splitNameEnabled: boolean;
  onSplitNameChange: (enabled: boolean) => void;
  onStartUpload: (event: React.FormEvent) => void;
  onBackToMapping: () => void;
};

export function AudienceUploadReviewStep({
  fileName,
  rowCount,
  columnCount,
  showSplitNameOption,
  splitNameEnabled,
  onSplitNameChange,
  onStartUpload,
  onBackToMapping,
}: AudienceUploadReviewStepProps) {
  return (
    <div className="space-y-4">
      <AudienceUploadFileSummary
        fileName={fileName}
        rowCount={rowCount}
        columnCount={columnCount}
      />

      <div className="space-y-2 rounded-md border bg-muted/40 p-4">
        <div className="text-sm text-foreground">
          {rowCount.toLocaleString()} contacts ready to upload
        </div>
        <div className="text-sm text-muted-foreground">{PHONE_SKIP_HINT}</div>
        {showSplitNameOption ? (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              id="split-name"
              className="rounded border-gray-300"
              checked={splitNameEnabled}
              onChange={(e) => onSplitNameChange(e.target.checked)}
            />
            Split full name into first name and last name
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBackToMapping}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onStartUpload}
          className="bg-brand-primary text-white hover:bg-brand-secondary"
        >
          Start Upload
        </Button>
      </div>
    </div>
  );
}
