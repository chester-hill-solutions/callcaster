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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
      <span>
        File: <span className="font-medium text-foreground">{fileName}</span>
      </span>
      <Badge variant="outline">{rowCount.toLocaleString()} rows</Badge>
      <Badge variant="outline">{columnCount} columns</Badge>
    </div>
  );
}
