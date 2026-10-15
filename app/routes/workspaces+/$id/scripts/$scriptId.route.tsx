import { useState } from "react";
import { useLoaderData } from "react-router";
import { toast } from "sonner";
import { EditableTitle } from "@/components/ui/editable-title";
import { Heading } from "@/components/ui/typography";
import { useWorkspaceAudioUpload } from "@/hooks/media/useWorkspaceAudioUpload";
import { useSearchParamFlash } from "@/hooks/utils/useSearchParamFlash";
import { workspaceAudioPreviewPath } from "@/lib/ivr-script-editor";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { SaveBar } from "@/components/shared/SaveBar";
import { useHasChanges } from "@/hooks/utils/useHasChanges";
import { useUnsavedChangesGuard } from "@/hooks/utils/useUnsavedChangesGuard";
import {
  normalizeScriptForComparison,
} from "@/lib/script-change";
import type { Script } from "@/lib/types";
import { toUserMessage } from "@/lib/user-message";

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
  const { uploadAudio, mediaNames } = useWorkspaceAudioUpload(
    workspace_id,
    (loaderMediaNames ?? []).map((media) =>
      typeof media === "string" ? media : media.name,
    ),
  );
  const isChanged = useHasChanges(script, initScript, normalizeScriptForComparison);
  useUnsavedChangesGuard(isChanged);
  useSearchParamFlash({
    created: (value) => {
      if (value === "1") {
        toast.success("Script created", {
          description: "Your new script is ready to edit.",
        });
      }
    },
  });

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
    } catch (error) {
      toast.error(toUserMessage(error, "Couldn't save the script. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setScript(initScript);
  };

  return (
    <div className="relative flex h-full flex-col overflow-visible">
      {/*
        The title and save controls stay together so the editor has one clear
        page header. SaveBar keeps the Cmd/Ctrl+S shortcut in embedded mode.
      */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Heading level={4} as="h1" className="min-w-0 truncate">
          <EditableTitle
            as="span"
            value={script?.name || ""}
            ariaLabel="script title"
            className="min-w-0"
            onSave={(name) =>
              setScript((current) => (current ? { ...current, name } : current))
            }
          />
        </Heading>
        <SaveBar
          isChanged={isChanged}
          isSaving={isSaving}
          onSave={handleSaveUpdate}
          onReset={handleReset}
          showMessage={false}
          embedded
          className="ml-auto"
        />
        </div>
      <div className="h-full flex-grow p-4">
        {script ? (
          <CampaignSettingsScript
            script={script}
            onChange={setScript}
            mediaNames={mediaNames}
            audioPreviewUrl={(fileName) =>
              workspaceAudioPreviewPath(workspace_id, fileName)
            }
            onUploadAudio={uploadAudio}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No script selected.</p>
        )}
      </div>
    </div>
  );
}
