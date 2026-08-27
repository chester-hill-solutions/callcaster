export { loader } from "./$fileName.edit.loader.server";
export { action } from "./$fileName.edit.action.server";

import { useCallback, useRef } from "react";
import { Link, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import {
  AudioClipEditor,
  type ClipRange,
} from "@/components/file-assets/AudioClipEditor";
import { PageShell } from "@/components/ui/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import type { AudioUsage } from "@/lib/database/audio-usage.server";
import type { WorkspaceAudioMetadata } from "@/lib/database/workspace-audio-metadata.server";

type LoaderData = {
  fileName: string | null;
  src: string | null;
  metadata: WorkspaceAudioMetadata | null;
  usage: AudioUsage[];
  error: string | null;
};

export const meta = ({ data }: { data?: LoaderData }) => [
  { title: `${data?.fileName ?? "Edit audio"} — CallCaster` },
];

export default function EditAudioPage() {
  const { fileName, src, metadata, usage, error } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success?: boolean; error?: string }>();
  const { state } = useNavigation();
  const submit = useSubmit();
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(
    (range: ClipRange, mode: "new" | "overwrite") => {
      const formData = new FormData();
      formData.set("startMs", String(Math.round(range.startMs)));
      formData.set("endMs", String(Math.round(range.endMs)));
      formData.set("mode", mode);
      if (mode === "overwrite") {
        // The editor only calls back with "overwrite" after its own
        // confirmation, which lists what references this file.
        formData.set("confirmOverwrite", "true");
      } else if (nameRef.current?.value.trim()) {
        formData.set("name", nameRef.current.value.trim());
      }
      submit(formData, { method: "POST" });
    },
    [submit],
  );

  if (error != null || fileName == null || src == null) {
    return (
      <PageShell title="Edit audio">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "Audio not found."}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="../../audios" relative="path">
            Back to audio library
          </Link>
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell title={`Edit ${fileName}`}>
      {actionData?.error != null ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-4 space-y-2">
        <label htmlFor="clip-name" className="text-sm font-medium text-foreground">
          New clip name
        </label>
        <input
          ref={nameRef}
          id="clip-name"
          name="name"
          type="text"
          placeholder={`${fileName.replace(/\.[^.]+$/, "")}-clip`}
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <Text className="text-xs text-muted-foreground">
          Leave blank to name it automatically. A name already in use gets a
          number appended rather than replacing the existing file.
        </Text>
      </div>

      <AudioClipEditor
        src={src}
        fileName={fileName}
        initialDurationMs={metadata?.duration_ms ?? undefined}
        usage={usage}
        busy={state !== "idle"}
        onSave={handleSave}
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
