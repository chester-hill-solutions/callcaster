import {
  DialTypeSwitch,
  HouseholdSwitch,
} from "../detailed/live/CampaignDetailed.Live.Switches";
import type { Campaign } from "@/lib/types";

interface CampaignDialOptionsSettingsProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: unknown) => void;
}

/**
 * Setup dial options for live-calling campaigns (#1863): household grouping and
 * dial type. These used to live on the Launch page; Setup now owns all campaign
 * configuration, and Launch is review/launch plus pacing.
 */
export function CampaignDialOptionsSettings({
  campaignData,
  handleInputChange,
}: CampaignDialOptionsSettingsProps) {
  if (campaignData.type !== "live_call") return null;

  const switchCampaignData = {
    group_household_queue: campaignData.group_household_queue,
    dial_type: campaignData.dial_type || "call",
  };

  return (
    <div className="mt-6 space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Calling options</p>
      <div className="flex flex-wrap gap-2">
        <HouseholdSwitch
          handleInputChange={handleInputChange}
          campaignData={switchCampaignData}
        />
        <DialTypeSwitch
          handleInputChange={handleInputChange}
          campaignData={switchCampaignData}
        />
      </div>
    </div>
  );
}
