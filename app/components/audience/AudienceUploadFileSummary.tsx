export type AudienceUploadFileSummaryProps = {
  fileName: string;
  rowCount: number;
  columnCount: number;
  hint?: string;
};

export function AudienceUploadFileSummary({
  fileName,
  rowCount,
  columnCount,
  hint,
}: AudienceUploadFileSummaryProps) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
      <div className="truncate">
        File: <span className="font-medium text-foreground">{fileName}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="shrink-0 text-muted-foreground">
          {rowCount.toLocaleString()} rows {columnCount} columns
        </span>
        {hint ? <span className="min-w-0 text-right text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}
