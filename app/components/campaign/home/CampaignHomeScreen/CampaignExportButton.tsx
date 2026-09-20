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
  size?: "default" | "sm" | "lg" | "icon";
};

/**
 * Starts a campaign export and shows its progress, then a download link.
 *
 * One implementation for the campaign results screens and the admin panel;
 * the only differences between them are the labels and the button size (#1892).
 */
export const CampaignExportButton = ({
  campaignId,
  workspaceId,
  label = "Export Results",
  downloadingLabel = "Download Export",
  size = "default",
}: CampaignExportButtonProps) => {
  const { isExporting, progress, downloadUrl, canExport, startExport } =
    useCampaignExport({ campaignId, workspaceId });

  return (
    <div className="flex items-center gap-2">
      {downloadUrl ? (
        <Button asChild variant="outline" size={size}>
          <a href={downloadUrl} download>
            <Download className="mr-2 h-4 w-4" />
            {downloadingLabel}
          </a>
        </Button>
      ) : (
        <Button
          onClick={startExport}
          disabled={isExporting || !canExport}
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
        <div className="text-sm text-muted-foreground">{progress}% complete</div>
      )}
    </div>
  );
};
