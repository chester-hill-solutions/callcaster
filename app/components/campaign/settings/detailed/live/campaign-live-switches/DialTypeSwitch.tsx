import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { CampaignLiveSwitchProps } from "./types";

export function DialTypeSwitch({
  handleInputChange,
  campaignData,
}: CampaignLiveSwitchProps) {
  return (
    <div className="mx-4 mt-4 flex items-center">
      <div className="flex flex-col gap-2">
        <Label htmlFor="dial_type" className="whitespace-nowrap">
          Dial Type:
        </Label>
        <div className="flex items-center space-x-2">
          <span
            className={
              campaignData.dial_type !== "predictive" ? "font-semibold" : ""
            }
          >
            Power
          </span>
          <Switch
            id="dial_type"
            checked={campaignData.dial_type === "predictive"}
            onCheckedChange={(checked) =>
              handleInputChange("dial_type", checked ? "predictive" : "call")
            }
          />

          <span
            className={
              campaignData.dial_type === "predictive" ? "font-semibold" : ""
            }
          >
            Predictive
          </span>
        </div>
      </div>
    </div>
  );
}
