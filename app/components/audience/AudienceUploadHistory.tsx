import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAudienceUploads, type AudienceUpload } from "@/hooks/audience/useAudienceUploads";

interface AudienceUploadHistoryProps {
  audienceId: number;
  workspaceId: string;
}

export default function AudienceUploadHistory({
  audienceId,
  workspaceId,
  }: AudienceUploadHistoryProps) {
  const { uploads, loading, error, refresh } = useAudienceUploads({
    workspaceId,
    audienceId,
  });

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-brand-primary" />
        <p>Loading upload history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-destructive/30 rounded-md bg-destructive/10 text-destructive">
        <p className="font-semibold">Error loading upload history</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => refresh()}
          className="mt-2 text-sm underline hover:text-destructive/80"
        >
          Try again
        </button>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No upload history found for this audience
      </p>
    );
  }

  function formatFileSize(bytes: number | null): string {
    if (bytes === null) return "Unknown";

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  function getProgressPercentage(upload: AudienceUpload): number {
    if (upload.total_contacts === 0) return 0;
    return Math.round((upload.processed_contacts / upload.total_contacts) * 100);
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                File
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Contacts
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Size
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {uploads.map((upload) => (
              <tr key={upload.id} className="hover:bg-muted/50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {upload.file_name || "Unknown file"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={upload.status} className="w-fit" />
                      {upload.status === "error" && upload.error_message && (
                        <span title={upload.error_message}>⚠️</span>
                      )}
                    </div>

                    {upload.status === "processing" && (
                      <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${getProgressPercentage(upload)}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {upload.status === "completed"
                    ? upload.total_contacts
                    : `${upload.processed_contacts} / ${upload.total_contacts}`}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {formatFileSize(upload.file_size)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
