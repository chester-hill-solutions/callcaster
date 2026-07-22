import SelectType from "./CampaignBasicInfo.SelectType";
import SelectNumber from "./CampaignBasicInfo.SelectNumber";
import SelectDates from "./CampaignBasicInfo.Dates";
import { Campaign, Flags, WorkspaceNumbers } from "@/lib/types";

interface CampaignBasicInfoProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | null) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;
  callerIdOptional?: boolean;
}

/** Setup fields only: type, number, schedule. Launch controls live in CampaignSettings. */
export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  flags: _flags,
  callerIdOptional = false,
}: CampaignBasicInfoProps) => {
  return (
    <div className="space-y-4">
      <SelectType
        campaignData={campaignData}
        handleInputChange={(name, value) =>
          handleInputChange(
            name,
            typeof value === "boolean" ? (value ? 1 : 0) : (value as string | number | null),
          )
        }
      />

      {campaignData.type === "message" && callerIdOptional ? (
        <p className="-mt-1 text-xs text-muted-foreground">
          Outbound number is optional when sending via Messaging Service (Twilio uses the
          service&apos;s sender pool).
        </p>
      ) : null}
      <div id="campaign-setup-number">
        <SelectNumber
          campaignData={{ caller_id: campaignData.caller_id ?? undefined }}
          handleInputChange={(name, value) => handleInputChange(name, value)}
          phoneNumbers={phoneNumbers}
          callerIdOptional={callerIdOptional}
        />
      </div>

      <div id="campaign-setup-schedule">
        <SelectDates campaignData={campaignData} handleInputChange={handleInputChange} />
      </div>
    </div>
  );
};
