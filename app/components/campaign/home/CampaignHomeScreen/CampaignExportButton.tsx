import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCampaignExport } from "@/hooks/campaign";

type CampaignExportButtonProps = {
  campaignId: string | number | null | undefined;
  workspaceId: string | number | null | undefined;
  /** Idle button label. */
  label?: string;
  /** Label once the export is ready. */
  downloadingLabel?: string;
  /** Generate the full SMS campaign report instead of the standard CSV. */
  exportType?: "sms-report";
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
};

export const CampaignExportButton = ({
  campaignId,
  workspaceId,
  label = "Export Results",
  downloadingLabel = "Download Export",
  exportType,
  disabled = false,
  size = "default",
}: CampaignExportButtonProps) => {
  const {
    isExporting,
    progress,
    downloadUrl,
    downloads,
    canExport,
    startExport,
  } = useCampaignExport({ campaignId, workspaceId, exportType });

  return (
    <div className="flex items-center gap-2">
      {downloads.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {downloads.map((download) => (
            <Button
              key={download.filename}
              asChild
              variant="outline"
              size={size}
            >
              <a href={download.downloadUrl} download={download.filename}>
                <Download className="mr-2 h-4 w-4" />
                {download.label}
              </a>
            </Button>
          ))}
        </div>
      ) : downloadUrl ? (
        <Button asChild variant="outline" size={size}>
          <a href={downloadUrl} download>
            <Download className="mr-2 h-4 w-4" />
            {downloadingLabel}
          </a>
        </Button>
      ) : (
        <Button
          onClick={startExport}
          disabled={disabled || isExporting || !canExport}
          variant="outline"
          size={size}
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            label
          )}
        </Button>
      )}

      {isExporting && progress > 0 && (
        <div className="text-muted-foreground text-sm">
          {progress}% complete
        </div>
      )}
    </div>
  );
};
