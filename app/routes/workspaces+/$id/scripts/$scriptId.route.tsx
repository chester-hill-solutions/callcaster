import { useCallback, useState } from "react";
import { Link, useLoaderData } from "react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { SaveBar } from "@/components/shared/SaveBar";
import { useHasChanges } from "@/hooks/utils/useHasChanges";
import { useUnsavedChangesGuard } from "@/hooks/utils/useUnsavedChangesGuard";
import {
  normalizeScriptForComparison,
} from "@/lib/script-change";
import type { Script } from "@/lib/types";

import type { ScriptIdLoaderData } from "./$scriptId.loader.server";

export { loader } from "./$scriptId.loader.server";
export { action } from "./$scriptId.action.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

export default function ScriptEditor() {
  const { script: loaderScript, mediaNames: loaderMediaNames, workspace_id } =
    useLoaderData<ScriptIdLoaderData>();
  const [initScript, setInitScript] = useState(loaderScript);
  const [script, setScript] = useState(loaderScript);
  const [isSaving, setIsSaving] = useState(false);
  const [mediaNames, setMediaNames] = useState(() =>
    (loaderMediaNames ?? []).map((media) =>
      typeof media === "string" ? media : media.name,
    ),
  );
  const isChanged = useHasChanges(script, initScript, normalizeScriptForComparison);
  useUnsavedChangesGuard(isChanged);

  const handleUploadAudio = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const formData = new FormData();
        formData.set("workspaceId", workspace_id);
        formData.set("media", file);
        const response = await fetch("/api/audio-upload", {
          method: "POST",
          body: formData,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.error) {
          throw new Error(result?.error ?? "Failed to upload audio.");
        }
        const name = result.name as string;
        setMediaNames((current) =>
          current.includes(name) ? current : [...current, name],
        );
        return name;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn't upload the audio file.",
        );
        return null;
      }
    },
    [workspace_id],
  );

  const handleSaveUpdate = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/scripts", {
        method: "PATCH",
        body: JSON.stringify({
          ...script,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.error) {
        throw new Error(result?.error ?? "Failed to save script");
      }

      // Reflect the persisted row (which may have a new id/name if this was
      // a "save as copy") so the unsaved-changes bar clears correctly and
      // future saves target the row that actually exists on the server.
      const savedScript: Script | null = result?.script ?? script;
      setScript(savedScript);
      setInitScript(savedScript);
      toast.success("Script saved");
    } catch {
      toast.error("Couldn't save the script. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setScript(initScript);
  };

  return (
    <div className="relative flex h-full flex-col overflow-visible">
      <QueryParamBanner
        param="created"
        variants={{
          "1": {
            title: "Script created",
            description: "Your new script is ready to edit.",
          },
        }}
      />
      <SaveBar
        isChanged={isChanged}
        isSaving={isSaving}
        onSave={handleSaveUpdate}
        onReset={handleReset}
      />
      {/*
        Persistent editor header: the SaveBar above only appears once the form is
        dirty, so without this there is no title and no way back to the script
        list on a pristine script.

        Saving deliberately stays with the SaveBar rather than being mirrored
        here. It already owns Cmd/Ctrl+S and Reset, and a second "Save" is both
        redundant and ambiguous once the form is dirty — two buttons whose
        accessible names differ only by a suffix.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to scripts" asChild>
            <Link to=".." relative="path">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <Heading level={4} as="h1" className="truncate">
              {script?.name || "Untitled script"}
            </Heading>
            <Text variant="small">
              {isChanged ? "Unsaved changes" : "All changes saved"}
            </Text>
          </div>
        </div>
      </div>
      <div className="h-full flex-grow p-4">
        {script ? (
          <CampaignSettingsScript
            script={script}
            onChange={setScript}
            mediaNames={mediaNames}
            onUploadAudio={handleUploadAudio}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No script selected.</p>
        )}
      </div>
    </div>
  );
}
