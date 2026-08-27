import { useCallback, useState } from "react";
import { toast } from "sonner";

type AudioUploadResult = {
  ok: true;
  name: string;
} | {
  ok: false;
  error: string;
};

/**
 * Upload an audio file to the workspace media library and track the returned
 * media names. Shared by the standalone script editor and the campaign script
 * editor so the upload contract (request shape, response parsing, media-state
 * update, failure toast) cannot drift between the two routes.
 */
export function useWorkspaceAudioUpload(
  workspaceId: string,
  initialMediaNames: string[] = [],
) {
  const [mediaNames, setMediaNames] = useState<string[]>(
    () => initialMediaNames ?? [],
  );

  const uploadAudio = useCallback(
    async (file: File): Promise<string | null> => {
      const result = await uploadWorkspaceAudio(workspaceId, file);
      if (!result.ok) {
        toast.error(result.error);
        return null;
      }
      setMediaNames((current) =>
        current.includes(result.name) ? current : [...current, result.name],
      );
      return result.name;
    },
    [workspaceId],
  );

  return { uploadAudio, mediaNames };
}

export async function uploadWorkspaceAudio(
  workspaceId: string,
  file: File,
): Promise<AudioUploadResult> {
  try {
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("media", file);
    const response = await fetch("/api/audio-upload", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; name?: unknown }
      | null;
    if (!response.ok || result?.error) {
      return { ok: false, error: result?.error ?? "Failed to upload audio." };
    }
    const name = typeof result?.name === "string" ? result.name.trim() : "";
    if (!name) {
      return { ok: false, error: "Failed to upload audio." };
    }
    return { ok: true, name };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't upload the audio file.",
    };
  }
}