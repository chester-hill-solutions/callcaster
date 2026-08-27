export { loader } from "./edit.loader.server";
export { action } from "./edit.action.server";

import { useLoaderData } from "react-router";
import { useCallback, useState } from "react";
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
import {
  normalizeScriptForComparison,
  normalizeScriptPageDataForComparison,
} from "@/lib/script-change";

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
    mediaNames: loaderMediaNames = [],
    data,
    scripts = [],
    workspace_id,
  } = useLoaderData<LoaderData>();
  const [mediaNames, setMediaNames] = useState<string[]>(
    () => loaderMediaNames ?? [],
  );
  const [initData, setInitData] = useState<PageData>(data);
  const [pageData, setPageData] = useState<PageData>(data);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // The script preview is read-only until the user explicitly opts into
  // editing — attaching a script and editing its content are different acts,
  // and conflating them is what silently discarded attachments (#1124).
  const [isEditingScript, setIsEditingScript] = useState(false);
  const isChanged = useHasChanges(
    pageData,
    initData,
    normalizeScriptPageDataForComparison,
  );
  // Save-as-copy is only a meaningful question when the script's CONTENT
  // changed. A selection-only change (attach/detach/switch) has nothing to
  // copy, so compare against the pristine version of the CURRENTLY selected
  // script: the loader's copy when the selection is unchanged, the dropdown
  // list's copy when the user switched scripts.
  const currentScript = pageData.campaignDetails.script ?? null;
  const pristineScript =
    currentScript == null
      ? null
      : currentScript.id === initData.campaignDetails.script?.id
        ? initData.campaignDetails.script
        : scripts.find((s) => s.id === currentScript.id) ?? null;
  const scriptContentChanged =
    currentScript != null &&
    pristineScript != null &&
    JSON.stringify(normalizeScriptForComparison(currentScript)) !==
      JSON.stringify(normalizeScriptForComparison(pristineScript));
  useUnsavedChangesGuard(isChanged);

  const handleSaveUpdate = async (saveScriptAsCopy: boolean) => {
    setIsSaving(true);
    try {
      const campaignPayload =
        pageData.type === "message"
          ? {
              ...pageData,
              body_text: pageData.campaignDetails.body_text ?? "",
              message_media: pageData.campaignDetails.message_media ?? [],
            }
          : pageData;
      const formData = new FormData();
      formData.append("campaignData", JSON.stringify(campaignPayload));
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
      setIsEditingScript(false);
      toast.success(
        pageData.type === "message" ? "Message saved" : "Script saved",
      );
    } catch (error) {
      loggerClient.error("Error saving update:", error);
      toast.error(
        pageData.type === "message"
          ? "Couldn't save the message. Please try again."
          : "Couldn't save the script. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPageData(data);
    setIsEditingScript(false);
  };

  // Mirrors the standalone scripts route: uploads the audio file to the
  // workspace media library and returns the stored name so the recorded block
  // can reference it. Without this, the campaign script editor has no upload
  // affordance at all (#1346).
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

    // Switching scripts replaces the draft with the pristine copy, so any
    // in-flight content edits to the previous script are gone — leave edit
    // mode rather than presenting the new script as already-being-edited.
    setIsEditingScript(false);

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
    const script = pageData.campaignDetails.script;
    if (!script) {
      return (
        <p className="text-sm text-muted-foreground">
          Select a script above to edit it here.
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {!isEditingScript && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-sm text-muted-foreground">
              Previewing {script.name}. The script is
              attached when you save — editing is optional.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditingScript(true)}
            >
              Edit script
            </Button>
          </div>
        )}
        <CampaignSettingsScript
          script={script}
          onChange={(nextScript) => {
            handlePageDataChange({
              ...pageData,
              campaignDetails: {
                ...pageData.campaignDetails,
                script: nextScript,
              },
            });
          }}
          mediaNames={scriptMediaNames}
          onUploadAudio={handleUploadAudio}
          readOnly={!isEditingScript}
        />
      </div>
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
          onSave={() => {
            // Message campaigns have no script copy flow — save directly (#1115).
            // Selection-only changes save directly too: the save-as-copy
            // question only applies when script content was edited (#1124).
            if (pageData.type === "message" || !scriptContentChanged) {
              void handleSaveUpdate(false);
              return;
            }
            setShowSaveModal(true);
          }}
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
