import { FetcherWithComponents, Form, NavLink, useNavigation, useNavigationType, useSubmit } from "@remix-run/react";
import { FileObject } from "@supabase/storage-js";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Audience,
  Campaign,
  CampaignAudience,
  Flags,
  Schedule,
  Survey,
  Script,
  WorkspaceNumbers,
} from "~/lib/types";
import { User } from "@supabase/supabase-js";
import { CampaignBasicInfo } from "./CampaignBasicInfo";
import { CampaignTypeSpecificSettings } from "./CampaignDetailed";
import { SaveBar } from "./SaveBar";
import { CampaignSettingsQueue } from "./CampaignSettingsQueue";
import { Tables } from "~/lib/database.types";
import { CampaignState } from "~/routes/workspaces_.$id.campaigns.$selected_id";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type LiveCampaign = Tables<"live_campaign"> & { script: Script };
type MessageCampaign = Tables<"message_campaign">;
type IVRCampaign = Tables<"ivr_campaign"> & { script: Script };

export type CampaignSettingsProps = {
  campaignData: Campaign;
  campaignDetails: LiveCampaign | MessageCampaign | IVRCampaign;
  flags: Flags;
  workspace: string;
  isActive: boolean;
  scripts: Script[];
  audiences: Audience[];
  mediaData: FileObject[];
  campaign_id: string;
  isChanged: boolean;
  phoneNumbers: WorkspaceNumbers[];
  handleInputChange: (name: string, value: string | boolean | number | null | Schedule) => void;
  handleDuplicateButton: () => void;
  handleStatusButton: (type: "play" | "pause" | "archive" | "schedule") => void;
  handleScheduleButton: () => void;
  handleSave?: () => void;
  handleResetData?: () => void;
  formFetcher: FetcherWithComponents<any>;
  user: User;
  joinDisabled: string | null;
  campaignQueue: QueueItem[];
  queueCount: number;
  totalCount: number;
  mediaLinks: string[];
  handleNavigate: (e: React.MouseEvent<HTMLButtonElement>) => void;
  scheduleDisabled: string | boolean;
  handleConfirmStatus: (status: "play" | "archive" | "none" | "queue") => void;
  confirmStatus: "play" | "archive" | "none" | "queue";
  credits: number;
  surveys: Pick<Survey, "survey_id" | "title">[];
};

export const CampaignSettings = ({
  campaignData,
  campaignDetails,
  mediaData,
  isChanged = false,
  phoneNumbers = [],
  credits,
  handleInputChange,
  handleSave,
  handleResetData,
  handleScheduleButton,
  handleStatusButton,
  handleDuplicateButton,
  formFetcher,
  scripts,
  mediaLinks,
  joinDisabled,
  flags,
  campaignQueue,
  queueCount,
  totalCount,
  handleNavigate,
  scheduleDisabled,
  handleConfirmStatus,
  confirmStatus,  
  surveys,  
}: CampaignSettingsProps) => {
  const nav = useNavigation();

  const renderConfirmDescription = () => {

    if (confirmStatus === "play") {
      return (
        <div className="space-y-4">
          <div className="font-medium text-lg">
            Are you sure you want to start this campaign? {
              campaignData?.type === "live_call" ?
                "This will make your campaign active and available for callers." :
                campaignData?.type === "message" ?
                  "This will begin sending messages to your contacts." :
                  "This will begin dialing contacts automatically."
            }
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-primary">💰</span>
              <div>
                <p className="font-medium">Credits Available: {credits || 0}</p>
                <p className="text-sm text-muted-foreground">
                  Cost: {campaignData?.type === "message" ?
                    "1 credit per message" :
                    "1 credit per dial + 1 credit per minute after first minute"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-primary">📞</span>
              <div>
                <p className="font-medium">
                  Contacts to {campaignData?.type === "message" ? "Message" : "Dial"}: {queueCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  Estimated cost: {queueCount} - {queueCount * 2} credits
                  {queueCount > (credits || 0) && (
                    <span className="text-destructive"> (Exceeds available credits)</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {queueCount > (credits || 0) && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              ⚠️ Warning: Your campaign will be paused when you run out of credits
            </div>
          )}
        </div>
      );
    }

    if (confirmStatus === "archive") {
      return "Are you sure you want to archive this campaign? It will be hidden from your campaigns list, and can't be undone.";
    }

    return "";
  };

  return (
    <>
      <Dialog 
        open={confirmStatus !== "none"} 
        onOpenChange={(open) => {
          if (!open) {
            handleConfirmStatus("none");
          }
        }}
      >
        <DialogContent className="bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle>
            {confirmStatus === "play" ? "Start Campaign" : confirmStatus === "archive" ? "Archive Campaign" : ""}
          </DialogTitle>
        </DialogHeader>
          <DialogDescription>
            {renderConfirmDescription()}
          </DialogDescription>

          <DialogFooter>
            <Button
              onClick={() => handleConfirmStatus("none")}
              className="mr-2"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleConfirmStatus(confirmStatus)}
              variant={confirmStatus === "archive" ? "destructive" : "default"}
            >
              {confirmStatus === "play" ? "Start Campaign" : confirmStatus === "archive" ? "Archive Campaign" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      <div
        id="campaignSettingsContainer"
        className="flex h-full flex-col gap-8 p-6"
        role="region"
        aria-label="Campaign Settings"
      >
        {handleSave && handleResetData && (
          <SaveBar
            isChanged={isChanged || false}
            isSaving={nav.state === 'submitting'}
            onSave={handleSave}
            onReset={handleResetData}
          />
        )}
        <Form method="patch">
          <input
            type="hidden"
            name="campaignData"
            value={JSON.stringify({ ...campaignData, is_active: campaignData?.is_active })}
          />
          <input
            type="hidden"
            name="campaignDetails"
            value={JSON.stringify(campaignDetails)}
          />
          <div className="flex flex-col space-y-4">
            <section className="rounded-lg border p-4">
              <CampaignBasicInfo
                campaignData={campaignData}
                handleInputChange={handleInputChange}
                handleButton={handleStatusButton}
                handleConfirmStatus={handleConfirmStatus}
                handleDuplicateButton={handleDuplicateButton}
                phoneNumbers={phoneNumbers}
                flags={flags}
                joinDisabled={joinDisabled}
                details={campaignDetails}
                scheduleDisabled={scheduleDisabled}
              />
            </section>
            <section className="rounded-lg border p-4">
              <CampaignTypeSpecificSettings
                campaignData={campaignData as any}
                handleInputChange={handleInputChange}
                mediaData={mediaData}
                scripts={scripts}
                handleActivateButton={handleStatusButton}
                handleScheduleButton={handleScheduleButton}
                details={campaignDetails}
                mediaLinks={mediaLinks}
                isChanged={isChanged}
                isBusy={formFetcher.state !== "idle"}
                joinDisabled={joinDisabled}
                scheduleDisabled={scheduleDisabled}
                surveys={surveys}
                handleNavigate={handleNavigate}
              />
            </section>

            <CampaignSettingsQueue
              campaignQueue={campaignQueue}
              queueCount={queueCount}
              totalCount={totalCount}
            />
          </div>
        </Form>
      </div>
    </>
  );
};
