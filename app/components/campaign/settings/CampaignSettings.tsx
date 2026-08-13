import { FetcherWithComponents, Form } from "react-router";
import {
  Campaign,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  WorkspaceNumbers,
} from "@/lib/types";
import { CampaignBasicInfo } from "./basic/CampaignBasicInfo";
import { CampaignTypeSpecificSettings } from "./detailed/CampaignDetailed";
import { SaveBar } from "@/components/shared/SaveBar";
import { Section, SectionHeader } from "@/components/shared/Section";
import { CampaignPlaceNav } from "@/components/campaign/CampaignPlaceNav";

export type CampaignSettingsProps = {
  campaignData: Campaign;
  campaignDetails: LiveCampaign | MessageCampaign | IVRCampaign;
  flags: Flags;
  isChanged: boolean;
  phoneNumbers: WorkspaceNumbers[];
  handleInputChange: (name: string, value: unknown) => void;
  handleSave?: () => void;
  handleResetData?: () => void;
  formFetcher: FetcherWithComponents<unknown>;
  isSaving: boolean;
  feedbackMessage?: string | null;
  feedbackTone?: "success" | "error" | null;
  smsSendContext?: {
    messagingServiceReady: boolean;
    defaultMessagingServiceSid: string | null;
    attachedSenderPhoneNumbers: string[];
  };
};

/** Setup-only: type, number, schedule, and SMS send mode. */
export const CampaignSettings = ({
  campaignData,
  campaignDetails,
  isChanged = false,
  phoneNumbers = [],
  handleInputChange,
  handleSave,
  handleResetData,
  formFetcher,
  flags,
  isSaving,
  feedbackMessage,
  feedbackTone,
  smsSendContext,
}: CampaignSettingsProps) => {
  return (
    <div
      id="campaignSettingsContainer"
      className="flex h-full min-w-0 flex-col gap-8"
      role="region"
      aria-label="Campaign setup"
    >
      {handleSave && handleResetData && (
        <SaveBar
          isChanged={isChanged || false}
          isSaving={isSaving}
          onSave={handleSave}
          onReset={handleResetData}
          message="Unsaved changes. Save before leaving setup."
        />
      )}
      {feedbackMessage && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            feedbackTone === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
          }`}
          role={feedbackTone === "error" ? "alert" : "status"}
        >
          {feedbackMessage}
        </div>
      )}
      <Form method="patch">
        <input
          type="hidden"
          name="campaignData"
          value={JSON.stringify(campaignData)}
        />
        <input
          type="hidden"
          name="campaignDetails"
          value={JSON.stringify(campaignDetails)}
        />
        <Section variant="flat">
          <SectionHeader compact title="Setup" />
          <CampaignBasicInfo
            campaignData={campaignData}
            handleInputChange={handleInputChange}
            phoneNumbers={phoneNumbers}
            flags={flags}
            callerIdOptional={
              campaignData.type === "message" &&
              campaignData.sms_send_mode === "messaging_service"
            }
          />
          <div className="mt-6">
            <CampaignTypeSpecificSettings
              campaignData={campaignData}
              handleInputChange={handleInputChange}
              isBusy={formFetcher.state !== "idle"}
              smsSendContext={smsSendContext}
            />
          </div>
        </Section>
      </Form>
      <CampaignPlaceNav current="setup" />
    </div>
  );
};
