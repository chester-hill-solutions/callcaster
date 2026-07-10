import { useCallback, useEffect, useState } from "react";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import { fetchAudienceUploads } from "@/lib/chats/messaging-client";
import { logger } from "@/lib/logger.client";

export interface AudienceUpload {
  id: number;
  audience_id: number;
  created_at: string;
  status: string;
  file_name: string | null;
  file_size: number | null;
  total_contacts: number;
  processed_contacts: number;
  processed_at: string | null;
  error_message: string | null;
}

/**
 * Loads an audience's upload history from the uploads resource route and
 * keeps it live-updated via the workspace Realtime subscription.
 */
export function useAudienceUploads({
  workspaceId,
  audienceId,
}: {
  workspaceId: string;
  audienceId: number;
}) {
  const [uploads, setUploads] = useState<AudienceUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!audienceId || !workspaceId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await fetchAudienceUploads(workspaceId, audienceId);
      setUploads(data as AudienceUpload[]);
    } catch (err) {
      logger.error("Error fetching audience uploads:", err);
      setError(err instanceof Error ? err.message : "An error occurred while fetching uploads");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, audienceId]);

  // Syncs with the server (external system) on mount and id change.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Phase 3B: Postgres Realtime subscription for live upload progress updates.
  useWorkspaceEventSubscription({
    workspaceId,
    table: "audience_upload",
    filter: `audience_id=eq.${audienceId}`,
    onChange: (payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        setUploads(prev => [payload.new as unknown as AudienceUpload, ...prev]);
      } else if (payload.eventType === "UPDATE" && payload.new) {
        const newData = payload.new as Partial<AudienceUpload> & { id?: number };
        setUploads(prev =>
          prev.map(upload =>
            newData.id && upload.id === newData.id ? { ...upload, ...newData } : upload
          )
        );
      } else if (payload.eventType === "DELETE") {
        setUploads(prev => prev.filter(upload => upload["id"] !== (payload.old as { id?: number })["id"]));
      }
    },
  });

  return { uploads, loading, error, refresh };
}
