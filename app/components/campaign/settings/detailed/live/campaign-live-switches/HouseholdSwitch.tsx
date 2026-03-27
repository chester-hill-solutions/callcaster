import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { CampaignLiveSwitchProps } from "./types";

export function HouseholdSwitch({
  handleInputChange,
  campaignData,
}: CampaignLiveSwitchProps) {
  return (
    <div className="mx-4 mt-4 flex items-center">
      <div className="flex flex-col gap-2">
        <Label htmlFor="group_household_queue" className="whitespace-nowrap">
          Queue removal:
        </Label>
        <div className="flex items-center space-x-2">
          <Switch
            id="group_household_queue"
            checked={campaignData.group_household_queue}
            onCheckedChange={(checked) =>
              handleInputChange("group_household_queue", checked)
            }
          />
          <Label htmlFor="group_household_queue">Group by household</Label>
        </div>
      </div>
    </div>
  );
}
