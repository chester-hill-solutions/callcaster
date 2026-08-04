import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export type AudienceUploadFileSummaryProps = {
  fileName: string;
  rowCount: number;
  columnCount: number;
};

export function AudienceUploadFileSummary({
  fileName,
  rowCount,
  columnCount,
}: AudienceUploadFileSummaryProps) {
  return (
    <Alert>
      <AlertDescription>
        <div className="flex flex-wrap items-center gap-2">
          <span>
            File: <span className="font-medium text-foreground">{fileName}</span>
          </span>
          <Badge variant="outline">{rowCount.toLocaleString()} rows</Badge>
          <Badge variant="outline">{columnCount} columns</Badge>
        </div>
      </AlertDescription>
    </Alert>
  );
}
