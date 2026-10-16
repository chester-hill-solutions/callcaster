import { Campaign } from "@/lib/types";
import {
  CampaignSmsSendMode,
  type SmsSendContext,
} from "../CampaignSmsSendMode";

/**
 * Setup extras for message campaigns: outbound send mode only.
 * Script assignment lives under Content; dial/pacing under Launch.
 */
export const CampaignTypeSpecificSettings = ({
  campaignData,
  handleInputChange,
  isBusy,
  smsSendContext,
}: {
  campaignData: NonNullable<Campaign>;
  handleInputChange: (name: string, value: unknown) => void;
  isBusy: boolean;
  smsSendContext?: SmsSendContext;
}) => {
  if (campaignData.type !== "message") {
    return null;
  }

  return (
    <div className="space-y-4">
      <CampaignSmsSendMode
        value={campaignData.sms_send_mode}
        onChange={handleInputChange}
        isBusy={isBusy}
        smsSendContext={smsSendContext}
      />
    </div>
  );
};
