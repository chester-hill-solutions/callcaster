import { useState } from "react";
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
      {/*
        Persistent editor header: the SaveBar above only appears once the form is
        dirty, so without this there is no title, no way back to the script list,
        and no visible save control on a pristine script.
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
        <Button
          size="sm"
          onClick={handleSaveUpdate}
          disabled={!isChanged || isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
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
