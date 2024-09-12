import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Flags, WorkspaceNumbers } from "~/lib/types";
import SelectStatus from "./CampaignBasicInfo.SelectStatus";
import SelectType from "./CampaignBasicInfo.SelectType";
import SelectNumber from "./CampaignBasicInfo.SelectNumber";
import SelectDates from "./CampaignBasicInfo.Dates";

export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  flags,
}: {
  campaignData: any;
  handleInputChange: (name: string, value: string | number) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;
}) => {
  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex flex-grow flex-col min-w-48 gap-1">
        <Label htmlFor="title">Campaign Title</Label>
        <Input
          id="title"
          name="title"
          value={campaignData.title}
          onChange={(e) => handleInputChange("title", e.target.value)}
        />
      </div>
      <SelectStatus
        handleInputChange={handleInputChange}
        campaignData={campaignData}
      />
      <SelectType
        handleInputChange={handleInputChange}
        campaignData={campaignData}
        flags={flags}
      />
      <SelectNumber
        handleInputChange={handleInputChange}
        campaignData={campaignData}
        phoneNumbers={phoneNumbers}
      />
      <SelectDates
        campaignData={campaignData}
        handleInputChange={handleInputChange}
      />
    </div>
  );
};
