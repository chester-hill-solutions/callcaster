import { useState } from "react";
import { useLoaderData } from "react-router";
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { SaveBar } from "@/components/shared/SaveBar";
import { useHasChanges } from "@/hooks/utils/useHasChanges";
import {
  normalizeScriptForComparison,
} from "@/lib/script-change";
import type { Script } from "@/lib/types";

import type { ScriptIdLoaderData } from "./$scriptId.loader.server";

export { loader } from "./$scriptId.loader.server";
export { action } from "./$scriptId.action.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

export default function ScriptEditor() {
  const { script: initScript, mediaNames } = useLoaderData<ScriptIdLoaderData>();
  const [script, setScript] = useState(initScript);
  const isChanged = useHasChanges(script, initScript, normalizeScriptForComparison);

  const handleSaveUpdate = async () => {
    try {
      const response = await fetch("/api/scripts", {
        method: "PATCH",
        body: JSON.stringify({
          ...script,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }
      setScript(script);
    } catch (error) {
      console.error("Error saving update:", error);
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
          scripts={[]}
        />
      </div>
    </div>
  );
}
