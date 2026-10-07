import { useState } from "react";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import type { AudienceUpload } from "@/lib/audience-upload.types";

export type { AudienceUpload } from "@/lib/audience-upload.types";

export function useAudienceUploads({
  workspaceId,
  audienceId,
  initialUploads,
}: {
  workspaceId: string;
  audienceId: number;
  initialUploads: AudienceUpload[] | null;
}) {
  const identity = `${workspaceId}:${audienceId}`;
  const [snapshot, setSnapshot] = useState(() => ({
    identity,
    source: initialUploads,
    uploads: initialUploads ?? [],
  }));
  let current = snapshot;
  if (snapshot.identity !== identity || snapshot.source !== initialUploads) {
    current = {
      identity,
      source: initialUploads,
      uploads: initialUploads ?? (snapshot.identity === identity ? snapshot.uploads : []),
    };
    setSnapshot(current);
  }

  useWorkspaceEventSubscription({
    workspaceId,
    table: "audience_upload",
    filter: `audience_id=eq.${audienceId}`,
    onChange: (payload) => {
      setSnapshot(previous => {
        if (previous.identity !== identity) return previous;
        const row = payload.new as Partial<AudienceUpload> | undefined;
        const old = payload.old as Partial<AudienceUpload> | undefined;
        if ((row?.audience_id != null && row.audience_id !== audienceId) ||
            (old?.audience_id != null && old.audience_id !== audienceId)) return previous;
        if (payload.eventType === "INSERT" && row?.id && row.audience_id === audienceId) {
          return { ...previous, uploads: [row as AudienceUpload, ...previous.uploads.filter(upload => upload.id !== row.id)] };
        }
        if (payload.eventType === "UPDATE" && row?.id) {
          return { ...previous, uploads: previous.uploads.map(upload => upload.id === row.id ? { ...upload, ...row } : upload) };
        }
        if (payload.eventType === "DELETE" && old?.id) {
          return { ...previous, uploads: previous.uploads.filter(upload => upload.id !== old.id) };
        }
        return previous;
      });
    },
  });

  return current.uploads;
}
