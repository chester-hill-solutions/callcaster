import { FetcherWithComponents, Form, NavLink, useNavigation, useNavigationType } from "@remix-run/react";
import { FileObject } from "@supabase/storage-js";
import { Button } from "./ui/button";
import {
  Audience,
  Campaign,
  CampaignAudience,
  Flags,
  Schedule,
  Script,
  WorkspaceNumbers,
} from "~/lib/types";
import { User } from "@supabase/supabase-js";
import { CampaignBasicInfo } from "./CampaignBasicInfo";
import { CampaignTypeSpecificSettings } from "./CampaignDetailed";
import { SaveBar } from "./SaveBar";
import { useCampaignSettings, CampaignState } from "~/hooks/useCampaignSettings";
import { CampaignSettingsQueue } from "./CampaignSettingsQueue";
import { Tables } from "~/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type LiveCampaign = Tables<"live_campaign"> & { script: Script };
type MessageCampaign = Tables<"message_campaign">;
type IVRCampaign = Tables<"ivr_campaign"> & { script: Script };

export type CampaignSettingsProps = {
  campaignData: CampaignState;
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
  handleSave: () => void;
  handleResetData: () => void;
  handleActiveChange: (isActive: boolean, status: string | null) => void;
  handleAudienceChange: (audience: CampaignAudience | null, isChecked: boolean) => void;
  handleScheduleButton: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleStatusButtons: (type: "play" | "pause" | "archive" | "schedule") => void;
  formFetcher: FetcherWithComponents<{ campaign: Campaign, campaignDetails: LiveCampaign | MessageCampaign | IVRCampaign }>;
  user: User;
  joinDisabled: string | null;
  campaignQueue: QueueItem[];
  queueCount: number;
  totalCount: number;
  mediaLinks: string[];
  handleNavigate: (e: React.MouseEvent<HTMLButtonElement>) => void;
  scheduleDisabled: string | boolean;
  handleConfirmStatus: (status: "queue" | "play" | "archive" | "none") => void;
  confirmStatus: "queue" | "play" | "archive" | "none";
};

export const CampaignSettings = ({
  campaignData,
  campaignDetails,
  mediaData,
  isChanged,
  phoneNumbers = [],
  handleInputChange,
  handleSave,
  handleResetData,
  handleScheduleButton,
  handleStatusButtons,
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
}: CampaignSettingsProps) => {
  const nav = useNavigation();

  return (
    <>
      <div
        id="campaignSettingsContainer"
        className="flex h-full flex-col gap-8 p-6"
        role="region"
        aria-label="Campaign Settings"
      >
        <SaveBar
          isChanged={isChanged}
          isSaving={nav.state === 'submitting'}
          onSave={(e) => {
            e.preventDefault();
            handleSave();
          }}
          onReset={handleResetData}
        />
        <Form method="patch">
          <input
            type="hidden"
            name="campaignData"
            value={JSON.stringify({ ...campaignData, is_active: campaignData.is_active })}
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
                handleButton={handleStatusButtons}
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
                campaignData={campaignData}
                handleInputChange={handleInputChange}
                mediaData={mediaData}
                scripts={scripts}
                handleActivateButton={handleStatusButtons}
                handleScheduleButton={handleScheduleButton}
                details={campaignDetails}
                mediaLinks={mediaLinks}
                isChanged={isChanged}
                isBusy={formFetcher.state !== "idle"}
                joinDisabled={joinDisabled}
                scheduleDisabled={scheduleDisabled}
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
