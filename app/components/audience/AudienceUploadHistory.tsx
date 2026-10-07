import { formatDistanceToNow } from "date-fns";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAudienceUploads, type AudienceUpload } from "@/hooks/audience/useAudienceUploads";

interface AudienceUploadHistoryProps {
  audienceId: number;
  workspaceId: string;
  initialUploads: AudienceUpload[] | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export default function AudienceUploadHistory({
  audienceId,
  workspaceId,
  initialUploads,
  error,
  loading,
  refresh,
}: AudienceUploadHistoryProps) {
  const uploads = useAudienceUploads({ workspaceId, audienceId, initialUploads });
  const noticeOwner = `${workspaceId}:${audienceId}`;
  const noticeId = useRef<string | number | undefined>(undefined);

  /**
   * @effect Keep the history failure and retry action in the root feedback host.
   * @effect-deps error and loading choose feedback; noticeOwner selects the audience; refresh retries the route loader.
   * @effect-side-effects dom: publish or dismiss persistent feedback after the root host subscribes.
   * @effect-why-not-loader The history is already route data; the browser host renders feedback outside page flow.
   */
  useEffect(() => {
    if (!error) {
      if (noticeId.current !== undefined) toast.dismiss(noticeId.current);
      noticeId.current = undefined;
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      noticeId.current = toast.error("Error loading upload history", {
        id: noticeId.current,
        description: error,
        duration: Infinity,
        closeButton: false,
        action: <Button type="button" variant="outline" size="sm" disabled={loading} onClick={refresh}>
          {loading ? "Retrying..." : "Try again"}
        </Button>,
      });
    });
    return () => { active = false; };
  }, [error, loading, noticeOwner, refresh]);

  /**
   * @effect Remove owned feedback when the audience changes or the page exits.
   * @effect-deps noticeOwner identifies the current workspace and audience.
   * @effect-side-effects dom: dismiss the prior audience's root-host notice.
   * @effect-why-not-loader The shared browser host outlives the audience page.
   */
  useEffect(() => () => {
    if (noticeId.current !== undefined) toast.dismiss(noticeId.current);
    noticeId.current = undefined;
  }, [noticeOwner]);

  if (uploads.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-center" aria-busy={loading}>
        <Text as="p" variant="muted">
          {loading ? "Loading upload history..." : error ? "Upload history is unavailable" : "No upload history found for this audience"}
        </Text>
      </div>
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
    <div className="overflow-hidden rounded-md border border-border" aria-busy={loading}>
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
