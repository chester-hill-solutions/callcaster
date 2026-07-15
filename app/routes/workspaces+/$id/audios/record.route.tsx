export { loader } from "./record.loader.server";
export { action } from "./record.action.server";

import { useCallback } from "react";
import { Link, useActionData, useNavigate, useNavigation, useSubmit } from "react-router";

import { AudioRecorder } from "@/components/file-assets/AudioRecorder";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";

export const meta = () => [{ title: "Record audio — CallCaster" }];

export default function RecordAudioPage() {
  const actionData = useActionData<{ success?: boolean; error?: string }>();
  const { state } = useNavigation();
  const submit = useSubmit();
  const navigate = useNavigate();

  const handleComplete = useCallback(
    (blob: Blob, mimeType: string, durationMs: number) => {
      // Post the raw take: the server accept list already covers webm and mp4,
      // and ffmpeg normalizes it to the same mono 44.1kHz mp3 as an upload, so
      // there is nothing to transcode here.
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.set("media", blob, `recording.${extension}`);
      formData.set("durationMs", String(Math.round(durationMs)));
      submit(formData, { method: "POST", encType: "multipart/form-data" });
    },
    [submit],
  );

  return (
    <PageShell
      title="Record audio"
      description="Record a greeting or prompt, then trim it before saving."
    >
      {actionData?.error != null ? (
        <Text className="mb-4 text-destructive">{actionData.error}</Text>
      ) : null}

      <AudioRecorder
        onComplete={handleComplete}
        onCancel={() => navigate("../../audios", { relative: "path" })}
        disabled={state !== "idle"}
      />

      <Button asChild variant="outline" className="mt-6">
        <Link to="../../audios" relative="path">
          Back to audio library
        </Link>
      </Button>
    </PageShell>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
