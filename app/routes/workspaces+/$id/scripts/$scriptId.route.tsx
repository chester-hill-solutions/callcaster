import { useState } from "react";
import { useLoaderData } from "react-router";
import { toast } from "sonner";
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";

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
  const { script: loaderScript, mediaNames } = useLoaderData<ScriptIdLoaderData>();
  const [initScript, setInitScript] = useState(loaderScript);
  const [script, setScript] = useState(loaderScript);
  const [isSaving, setIsSaving] = useState(false);
  const isChanged = useHasChanges(script, initScript, normalizeScriptForComparison);
  useUnsavedChangesGuard(isChanged);

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

  type PageData = {
    campaignDetails: { script: Script };
  };

  const handlePageDataChange = (newPageData: PageData) => {
    setScript(newPageData.campaignDetails.script);
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
      <div className="h-full flex-grow p-4">
        <CampaignSettingsScript
          pageData={{ campaignDetails: { script } } as PageData}
          onPageDataChange={(newData: PageData) => {
            handlePageDataChange(newData);
          }}
          mediaNames={(mediaNames ?? []).map((media) =>
            typeof media === "string" ? media : media.name,
          )}
        />
      </div>
    </div>
  );
}
