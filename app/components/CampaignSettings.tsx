import { FetcherWithComponents, NavLink } from "@remix-run/react";
import { FileObject } from "@supabase/storage-js";
import { Button } from "./ui/button";
import {
  Audience,
  Campaign,
  CampaignAudience,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  Script,
  WorkspaceNumbers,
  QueueItem,
} from "~/lib/types";
import { User } from "@supabase/supabase-js";
import { CampaignBasicInfo } from "./CampaignBasicInfo";
import { CampaignTypeSpecificSettings } from "./CampaignDetailed";
import { SaveBar } from "./SaveBar";
import { CampaignSettingsData } from "~/hooks/useCampaignSettings";

export type CampaignSettingsProps = {
  campaignData: CampaignSettingsData;
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
  handleScheduleButton: (e: null) => void;
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
}: CampaignSettingsProps) => {

  return (
    <div
      id="campaignSettingsContainer"
      className="flex h-full flex-col gap-8 p-6"
      role="region"
      aria-label="Campaign Settings"
    >
      <SaveBar
        isChanged={isChanged}
        isSaving={formFetcher.state === 'submitting'}
        onSave={handleSave}
        onReset={handleResetData}
      />
      <formFetcher.Form method="patch" action="/api/campaigns">
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
              handleDuplicateButton={handleDuplicateButton}
              phoneNumbers={phoneNumbers}
              flags={flags}
              joinDisabled={joinDisabled}
              formFetcher={formFetcher}
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

          <div className="flex flex-col gap-4">
            <section className="rounded-lg border p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Queue Preview</h2>
                <Button
                  variant="outline"
                  type="button"
                  asChild
                >
                  <NavLink to={`../queue`}>
                    Manage Queue
                  </NavLink>
                </Button>
              </div>

              <div className="flex gap-6 mb-6">
                <div>
                  <span className="text-sm text-muted-foreground">Queued</span>
                  <p className="text-2xl font-semibold">
                    {queueCount || 0}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Dequeued</span>
                  <p className="text-2xl font-semibold">
                    {totalCount - queueCount || 0}
                  </p>
                </div>
              </div>

              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="py-2 px-4 text-left">Name</th>
                      <th className="py-2 px-4 text-left">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignQueue?.slice(0, 15).map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="py-2 px-4">{`${item.contact?.firstname} ${item.contact?.surname}` || '-'}</td>
                        <td className="py-2 px-4">{item.contact?.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {queueCount > 15 && (
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    + {queueCount - 15} more contacts
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </formFetcher.Form>
    </div>
  );
};
