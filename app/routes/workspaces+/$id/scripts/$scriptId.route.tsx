import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { SaveBar } from "@/components/shared/SaveBar";
import { deepEqual } from "@/lib/utils";
import {
  normalizeScriptForComparison,
  normalizeScriptPageDataForComparison,
} from "@/lib/script-change";
import type { Script } from "@/lib/types";

import type { ScriptIdLoaderData } from "./$scriptId.loader.server";

export { loader } from "./$scriptId.loader.server";
export { action } from "./$scriptId.action.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

export default function ScriptEditor() {
  const { script: initScript, mediaNames } = useLoaderData<ScriptIdLoaderData>();
  const [isChanged, setChanged] = useState(false);
  const [script, setScript] = useState(initScript);

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
      setChanged(false);
    } catch (error) {
      console.error("Error saving update:", error);
    }
  };

  const handleReset = () => {
    setScript(initScript);
    setChanged(false);
  };

  type PageData = {
    campaignDetails: { script: Script };
  };

  const handlePageDataChange = (newPageData: PageData) => {
    setScript(newPageData.campaignDetails.script);
    const obj1 = normalizeScriptPageDataForComparison({
      campaignDetails: { script },
    });
    const obj2 = normalizeScriptPageDataForComparison(newPageData);
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    const obj1 = normalizeScriptForComparison(script);
    const obj2 = normalizeScriptForComparison(initScript);
    setChanged(!deepEqual(obj1, obj2));
  }, [initScript, script]);

  return (
    <div className="relative flex h-full flex-col overflow-visible">
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
