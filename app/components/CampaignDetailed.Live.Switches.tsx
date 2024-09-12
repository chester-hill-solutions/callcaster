import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

export function HouseholdSwitch({ handleInputChange, campaignData }) {
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

export function DialTypeSwitch({ handleInputChange, campaignData }) {
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
