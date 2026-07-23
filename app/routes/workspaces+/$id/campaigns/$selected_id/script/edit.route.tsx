export { loader } from "./edit.loader.server";
export { action } from "./edit.action.server";

import { useLoaderData } from "react-router";
import { useState } from "react";
import { toast } from "sonner";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import SelectScript from "@/components/campaign/settings/detailed/CampaignDetailed.SelectScript";
import { CampaignPlaceNav } from "@/components/campaign/CampaignPlaceNav";
import { Button } from "@/components/ui/button";
import { useHasChanges } from "@/hooks/utils/useHasChanges";
import { useUnsavedChangesGuard } from "@/hooks/utils/useUnsavedChangesGuard";
import { SaveBar } from "@/components/shared/SaveBar";

import { MessageSettings } from "@/components/MessageSettings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Script } from "@/lib/types";
import type { ScriptEditLoaderData } from "./edit.types";
import { logger as loggerClient } from "@/lib/logger.client";
import { normalizeScriptPageDataForComparison } from "@/lib/script-change";

type LoaderData = ScriptEditLoaderData;
type PageData = LoaderData["data"];

function isVoiceCampaignType(type: PageData["type"]): boolean {
  return (
    type === "live_call" ||
    type === "robocall" ||
    type === "simple_ivr" ||
    type === "complex_ivr"
  );
}

export default function ScriptEditor() {
  const {
    mediaNames = [],
    data,
    scripts = [],
  } = useLoaderData<LoaderData>();
  const [initData, setInitData] = useState<PageData>(data);
  const [pageData, setPageData] = useState<PageData>(data);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isChanged = useHasChanges(
    pageData,
    initData,
    normalizeScriptPageDataForComparison,
  );
  useUnsavedChangesGuard(isChanged);

  const handleSaveUpdate = async (saveScriptAsCopy: boolean) => {
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("campaignData", JSON.stringify(pageData));
      formData.append(
        "campaignDetails",
        JSON.stringify(pageData.campaignDetails),
      );
      formData.append(
        "scriptData",
        JSON.stringify(pageData.campaignDetails.script ?? null),
      );
      formData.append("saveScriptAsCopy", saveScriptAsCopy.toString());

      // The HTTP method is always PATCH here: "save as copy" is a flag the
      // server uses to copy the script row, not a request to create a new
      // campaign (that's what POST /api/campaigns does elsewhere).
      const response = await fetch("/api/campaigns", {
        method: "PATCH",
        body: formData,
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.error) {
        throw new Error(result?.error ?? "Failed to save script");
      }

      // Merge the persisted script (which may have a new id/name if this
      // was a "save as copy") back into local state so future saves target
      // the row that actually exists on the server.
      const savedPageData: PageData = result?.script
        ? {
            ...pageData,
            campaignDetails: {
              ...pageData.campaignDetails,
              script: result.script,
              script_id: result.script.id,
            },
          }
        : pageData;

      setPageData(savedPageData);
      setInitData(savedPageData);
      setShowSaveModal(false);
      toast.success("Script saved");
    } catch (error) {
      loggerClient.error("Error saving update:", error);
      toast.error("Couldn't save the script. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPageData(data);
  };

  const handlePageDataChange = (newPageData: PageData) => {
    setPageData(newPageData);
  };

  const handleScriptAssignment = (name: string, value: string | number | boolean | null) => {
    if (name !== "script_id") return;

    const nextScriptId =
      value === "" || value == null ? null : Number(value);
    const nextScript: Script | undefined =
      nextScriptId == null
        ? undefined
        : scripts.find((script) => String(script.id) === String(nextScriptId));

    handlePageDataChange({
      ...pageData,
      campaignDetails: {
        ...pageData.campaignDetails,
        script_id: nextScriptId,
        script: nextScript,
      },
    });
  };

  const renderCampaignSettingsScript = (scriptMediaNames: string[] = []) => {
    if (!pageData.campaignDetails.script) {
      return (
        <p className="text-sm text-muted-foreground">
          Select a script above to edit it here.
        </p>
      );
    }

    const scriptPageData = {
      campaignDetails: {
        ...pageData.campaignDetails,
        script: pageData.campaignDetails.script,
      },
    };

    return (
      <CampaignSettingsScript
        pageData={scriptPageData}
        onPageDataChange={(newData) => {
          handlePageDataChange({
            ...pageData,
            campaignDetails: {
              ...pageData.campaignDetails,
              script: newData.campaignDetails.script,
            },
          });
        }}
        mediaNames={scriptMediaNames}
      />
    );
  };

  const selectedScriptId = pageData.campaignDetails.script_id ?? null;
  const isScriptMissing = isVoiceCampaignType(pageData.type) && !selectedScriptId;

  return (
    <>
      <div className="relative flex h-full flex-col">
        <SaveBar
          isChanged={isChanged}
          isSaving={isSaving}
          onSave={() => setShowSaveModal(true)}
          onReset={handleReset}
        />
        <div className="flex h-full flex-grow flex-col gap-4 p-4">
          {isVoiceCampaignType(pageData.type) ? (
            <div id="campaign-setup-content" className="space-y-3">
              <SelectScript
                handleInputChange={handleScriptAssignment}
                selectedScript={selectedScriptId}
                scripts={scripts}
                invalid={isScriptMissing}
              />
            </div>
          ) : null}
          {pageData.type === "live_call" && renderCampaignSettingsScript([])}
          {(pageData.type === "robocall" ||
            pageData.type === "simple_ivr" ||
            pageData.type === "complex_ivr") &&
            renderCampaignSettingsScript(mediaNames)}
          {pageData.type === "message" && (
            <div id="campaign-setup-content">
              <MessageSettings
                mediaLinks={
                  Array.isArray(pageData.campaignDetails.mediaLinks)
                    ? pageData.campaignDetails.mediaLinks.filter(
                        (link): link is string => typeof link === "string",
                      )
                    : []
                }
                details={pageData.campaignDetails}
                onChange={(field, value) => {
                  handlePageDataChange({
                    ...pageData,
                    campaignDetails: {
                      ...pageData.campaignDetails,
                      [field]: value,
                    },
                  });
                }}
                surveys={[]}
              />
            </div>
          )}
          <CampaignPlaceNav current="content" />
        </div>
      </div>
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>
              Save {pageData.campaignDetails?.script?.name}
            </DialogTitle>
            <DialogDescription>
              Would you like to save changes to the existing{" "}
              {pageData.campaignDetails.script?.name}, or save as a copy?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => handleSaveUpdate(false)}
              className="mr-2"
              variant={"outline"}
              disabled={isSaving}
            >
              Save
            </Button>
            <Button onClick={() => handleSaveUpdate(true)} disabled={isSaving}>
              Save as Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
