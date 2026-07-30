export { loader } from "./settings.loader.server";
export { action } from "./settings.action.server";

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { CampaignSettings } from "@/components/campaign/settings/CampaignSettings";
import { useCampaignSettingsController } from "@/components/campaign/settings/useCampaignSettingsController";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CampaignSettingsRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    phoneNumbers,
    user,
    draftCampaignData,
    draftCampaignDetails,
    pendingCampaignType,
    setPendingCampaignType,
    isChanged,
    fetcher,
    isSaving,
    feedbackMessage,
    feedbackTone,
    smsSendContext,
    handleInputChange,
    handleSave,
    handleResetData,
    handleConfirmTypeChange,
  } = useCampaignSettingsController();

  /**
   * @effect Redirect legacy #campaign-launch hash deep-links to the dedicated launch route.
   * @effect-deps location.hash, location.search, navigate
   * @effect-side-effects navigate (client redirect)
   * @effect-why-not-loader Hash fragments are not available to loaders; this preserves old bookmarks.
   */
  useEffect(() => {
    const hash = location.hash.startsWith("#")
      ? location.hash.slice(1)
      : location.hash;
    if (hash === "campaign-launch") {
      navigate(`../launch${location.search}`, { replace: true, relative: "path" });
    }
  }, [location.hash, location.search, navigate]);

  return (
    <>
      <Dialog
        open={pendingCampaignType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCampaignType(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change campaign type?</DialogTitle>
            <DialogDescription>
              Changing the campaign type updates which setup fields are required. Existing
              channel-specific content is preserved if you switch back.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Shared settings like title, dates, phone number, and queue stay in place. Save the
            change after reviewing the updated settings.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCampaignType(null)}>
              Keep Current Type
            </Button>
            <Button onClick={handleConfirmTypeChange}>Change Type</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CampaignSettings
        campaignData={draftCampaignData}
        campaignDetails={draftCampaignDetails as never}
        phoneNumbers={phoneNumbers}
        handleInputChange={handleInputChange}
        formFetcher={fetcher}
        flags={{}}
        isChanged={isChanged}
        handleSave={handleSave}
        handleResetData={handleResetData}
        isSaving={isSaving}
        feedbackMessage={feedbackMessage}
        feedbackTone={feedbackTone}
        smsSendContext={smsSendContext}
      />
    </>
  );
}
