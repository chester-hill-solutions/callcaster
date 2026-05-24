export { loader } from "./edit.loader.server";
export { action } from "./edit.action.server";

import { data as routeData, redirect } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { useState, useEffect } from "react";

import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { deepEqual } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import type { ScriptEditLoaderData } from "./edit.types";
import { logger as loggerClient } from "@/lib/logger.client";
import { normalizeScriptPageDataForComparison } from "@/lib/script-change";

type LoaderData = ScriptEditLoaderData;
type PageData = LoaderData["data"];

export default function ScriptEditor() {
  const { workspace_id, selected_id, mediaNames = [], scripts = [], data } =
    useLoaderData<LoaderData>();
  const [initData, setInitData] = useState<PageData>(data);
  const submit = useSubmit();
  const [pageData, setPageData] = useState<PageData>(data);
  const [isChanged, setChanged] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleSaveUpdate = async (saveScriptAsCopy: boolean) => {
    try {
      const formData = new FormData();
      formData.append('campaignData', JSON.stringify(pageData));
      formData.append('campaignDetails', JSON.stringify(pageData.campaignDetails));
      formData.append('scriptData', JSON.stringify(pageData.campaignDetails.script));
      formData.append('saveScriptAsCopy', saveScriptAsCopy.toString());

      submit(formData, {
        method: !saveScriptAsCopy ? "PATCH" : "POST",
        action: "/api/campaigns",
        navigate: false,
      });
      setInitData(pageData);
      setChanged(false);
      setShowSaveModal(false);
    } catch (error) {
      loggerClient.error("Error saving update:", error);
    }
  };

  const handleReset = () => {
    setPageData(data);
    setChanged(false);
  };

  const handlePageDataChange = (newPageData: PageData) => {
    setPageData(newPageData);
    const obj1 = normalizeScriptPageDataForComparison(initData);
    const obj2 = normalizeScriptPageDataForComparison(newPageData);
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    const obj1 = normalizeScriptPageDataForComparison(initData);
    const obj2 = normalizeScriptPageDataForComparison(pageData);
    setChanged(!deepEqual(obj1, obj2));
  }, [data, initData, pageData]);

  const renderCampaignSettingsScript = (mediaNames: string[] = []) => {
    if (!pageData.campaignDetails.script) return null;
    
    const scriptPageData = {
      campaignDetails: {
        ...pageData.campaignDetails,
        script: pageData.campaignDetails.script
      }
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
            }
          });
        }}
        scripts={scripts}
        mediaNames={mediaNames}
      />
    );
  };

  return (
    <>
      <div className="relative flex h-full flex-col">
        <SaveBar
          isChanged={isChanged}
          onSave={() => setShowSaveModal(true)}
          onReset={handleReset}
        />
        <div className="h-full flex-grow p-4">
          {(pageData.type === "live_call") && renderCampaignSettingsScript([])}
          {(pageData.type === "robocall" ||
            pageData.type === "simple_ivr" ||
            pageData.type === "complex_ivr") && renderCampaignSettingsScript(mediaNames)}
          {pageData.type === "message" && (
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
          )}
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
            >
              Save
            </Button>
            <Button onClick={() => handleSaveUpdate(true)}>Save as Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
